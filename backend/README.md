# OpenFront Map Generator - Backend

Backend API для системы публикации карт в галерею.

## Установка

```bash
cd backend
npm install
```

## Настройка

1. Создайте файл `.env` (скопируйте из `.env.example`):
```bash
cp .env.example .env
```

2. Получите GitHub Personal Access Token:
   - Перейдите: https://github.com/settings/tokens
   - Generate new token (classic)
   - Права: `repo` (полный доступ к репозиториям)
   - Скопируйте токен

3. Добавьте новый аккаунт как Collaborator:
   - https://github.com/baculinivan-web/OFmapGen/settings/access
   - Add people → введите username нового аккаунта
   - Роль: Write

4. Обновите `.env`:
```env
GITHUB_TOKEN=ваш_токен_здесь
GITHUB_OWNER=baculinivan-web
GITHUB_REPO=OFmapGen
PORT=3002
```

## Запуск

### Локально (разработка):
```bash
npm start
```

Сервер запустится на http://localhost:3002

### На VPS (продакшн):

1. Загрузите код на VPS:
```bash
cd /root/OFmapGen
git pull
```

2. Установите зависимости:
```bash
cd backend
npm install
```

3. Создайте `.env` на VPS:
```bash
nano .env
# Вставьте настройки
```

4. Запустите с PM2:
```bash
pm2 start index.js --name ofmapgen-backend
pm2 save
```

5. Настройте nginx прокси:
```nginx
# /etc/nginx/sites-available/mivps.ru
location /api/ {
    proxy_pass http://localhost:3002/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # CORS headers
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type";
}
```

6. Перезапустите nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## API Endpoints

### `GET /api/health`
Проверка работоспособности сервера.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### `POST /api/submit-map`
Отправка карты в галерею.

**Request:** `multipart/form-data`
- `map` (file): PNG файл карты
- `mapName` (string): Название карты
- `authorNick` (string): Ник автора
- `nations` (JSON string): Массив наций
- `copyright` (string, optional): Информация о копирайте

**Response:**
```json
{
  "success": true,
  "prUrl": "https://github.com/baculinivan-web/OFmapGen/pull/123",
  "prNumber": 123,
  "proofImage": "data:image/png;base64,..."
}
```

### `GET /api/maps`
Получить список всех карт из галереи.

**Response:**
```json
{
  "maps": [
    {
      "id": "map-name-by-author-1234567890",
      "name": "My Awesome Map",
      "author": "username",
      "timestamp": 1234567890,
      "date": "2024-01-01T00:00:00.000Z",
      "dimensions": { "width": 1500, "height": 1000 },
      "nations": 5,
      "thumbnail": "maps/thumbnails/...",
      "full": "maps/full/...",
      "proof": "maps/proof/...",
      "hasCopyright": false
    }
  ],
  "version": "1.0.0"
}
```

## Структура файлов в репозитории

```
maps/
  metadata.json          # Список всех карт
  full/                  # Полные карты (1500x1000)
  thumbnails/            # Превью (300x200)
  proof/                 # Watermarked доказательства авторства
  copyrights/            # Copyright notices (если есть)
```

## Процесс публикации

1. Пользователь заполняет форму на фронтенде
2. Фронтенд отправляет POST запрос на `/api/submit-map`
3. Бэкенд:
   - Проверяет файл (PNG, размер)
   - Создает thumbnail (300x200)
   - Создает watermarked proof image
   - Создает новую ветку в GitHub
   - Загружает файлы в ветку
   - Обновляет metadata.json
   - Создает Pull Request
4. Вы получаете уведомление о PR
5. Проверяете карту и мержите PR
6. Карта появляется в галерее

## Безопасность

- ✅ GitHub токен хранится в `.env` (не в Git)
- ✅ CORS настроен только для разрешенных доменов
- ✅ Ограничение размера файла (5MB)
- ✅ Проверка типа файла (только PNG)
- ✅ Токен от отдельного аккаунта (не основного)

## Troubleshooting

### Ошибка: "Not allowed by CORS"
Добавьте ваш домен в `ALLOWED_ORIGINS` в `.env`:
```env
ALLOWED_ORIGINS=http://localhost:8000,https://mivps.ru,https://devmaps.mivps.ru
```

### Ошибка: "GitHub API rate limit"
Проверьте что токен правильный и имеет права `repo`.

### Ошибка: "Failed to create branch"
Убедитесь что новый аккаунт добавлен как Collaborator в репозиторий.

## Мониторинг

Проверить статус на VPS:
```bash
pm2 status
pm2 logs ofmapgen-backend
```

Проверить здоровье API:
```bash
curl http://localhost:3002/api/health
```
