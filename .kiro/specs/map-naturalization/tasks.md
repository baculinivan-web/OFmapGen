# Implementation Plan: Map Naturalization

## Overview

This plan implements the Map Naturalization feature, which transforms sharp terrain boundaries into organic, realistic transitions using Perlin noise. The implementation extends the existing Paint Modal with a new naturalization tool, adds a Web Worker for processing, and integrates with the existing undo/redo system.

## Tasks

- [x] 1. Create Perlin noise implementation in Web Worker
  - Create `naturalization-worker.js` file
  - Implement `PerlinNoise` class with permutation table initialization
  - Implement `noise2D(x, y)` method returning values in [-1, 1]
  - Add helper functions for gradient interpolation (fade, lerp)
  - _Requirements: 11.1, 11.3, 11.4_

- [x] 2. Implement terrain naturalization algorithm in worker
  - [x] 2.1 Add message handler for 'naturalize' type
    - Parse incoming message with imageData, maskData, width, height, params
    - Set up terrain zone detection using existing TERRAIN_COLORS
    - _Requirements: 3.1, 10.1_
  
  - [x] 2.2 Implement terrain boundary detection
    - Identify adjacent pixels with different terrain zones
    - Build list of boundary pixel pairs within masked region
    - _Requirements: 3.1_
  
  - [x] 2.3 Implement highland insertion logic
    - For Mountain-Plain boundaries, calculate distance from mountain
    - Apply probability formula: P = noise(x,y) * (1 - distance/transitionWidth)
    - Insert Highland pixels where P > 0.5
    - _Requirements: 3.3, 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [x] 2.4 Implement fractal coastline generation
    - For Plain-Water boundaries, apply noise-based displacement
    - Create jagged edges using noise threshold
    - _Requirements: 3.4_
  
  - [x] 2.5 Implement island generation
    - Generate island candidates in Water zones adjacent to land
    - Filter islands by size (5-200 pixels)
    - Assign terrain type (Plain/Highland) based on noise amplitude
    - Apply island density parameter
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 2.6 Implement mask blending
    - For mask value 0: preserve original pixel
    - For mask value 255: use fully naturalized pixel
    - For mask values 1-254: blend using formula result = original * (1 - M/255) + naturalized * (M/255)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  
  - [x] 2.7 Send processed result back to main thread
    - Package imageData with width and height
    - Use transferable objects for performance
    - _Requirements: 9.5_

- [x] 3. Checkpoint - Verify worker implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Add naturalization UI to Paint Modal
  - [x] 4.1 Add naturalization button to toolbar
    - Insert button after terrain buttons in paint.js
    - Add SVG icon and label
    - Style with existing CSS variables
    - _Requirements: 1.1, 12.1, 12.2_
  
  - [x] 4.2 Create parameter panel UI
    - Add collapsible panel below toolbar
    - Add transition width slider (2-50px, default 10)
    - Add noise frequency slider (0.01-0.1, default 0.05)
    - Add island density slider (0.0-1.0, default 0.3)
    - Add Preview, Apply, Cancel buttons
    - _Requirements: 6.1, 6.2, 6.3, 12.3_
  
  - [x] 4.3 Implement parameter persistence
    - Save parameters to localStorage on change
    - Load parameters on modal open
    - _Requirements: 6.5_

- [x] 5. Implement mask drawing system
  - [x] 5.1 Create mask canvas
    - Initialize maskCanvas with same dimensions as paintCanvas
    - Store mask as Uint8Array (0-255 values)
    - _Requirements: 2.1, 2.2_
  
  - [x] 5.2 Implement mask drawing mode
    - Reuse existing brush system for mask drawing
    - Draw white (255) on mask canvas
    - Display semi-transparent red overlay during drawing
    - Support brush size adjustment (1-120 pixels)
    - _Requirements: 2.1, 2.3, 2.4, 2.5_
  
  - [x] 5.3 Add tool activation/deactivation logic
    - Activate naturalization mode on button click
    - Deactivate when switching to terrain brush
    - Clear mask canvas on deactivation
    - _Requirements: 1.3, 1.4_

- [x] 6. Implement preview and apply workflow
  - [x] 6.1 Add preview generation
    - Spawn naturalization-worker.js
    - Send current paintCanvas data and mask to worker
    - Display result as semi-transparent overlay
    - Show progress indicator if processing > 500ms
    - _Requirements: 7.1, 7.2, 9.3_
  
  - [x] 6.2 Implement apply functionality
    - Commit preview to paintCanvas on Apply click
    - Save to undo stack before committing
    - Clear mask canvas after apply
    - _Requirements: 7.3, 8.1, 10.5_
  
  - [x] 6.3 Implement cancel functionality
    - Discard preview on Cancel click
    - Restore original paintCanvas state
    - Clear mask canvas
    - _Requirements: 7.4_

- [x] 7. Add input validation and error handling
  - [x] 7.1 Validate parameters
    - Clamp transition width to [2, 50]
    - Clamp noise frequency to [0.01, 0.1]
    - Clamp island density to [0.0, 1.0]
    - Disable preview/apply if mask is empty
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 7.2 Handle worker errors
    - Catch worker crashes and show error message
    - Implement 10-second timeout with cancel option
    - Fall back to main thread if worker unavailable
    - _Requirements: 9.1, 9.2_
  
  - [x] 7.3 Handle canvas errors
    - Check paintCanvas initialization before operations
    - Handle dimension mismatches
    - Catch out-of-memory errors
    - _Requirements: 9.1, 9.2_

- [x] 8. Integrate with existing undo/redo system
  - [x] 8.1 Save state before naturalization
    - Call saveHistory() before applying naturalization
    - Ensure undo stack has capacity (max 30 operations)
    - _Requirements: 8.1, 8.3, 8.4_
  
  - [x] 8.2 Test undo/redo functionality
    - Verify Ctrl+Z restores pre-naturalization state
    - Verify Ctrl+Shift+Z/Ctrl+Y redo works
    - Test with multiple naturalization operations
    - _Requirements: 8.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks build on existing paint.js infrastructure
- Worker follows existing worker.js pattern for consistency
- UI uses existing CSS variables for styling
- Parameter sliders follow existing slider patterns
- Undo/redo integration uses existing saveHistory() mechanism
- No external dependencies required (Perlin noise implemented from scratch)
