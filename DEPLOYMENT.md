# Deployment Guide

This guide covers deploying the OpenFront Map Generator with the gallery backend.

## Prerequisites

- VPS with Ubuntu/Debian
- Node.js 16+ installed
- Nginx installed
- PM2 installed (`npm install -g pm2`)
- GitHub Personal Access Token

## 1. Backend Setup

### Install Backend

```bash
cd /root/OFmapGen-dev/backend
npm install
```

### Configure Environment

```bash
cp .env.example .env
nano .env
```

Add your GitHub token:
```env
GITHUB_TOKEN=ghp_your_token_here
GITHUB_OWNER=baculinivan-web
GITHUB_REPO=OFmapGen
GITHUB_BRANCH=dev
PORT=3003
NODE_ENV=production
```

### Start with PM2

```bash
pm2 start index.js --name ofmapgen-backend
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

### Check Status

```bash
pm2 status
pm2 logs ofmapgen-backend
```

## 2. Nginx Configuration

### Add Backend Proxy

Edit your nginx config (`/etc/nginx/sites-available/devmaps.mivps.ru`):

```nginx
server {
    listen 80;
    server_name devmaps.mivps.ru;
    
    # Frontend (static files)
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:3003/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type' always;
        
        # Handle preflight
        if ($request_method = 'OPTIONS') {
            return 204;
        }
    }
}
```

### Test and Reload

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 3. GitHub Actions

The existing GitHub Actions workflow will automatically deploy frontend changes. The backend needs to be restarted manually after updates:

```bash
cd /root/OFmapGen-dev/backend
git pull origin dev
npm install
pm2 restart ofmapgen-backend
```

### Optional: Add Backend to GitHub Actions

Edit `.github/workflows/deploy-dev.yml`:

```yaml
- name: Deploy Backend
  run: |
    cd /root/OFmapGen-dev/backend
    npm install
    pm2 restart ofmapgen-backend || pm2 start index.js --name ofmapgen-backend
```

## 4. Firewall

Make sure port 3003 is NOT exposed externally (only nginx should access it):

```bash
# Check firewall
sudo ufw status

# Port 3003 should NOT be in the list
# Only 80, 443, and 22 should be open
```

## 5. SSL/HTTPS

If using Let's Encrypt:

```bash
sudo certbot --nginx -d devmaps.mivps.ru
```

The nginx config will be updated automatically to use HTTPS.

## 6. Monitoring

### Check Backend Logs

```bash
pm2 logs ofmapgen-backend
pm2 logs ofmapgen-backend --lines 100
```

### Check Backend Status

```bash
pm2 status
pm2 monit  # Real-time monitoring
```

### Test API

```bash
# Health check
curl http://localhost:3003/api/health

# Gallery endpoint
curl http://localhost:3003/api/gallery
```

## 7. Troubleshooting

### Backend won't start

```bash
# Check logs
pm2 logs ofmapgen-backend --err

# Check if port is in use
sudo lsof -i :3003

# Restart
pm2 restart ofmapgen-backend
```

### CORS errors

Make sure nginx CORS headers are configured correctly (see step 2).

### GitHub API errors

- Check token is valid: https://github.com/settings/tokens
- Token needs `repo` scope
- Check rate limit: https://api.github.com/rate_limit

### Upload fails

```bash
# Check backend logs
pm2 logs ofmapgen-backend

# Check disk space
df -h

# Check permissions
ls -la /root/OFmapGen-dev/backend
```

## 8. Backup

### Backup .env file

```bash
cp /root/OFmapGen-dev/backend/.env ~/backups/backend-env-$(date +%Y%m%d).bak
```

### Backup PM2 config

```bash
pm2 save
cp ~/.pm2/dump.pm2 ~/backups/pm2-dump-$(date +%Y%m%d).bak
```

## 9. Updates

### Update Backend

```bash
cd /root/OFmapGen-dev
git pull origin dev
cd backend
npm install
pm2 restart ofmapgen-backend
```

### Update Frontend

Frontend updates are automatic via GitHub Actions.

## 10. Production Deployment

For production (`mivps.ru`):

1. Merge `dev` branch to `main`
2. GitHub Actions will deploy automatically
3. Backend setup is the same, but use:
   - Port: 3004 (or different from dev)
   - Branch: `main` in `.env`
   - PM2 name: `ofmapgen-backend-prod`

## Security Checklist

- [ ] GitHub token stored in `.env` (not committed)
- [ ] `.env` file has restricted permissions (`chmod 600 .env`)
- [ ] Port 3003 not exposed externally
- [ ] Rate limiting enabled (default: 5 uploads per 15 min)
- [ ] Nginx CORS configured correctly
- [ ] SSL/HTTPS enabled
- [ ] PM2 auto-restart on crash enabled
- [ ] Regular backups of `.env`

## Performance

The backend is lightweight:
- Memory: ~50-100MB
- CPU: Minimal (only during uploads)
- Disk: Temporary files only (cleaned after PR creation)

Rate limiting prevents abuse (5 uploads per 15 minutes per IP).
