# OpenFront Map Generator

Convert any image into a playable map for [openfront.io](https://openfront.io).

## What it does

Takes a grayscale (or any) image and maps brightness values to terrain types:

| Terrain  | Color |
|----------|-------|
| Water    | Dark navy |
| Plain    | Green |
| Highland | Tan |
| Mountain | Light gray |

## Usage

### Web (recommended)

Just open `index.html` in a browser — no install needed.

1. Upload a PNG/JPG/WebP image
2. Adjust the Water / Plain / Highland thresholds with the sliders
3. Pick an algorithm (Legacy, Smooth, or Advanced)
4. Download the result as `openfront_map.png`

### Python (desktop GUI)

Requires Python 3 with `Pillow`, `numpy`, and `tkinter`.

```bash
pip install pillow numpy
```

Put your source image at `input.png`, then run:

```bash
python image_to_map.py
```

Adjust sliders in the GUI and hit **SAVE** to export `map_output.png`.

### Docker

```bash
docker compose up
```

## Algorithms (web version)

- **Legacy** — pixel-perfect, no post-processing
- **Smooth** — removes small noise islands and smooths jagged coastlines (configurable min island size and passes)
- **Advanced** — edge margin control for cleaner borders

## Tips

- Use a heightmap or topographic image for best results
- Toggle **Invert Brightness** if land and water are swapped
- Higher "smooth passes" = softer coastlines but slower render
