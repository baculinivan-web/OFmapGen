# OpenFront Map Generator

A browser-based tool that converts images or real-world elevation data into playable maps for [openfront.io](https://openfront.io).

## Core Features

- Upload any image (PNG/JPG/WebP) and map brightness to terrain zones
- Import real-world elevation data by drawing a bounding box on a Leaflet map
- Three processing algorithms: Legacy (pixel-perfect), Smooth (noise removal), Advanced (AI segmentation via ONNX u2netp model)
- Paint terrain directly on the map with customizable brushes
- Create realistic winding rivers with adjustable curvature
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

- Elevation tiles: AWS Terrarium (`s3.amazonaws.com/elevation-tiles-prod/terrarium/`)
- Rivers: OpenStreetMap Overpass API
- Map tiles: CartoDB Voyager via Leaflet

## Target Users

Developers and players of openfront.io who want custom maps from real geography or custom artwork.
