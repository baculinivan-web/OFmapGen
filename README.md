# OpenFront Map Generator

**Live at [maps.mivps.ru](https://maps.mivps.ru)**

Convert any image — or real-world elevation data — into a playable map for [openfront.io](https://openfront.io).

## Features

- Upload any image and map brightness to terrain
- **Import from real map** — select any region on Earth, load elevation data and rivers automatically
- Export a visual preview PNG or a source PNG ready for OpenFront's map-generator

## Terrain types

| Terrain  | Color |
|----------|-------|
| Water    | Dark navy |
| Plain    | Green |
| Highland | Tan |
| Mountain | Light gray |

---

## Usage

### Web (recommended)

Serve the folder with any static file server (required for ES modules):

```bash
npx serve .
# or
python3 -m http.server
# or
docker compose up
```

Then open `http://localhost:3000`.

#### From an image

1. Upload a PNG / JPG / WebP
2. Adjust thresholds via **Advanced settings** or pick a terrain preset
3. Choose an algorithm (Legacy / Smooth / Advanced AI)
4. Download the result

#### From real map (GIS elevation)

1. Click **🌍 From real map (elevation)**
2. Draw a rectangle on the map to select your region
3. Drag the 8 handles to fine-tune the bounding box
4. Click **Load elevation** — elevation tiles are fetched from [AWS Terrarium](https://registry.opendata.aws/terrain-tiles/) (free, no key) and rivers from [OpenStreetMap Overpass API](https://overpass-api.de/)
5. Use terrain presets (🌾 Plains / ⛰ Mixed / Default / 🏔 Mountains) to tune the result
6. Download

#### Exporting for OpenFront

- **Download map PNG** — visual preview with terrain colors
- **Download source PNG (OpenFront import)** — PNG encoded with the exact OpenFront color palette. Feed this directly into OpenFront's `map-generator`.

### Python (desktop GUI)

```bash
pip install pillow numpy
python image_to_map.py
```

Put your source image at `input.png`. Adjust sliders and hit **SAVE** to export `map_output.png`.

---

## Algorithms

| Algorithm | Description |
|-----------|-------------|
| Legacy    | Pixel-perfect, no post-processing |
| Smooth    | Removes small noise islands, smooths coastlines |
| Advanced  | AI segmentation — subject becomes island, background becomes ocean |

---

## Project structure

```
index.html   — HTML markup
style.css    — styles
app.js       — core logic (render, file load, AI segmentation, download)
gis.js       — GIS modal, elevation tiles, river overlay
worker.js    — Web Worker for pixel processing
```

---

## Tips

- Toggle **Invert Brightness** if land and water appear swapped
- For GIS maps, sea-level is fixed at 0m — coastal areas appear automatically as water
- Rivers are drawn from OSM data on top of elevation — if they fail, elevation is still applied
- OpenFront requires map dimensions to be multiples of 4 and recommends 2–3 million pixels total
