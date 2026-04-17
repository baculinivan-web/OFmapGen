import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort.all.min.mjs';
import { initGis } from './gis.js';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const fileNameEl  = document.getElementById('fileName');
const srcCanvas   = document.getElementById('srcCanvas');
const outCanvas   = document.getElementById('outCanvas');
const preview     = document.getElementById('preview');
const placeholder = document.getElementById('placeholder');
const downloadBtn    = document.getElementById('downloadBtn');
const downloadSrcBtn = document.getElementById('downloadSrcBtn');
const invertCheck = document.getElementById('invertCheck');
const imgInfo     = document.getElementById('imgInfo');

const sliders = {
  water:    document.getElementById('sliderWater'),
  plain:    document.getElementById('sliderPlain'),
  highland: document.getElementById('sliderHighland'),
};
const vals = {
  water:    document.getElementById('valWater'),
  plain:    document.getElementById('valPlain'),
  highland: document.getElementById('valHighland'),
};

const algoLegacyBtn   = document.getElementById('algoLegacy');
const algoSmoothBtn   = document.getElementById('algoSmooth');
const algoAdvancedBtn = document.getElementById('algoAdvanced');
const smoothOptions   = document.getElementById('smoothOptions');
const advancedOptions = document.getElementById('advancedOptions');
const sliderMinIsland = document.getElementById('sliderMinIsland');
const valMinIsland    = document.getElementById('valMinIsland');
const sliderPasses    = document.getElementById('sliderPasses');
const valPasses       = document.getElementById('valPasses');
const runSegBtn       = document.getElementById('runSegBtn');
const segStatus       = document.getElementById('segStatus');
const algoHint        = document.getElementById('algoHint');

// ── State ─────────────────────────────────────────────────────────────────────
let currentAlgo  = 'smooth';
let aiMask       = null;
let srcImageData = null;
let rafId        = null;
let isGisSource  = false;

// ── Advanced threshold toggle ─────────────────────────────────────────────────
const advThreshBtn   = document.getElementById('advThreshBtn');
const advThreshPanel = document.getElementById('advThreshPanel');
const advThreshArrow = document.getElementById('advThreshArrow');
let advThreshOpen = false;

advThreshBtn.addEventListener('click', () => {
  advThreshOpen = !advThreshOpen;
  advThreshPanel.style.display = advThreshOpen ? 'block' : 'none';
  advThreshArrow.textContent   = advThreshOpen ? '▼' : '▶';
});

// ── Terrain presets ───────────────────────────────────────────────────────────
const PRESETS = {
  plains:    { w: 0.40, p: 0.82, h: 0.93 },
  mixed:     { w: 0.40, p: 0.68, h: 0.84 },
  default:   { w: 0.40, p: 0.72, h: 0.85 },
  mountains: { w: 0.40, p: 0.52, h: 0.70 },
};
const presetBtns = {
  plains:    document.getElementById('presetPlains'),
  mixed:     document.getElementById('presetMixed'),
  default:   document.getElementById('presetDefault'),
  mountains: document.getElementById('presetMountains'),
};

function applyPreset(name) {
  const p = PRESETS[name];
  sliders.water.value = p.w; sliders.plain.value = p.p; sliders.highland.value = p.h;
  Object.keys(presetBtns).forEach(k => presetBtns[k].classList.toggle('active', k === name));
  scheduleRender();
}
Object.keys(presetBtns).forEach(name =>
  presetBtns[name].addEventListener('click', () => applyPreset(name))
);

// ── GIS mode ──────────────────────────────────────────────────────────────────
function setGisMode(enabled) {
  isGisSource = enabled;
  document.getElementById('terrainPresets').style.display = enabled ? 'block' : 'none';
  algoAdvancedBtn.style.display = enabled ? 'none' : '';
  document.querySelector('#advThreshPanel .slider-row:has(#sliderWater)').style.display = enabled ? 'none' : '';
  if (enabled && currentAlgo === 'advanced') setAlgo('smooth');
  if (enabled) applyPreset('default');
}

// ── Algorithm ─────────────────────────────────────────────────────────────────
function setAlgo(algo) {
  currentAlgo = algo;
  algoLegacyBtn.classList.toggle('active',   algo === 'legacy');
  algoSmoothBtn.classList.toggle('active',   algo === 'smooth');
  algoAdvancedBtn.classList.toggle('active', algo === 'advanced');
  smoothOptions.style.display   = algo === 'smooth'   ? 'block' : 'none';
  advancedOptions.style.display = algo === 'advanced' ? 'block' : 'none';
  algoHint.textContent = {
    legacy:   'Pixel-perfect conversion',
    smooth:   'Removes tiny noise islands for more realistic coastlines',
    advanced: 'AI cuts out the subject — it becomes the island, background becomes ocean',
  }[algo];
  scheduleRender();
}

algoLegacyBtn.addEventListener('click',   () => setAlgo('legacy'));
algoSmoothBtn.addEventListener('click',   () => setAlgo('smooth'));
algoAdvancedBtn.addEventListener('click', () => setAlgo('advanced'));

sliderMinIsland.addEventListener('input', () => { valMinIsland.textContent = sliderMinIsland.value; scheduleRender(); });
sliderPasses.addEventListener('input',    () => { valPasses.textContent    = sliderPasses.value;    scheduleRender(); });

// ── AI segmentation ───────────────────────────────────────────────────────────
const U2NETP_URL = 'https://huggingface.co/fofr/comfyui/resolve/main/rembg/u2netp.onnx';
const IMG_SIZE   = 320;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
let ortSession = null;

runSegBtn.addEventListener('click', async () => {
  if (!srcImageData) { segStatus.textContent = 'Upload an image first.'; return; }
  runSegBtn.disabled = true;
  segStatus.textContent = 'Loading: Loading u2netp model (~4.7MB)…';
  try {
    if (!ortSession) {
      let modelBuffer;
      const cache = await caches.open('ort-models-v1');
      const cached = await cache.match(U2NETP_URL);
      if (cached) {
        modelBuffer = await cached.arrayBuffer();
      } else {
        segStatus.textContent = 'Loading: Downloading model (~4.7MB)…';
        const resp = await fetch(U2NETP_URL);
        await cache.put(U2NETP_URL, resp.clone());
        modelBuffer = await resp.arrayBuffer();
      }
      ortSession = await ort.InferenceSession.create(modelBuffer, { executionProviders: ['wasm'] });
    }
    segStatus.textContent = 'AI: Running segmentation…';
    const W = srcImageData.width, H = srcImageData.height;
    const tmp = document.createElement('canvas');
    tmp.width = IMG_SIZE; tmp.height = IMG_SIZE;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(srcCanvas, 0, 0, IMG_SIZE, IMG_SIZE);
    const d = tCtx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data;
    const pixels = new Float32Array(3 * IMG_SIZE * IMG_SIZE);
    for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
      pixels[i]                       = (d[i*4]   / 255 - MEAN[0]) / STD[0];
      pixels[i + IMG_SIZE*IMG_SIZE]   = (d[i*4+1] / 255 - MEAN[1]) / STD[1];
      pixels[i + 2*IMG_SIZE*IMG_SIZE] = (d[i*4+2] / 255 - MEAN[2]) / STD[2];
    }
    const results = await ortSession.run({ 'input.1': new ort.Tensor('float32', pixels, [1, 3, IMG_SIZE, IMG_SIZE]) });
    const maskRaw = results[ortSession.outputNames[0]].data;
    let mn = Infinity, mx = -Infinity;
    for (const v of maskRaw) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const range = mx - mn || 1;
    const mCanvas = document.createElement('canvas');
    mCanvas.width = IMG_SIZE; mCanvas.height = IMG_SIZE;
    const mCtx = mCanvas.getContext('2d');
    const mImg = mCtx.createImageData(IMG_SIZE, IMG_SIZE);
    for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
      const v = Math.round(((maskRaw[i] - mn) / range) * 255);
      mImg.data[i*4] = mImg.data[i*4+1] = mImg.data[i*4+2] = v; mImg.data[i*4+3] = 255;
    }
    mCtx.putImageData(mImg, 0, 0);
    const sCanvas = document.createElement('canvas');
    sCanvas.width = W; sCanvas.height = H;
    sCanvas.getContext('2d').drawImage(mCanvas, 0, 0, W, H);
    const sData = sCanvas.getContext('2d').getImageData(0, 0, W, H).data;
    aiMask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) aiMask[i] = sData[i * 4] > 128 ? 1 : 0;
    segStatus.textContent = 'Done: Done — adjust thresholds to tune terrain';
    runSegBtn.disabled = false;
    scheduleRender();
  } catch (err) {
    segStatus.textContent = 'Error: ' + err.message;
    console.error(err);
    runSegBtn.disabled = false;
  }
});

// ── File loading ──────────────────────────────────────────────────────────────
const MIN_SIZE = 512, MAX_SIZE = 1024;

export function clampedSize(w, h) {
  const long = Math.max(w, h);
  let scale = 1;
  if (long > MAX_SIZE) scale = MAX_SIZE / long;
  else if (long < MIN_SIZE) scale = MIN_SIZE / long;
  return [Math.round(w * scale), Math.round(h * scale)];
}

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => loadFile(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});

function loadFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const [tw, th] = clampedSize(img.width, img.height);
    srcCanvas.width = tw; srcCanvas.height = th;
    const ctx = srcCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, tw, th);
    srcImageData = ctx.getImageData(0, 0, tw, th);
    imgInfo.textContent = `${tw} × ${th}`;
    fileNameEl.textContent = file.name;
    fileNameEl.style.display = 'block';
    aiMask = null;
    segStatus.textContent = '';
    setGisMode(false);
    URL.revokeObjectURL(url);
    scheduleRender();
  };
  img.src = url;
}

// ── Worker ────────────────────────────────────────────────────────────────────
const worker = new Worker('./worker.js');
let pendingRender = null;

worker.onmessage = ({ data }) => {
  const { pixels, width, height } = data;
  outCanvas.width = width; outCanvas.height = height;
  outCanvas.getContext('2d').putImageData(new ImageData(pixels, width, height), 0, 0);
  preview.src = outCanvas.toDataURL('image/png');
  preview.style.display = 'block';
  placeholder.style.display = 'none';
  downloadBtn.disabled = false;
  downloadSrcBtn.disabled = false;
  enableNationBtn();
  if (pendingRender) { worker.postMessage(...pendingRender); pendingRender = null; }
};

function scheduleRender(overrideImageData) {
  if (overrideImageData) srcImageData = overrideImageData;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(render);
}

function render() {
  if (!srcImageData) return;
  let w = parseFloat(sliders.water.value);
  let p = parseFloat(sliders.plain.value);
  let h = parseFloat(sliders.highland.value);
  p = Math.max(p, w); h = Math.max(h, p);
  sliders.plain.value = p; sliders.highland.value = h;
  vals.water.textContent = w.toFixed(2);
  vals.plain.textContent = p.toFixed(2);
  vals.highland.textContent = h.toFixed(2);
  updateTrack(sliders.water, w);
  updateTrack(sliders.plain, p);
  updateTrack(sliders.highland, h);
  const srcCopy = new Uint8ClampedArray(srcImageData.data);
  const msg = {
    src: srcCopy, width: srcImageData.width, height: srcImageData.height,
    w, p, h, invert: invertCheck.checked, algo: currentAlgo,
    minSize: parseInt(sliderMinIsland.value), passes: parseInt(sliderPasses.value),
    aiMask: aiMask ? new Uint8Array(aiMask) : null,
  };
  const transfers = [msg.src.buffer];
  if (msg.aiMask) transfers.push(msg.aiMask.buffer);
  worker.postMessage(msg, transfers);
}

function updateTrack(input, val) {
  const pct = val * 100;
  input.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
}

Object.values(sliders).forEach(s => s.addEventListener('input', scheduleRender));
invertCheck.addEventListener('change', scheduleRender);

// ── Download map PNG ──────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = outCanvas.toDataURL('image/png');
  a.download = 'openfront_map.png';
  a.click();
});

// ── Download source PNG (OpenFront palette) ───────────────────────────────────
const OF_PALETTE = [
  [190,220,140],[190,218,142],[190,216,144],[190,214,146],[190,212,148],
  [190,210,150],[190,208,152],[190,206,154],[190,204,156],[190,202,158],
  [220,203,160],[222,205,162],[224,207,164],[226,209,166],[228,211,168],
  [230,213,170],[232,215,172],[234,217,174],[236,219,176],[238,221,178],
  [240,240,180],[240,240,182],[241,241,184],[242,242,186],[242,242,188],
  [242,242,190],[243,243,192],[244,244,194],[244,244,196],[244,244,198],[245,245,200],
];
const OF_WATER = [0, 0, 106];
const ZONE_COLORS_SRC = [[18,15,34],[140,170,88],[176,159,114],[190,190,190]];
const ZONE_TO_MAG = [-1, 4, 14, 25];

downloadSrcBtn.addEventListener('click', () => {
  if (!outCanvas.width) return;
  const w = outCanvas.width, h = outCanvas.height;
  const d = outCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const ofCanvas = document.createElement('canvas');
  ofCanvas.width = w; ofCanvas.height = h;
  const ofCtx = ofCanvas.getContext('2d');
  const ofImg = ofCtx.createImageData(w, h);
  const od = ofImg.data;
  for (let i = 0; i < w * h; i++) {
    const si = i * 4;
    let zone = 0, minDist = Infinity;
    for (let z = 0; z < 4; z++) {
      const c = ZONE_COLORS_SRC[z];
      const dist = (d[si]-c[0])**2 + (d[si+1]-c[1])**2 + (d[si+2]-c[2])**2;
      if (dist < minDist) { minDist = dist; zone = z; }
    }
    const col = zone === 0 ? OF_WATER : OF_PALETTE[ZONE_TO_MAG[zone]];
    od[si] = col[0]; od[si+1] = col[1]; od[si+2] = col[2]; od[si+3] = 255;
  }
  ofCtx.putImageData(ofImg, 0, 0);
  const a = document.createElement('a');
  a.href = ofCanvas.toDataURL('image/png');
  a.download = 'openfront_source.png';
  a.click();
});

// ── Nation Spawns ─────────────────────────────────────────────────────────────
function enableNationBtn() {
  const btn = document.getElementById('nationSpawnsBtn');
  if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
}

const nationSpawnsBtn   = document.getElementById('nationSpawnsBtn');
const nationModal       = document.getElementById('nationModal');
const nationModalClose  = document.getElementById('nationModalClose');
const nationModalClose2 = document.getElementById('nationModalClose2');
const nationMapImg      = document.getElementById('nationMapImg');
const nationMapArea     = document.getElementById('nationMapArea');
const nationListEl      = document.getElementById('nationList');
const nationCountEl     = document.getElementById('nationCount');
const clearNationsBtn   = document.getElementById('clearNationsBtn');
const downloadArchiveBtn = document.getElementById('downloadArchiveBtn');
const editPopup         = document.getElementById('nationEditPopup');
const editPopupTitle    = document.getElementById('editPopupTitle');
const nameInput         = document.getElementById('nameInput');
const nameConfirmBtn    = document.getElementById('nameConfirmBtn');
const nameCancelBtn     = document.getElementById('nameCancelBtn');
const suggestedFlags  = document.getElementById('suggestedFlags');
const suggestedList   = document.getElementById('suggestedList');
const flagSearch        = document.getElementById('flagSearch');
const flagResults       = document.getElementById('flagResults');
const flagPreviewNone   = document.getElementById('flagPreviewNone');
const clearFlagBtn      = document.getElementById('clearFlagBtn');

// ── Countries list ────────────────────────────────────────────────────────────
const FLAG_BASE = 'https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/resources/flags/';
let countriesList = [];
fetch('https://raw.githubusercontent.com/openfrontio/OpenFrontIO/main/resources/countries.json')
  .then(r => r.json()).then(d => { countriesList = d; }).catch(() => {});
function flagUrl(code) { return code ? `${FLAG_BASE}${encodeURIComponent(code)}.svg` : ''; }

// ── State ─────────────────────────────────────────────────────────────────────
let nations = []; // [{x, y, name, flag}]
let pendingCoords = null;
let editingIdx = null;
let selectedFlag = '';

function openNationModal() {
  nationMapImg.src = outCanvas.toDataURL('image/png');
  nationModal.classList.add('open');
  requestAnimationFrame(renderMarkers);
}

nationSpawnsBtn.addEventListener('click', openNationModal);
nationModalClose.addEventListener('click', () => { hideEditPopup(); nationModal.classList.remove('open'); });
nationModalClose2.addEventListener('click', () => { hideEditPopup(); nationModal.classList.remove('open'); });
clearNationsBtn.addEventListener('click', () => { nations = []; renderNationList(); renderMarkers(); });

// Click on map → place new nation
nationMapArea.addEventListener('click', (e) => {
  if (editPopup.style.display !== 'none') { hideEditPopup(); return; }
  if (e.target.closest('.nation-marker')) return;
  const rect = nationMapImg.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
  const mx = Math.round(px * outCanvas.width / rect.width);
  const my = Math.round(py * outCanvas.height / rect.height);
  // Check water
  if (isWaterPixel(mx, my)) { showWaterToast(); return; }
  pendingCoords = { x: mx, y: my };
  editingIdx = null;
  showEditPopup(e.clientX, e.clientY, '', '', 'Add nation');
});

function isWaterPixel(x, y) {
  if (!outCanvas.width) return false;
  const ctx = outCanvas.getContext('2d');
  const d = ctx.getImageData(Math.max(0, Math.min(outCanvas.width - 1, x)),
                              Math.max(0, Math.min(outCanvas.height - 1, y)), 1, 1).data;
  // Water color in outCanvas is ~(18,15,34)
  return (d[0] < 40 && d[1] < 30 && d[2] < 60);
}

let waterToastTimer = null;
function showWaterToast() {
  const toast = document.getElementById('waterToast');
  toast.style.display = 'block';
  clearTimeout(waterToastTimer);
  waterToastTimer = setTimeout(() => { toast.style.display = 'none'; }, 1800);
}

// ── Edit popup ────────────────────────────────────────────────────────────────
function showEditPopup(cx, cy, name, flag, title) {
  editPopupTitle.textContent = title;
  nameInput.value = name;
  nameInput.dataset.lastSuggested = '';
  selectedFlag = flag;
  updateFlagPreview();
  flagSearch.value = flag ? (countriesList.find(c => c.code === flag) || {}).name || flag : '';
  flagResults.style.display = 'none';
  flagResults.innerHTML = '';
  editPopup.style.display = 'block';
  updateSuggested(name);
  const pw = 268, ph = 340;
  let left = cx + 14, top = cy - 20;
  if (left + pw > window.innerWidth  - 8) left = cx - pw - 14;
  if (top  + ph > window.innerHeight - 8) top  = window.innerHeight - ph - 8;
  if (top < 8) top = 8;
  editPopup.style.left = left + 'px';
  editPopup.style.top  = top  + 'px';
  setTimeout(() => nameInput.focus(), 50);
}

function hideEditPopup() {
  editPopup.style.display = 'none';
  pendingCoords = null;
  editingIdx = null;
  flagResults.style.display = 'none';
}

function updateFlagPreview() {
  if (selectedFlag) {
    flagPreview.src = flagUrl(selectedFlag);
    flagPreview.style.display = '';
    flagPreviewNone.style.display = 'none';
    clearFlagBtn.style.display = '';
  } else {
    flagPreview.style.display = 'none';
    flagPreviewNone.style.display = '';
    clearFlagBtn.style.display = 'none';
  }
}

// ── Suggested flags (based on nation name) ────────────────────────────────────
function updateSuggested(name) {
  const q = name.trim().toLowerCase();
  if (!q || !countriesList.length) { suggestedFlags.style.display = 'none'; return; }
  const matches = countriesList.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5);
  if (!matches.length) {
    // No matches — offer "None" option
    suggestedList.innerHTML = `
      <button class="sug-flag" data-code="" data-name=""
        style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:0.72rem;color:var(--muted);">
        <span>No flag</span>
      </button>`;
    suggestedFlags.style.display = 'block';
    return;
  }
  suggestedList.innerHTML = matches.map(c => `
    <button class="sug-flag" data-code="${escHtml(c.code)}" data-name="${escHtml(c.name)}"
      style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:3px 5px;cursor:pointer;display:flex;align-items:center;gap:5px;font-size:0.72rem;color:var(--text);">
      <img src="${flagUrl(c.code)}" style="width:22px;height:14px;object-fit:contain;" onerror="this.style.display='none'" />
      <span style="max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(c.name)}</span>
    </button>`).join('');
  suggestedFlags.style.display = 'block';
}

suggestedList.addEventListener('click', (e) => {
  const btn = e.target.closest('.sug-flag');
  if (!btn) return;
  selectedFlag = btn.dataset.code;
  const suggestedName = btn.dataset.name;
  // Apply flag
  flagSearch.value = suggestedName || '';
  flagResults.style.display = 'none';
  updateFlagPreview();
  // Always apply the suggested name
  if (suggestedName) {
    nameInput.value = suggestedName;
  }
});

nameInput.addEventListener('input', () => updateSuggested(nameInput.value));

clearFlagBtn.addEventListener('click', () => { selectedFlag = ''; updateFlagPreview(); flagSearch.value = ''; flagResults.style.display = 'none'; });

flagSearch.addEventListener('input', () => {
  const q = flagSearch.value.trim().toLowerCase();
  if (!q) { flagResults.style.display = 'none'; return; }
  const matches = countriesList.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)).slice(0, 30);
  if (!matches.length) { flagResults.style.display = 'none'; return; }
  flagResults.innerHTML = matches.map(c => `
    <div class="flag-option" data-code="${escHtml(c.code)}" style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;font-size:0.8rem;color:var(--text);">
      <img src="${flagUrl(c.code)}" style="width:24px;height:16px;object-fit:contain;flex-shrink:0;border:1px solid var(--border);border-radius:2px;" onerror="this.style.display='none'" />
      <span>${escHtml(c.name)}</span>
    </div>`).join('');
  flagResults.style.display = 'block';
});

flagResults.addEventListener('click', (e) => {
  const opt = e.target.closest('.flag-option');
  if (!opt) return;
  selectedFlag = opt.dataset.code;
  flagSearch.value = opt.querySelector('span').textContent;
  flagResults.style.display = 'none';
  updateFlagPreview();
});

flagResults.addEventListener('mouseover', e => {
  const opt = e.target.closest('.flag-option');
  flagResults.querySelectorAll('.flag-option').forEach(el => el.style.background = '');
  if (opt) opt.style.background = 'var(--accent-dim)';
});

function confirmEdit() {
  const name = nameInput.value.trim();
  if (!name) return;
  if (editingIdx !== null) {
    nations[editingIdx].name = name;
    nations[editingIdx].flag = selectedFlag;
  } else if (pendingCoords) {
    nations.push({ x: pendingCoords.x, y: pendingCoords.y, name, flag: selectedFlag });
  }
  hideEditPopup();
  renderNationList();
  renderMarkers();
}

nameConfirmBtn.addEventListener('click', confirmEdit);
nameCancelBtn.addEventListener('click', hideEditPopup);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') hideEditPopup(); });
flagSearch.addEventListener('keydown', (e) => { if (e.key === 'Escape') flagResults.style.display = 'none'; });

// ── Nation list ───────────────────────────────────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderNationList() {
  nationCountEl.textContent = nations.length;
  nationListEl.innerHTML = nations.map((n, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:5px 4px;border-radius:5px;font-size:0.78rem;color:var(--text);">
      ${n.flag ? `<img src="${flagUrl(n.flag)}" style="width:22px;height:15px;object-fit:contain;border:1px solid var(--border);border-radius:2px;flex-shrink:0;" onerror="this.style.display='none'" />` : `<span style="width:22px;height:15px;background:var(--surface2);border:1px solid var(--border);border-radius:2px;flex-shrink:0;display:inline-block;"></span>`}
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(n.name)}</span>
      <button onclick="editNation(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:0.75rem;padding:0 3px;flex-shrink:0;" title="Edit">✎</button>
      <button onclick="removeNation(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px;flex-shrink:0;" title="Remove">×</button>
    </div>`).join('');
}

window.removeNation = function(i) { nations.splice(i, 1); renderNationList(); renderMarkers(); };
window.editNation = function(i) {
  editingIdx = i; pendingCoords = null;
  const n = nations[i];
  const sidebar = nationListEl.getBoundingClientRect();
  showEditPopup(sidebar.left - 10, sidebar.top + i * 32, n.name, n.flag || '', 'Edit nation');
};

// ── DOM markers (draggable) ───────────────────────────────────────────────────
function getImgRect()  { return nationMapImg.getBoundingClientRect(); }
function getAreaRect() { return nationMapArea.getBoundingClientRect(); }

function markerScreenPos(n) {
  const ir = getImgRect(), ar = getAreaRect();
  return { left: ir.left - ar.left + n.x * ir.width / outCanvas.width, top: ir.top - ar.top + n.y * ir.height / outCanvas.height };
}

function renderMarkers() {
  nationMapArea.querySelectorAll('.nation-marker').forEach(el => el.remove());
  nations.forEach((n, i) => createMarkerEl(n, i));
}

function createMarkerEl(n, i) {
  const el = document.createElement('div');
  el.className = 'nation-marker';
  el.dataset.idx = i;
  const flagImg = n.flag
    ? `<img src="${flagUrl(n.flag)}" class="nm-flag-img" onerror="this.src=''" />`
    : `<span class="nm-flag-placeholder">${i + 1}</span>`;
  el.innerHTML = `
    <div class="nm-pin" title="${escHtml(n.name)}">${flagImg}</div>
    <div class="nm-pin-tip"></div>
    <div class="nm-label">${escHtml(n.name)}</div>
    <button class="nm-edit" title="Edit">✎</button>
    <button class="nm-remove" title="Remove">×</button>`;  positionMarker(el, n);
  nationMapArea.appendChild(el);

  el.querySelector('.nm-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    editingIdx = i; pendingCoords = null;
    const r = el.getBoundingClientRect();
    showEditPopup(r.right + 8, r.top, n.name, n.flag || '', 'Edit nation');
  });
  el.querySelector('.nm-remove').addEventListener('click', (e) => { e.stopPropagation(); removeNation(i); });

  // Mouse drag
  let startMx, startMy, startNx, startNy;
  el.querySelector('.nm-pin').addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    startMx = e.clientX; startMy = e.clientY; startNx = n.x; startNy = n.y;
    const onMove = (ev) => {
      const ir = getImgRect();
      n.x = Math.max(0, Math.min(outCanvas.width  - 1, Math.round(startNx + (ev.clientX - startMx) * outCanvas.width  / ir.width)));
      n.y = Math.max(0, Math.min(outCanvas.height - 1, Math.round(startNy + (ev.clientY - startMy) * outCanvas.height / ir.height)));
      positionMarker(el, n);
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Touch drag
  el.querySelector('.nm-pin').addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    const t0 = e.touches[0]; startMx = t0.clientX; startMy = t0.clientY; startNx = n.x; startNy = n.y;
    const onMove = (ev) => {
      const t = ev.touches[0], ir = getImgRect();
      n.x = Math.max(0, Math.min(outCanvas.width  - 1, Math.round(startNx + (t.clientX - startMx) * outCanvas.width  / ir.width)));
      n.y = Math.max(0, Math.min(outCanvas.height - 1, Math.round(startNy + (t.clientY - startMy) * outCanvas.height / ir.height)));
      positionMarker(el, n);
    };
    const onEnd = () => { el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd); };
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
  }, { passive: false });
}

function positionMarker(el, n) {
  const pos = markerScreenPos(n);
  el.style.left = pos.left + 'px';
  el.style.top  = pos.top  + 'px';
}

new ResizeObserver(() => {
  if (!nationModal.classList.contains('open')) return;
  nationMapArea.querySelectorAll('.nation-marker').forEach(el => {
    const i = parseInt(el.dataset.idx);
    if (nations[i]) positionMarker(el, nations[i]);
  });
}).observe(nationMapArea);

// Download archive
downloadArchiveBtn.addEventListener('click', () => {
  if (!outCanvas.width) return;

  // Show OS picker modal
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px 28px 24px;max-width:420px;width:92%;box-shadow:0 24px 64px rgba(0,0,0,0.6);">
      <div style="font-size:1.05rem;font-weight:600;margin-bottom:6px;color:var(--text);">Download map archive</div>
      <div style="font-size:0.8rem;color:var(--muted);margin-bottom:24px;line-height:1.6;">
        The archive includes your <code style="background:var(--surface2);padding:1px 5px;border-radius:4px;font-size:0.78rem;">image.png</code> and <code style="background:var(--surface2);padding:1px 5px;border-radius:4px;font-size:0.78rem;">info.json</code> map files.
      </div>

      <div style="font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px;">Include map tester script</div>
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:16px;font-size:0.8rem;color:var(--muted);line-height:1.6;">
        The script automatically downloads the game source, registers your map, generates it, and opens it in your browser — <strong style="color:var(--text);">no manual setup needed.</strong><br><br>
        After extracting the archive, just double-click the launcher file to start.
      </div>
      <div style="display:flex;align-items:flex-start;gap:8px;background:rgba(80,180,100,0.08);border:1px solid rgba(80,180,100,0.2);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:0.78rem;color:var(--muted);line-height:1.5;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5ab46e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>The script is <strong style="color:var(--text);">fully open source</strong> — it's included in the archive as a plain <code style="background:var(--surface);padding:1px 4px;border-radius:3px;">setup.py</code> text file. You can open and read it in any text editor before running.</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
        <div style="font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:2px;">Choose your OS</div>

        <button id="osMac" style="display:flex;align-items:center;gap:12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;cursor:pointer;text-align:left;transition:border-color 0.15s;">
          <span style="font-size:20px;flex-shrink:0;line-height:1;">🍎</span>
          <div>
            <div style="font-size:0.88rem;font-weight:500;color:var(--text);">macOS</div>
            <div style="font-size:0.75rem;color:var(--muted);">Includes <code style="background:var(--surface);padding:1px 4px;border-radius:3px;">Click me to install.command</code></div>
          </div>
        </button>

        <button id="osWin" style="display:flex;align-items:center;gap:12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;cursor:pointer;text-align:left;transition:border-color 0.15s;">
          <span style="font-size:20px;flex-shrink:0;line-height:1;">🪟</span>
          <div>
            <div style="font-size:0.88rem;font-weight:500;color:var(--text);">Windows</div>
            <div style="font-size:0.75rem;color:var(--muted);">Includes <code style="background:var(--surface);padding:1px 4px;border-radius:3px;">Click me to install.bat</code></div>
          </div>
        </button>

        <button id="osLinux" style="display:flex;align-items:center;gap:12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 16px;cursor:pointer;text-align:left;transition:border-color 0.15s;">
          <span style="font-size:20px;flex-shrink:0;line-height:1;">🐧</span>
          <div>
            <div style="font-size:0.88rem;font-weight:500;color:var(--text);">Linux</div>
            <div style="font-size:0.75rem;color:var(--muted);">Includes <code style="background:var(--surface);padding:1px 4px;border-radius:3px;">Click me to install.sh</code></div>
          </div>
        </button>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:16px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <button id="osArchiveOnly" class="btn btn-ghost" style="font-size:0.8rem;padding:8px 14px;">
          Download map files only (no script)
        </button>
        <button id="osCancel" class="btn btn-ghost" style="font-size:0.8rem;padding:8px 14px;">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#osCancel').onclick = () => overlay.remove();

  const pick = (os) => {
    overlay.remove();
    buildAndDownloadArchive(os);
  };
  overlay.querySelector('#osMac').onclick       = () => pick('mac');
  overlay.querySelector('#osWin').onclick       = () => pick('win');
  overlay.querySelector('#osLinux').onclick     = () => pick('linux');
  overlay.querySelector('#osArchiveOnly').onclick = () => { overlay.remove(); buildAndDownloadArchive(null); };

  // Hover highlight
  ['osMac','osWin','osLinux'].forEach(id => {
    const btn = overlay.querySelector(`#${id}`);
    btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--accent, #5b8dee)');
    btn.addEventListener('mouseleave', () => btn.style.borderColor = 'var(--border)');
  });
});

async function buildAndDownloadArchive(os) {
  const zip = new JSZip();

  const ofCanvas = buildSourceCanvas();
  const pngBlob = await new Promise(res => ofCanvas.toBlob(res, 'image/png'));
  zip.file('image.png', pngBlob);

  const manifest = {
    name: 'custom_map',
    map: { width: outCanvas.width, height: outCanvas.height, num_land_tiles: countLandTiles() },
    nations: nations.map(n => ({ coordinates: [n.x, n.y], name: n.name, flag: n.flag || '' })),
  };
  zip.file('info.json', JSON.stringify(manifest, null, 2));

  if (os) {
    // Fetch setup.py from same origin
    const setupRes = await fetch('map-test-kit/setup.py');
    const setupText = await setupRes.text();
    zip.file('setup.py', setupText);

    if (os === 'win') {
      zip.file('Click me to install.bat', '@echo off\ncd /d "%~dp0"\npython --version >nul 2>&1\nif errorlevel 1 (\n  echo Python is not installed.\n  echo Download it from: https://www.python.org/downloads/\n  echo Make sure to check "Add Python to PATH" during installation.\n  pause\n  exit /b 1\n)\npython setup.py\npause\n');
    } else {
      const launcher = '#!/bin/bash\ncd "$(dirname "$0")"\nif ! command -v python3 &> /dev/null; then\n  echo "Python 3 is not installed."\n  echo "Download it from: https://www.python.org/downloads/"\n  read -p "Press Enter to exit..."\n  exit 1\nfi\npython3 setup.py\n';
      const fname = os === 'mac' ? 'Click me to install.command' : 'Click me to install.sh';
      zip.file(fname, launcher, { unixPermissions: '755' });
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', platform: 'UNIX' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'openfront_map.zip';
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildSourceCanvas() {
  const w = outCanvas.width, h = outCanvas.height;
  const d = outCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const od = img.data;
  for (let i = 0; i < w * h; i++) {
    const si = i * 4;
    let zone = 0, minDist = Infinity;
    for (let z = 0; z < 4; z++) {
      const col = ZONE_COLORS_SRC[z];
      const dist = (d[si]-col[0])**2 + (d[si+1]-col[1])**2 + (d[si+2]-col[2])**2;
      if (dist < minDist) { minDist = dist; zone = z; }
    }
    const col = zone === 0 ? OF_WATER : OF_PALETTE[ZONE_TO_MAG[zone]];
    od[si] = col[0]; od[si+1] = col[1]; od[si+2] = col[2]; od[si+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function countLandTiles() {
  const w = outCanvas.width, h = outCanvas.height;
  const d = outCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    const si = i * 4;
    // Not water (dark purple ~18,15,34)
    const dist = (d[si]-18)**2 + (d[si+1]-15)**2 + (d[si+2]-34)**2;
    if (dist > 500) count++;
  }
  return count;
}


initGis({
  srcCanvas, outCanvas, imgInfo, fileNameEl,
  getAiMask: () => aiMask,
  setAiMask: v => { aiMask = v; },
  clampedSize,
  setGisMode,
  scheduleRender,
});
