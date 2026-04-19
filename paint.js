// paint.js — Fullscreen terrain paint modal
// Version: 2024-01-19-v6 (improved noise algorithms)
import { parseMybBrush, MybBrushState, mybPaintSegment, mybPaintDot } from './myb-engine.js';
import { loadAbrFromArrayBuffer } from 'https://unpkg.com/abr-js@0.1.1/dist/abr.esm.js';
import { RiverLayer, generateRiverPath } from './rivers.js';

console.log('[paint.js] Module loading - Version 2024-01-19-v6 (improved noise)');

// ── Improved Noise Generators ──────────────────────────────────────────────
class PerlinNoise {
  constructor(seed = Math.random()) {
    this.p = [];
    for (let i = 0; i < 256; i++) this.p[i] = i;
    let n, q;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      n = Math.floor((seed / 233280) * (i + 1));
      q = this.p[i];
      this.p[i] = this.p[n];
      this.p[n] = q;
    }
    for (let i = 0; i < 256; i++) this.p[256 + i] = this.p[i];
  }
  
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(t, a, b) { return a + t * (b - a); }
  grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const a = this.p[X] + Y;
    const b = this.p[X + 1] + Y;
    return this.lerp(v,
      this.lerp(u, this.grad(this.p[a], x, y), this.grad(this.p[b], x - 1, y)),
      this.lerp(u, this.grad(this.p[a + 1], x, y - 1), this.grad(this.p[b + 1], x - 1, y - 1))
    );
  }
}

class SimplexNoise {
  constructor(seed = Math.random()) {
    this.p = [];
    for (let i = 0; i < 256; i++) this.p[i] = i;
    let n, q;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      n = Math.floor((seed / 233280) * (i + 1));
      q = this.p[i];
      this.p[i] = this.p[n];
      this.p[n] = q;
    }
    for (let i = 0; i < 256; i++) this.p[256 + i] = this.p[i];
  }
  
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(t, a, b) { return a + t * (b - a); }
  grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const a = this.p[X] + Y;
    const b = this.p[X + 1] + Y;
    return this.lerp(v,
      this.lerp(u, this.grad(this.p[a], x, y), this.grad(this.p[b], x - 1, y)),
      this.lerp(u, this.grad(this.p[a + 1], x, y - 1), this.grad(this.p[b + 1], x - 1, y - 1))
    );
  }
}

class FractalNoise {
  constructor(seed = Math.random()) {
    this.base = new PerlinNoise(seed);
  }
  
  noise(x, y, octaves = 4) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      value += this.base.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    
    return value / maxValue;
  }
}

class VoronoiNoise {
  constructor(seed = Math.random()) {
    this.seed = seed;
  }
  
  random2(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233 + this.seed) * 43758.5453;
    return n - Math.floor(n);
  }
  
  noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    
    let minDist = 999999;
    
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const nx = ix + i;
        const ny = iy + j;
        const px = this.random2(nx, ny);
        const py = this.random2(nx + 0.1, ny + 0.1);
        const dx = (i + px) - fx;
        const dy = (j + py) - fy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        minDist = Math.min(minDist, dist);
      }
    }
    
    return 1 - Math.min(1, minDist);
  }
}

export function initPaint({ outCanvas, onPaintApplied }) {

  console.log('[paint] initPaint() called - module loaded');

  let paintCanvas = null;

  const TERRAIN_COLORS = {
    water:    [18,  15,  34],
    plain:    [140, 170, 88],
    highland: [176, 159, 114],
    mountain: [190, 190, 190],
  };
  
  const WATER_COLOR = [18, 15, 34]; // Same as water terrain

  // Built-in brush presets — params are inlined as fallback if fetch fails
  const BRUSH_PRESETS = [
    { id: 'solid',      label: 'Solid',       file: null },
  ];

  // Inline fallback params in case fetch is unavailable (file:// protocol etc.)
  const BRUSH_FALLBACKS = {};

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const modal       = document.getElementById('paintModal');
  const mapArea     = document.getElementById('paintMapArea');
  const canvas      = document.getElementById('paintCanvas');
  if (!canvas) { console.error('[paint] paintCanvas not found in DOM'); return { open: () => {} }; }
  const ctx         = canvas.getContext('2d');
  const brushSlider = document.getElementById('paintBrushSlider');
  const brushVal    = document.getElementById('paintBrushVal');
  const spacingSlider = document.getElementById('paintSpacingSlider');
  const spacingVal    = document.getElementById('paintSpacingVal');
  const spacingRow    = document.getElementById('paintSpacingRow');
  const clearBtn    = document.getElementById('paintClearBtn');
  const doneBtn     = document.getElementById('paintDoneBtn');
  const cancelBtn   = document.getElementById('paintCancelBtn');
  const closeBtn    = document.getElementById('paintModalClose');
  const undoBtn     = document.getElementById('paintUndoBtn');
  const redoBtn     = document.getElementById('paintRedoBtn');
  const terrainBtns = document.querySelectorAll('#paintTerrainBtns .paint-btn');
  const loadBrushBtn = document.getElementById('paintLoadBrushBtn');
  const loadBrushInput = document.getElementById('paintLoadBrushInput');
  const riverModeBtn = document.getElementById('paintRiverModeBtn');
  const fillModeBtn = document.getElementById('paintFillModeBtn');
  const riverWindinessSlider = document.getElementById('paintRiverWindinessSlider');
  const riverWindinessVal = document.getElementById('paintRiverWindinessVal');
  const riverWidthSlider = document.getElementById('paintRiverWidthSlider');
  const riverWidthVal = document.getElementById('paintRiverWidthVal');
  const riverFinishBtn = document.getElementById('paintRiverFinishBtn');
  const riverCancelBtn = document.getElementById('paintRiverCancelBtn');
  const riverControlsRow = document.getElementById('paintRiverControls');
  const layersPanel = document.getElementById('paintLayersPanel');
  const layersList = document.getElementById('paintLayersList');
  const zoomInBtn   = document.getElementById('paintZoomInBtn');
  const zoomOutBtn  = document.getElementById('paintZoomOutBtn');
  const zoomResetBtn = document.getElementById('paintZoomResetBtn');
  const jaggedPanel = document.getElementById('paintJaggedPanel');
  const jaggedEnabled = document.getElementById('paintJaggedEnabled');
  const jaggedAlgorithm = document.getElementById('paintJaggedAlgorithm');
  const jaggedSeed = document.getElementById('paintJaggedSeed');
  const jaggedIntensity = document.getElementById('paintJaggedIntensity');
  const jaggedIntensityVal = document.getElementById('paintJaggedIntensityVal');
  const jaggedScale = document.getElementById('paintJaggedScale');
  const jaggedScaleVal = document.getElementById('paintJaggedScaleVal');
  const jaggedFrequency = document.getElementById('paintJaggedFrequency');
  const jaggedFrequencyVal = document.getElementById('paintJaggedFrequencyVal');
  const jaggedDepth = document.getElementById('paintJaggedDepth');
  const jaggedDepthVal = document.getElementById('paintJaggedDepthVal');
  const jaggedCloseBtn = document.getElementById('paintJaggedCloseBtn');
  const layersSidebar = document.getElementById('paintLayersSidebar');
  const layersResizeHandle = document.getElementById('paintLayersResizeHandle');

  // Validate all required DOM elements
  const domRefs = { modal, mapArea, canvas, brushSlider, brushVal, spacingSlider, spacingVal, spacingRow, clearBtn, doneBtn, cancelBtn, closeBtn, undoBtn, redoBtn, loadBrushBtn, loadBrushInput, riverModeBtn, fillModeBtn, riverWindinessSlider, riverWindinessVal, riverWidthSlider, riverWidthVal, riverFinishBtn, riverCancelBtn, riverControlsRow, layersList };
  for (const [name, el] of Object.entries(domRefs)) {
    if (!el) console.error(`[paint] DOM element not found: ${name}`);
  }

  // ── Sidebar resize ─────────────────────────────────────────────────────────
  let isResizingSidebar = false;
  let sidebarStartWidth = 280;
  let resizeStartX = 0;
  
  if (layersResizeHandle) {
    layersResizeHandle.addEventListener('mousedown', (e) => {
      isResizingSidebar = true;
      resizeStartX = e.clientX;
      sidebarStartWidth = layersSidebar.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    
    window.addEventListener('mousemove', (e) => {
      if (!isResizingSidebar) return;
      const delta = e.clientX - resizeStartX;
      const newWidth = Math.max(200, Math.min(500, sidebarStartWidth + delta));
      layersSidebar.style.width = newWidth + 'px';
    });
    
    window.addEventListener('mouseup', () => {
      if (isResizingSidebar) {
        isResizingSidebar = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // Zoom button handlers (buttons may not exist in older HTML, guard with ?)
  zoomInBtn?.addEventListener('click',    () => { zoomAt(1.25, ...mapAreaCenter()); });
  zoomOutBtn?.addEventListener('click',   () => { zoomAt(1 / 1.25, ...mapAreaCenter()); });
  zoomResetBtn?.addEventListener('click', () => resetZoom());

  function mapAreaCenter() {
    const ar = mapArea.getBoundingClientRect();
    return [ar.left + ar.width / 2, ar.top + ar.height / 2];
  }

  let currentTerrain = 'water';
  let brushSize = 16;
  let brushSpacing = 25; // % of brush size for custom brushes
  let painting = false;
  let lastX = null, lastY = null;
  let lastAngle = 0;
  let cancelSnapshot = null;
  let cancelRiverSnapshot = null;
  let cancelRiversData = null;
  let cancelLayersData = null;
  let hasChanges = false; // Track if any changes were made

  // ── Zoom / Pan state ───────────────────────────────────────────────────────
  let zoomLevel = 1;
  let panX = 0, panY = 0;
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let spaceDown = false;
  
  // Layer system
  let paintLayers = []; // Array of {name, canvas, visible, locked, jaggedEdges: {enabled, intensity, frequency, scale, algorithm, seed}}
  let currentLayerId = 0;
  let layerIdCounter = 1;
  
  // Flag to disable jagged edges during painting for performance
  let isPaintingActive = false;
  
  // River mode state
  let riverMode = false;
  let fillMode = false;
  let riverLayer = new RiverLayer();
  let riverCanvas = null; // Separate canvas for river layer
  let riverWindiness = 0.5;
  let riverWidth = 3;
  let selectedRiverId = null; // Currently selected river for editing
  let draggingPointId = null; // {riverId, pointIndex} for dragging control points

  // ── Brush state ────────────────────────────────────────────────────────────
  let currentBrushId = 'solid';
  // Cache of loaded MYB params keyed by preset id
  const brushCache = {};
  // Active MybBrushState for current stroke
  let mybState = null;

  // Custom brush loading
  const customBrushes = []; // { id, label, params }
  let customBrushCounter = 0;
  let defaultBrushesLoaded = false; // Flag to load default brushes only once

  // Seed cache immediately from inline fallbacks (no async fetch needed for now)
  for (const [id, myb] of Object.entries(BRUSH_FALLBACKS)) {
    brushCache[id] = { type: 'myb', params: parseMybBrush(myb) };
    console.log(`[paint] loaded brush ${id} from fallback`);
  }

  // Create built-in MyPaint brush buttons (skip 'solid' as it's in HTML)
  const brushBtnsContainer = document.getElementById('paintBrushBtns');
  BRUSH_PRESETS.slice(1).forEach((preset) => {
    const btn = document.createElement('button');
    btn.className = 'paint-brush-btn';
    btn.dataset.brush = preset.id;
    
    // SVG icons for each brush type
    const icons = {
      'soft-round': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></svg>',
      'hard-round': '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg>',
      'dunes': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/></svg>',
    };
    
    btn.innerHTML = `${icons[preset.id] || ''}${preset.label}`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBrushId = preset.id;
      updateSpacingVisibility();
    });
    brushBtnsContainer.appendChild(btn);
  });

  // Function to load default .abr brushes (called on first modal open)
  async function loadDefaultBrushes() {
    console.log('[paint] loadDefaultBrushes() called, defaultBrushesLoaded:', defaultBrushesLoaded);
    if (defaultBrushesLoaded) return;
    defaultBrushesLoaded = true;
    
    try {
      console.log('[paint] attempting to load brushes-map-free.abr...');
      const resp = await fetch('./brushes-map-free.abr');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      console.log('[paint] .abr file loaded, size:', buffer.byteLength, 'bytes');
      const brushes = await loadAbrFromArrayBuffer(buffer, 'brushes-map-free.abr');
      console.log('[paint] parsed brushes:', brushes);
      if (brushes && brushes.length > 0) {
        for (const abrBrush of brushes) {
          if (!abrBrush.valid) {
            console.warn('[paint] skipping invalid brush:', abrBrush.name);
            continue;
          }
          const id = `default-${++customBrushCounter}`;
          const label = abrBrush.name.length > 20 ? abrBrush.name.slice(0, 20) + '…' : abrBrush.name;
          brushCache[id] = { type: 'abr', abrBrush };
          customBrushes.push({ id, label, type: 'abr' });
          
          // Add button to UI
          const btn = document.createElement('button');
          btn.className = 'paint-brush-btn';
          btn.dataset.brush = id;
          btn.title = abrBrush.name;
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>${label}`;
          btn.addEventListener('click', () => {
            document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentBrushId = id;
            updateSpacingVisibility();
          });
          brushBtnsContainer.appendChild(btn);
          console.log('[paint] added brush button:', label);
        }
        console.log(`[paint] auto-loaded ${brushes.length} default brushes from brushes-map-free.abr`);
      } else {
        console.warn('[paint] no valid brushes found in .abr file');
      }
    } catch (err) {
      console.error('[paint] failed to auto-load default .abr brushes:', err);
    }
  }

  function addCustomBrush(brushData, fileName, type) {
    const id = `custom-${++customBrushCounter}`;
    const fullName = type === 'abr' ? brushData.name : fileName.replace(/\.myb$/i, '');
    const label = fullName.length > 20 ? fullName.slice(0, 20) + '…' : fullName;
    
    if (type === 'myb') {
      const params = parseMybBrush(brushData);
      brushCache[id] = { type: 'myb', params };
    } else if (type === 'abr') {
      brushCache[id] = { type: 'abr', abrBrush: brushData };
    }
    
    customBrushes.push({ id, label, type });
    
    // Add button to UI
    const brushBtnsContainer = document.getElementById('paintBrushBtns');
    const btn = document.createElement('button');
    btn.className = 'paint-brush-btn';
    btn.dataset.brush = id;
    btn.title = fullName; // Show full name on hover
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>${label}`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBrushId = id;
      updateSpacingVisibility();
    });
    brushBtnsContainer.appendChild(btn);
    
    // Auto-select new brush
    btn.click();
    console.log(`[paint] loaded custom brush ${id}: ${label} (${type})`);
  }

  loadBrushBtn.addEventListener('click', () => loadBrushInput.click());
  
  loadBrushInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.myb')) {
      try {
        const text = await file.text();
        const myb = JSON.parse(text);
        addCustomBrush(myb, file.name, 'myb');
      } catch (err) {
        console.error('[paint] failed to load .myb:', err);
        alert(`Failed to load brush: ${err.message}`);
      }
    } else if (fileName.endsWith('.abr')) {
      try {
        const buffer = await file.arrayBuffer();
        const brushes = await loadAbrFromArrayBuffer(buffer, file.name);
        if (!brushes || brushes.length === 0) {
          alert('No brushes found in .abr file');
          return;
        }
        // Add each brush from the .abr pack
        for (const abrBrush of brushes) {
          if (!abrBrush.valid) continue;
          addCustomBrush(abrBrush, abrBrush.name, 'abr');
        }
        console.log(`[paint] loaded ${brushes.length} brushes from ${file.name}`);
      } catch (err) {
        console.error('[paint] failed to load .abr:', err);
        alert(`Failed to load .abr file: ${err.message}`);
      }
    } else {
      alert('Please select a .myb or .abr file');
    }
    e.target.value = ''; // reset input
  });

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const MAX_HISTORY = 30;
  let undoStack = [];
  let redoStack = [];

  function saveHistory() {
    const pc = paintCanvas.getContext('2d');
    undoStack.push(pc.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    hasChanges = true; // Mark that changes were made
    
    // Clear jagged edges cache for current layer since content changed
    const layer = paintLayers.find(l => l.id === currentLayerId);
    if (layer) {
      for (const key of jaggedCache.keys()) {
        if (key.startsWith(`${layer.id}-`)) {
          jaggedCache.delete(key);
        }
      }
    }
    
    updateUndoRedoBtns();
  }

  function undo() {
    if (!undoStack.length) return;
    const pc = paintCanvas.getContext('2d');
    redoStack.push(pc.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    pc.putImageData(undoStack.pop(), 0, 0);
    redraw(); 
    updateUndoRedoBtns();
    updateLayerThumbnail(currentLayerId);
  }

  function redo() {
    if (!redoStack.length) return;
    const pc = paintCanvas.getContext('2d');
    undoStack.push(pc.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    pc.putImageData(redoStack.pop(), 0, 0);
    redraw(); 
    updateUndoRedoBtns();
    updateLayerThumbnail(currentLayerId);
  }

  function updateUndoRedoBtns() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    undoBtn.style.opacity = undoStack.length ? '1' : '0.35';
    redoBtn.style.opacity = redoStack.length ? '1' : '0.35';
  }

  // ── Reset all paint state (call when a new map is loaded) ─────────────────
  function reset() {
    paintCanvas = null;
    paintLayers = [];
    currentLayerId = 0;
    layerIdCounter = 1;
    riverLayer = new RiverLayer();
    riverCanvas = null;
    riverMode = false;
    fillMode = false;
    selectedRiverId = null;
    currentJaggedLayerId = null;
    undoStack = []; redoStack = [];
    cancelSnapshot = null;
    cancelRiverSnapshot = null;
    cancelRiversData = null;
    cancelLayersData = null;
    hasChanges = false;
    jaggedCache.clear(); // Clear jagged edges cache
  }

  // ── Ensure paint canvas ────────────────────────────────────────────────────
  function ensurePaintCanvas() {
    if (paintCanvas && paintCanvas.width === outCanvas.width && paintCanvas.height === outCanvas.height) {
      // Canvas exists, restore layers from it
      if (paintLayers.length === 0) {
        // Create base layer with original image
        const baseLayer = {
          id: layerIdCounter++,
          name: 'Layer 0 (Base)',
          canvas: document.createElement('canvas'),
          visible: true,
          locked: true,
          jaggedEdges: { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345 }
        };
        baseLayer.canvas.width = outCanvas.width;
        baseLayer.canvas.height = outCanvas.height;
        baseLayer.canvas.getContext('2d').drawImage(outCanvas, 0, 0);
        paintLayers.push(baseLayer);
        
        // Create empty paint layer
        const paintLayer = {
          id: layerIdCounter++,
          name: 'Layer 1',
          canvas: document.createElement('canvas'),
          visible: true,
          locked: false,
          jaggedEdges: { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345 }
        };
        paintLayer.canvas.width = paintCanvas.width;
        paintLayer.canvas.height = paintCanvas.height;
        paintLayer.canvas.getContext('2d').drawImage(paintCanvas, 0, 0);
        paintLayers.push(paintLayer);
        currentLayerId = paintLayer.id;
      }
      return;
    }
    
    paintCanvas = document.createElement('canvas');
    paintCanvas.width  = outCanvas.width;
    paintCanvas.height = outCanvas.height;
    
    // Clear any leftover layers from previous map
    paintLayers = [];
    
    // Create base layer with original image (locked)
    const baseLayer = {
      id: layerIdCounter++,
      name: 'Layer 0 (Base)',
      canvas: document.createElement('canvas'),
      visible: true,
      locked: true,
      jaggedEdges: { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345, depth: 20 }
    };
    baseLayer.canvas.width = outCanvas.width;
    baseLayer.canvas.height = outCanvas.height;
    baseLayer.canvas.getContext('2d').drawImage(outCanvas, 0, 0);
    paintLayers.push(baseLayer);
    
    // Create empty paint layer
    const paintLayer = {
      id: layerIdCounter++,
      name: 'Layer 1',
      canvas: document.createElement('canvas'),
      visible: true,
      locked: false,
      jaggedEdges: { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345, depth: 20 }
    };
    paintLayer.canvas.width = outCanvas.width;
    paintLayer.canvas.height = outCanvas.height;
    paintLayers.push(paintLayer);
    currentLayerId = paintLayer.id;
    
    // Create river canvas
    riverCanvas = document.createElement('canvas');
    riverCanvas.width = outCanvas.width;
    riverCanvas.height = outCanvas.height;
    
    undoStack = []; redoStack = [];
  }

  // ── Fit / redraw ───────────────────────────────────────────────────────────
  // Base scale: fit canvas to area (zoom=1 means "fit to screen")
  let baseScale = 1;

  function fitCanvas() {
    const ar = mapArea.getBoundingClientRect();
    if (!ar.width || !ar.height || !outCanvas.width) return;
    baseScale = Math.min(ar.width / outCanvas.width, ar.height / outCanvas.height);
    canvas.width  = outCanvas.width;
    canvas.height = outCanvas.height;
    applyTransform();
    redraw();
  }

  function applyTransform() {
    const s = baseScale * zoomLevel;
    canvas.style.width   = Math.floor(outCanvas.width  * baseScale) + 'px';
    canvas.style.height  = Math.floor(outCanvas.height * baseScale) + 'px';
    canvas.style.margin  = '0';
    canvas.style.display = 'block';
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    canvas.style.transformOrigin = '50% 50%';
    updateZoomDisplay();
  }

  function updateZoomDisplay() {
    const el = document.getElementById('paintZoomVal');
    if (el) el.textContent = Math.round(zoomLevel * 100) + '%';
  }

  function clampPan() {
    // Allow panning up to half the canvas size beyond the viewport
    const ar = mapArea.getBoundingClientRect();
    const scaledW = outCanvas.width  * baseScale * zoomLevel;
    const scaledH = outCanvas.height * baseScale * zoomLevel;
    const maxPanX = Math.max(0, (scaledW - ar.width)  / 2 + ar.width  * 0.5);
    const maxPanY = Math.max(0, (scaledH - ar.height) / 2 + ar.height * 0.5);
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  }

  function zoomAt(factor, clientX, clientY) {
    const ar = mapArea.getBoundingClientRect();
    // Point in mapArea-local coords (relative to center)
    const cx = clientX - ar.left - ar.width  / 2;
    const cy = clientY - ar.top  - ar.height / 2;
    // Adjust pan so the point under cursor stays fixed
    panX = cx - factor * (cx - panX);
    panY = cy - factor * (cy - panY);
    zoomLevel = Math.max(0.25, Math.min(16, zoomLevel * factor));
    clampPan();
    applyTransform();
  }

  function resetZoom() {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  // ── Jagged edges effect ───────────────────────────────────────────────────
  // Cache for processed layers
  const jaggedCache = new Map();
  
  function getCacheKey(layer) {
    const je = layer.jaggedEdges;
    return `${layer.id}-${je.enabled}-${je.intensity}-${je.frequency}-${je.scale}-${je.algorithm}-${je.seed}-${je.depth}`;
  }
  
  function applyJaggedEdges(layer) {
    // Skip jagged edges during active painting for performance
    if (isPaintingActive) return layer.canvas;
    
    if (!layer.jaggedEdges || !layer.jaggedEdges.enabled) return layer.canvas;
    
    const { intensity, frequency, scale, algorithm, seed, depth } = layer.jaggedEdges;
    if (intensity === 0) return layer.canvas;
    
    // Check cache
    const cacheKey = getCacheKey(layer);
    if (jaggedCache.has(cacheKey)) {
      return jaggedCache.get(cacheKey);
    }
    
    // Original single-layer processing
    return applyJaggedEdgesToSingleLayer(layer, intensity, frequency, scale, algorithm, seed, depth, cacheKey);
  }
  
  function applyJaggedEdgesToSingleLayer(layer, intensity, frequency, scale, algorithm, seed, depth, cacheKey) {
    const temp = applyJaggedEdgesToCanvas(layer.canvas, intensity, frequency, scale, algorithm, seed, depth);
    
    // Cache result (limit cache size)
    if (jaggedCache.size > 10) {
      const firstKey = jaggedCache.keys().next().value;
      jaggedCache.delete(firstKey);
    }
    jaggedCache.set(cacheKey, temp);
    
    return temp;
  }
  
  function applyJaggedEdgesToCanvas(sourceCanvas, intensity, frequency, scale, algorithm, seed, depth) {
    // This is the core jagged edges algorithm extracted to work on any canvas
    const temp = document.createElement('canvas');
    temp.width = sourceCanvas.width;
    temp.height = sourceCanvas.height;
    const tempCtx = temp.getContext('2d');
    
    const srcData = sourceCanvas.getContext('2d').getImageData(0, 0, temp.width, temp.height);
    const dstData = tempCtx.createImageData(temp.width, temp.height);
    
    // Select noise generator based on algorithm
    let noise;
    switch (algorithm) {
      case 'perlin':
        noise = new PerlinNoise(seed);
        break;
      case 'simplex':
        noise = new SimplexNoise(seed);
        break;
      case 'voronoi':
        noise = new VoronoiNoise(seed);
        break;
      case 'fractal':
      default:
        noise = new FractalNoise(seed);
        break;
    }
    
    const w = temp.width;
    const h = temp.height;
    const totalPixels = w * h;
    const step = totalPixels > 1000000 ? 2 : 1;
    
    const edgeRadius = Math.max(2, Math.round(scale * 2));
    const effectDepth = depth || 20;
    
    // Process pixels - READ from displaced position, WRITE to current position
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4;
        const alpha = srcData.data[idx + 3];
        
        if (alpha === 0) {
          dstData.data[idx + 3] = 0;
          if (step > 1) {
            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const i = ((y + dy) * w + (x + dx)) * 4;
                dstData.data[i + 3] = 0;
              }
            }
          }
          continue;
        }
        
        // Check neighbors for edge detection
        let isNearEdge = false;
        let minAlpha = 255;
        let maxAlpha = 0;
        let distanceFromEdge = effectDepth + 1;
        
        for (let dy = -edgeRadius; dy <= edgeRadius; dy += Math.max(1, Math.floor(edgeRadius / 2))) {
          for (let dx = -edgeRadius; dx <= edgeRadius; dx += Math.max(1, Math.floor(edgeRadius / 2))) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = (ny * w + nx) * 4;
            const nAlpha = srcData.data[nIdx + 3];
            minAlpha = Math.min(minAlpha, nAlpha);
            maxAlpha = Math.max(maxAlpha, nAlpha);
          }
        }
        
        isNearEdge = (maxAlpha - minAlpha) > 30;
        
        if (isNearEdge) {
          let minDist = effectDepth + 1;
          const maxSearchRadius = Math.min(effectDepth, 50);
          
          outerLoop: for (let radius = 1; radius <= maxSearchRadius; radius += 2) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / (4 * radius)) {
              const dx = Math.round(Math.cos(angle) * radius);
              const dy = Math.round(Math.sin(angle) * radius);
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
              const nIdx = (ny * w + nx) * 4;
              const nAlpha = srcData.data[nIdx + 3];
              if (Math.abs(nAlpha - alpha) > 100) {
                minDist = radius;
                break outerLoop;
              }
            }
          }
          distanceFromEdge = minDist;
        }
        
        if (isNearEdge && distanceFromEdge <= effectDepth) {
          const fadeFactor = 1 - (distanceFromEdge / effectDepth);
          
          let noiseX, noiseY, noiseX2, noiseY2;
          
          if (algorithm === 'fractal') {
            noiseX = noise.noise(x * frequency * 0.03 / scale, y * frequency * 0.03 / scale, 4);
            noiseY = noise.noise(x * frequency * 0.03 / scale + 100, y * frequency * 0.03 / scale + 100, 4);
            noiseX2 = noise.noise(x * frequency * 0.1 / scale + 50, y * frequency * 0.1 / scale + 50, 2);
            noiseY2 = noise.noise(x * frequency * 0.1 / scale + 150, y * frequency * 0.1 / scale + 150, 2);
          } else {
            noiseX = noise.noise(x * frequency * 0.03 / scale, y * frequency * 0.03 / scale);
            noiseY = noise.noise(x * frequency * 0.03 / scale + 100, y * frequency * 0.03 / scale + 100);
            noiseX2 = noise.noise(x * frequency * 0.1 / scale + 50, y * frequency * 0.1 / scale + 50);
            noiseY2 = noise.noise(x * frequency * 0.1 / scale + 150, y * frequency * 0.1 / scale + 150);
          }
          
          const offsetX = Math.round((noiseX * 0.7 + noiseX2 * 0.3) * intensity * scale * fadeFactor);
          const offsetY = Math.round((noiseY * 0.7 + noiseY2 * 0.3) * intensity * scale * fadeFactor);
          
          // READ from displaced position (this creates the jagged effect)
          const srcX = Math.max(0, Math.min(w - 1, x + offsetX));
          const srcY = Math.max(0, Math.min(h - 1, y + offsetY));
          const srcIdx = (srcY * w + srcX) * 4;
          
          // WRITE to current position
          dstData.data[idx]     = srcData.data[srcIdx];
          dstData.data[idx + 1] = srcData.data[srcIdx + 1];
          dstData.data[idx + 2] = srcData.data[srcIdx + 2];
          dstData.data[idx + 3] = srcData.data[srcIdx + 3];
          
          if (step > 1) {
            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const i = ((y + dy) * w + (x + dx)) * 4;
                dstData.data[i]     = srcData.data[srcIdx];
                dstData.data[i + 1] = srcData.data[srcIdx + 1];
                dstData.data[i + 2] = srcData.data[srcIdx + 2];
                dstData.data[i + 3] = srcData.data[srcIdx + 3];
              }
            }
          }
        } else {
          // Copy pixel as-is
          dstData.data[idx]     = srcData.data[idx];
          dstData.data[idx + 1] = srcData.data[idx + 1];
          dstData.data[idx + 2] = srcData.data[idx + 2];
          dstData.data[idx + 3] = srcData.data[idx + 3];
          
          if (step > 1) {
            for (let dy = 0; dy < step && y + dy < h; dy++) {
              for (let dx = 0; dx < step && x + dx < w; dx++) {
                const i = ((y + dy) * w + (x + dx)) * 4;
                dstData.data[i]     = srcData.data[idx];
                dstData.data[i + 1] = srcData.data[idx + 1];
                dstData.data[i + 2] = srcData.data[idx + 2];
                dstData.data[i + 3] = srcData.data[idx + 3];
              }
            }
          }
        }
      }
    }
    
    tempCtx.putImageData(dstData, 0, 0);
    return temp;
  }

  function redraw() {
    if (!outCanvas.width) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Composite all visible paint layers with jagged edges effect (respecting layer order and visibility)
    for (const layer of paintLayers) {
      if (layer.visible) {
        const layerCanvas = applyJaggedEdges(layer);
        ctx.drawImage(layerCanvas, 0, 0);
      }
    }
    
    // Draw rivers on top with selected river control points
    if (riverCanvas) {
      const rCtx = riverCanvas.getContext('2d');
      rCtx.clearRect(0, 0, riverCanvas.width, riverCanvas.height);
      riverLayer.render(rCtx, WATER_COLOR, selectedRiverId);
      ctx.drawImage(riverCanvas, 0, 0);
    }
  }
  
  // ── Update layer thumbnail ─────────────────────────────────────────────────
  function updateLayerThumbnail(layerId) {
    const layer = paintLayers.find(l => l.id === layerId);
    if (!layer) return;
    
    const img = document.querySelector(`[data-layer-id="${layerId}"] img`);
    if (!img) return;
    
    // Generate thumbnail
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 32;
    thumbCanvas.height = 32;
    const thumbCtx = thumbCanvas.getContext('2d');
    
    // Scale layer canvas to thumbnail
    const scale = Math.min(32 / layer.canvas.width, 32 / layer.canvas.height);
    const w = layer.canvas.width * scale;
    const h = layer.canvas.height * scale;
    const x = (32 - w) / 2;
    const y = (32 - h) / 2;
    
    // Checkerboard background for transparency
    thumbCtx.fillStyle = '#fff';
    thumbCtx.fillRect(0, 0, 32, 32);
    thumbCtx.fillStyle = '#ddd';
    for (let ty = 0; ty < 32; ty += 8) {
      for (let tx = 0; tx < 32; tx += 8) {
        if ((tx / 8 + ty / 8) % 2 === 0) thumbCtx.fillRect(tx, ty, 8, 8);
      }
    }
    
    thumbCtx.drawImage(layer.canvas, x, y, w, h);
    img.src = thumbCanvas.toDataURL();
  }

  new ResizeObserver(() => { if (modal.classList.contains('open')) fitCanvas(); }).observe(mapArea);

  // ── Zoom & Pan event handlers ──────────────────────────────────────────────
  mapArea.addEventListener('wheel', e => {
    if (!modal.classList.contains('open')) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false });

  // Space key for pan mode — handled in keyboard shortcuts block below
  document.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceDown = false;
      if (modal.classList.contains('open')) mapArea.style.cursor = '';
    }
  });

  // Pan with space+drag or middle mouse button
  mapArea.addEventListener('mousedown', e => {
    if (!modal.classList.contains('open')) return;
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      mapArea.style.cursor = 'grabbing';
    }
  });
  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    clampPan();
    applyTransform();
  });
  window.addEventListener('mouseup', e => {
    if (!isPanning) return;
    isPanning = false;
    mapArea.style.cursor = spaceDown ? 'grab' : '';
  });

  // Pinch-to-zoom on touch
  let lastTouchDist = null;
  mapArea.addEventListener('touchstart', e => {
    if (e.touches.length === 2) lastTouchDist = null;
  }, { passive: true });
  mapArea.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) { lastTouchDist = null; return; }
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastTouchDist !== null && dist > 0) {
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomAt(dist / lastTouchDist, midX, midY);
    }
    lastTouchDist = dist;
  }, { passive: false });

  // ── Jagged edges panel ─────────────────────────────────────────────────────
  let currentJaggedLayerId = null;
  
  function openJaggedEdgesPanel(layerId) {
    const layer = paintLayers.find(l => l.id === layerId);
    if (!layer) return;
    
    currentJaggedLayerId = layerId;
    jaggedPanel.style.display = 'block';
    
    // Load current settings
    if (!layer.jaggedEdges) {
      layer.jaggedEdges = { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345, depth: 20 };
    }
    
    // Don't auto-enable - just load current state
    jaggedEnabled.checked = layer.jaggedEdges.enabled;
    jaggedAlgorithm.value = layer.jaggedEdges.algorithm || 'fractal';
    jaggedSeed.value = layer.jaggedEdges.seed || 12345;
    jaggedIntensity.value = layer.jaggedEdges.intensity;
    jaggedIntensityVal.value = layer.jaggedEdges.intensity;
    jaggedScale.value = layer.jaggedEdges.scale || 1.0;
    jaggedScaleVal.value = (layer.jaggedEdges.scale || 1.0).toFixed(1);
    jaggedFrequency.value = layer.jaggedEdges.frequency;
    jaggedFrequencyVal.value = layer.jaggedEdges.frequency.toFixed(1);
    jaggedDepth.value = layer.jaggedEdges.depth || 20;
    jaggedDepthVal.value = layer.jaggedEdges.depth || 20;
  }
  
  function closeJaggedEdgesPanel() {
    jaggedPanel.style.display = 'none';
    currentJaggedLayerId = null;
    updateLayersList();
  }
  
  jaggedCloseBtn?.addEventListener('click', closeJaggedEdgesPanel);
  
  jaggedEnabled?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
    if (layer) {
      layer.jaggedEdges.enabled = jaggedEnabled.checked;
      updateLayersList();
      redraw();
    }
  });
  
  jaggedAlgorithm?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
    if (layer) {
      layer.jaggedEdges.algorithm = jaggedAlgorithm.value;
      redraw();
    }
  });
  
  jaggedSeed?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
    if (layer) {
      const val = parseInt(jaggedSeed.value);
      if (!isNaN(val) && val >= 1) {
        layer.jaggedEdges.seed = val;
        redraw();
      }
    }
  });
  
  jaggedIntensity?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
    if (layer) {
      layer.jaggedEdges.intensity = parseFloat(jaggedIntensity.value);
      jaggedIntensityVal.value = jaggedIntensity.value;
    }
  });
  
  jaggedIntensity?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });
  
  // Manual input for intensity
  jaggedIntensityVal?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const val = parseFloat(jaggedIntensityVal.value);
    if (!isNaN(val) && val >= 0) {
      const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
      if (layer) {
        layer.jaggedEdges.intensity = val;
        jaggedIntensity.value = Math.min(50, val); // Clamp slider only
      }
    }
  });
  
  jaggedIntensityVal?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });
  
  jaggedScale?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
    if (layer) {
      layer.jaggedEdges.scale = parseFloat(jaggedScale.value);
      jaggedScaleVal.value = parseFloat(jaggedScale.value).toFixed(1);
    }
  });
  
  jaggedScale?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });
  
  // Manual input for scale
  jaggedScaleVal?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const val = parseFloat(jaggedScaleVal.value);
    if (!isNaN(val) && val >= 0.1) {
      const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
      if (layer) {
        layer.jaggedEdges.scale = val;
        jaggedScale.value = Math.min(10, val); // Clamp slider only
      }
    }
  });
  
  jaggedScaleVal?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });
  
  jaggedFrequency?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
    if (layer) {
      layer.jaggedEdges.frequency = parseFloat(jaggedFrequency.value);
      jaggedFrequencyVal.value = parseFloat(jaggedFrequency.value).toFixed(1);
    }
  });
  
  jaggedFrequency?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });
  
  // Manual input for frequency
  jaggedFrequencyVal?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const val = parseFloat(jaggedFrequencyVal.value);
    if (!isNaN(val) && val >= 0.1) {
      const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
      if (layer) {
        layer.jaggedEdges.frequency = val;
        jaggedFrequency.value = Math.min(5, val); // Clamp slider only
      }
    }
  });
  
  jaggedFrequencyVal?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });
  
  jaggedDepth?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
    if (layer) {
      layer.jaggedEdges.depth = parseFloat(jaggedDepth.value);
      jaggedDepthVal.value = jaggedDepth.value;
    }
  });
  
  jaggedDepth?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });
  
  // Manual input for depth
  jaggedDepthVal?.addEventListener('input', () => {
    if (currentJaggedLayerId === null) return;
    const val = parseFloat(jaggedDepthVal.value);
    if (!isNaN(val) && val >= 1) {
      const layer = paintLayers.find(l => l.id === currentJaggedLayerId);
      if (layer) {
        // Cap at 200 for performance
        const cappedVal = Math.min(200, val);
        layer.jaggedEdges.depth = cappedVal;
        jaggedDepth.value = Math.min(100, cappedVal); // Clamp slider only
        if (val !== cappedVal) {
          jaggedDepthVal.value = cappedVal;
        }
      }
    }
  });
  
  jaggedDepthVal?.addEventListener('change', () => {
    if (currentJaggedLayerId === null) return;
    redraw();
  });

  // ── Open ───────────────────────────────────────────────────────────────────
  function open() {
    console.log('[paint] modal opening...');
    if (!outCanvas.width) return;
    ensurePaintCanvas();
    
    // Save snapshot for cancel - deep copy layers
    cancelLayersData = paintLayers.map(l => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      jaggedEdges: l.jaggedEdges ? { ...l.jaggedEdges } : { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345, depth: 20 },
      canvas: (() => {
        const c = document.createElement('canvas');
        c.width = l.canvas.width;
        c.height = l.canvas.height;
        c.getContext('2d').drawImage(l.canvas, 0, 0);
        return c;
      })()
    }));
    
    // Save river snapshot for cancel
    if (riverCanvas) {
      cancelRiversData = JSON.parse(JSON.stringify(riverLayer.export()));
    }
    
    undoStack = []; redoStack = [];
    hasChanges = false;
    zoomLevel = 1; panX = 0; panY = 0;
    riverMode = false;
    fillMode = false;
    riverModeBtn.classList.remove('active');
    fillModeBtn.classList.remove('active');
    riverControlsRow.style.display = 'none';
    window.riverStartPoint = null;
    closeJaggedEdgesPanel();
    updateUndoRedoBtns();
    updateLayersList();
    modal.classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(fitCanvas));
    
    console.log('[paint] calling loadDefaultBrushes()...');
    loadDefaultBrushes();
  }

  // ── Coords ─────────────────────────────────────────────────────────────────
  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [
      Math.round((clientX - rect.left) * outCanvas.width  / rect.width),
      Math.round((clientY - rect.top)  * outCanvas.height / rect.height),
    ];
  }

  function paintDot(px, py) {
    const layer = paintLayers.find(l => l.id === currentLayerId);
    if (!layer || layer.locked) return;
    
    const rgb = TERRAIN_COLORS[currentTerrain];
    const brush = brushCache[currentBrushId];
    const pc = layer.canvas.getContext('2d');
    
    if (currentBrushId === 'solid') {
      pc.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      pc.beginPath();
      pc.arc(px, py, brushSize, 0, Math.PI * 2);
      pc.fill();
    } else if (brush && brush.type === 'myb' && mybState) {
      mybPaintDot(pc, mybState, px, py, brushSize, rgb);
    } else if (brush && brush.type === 'abr') {
      abrPaintDot(pc, brush.abrBrush, px, py, brushSize, rgb);
    }
  }

  function paintSegment(x0, y0, x1, y1) {
    const layer = paintLayers.find(l => l.id === currentLayerId);
    if (!layer || layer.locked) return;
    
    const rgb = TERRAIN_COLORS[currentTerrain];
    const brush = brushCache[currentBrushId];
    const pc = layer.canvas.getContext('2d');
    
    if (currentBrushId === 'solid') {
      pc.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      const dx = x1 - x0, dy = y1 - y0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(1, Math.ceil(dist / (brushSize * 0.4)));
      for (let i = 1; i <= steps; i++) {
        const x = x0 + dx * (i / steps);
        const y = y0 + dy * (i / steps);
        pc.beginPath();
        pc.arc(x, y, brushSize, 0, Math.PI * 2);
        pc.fill();
      }
    } else if (brush && brush.type === 'myb' && mybState) {
      mybPaintSegment(pc, mybState, x0, y0, x1, y1, brushSize, brushSpacing, rgb);
    } else if (brush && brush.type === 'abr') {
      abrPaintSegment(pc, brush.abrBrush, x0, y0, x1, y1, brushSize, brushSpacing, rgb);
    }
  }

  // ── Flood fill algorithm ───────────────────────────────────────────────────
  function floodFill(px, py) {
    const layer = paintLayers.find(l => l.id === currentLayerId);
    if (!layer || layer.locked) return;
    
    const pc = layer.canvas.getContext('2d');
    const w = layer.canvas.width;
    const h = layer.canvas.height;
    
    // Clamp coords
    px = Math.max(0, Math.min(w - 1, Math.round(px)));
    py = Math.max(0, Math.min(h - 1, Math.round(py)));
    
    // Get target color at click position — sample from composited view (outCanvas + all layers)
    // so fill respects what user sees, not just current layer
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = w;
    compositeCanvas.height = h;
    const cc = compositeCanvas.getContext('2d');
    cc.drawImage(outCanvas, 0, 0);
    for (const l of paintLayers) {
      if (l.visible) cc.drawImage(l.canvas, 0, 0);
    }
    const compositeData = cc.getImageData(0, 0, w, h).data;
    
    const idx = (py * w + px) * 4;
    const targetR = compositeData[idx];
    const targetG = compositeData[idx + 1];
    const targetB = compositeData[idx + 2];
    
    // Get fill color
    const rgb = TERRAIN_COLORS[currentTerrain];
    const fillR = rgb[0], fillG = rgb[1], fillB = rgb[2];
    
    // If target color is same as fill color, nothing to do
    if (targetR === fillR && targetG === fillG && targetB === fillB) return;
    
    // Work on current layer's imageData
    const imageData = pc.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    // Use typed array for visited — much faster than Set
    const visited = new Uint8Array(w * h);
    
    // Stack-based flood fill
    const stack = [py * w + px];
    
    const colorTolerance = 30; // Allow slight color variation
    function colorMatch(i4) {
      const dr = compositeData[i4]     - targetR;
      const dg = compositeData[i4 + 1] - targetG;
      const db = compositeData[i4 + 2] - targetB;
      return (dr * dr + dg * dg + db * db) <= colorTolerance * colorTolerance;
    }
    
    while (stack.length > 0) {
      const pos = stack.pop();
      if (visited[pos]) continue;
      
      const x = pos % w;
      const y = (pos - x) / w;
      const i4 = pos * 4;
      
      if (!colorMatch(i4)) continue;
      
      visited[pos] = 1;
      data[i4]     = fillR;
      data[i4 + 1] = fillG;
      data[i4 + 2] = fillB;
      data[i4 + 3] = 255;
      
      if (x + 1 < w)  stack.push(pos + 1);
      if (x - 1 >= 0) stack.push(pos - 1);
      if (y + 1 < h)  stack.push(pos + w);
      if (y - 1 >= 0) stack.push(pos - w);
    }
    
    pc.putImageData(imageData, 0, 0);
  }

  // ABR stamp-based rendering
  function abrPaintDot(ctx, abrBrush, px, py, size, rgb) {
    const img = abrBrush.brushTipImage;
    if (!img || !img.width || !img.height) return;
    
    // Use higher resolution if brush is small relative to desired size
    const scale = size / Math.max(img.width, img.height);
    const useHighRes = scale > 2; // If scaling up more than 2x, use original resolution
    
    const w = useHighRes ? img.width : Math.ceil(img.width * scale);
    const h = useHighRes ? img.height : Math.ceil(img.height * scale);
    
    // Create offscreen canvas for compositing
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tempCtx = temp.getContext('2d');
    
    // Disable smoothing for crisp edges
    tempCtx.imageSmoothingEnabled = false;
    
    // Draw scaled brush texture
    tempCtx.drawImage(img, 0, 0, w, h);
    
    // Get image data to manipulate pixels
    const imageData = tempCtx.getImageData(0, 0, w, h);
    const data = imageData.data;
    
    // ABR brushes: grayscale value = opacity, we need to tint with terrain color
    // For each pixel: set RGB to terrain color, keep alpha from grayscale
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i]; // R channel (grayscale)
      const alpha = 255 - gray; // Invert: black in brush = opaque, white = transparent
      data[i]     = rgb[0]; // R
      data[i + 1] = rgb[1]; // G
      data[i + 2] = rgb[2]; // B
      data[i + 3] = alpha;  // A
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    
    // Draw to main canvas with final scaling if needed
    ctx.imageSmoothingEnabled = false;
    if (useHighRes) {
      ctx.drawImage(temp, Math.round(px - size/2), Math.round(py - size/2), size, size);
    } else {
      ctx.drawImage(temp, Math.round(px - w/2), Math.round(py - h/2));
    }
    ctx.imageSmoothingEnabled = true;
  }

  function abrPaintSegment(ctx, abrBrush, x0, y0, x1, y1, size, spacingPercent, rgb) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = Math.max(1, size * spacingPercent / 100);
    const steps = Math.max(1, Math.ceil(dist / step));
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      abrPaintDot(ctx, abrBrush, x, y, size, rgb);
    }
  }

  // ── River mode controls ────────────────────────────────────────────────────
  function toggleFillMode() {
    fillMode = !fillMode;
    fillModeBtn.classList.toggle('active', fillMode);
    
    // Disable river mode if fill mode is enabled
    if (fillMode && riverMode) {
      toggleRiverMode();
    }
    
    if (fillMode) {
      // Disable brush selection
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.style.opacity = '0.3');
      document.getElementById('paintBrushSlider').disabled = true;
      document.getElementById('paintBrushSlider').style.opacity = '0.3';
      spacingRow.style.display = 'none';
    } else {
      // Re-enable brush selection
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.style.opacity = '');
      document.getElementById('paintBrushSlider').disabled = false;
      document.getElementById('paintBrushSlider').style.opacity = '';
      updateSpacingVisibility();
    }
  }
  
  fillModeBtn.addEventListener('click', toggleFillMode);
  
  function toggleRiverMode() {
    riverMode = !riverMode;
    riverModeBtn.classList.toggle('active', riverMode);
    riverControlsRow.style.display = riverMode ? 'block' : 'none';
    
    // Disable fill mode if river mode is enabled
    if (riverMode && fillMode) {
      toggleFillMode();
    }
    
    if (riverMode) {
      // Disable terrain/brush selection
      document.querySelectorAll('#paintTerrainBtns .paint-btn').forEach(b => b.style.opacity = '0.3');
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.style.opacity = '0.3');
      document.getElementById('paintBrushSlider').disabled = true;
      document.getElementById('paintBrushSlider').style.opacity = '0.3';
    } else {
      // Re-enable terrain/brush selection
      document.querySelectorAll('#paintTerrainBtns .paint-btn').forEach(b => b.style.opacity = '');
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.style.opacity = '');
      document.getElementById('paintBrushSlider').disabled = false;
      document.getElementById('paintBrushSlider').style.opacity = '';
      
      // Cancel any in-progress river
      if (riverLayer.currentRiver) {
        riverLayer.cancelRiver();
        updateLayersList();
        redraw();
      }
      selectedRiverId = null;
    }
  }
  
  riverModeBtn.addEventListener('click', toggleRiverMode);
  
  riverWindinessSlider.addEventListener('input', () => {
    riverWindiness = parseFloat(riverWindinessSlider.value);
    riverWindinessVal.textContent = Math.round(riverWindiness * 100) + '%';
    
    if (riverLayer.currentRiver) {
      riverLayer.setWindiness(riverWindiness);
    } else if (selectedRiverId !== null) {
      // Update selected river
      const river = riverLayer.rivers[selectedRiverId];
      if (river) {
        river.windiness = riverWindiness;
        riverLayer.rivers[selectedRiverId] = {
          ...river,
          path: generateRiverPath(river.controlPoints, riverWindiness, 5)
        };
      }
    }
    redraw();
  });
  
  riverWidthSlider.addEventListener('input', () => {
    riverWidth = parseInt(riverWidthSlider.value);
    riverWidthVal.textContent = riverWidth;
    
    if (riverLayer.currentRiver) {
      riverLayer.setWidth(riverWidth);
    } else if (selectedRiverId !== null) {
      // Update selected river
      const river = riverLayer.rivers[selectedRiverId];
      if (river) {
        river.width = riverWidth;
      }
    }
    redraw();
  });
  
  riverFinishBtn.addEventListener('click', () => {
    if (riverLayer.currentRiver) {
      saveHistory();
      riverLayer.finishRiver();
      hasChanges = true;
      selectedRiverId = null;
      updateLayersList();
      redraw();
    } else if (selectedRiverId !== null) {
      // Finish editing existing river
      saveHistory();
      hasChanges = true;
      selectedRiverId = null;
      updateLayersList();
      redraw();
    }
  });
  
  riverCancelBtn.addEventListener('click', () => {
    if (riverLayer.currentRiver) {
      riverLayer.cancelRiver();
      updateLayersList();
      redraw();
    }
  });

  // ── Pointer events ─────────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    if (isPanning || spaceDown) return; // panning takes priority
    
    const [x, y] = toCanvasCoords(e);
    
    // Fill mode: flood fill on click
    if (fillMode) {
      saveHistory();
      floodFill(x, y);
      hasChanges = true;
      updateLayerThumbnail(currentLayerId);
      redraw();
      return;
    }
    
    // River mode: check if clicking on control point first
    if (riverMode) {
      // Check if editing existing river
      if (selectedRiverId !== null) {
        const river = riverLayer.rivers[selectedRiverId];
        if (river) {
          // Check if clicking on a control point
          for (let i = 0; i < river.controlPoints.length; i++) {
            const p = river.controlPoints[i];
            const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
            if (dist < 8) {
              // Right click or Ctrl+click to delete point
              if (e.button === 2 || e.ctrlKey) {
                if (river.controlPoints.length > 2) {
                  saveHistory();
                  river.controlPoints.splice(i, 1);
                  river.path = generateRiverPath(river.controlPoints, river.windiness, 5);
                  hasChanges = true;
                  redraw();
                }
                return;
              }
              // Start dragging this point
              draggingPointId = { riverId: selectedRiverId, pointIndex: i };
              return;
            }
          }
          // Not clicking on point, add new point
          saveHistory();
          river.controlPoints.push({ x, y });
          river.path = generateRiverPath(river.controlPoints, river.windiness, 5);
          hasChanges = true;
          redraw();
          return;
        }
      }
      
      // Check if editing current river
      if (riverLayer.currentRiver) {
        // Check if clicking on a control point
        for (let i = 0; i < riverLayer.currentRiver.controlPoints.length; i++) {
          const p = riverLayer.currentRiver.controlPoints[i];
          const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
          if (dist < 8) {
            // Right click or Ctrl+click to delete point
            if (e.button === 2 || e.ctrlKey) {
              if (riverLayer.currentRiver.controlPoints.length > 2) {
                riverLayer.currentRiver.controlPoints.splice(i, 1);
                riverLayer.updateCurrentRiverPath();
                redraw();
              }
              return;
            }
            // Start dragging this point
            draggingPointId = { riverId: 'current', pointIndex: i };
            return;
          }
        }
        // Not clicking on point, add new point
        riverLayer.addControlPoint({ x, y });
        updateLayersList();
        redraw();
        return;
      }
      
      // No river selected, start new river
      if (!window.riverStartPoint) {
        window.riverStartPoint = { x, y };
        redraw();
        const tempCtx = canvas.getContext('2d');
        tempCtx.fillStyle = 'rgba(88, 166, 255, 0.8)';
        tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        tempCtx.lineWidth = 2;
        tempCtx.beginPath();
        tempCtx.arc(x, y, 5, 0, Math.PI * 2);
        tempCtx.fill();
        tempCtx.stroke();
        return;
      } else {
        riverLayer.startRiver(window.riverStartPoint, { x, y }, riverWindiness, riverWidth);
        window.riverStartPoint = null;
        updateLayersList();
        redraw();
        return;
      }
    }
    
    // Normal paint mode
    saveHistory();
    painting = true;
    isPaintingActive = true; // Disable jagged edges during painting
    lastX = x; lastY = y;
    const brush = brushCache[currentBrushId];
    if (brush && brush.type === 'myb') {
      mybState = new MybBrushState(brush.params);
    } else {
      mybState = null;
    }
    paintDot(x, y);
    redraw();
  });

  canvas.addEventListener('mousemove', e => {
    if (isPanning) return;
    if (riverMode) {
      // Handle dragging control points
      if (draggingPointId) {
        const [x, y] = toCanvasCoords(e);
        if (draggingPointId.riverId === 'current' && riverLayer.currentRiver) {
          riverLayer.currentRiver.controlPoints[draggingPointId.pointIndex] = { x, y };
          riverLayer.updateCurrentRiverPath();
          redraw();
        } else if (draggingPointId.riverId !== 'current') {
          const river = riverLayer.rivers[draggingPointId.riverId];
          if (river) {
            river.controlPoints[draggingPointId.pointIndex] = { x, y };
            river.path = generateRiverPath(river.controlPoints, river.windiness, 5);
            redraw();
          }
        }
      }
      return;
    }
    
    if (!painting) return;
    e.preventDefault();
    const [x, y] = toCanvasCoords(e);
    const dx = x - lastX, dy = y - lastY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) lastAngle = Math.atan2(dy, dx);
    paintSegment(lastX, lastY, x, y);
    lastX = x; lastY = y;
    redraw();
  });

  canvas.addEventListener('mouseup',    () => { 
    painting = false; 
    mybState = null;
    draggingPointId = null;
    if (isPaintingActive) {
      isPaintingActive = false;
      updateLayerThumbnail(currentLayerId); // Update thumbnail after painting
      redraw(); // Redraw with jagged edges applied
    }
  });
  canvas.addEventListener('mouseleave', () => { 
    painting = false; 
    mybState = null;
    draggingPointId = null;
    if (isPaintingActive) {
      isPaintingActive = false;
      updateLayerThumbnail(currentLayerId); // Update thumbnail after painting
      redraw(); // Redraw with jagged edges applied
    }
  });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    
    const [x, y] = toCanvasCoords(e);
    
    // Fill mode: flood fill on tap
    if (fillMode) {
      saveHistory();
      floodFill(x, y);
      hasChanges = true;
      updateLayerThumbnail(currentLayerId);
      redraw();
      return;
    }
    
    // River mode: place control points
    if (riverMode) {
      if (!riverLayer.currentRiver) {
        if (!window.riverStartPoint) {
          window.riverStartPoint = { x, y };
          redraw();
          const tempCtx = canvas.getContext('2d');
          tempCtx.fillStyle = 'rgba(88, 166, 255, 0.8)';
          tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          tempCtx.lineWidth = 2;
          tempCtx.beginPath();
          tempCtx.arc(x, y, 5, 0, Math.PI * 2);
          tempCtx.fill();
          tempCtx.stroke();
          return;
        } else {
          riverLayer.startRiver(window.riverStartPoint, { x, y }, riverWindiness, riverWidth);
          window.riverStartPoint = null;
          redraw();
          return;
        }
      } else {
        riverLayer.addControlPoint({ x, y });
        redraw();
        return;
      }
    }
    
    // Normal paint mode
    saveHistory();
    painting = true;
    isPaintingActive = true; // Disable jagged edges during painting
    lastX = x; lastY = y;
    const brush = brushCache[currentBrushId];
    if (brush && brush.type === 'myb') {
      mybState = new MybBrushState(brush.params);
    } else {
      mybState = null;
    }
    paintDot(x, y);
    redraw();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (riverMode) return; // No drag in river mode
    if (!painting) return;
    e.preventDefault();
    const [x, y] = toCanvasCoords(e);
    const dx = x - lastX, dy = y - lastY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) lastAngle = Math.atan2(dy, dx);
    paintSegment(lastX, lastY, x, y);
    lastX = x; lastY = y;
    redraw();
  }, { passive: false });
  
  canvas.addEventListener('touchend', () => {
    painting = false;
    mybState = null;
    if (isPaintingActive) {
      isPaintingActive = false;
      redraw(); // Redraw with jagged edges applied
    }
  });

  // Disable context menu on canvas for right-click delete
  canvas.addEventListener('contextmenu', e => {
    if (riverMode) e.preventDefault();
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!modal.classList.contains('open')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    if (e.code === 'Space' && !e.target.matches('input,textarea')) {
      e.preventDefault();
      spaceDown = true;
      mapArea.style.cursor = 'grab';
    }
    // Zoom shortcuts: + / - / 0
    if (!e.target.matches('input,textarea')) {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.25, ...mapAreaCenter()); }
      if (e.key === '-')                  { e.preventDefault(); zoomAt(1 / 1.25, ...mapAreaCenter()); }
      if (e.key === '0')                  { e.preventDefault(); resetZoom(); }
    }
    // ESC disabled - user must explicitly click Done or Cancel
  });

  // ── Terrain buttons ────────────────────────────────────────────────────────
  terrainBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      terrainBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTerrain = btn.dataset.terrain;
    });
  });

  // ── Brush buttons ──────────────────────────────────────────────────────────
  // Attach listener to the static "Solid" brush button in HTML
  const solidBtn = document.querySelector('[data-brush="solid"]');
  if (solidBtn) {
    solidBtn.addEventListener('click', () => {
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.classList.remove('active'));
      solidBtn.classList.add('active');
      currentBrushId = 'solid';
      updateSpacingVisibility();
    });
  }
  // Other brush buttons are created dynamically with listeners attached during creation

  function updateSpacingVisibility() {
    const brush = brushCache[currentBrushId];
    // Show spacing slider only for custom brushes (myb/abr)
    if (brush && (brush.type === 'myb' || brush.type === 'abr')) {
      spacingRow.style.display = 'flex';
    } else {
      spacingRow.style.display = 'none';
    }
  }

  brushSlider.addEventListener('input', () => {
    brushSize = parseInt(brushSlider.value);
    brushVal.textContent = brushSize;
  });

  spacingSlider.addEventListener('input', () => {
    brushSpacing = parseInt(spacingSlider.value);
    spacingVal.textContent = brushSpacing + '%';
  });

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  clearBtn.addEventListener('click', () => {
    const layer = paintLayers.find(l => l.id === currentLayerId);
    if (!layer) return;
    if (!confirm(`Clear layer "${layer.name}"?`)) return;
    saveHistory();
    layer.canvas.getContext('2d').clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    hasChanges = true;
    updateLayerThumbnail(currentLayerId);
    updateLayersList();
    redraw();
  });

  // ── Layers management ──────────────────────────────────────────────────────
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function updateLayersList() {
    if (!layersList) return;
    
    let html = '';
    
    // Paint layers (in reverse order - top to bottom)
    for (let i = paintLayers.length - 1; i >= 0; i--) {
      const layer = paintLayers[i];
      const isSelected = currentLayerId === layer.id;
      const jaggedActive = layer.jaggedEdges?.enabled ? 'active' : '';
      
      // Generate thumbnail
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 32;
      thumbCanvas.height = 32;
      const thumbCtx = thumbCanvas.getContext('2d');
      
      // Scale layer canvas to thumbnail
      const scale = Math.min(32 / layer.canvas.width, 32 / layer.canvas.height);
      const w = layer.canvas.width * scale;
      const h = layer.canvas.height * scale;
      const x = (32 - w) / 2;
      const y = (32 - h) / 2;
      
      // Checkerboard background for transparency
      thumbCtx.fillStyle = '#fff';
      thumbCtx.fillRect(0, 0, 32, 32);
      thumbCtx.fillStyle = '#ddd';
      for (let ty = 0; ty < 32; ty += 8) {
        for (let tx = 0; tx < 32; tx += 8) {
          if ((tx / 8 + ty / 8) % 2 === 0) thumbCtx.fillRect(tx, ty, 8, 8);
        }
      }
      
      thumbCtx.drawImage(layer.canvas, x, y, w, h);
      const thumbUrl = thumbCanvas.toDataURL();
      
      html += `
        <div class="layer-item ${isSelected ? 'selected' : ''}" 
             data-layer-id="${layer.id}" 
             data-layer-type="paint"
             data-layer-index="${i}"
             draggable="true">
          <img src="${thumbUrl}" 
               style="width:32px;height:32px;border-radius:3px;border:1px solid var(--border);flex-shrink:0;" 
               alt="Layer preview">
          <button class="layer-btn layer-visibility-btn" data-layer-id="${layer.id}" title="${layer.visible ? 'Hide' : 'Show'}">
            ${layer.visible ? 
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' :
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            }
          </button>
          <div style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer;" class="layer-select" data-layer-id="${layer.id}">
            <span style="font-size:0.78rem;" id="layerName${layer.id}">${escapeHtml(layer.name)}</span>
            ${layer.locked ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : ''}
          </div>
          <button class="layer-btn layer-jagged-btn ${jaggedActive}" data-layer-id="${layer.id}" title="Jagged edges">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <text x="2" y="18" font-family="serif" font-size="16" font-style="italic" fill="currentColor" stroke="none">fx</text>
            </svg>
          </button>
          <button class="layer-btn layer-rename-btn" data-layer-id="${layer.id}" title="Rename">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="layer-btn layer-lock-btn" data-layer-id="${layer.id}" title="${layer.locked ? 'Unlock' : 'Lock'}">
            ${layer.locked ?
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' :
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'
            }
          </button>
          <button class="layer-btn layer-delete-btn" data-layer-id="${layer.id}" title="Delete" ${paintLayers.length === 1 ? 'disabled style="opacity:0.3"' : ''}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>`;
    }
    
    // Rivers section
    const rivers = riverLayer.rivers;
    const currentRiver = riverLayer.currentRiver;
    
    if (rivers.length > 0 || currentRiver) {
      html += '<div style="border-top:1px solid var(--border);margin:4px 0;padding-top:4px;"></div>';
      
      // Show completed rivers
      rivers.forEach((river, idx) => {
        const isSelected = selectedRiverId === idx;
        html += `
          <div class="layer-item ${isSelected ? 'selected' : ''}" data-river-id="${idx}">
            <div style="flex:1;display:flex;align-items:center;gap:6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12c0-2.5 2-4 4-4s4 1.5 4 4-2 4-4 4-4-1.5-4-4z"/>
                <path d="M11 12c0-2.5 2-4 4-4s4 1.5 4 4-2 4-4 4-4-1.5-4-4z"/>
              </svg>
              <span style="font-size:0.78rem;">River ${idx + 1}</span>
              <span style="font-size:0.7rem;color:var(--muted);">(${river.controlPoints.length} pts)</span>
            </div>
            <button class="layer-btn river-edit-btn" data-river-id="${idx}" title="Edit">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="layer-btn river-delete-btn" data-river-id="${idx}" title="Delete">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>`;
      });
      
      // Show current river being edited
      if (currentRiver) {
        html += `
          <div class="layer-item editing">
            <div style="flex:1;display:flex;align-items:center;gap:6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12c0-2.5 2-4 4-4s4 1.5 4 4-2 4-4 4-4-1.5-4-4z"/>
                <path d="M11 12c0-2.5 2-4 4-4s4 1.5 4 4-2 4-4 4-4-1.5-4-4z"/>
              </svg>
              <span style="font-size:0.78rem;color:var(--accent);">Editing...</span>
              <span style="font-size:0.7rem;color:var(--muted);">(${currentRiver.controlPoints.length} pts)</span>
            </div>
          </div>`;
      }
    }
    
    if (!html) {
      html = '<div style="font-size:0.75rem;color:var(--muted);padding:8px;text-align:center;">No layers yet</div>';
    }
    
    layersList.innerHTML = html;
    
    // Attach event listeners using event delegation
    attachLayerEventListeners();
    attachDragAndDrop();
  }
  
  function attachLayerEventListeners() {
    const list = document.getElementById('paintLayersList');
    if (!list) return;
    
    // Layer selection
    list.querySelectorAll('.layer-select').forEach(el => {
      el.addEventListener('click', () => {
        const layerId = parseInt(el.dataset.layerId);
        currentLayerId = layerId;
        
        // If jagged edges panel is open, switch to new layer's settings
        if (jaggedPanel && jaggedPanel.style.display !== 'none' && currentJaggedLayerId !== null) {
          openJaggedEdgesPanel(layerId);
        }
        
        updateLayersList();
      });
    });
    
    // Layer visibility toggle
    list.querySelectorAll('.layer-visibility-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const layerId = parseInt(el.dataset.layerId);
        const layer = paintLayers.find(l => l.id === layerId);
        if (layer) {
          layer.visible = !layer.visible;
          updateLayersList();
          redraw();
        }
      });
    });
    
    // Layer lock toggle
    list.querySelectorAll('.layer-lock-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const layerId = parseInt(el.dataset.layerId);
        const layer = paintLayers.find(l => l.id === layerId);
        if (layer) {
          layer.locked = !layer.locked;
          updateLayersList();
        }
      });
    });
    
    // Jagged edges toggle
    list.querySelectorAll('.layer-jagged-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const layerId = parseInt(el.dataset.layerId);
        currentLayerId = layerId; // Switch to this layer
        openJaggedEdgesPanel(layerId);
        updateLayersList(); // Update selection highlight
      });
    });
    
    // Layer rename
    list.querySelectorAll('.layer-rename-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const layerId = parseInt(el.dataset.layerId);
        const layer = paintLayers.find(l => l.id === layerId);
        if (!layer) return;
        const newName = prompt('Enter new layer name:', layer.name);
        if (newName && newName.trim()) {
          layer.name = newName.trim();
          updateLayersList();
        }
      });
    });
    
    // Layer delete
    list.querySelectorAll('.layer-delete-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (paintLayers.length === 1) return;
        const layerId = parseInt(el.dataset.layerId);
        if (!confirm('Delete this layer?')) return;
        saveHistory();
        const idx = paintLayers.findIndex(l => l.id === layerId);
        if (idx !== -1) {
          paintLayers.splice(idx, 1);
          if (currentLayerId === layerId) {
            currentLayerId = paintLayers[Math.max(0, idx - 1)].id;
          }
          hasChanges = true;
          updateLayersList();
          redraw();
        }
      });
    });
    
    // River edit
    list.querySelectorAll('.river-edit-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const riverId = parseInt(el.dataset.riverId);
        editRiverFunc(riverId);
      });
    });
    
    // River delete
    list.querySelectorAll('.river-delete-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const riverId = parseInt(el.dataset.riverId);
        if (!confirm('Delete this river?')) return;
        saveHistory();
        riverLayer.removeRiver(riverId);
        if (selectedRiverId === riverId) selectedRiverId = null;
        hasChanges = true;
        updateLayersList();
        redraw();
      });
    });
    
    // River selection
    list.querySelectorAll('[data-river-id]').forEach(el => {
      if (!el.classList.contains('river-edit-btn') && !el.classList.contains('river-delete-btn')) {
        el.addEventListener('click', () => {
          const riverId = parseInt(el.dataset.riverId);
          if (!isNaN(riverId)) {
            editRiverFunc(riverId);
          }
        });
      }
    });
  }
  
  // ── Drag and drop for layer reordering ─────────────────────────────────────
  let draggedLayerIndex = null;
  
  function attachDragAndDrop() {
    const layerItems = layersList.querySelectorAll('.layer-item[draggable="true"]');
    
    layerItems.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const displayedIndex = parseInt(item.dataset.layerIndex);
        // Convert displayed index to model index (layers are rendered in reverse)
        draggedLayerIndex = paintLayers.length - 1 - displayedIndex;
        item.style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
      });
      
      item.addEventListener('dragend', (e) => {
        item.style.opacity = '1';
        draggedLayerIndex = null;
        // Remove all drag-over styles
        layerItems.forEach(i => i.style.borderTop = '');
      });
      
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        if (draggedLayerIndex === null) return;
        
        const displayedTargetIndex = parseInt(item.dataset.layerIndex);
        const targetIndex = paintLayers.length - 1 - displayedTargetIndex;
        if (draggedLayerIndex === targetIndex) return;
        
        // Visual feedback
        layerItems.forEach(i => i.style.borderTop = '');
        item.style.borderTop = '2px solid var(--accent)';
      });
      
      item.addEventListener('dragleave', (e) => {
        item.style.borderTop = '';
      });
      
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.style.borderTop = '';
        
        if (draggedLayerIndex === null) return;
        
        const displayedTargetIndex = parseInt(item.dataset.layerIndex);
        // Convert displayed index to model index
        const targetIndex = paintLayers.length - 1 - displayedTargetIndex;
        if (draggedLayerIndex === targetIndex) return;
        
        // Reorder layers array using model indices
        const draggedLayer = paintLayers[draggedLayerIndex];
        paintLayers.splice(draggedLayerIndex, 1);
        paintLayers.splice(targetIndex, 0, draggedLayer);
        
        hasChanges = true;
        updateLayersList();
        redraw();
      });
    });
  }
  
  function editRiverFunc(riverId) {
    selectedRiverId = riverId;
    const river = riverLayer.rivers[riverId];
    if (!river) return;
    
    // Enter river mode if not already
    if (!riverMode) {
      riverMode = true;
      riverModeBtn.classList.add('active');
      riverControlsRow.style.display = 'block';
      document.querySelectorAll('#paintTerrainBtns .paint-btn').forEach(b => b.style.opacity = '0.3');
      document.querySelectorAll('#paintBrushBtns .paint-brush-btn').forEach(b => b.style.opacity = '0.3');
      document.getElementById('paintBrushSlider').disabled = true;
      document.getElementById('paintBrushSlider').style.opacity = '0.3';
    }
    
    // Load river settings
    riverWindinessSlider.value = river.windiness;
    riverWindinessVal.textContent = Math.round(river.windiness * 100) + '%';
    riverWidthSlider.value = river.width;
    riverWidthVal.textContent = river.width;
    riverWindiness = river.windiness;
    riverWidth = river.width;
    
    updateLayersList();
    redraw();
  }
  
  function addNewLayerFunc() {
    saveHistory();
    const layer = {
      id: layerIdCounter++,
      name: `Layer ${layerIdCounter}`,
      canvas: document.createElement('canvas'),
      visible: true,
      locked: false,
      jaggedEdges: { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345, depth: 20 }
    };
    layer.canvas.width = outCanvas.width;
    layer.canvas.height = outCanvas.height;
    paintLayers.push(layer);
    currentLayerId = layer.id;
    hasChanges = true;
    updateLayersList();
  }
  
  // Expose addNewLayer globally for the + button
  window.addNewLayer = addNewLayerFunc;

  // ── Done / Cancel ──────────────────────────────────────────────────────────
  function hasUnsavedChanges() {
    // Check if any changes were made during this session
    return hasChanges;
  }

  function applyAndClose() {
    // Finish any river being edited
    if (riverLayer.currentRiver) {
      riverLayer.finishRiver();
    }
    
    // Composite all layers to paintCanvas (with jagged edges applied)
    const pc = paintCanvas.getContext('2d');
    pc.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    for (const layer of paintLayers) {
      if (layer.visible) {
        const layerCanvas = applyJaggedEdges(layer);
        pc.drawImage(layerCanvas, 0, 0);
      }
    }
    
    // Apply to outCanvas
    outCanvas.getContext('2d').drawImage(paintCanvas, 0, 0);
    
    // Apply rivers (without control points since selectedRiverId is not passed)
    if (riverCanvas) {
      const rCtx = riverCanvas.getContext('2d');
      rCtx.clearRect(0, 0, riverCanvas.width, riverCanvas.height);
      riverLayer.render(rCtx, WATER_COLOR);
      outCanvas.getContext('2d').drawImage(riverCanvas, 0, 0);
      paintCanvas.getContext('2d').drawImage(riverCanvas, 0, 0);
    }
    
    hasChanges = false;
    riverMode = false;
    fillMode = false;
    riverModeBtn.classList.remove('active');
    fillModeBtn.classList.remove('active');
    riverControlsRow.style.display = 'none';
    window.riverStartPoint = null;
    selectedRiverId = null;
    closeJaggedEdgesPanel();
    modal.classList.remove('open');
    onPaintApplied();
  }

  function cancelAndClose() {
    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to discard them?');
      if (!confirmed) return;
    }
    
    // Restore layers
    if (cancelLayersData) {
      paintLayers = cancelLayersData.map(l => ({
        ...l,
        jaggedEdges: l.jaggedEdges ? { ...l.jaggedEdges } : { enabled: false, intensity: 8, frequency: 1.2, scale: 1.5, algorithm: 'fractal', seed: 12345, depth: 20 },
        canvas: (() => {
          const c = document.createElement('canvas');
          c.width = l.canvas.width;
          c.height = l.canvas.height;
          c.getContext('2d').drawImage(l.canvas, 0, 0);
          return c;
        })()
      }));
      currentLayerId = cancelLayersData.find(l => l.id === currentLayerId)?.id || paintLayers[0]?.id;
    }
    
    // Restore rivers
    if (cancelRiversData) {
      riverLayer.import(cancelRiversData);
    }
    
    hasChanges = false;
    riverMode = false;
    fillMode = false;
    riverModeBtn.classList.remove('active');
    fillModeBtn.classList.remove('active');
    riverControlsRow.style.display = 'none';
    window.riverStartPoint = null;
    selectedRiverId = null;
    updateLayersList();
    modal.classList.remove('open');
  }

  doneBtn.addEventListener('click',   applyAndClose);
  cancelBtn.addEventListener('click', cancelAndClose);
  closeBtn.addEventListener('click',  cancelAndClose);

  return { open, reset };
}
