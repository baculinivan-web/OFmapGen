// Naturalization Worker - Perlin noise-based terrain naturalization
// Implements Perlin noise for generating realistic terrain transitions

/**
 * PerlinNoise class - Implements 2D Perlin noise algorithm
 * Based on Ken Perlin's improved noise (2002)
 */
class PerlinNoise {
  constructor(seed = 0) {
    // Initialize permutation table with seed
    this.p = new Uint8Array(512);
    
    // Generate base permutation array (0-255)
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      perm[i] = i;
    }
    
    // Shuffle using seed-based random
    let random = seed;
    for (let i = 255; i > 0; i--) {
      random = (random * 1664525 + 1013904223) % 4294967296; // LCG
      const j = Math.floor((random / 4294967296) * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    
    // Duplicate permutation table to avoid overflow
    for (let i = 0; i < 512; i++) {
      this.p[i] = perm[i & 255];
    }
  }
  
  /**
   * 2D Perlin noise function
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {number} Noise value in range [-1, 1]
   */
  noise2D(x, y) {
    // Find unit grid cell containing point
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    // Get relative xy coordinates within cell
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    // Compute fade curves for x and y
    const u = this.fade(x);
    const v = this.fade(y);
    
    // Hash coordinates of the 4 cube corners
    const A = this.p[X] + Y;
    const AA = this.p[A];
    const AB = this.p[A + 1];
    const B = this.p[X + 1] + Y;
    const BA = this.p[B];
    const BB = this.p[B + 1];
    
    // Blend results from 4 corners of square
    const gradAA = this.grad2D(this.p[AA], x, y);
    const gradBA = this.grad2D(this.p[BA], x - 1, y);
    const gradAB = this.grad2D(this.p[AB], x, y - 1);
    const gradBB = this.grad2D(this.p[BB], x - 1, y - 1);
    
    const lerpX1 = this.lerp(u, gradAA, gradBA);
    const lerpX2 = this.lerp(u, gradAB, gradBB);
    
    return this.lerp(v, lerpX1, lerpX2);
  }
  
  /**
   * Fade function for smooth interpolation
   * Uses 6t^5 - 15t^4 + 10t^3 (Perlin's improved fade)
   * @param {number} t - Input value [0, 1]
   * @returns {number} Smoothed value
   */
  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  /**
   * Linear interpolation
   * @param {number} t - Interpolation factor [0, 1]
   * @param {number} a - Start value
   * @param {number} b - End value
   * @returns {number} Interpolated value
   */
  lerp(t, a, b) {
    return a + t * (b - a);
  }
  
  /**
   * Gradient function for 2D noise
   * @param {number} hash - Hash value
   * @param {number} x - X distance from grid point
   * @param {number} y - Y distance from grid point
   * @returns {number} Dot product of gradient vector and distance vector
   */
  grad2D(hash, x, y) {
    // Convert low 2 bits of hash into gradient direction
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}

// Terrain color constants (matching worker.js)
const TERRAIN_COLORS = {
  water:    [18,  15,  34],
  plain:    [140, 170, 88],
  highland: [176, 159, 114],
  mountain: [190, 190, 190]
};

/**
 * Detect terrain zone from RGB color
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Zone index: 0=water, 1=plain, 2=highland, 3=mountain
 */
function detectTerrainZone(r, g, b) {
  // Calculate color distance to each terrain type
  const distances = [
    Math.hypot(r - TERRAIN_COLORS.water[0], g - TERRAIN_COLORS.water[1], b - TERRAIN_COLORS.water[2]),
    Math.hypot(r - TERRAIN_COLORS.plain[0], g - TERRAIN_COLORS.plain[1], b - TERRAIN_COLORS.plain[2]),
    Math.hypot(r - TERRAIN_COLORS.highland[0], g - TERRAIN_COLORS.highland[1], b - TERRAIN_COLORS.highland[2]),
    Math.hypot(r - TERRAIN_COLORS.mountain[0], g - TERRAIN_COLORS.mountain[1], b - TERRAIN_COLORS.mountain[2])
  ];
  
  // Return zone with minimum distance
  let minDist = distances[0];
  let minZone = 0;
  for (let i = 1; i < distances.length; i++) {
    if (distances[i] < minDist) {
      minDist = distances[i];
      minZone = i;
    }
  }
  return minZone;
}

/**
 * Get terrain color from zone index
 * @param {number} zone - Zone index (0-3)
 * @returns {Array<number>} RGB color array [r, g, b]
 */
function getTerrainColor(zone) {
  const colors = [
    TERRAIN_COLORS.water,
    TERRAIN_COLORS.plain,
    TERRAIN_COLORS.highland,
    TERRAIN_COLORS.mountain
  ];
  return colors[zone];
}

/**
 * Detect terrain boundaries within masked region
 * Identifies adjacent pixels with different terrain zones
 * @param {Uint8Array} zones - Terrain zone map (0-3 per pixel)
 * @param {Uint8Array} maskData - Mask values (0-255)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Array<Object>} Array of boundary pixel pairs: [{x1, y1, zone1, x2, y2, zone2}, ...]
 */
function detectTerrainBoundaries(zones, maskData, width, height) {
  const boundaries = [];
  
  // Iterate through all pixels in the masked region
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      
      // Skip pixels outside the mask
      if (maskData[index] === 0) {
        continue;
      }
      
      const currentZone = zones[index];
      
      // Check right neighbor (x+1, y)
      if (x < width - 1) {
        const rightIndex = index + 1;
        // Only process if neighbor is also masked
        if (maskData[rightIndex] > 0) {
          const rightZone = zones[rightIndex];
          // If zones differ, this is a boundary
          if (currentZone !== rightZone) {
            boundaries.push({
              x1: x,
              y1: y,
              zone1: currentZone,
              x2: x + 1,
              y2: y,
              zone2: rightZone
            });
          }
        }
      }
      
      // Check bottom neighbor (x, y+1)
      if (y < height - 1) {
        const bottomIndex = index + width;
        // Only process if neighbor is also masked
        if (maskData[bottomIndex] > 0) {
          const bottomZone = zones[bottomIndex];
          // If zones differ, this is a boundary
          if (currentZone !== bottomZone) {
            boundaries.push({
              x1: x,
              y1: y,
              zone1: currentZone,
              x2: x,
              y2: y + 1,
              zone2: bottomZone
            });
          }
        }
      }
    }
  }
  
  return boundaries;
}

// Message handler
self.onmessage = function({ data }) {
  const { type } = data;
  
  if (type === 'naturalize') {
    const { imageData, maskData, width, height, params } = data;
    
    // Validate input
    if (!imageData || !maskData || !width || !height) {
      self.postMessage({ 
        type: 'naturalize-error', 
        error: 'Missing required parameters' 
      });
      return;
    }
    
    // Extract parameters with defaults
    const transitionWidth = params?.transitionWidth ?? 10;
    const noiseFrequency = params?.noiseFrequency ?? 0.05;
    const islandDensity = params?.islandDensity ?? 0.3;
    
    // Create terrain zone map from imageData
    const zones = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const pixelIndex = i * 4;
      const r = imageData[pixelIndex];
      const g = imageData[pixelIndex + 1];
      const b = imageData[pixelIndex + 2];
      zones[i] = detectTerrainZone(r, g, b);
    }
    
    // Task 2.2: Detect terrain boundaries within masked region
    const boundaries = detectTerrainBoundaries(zones, maskData, width, height);
    
    // Task 2.3: Highland insertion logic
    // Initialize Perlin noise generator
    const noise = new PerlinNoise(12345); // Fixed seed for consistency
    
    // Create a copy of zones for modification
    const naturalizedZones = new Uint8Array(zones);
    
    // Process Mountain-Plain boundaries
    const mountainPlainBoundaries = boundaries.filter(b => 
      (b.zone1 === 3 && b.zone2 === 1) || (b.zone1 === 1 && b.zone2 === 3)
    );
    
    // For each Mountain-Plain boundary, apply highland insertion
    for (const boundary of mountainPlainBoundaries) {
      // Determine which side is mountain and which is plain
      const mountainX = boundary.zone1 === 3 ? boundary.x1 : boundary.x2;
      const mountainY = boundary.zone1 === 3 ? boundary.y1 : boundary.y2;
      
      // Process pixels in the transition zone around this boundary
      // We'll check all pixels within transitionWidth distance
      const minX = Math.max(0, Math.min(boundary.x1, boundary.x2) - transitionWidth);
      const maxX = Math.min(width - 1, Math.max(boundary.x1, boundary.x2) + transitionWidth);
      const minY = Math.max(0, Math.min(boundary.y1, boundary.y2) - transitionWidth);
      const maxY = Math.min(height - 1, Math.max(boundary.y1, boundary.y2) + transitionWidth);
      
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const index = y * width + x;
          
          // Only process masked pixels that are currently Plain
          if (maskData[index] === 0 || naturalizedZones[index] !== 1) {
            continue;
          }
          
          // Calculate distance from this pixel to the mountain pixel
          const distance = Math.hypot(x - mountainX, y - mountainY);
          
          // Skip if outside transition zone
          if (distance > transitionWidth) {
            continue;
          }
          
          // Calculate noise value at this position
          const noiseValue = noise.noise2D(x * noiseFrequency, y * noiseFrequency);
          
          // Apply probability formula: P = noise(x,y) * (1 - distance/transitionWidth)
          // Normalize noise from [-1, 1] to [0, 1]
          const normalizedNoise = (noiseValue + 1) / 2;
          const probability = normalizedNoise * (1 - distance / transitionWidth);
          
          // Insert Highland pixel where P > 0.5
          if (probability > 0.5) {
            naturalizedZones[index] = 2; // Highland
          }
        }
      }
    }
    
    // Task 2.4: Fractal coastline generation
    // Process Plain-Water boundaries
    const plainWaterBoundaries = boundaries.filter(b => 
      (b.zone1 === 1 && b.zone2 === 0) || (b.zone1 === 0 && b.zone2 === 1)
    );
    
    // For each Plain-Water boundary, apply noise-based displacement
    for (const boundary of plainWaterBoundaries) {
      // Determine which side is plain and which is water
      const plainX = boundary.zone1 === 1 ? boundary.x1 : boundary.x2;
      const plainY = boundary.zone1 === 1 ? boundary.y1 : boundary.y2;
      const waterX = boundary.zone1 === 0 ? boundary.x1 : boundary.x2;
      const waterY = boundary.zone1 === 0 ? boundary.y1 : boundary.y2;
      
      // Process pixels in the transition zone around this boundary
      const minX = Math.max(0, Math.min(boundary.x1, boundary.x2) - transitionWidth);
      const maxX = Math.min(width - 1, Math.max(boundary.x1, boundary.x2) + transitionWidth);
      const minY = Math.max(0, Math.min(boundary.y1, boundary.y2) - transitionWidth);
      const maxY = Math.min(height - 1, Math.max(boundary.y1, boundary.y2) + transitionWidth);
      
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const index = y * width + x;
          
          // Only process masked pixels
          if (maskData[index] === 0) {
            continue;
          }
          
          const currentZone = naturalizedZones[index];
          
          // Only process water or plain pixels near the boundary
          if (currentZone !== 0 && currentZone !== 1) {
            continue;
          }
          
          // Calculate distance from this pixel to the boundary
          const distanceToBoundary = Math.min(
            Math.hypot(x - plainX, y - plainY),
            Math.hypot(x - waterX, y - waterY)
          );
          
          // Skip if outside transition zone
          if (distanceToBoundary > transitionWidth) {
            continue;
          }
          
          // Calculate noise value at this position
          const noiseValue = noise.noise2D(x * noiseFrequency, y * noiseFrequency);
          
          // Apply fractal displacement using noise threshold
          // Normalize noise from [-1, 1] to [0, 1]
          const normalizedNoise = (noiseValue + 1) / 2;
          
          // Create jagged edges by using noise to determine terrain type
          // The threshold varies with distance from boundary
          const distanceFactor = 1 - (distanceToBoundary / transitionWidth);
          const threshold = 0.5 + (distanceFactor * 0.3); // Range: 0.5 to 0.8
          
          // If pixel is currently water and noise is high, convert to plain (land expansion)
          if (currentZone === 0 && normalizedNoise > threshold) {
            naturalizedZones[index] = 1; // Plain
          }
          // If pixel is currently plain and noise is low, convert to water (erosion)
          else if (currentZone === 1 && normalizedNoise < (1 - threshold)) {
            naturalizedZones[index] = 0; // Water
          }
        }
      }
    }
    
    // Task 2.5: Island generation
    // Find water zones adjacent to land within the masked region
    const waterAdjacentToLand = new Set();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        // Skip if not masked or not water
        if (maskData[index] === 0 || naturalizedZones[index] !== 0) {
          continue;
        }
        
        // Check if adjacent to land (Plain, Highland, or Mountain)
        let adjacentToLand = false;
        
        // Check 4-connected neighbors
        const neighbors = [
          { dx: -1, dy: 0 },  // left
          { dx: 1, dy: 0 },   // right
          { dx: 0, dy: -1 },  // top
          { dx: 0, dy: 1 }    // bottom
        ];
        
        for (const { dx, dy } of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighborIndex = ny * width + nx;
            const neighborZone = naturalizedZones[neighborIndex];
            
            // Check if neighbor is land (Plain=1, Highland=2, Mountain=3)
            if (neighborZone >= 1 && neighborZone <= 3) {
              adjacentToLand = true;
              break;
            }
          }
        }
        
        if (adjacentToLand) {
          waterAdjacentToLand.add(index);
        }
      }
    }
    
    // Generate island candidates using noise thresholding
    // Island density controls the threshold: higher density = lower threshold = more islands
    // Density 0.0 = threshold 0.9 (almost no islands)
    // Density 1.0 = threshold 0.1 (maximum islands)
    const noiseThreshold = 0.9 - (islandDensity * 0.8);
    
    const islandCandidates = new Set();
    
    for (const index of waterAdjacentToLand) {
      const x = index % width;
      const y = Math.floor(index / width);
      
      // Calculate noise value at this position
      const noiseValue = noise.noise2D(x * noiseFrequency, y * noiseFrequency);
      
      // Normalize noise from [-1, 1] to [0, 1]
      const normalizedNoise = (noiseValue + 1) / 2;
      
      // If noise exceeds threshold, mark as island candidate
      if (normalizedNoise > noiseThreshold) {
        islandCandidates.add(index);
      }
    }
    
    // Detect connected components (islands) using flood fill
    const visited = new Set();
    const islands = [];
    
    function floodFill(startIndex) {
      const island = [];
      const queue = [startIndex];
      visited.add(startIndex);
      
      while (queue.length > 0) {
        const currentIndex = queue.shift();
        island.push(currentIndex);
        
        const x = currentIndex % width;
        const y = Math.floor(currentIndex / width);
        
        // Check 4-connected neighbors
        const neighbors = [
          { dx: -1, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 }
        ];
        
        for (const { dx, dy } of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighborIndex = ny * width + nx;
            
            if (islandCandidates.has(neighborIndex) && !visited.has(neighborIndex)) {
              visited.add(neighborIndex);
              queue.push(neighborIndex);
            }
          }
        }
      }
      
      return island;
    }
    
    // Find all islands
    for (const index of islandCandidates) {
      if (!visited.has(index)) {
        const island = floodFill(index);
        islands.push(island);
      }
    }
    
    // Filter islands by size (5-200 pixels) and assign terrain type
    for (const island of islands) {
      const size = island.length;
      
      // Skip islands outside the valid size range
      if (size < 5 || size > 200) {
        continue;
      }
      
      // Calculate average noise amplitude for the island to determine terrain type
      let totalNoiseAmplitude = 0;
      
      for (const index of island) {
        const x = index % width;
        const y = Math.floor(index / width);
        
        const noiseValue = noise.noise2D(x * noiseFrequency, y * noiseFrequency);
        // Use absolute value as amplitude
        totalNoiseAmplitude += Math.abs(noiseValue);
      }
      
      const avgNoiseAmplitude = totalNoiseAmplitude / size;
      
      // Assign terrain type based on noise amplitude
      // Higher amplitude (> 0.6) = Highland, lower amplitude = Plain
      const terrainType = avgNoiseAmplitude > 0.6 ? 2 : 1; // 2=Highland, 1=Plain
      
      // Apply the island to naturalizedZones
      for (const index of island) {
        naturalizedZones[index] = terrainType;
      }
    }
    
    // Task 2.6: Mask blending
    // Store original imageData for blending
    const originalImageData = new Uint8ClampedArray(imageData);
    
    // Convert naturalized zones to colors
    const naturalizedImageData = new Uint8ClampedArray(imageData.length);
    for (let i = 0; i < naturalizedZones.length; i++) {
      const color = getTerrainColor(naturalizedZones[i]);
      naturalizedImageData[i * 4] = color[0];
      naturalizedImageData[i * 4 + 1] = color[1];
      naturalizedImageData[i * 4 + 2] = color[2];
      naturalizedImageData[i * 4 + 3] = 255;
    }
    
    // Blend based on mask values
    for (let i = 0; i < width * height; i++) {
      const maskValue = maskData[i];
      const pixelIndex = i * 4;
      
      if (maskValue === 0) {
        // Mask value 0: preserve original pixel
        imageData[pixelIndex] = originalImageData[pixelIndex];
        imageData[pixelIndex + 1] = originalImageData[pixelIndex + 1];
        imageData[pixelIndex + 2] = originalImageData[pixelIndex + 2];
        imageData[pixelIndex + 3] = originalImageData[pixelIndex + 3];
      } else if (maskValue === 255) {
        // Mask value 255: use fully naturalized pixel
        imageData[pixelIndex] = naturalizedImageData[pixelIndex];
        imageData[pixelIndex + 1] = naturalizedImageData[pixelIndex + 1];
        imageData[pixelIndex + 2] = naturalizedImageData[pixelIndex + 2];
        imageData[pixelIndex + 3] = naturalizedImageData[pixelIndex + 3];
      } else {
        // Mask values 1-254: blend using formula
        // result = original * (1 - M/255) + naturalized * (M/255)
        const blendFactor = maskValue / 255;
        const invBlendFactor = 1 - blendFactor;
        
        imageData[pixelIndex] = Math.round(
          originalImageData[pixelIndex] * invBlendFactor + 
          naturalizedImageData[pixelIndex] * blendFactor
        );
        imageData[pixelIndex + 1] = Math.round(
          originalImageData[pixelIndex + 1] * invBlendFactor + 
          naturalizedImageData[pixelIndex + 1] * blendFactor
        );
        imageData[pixelIndex + 2] = Math.round(
          originalImageData[pixelIndex + 2] * invBlendFactor + 
          naturalizedImageData[pixelIndex + 2] * blendFactor
        );
        imageData[pixelIndex + 3] = 255;
      }
    }
    
    // Task 2.7: Send processed result back to main thread
    // Package imageData with width and height
    // Use transferable objects ([imageData.buffer]) for performance
    // This transfers ownership of the ArrayBuffer to the main thread,
    // avoiding expensive memory copying (Requirement 9.5)
    self.postMessage({ 
      type: 'naturalize-result', 
      imageData, 
      width, 
      height 
    }, [imageData.buffer]);
  }
};
