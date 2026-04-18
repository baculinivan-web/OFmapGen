// myb-engine.js — MyPaint brush engine for HTML5 Canvas (ES module)
// Implements core dab-based rendering from the .myb JSON format.
// Color is always supplied externally (terrain color), never taken from the brush.

/**
 * Parse a .myb JSON object and return a normalized brush params object.
 * @param {object} myb  — parsed JSON from a .myb file
 * @returns {object}    — flat params map with resolved base_values and input curves
 */
export function parseMybBrush(myb) {
  const s = myb.settings || {};
  const get = (key, def) => s[key] ? s[key].base_value : def;
  const getCurve = (key) => (s[key] && s[key].inputs) ? s[key].inputs : {};

  return {
    radius_logarithmic:   get('radius_logarithmic',   2.0),
    hardness:             get('hardness',             0.8),
    opaque:               get('opaque',               1.0),
    opaque_linearize:     get('opaque_linearize',     0.9),
    dabs_per_actual_radius: get('dabs_per_actual_radius', 2.0),
    offset_by_random:     get('offset_by_random',     0.0),
    elliptical_dab_ratio: get('elliptical_dab_ratio', 1.0),
    elliptical_dab_angle_base: get('elliptical_dab_angle', 90.0),
    elliptical_dab_angle_curve: getCurve('elliptical_dab_angle'),
    direction_filter:     get('direction_filter',     2.0),
    radius_by_random:     get('radius_by_random',     0.0),
    // raw settings ref for future extension
    _raw: myb,
  };
}

/**
 * Evaluate a MyPaint piecewise-linear input curve at a given input value.
 * Points are [[x0,y0],[x1,y1],...] where x is input, y is output multiplier.
 */
function evalCurve(points, x) {
  if (!points || points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x >= x0 && x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

/**
 * MybBrushState — holds per-stroke state for the brush engine.
 * Create one per stroke (mousedown), discard on mouseup.
 */
export class MybBrushState {
  constructor(params) {
    this.params = params;
    // Smoothed direction tracking (low-pass filter)
    this._dirDx = 0;
    this._dirDy = 0;
    this._partial = 0; // fractional dab accumulator
  }

  reset() {
    this._dirDx = 0;
    this._dirDy = 0;
    this._partial = 0;
  }
}

/**
 * Draw a single MyPaint dab onto a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx, cy   — center position
 * @param {number} radius   — actual radius in pixels
 * @param {number} hardness — 0..1
 * @param {number} alpha    — 0..1 opacity for this dab
 * @param {number} ratio    — elliptical ratio (>=1)
 * @param {number} angleDeg — ellipse rotation in degrees
 * @param {number[]} rgb    — [r,g,b] terrain color
 */
function drawDab(ctx, cx, cy, radius, hardness, alpha, ratio, angleDeg, rgb) {
  if (radius < 0.5 || alpha < 0.004) return;

  const [r, g, b] = rgb;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Apply ellipse transform if needed
  const isEllipse = ratio > 1.01;
  let drawX = cx, drawY = cy;
  if (isEllipse) {
    const angleRad = (angleDeg * Math.PI) / 180;
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.scale(1, 1 / ratio);
    drawX = 0;
    drawY = 0;
  }

  if (hardness >= 0.99) {
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const innerR = Math.max(radius * 0.001, hardness * radius);
    const grad = ctx.createRadialGradient(drawX, drawY, innerR, drawX, drawY, radius);
    grad.addColorStop(0, `rgb(${r},${g},${b})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Paint a segment from (x0,y0) to (x1,y1) using the MyPaint brush engine.
 * Places dabs along the path according to dabs_per_actual_radius spacing.
 *
 * @param {CanvasRenderingContext2D} ctx  — paintCanvas context
 * @param {MybBrushState} state
 * @param {number} x0, y0  — start (canvas pixels)
 * @param {number} x1, y1  — end (canvas pixels)
 * @param {number} brushSizePx  — user brush size slider value (base radius override)
 * @param {number[]} rgb   — [r,g,b] terrain color
 */
export function mybPaintSegment(ctx, state, x0, y0, x1, y1, brushSizePx, rgb) {
  const p = state.params;

  // Base radius from slider (overrides radius_logarithmic for user control)
  const baseRadius = brushSizePx;

  // Direction of this segment
  const dx = x1 - x0;
  const dy = y1 - y0;
  const segLen = Math.sqrt(dx * dx + dy * dy);

  // Update smoothed direction (low-pass, direction_filter controls lag)
  const filterFac = Math.min(1, 1 / (p.direction_filter + 0.001));
  if (segLen > 0.1) {
    state._dirDx += filterFac * (dx / segLen - state._dirDx);
    state._dirDy += filterFac * (dy / segLen - state._dirDy);
  }
  const dirAngleDeg = Math.atan2(state._dirDy, state._dirDx) * 180 / Math.PI;
  // Normalize to 0..180 (MyPaint direction input range)
  const dirInput = ((dirAngleDeg % 180) + 180) % 180;

  // Dab spacing: move dabs_per_actual_radius dabs per radius distance
  const dabSpacing = Math.max(1, baseRadius / Math.max(0.1, p.dabs_per_actual_radius));

  // Ellipse angle: base + direction curve contribution (computed once per segment)
  let ellipseAngle = p.elliptical_dab_angle_base;
  const dirCurve = p.elliptical_dab_angle_curve['direction'];
  if (dirCurve && dirCurve.length > 0) {
    ellipseAngle += evalCurve(dirCurve, dirInput) * 180;
  }

  const alpha = Math.min(1, p.opaque);

  // _partial: how far into the next dab spacing we already are from previous segment
  // Start placing dabs from offset = dabSpacing - _partial
  let offset = dabSpacing - state._partial;
  if (offset <= 0) offset += dabSpacing;

  while (offset <= segLen) {
    const t = segLen > 0 ? offset / segLen : 0;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;

    // Random radius variation
    const radiusVariation = p.radius_by_random > 0
      ? Math.exp(p.radius_by_random * (Math.random() * 2 - 1))
      : 1;
    const actualRadius = Math.max(0.5, baseRadius * radiusVariation);

    // Jitter offset
    let jx = 0, jy = 0;
    if (p.offset_by_random > 0) {
      const jitterR = p.offset_by_random * actualRadius;
      const jAngle = Math.random() * Math.PI * 2;
      jx = Math.cos(jAngle) * jitterR;
      jy = Math.sin(jAngle) * jitterR;
    }

    drawDab(ctx, cx + jx, cy + jy, actualRadius, p.hardness, alpha, p.elliptical_dab_ratio, ellipseAngle, rgb);

    offset += dabSpacing;
  }

  // How far past the last dab we traveled — carry over to next segment
  state._partial = segLen - (offset - dabSpacing);
}

/**
 * Paint a single point (mousedown with no movement).
 */
export function mybPaintDot(ctx, state, x, y, brushSizePx, rgb) {
  const p = state.params;
  const baseRadius = brushSizePx;
  const alpha = Math.min(1, p.opaque);
  drawDab(ctx, x, y, baseRadius, p.hardness, alpha, p.elliptical_dab_ratio, p.elliptical_dab_angle_base, rgb);
}
