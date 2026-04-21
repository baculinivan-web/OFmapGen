# Deployment Checklist

Use this checklist when deploying the gallery feature.

## Pre-Deployment

### GitHub Setup
- [ ] Create GitHub Personal Access Token
  - Go to https://github.com/settings/tokens
  - Generate new token (classic)
  - Select `repo` scope
  - Copy token (save it securely!)

### Local Testing
- [ ] Test backend locally (`npm start` in `backend/`)
- [ ] Test frontend locally (`npx serve .`)
- [ ] Test upload flow end-to-end
- [ ] Verify PR is created in GitHub
- [ ] Test gallery page loads
- [ ] Test filtering works

## Backend Deployment

### Installation
- [ ] SSH into VPS
- [ ] Navigate to project: `cd /root/OFmapGen-dev`
- [ ] Pull latest code: `git pull origin dev`
- [ ] Navigate to backend: `cd backend`
- [ ] Install dependencies: `npm install`
- [ ] Create `.env` file: `cp .env.example .env`
- [ ] Edit `.env` and add GitHub token: `nano .env`
- [ ] Verify `.env` permissions: `chmod 600 .env`

### Configuration
- [ ] Verify `GITHUB_TOKEN` is set
- [ ] Verify `GITHUB_OWNER` is correct
- [ ] Verify `GITHUB_REPO` is correct
- [ ] Verify `GITHUB_BRANCH` is `dev`
- [ ] Verify `PORT` is `3003`
- [ ] Verify `NODE_ENV` is `production`

### Start Backend
- [ ] Start with PM2: `pm2 start index.js --name ofmapgen-backend`
- [ ] Save PM2 config: `pm2 save`
- [ ] Enable auto-start: `pm2 startup` (follow instructions)
- [ ] Check status: `pm2 status`
- [ ] Check logs: `pm2 logs ofmapgen-backend --lines 50`

### Test Backend
- [ ] Health check: `curl http://localhost:3003/api/health`
- [ ] Gallery endpoint: `curl http://localhost:3003/api/gallery`
- [ ] Verify no errors in logs

## Nginx Configuration

### Edit Config
- [ ] Open nginx config: `sudo nano /etc/nginx/sites-available/devmaps.mivps.ru`
- [ ] Add `/api/` location block (see DEPLOYMENT.md)
- [ ] Add CORS headers
- [ ] Add OPTIONS handling
- [ ] Test config: `sudo nginx -t`
- [ ] Reload nginx: `sudo systemctl reload nginx`

### Test Nginx
- [ ] Test API through nginx: `curl https://devmaps.mivps.ru/api/health`
- [ ] Verify CORS headers: `curl -I https://devmaps.mivps.ru/api/health`
- [ ] Check nginx logs: `sudo tail -f /var/log/nginx/error.log`

## Frontend Deployment

### Verify Files
- [ ] Check `gallery.html` exists
- [ ] Check `publish.js` exists
- [ ] Check `index.html` has Gallery button
- [ ] Check `index.html` has Publish button
- [ ] Check `index.html` loads `publish.js`

### Test Frontend
- [ ] Open https://devmaps.mivps.ru
- [ ] Click "Gallery" button
- [ ] Verify gallery page loads
- [ ] Create test map
- [ ] Add nations
- [ ] Click "Publish to Gallery"
- [ ] Complete publish flow
- [ ] Verify PR is created
- [ ] Check GitHub for PR

## Post-Deployment

### Verification
- [ ] Gallery page loads without errors
- [ ] Can browse maps (if any exist)
- [ ] Can filter by nations
- [ ] Can click map for details
- [ ] Can download map package
- [ ] Publish flow works end-to-end
- [ ] PR is created correctly
- [ ] All files are in PR (image, thumbnail, metadata, etc.)

### Monitoring
- [ ] Check PM2 status: `pm2 status`
- [ ] Check backend logs: `pm2 logs ofmapgen-backend`
- [ ] Check nginx logs: `sudo tail -f /var/log/nginx/access.log`
- [ ] Check disk space: `df -h`
- [ ] Check memory usage: `free -h`

### Security
- [ ] Verify `.env` is not committed: `git status`
- [ ] Verify `.env` permissions: `ls -la backend/.env` (should be 600)
- [ ] Verify port 3003 is not exposed: `sudo ufw status`
- [ ] Verify rate limiting works (try 6 uploads quickly)
- [ ] Verify only PNG files accepted
- [ ] Verify file size limit (try >10MB file)

## Documentation

### Update Docs
- [ ] Update README.md with gallery info
- [ ] Create/update DEPLOYMENT.md
- [ ] Create/update GALLERY_QUICKSTART.md
- [ ] Create backend/README.md
- [ ] Create backend/API.md

### Commit Changes
- [ ] Commit all new files
- [ ] Push to `dev` branch
- [ ] Create PR to `main` (if deploying to production)

## Production Deployment

If deploying to production (`mivps.ru`):

### Additional Steps
- [ ] Use different port (e.g., 3004)
- [ ] Use `main` branch in `.env`
- [ ] Use different PM2 name: `ofmapgen-backend-prod`
- [ ] Update nginx config for `mivps.ru`
- [ ] Test thoroughly on dev first
- [ ] Merge `dev` to `main`
- [ ] Deploy via GitHub Actions

## Rollback Plan

If something goes wrong:

### Backend Rollback
- [ ] Stop backend: `pm2 stop ofmapgen-backend`
- [ ] Revert code: `git reset --hard HEAD~1`
- [ ] Restart backend: `pm2 restart ofmapgen-backend`

### Nginx Rollback
- [ ] Restore old config from backup
- [ ] Test: `sudo nginx -t`
- [ ] Reload: `sudo systemctl reload nginx`

### Frontend Rollback
- [ ] Revert via GitHub Actions (push previous commit)
- [ ] Or manually: `git reset --hard HEAD~1 && git push -f`

## Backup

### Before Deployment
- [ ] Backup `.env`: `cp backend/.env ~/backups/backend-env-$(date +%Y%m%d).bak`
- [ ] Backup nginx config: `sudo cp /etc/nginx/sites-available/devmaps.mivps.ru ~/backups/`
- [ ] Backup PM2 config: `pm2 save && cp ~/.pm2/dump.pm2 ~/backups/`

## Support Contacts

- GitHub Issues: https://github.com/baculinivan-web/OFmapGen/issues
- Email: baculinivan@gmail.com
- Discord: fghjk_60845

## Notes

- Rate limit: 5 uploads per 15 minutes per IP
- File size limit: 10MB
- Only PNG files accepted
- All maps are open source
- PRs go to `dev` branch
- Manual review required for all submissions

## Completion

- [ ] All checklist items completed
- [ ] Deployment successful
- [ ] No errors in logs
- [ ] Feature working as expected
- [ ] Documentation updated
- [ ] Team notified

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Version**: 1.0.0
**Environment**: [ ] Dev [ ] Production
