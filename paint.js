// paint.js — Manual terrain painting overlay
// Exports: initPaint(options)

export function initPaint({ outCanvas, preview, onPaintChange }) {
  // ── State ──────────────────────────────────────────────────────────────────
  let active = false;
  let currentTerrain = 'water'; // water | plain | highland | mountain
  let brushSize = 12;
  let painting = false;
  let lastX = null, lastY = null;

  // Off-screen canvas that stores paint strokes (same size as outCanvas)
  let paintCanvas = null;
  let paintCtx = null;

  // Terrain colors matching ZONE_COLORS_SRC in app.js
  const TERRAIN_COLORS = {
    water:    [18,  15,  34,  255],
    plain:    [140, 170, 88,  255],
    highland: [176, 159, 114, 255],
    mountain: [190, 190, 190, 255],
  };

  // ── Init paint canvas ──────────────────────────────────────────────────────
  function ensurePaintCanvas() {
    if (paintCanvas && paintCanvas.width === outCanvas.width && paintCanvas.height === outCanvas.height) return;
    paintCanvas = document.createElement('canvas');
    paintCanvas.width  = outCanvas.width;
    paintCanvas.height = outCanvas.height;
    paintCtx = paintCanvas.getContext('2d');
    // transparent by default
  }

  // ── Apply paint layer onto outCanvas and refresh preview ──────────────────
  function applyAndRefresh() {
    if (!paintCanvas || !outCanvas.width) return;
    // Composite: draw paint layer on top of outCanvas
    const ctx = outCanvas.getContext('2d');
    ctx.drawImage(paintCanvas, 0, 0);
    preview.src = outCanvas.toDataURL('image/png');
    onPaintChange();
  }

  // ── Draw a filled circle on paintCanvas ───────────────────────────────────
  function paintAt(cx, cy) {
    if (!paintCtx) return;
    const [r, g, b] = TERRAIN_COLORS[currentTerrain];
    paintCtx.fillStyle = `rgb(${r},${g},${b})`;
    paintCtx.beginPath();
    paintCtx.arc(cx, cy, brushSize, 0, Math.PI * 2);
    paintCtx.fill();
  }

  // ── Interpolate between two points for smooth strokes ─────────────────────
  function paintLine(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / (brushSize * 0.4)));
    for (let i = 0; i <= steps; i++) {
      paintAt(x0 + dx * (i / steps), y0 + dy * (i / steps));
    }
  }

  // ── Convert mouse/touch event to canvas coords ────────────────────────────
  function eventToCanvas(e) {
    const rect = preview.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = outCanvas.width  / rect.width;
    const scaleY = outCanvas.height / rect.height;
    return [
      Math.round((clientX - rect.left) * scaleX),
      Math.round((clientY - rect.top)  * scaleY),
    ];
  }

  // ── Pointer events on preview img ─────────────────────────────────────────
  function onPointerDown(e) {
    if (!active) return;
    e.preventDefault();
    ensurePaintCanvas();
    painting = true;
    const [x, y] = eventToCanvas(e);
    lastX = x; lastY = y;
    paintAt(x, y);
    applyAndRefresh();
  }

  function onPointerMove(e) {
    if (!active || !painting) return;
    e.preventDefault();
    const [x, y] = eventToCanvas(e);
    paintLine(lastX, lastY, x, y);
    lastX = x; lastY = y;
    applyAndRefresh();
  }

  function onPointerUp() {
    painting = false;
    lastX = null; lastY = null;
  }

  preview.addEventListener('mousedown',  onPointerDown);
  preview.addEventListener('mousemove',  onPointerMove);
  preview.addEventListener('mouseup',    onPointerUp);
  preview.addEventListener('mouseleave', onPointerUp);
  preview.addEventListener('touchstart', onPointerDown, { passive: false });
  preview.addEventListener('touchmove',  onPointerMove, { passive: false });
  preview.addEventListener('touchend',   onPointerUp);

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    setActive(val) {
      active = val;
      preview.style.cursor = val ? 'crosshair' : '';
    },
    setTerrain(t) { currentTerrain = t; },
    setBrushSize(s) { brushSize = s; },
    /** Called after worker re-renders — reset paint canvas to match new size */
    onRenderComplete() {
      // If size changed, drop old paint canvas so it gets recreated fresh
      if (paintCanvas && (paintCanvas.width !== outCanvas.width || paintCanvas.height !== outCanvas.height)) {
        paintCanvas = null;
        paintCtx = null;
      }
    },
    /** Re-apply stored paint strokes on top of a freshly rendered outCanvas */
    reapply() {
      if (!paintCanvas || !outCanvas.width) return;
      const ctx = outCanvas.getContext('2d');
      ctx.drawImage(paintCanvas, 0, 0);
      preview.src = outCanvas.toDataURL('image/png');
    },
    clearPaint() {
      if (paintCtx) paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      if (outCanvas.width) preview.src = outCanvas.toDataURL('image/png');
    },
    hasPaint() {
      return !!paintCanvas;
    },
  };
}
