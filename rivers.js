// rivers.js — River creation tool with realistic curves
// Generates winding rivers between user-placed control points
//
// USAGE:
// 1. Create a RiverLayer instance: const riverLayer = new RiverLayer()
// 2. Start a river: riverLayer.startRiver(startPoint, endPoint, windiness, width)
// 3. Add control points: riverLayer.addControlPoint(point)
// 4. Adjust parameters: riverLayer.setWindiness(0.5), riverLayer.setWidth(3)
// 5. Finish: riverLayer.finishRiver()
// 6. Render: riverLayer.render(ctx, [r, g, b])
//
// Rivers use multi-frequency sine waves for natural curves and Catmull-Rom
// spline interpolation for smooth paths. Even with just 2 control points,
// rivers will have realistic meanders.

/**
 * Generate a smooth, winding river path between control points
 * @param {Array<{x, y}>} controlPoints - User-placed waypoints
 * @param {number} windiness - 0-1, how much the river curves (0 = straight, 1 = very winding)
 * @param {number} segmentLength - Distance between interpolated points (smaller = smoother)
 * @returns {Array<{x, y}>} - Dense array of points forming the river path
 */
export function generateRiverPath(controlPoints, windiness = 0.5, segmentLength = 5) {
  if (controlPoints.length < 2) return [];
  
  const path = [];
  
  // For each segment between control points
  for (let i = 0; i < controlPoints.length - 1; i++) {
    const p0 = controlPoints[i];
    const p1 = controlPoints[i + 1];
    
    // Calculate segment direction and length
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    // Number of intermediate points
    const numPoints = Math.max(2, Math.ceil(dist / segmentLength));
    
    // Generate points along this segment with Perlin-like noise
    for (let j = 0; j <= numPoints; j++) {
      const t = j / numPoints;
      
      // Base position (linear interpolation)
      const baseX = p0.x + dx * t;
      const baseY = p0.y + dy * t;
      
      // Add perpendicular offset for windiness
      // Use multiple sine waves at different frequencies for natural look
      const perpAngle = angle + Math.PI / 2;
      
      // Smooth windiness that's 0 at control points, max in middle
      const windFactor = Math.sin(t * Math.PI) * windiness;
      
      // Multi-frequency noise for natural curves
      const freq1 = 0.3;
      const freq2 = 0.7;
      const freq3 = 1.5;
      
      const noise = 
        Math.sin(t * Math.PI * 2 * freq1 + i * 3.7) * 0.5 +
        Math.sin(t * Math.PI * 2 * freq2 + i * 7.3) * 0.3 +
        Math.sin(t * Math.PI * 2 * freq3 + i * 11.1) * 0.2;
      
      // Scale offset by distance and windiness
      const maxOffset = dist * 0.15 * windFactor;
      const offset = noise * maxOffset;
      
      const x = baseX + Math.cos(perpAngle) * offset;
      const y = baseY + Math.sin(perpAngle) * offset;
      
      path.push({ x, y });
    }
  }
  
  return path;
}

/**
 * Smooth a river path using Catmull-Rom spline interpolation
 * @param {Array<{x, y}>} points - Input points
 * @param {number} smoothness - Number of interpolated points between each pair (higher = smoother)
 * @returns {Array<{x, y}>} - Smoothed path
 */
export function smoothRiverPath(points, smoothness = 3) {
  if (points.length < 2) return points;
  
  const smoothed = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    for (let t = 0; t < 1; t += 1 / smoothness) {
      const t2 = t * t;
      const t3 = t2 * t;
      
      // Catmull-Rom spline formula
      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      
      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
      
      smoothed.push({ x, y });
    }
  }
  
  // Add final point
  smoothed.push(points[points.length - 1]);
  
  return smoothed;
}

/**
 * Draw a river on canvas with given width
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<{x, y}>} path - River path points
 * @param {number} width - River width in pixels
 * @param {Array<number>} color - RGB color [r, g, b]
 */
export function drawRiver(ctx, path, width, color) {
  if (path.length < 2) return;
  
  ctx.strokeStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  
  ctx.stroke();
}

/**
 * River layer manager - stores and renders all rivers
 */
export class RiverLayer {
  constructor() {
    this.rivers = []; // Array of {controlPoints, windiness, width, path}
    this.currentRiver = null; // River being edited
  }
  
  /**
   * Start a new river with initial control points
   */
  startRiver(startPoint, endPoint, windiness = 0.5, width = 3) {
    this.currentRiver = {
      controlPoints: [startPoint, endPoint],
      windiness,
      width,
      path: null
    };
    this.updateCurrentRiverPath();
  }
  
  /**
   * Add a control point to current river
   */
  addControlPoint(point) {
    if (!this.currentRiver) return;
    
    // Insert point in the best position (closest to the path)
    const points = this.currentRiver.controlPoints;
    let bestIdx = points.length;
    let bestDist = Infinity;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // Distance from point to line segment
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len2 = dx * dx + dy * dy;
      
      if (len2 === 0) continue;
      
      const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2));
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
      
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i + 1;
      }
    }
    
    points.splice(bestIdx, 0, point);
    this.updateCurrentRiverPath();
  }
  
  /**
   * Update windiness of current river
   */
  setWindiness(windiness) {
    if (!this.currentRiver) return;
    this.currentRiver.windiness = windiness;
    this.updateCurrentRiverPath();
  }
  
  /**
   * Update width of current river
   */
  setWidth(width) {
    if (!this.currentRiver) return;
    this.currentRiver.width = width;
  }
  
  /**
   * Regenerate path for current river
   */
  updateCurrentRiverPath() {
    if (!this.currentRiver) return;
    const raw = generateRiverPath(
      this.currentRiver.controlPoints,
      this.currentRiver.windiness,
      5
    );
    this.currentRiver.path = smoothRiverPath(raw, 3);
  }
  
  /**
   * Finish current river and add to layer
   */
  finishRiver() {
    if (!this.currentRiver) return;
    this.rivers.push(this.currentRiver);
    this.currentRiver = null;
  }
  
  /**
   * Cancel current river
   */
  cancelRiver() {
    this.currentRiver = null;
  }
  
  /**
   * Remove a river by index
   */
  removeRiver(index) {
    this.rivers.splice(index, 1);
  }
  
  /**
   * Clear all rivers
   */
  clearAll() {
    this.rivers = [];
    this.currentRiver = null;
  }
  
  /**
   * Render all rivers to canvas
   */
  render(ctx, color) {
    // Render completed rivers
    for (const river of this.rivers) {
      if (river.path) {
        drawRiver(ctx, river.path, river.width, color);
      }
    }
    
    // Render current river being edited
    if (this.currentRiver && this.currentRiver.path) {
      drawRiver(ctx, this.currentRiver.path, this.currentRiver.width, color);
      
      // Draw control points
      ctx.fillStyle = 'rgba(88, 166, 255, 0.8)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      
      for (let i = 0; i < this.currentRiver.controlPoints.length; i++) {
        const p = this.currentRiver.controlPoints[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        // Draw lines between control points
        if (i > 0) {
          const prev = this.currentRiver.controlPoints[i - 1];
          ctx.strokeStyle = 'rgba(88, 166, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
  }
  
  /**
   * Export rivers data for saving
   */
  export() {
    return {
      rivers: this.rivers.map(r => ({
        controlPoints: r.controlPoints,
        windiness: r.windiness,
        width: r.width
      }))
    };
  }
  
  /**
   * Import rivers data
   */
  import(data) {
    this.rivers = data.rivers.map(r => ({
      controlPoints: r.controlPoints,
      windiness: r.windiness,
      width: r.width,
      path: smoothRiverPath(generateRiverPath(r.controlPoints, r.windiness, 5), 3)
    }));
  }
}
