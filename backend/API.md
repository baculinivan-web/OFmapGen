# Gallery API Documentation

REST API for the OpenFront Map Gallery.

## Base URL

- Development: `http://localhost:3003/api`
- Production: `https://devmaps.mivps.ru/api`

## Authentication

No authentication required for public endpoints. GitHub token is stored server-side.

## Rate Limiting

- 5 uploads per 15 minutes per IP address
- No rate limit on GET endpoints

## Endpoints

### Health Check

Check if the API is running.

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Upload Map

Submit a new map to the gallery.

```http
POST /api/upload
Content-Type: multipart/form-data
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `map` | File | Yes | PNG image file (max 10MB) |
| `mapName` | String | Yes | Map name (max 60 chars) |
| `author` | String | No | Author nickname (max 40 chars) |
| `description` | String | No | Map description (max 300 chars) |
| `nations` | JSON String | Yes | Array of nation objects |
| `mapWidth` | Number | Yes | Map width in pixels |
| `mapHeight` | Number | Yes | Map height in pixels |
| `copyright` | String | No | Copyright/attribution text |

**Nations Format:**
```json
[
  {
    "x": 512,
    "y": 256,
    "name": "Kingdom of North",
    "flag": "gb"
  }
]
```

**Success Response (200):**
```json
{
  "success": true,
  "prUrl": "https://github.com/user/repo/pull/123",
  "prNumber": 123,
  "mapFolder": "fantasy-world-1234567890"
}
```

**Error Response (400/500):**
```json
{
  "error": "Error message",
  "message": "Detailed error description"
}
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('map', mapBlob, 'map.png');
formData.append('mapName', 'Fantasy World');
formData.append('author', 'MapMaster');
formData.append('description', 'A fantasy map');
formData.append('nations', JSON.stringify(nationsArray));
formData.append('mapWidth', 2048);
formData.append('mapHeight', 1024);

const response = await fetch('http://localhost:3003/api/upload', {
  method: 'POST',
  body: formData
});

const data = await response.json();
console.log(data.prUrl);
```

---

### Get Gallery

Retrieve all published maps.

```http
GET /api/gallery
```

**Response (200):**
```json
{
  "maps": [
    {
      "name": "Fantasy World",
      "author": "MapMaster",
      "description": "A fantasy map with islands",
      "created": "2024-01-15T10:30:00.000Z",
      "dimensions": {
        "width": 2048,
        "height": 1024
      },
      "nations": 12,
      "hasNations": true,
      "folder": "fantasy-world-1234567890",
      "thumbnailUrl": "https://raw.githubusercontent.com/.../thumbnail.png",
      "downloadUrl": "https://github.com/.../Maps/fantasy-world-1234567890"
    }
  ]
}
```

**Example (JavaScript):**
```javascript
const response = await fetch('http://localhost:3003/api/gallery');
const data = await response.json();

data.maps.forEach(map => {
  console.log(`${map.name} by ${map.author} - ${map.nations} nations`);
});
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request (invalid input) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal Server Error |

## Error Response Format

```json
{
  "error": "Short error message",
  "message": "Detailed error description"
}
```

## File Size Limits

- Map image: 10MB max
- Thumbnail: Generated automatically (300x200)
- Total upload size: 10MB

## Supported File Types

- PNG only (for map images)

## GitHub Integration

When a map is uploaded:

1. A new branch is created: `map-submission-{folder-name}`
2. Files are committed to `Maps/{folder-name}/`
3. A Pull Request is created to the `dev` branch
4. PR includes:
   - Map image (`image.png`)
   - Thumbnail (`thumbnail.png`)
   - Metadata (`metadata.json`)
   - Game manifest (`info.json`)
   - Test scripts (`setup.py`, `*.bat`, `*.command`)
   - Copyright notice (`copyright.md`, if provided)

## Rate Limiting Details

- Window: 15 minutes (900,000 ms)
- Max requests: 5 per IP
- Headers returned:
  - `X-RateLimit-Limit`: Maximum requests
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp

## CORS

Allowed origins:
- `http://localhost:8080`
- `https://mivps.ru`
- `https://devmaps.mivps.ru`

Allowed methods:
- `GET`
- `POST`

## Testing

### cURL Examples

**Health check:**
```bash
curl http://localhost:3003/api/health
```

**Get gallery:**
```bash
curl http://localhost:3003/api/gallery
```

**Upload map:**
```bash
curl -X POST http://localhost:3003/api/upload \
  -F "map=@map.png" \
  -F "mapName=Test Map" \
  -F "author=Tester" \
  -F "description=A test map" \
  -F "nations=[{\"x\":100,\"y\":100,\"name\":\"Test\",\"flag\":\"us\"}]" \
  -F "mapWidth=1024" \
  -F "mapHeight=768"
```

### Postman Collection

Import this JSON into Postman:

```json
{
  "info": {
    "name": "OpenFront Gallery API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "url": "http://localhost:3003/api/health"
      }
    },
    {
      "name": "Get Gallery",
      "request": {
        "method": "GET",
        "url": "http://localhost:3003/api/gallery"
      }
    },
    {
      "name": "Upload Map",
      "request": {
        "method": "POST",
        "url": "http://localhost:3003/api/upload",
        "body": {
          "mode": "formdata",
          "formdata": [
            {
              "key": "map",
              "type": "file",
              "src": "/path/to/map.png"
            },
            {
              "key": "mapName",
              "value": "Test Map",
              "type": "text"
            },
            {
              "key": "author",
              "value": "Tester",
              "type": "text"
            },
            {
              "key": "nations",
              "value": "[{\"x\":100,\"y\":100,\"name\":\"Test\",\"flag\":\"us\"}]",
              "type": "text"
            },
            {
              "key": "mapWidth",
              "value": "1024",
              "type": "text"
            },
            {
              "key": "mapHeight",
              "value": "768",
              "type": "text"
            }
          ]
        }
      }
    }
  ]
}
```

## Changelog

### v1.0.0 (2024-01-15)
- Initial release
- Upload maps endpoint
- Gallery listing endpoint
- GitHub PR integration
- Rate limiting
- Thumbnail generation
