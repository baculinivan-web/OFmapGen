# Tech Stack

## Frontend

- Vanilla JavaScript (ES modules, no build step)
- HTML5 Canvas API for image processing and rendering
- Web Workers for off-main-thread pixel processing (`worker.js`)
- CSS custom properties for theming

## Libraries (CDN, no npm)

- [Leaflet 1.9.4](https://leafletjs.com/) — interactive map in GIS modal
- [Leaflet-Draw 1.0.4](https://leaflet.github.io/Leaflet.draw/) — rectangle drawing tool
- [ONNX Runtime Web 1.20.1](https://onnxruntime.ai/) — AI segmentation (u2netp model, ~4.7MB, cached via Cache API)
- Google Fonts — Inter typeface

## Python Desktop GUI

- Python 3 with `Pillow` and `numpy`
- tkinter for UI

## Deployment

- Static file serving only — no backend, no build pipeline
- Docker: nginx:alpine serves static files on port 80 (mapped to 3000 by default)

## Common Commands

```bash
# Serve locally (ES modules require a server)
npx serve .
python3 -m http.server

# Docker
docker compose up        # starts on http://localhost:3000
docker compose down

# Python GUI
pip install pillow numpy
python image_to_map.py   # reads input.png, writes map_output.png
```

## Key Constraints

- No bundler, no transpilation — code runs directly in the browser
- ES module imports use CDN URLs (e.g. `https://cdn.jsdelivr.net/npm/onnxruntime-web@...`)
- Leaflet and Leaflet-Draw are loaded as classic scripts (globals `L`) before the module script
- ONNX model is fetched from HuggingFace and cached in the browser Cache API (`ort-models-v1`)
- OpenFront requires map dimensions to be multiples of 4; recommended 2–3 million pixels total
