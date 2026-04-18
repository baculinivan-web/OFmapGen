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
    
    // NOISE-BASED BOUNDARY PERTURBATION
    // Instead of creating new terrain from scratch, we perturb existing boundaries
    // using noise to make them organic and realistic
    
    // FIX: Check what terrain types exist in the masked region
    const existingTerrains = new Set();
    for (let i = 0; i < zones.length; i++) {
      if (maskData[i] > 0) {
        existingTerrains.add(zones[i]);
      }
    }
    
    // Determine min and max terrain types that should exist
    const minTerrain = Math.min(...existingTerrains);
    const maxTerrain = Math.max(...existingTerrains);
    
    const naturalizedZones = new Uint8Array(zones);
    
    // Step 1: Find boundary pixels (pixels adjacent to different terrain types)
    const boundaryPixels = new Set();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        if (maskData[index] === 0) continue;
        
        const currentZone = zones[index];
        
        // Check 8-connected neighbors
        let hasDifferentNeighbor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborIndex = ny * width + nx;
              if (maskData[neighborIndex] > 0 && zones[neighborIndex] !== currentZone) {
                hasDifferentNeighbor = true;
                break;
              }
            }
          }
          if (hasDifferentNeighbor) break;
        }
        
        if (hasDifferentNeighbor) {
          boundaryPixels.add(index);
        }
      }
    }
    
    // Step 2: For boundary pixels and nearby pixels, use noise to perturb terrain type
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        
        if (maskData[index] === 0) continue;
        
        const currentZone = zones[index];
        
        // Calculate distance to nearest boundary
        let distToBoundary = 999999;
        for (const boundaryIndex of boundaryPixels) {
          const bx = boundaryIndex % width;
          const by = Math.floor(boundaryIndex / width);
          const dist = Math.hypot(x - bx, y - by);
          distToBoundary = Math.min(distToBoundary, dist);
        }
        
        // Only process pixels near boundaries (within transition width)
        if (distToBoundary > transitionWidth) {
          continue;
        }
        
        // Multi-octave fractal noise
        const noise1 = noise.noise2D(x * noiseFrequency, y * noiseFrequency);
        const noise2 = noise.noise2D(x * noiseFrequency * 2, y * noiseFrequency * 2) * 0.5;
        const noise3 = noise.noise2D(x * noiseFrequency * 4, y * noiseFrequency * 4) * 0.25;
        const fractalNoise = noise1 + noise2 + noise3;
        
        // Normalize noise from [-1.75, 1.75] to [-1, 1]
        const normalizedNoise = fractalNoise / 1.75;
        
        // Noise strength increases near boundaries, decreases away from them
        const boundaryFactor = 1 - (distToBoundary / transitionWidth);
        const effectiveNoise = normalizedNoise * boundaryFactor;
        
        // Find neighboring terrain types
        const neighborTypes = new Set();
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborIndex = ny * width + nx;
              if (maskData[neighborIndex] > 0) {
                neighborTypes.add(zones[neighborIndex]);
              }
            }
          }
        }
        
        // Determine new terrain type based on noise and neighbors
        // Terrain hierarchy: Water(0) < Plain(1) < Highland(2) < Mountain(3)
        let newTerrain = currentZone;
        
        if (effectiveNoise > 0.4) {
          // Strong positive noise - try to increase elevation
          if (currentZone < 3 && neighborTypes.has(currentZone + 1)) {
            newTerrain = currentZone + 1;
          }
        } else if (effectiveNoise < -0.4) {
          // Strong negative noise - try to decrease elevation
          if (currentZone > 0 && neighborTypes.has(currentZone - 1)) {
            newTerrain = currentZone - 1;
          }
        } else if (Math.abs(effectiveNoise) > 0.2) {
          // Medium noise - might change to adjacent terrain
          // Check if we should insert intermediate terrain (highland between mountain and plain)
          if (currentZone === 1 && neighborTypes.has(3)) {
            // Plain next to mountain - insert highland
            if (effectiveNoise > 0) {
              newTerrain = 2; // Highland
            }
          } else if (currentZone === 3 && neighborTypes.has(1)) {
            // Mountain next to plain - insert highland
            if (effectiveNoise < 0) {
              newTerrain = 2; // Highland
            }
          }
        }
        
        // FIX: Clamp to existing terrain range
        // If no water exists in the mask, don't create water
        newTerrain = Math.max(minTerrain, Math.min(maxTerrain, newTerrain));
        
        naturalizedZones[index] = newTerrain;
      }
    }
    
    // Step 3: Add small islands in water based on island density
    if (islandDensity > 0 && existingTerrains.has(0)) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          
          if (maskData[index] === 0 || naturalizedZones[index] !== 0) continue;
          
          // Check if near land
          let nearLand = false;
          for (let dy = -5; dy <= 5; dy++) {
            for (let dx = -5; dx <= 5; dx++) {
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
