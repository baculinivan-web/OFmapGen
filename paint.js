// paint.js — Fullscreen terrain paint modal
import { parseMybBrush, MybBrushState, mybPaintSegment, mybPaintDot } from './myb-engine.js';

export function initPaint({ outCanvas, onPaintApplied }) {

  let paintCanvas = null;

  const TERRAIN_COLORS = {
    water:    [18,  15,  34],
    plain:    [140, 170, 88],
    highland: [176, 159, 114],
    mountain: [190, 190, 190],
  };

  // Built-in brush presets (loaded from ./brushes/)
  const BRUSH_PRESETS = [
    { id: 'solid',      label: 'Solid',       file: null },
    { id: 'soft-round', label: 'Soft Round',  file: './brushes/soft-round.myb' },
    { id: 'hard-round', label: 'Hard Round',  file: './brushes/hard-round.myb' },
    { id: 'dunes',      label: 'Dunes',       file: './brushes/dunes.myb' },
  ];

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const modal       = document.getElementById('paintModal');
  const mapArea     = document.getElementById('paintMapArea');
  const canvas      = document.getElementById('paintCanvas');
  const ctx         = canvas.getContext('2d');
  const brushSlider = document.getElementById('paintBrushSlider');
  const brushVal    = document.getElementById('paintBrushVal');
  const clearBtn    = document.getElementById('paintClearBtn');
  const doneBtn     = document.getElementById('paintDoneBtn');
  const cancelBtn   = document.getElementById('paintCancelBtn');
  const closeBtn    = document.getElementById('paintModalClose');
  const undoBtn     = document.getElementById('paintUndoBtn');
  const redoBtn     = document.getElementById('paintRedoBtn');
  const terrainBtns = document.querySelectorAll('#paintTerrainBtns .paint-btn');
  const brushBtns   = document.querySelectorAll('#paintBrushBtns .paint-brush-btn');

  let currentTerrain = 'water';
  let brushSize = 16;
  let painting = false;
  let lastX = null, lastY = null;
  let lastAngle = 0;
  let cancelSnapshot = null;

  // ── Brush state ────────────────────────────────────────────────────────────
  let currentBrushId = 'solid';
  // Cache of loaded MYB params keyed by preset id
  const brushCache = {};
  // Active MybBrushState for current stroke
  let mybState = null;

  // Pre-load all MYB presets
  async function loadBrushPresets() {
    for (const preset of BRUSH_PRESETS) {
      if (!preset.file) continue;
      try {
        const res = await fetch(preset.file);
        const myb = await res.json();
        brushCache[preset.id] = parseMybBrush(myb);
      } catch (e) {
        console.warn(`[paint] Failed to load brush ${preset.id}:`, e);
      }
    }
  }
  loadBrushPresets();

  // ── Undo / Redo ────────────────────────────────────────────────────────────
  const MAX_HISTORY = 30;
  let undoStack = [];
  let redoStack = [];

  function saveHistory() {
    const pc = paintCanvas.getContext('2d');
    undoStack.push(pc.getImageData(0, 0, paintCanvas.width, paintCanvas.height));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
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
  }

  new ResizeObserver(() => { if (modal.classList.contains('open')) fitCanvas(); }).observe(mapArea);

  // ── Open ───────────────────────────────────────────────────────────────────
  function open() {
    if (!outCanvas.width) return;
    ensurePaintCanvas();
    cancelSnapshot = document.createElement('canvas');
    cancelSnapshot.width  = paintCanvas.width;
    cancelSnapshot.height = paintCanvas.height;
    cancelSnapshot.getContext('2d').drawImage(paintCanvas, 0, 0);
    undoStack = []; redoStack = [];
    updateUndoRedoBtns();
    modal.classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(fitCanvas));
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
    if (currentBrushId === 'solid') {
      const pc = getPaintCtx();
      pc.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      pc.beginPath();
      pc.arc(px, py, brushSize, 0, Math.PI * 2);
      pc.fill();
    } else if (mybState) {
      mybPaintDot(getPaintCtx(), mybState, px, py, brushSize, rgb);
    }
  }

  function paintSegment(x0, y0, x1, y1) {
    const rgb = TERRAIN_COLORS[currentTerrain];
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
    } else if (mybState) {
      mybPaintSegment(getPaintCtx(), mybState, x0, y0, x1, y1, brushSize, rgb);
    }
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    saveHistory();
    painting = true;
    const [x, y] = toCanvasCoords(e);
    lastX = x; lastY = y;
    // Init MYB state for this stroke
    if (currentBrushId !== 'solid' && brushCache[currentBrushId]) {
      mybState = new MybBrushState(brushCache[currentBrushId]);
    } else {
      mybState = null;
    }
    paintDot(x, y);
    redraw();
  });

  canvas.addEventListener('mousemove', e => {
    if (!painting) return;
    e.preventDefault();
    const [x, y] = toCanvasCoords(e);
    const dx = x - lastX, dy = y - lastY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) lastAngle = Math.atan2(dy, dx);
    paintSegment(lastX, lastY, x, y);
    lastX = x; lastY = y;
    redraw();
  });

  canvas.addEventListener('mouseup',    () => { painting = false; mybState = null; });
  canvas.addEventListener('mouseleave', () => { painting = false; mybState = null; });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    saveHistory();
    painting = true;
    const [x, y] = toCanvasCoords(e);
    lastX = x; lastY = y;
    if (currentBrushId !== 'solid' && brushCache[currentBrushId]) {
      mybState = new MybBrushState(brushCache[currentBrushId]);
    } else {
      mybState = null;
    }
    paintDot(x, y);
    redraw();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (!painting) return;
    e.preventDefault();
    const [x, y] = toCanvasCoords(e);
    const dx = x - lastX, dy = y - lastY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) lastAngle = Math.atan2(dy, dx);
    paintSegment(lastX, lastY, x, y);
    lastX = x; lastY = y;
    redraw();
  }, { passive: false });

  canvas.addEventListener('touchend', () => { painting = false; mybState = null; });

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!modal.classList.contains('open')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    if (e.key === 'Escape') cancelAndClose();
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
  brushBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      brushBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBrushId = btn.dataset.brush;
    });
  });

  brushSlider.addEventListener('input', () => {
    brushSize = parseInt(brushSlider.value);
    brushVal.textContent = brushSize;
  });

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  clearBtn.addEventListener('click', () => {
    saveHistory();
    paintCanvas.getContext('2d').clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    redraw();
  });

  // ── Done / Cancel ──────────────────────────────────────────────────────────
  function applyAndClose() {
    if (paintCanvas) outCanvas.getContext('2d').drawImage(paintCanvas, 0, 0);
    modal.classList.remove('open');
    onPaintApplied();
  }

  function cancelAndClose() {
    if (cancelSnapshot && paintCanvas) {
      const pc = paintCanvas.getContext('2d');
      pc.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      pc.drawImage(cancelSnapshot, 0, 0);
    }
    modal.classList.remove('open');
  }

  doneBtn.addEventListener('click',   applyAndClose);
  cancelBtn.addEventListener('click', cancelAndClose);
  closeBtn.addEventListener('click',  cancelAndClose);

  return { open };
}
