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
  
  // First, create a smooth base path using Catmull-Rom spline through control points
  const basePath = [];
  
  for (let i = 0; i < controlPoints.length - 1; i++) {
    const p0 = controlPoints[Math.max(0, i - 1)];
    const p1 = controlPoints[i];
    const p2 = controlPoints[i + 1];
    const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];
    
    // Calculate segment length for this section
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const numPoints = Math.max(10, Math.ceil(dist / segmentLength));
    
    // Generate smooth base points using Catmull-Rom
    for (let j = 0; j < numPoints; j++) {
      const t = j / numPoints;
      const t2 = t * t;
      const t3 = t2 * t;
      
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
      
      basePath.push({ x, y, segmentIndex: i, t });
    }
  }
  
  // Add final point
  basePath.push({ 
    x: controlPoints[controlPoints.length - 1].x, 
    y: controlPoints[controlPoints.length - 1].y,
    segmentIndex: controlPoints.length - 2,
    t: 1
  });
  
  // Now add windiness as perpendicular offset to the smooth base path
  const windyPath = [];
  
  for (let i = 0; i < basePath.length; i++) {
    const point = basePath[i];
    
    // Calculate tangent direction at this point
    let tangentX, tangentY;
    if (i === 0) {
      tangentX = basePath[1].x - basePath[0].x;
      tangentY = basePath[1].y - basePath[0].y;
    } else if (i === basePath.length - 1) {
      tangentX = basePath[i].x - basePath[i - 1].x;
      tangentY = basePath[i].y - basePath[i - 1].y;
    } else {
      tangentX = basePath[i + 1].x - basePath[i - 1].x;
      tangentY = basePath[i + 1].y - basePath[i - 1].y;
    }
    
    const tangentLen = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    if (tangentLen > 0) {
      tangentX /= tangentLen;
      tangentY /= tangentLen;
    }
    
    // Perpendicular direction
    const perpX = -tangentY;
    const perpY = tangentX;
    
    // Calculate windiness offset using smooth noise
    const globalT = i / basePath.length;
    
    // Multi-frequency noise for natural variation
    const freq1 = 2.0;
    const freq2 = 5.0;
    const freq3 = 10.0;
    
    const noise = 
      Math.sin(globalT * Math.PI * 2 * freq1 + point.segmentIndex * 2.1) * 0.5 +
      Math.sin(globalT * Math.PI * 2 * freq2 + point.segmentIndex * 5.3) * 0.3 +
      Math.sin(globalT * Math.PI * 2 * freq3 + point.segmentIndex * 8.7) * 0.2;
    
    // Scale offset by windiness parameter
    // Reduce offset near control points for smoother transitions
    const distToNearestControl = Math.min(
      Math.abs(point.t),
      Math.abs(1 - point.t)
    );
    const controlFade = Math.min(1, distToNearestControl * 3); // Fade in first/last 33%
    
    const maxOffset = 30 * windiness * controlFade;
    const offset = noise * maxOffset;
    
    windyPath.push({
      x: point.x + perpX * offset,
      y: point.y + perpY * offset
    });
  }
  
  return windyPath;
}

/**
 * Smooth a river path using Catmull-Rom spline interpolation
 * This is now mainly used as a final pass for extra smoothness
 * @param {Array<{x, y}>} points - Input points
 * @param {number} smoothness - Number of interpolated points between each pair (higher = smoother)
 * @returns {Array<{x, y}>} - Smoothed path
 */
export function smoothRiverPath(points, smoothness = 2) {
  if (points.length < 4) return points;
  
  const smoothed = [];
  
  // Use fewer interpolation steps since path is already smooth
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    // Only interpolate every Nth point to avoid over-smoothing
    if (i % 3 === 0 || i === points.length - 2) {
      for (let t = 0; t < 1; t += 1 / smoothness) {
        const t2 = t * t;
        const t3 = t2 * t;
        
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
    } else {
      smoothed.push(p1);
    }
  }
  
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
    // Generate path with improved algorithm (already smooth)
    this.currentRiver.path = generateRiverPath(
      this.currentRiver.controlPoints,
      this.currentRiver.windiness,
      5
    );
    // Optional: apply light final smoothing
    if (this.currentRiver.controlPoints.length > 3) {
      this.currentRiver.path = smoothRiverPath(this.currentRiver.path, 2);
    }
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
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Array<number>} color - RGB color [r, g, b]
   * @param {number|null} selectedRiverId - ID of selected river to show control points
   */
  render(ctx, color, selectedRiverId = null) {
    // Render completed rivers
    for (let i = 0; i < this.rivers.length; i++) {
      const river = this.rivers[i];
      if (river.path) {
        drawRiver(ctx, river.path, river.width, color);
        
        // Draw control points for selected river
        if (selectedRiverId === i) {
          ctx.fillStyle = 'rgba(88, 166, 255, 0.8)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 2;
          
          for (let j = 0; j < river.controlPoints.length; j++) {
            const p = river.controlPoints[j];
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            
            // Draw lines between control points
            if (j > 0) {
              const prev = river.controlPoints[j - 1];
              ctx.strokeStyle = 'rgba(88, 166, 255, 0.4)';
              ctx.lineWidth = 1;
              ctx.setLineDash([5, 5]);
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.lineWidth = 2;
            }
          }
        }
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
    this.rivers = data.rivers.map(r => {
      const path = generateRiverPath(r.controlPoints, r.windiness, 5);
      return {
        controlPoints: r.controlPoints,
        windiness: r.windiness,
        width: r.width,
        path: r.controlPoints.length > 3 ? smoothRiverPath(path, 2) : path
      };
    });
  }
}
