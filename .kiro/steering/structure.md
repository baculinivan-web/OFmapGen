# Project Structure

```
index.html        — Single page app shell, all DOM markup, CDN script tags
style.css         — All styles; uses CSS custom properties (defined in :root)
app.js            — Main ES module: UI state, file loading, AI segmentation, download logic
gis.js            — GIS modal module: Leaflet map, bbox selection, elevation tile fetching, river overlay
worker.js         — Web Worker: pixel classification and smoothing algorithms (no imports)
image_to_map.py   — Standalone Python/tkinter desktop GUI (independent of web app)
Dockerfile        — nginx:alpine static file server
docker-compose.yml — Maps container port 80 → host port 3000
```

## Module Relationships

- `index.html` loads Leaflet + Leaflet-Draw as classic scripts, then `app.js` as `type="module"`
- `app.js` imports `initGis` from `gis.js` and passes callbacks/refs to it (no shared globals)
- `app.js` spawns `worker.js` via `new Worker('./worker.js')` — communicates via `postMessage` with transferable buffers
- `worker.js` is a classic worker script (no ES module syntax), self-contained with no imports

## Conventions

- DOM elements are grabbed once at the top of each module and stored in `const` refs
- State is module-level variables (`let currentAlgo`, `let aiMask`, etc.)
- Rendering is debounced via `requestAnimationFrame` (`scheduleRender` → `render`)
- Heavy pixel work is always offloaded to `worker.js`; main thread only handles UI and canvas I/O
- Transferable objects (`ArrayBuffer`) are used for worker message passing to avoid copying
- GIS module receives all dependencies via a single options object passed to `initGis()`
- CSS variables follow the pattern `--name` (e.g. `--bg`, `--accent`, `--water`) — use these for any new color/style values
- Image size is clamped to 512–1024px on the longest side (`clampedSize` in `app.js`)
- Status messages in the GIS modal use a `Prefix: message` format (e.g. `Loading: …`, `Done: …`, `Error: …`)
