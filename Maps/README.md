# Community Maps Gallery

This folder contains maps submitted by the community. Each map is in its own folder with all necessary files.

## Folder Structure

Each map folder contains:

```
map-name-timestamp/
├── image.png              # OpenFront-compatible map image
├── thumbnail.png          # 300x200 preview (auto-generated)
├── metadata.json          # Map information
├── info.json              # OpenFront game manifest
├── setup.py               # Map test script
├── Click me to install.bat      # Windows launcher
├── Click me to install.command  # macOS launcher
└── copyright.md           # Copyright/attribution (if applicable)
```

## metadata.json Format

```json
{
  "name": "Fantasy Archipelago",
  "author": "MapMaster123",
  "description": "A fantasy map with multiple islands",
  "created": "2024-01-15T10:30:00.000Z",
  "dimensions": {
    "width": 2048,
    "height": 1024
  },
  "nations": 12,
  "hasNations": true
}
```

## info.json Format

```json
{
  "name": "Fantasy Archipelago",
  "map": {
    "width": 2048,
    "height": 1024,
    "num_land_tiles": 1500000
  },
  "nations": [
    {
      "coordinates": [512, 256],
      "name": "Kingdom of North",
      "flag": "gb"
    }
  ]
}
```

## Submitting Maps

1. Use the **Publish to Gallery** button in the map generator
2. Fill in map details and agree to open-source license
3. Your submission creates a Pull Request
4. After review, your map will be merged and appear in the gallery

## License

All maps in this folder are open source and can be freely used, modified, and distributed, including for commercial purposes on openfront.io.

Individual maps may have additional attribution requirements listed in their `copyright.md` files.
