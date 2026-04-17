// draw.js — manual terrain painting module

const ZONE_COLORS = {
  water:    [18,  15,  34],
  plain:    [140, 170, 88],
  highland: [176, 159, 114],
  mountain: [190, 190, 190],
};

export function initDraw({ outCanvas, srcCanvas, imgInfo, setGisMode }) {
  const modal       = document.getElementById('drawModal');
  const drawCanvas  = document.getElementById('drawCanvas');
  const drawArea    = document.getElementById('drawArea');
  const brushSlider = document.getElementById('drawBrushSize');
  const brushVal    = document.getElementById('drawBrushVal');
  const undoBtn     = document.getElementById('drawUndoBtn');
  const clearBtn    = document.getElementById('drawClearBtn');
  const applyBtn    = document.getElementById('drawApplyBtn');
  const resizeBtn   = document.getElementById('drawResizeBtn');
  const closeBtn    = document.getElementById('drawModalClose');
  const closeBtn2   = document.getElementById('drawModalClose2');
  const widthInput  = document.getElementById('drawWidth');
  const heightInput = document.getElementById('drawHeight');
  const terrainBtns = document.querySelectorAll('.draw-terrain-btn');
  const openBtn     = document.getElementById('drawManuallyBtn');

  const ctx = drawCanvas.getContext('2d');

  let currentZone = 'water';
  let brushSize   = 12;
  let isDrawing   = false;
  let undoStack   = [];
  const MAX_UNDO  = 20;
  let scale = 1, offsetX = 0, offsetY = 0;
  let isPanning = false, panStartX = 0, panStartY = 0, panOX = 0, panOY = 0;
  let spaceDown = false;
  let currentPointerId = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function updateTrack(input, val) {
    const pct = val * 100;
    input.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
  }

  function fitToArea() {
    const ar = drawArea.getBoundingClientRect();
    if (!ar.width || !ar.height) return;
    scale   = Math.min((ar.width - 32) / drawCanvas.width, (ar.height - 32) / drawCanvas.height, 4);
    offsetX = (ar.width  - drawCanvas.width  * scale) / 2;
    offsetY = (ar.height - drawCanvas.height * scale) / 2;
    applyTransform();
  }

  function applyTransform() {
    drawCanvas.style.transform       = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    drawCanvas.style.transformOrigin = '0 0';
  }

  function initCanvas(w, h) {
    drawCanvas.width  = w;
    drawCanvas.height = h;
    const [r, g, b] = ZONE_COLORS.water;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);
    undoStack = [];
    fitToArea();
  }

  function pushUndo() {
    undoStack.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function paint(x, y) {
    const [r, g, b] = ZONE_COLORS[currentZone];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function canvasPoint(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (drawCanvas.width  / rect.width),
      y: (e.clientY - rect.top)  * (drawCanvas.height / rect.height),
    };
  }

  // ── Open / Close ───────────────────────────────────────────────────────────
  openBtn.addEventListener('click', () => {
    if (outCanvas.width && outCanvas.height) {
      drawCanvas.width  = outCanvas.width;
      drawCanvas.height = outCanvas.height;
      ctx.drawImage(outCanvas, 0, 0);
      widthInput.value  = outCanvas.width;
      heightInput.value = outCanvas.height;
      undoStack = [];
    } else {
      initCanvas(parseInt(widthInput.value) || 512, parseInt(heightInput.value) || 512);
    }
    modal.style.display = 'flex';
    requestAnimationFrame(fitToArea);
  });

  function closeModal() {
    if (currentPointerId !== null) {
      try { drawCanvas.releasePointerCapture(currentPointerId); } catch (_) {}
      try { drawArea.releasePointerCapture(currentPointerId); } catch (_) {}
    }
    isDrawing = isPanning = spaceDown = false;
    currentPointerId = null;
    modal.style.display = 'none';
  }

  closeBtn.addEventListener('click', closeModal);
  closeBtn2.addEventListener('click', closeModal);

  // ── Controls inside modal ──────────────────────────────────────────────────
  terrainBtns.forEach(btn => btn.addEventListener('click', () => {
    currentZone = btn.dataset.zone;
    terrainBtns.forEach(b => b.classList.toggle('active', b === btn));
  }));

  brushSlider.addEventListener('input', () => {
    brushSize = parseInt(brushSlider.value);
    brushVal.textContent = brushSize;
    updateTrack(brushSlider, brushSize / 80);
  });
  updateTrack(brushSlider, brushSize / 80);

  resizeBtn.addEventListener('click', () => {
    const w = Math.max(64, Math.min(2048, parseInt(widthInput.value)  || 512));
    const h = Math.max(64, Math.min(2048, parseInt(heightInput.value) || 512));
    widthInput.value = w; heightInput.value = h;
    initCanvas(w, h);
  });

  undoBtn.addEventListener('click', () => {
    if (undoStack.length) ctx.putImageData(undoStack.pop(), 0, 0);
  });

  clearBtn.addEventListener('click', () => {
    pushUndo();
    const [r, g, b] = ZONE_COLORS.water;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  });

  applyBtn.addEventListener('click', () => {
    const w = drawCanvas.width, h = drawCanvas.height;
    outCanvas.width = w; outCanvas.height = h;
    outCanvas.getContext('2d').drawImage(drawCanvas, 0, 0);

    srcCanvas.width = w; srcCanvas.height = h;
    srcCanvas.getContext('2d').drawImage(drawCanvas, 0, 0);

    document.getElementById('preview').src = outCanvas.toDataURL('image/png');
    document.getElementById('preview').style.display = 'block';
    document.getElementById('placeholder').style.display = 'none';
    imgInfo.textContent = `${w} × ${h}`;
    document.getElementById('downloadBtn').disabled    = false;
    document.getElementById('downloadSrcBtn').disabled = false;
    const nb = document.getElementById('nationSpawnsBtn');
    if (nb) { nb.style.opacity = ''; nb.style.pointerEvents = ''; }
    setGisMode(false);
    closeModal();
  });

  // ── Drawing (only fires when modal is visible) ─────────────────────────────
  drawCanvas.addEventListener('pointerdown', (e) => {
    if (modal.style.display === 'none') return;
    if (e.button !== 0) return;
    e.preventDefault();
    pushUndo();
    isDrawing = true;
    currentPointerId = e.pointerId;
    drawCanvas.setPointerCapture(e.pointerId);
    paint(...Object.values(canvasPoint(e)));
  });

  drawCanvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    paint(...Object.values(canvasPoint(e)));
  });

  drawCanvas.addEventListener('pointerup',     () => { isDrawing = false; currentPointerId = null; });
  drawCanvas.addEventListener('pointercancel', () => { isDrawing = false; currentPointerId = null; });

  // ── Zoom ───────────────────────────────────────────────────────────────────
  drawArea.addEventListener('wheel', (e) => {
    if (modal.style.display === 'none') return;
    e.preventDefault();
    const ar = drawArea.getBoundingClientRect();
    const mx = e.clientX - ar.left, my = e.clientY - ar.top;
    const d  = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.max(0.1, Math.min(20, scale * d));
    offsetX  = mx - (mx - offsetX) * (ns / scale);
    offsetY  = my - (my - offsetY) * (ns / scale);
    scale    = ns;
    applyTransform();
  }, { passive: false });

  // ── Pan (middle-drag or Space+drag) ───────────────────────────────────────
  drawArea.addEventListener('pointerdown', (e) => {
    if (modal.style.display === 'none') return;
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      isPanning = true;
      panStartX = e.clientX; panStartY = e.clientY;
      panOX = offsetX; panOY = offsetY;
      drawArea.setPointerCapture(e.pointerId);
      drawCanvas.style.cursor = 'grabbing';
    }
  });

  drawArea.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    offsetX = panOX + (e.clientX - panStartX);
    offsetY = panOY + (e.clientY - panStartY);
    applyTransform();
  });

  drawArea.addEventListener('pointerup',     () => { isPanning = false; drawCanvas.style.cursor = spaceDown ? 'grab' : 'crosshair'; });
  drawArea.addEventListener('pointercancel', () => { isPanning = false; });

  // ── Keyboard (Space pan + Ctrl+Z undo) ────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (modal.style.display === 'none') return;
    if (e.code === 'Space' && !e.target.matches('input,textarea')) {
      spaceDown = true; drawCanvas.style.cursor = 'grab'; e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (undoStack.length) ctx.putImageData(undoStack.pop(), 0, 0);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceDown = false;
      if (modal.style.display !== 'none') drawCanvas.style.cursor = 'crosshair';
    }
  });
}
