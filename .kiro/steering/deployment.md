# Deployment & Infrastructure

## Environments

| Environment | Branch | URL | Docker port |
|-------------|--------|-----|-------------|
| Production  | `main` | `mivps.ru` | 3000 |
| Dev         | `dev`  | `devmaps.mivps.ru` | 3001 |

## VPS

- Provider: VPS (fellowlavender)
- OS: Linux (nginx + Docker)
- Main site files: `/root/OFmapGen`
- Dev site files: `/root/OFmapGen-dev`

## Nginx

Two separate nginx configs:
- `/etc/nginx/sites-available/mivps.ru` — proxies to `localhost:3000`
- `/etc/nginx/sites-available/devmaps.mivps.ru` — proxies to `localhost:3001`

Both use `proxy_pass` to forward to Docker containers:

```nginx
location / {
    proxy_pass http://localhost:<PORT>;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

SSL is managed by Certbot (Let's Encrypt).

## Docker

- Production: `docker-compose.yml` — port `3000:80`
- Dev: `docker-compose.dev.yml` — port `3001:80`
- Image: `nginx:alpine` serving static files

## GitHub Actions (Auto-deploy)

Two workflows in `.github/workflows/`:

- `deploy.yml` — triggers on push to `main`, deploys to `/root/OFmapGen`
- `deploy-dev.yml` — triggers on push to `dev`, deploys to `/root/OFmapGen-dev`

Both use `appleboy/ssh-action` with these secrets (set in GitHub repo Settings → Secrets):
- `SSH_HOST` — IP адрес VPS
- `SSH_USER` — пользователь (root)
- `SSH_PRIVATE_KEY` — приватный SSH ключ

Deploy script pattern:
```bash
cd /root/OFmapGen[-dev]
git fetch origin
git reset --hard origin/[main|dev]
docker compose [-f docker-compose.dev.yml] up -d --build
```

## DNS

Both domains point to the same VPS IP via A-records:
- `mivps.ru` → A record → VPS IP
- `devmaps` → A record → VPS IP (subdomain of mivps.ru)
