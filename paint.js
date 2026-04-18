// paint.js — Fullscreen terrain paint modal
// Version: 2024-01-19-v3 (with rivers)
import { parseMybBrush, MybBrushState, mybPaintSegment, mybPaintDot } from './myb-engine.js';
import { loadAbrFromArrayBuffer } from 'https://unpkg.com/abr-js@0.1.1/dist/abr.esm.js';
import { RiverLayer } from './rivers.js';

console.log('[paint.js] Module loading - Version 2024-01-19-v3 (with rivers)');

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
  const riverWindinessSlider = document.getElementById('paintRiverWindinessSlider');
  const riverWindinessVal = document.getElementById('paintRiverWindinessVal');
  const riverWidthSlider = document.getElementById('paintRiverWidthSlider');
  const riverWidthVal = document.getElementById('paintRiverWidthVal');
  const riverFinishBtn = document.getElementById('paintRiverFinishBtn');
  const riverCancelBtn = document.getElementById('paintRiverCancelBtn');
  const riverControlsRow = document.getElementById('paintRiverControls');

  let currentTerrain = 'water';
  let brushSize = 16;
  let brushSpacing = 25; // % of brush size for custom brushes
  let painting = false;
  let lastX = null, lastY = null;
  let lastAngle = 0;
  let cancelSnapshot = null;
  let hasChanges = false; // Track if any changes were made
  
  // River mode state
  let riverMode = false;
  let riverLayer = new RiverLayer();
  let riverCanvas = null; // Separate canvas for river layer
  let riverWindiness = 0.5;
  let riverWidth = 3;

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
    updateUndoRedoBtns();
  }

  function undo() {
    if (!undoStack.length) return;
    const pc = paintCanvas.getContext('2d');
    redoStack.push(pc.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    pc.putImageData(undoStack.pop(), 0, 0);
    redraw(); updateUndoRedoBtns();
  }

  function redo() {
    if (!redoStack.length) return;
    const pc = paintCanvas.getContext('2d');
    undoStack.push(pc.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    pc.putImageData(redoStack.pop(), 0, 0);
    redraw(); updateUndoRedoBtns();
  }

  function updateUndoRedoBtns() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
    undoBtn.style.opacity = undoStack.length ? '1' : '0.35';
    redoBtn.style.opacity = redoStack.length ? '1' : '0.35';
  }

  // ── Ensure paint canvas ────────────────────────────────────────────────────
  function ensurePaintCanvas() {
    if (paintCanvas && paintCanvas.width === outCanvas.width && paintCanvas.height === outCanvas.height) return;
    paintCanvas = document.createElement('canvas');
    paintCanvas.width  = outCanvas.width;
    paintCanvas.height = outCanvas.height;
    
    // Create river canvas
    riverCanvas = document.createElement('canvas');
    riverCanvas.width = outCanvas.width;
    riverCanvas.height = outCanvas.height;
    
    undoStack = []; redoStack = [];
  }

  // ── Fit / redraw ───────────────────────────────────────────────────────────
  function fitCanvas() {
    const ar = mapArea.getBoundingClientRect();
    if (!ar.width || !ar.height || !outCanvas.width) return;
    const scale = Math.min(ar.width / outCanvas.width, ar.height / outCanvas.height);
    canvas.width  = outCanvas.width;
    canvas.height = outCanvas.height;
    canvas.style.width   = Math.floor(outCanvas.width  * scale) + 'px';
    canvas.style.height  = Math.floor(outCanvas.height * scale) + 'px';
    canvas.style.margin  = 'auto';
    canvas.style.display = 'block';
    redraw();
  }

  function redraw() {
    if (!outCanvas.width) return;
    ctx.drawImage(outCanvas, 0, 0);
    if (paintCanvas) ctx.drawImage(paintCanvas, 0, 0);
    if (riverCanvas) {
      // Render rivers to river canvas
      const rCtx = riverCanvas.getContext('2d');
      rCtx.clearRect(0, 0, riverCanvas.width, riverCanvas.height);
      riverLayer.render(rCtx, WATER_COLOR);
      ctx.drawImage(riverCanvas, 0, 0);
    }
  }

  new ResizeObserver(() => { if (modal.classList.contains('open')) fitCanvas(); }).observe(mapArea);

  // ── Open ───────────────────────────────────────────────────────────────────
  function open() {
    console.log('[paint] modal opening...');
    if (!outCanvas.width) return;
    ensurePaintCanvas();
    cancelSnapshot = document.createElement('canvas');
    cancelSnapshot.width  = paintCanvas.width;
    cancelSnapshot.height = paintCanvas.height;
    cancelSnapshot.getContext('2d').drawImage(paintCanvas, 0, 0);
    undoStack = []; redoStack = [];
    hasChanges = false; // Reset changes flag on open
    riverMode = false;
    riverModeBtn.classList.remove('active');
    riverControlsRow.style.display = 'none';
    riverLayer.clearAll();
    window.riverStartPoint = null;
    updateUndoRedoBtns();
    modal.classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(fitCanvas));
    
    // Load default brushes on first open
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

  // ── Paint dispatch ─────────────────────────────────────────────────────────
  function getPaintCtx() { return paintCanvas.getContext('2d'); }

  function paintDot(px, py) {
    const rgb = TERRAIN_COLORS[currentTerrain];
    const brush = brushCache[currentBrushId];
    
    if (currentBrushId === 'solid') {
      const pc = getPaintCtx();
      pc.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      pc.beginPath();
      pc.arc(px, py, brushSize, 0, Math.PI * 2);
      pc.fill();
    } else if (brush && brush.type === 'myb' && mybState) {
      mybPaintDot(getPaintCtx(), mybState, px, py, brushSize, rgb);
    } else if (brush && brush.type === 'abr') {
      abrPaintDot(getPaintCtx(), brush.abrBrush, px, py, brushSize, rgb);
    }
  }

  function paintSegment(x0, y0, x1, y1) {
    const rgb = TERRAIN_COLORS[currentTerrain];
    const brush = brushCache[currentBrushId];
    
    if (currentBrushId === 'solid') {
      const pc = getPaintCtx();
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
      mybPaintSegment(getPaintCtx(), mybState, x0, y0, x1, y1, brushSize, brushSpacing, rgb);
    } else if (brush && brush.type === 'abr') {
      abrPaintSegment(getPaintCtx(), brush.abrBrush, x0, y0, x1, y1, brushSize, brushSpacing, rgb);
    }
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
  function toggleRiverMode() {
    riverMode = !riverMode;
    riverModeBtn.classList.toggle('active', riverMode);
    riverControlsRow.style.display = riverMode ? 'block' : 'none';
    
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
        redraw();
      }
    }
  }
  
  riverModeBtn.addEventListener('click', toggleRiverMode);
  
  riverWindinessSlider.addEventListener('input', () => {
    riverWindiness = parseFloat(riverWindinessSlider.value);
    riverWindinessVal.textContent = Math.round(riverWindiness * 100) + '%';
    riverLayer.setWindiness(riverWindiness);
    redraw();
  });
  
  riverWidthSlider.addEventListener('input', () => {
    riverWidth = parseInt(riverWidthSlider.value);
    riverWidthVal.textContent = riverWidth;
    riverLayer.setWidth(riverWidth);
    redraw();
  });
  
  riverFinishBtn.addEventListener('click', () => {
    if (riverLayer.currentRiver) {
      saveHistory();
      riverLayer.finishRiver();
      hasChanges = true;
      redraw();
    }
  });
  
  riverCancelBtn.addEventListener('click', () => {
    if (riverLayer.currentRiver) {
      riverLayer.cancelRiver();
      redraw();
    }
  });

  // ── Pointer events ─────────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    
    const [x, y] = toCanvasCoords(e);
    
    // River mode: place control points
    if (riverMode) {
      if (!riverLayer.currentRiver) {
        // Need start and end points first
        if (!window.riverStartPoint) {
          window.riverStartPoint = { x, y };
          // Show temporary marker
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
          // Create river with start and end
          riverLayer.startRiver(window.riverStartPoint, { x, y }, riverWindiness, riverWidth);
          window.riverStartPoint = null;
          redraw();
          return;
        }
      } else {
        // Add control point to existing river
        riverLayer.addControlPoint({ x, y });
        redraw();
        return;
      }
    }
    
    // Normal paint mode
    saveHistory();
    painting = true;
    lastX = x; lastY = y;
    // Init MYB state for this stroke (only for myb brushes)
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
    if (riverMode) return; // No drag in river mode
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
  });
  canvas.addEventListener('mouseleave', () => { 
    painting = false; 
    mybState = null; 
  });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    
    const [x, y] = toCanvasCoords(e);
    
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
  });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!modal.classList.contains('open')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
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
    saveHistory();
    paintCanvas.getContext('2d').clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    riverLayer.clearAll();
    redraw();
  });

  // ── Done / Cancel ──────────────────────────────────────────────────────────
  function hasUnsavedChanges() {
    // Check if any changes were made during this session
    return hasChanges;
  }

  function applyAndClose() {
    if (paintCanvas) outCanvas.getContext('2d').drawImage(paintCanvas, 0, 0);
    // Apply rivers to outCanvas
    if (riverCanvas) {
      const rCtx = riverCanvas.getContext('2d');
      rCtx.clearRect(0, 0, riverCanvas.width, riverCanvas.height);
      riverLayer.render(rCtx, WATER_COLOR);
      outCanvas.getContext('2d').drawImage(riverCanvas, 0, 0);
    }
    hasChanges = false; // Reset after applying
    riverMode = false;
    riverModeBtn.classList.remove('active');
    riverControlsRow.style.display = 'none';
    window.riverStartPoint = null;
    modal.classList.remove('open');
    onPaintApplied();
  }

  function cancelAndClose() {
    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to discard them?');
      if (!confirmed) return;
    }
    
    if (cancelSnapshot && paintCanvas) {
      const pc = paintCanvas.getContext('2d');
      pc.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      pc.drawImage(cancelSnapshot, 0, 0);
    }
    hasChanges = false; // Reset after canceling
    riverMode = false;
    riverModeBtn.classList.remove('active');
    riverControlsRow.style.display = 'none';
    riverLayer.clearAll();
    window.riverStartPoint = null;
    modal.classList.remove('open');
  }

  doneBtn.addEventListener('click',   applyAndClose);
  cancelBtn.addEventListener('click', cancelAndClose);
  closeBtn.addEventListener('click',  cancelAndClose);

  return { open };
}
