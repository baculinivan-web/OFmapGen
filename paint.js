// paint.js — Fullscreen terrain paint modal
export function initPaint({ outCanvas, onPaintApplied }) {

  // Off-screen canvas storing committed paint strokes
  let paintCanvas = null;

  const TERRAIN_COLORS = {
    water:    [18,  15,  34],
    plain:    [140, 170, 88],
    highland: [176, 159, 114],
    mountain: [190, 190, 190],
  };

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const modal        = document.getElementById('paintModal');
  const mapArea      = document.getElementById('paintMapArea');
  const canvas       = document.getElementById('paintCanvas');
  const ctx          = canvas.getContext('2d');
  const brushSlider  = document.getElementById('paintBrushSlider');
  const brushVal     = document.getElementById('paintBrushVal');
  const clearBtn     = document.getElementById('paintClearBtn');
  const doneBtn      = document.getElementById('paintDoneBtn');
  const cancelBtn    = document.getElementById('paintCancelBtn');
  const closeBtn     = document.getElementById('paintModalClose');
  const terrainBtns  = document.querySelectorAll('#paintTerrainBtns .paint-btn');

  let currentTerrain = 'water';
  let brushSize = 16;
  let painting = false;
  let lastX = null, lastY = null;
  // snapshot before opening (for cancel)
  let snapshot = null;

  // ── Open modal ─────────────────────────────────────────────────────────────
  function open() {
    if (!outCanvas.width) return;
    ensurePaintCanvas();
    // snapshot current paint for cancel
    snapshot = document.createElement('canvas');
    snapshot.width  = paintCanvas.width;
    snapshot.height = paintCanvas.height;
    snapshot.getContext('2d').drawImage(paintCanvas, 0, 0);

    modal.classList.add('open');
    requestAnimationFrame(fitCanvas);
  }

  // ── Fit canvas to area, draw outCanvas + paint layer ──────────────────────
  function fitCanvas() {
    const ar = mapArea.getBoundingClientRect();
    const scaleX = ar.width  / outCanvas.width;
    const scaleY = ar.height / outCanvas.height;
    const scale  = Math.min(scaleX, scaleY, 1); // never upscale beyond 1:1 for perf
    const dispW  = Math.floor(outCanvas.width  * scale);
    const dispH  = Math.floor(outCanvas.height * scale);
    canvas.width  = outCanvas.width;
    canvas.height = outCanvas.height;
    canvas.style.width  = dispW + 'px';
    canvas.style.height = dispH + 'px';
    redraw();
  }

  function redraw() {
    ctx.drawImage(outCanvas, 0, 0);
    if (paintCanvas) ctx.drawImage(paintCanvas, 0, 0);
  }

  new ResizeObserver(() => {
    if (modal.classList.contains('open')) fitCanvas();
  }).observe(mapArea);

  // ── Ensure paint canvas matches outCanvas ──────────────────────────────────
  function ensurePaintCanvas() {
    if (paintCanvas &&
        paintCanvas.width  === outCanvas.width &&
        paintCanvas.height === outCanvas.height) return;
    paintCanvas = document.createElement('canvas');
    paintCanvas.width  = outCanvas.width;
    paintCanvas.height = outCanvas.height;
  }

  // ── Convert pointer → canvas pixel coords ─────────────────────────────────
  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [
      Math.round((clientX - rect.left) * outCanvas.width  / rect.width),
      Math.round((clientY - rect.top)  * outCanvas.height / rect.height),
    ];
  }

  // ── Paint helpers ──────────────────────────────────────────────────────────
  function paintAt(px, py) {
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
    const steps = Math.max(1, Math.ceil(dist / (brushSize * 0.4)));
    for (let i = 0; i <= steps; i++) {
      paintAt(x0 + dx * (i / steps), y0 + dy * (i / steps));
    }
  }

  // ── Pointer events on canvas ───────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
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

  // ── Terrain buttons ────────────────────────────────────────────────────────
  terrainBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      terrainBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTerrain = btn.dataset.terrain;
    });
  });

  // ── Brush slider ───────────────────────────────────────────────────────────
  brushSlider.addEventListener('input', () => {
    brushSize = parseInt(brushSlider.value);
    brushVal.textContent = brushSize;
  });

  // ── Clear ──────────────────────────────────────────────────────────────────
  clearBtn.addEventListener('click', () => {
    if (paintCanvas) paintCanvas.getContext('2d').clearRect(0, 0, paintCanvas.width, paintCanvas.height);
    redraw();
  });

  // ── Done — apply paint to outCanvas and close ──────────────────────────────
  function applyAndClose() {
    if (paintCanvas) {
      outCanvas.getContext('2d').drawImage(paintCanvas, 0, 0);
    }
    modal.classList.remove('open');
    onPaintApplied();
  }

  // ── Cancel — restore snapshot ──────────────────────────────────────────────
  function cancelAndClose() {
    if (snapshot && paintCanvas) {
      paintCanvas.getContext('2d').clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      paintCanvas.getContext('2d').drawImage(snapshot, 0, 0);
    }
    modal.classList.remove('open');
  }

  doneBtn.addEventListener('click',   applyAndClose);
  cancelBtn.addEventListener('click', cancelAndClose);
  closeBtn.addEventListener('click',  cancelAndClose);

  // ── Public API ─────────────────────────────────────────────────────────────
  return { open };
}
