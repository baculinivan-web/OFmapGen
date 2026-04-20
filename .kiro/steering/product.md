# OpenFront Map Generator

A browser-based tool that converts images or real-world elevation data into playable maps for [openfront.io](https://openfront.io).

## Core Features

- Upload any image (PNG/JPG/WebP) and map brightness to terrain zones
- Adjust map size with custom scaling (512px to 4096px) or auto mode — determines in-game map size
- Import real-world elevation data by drawing a bounding box on a Leaflet map
- Choose between Terrarium (AWS) or SRTM v3.0 (NASA) elevation sources
- Select resolution (zoom level) from 3 to 14 for custom detail level (3=very low, 14=high detail)
- Choose final map size for GIS imports (512px to 4096px on longest side)
- Three processing algorithms: Legacy (pixel-perfect), Smooth (noise removal), Advanced (AI segmentation via ONNX u2netp model)
- Paint terrain directly on the map with customizable brushes
- Create realistic winding rivers with adjustable curvature
- Full undo/redo support for all editing actions (Ctrl+Z / Ctrl+Shift+Z)
- Layer system with visibility, locking, reordering, and jagged edges effects
- Export as visual preview PNG or OpenFront-compatible source PNG (specific color palette)
- Python desktop GUI alternative (`image_to_map.py`) using tkinter + Pillow

## Terrain Zones

| Zone     | Brightness range | Color         |
|----------|-----------------|---------------|
| Water    | ≤ water thresh  | Dark navy     |
| Plain    | ≤ plain thresh  | Green         |
| Highland | ≤ highland thresh | Tan         |
| Mountain | above all       | Light gray    |

## River Creation Tool

The river tool allows you to create realistic, winding rivers by placing control points:

1. Click "Create river" button in the paint editor
2. Place start point by clicking on the map
3. Place end point by clicking again
4. Add additional control points to refine the river path
5. Adjust windiness (0-100%) to control how much the river curves
6. Adjust width (1-20 pixels) to control river thickness
7. Click "Finish river" to complete, or "Cancel" to discard

Rivers are automatically generated with natural curves using multi-frequency noise algorithms. The river follows your control points while adding realistic meanders and bends.

## External Data Sources

- Elevation tiles: 
  - Terrarium (Mapzen) — ~30m resolution at equator, global coverage including bathymetry
  - NASA SRTM v3.0 — ~30m resolution at equator, global coverage
- Rivers: OpenStreetMap Overpass API
- Map tiles: CartoDB Voyager via Leaflet

## Target Users

Developers and players of openfront.io who want custom maps from real geography or custom artwork.
