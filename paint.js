// paint.js — Manual terrain painting overlay
// Exports: initPaint(options)

export function initPaint({ outCanvas, preview, previewWrap, paintOverlay, onPaintChange }) {
  // ── State ──────────────────────────────────────────────────────────────────
  let active = false;
  let currentTerrain = 'water';
  let brushSize = 12;
  let painting = false;
  let lastX = null, lastY = null;

  // Off-screen canvas storing all paint strokes (matches outCanvas dimensions)
  let paintCanvas = null;
  let paintCtx = null;

  // Overlay ctx (visible canvas on top of preview img)
  const overlayCtx = paintOverlay.getContext('2d');

  // Terrain colors matching ZONE_COLORS_SRC in app.js
  const TERRAIN_COLORS = {
    water:    [18,  15,  34],
    plain:    [140, 170, 88],
    highland: [176, 159, 114],
    mountain: [190, 190, 190],
  };

  // ── Sync overlay canvas size to preview img display size ──────────────────
  function syncOverlaySize() {
    const rect = preview.getBoundingClientRect();
    if (!rect.width) return;
    paintOverlay.style.width  = rect.width  + 'px';
    paintOverlay.style.height = rect.height + 'px';
    paintOverlay.width  = rect.width;
    paintOverlay.height = rect.height;
    redrawOverlay();
  }

  // ── Draw stored paint strokes onto the visible overlay ────────────────────
  function redrawOverlay() {
    overlayCtx.clearRect(0, 0, paintOverlay.width, paintOverlay.height);
    if (!paintCanvas || !paintCanvas.width) return;
    overlayCtx.drawImage(paintCanvas, 0, 0, paintOverlay.width, paintOverlay.height);
  }

  // ── Ensure paint canvas matches outCanvas size ────────────────────────────
  function ensurePaintCanvas() {
    if (paintCanvas &&
        paintCanvas.width  === outCanvas.width &&
        paintCanvas.height === outCanvas.height) return;
    const old = paintCanvas;
    paintCanvas = document.createElement('canvas');
    paintCanvas.width  = outCanvas.width;
    paintCanvas.height = outCanvas.height;
    paintCtx = paintCanvas.getContext('2d');
    // Preserve old strokes if dimensions match
    if (old && old.width === outCanvas.width && old.height === outCanvas.height) {
      paintCtx.drawImage(old, 0, 0);
    }
  }

  // ── Convert pointer event → outCanvas pixel coords ───────────────────────
  function eventToCanvas(e) {
    const rect = preview.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return [
      Math.round((clientX - rect.left) * outCanvas.width  / rect.width),
      Math.round((clientY - rect.top)  * outCanvas.height / rect.height),
    ];
  }

  // ── Paint a filled circle at canvas coords ────────────────────────────────
  function paintAt(cx, cy) {
    const [r, g, b] = TERRAIN_COLORS[currentTerrain];
    paintCtx.fillStyle = `rgb(${r},${g},${b})`;
    paintCtx.beginPath();
    paintCtx.arc(cx, cy, brushSize, 0, Math.PI * 2);
    paintCtx.fill();
  }

  // ── Interpolate for smooth strokes ────────────────────────────────────────
  function paintLine(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(dist / (brushSize * 0.4)));
    for (let i = 0; i <= steps; i++) {
      paintAt(x0 + dx * (i / steps), y0 + dy * (i / steps));
    }
  }

  // ── Composite paint onto outCanvas and refresh preview src ────────────────
  function applyAndRefresh() {
    if (!paintCanvas || !outCanvas.width) return;
    // We keep outCanvas clean (worker output) and only show paint via overlay.
    // For download we merge on demand — see getPaintedCanvas().
    redrawOverlay();
    onPaintChange();
  }

  // ── Pointer events ────────────────────────────────────────────────────────
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

  // Attach to the preview image (it fills the wrap div)
  preview.addEventListener('mousedown',  onPointerDown);
  preview.addEventListener('mousemove',  onPointerMove);
  preview.addEventListener('mouseup',    onPointerUp);
  preview.addEventListener('mouseleave', onPointerUp);
  preview.addEventListener('touchstart', onPointerDown, { passive: false });
  preview.addEventListener('touchmove',  onPointerMove, { passive: false });
  preview.addEventListener('touchend',   onPointerUp);

  // Keep overlay in sync when preview resizes
  new ResizeObserver(syncOverlaySize).observe(preview);

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    setActive(val) {
      active = val;
      paintOverlay.style.pointerEvents = val ? 'all' : 'none';
      preview.style.cursor = val ? 'none' : '';
      paintOverlay.style.cursor = val ? 'crosshair' : '';
    },
    setTerrain(t) { currentTerrain = t; },
    setBrushSize(s) { brushSize = s; },

    /** Called after worker renders new pixels — reset if size changed */
    onRenderComplete() {
      if (paintCanvas &&
          (paintCanvas.width !== outCanvas.width || paintCanvas.height !== outCanvas.height)) {
        paintCanvas = null;
        paintCtx = null;
      }
      syncOverlaySize();
    },

    /** Re-draw overlay after preview img src updates */
    reapply() {
      syncOverlaySize();
    },

    /** Returns a canvas with worker output + paint merged (for download) */
    getPaintedCanvas() {
      if (!paintCanvas || !outCanvas.width) return outCanvas;
      const merged = document.createElement('canvas');
      merged.width  = outCanvas.width;
      merged.height = outCanvas.height;
      const ctx = merged.getContext('2d');
      ctx.drawImage(outCanvas, 0, 0);
      ctx.drawImage(paintCanvas, 0, 0);
      return merged;
    },

    hasPaint() { return !!paintCanvas; },

    clearPaint() {
      if (paintCtx) paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      redrawOverlay();
    },
  };
}
