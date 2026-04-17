// paint.js — Fullscreen terrain paint modal
export function initPaint({ outCanvas, onPaintApplied }) {

  let paintCanvas = null;

  const TERRAIN_COLORS = {
    water:    [18,  15,  34],
    plain:    [140, 170, 88],
    highland: [176, 159, 114],
    mountain: [190, 190, 190],
  };

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

  let currentTerrain = 'water';
  let brushSize = 16;
  let painting = false;
  let lastX = null, lastY = null;
  let cancelSnapshot = null;

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

  // ── Noise helpers (value noise, no deps) ──────────────────────────────────
  // Simple hash-based value noise — deterministic, no imports needed
  function hash(x, y) {
    let h = (x * 1619 + y * 31337) ^ ((x * 31337 + y * 1619) >> 4);
    h = (h ^ (h >> 16)) * 0x45d9f3b;
    h = (h ^ (h >> 16)) * 0x45d9f3b;
    return ((h ^ (h >> 16)) & 0xffff) / 0xffff; // 0..1
  }

  function smoothNoise(x, y, freq) {
    const fx = x * freq, fy = y * freq;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    // smoothstep
    const ux = tx * tx * (3 - 2 * tx);
    const uy = ty * ty * (3 - 2 * ty);
    const a = hash(ix,   iy);
    const b = hash(ix+1, iy);
    const c = hash(ix,   iy+1);
    const d = hash(ix+1, iy+1);
    return a + (b-a)*ux + (c-a)*uy + (d-a+a-b-c+b+c-d)*ux*uy;
    // simplified: lerp(lerp(a,b,ux), lerp(c,d,ux), uy)
  }

  function fbm(x, y) {
    // 3 octaves of value noise
    return smoothNoise(x, y, 0.08) * 0.5
         + smoothNoise(x, y, 0.18) * 0.3
         + smoothNoise(x, y, 0.40) * 0.2;
  }

  // ── Ridge brush — paints noisy highland/mountain/plain mix ────────────────
  // Writes directly to paintCanvas pixel-by-pixel within the brush circle
  function paintRidgeAt(cx, cy) {
    const pc = paintCanvas.getContext('2d');
    const r  = brushSize;
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(paintCanvas.width  - 1, Math.ceil(cx + r));
    const y1 = Math.min(paintCanvas.height - 1, Math.ceil(cy + r));
    const w  = x1 - x0 + 1;
    const h  = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;

    const imgData = pc.getImageData(x0, y0, w, h);
    const d = imgData.data;

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx, dy = py - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > r) continue;

        // Falloff: full coverage in center, fades at edge
        const falloff = 1 - (dist / r);

        // Only paint if noise + falloff passes threshold (creates patchy ridges)
        const n = fbm(px, py);

        // Ridge pattern: use noise to pick terrain zone
        // n < 0.35 → plain (valleys between ridges)
        // n < 0.60 → highland
        // n < 0.80 → mountain peak
        // n >= 0.80 → highland again (ridge shoulders)
        let col;
        if (n < 0.35) {
          col = TERRAIN_COLORS.plain;
        } else if (n < 0.60) {
          col = TERRAIN_COLORS.highland;
        } else if (n < 0.80) {
          col = TERRAIN_COLORS.mountain;
        } else {
          col = TERRAIN_COLORS.highland;
        }

        // Blend with existing pixel based on falloff
        const idx = ((py - y0) * w + (px - x0)) * 4;
        const alpha = Math.min(1, falloff * 1.4); // slightly aggressive blend
        d[idx]   = Math.round(d[idx]   * (1 - alpha) + col[0] * alpha);
        d[idx+1] = Math.round(d[idx+1] * (1 - alpha) + col[1] * alpha);
        d[idx+2] = Math.round(d[idx+2] * (1 - alpha) + col[2] * alpha);
        d[idx+3] = 255;
      }
    }
    pc.putImageData(imgData, x0, y0);
  }

  // ── Solid brush ────────────────────────────────────────────────────────────
  function paintAt(px, py) {
    if (currentTerrain === 'ridge') {
      paintRidgeAt(px, py);
      return;
    }
    const pc = paintCanvas.getContext('2d');
    const [r, g, b] = TERRAIN_COLORS[currentTerrain];
    pc.fillStyle = `rgb(${r},${g},${b})`;
    pc.beginPath();
    pc.arc(px, py, brushSize, 0, Math.PI * 2);
    pc.fill();
  }

  function paintLine(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Ridge brush needs denser steps since it's pixel-level
    const stepFactor = currentTerrain === 'ridge' ? 0.25 : 0.4;
    const steps = Math.max(1, Math.ceil(dist / (brushSize * stepFactor)));
    for (let i = 0; i <= steps; i++) {
      paintAt(x0 + dx * (i / steps), y0 + dy * (i / steps));
    }
  }

  // ── Pointer events ─────────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    saveHistory();
    painting = true;
    const [x, y] = toCanvasCoords(e);
    lastX = x; lastY = y;
    paintAt(x, y);
    redraw();
  });

  canvas.addEventListener('mousemove', e => {
    if (!painting) return;
    e.preventDefault();
    const [x, y] = toCanvasCoords(e);
    paintLine(lastX, lastY, x, y);
    lastX = x; lastY = y;
    redraw();
  });

  canvas.addEventListener('mouseup',    () => { painting = false; });
  canvas.addEventListener('mouseleave', () => { painting = false; });

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    saveHistory();
    painting = true;
    const [x, y] = toCanvasCoords(e);
    lastX = x; lastY = y;
    paintAt(x, y);
    redraw();
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (!painting) return;
    e.preventDefault();
    const [x, y] = toCanvasCoords(e);
    paintLine(lastX, lastY, x, y);
    lastX = x; lastY = y;
    redraw();
  }, { passive: false });

  canvas.addEventListener('touchend', () => { painting = false; });

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
