# River Creation Feature

## Overview

Added a new river creation tool to the terrain paint editor that allows users to create realistic, winding rivers by placing control points.

## How It Works

### User Workflow

1. Open the paint editor (click "Open editor" after generating a map)
2. Click the "Create river" button to enter river mode
3. Place start point by clicking on the map
4. Place end point by clicking again — a winding river appears automatically
5. Add more control points to refine the river's path
6. Adjust windiness slider (0-100%) to control curvature
7. Adjust width slider (1-20 pixels) to control thickness
8. Click "Finish river" to complete or "Cancel" to discard

### Technical Implementation

#### Files Added/Modified

- **rivers.js** (NEW) — River path generation algorithms
  - `generateRiverPath()` — Creates winding path using multi-frequency sine waves
  - `smoothRiverPath()` — Catmull-Rom spline interpolation for smooth curves
  - `drawRiver()` — Renders river to canvas
  - `RiverLayer` class — Manages multiple rivers and editing state

- **paint.js** (MODIFIED) — Integrated river tool into paint editor
  - Added river mode toggle
  - Added river controls (windiness, width)
  - Modified mouse/touch handlers to support point placement
  - Added separate river canvas layer
  - Rivers are composited when applying changes

- **index.html** (MODIFIED) — Added UI elements
  - River mode button with icon
  - River controls panel (windiness, width sliders)
  - Finish/Cancel buttons for river editing

- **style.css** (MODIFIED) — Added styles for river button

#### Algorithm Details

**Path Generation:**
- Uses multi-frequency sine waves (3 frequencies) for natural variation
- Perpendicular offset from straight line creates curves
- Windiness factor smoothly transitions from 0 at control points to max at midpoints
- Segment length parameter controls point density

**Smoothing:**
- Catmull-Rom spline interpolation between generated points
- Creates smooth, continuous curves
- Preserves control point positions

**Rendering:**
- Rivers drawn with round line caps and joins
- Same color as water terrain (RGB: 18, 15, 34)
- Separate canvas layer for easy editing
- Control points shown as blue circles with connecting dashed lines

## Key Features

✅ Realistic curves even with just 2 control points
✅ Adjustable windiness (0-100%)
✅ Adjustable width (1-20 pixels)
✅ Add unlimited control points to refine path
✅ Visual feedback with control point markers
✅ Separate layer — can be edited independently
✅ Touch support for mobile devices
✅ Undo/redo support (via history system)

## Usage Example

```javascript
// Create river layer
const riverLayer = new RiverLayer();

// Start a river
riverLayer.startRiver(
  { x: 100, y: 100 },  // start point
  { x: 500, y: 400 },  // end point
  0.5,                 // windiness (0-1)
  3                    // width in pixels
);

// Add control points to refine
riverLayer.addControlPoint({ x: 300, y: 200 });

// Adjust parameters
riverLayer.setWindiness(0.7);
riverLayer.setWidth(5);

// Finish and add to layer
riverLayer.finishRiver();

// Render to canvas
const ctx = canvas.getContext('2d');
riverLayer.render(ctx, [18, 15, 34]); // water color
```

## Future Enhancements

Possible improvements:
- River width variation along path
- Branching rivers (tributaries)
- River erosion effect on terrain
- Import/export river data
- Preset river shapes (meandering, braided, etc.)
- Snap to terrain contours for realistic flow

## Testing

To test the feature:
1. Start local server: `npx serve .`
2. Open http://localhost:3000
3. Upload an image or create blank map
4. Click "Open editor"
5. Click "Create river"
6. Place points and adjust settings
7. Verify river appears with realistic curves
8. Test undo/redo, finish/cancel
9. Apply changes and verify river is saved to map
