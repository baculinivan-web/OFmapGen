# Gallery Quick Start Guide

Quick guide to get the gallery feature running.

## For Users

### Publishing a Map

1. Create your map in the generator
2. Add nation spawns
3. Click **"Publish to Gallery"** button
4. Fill in:
   - Map name (required)
   - Your nickname (optional)
   - Description (optional)
5. Check "I agree this map is open source"
6. Click **Next**
7. Download proof-of-authorship image (keep it safe!)
8. Declare if you used copyrighted resources
9. Click **Submit to Gallery**
10. Done! Your map will be reviewed and added

### Browsing Gallery

1. Click **"Gallery"** button in header
2. Browse community maps
3. Toggle "Show nations" filter
4. Click a map to see details
5. Click "Download Map Package" to get the full map with test scripts

## For Developers

### Quick Setup (5 minutes)

```bash
# 1. Install backend
cd backend
npm install

# 2. Create .env file
cp .env.example .env

# 3. Get GitHub token
# Go to: https://github.com/settings/tokens
# Create token with 'repo' scope
# Copy token to .env file

# 4. Start backend
npm start

# 5. Test
curl http://localhost:3003/api/health
```

### Frontend Changes

The frontend is already set up! Just make sure:

1. Backend is running on port 3003
2. CORS is configured for your domain
3. `publish.js` is loaded in `index.html` (already done)

### Deploy to Production

See `DEPLOYMENT.md` for full instructions.

Quick version:
```bash
# On VPS
cd /root/OFmapGen-dev/backend
npm install
cp .env.example .env
# Edit .env with your GitHub token
pm2 start index.js --name ofmapgen-backend
pm2 save

# Configure nginx (see DEPLOYMENT.md)
sudo nginx -t
sudo systemctl reload nginx
```

## Architecture

```
User Browser
    ↓
[Frontend] → [Backend API] → [GitHub API]
                ↓
            Creates PR in 'dev' branch
                ↓
            You review & merge
                ↓
            Map appears in gallery
```

## File Structure

```
frontend/
  index.html       # Main page with "Publish" button
  gallery.html     # Gallery page
  publish.js       # Publishing flow
  
backend/
  index.js         # Express API
  package.json     # Dependencies
  .env             # Config (GitHub token)
  
Maps/
  map-name-123/    # Each map gets a folder
    image.png      # Map file
    thumbnail.png  # Preview
    metadata.json  # Map info
    info.json      # Game manifest
    setup.py       # Test script
    *.bat, *.command  # Launchers
```

## API Endpoints

- `POST /api/upload` - Upload new map
- `GET /api/gallery` - Get all maps
- `GET /api/health` - Health check

## Environment Variables

```env
GITHUB_TOKEN=ghp_xxxxx          # Required
GITHUB_OWNER=baculinivan-web    # Your GitHub username
GITHUB_REPO=OFmapGen            # Your repo name
GITHUB_BRANCH=dev               # Target branch
PORT=3003                       # API port
```

## Testing Locally

```bash
# Terminal 1: Start backend
cd backend
npm start

# Terminal 2: Start frontend
npx serve .

# Open browser
http://localhost:3000
```

## Common Issues

### "Failed to upload map"
- Check backend is running: `curl http://localhost:3003/api/health`
- Check GitHub token is valid
- Check browser console for errors

### "CORS error"
- Add your domain to CORS whitelist in `backend/index.js`
- Restart backend: `pm2 restart ofmapgen-backend`

### "Rate limit exceeded"
- Wait 15 minutes (rate limit: 5 uploads per 15 min per IP)
- Or adjust `RATE_LIMIT_MAX_REQUESTS` in `.env`

## Next Steps

1. Test locally
2. Deploy to dev server
3. Test on dev server
4. Merge to main
5. Deploy to production

See `DEPLOYMENT.md` for detailed deployment instructions.

## Support

- Backend logs: `pm2 logs ofmapgen-backend`
- Frontend console: F12 in browser
- GitHub Issues: https://github.com/baculinivan-web/OFmapGen/issues
