# OpenFront Map Generator

A browser-based tool that converts images or real-world elevation data into playable maps for [openfront.io](https://openfront.io).

## Core Features

- Upload any image (PNG/JPG/WebP) and map brightness to terrain zones
- Import real-world elevation data by drawing a bounding box on a Leaflet map
- Three processing algorithms: Legacy (pixel-perfect), Smooth (noise removal), Advanced (AI segmentation via ONNX u2netp model)
- Export as visual preview PNG or OpenFront-compatible source PNG (specific color palette)
- Python desktop GUI alternative (`image_to_map.py`) using tkinter + Pillow

## Terrain Zones

| Zone     | Brightness range | Color         |
|----------|-----------------|---------------|
| Water    | ≤ water thresh  | Dark navy     |
| Plain    | ≤ plain thresh  | Green         |
| Highland | ≤ highland thresh | Tan         |
| Mountain | above all       | Light gray    |

## External Data Sources

- Elevation tiles: AWS Terrarium (`s3.amazonaws.com/elevation-tiles-prod/terrarium/`)
- Rivers: OpenStreetMap Overpass API
- Map tiles: CartoDB Voyager via Leaflet

## Target Users

Developers and players of openfront.io who want custom maps from real geography or custom artwork.
