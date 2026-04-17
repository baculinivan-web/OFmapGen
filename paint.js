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
  const terrainBtns = document.querySelectorAll('#paintTerrainBtns .paint-btn');

  let currentTerrain = 'water';
  let brushSize = 16;
  let painting = false;
  let lastX = null, lastY = null;
  let snapshot = null;

  // ── Ensure paint canvas matches outCanvas ──────────────────────────────────
  function ensurePaintCanvas() {
    if (paintCanvas &&
        paintCanvas.width  === outCanvas.width &&
        paintCanvas.height === outCanvas.height) return;
    paintCanvas = document.createElement('canvas');
    paintCanvas.width  = outCanvas.width;
    paintCanvas.height = outCanvas.height;
  }

  // ── Fit display canvas to mapArea, keeping aspect ratio ───────────────────
  function fitCanvas() {
    const ar = mapArea.getBoundingClientRect();
    if (!ar.width || !ar.height || !outCanvas.width) return;

    const scaleX = ar.width  / outCanvas.width;
    const scaleY = ar.height / outCanvas.height;
    const scale  = Math.min(scaleX, scaleY);
    const dispW  = Math.floor(outCanvas.width  * scale);
    const dispH  = Math.floor(outCanvas.height * scale);

    // Set logical resolution
    canvas.width  = outCanvas.width;
    canvas.height = outCanvas.height;

    // Set display size and center via margin (no transform)
    canvas.style.position = 'relative';
    canvas.style.display  = 'block';
    canvas.style.width    = dispW + 'px';
    canvas.style.height   = dispH + 'px';
    canvas.style.margin   = 'auto';
    canvas.style.top      = '';
    canvas.style.left     = '';
    canvas.style.transform = '';

    redraw();
  }

  function redraw() {
    if (!outCanvas.width) return;
    ctx.drawImage(outCanvas, 0, 0);
    if (paintCanvas) ctx.drawImage(paintCanvas, 0, 0);
  }

  // Keep canvas fitted when area resizes
  new ResizeObserver(() => {
    if (modal.classList.contains('open')) fitCanvas();
  }).observe(mapArea);

  // ── Open modal ─────────────────────────────────────────────────────────────
  function open() {
    if (!outCanvas.width) return;
    ensurePaintCanvas();

    // snapshot for cancel
    snapshot = document.createElement('canvas');
    snapshot.width  = paintCanvas.width;
    snapshot.height = paintCanvas.height;
    snapshot.getContext('2d').drawImage(paintCanvas, 0, 0);

    modal.classList.add('open');

    // Wait two frames so the modal is fully laid out before measuring
    requestAnimationFrame(() => requestAnimationFrame(fitCanvas));
  }

  // ── Convert pointer event → outCanvas pixel coords ────────────────────────
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

  // ── Pointer events ─────────────────────────────────────────────────────────
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
    if (paintCanvas) {
      paintCanvas.getContext('2d').clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      redraw();
    }
  });

  // ── Done — bake paint into outCanvas ──────────────────────────────────────
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
      const pc = paintCanvas.getContext('2d');
      pc.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      pc.drawImage(snapshot, 0, 0);
    }
    modal.classList.remove('open');
  }

  doneBtn.addEventListener('click',   applyAndClose);
  cancelBtn.addEventListener('click', cancelAndClose);
  closeBtn.addEventListener('click',  cancelAndClose);

  return { open };
}
