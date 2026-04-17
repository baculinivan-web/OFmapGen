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

// ── Init GIS ──────────────────────────────────────────────────────────────────
initGis({
  srcCanvas, outCanvas, imgInfo, fileNameEl,
  getAiMask: () => aiMask,
  setAiMask: v => { aiMask = v; },
  clampedSize,
  setGisMode,
  scheduleRender,
});
