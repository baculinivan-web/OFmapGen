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
 * Build distance fields for each terrain type
 * Uses fast sweeping algorithm for distance transform
 * @param {Uint8Array} zones - Terrain zone map (0-3 per pixel)
 * @param {Uint8Array} maskData - Mask values (0-255)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Object} Distance fields: { water: Float32Array, plain: Float32Array, highland: Float32Array, mountain: Float32Array }
 */
function buildDistanceFields(zones, maskData, width, height) {
  const size = width * height;
  const INF = 999999;
  
  // Initialize distance fields
  const distanceFields = {
    water: new Float32Array(size),
    plain: new Float32Array(size),
    highland: new Float32Array(size),
    mountain: new Float32Array(size)
  };
  
  // Initialize all distances to infinity
  distanceFields.water.fill(INF);
  distanceFields.plain.fill(INF);
  distanceFields.highland.fill(INF);
  distanceFields.mountain.fill(INF);
  
  // Set distance to 0 for pixels of each terrain type within masked region
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      
      // Only process masked pixels
      if (maskData[index] === 0) {
        continue;
      }
      
      const zone = zones[index];
      
      // Set distance to 0 for this terrain type
      if (zone === 0) distanceFields.water[index] = 0;
      else if (zone === 1) distanceFields.plain[index] = 0;
      else if (zone === 2) distanceFields.highland[index] = 0;
      else if (zone === 3) distanceFields.mountain[index] = 0;
    }
  }
  
  // Fast sweeping algorithm - propagate distances
  // We need multiple passes to ensure accurate distances
  const terrainTypes = ['water', 'plain', 'highland', 'mountain'];
  
  for (const terrainType of terrainTypes) {
    const field = distanceFields[terrainType];
    
    // Forward pass (top-left to bottom-right)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        // Skip unmasked pixels
        if (maskData[index] === 0) {
          continue;
        }
        
        let minDist = field[index];
        
        // Check left neighbor
        if (x > 0) {
          const leftIndex = index - 1;
          if (maskData[leftIndex] > 0) {
            minDist = Math.min(minDist, field[leftIndex] + 1);
          }
        }
        
        // Check top neighbor
        if (y > 0) {
          const topIndex = index - width;
          if (maskData[topIndex] > 0) {
            minDist = Math.min(minDist, field[topIndex] + 1);
          }
        }
        
        field[index] = minDist;
      }
    }
    
    // Backward pass (bottom-right to top-left)
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const index = y * width + x;
        
        // Skip unmasked pixels
        if (maskData[index] === 0) {
          continue;
        }
        
        let minDist = field[index];
        
        // Check right neighbor
        if (x < width - 1) {
          const rightIndex = index + 1;
          if (maskData[rightIndex] > 0) {
            minDist = Math.min(minDist, field[rightIndex] + 1);
          }
        }
        
        // Check bottom neighbor
        if (y < height - 1) {
          const bottomIndex = index + width;
          if (maskData[bottomIndex] > 0) {
            minDist = Math.min(minDist, field[bottomIndex] + 1);
          }
        }
        
        field[index] = minDist;
      }
    }
  }
  
  return distanceFields;
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
    
    // Task 2.6: Store original imageData for blending BEFORE any processing
    const originalImageData = new Uint8ClampedArray(imageData);
    
    // Create terrain zone map from imageData
    const zones = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const pixelIndex = i * 4;
      const r = imageData[pixelIndex];
      const g = imageData[pixelIndex + 1];
      const b = imageData[pixelIndex + 2];
      zones[i] = detectTerrainZone(r, g, b);
    }
    
    // Initialize Perlin noise generator
    const noise = new PerlinNoise(12345); // Fixed seed for consistency
    
    // NEW APPROACH: Boundary-based naturalization
    // Work ONLY with existing pixels - make boundaries between terrain types jagged and organic
    
    // Step 1: Find all boundary pixels (pixels that have a neighbor of different terrain type)
    const boundaryPixels = new Set();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        // Only process masked pixels
        if (maskData[index] === 0) {
          continue;
        }
        
        const currentZone = zones[index];
        
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
            
            // If neighbor is masked and has different terrain type, this is a boundary
            if (maskData[neighborIndex] > 0 && zones[neighborIndex] !== currentZone) {
              boundaryPixels.add(index);
              break;
            }
          }
        }
      }
    }
    
    // Step 2: For each boundary pixel, use noise to potentially change it to a neighboring terrain type
    // This creates jagged, organic boundaries
    const naturalizedZones = new Uint8Array(zones);
    
    for (const index of boundaryPixels) {
      const x = index % width;
      const y = Math.floor(index / width);
      const currentZone = zones[index];
      
      // Multi-octave fractal noise for organic variation
      const noise1 = noise.noise2D(x * noiseFrequency, y * noiseFrequency);
      const noise2 = noise.noise2D(x * noiseFrequency * 2, y * noiseFrequency * 2) * 0.5;
      const noise3 = noise.noise2D(x * noiseFrequency * 4, y * noiseFrequency * 4) * 0.25;
      const fractalNoise = noise1 + noise2 + noise3;
      
      // Normalize fractal noise from [-1.75, 1.75] to [-1, 1]
      const normalizedNoise = fractalNoise / 1.75;
      
      // Find neighboring terrain types
      const neighboringTerrains = new Set();
      const neighbors = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
      ];
      
      for (const { dx, dy } of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const neighborIndex = ny * width + nx;
          if (maskData[neighborIndex] > 0 && zones[neighborIndex] !== currentZone) {
            neighboringTerrains.add(zones[neighborIndex]);
          }
        }
      }
      
      // If no neighboring terrains, keep current
      if (neighboringTerrains.size === 0) {
        continue;
      }
      
      // Use noise to decide whether to change this pixel
      // Higher transition width = more aggressive changes
      const changeThreshold = 0.3 - (transitionWidth / 100);
      
      if (normalizedNoise > changeThreshold) {
        // Change to a neighboring terrain type
        // Prefer terrain types that are "adjacent" in elevation hierarchy
        const neighborArray = Array.from(neighboringTerrains);
        
        // For each neighboring terrain, calculate how "natural" the transition would be
        let bestTerrain = currentZone;
        let bestScore = -999;
        
        for (const neighborTerrain of neighborArray) {
          // Calculate elevation difference (smaller is more natural)
          const elevationDiff = Math.abs(neighborTerrain - currentZone);
          
          // Prefer transitions to adjacent elevation levels
          // Mountain(3) <-> Highland(2) <-> Plain(1) <-> Water(0)
          let score = normalizedNoise;
          
          if (elevationDiff === 1) {
            // Adjacent elevation - very natural
            score += 0.5;
          } else if (elevationDiff === 2) {
            // Skip one level - less natural but possible
            score += 0.2;
            
            // Insert intermediate terrain (highland between mountain and plain)
            if ((currentZone === 3 && neighborTerrain === 1) || 
                (currentZone === 1 && neighborTerrain === 3)) {
              // This is mountain-plain boundary, prefer highland
              if (normalizedNoise > 0) {
                bestTerrain = 2; // Highland
                bestScore = 999; // Force this choice
                break;
              }
            }
          } else {
            // Large elevation jump - unnatural
            score -= 0.3;
          }
          
          if (score > bestScore) {
            bestScore = score;
            bestTerrain = neighborTerrain;
          }
        }
        
        naturalizedZones[index] = bestTerrain;
      }
    }
    
    // Step 3: Expand boundaries outward to create transition zones
    // This makes the effect more visible and creates gradual transitions
    for (let iteration = 0; iteration < Math.floor(transitionWidth / 2); iteration++) {
      const changedPixels = [];
      
      for (const index of boundaryPixels) {
        const x = index % width;
        const y = Math.floor(index / width);
        
        // Check neighbors in a small radius
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborIndex = ny * width + nx;
              
              if (maskData[neighborIndex] > 0 && 
                  zones[neighborIndex] !== naturalizedZones[index] &&
                  !boundaryPixels.has(neighborIndex)) {
                
                // Use noise to decide if we should expand here
                const noise1 = noise.noise2D(nx * noiseFrequency, ny * noiseFrequency);
                const expandThreshold = 0.2 - (iteration * 0.1);
                
                if (noise1 > expandThreshold) {
                  changedPixels.push({
                    index: neighborIndex,
                    newZone: naturalizedZones[index]
                  });
                  boundaryPixels.add(neighborIndex);
                }
              }
            }
          }
        }
      }
      
      // Apply changes
      for (const { index, newZone } of changedPixels) {
        naturalizedZones[index] = newZone;
      }
    }
    
    // Step 4: Add small islands in water areas based on island density
    if (islandDensity > 0) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          
          // Only process masked water pixels
          if (maskData[index] === 0 || naturalizedZones[index] !== 0) {
            continue;
          }
          
          // Check if near land
          let nearLand = false;
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const neighborIndex = ny * width + nx;
                if (maskData[neighborIndex] > 0 && naturalizedZones[neighborIndex] >= 1) {
                  nearLand = true;
                  break;
                }
              }
            }
            if (nearLand) break;
          }
          
          if (!nearLand) continue;
          
          // Use noise to generate islands
          const noise1 = noise.noise2D(x * noiseFrequency, y * noiseFrequency);
          const islandThreshold = 0.85 - (islandDensity * 0.4);
          
          if (noise1 > islandThreshold) {
            naturalizedZones[index] = 1; // Plain (small island)
          }
        }
      }
    }
    
    // Task 2.6: Mask blending
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
