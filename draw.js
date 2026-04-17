// draw.js — manual terrain painting module

const ZONE_COLORS = {
  water:    [18,  15,  34],
  plain:    [140, 170, 88],
  highland: [176, 159, 114],
  mountain: [190, 190, 190],
};

export function initDraw({ outCanvas, srcCanvas, imgInfo, scheduleRender, clampedSize, setGisMode }) {
  const modal        = document.getElementById('drawModal');
  const drawCanvas   = document.getElementById('drawCanvas');
  const drawArea     = document.getElementById('drawArea');
  const brushSlider  = document.getElementById('drawBrushSize');
  const brushVal     = document.getElementById('drawBrushVal');
  const undoBtn      = document.getElementById('drawUndoBtn');
  const clearBtn     = document.getElementById('drawClearBtn');
  const applyBtn     = document.getElementById('drawApplyBtn');
  const resizeBtn    = document.getElementById('drawResizeBtn');
  const closeBtn     = document.getElementById('drawModalClose');
  const closeBtn2    = document.getElementById('drawModalClose2');
  const widthInput   = document.getElementById('drawWidth');
  const heightInput  = document.getElementById('drawHeight');
  const terrainBtns  = document.querySelectorAll('.draw-terrain-btn');
  const openBtn      = document.getElementById('drawManuallyBtn');

  const ctx = drawCanvas.getContext('2d');

  let currentZone = 'water';
  let brushSize   = 12;
  let isDrawing   = false;
  let undoStack   = [];   // array of ImageData snapshots
  const MAX_UNDO  = 20;

  // Viewport transform (zoom/pan)
  let scale  = 1;
  let offsetX = 0, offsetY = 0;

  // ── Terrain selection ──────────────────────────────────────────────────────
  terrainBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentZone = btn.dataset.zone;
      terrainBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  // ── Brush size ─────────────────────────────────────────────────────────────
  brushSlider.addEventListener('input', () => {
    brushSize = parseInt(brushSlider.value);
    brushVal.textContent = brushSize;
    updateTrack(brushSlider, brushSize / 80);
  });
  updateTrack(brushSlider, brushSize / 80);

  function updateTrack(input, val) {
    const pct = val * 100;
    input.style.background = `linear-gradient(to right, var(--accent) ${pct}%, var(--border) ${pct}%)`;
  }

  // ── Canvas init ────────────────────────────────────────────────────────────
  function initCanvas(w, h, fillZone = 'water') {
    drawCanvas.width  = w;
    drawCanvas.height = h;
    const [r, g, b] = ZONE_COLORS[fillZone];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);
    undoStack = [];
    fitToArea();
  }

  function fitToArea() {
    const ar = drawArea.getBoundingClientRect();
    if (!ar.width || !ar.height) return;
    const scaleX = (ar.width  - 32) / drawCanvas.width;
    const scaleY = (ar.height - 32) / drawCanvas.height;
    scale   = Math.min(scaleX, scaleY, 4);
    offsetX = (ar.width  - drawCanvas.width  * scale) / 2;
    offsetY = (ar.height - drawCanvas.height * scale) / 2;
    applyTransform();
  }

  function applyTransform() {
    drawCanvas.style.transform       = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    drawCanvas.style.transformOrigin = '0 0';
    drawCanvas.style.left            = '0';
    drawCanvas.style.top             = '0';
  }

  // ── Open modal ─────────────────────────────────────────────────────────────
  openBtn.addEventListener('click', () => {
    modal.classList.add('open');
    // If there's already a rendered map, copy it; otherwise blank canvas
    if (outCanvas.width && outCanvas.height) {
      drawCanvas.width  = outCanvas.width;
      drawCanvas.height = outCanvas.height;
      ctx.drawImage(outCanvas, 0, 0);
      widthInput.value  = outCanvas.width;
      heightInput.value = outCanvas.height;
      undoStack = [];
    } else {
      const w = parseInt(widthInput.value)  || 512;
      const h = parseInt(heightInput.value) || 512;
      initCanvas(w, h);
    }
    requestAnimationFrame(fitToArea);
  });

  // ── Close ──────────────────────────────────────────────────────────────────
  [closeBtn, closeBtn2].forEach(b => b.addEventListener('click', () => modal.classList.remove('open')));

  // ── Resize ─────────────────────────────────────────────────────────────────
  resizeBtn.addEventListener('click', () => {
    const w = Math.max(64, Math.min(2048, parseInt(widthInput.value)  || 512));
    const h = Math.max(64, Math.min(2048, parseInt(heightInput.value) || 512));
    widthInput.value  = w;
    heightInput.value = h;
    initCanvas(w, h);
  });

  // ── Undo ───────────────────────────────────────────────────────────────────
  function pushUndo() {
    undoStack.push(ctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  undoBtn.addEventListener('click', () => {
    if (!undoStack.length) return;
    ctx.putImageData(undoStack.pop(), 0, 0);
  });

  // ── Clear ──────────────────────────────────────────────────────────────────
  clearBtn.addEventListener('click', () => {
    pushUndo();
    const [r, g, b] = ZONE_COLORS.water;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  });

  // ── Apply to map ───────────────────────────────────────────────────────────
  applyBtn.addEventListener('click', () => {
    const w = drawCanvas.width, h = drawCanvas.height;
    srcCanvas.width  = w;
    srcCanvas.height = h;
    // Convert draw canvas zones → grayscale source image
    const srcCtx = srcCanvas.getContext('2d');
    const drawn  = ctx.getImageData(0, 0, w, h);
    const srcImg = srcCtx.createImageData(w, h);
    // Map zone colors → brightness values that the worker will classify correctly
    // We write the zone color directly — worker classifies by brightness
    // Water ~18,15,34 → avg ~22 → brightness ~0.09
    // Plain ~140,170,88 → avg ~133 → brightness ~0.52
    // Highland ~176,159,114 → avg ~150 → brightness ~0.59
    // Mountain ~190,190,190 → avg ~190 → brightness ~0.75
    // Instead, write exact zone colors so render() classifies them back correctly
    for (let i = 0; i < w * h * 4; i++) srcImg.data[i] = drawn.data[i];
    srcCtx.putImageData(srcImg, 0, 0);

    // Build a fake srcImageData that maps to the correct zones
    // We need to set thresholds so the drawn colors land in the right zones.
    // Easiest: write the zone output colors directly to outCanvas and skip worker.
    const outCtx = outCanvas.getContext('2d');
    outCanvas.width  = w;
    outCanvas.height = h;
    outCtx.drawImage(drawCanvas, 0, 0);

    // Update preview
    const previewEl = document.getElementById('preview');
    const placeholder = document.getElementById('placeholder');
    previewEl.src = outCanvas.toDataURL('image/png');
    previewEl.style.display = 'block';
    placeholder.style.display = 'none';
    imgInfo.textContent = `${w} × ${h}`;

    // Enable download buttons
    document.getElementById('downloadBtn').disabled    = false;
    document.getElementById('downloadSrcBtn').disabled = false;
    const nationBtn = document.getElementById('nationSpawnsBtn');
    if (nationBtn) { nationBtn.style.opacity = ''; nationBtn.style.pointerEvents = ''; }

    // Store srcImageData so re-renders don't overwrite (set to null to block worker)
    // We mark as manual draw — no further worker processing needed
    setGisMode(false);

    modal.classList.remove('open');
  });

  // ── Drawing interaction ────────────────────────────────────────────────────
  function canvasPoint(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left)  * (drawCanvas.width  / rect.width),
      y: (e.clientY - rect.top)   * (drawCanvas.height / rect.height),
    };
  }

  function paint(x, y) {
    const [r, g, b] = ZONE_COLORS[currentZone];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCanvas.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || e.button === 2) return; // middle/right — reserved for pan
    e.preventDefault();
    pushUndo();
    isDrawing = true;
    drawCanvas.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);
    paint(p.x, p.y);
  });

  drawCanvas.addEventListener('pointermove', (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const p = canvasPoint(e);
    paint(p.x, p.y);
  });

  drawCanvas.addEventListener('pointerup',     () => { isDrawing = false; });
  drawCanvas.addEventListener('pointercancel', () => { isDrawing = false; });

  // ── Zoom (wheel) ───────────────────────────────────────────────────────────
  drawArea.addEventListener('wheel', (e) => {
    e.preventDefault();
    const ar    = drawArea.getBoundingClientRect();
    const mx    = e.clientX - ar.left;
    const my    = e.clientY - ar.top;
    const delta = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newScale = Math.max(0.1, Math.min(20, scale * delta));
    offsetX = mx - (mx - offsetX) * (newScale / scale);
    offsetY = my - (my - offsetY) * (newScale / scale);
    scale   = newScale;
    applyTransform();
  }, { passive: false });

  // ── Pan (middle-drag or space+drag) ───────────────────────────────────────
  let isPanning = false, panStartX = 0, panStartY = 0, panOX = 0, panOY = 0;
  let spaceDown = false;

  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && modal.classList.contains('open')) { spaceDown = true; drawCanvas.style.cursor = 'grab'; e.preventDefault(); } });
  window.addEventListener('keyup',   (e) => { if (e.code === 'Space') { spaceDown = false; drawCanvas.style.cursor = 'crosshair'; } });

  drawArea.addEventListener('pointerdown', (e) => {
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      isPanning  = true;
      panStartX  = e.clientX; panStartY = e.clientY;
      panOX      = offsetX;   panOY     = offsetY;
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

  // Keyboard shortcut: Ctrl+Z undo
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && modal.classList.contains('open')) {
      e.preventDefault();
      if (undoStack.length) ctx.putImageData(undoStack.pop(), 0, 0);
    }
  });
}
