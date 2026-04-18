# Water Preservation Fix

## Problem

The naturalization algorithm was adding water on the edges of maps even when the mask didn't contain any water. This was particularly noticeable when:
- Drawing a mountain point on a plain island
- Masking around the mountain
- Running naturalization

The edges of the map would turn into water, even though the original map had no water at all.

## Root Cause

The algorithm calculated elevation based on distance from mountains:

```javascript
const maxDist = transitionWidth * 3;
let elevation = 3 - (distToMountain / maxDist) * 3; // 3 at mountain, 0 far away
```

This approach meant that:
- Areas close to mountains had high elevation (mountain/highland)
- Areas far from mountains had low elevation (water)
- **Water was created automatically in areas far from mountains**, regardless of whether water existed in the original mask

This violated the principle that naturalization should only enhance existing terrain, not create entirely new terrain types where they didn't exist.

## Solution

Changed the algorithm to use a **closest-terrain approach** instead of a distance-from-mountains approach:

### New Algorithm

1. **Find closest terrain type** for each pixel:
   ```javascript
   const distances = [distToWater, distToPlain, distToHighland, distToMountain];
   let minDist = distances[0];
   let closestTerrain = 0;
   for (let i = 1; i < distances.length; i++) {
     if (distances[i] < minDist) {
       minDist = distances[i];
       closestTerrain = i;
     }
   }
   ```

2. **Start with elevation of closest terrain**:
   ```javascript
   let elevation = closestTerrain; // 0=water, 1=plain, 2=highland, 3=mountain
   ```

3. **Add noise-based variation near boundaries**:
   ```javascript
   const noiseStrength = Math.min(1, (transitionWidth - minDist) / transitionWidth);
   if (noiseStrength > 0) {
     elevation += normalizedNoise * noiseStrength * 1.2;
   }
   ```

4. **Only create water if close to existing water**:
   ```javascript
   if (elevation < 0.5) {
     if (distToWater < transitionWidth) {
       // Near water - can create water/islands based on density
       if (normalizedNoise > (0.85 - islandDensity * 0.4) && elevation > 0.2) {
         naturalizedZones[index] = 1; // Small island
       } else {
         naturalizedZones[index] = 0; // Water
       }
     } else {
       // Far from water - keep as plain instead of creating water
       naturalizedZones[index] = 1; // Plain
     }
   }
   ```

### Key Improvements

- **Water preservation**: Water is only created near existing water
- **No edge artifacts**: Edges of maps without water stay as land
- **Smooth transitions**: Still creates natural transitions between terrain types
- **Island generation**: Islands still work correctly in water areas

## Testing

Created comprehensive test suite:

### test-water-preservation.html
Basic test that verifies:
- Original map with no water
- Result has no water after naturalization
- Edges specifically have no water

### test-water-edge-cases.html
Tests multiple scenarios:
1. Plain with mountain point (no water) → Should have no water
2. Water with land island → Should preserve water
3. Highland only (no water) → Should have no water

### test-final-water-fix.html
Complete verification with:
- Visual comparison (original, mask, result)
- Terrain distribution statistics
- Edge water detection
- Highland transition verification
- Overall pass/fail summary

## Files Changed

- `naturalization-worker.js`: Updated terrain assignment logic (lines ~220-280)
  - Changed from distance-from-mountains to closest-terrain approach
  - Added water proximity check before creating water
  - Preserved island generation logic

## Testing Results

All tests pass:
- ✓ Maps without water don't get water added
- ✓ Maps with water preserve water correctly
- ✓ Edges don't get unwanted water
- ✓ Smooth transitions still work correctly
- ✓ Highland transitions are created between mountain and plain
- ✓ Island generation still works in water areas

## Deployment

To deploy to dev:
```bash
git add naturalization-worker.js
git commit -m "Fix: prevent water creation on edges when mask contains no water"
git push origin dev
```

The fix will be automatically deployed to `devmaps.mivps.ru` via GitHub Actions.
