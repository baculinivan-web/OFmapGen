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
const namePopup         = document.getElementById('namePopup');
const nameInput         = document.getElementById('nameInput');
const nameConfirmBtn    = document.getElementById('nameConfirmBtn');
const nameCancelBtn     = document.getElementById('nameCancelBtn');

let nations = []; // [{x, y, name}] — x,y in map pixel coords (0..mapWidth, 0..mapHeight)
let pendingCoords = null;
let draggingIdx = null;

function openNationModal() {
  nationMapImg.src = outCanvas.toDataURL('image/png');
  nationModal.classList.add('open');
  requestAnimationFrame(renderMarkers);
}

nationSpawnsBtn.addEventListener('click', openNationModal);
nationModalClose.addEventListener('click', () => nationModal.classList.remove('open'));
nationModalClose2.addEventListener('click', () => nationModal.classList.remove('open'));
clearNationsBtn.addEventListener('click', () => {
  nations = [];
  renderNationList();
  renderMarkers();
});

// Click on map area → place nation (only if not dragging)
nationMapArea.addEventListener('click', (e) => {
  if (namePopup.style.display !== 'none') return;
  if (e.target.closest('.nation-marker')) return; // clicked a marker
  const rect = nationMapImg.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
  const scaleX = outCanvas.width  / rect.width;
  const scaleY = outCanvas.height / rect.height;
  pendingCoords = { x: Math.round(px * scaleX), y: Math.round(py * scaleY) };
  showNamePopup(e.clientX, e.clientY);
});

function showNamePopup(cx, cy) {
  nameInput.value = '';
  namePopup.style.display = 'block';
  const pw = 220, ph = 120;
  let left = cx + 12, top = cy - 20;
  if (left + pw > window.innerWidth  - 8) left = cx - pw - 12;
  if (top  + ph > window.innerHeight - 8) top  = window.innerHeight - ph - 8;
  namePopup.style.left = left + 'px';
  namePopup.style.top  = top  + 'px';
  setTimeout(() => nameInput.focus(), 50);
}

function hideNamePopup() {
  namePopup.style.display = 'none';
  pendingCoords = null;
}

function confirmName() {
  const name = nameInput.value.trim();
  if (!name || !pendingCoords) { hideNamePopup(); return; }
  nations.push({ x: pendingCoords.x, y: pendingCoords.y, name });
  hideNamePopup();
  renderNationList();
  renderMarkers();
}

nameConfirmBtn.addEventListener('click', confirmName);
nameCancelBtn.addEventListener('click', hideNamePopup);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmName();
  if (e.key === 'Escape') hideNamePopup();
});

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderNationList() {
  nationCountEl.textContent = nations.length;
  nationListEl.innerHTML = nations.map((n, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:5px 4px;border-radius:5px;font-size:0.78rem;color:var(--text);">
      <span style="width:18px;height:18px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:#0d1117;flex-shrink:0;">${i+1}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(n.name)}</span>
      <button onclick="removeNation(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px;flex-shrink:0;" title="Remove">×</button>
    </div>
  `).join('');
}

window.removeNation = function(i) {
  nations.splice(i, 1);
  renderNationList();
  renderMarkers();
};

// ── DOM markers (draggable) ───────────────────────────────────────────────────
function getImgRect() { return nationMapImg.getBoundingClientRect(); }
function getAreaRect() { return nationMapArea.getBoundingClientRect(); }

function markerScreenPos(n) {
  const imgRect = getImgRect();
  const areaRect = getAreaRect();
  const scaleX = imgRect.width  / outCanvas.width;
  const scaleY = imgRect.height / outCanvas.height;
  return {
    left: imgRect.left - areaRect.left + n.x * scaleX,
    top:  imgRect.top  - areaRect.top  + n.y * scaleY,
  };
}

function renderMarkers() {
  // Remove old markers
  nationMapArea.querySelectorAll('.nation-marker').forEach(el => el.remove());
  nations.forEach((n, i) => createMarkerEl(n, i));
}

function createMarkerEl(n, i) {
  const el = document.createElement('div');
  el.className = 'nation-marker';
  el.dataset.idx = i;
  el.innerHTML = `
    <div class="nm-dot">${i + 1}</div>
    <div class="nm-label">${escHtml(n.name)}</div>
    <button class="nm-remove" title="Remove">×</button>
  `;
  positionMarker(el, n);
  nationMapArea.appendChild(el);

  // Remove button
  el.querySelector('.nm-remove').addEventListener('click', (e) => {
    e.stopPropagation();
    removeNation(i);
  });

  // Drag
  let startMx, startMy, startNx, startNy, moved;
  el.querySelector('.nm-dot').addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    moved = false;
    startMx = e.clientX; startMy = e.clientY;
    startNx = n.x; startNy = n.y;
    draggingIdx = i;

    const onMove = (ev) => {
      const dx = ev.clientX - startMx;
      const dy = ev.clientY - startMy;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      const imgRect = getImgRect();
      const areaRect = getAreaRect();
      const scaleX = outCanvas.width  / imgRect.width;
      const scaleY = outCanvas.height / imgRect.height;
      n.x = Math.max(0, Math.min(outCanvas.width  - 1, Math.round(startNx + dx * scaleX)));
      n.y = Math.max(0, Math.min(outCanvas.height - 1, Math.round(startNy + dy * scaleY)));
      positionMarker(el, n);
    };

    const onUp = () => {
      draggingIdx = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Touch drag
  el.querySelector('.nm-dot').addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const t0 = e.touches[0];
    startMx = t0.clientX; startMy = t0.clientY;
    startNx = n.x; startNy = n.y;

    const onMove = (ev) => {
      const t = ev.touches[0];
      const dx = t.clientX - startMx, dy = t.clientY - startMy;
      const imgRect = getImgRect();
      const scaleX = outCanvas.width  / imgRect.width;
      const scaleY = outCanvas.height / imgRect.height;
      n.x = Math.max(0, Math.min(outCanvas.width  - 1, Math.round(startNx + dx * scaleX)));
      n.y = Math.max(0, Math.min(outCanvas.height - 1, Math.round(startNy + dy * scaleY)));
      positionMarker(el, n);
    };

    const onEnd = () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };

    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
  }, { passive: false });
}

function positionMarker(el, n) {
  const pos = markerScreenPos(n);
  el.style.left = pos.left + 'px';
  el.style.top  = pos.top  + 'px';
}

// Reposition all markers on resize
new ResizeObserver(() => {
  if (!nationModal.classList.contains('open')) return;
  nationMapArea.querySelectorAll('.nation-marker').forEach(el => {
    const i = parseInt(el.dataset.idx);
    if (nations[i]) positionMarker(el, nations[i]);
  });
}).observe(nationMapArea);

// Download archive
downloadArchiveBtn.addEventListener('click', async () => {
  if (!outCanvas.width) return;
  const zip = new JSZip();

  // Add source PNG (OpenFront palette)
  const ofCanvas = buildSourceCanvas();
  const pngBlob = await new Promise(res => ofCanvas.toBlob(res, 'image/png'));
  zip.file('map.png', pngBlob);

  // Build manifest.json
  const manifest = {
    name: 'custom_map',
    map: { width: outCanvas.width, height: outCanvas.height, num_land_tiles: countLandTiles() },
    nations: nations.map(n => ({
      coordinates: [n.x, n.y],
      name: n.name,
      flag: '',
    })),
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'openfront_map.zip';
  a.click();
  URL.revokeObjectURL(a.href);
});

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
