# Чеклист для деплоя галереи

## ✅ Готово (локально)

- [x] Бэкенд API реализован (`backend/index.js`)
- [x] Фронтенд публикации реализован (`publish.js`)
- [x] Страница галереи создана (`gallery.html`)
- [x] Кнопка Gallery добавлена в header
- [x] Watermark для proof images
- [x] Copyright support
- [x] Документация написана
- [x] `.gitignore` настроен
- [x] Код в GitHub (ветка `dev`)

## ⏳ Нужно сделать для деплоя

### 1. GitHub токен

- [ ] Войти в новый GitHub аккаунт (который вы создали для безопасности)
- [ ] Перейти: https://github.com/settings/tokens
- [ ] Generate new token (classic)
- [ ] Права: ✅ `repo` (полный доступ)
- [ ] Скопировать токен (показывается только один раз!)

### 2. Добавить Collaborator

- [ ] Войти в основной аккаунт `baculinivan-web`
- [ ] Перейти: https://github.com/baculinivan-web/OFmapGen/settings/access
- [ ] Нажать "Add people"
- [ ] Ввести username нового аккаунта
- [ ] Роль: **Write**
- [ ] Отправить приглашение
- [ ] На новом аккаунте принять приглашение

### 3. Деплой на VPS (dev сервер)

#### 3.1 Подключиться к VPS
```bash
ssh root@ваш_vps_ip
```

#### 3.2 Проверить Node.js
```bash
node --version  # должно быть >= 16
npm --version

# Если нет или старая версия:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 3.3 Установить PM2
```bash
sudo npm install -g pm2
```

#### 3.4 Обновить код
```bash
cd /root/OFmapGen-dev
git fetch origin
git pull origin dev
```

#### 3.5 Установить зависимости
```bash
cd backend
npm install
```

#### 3.6 Создать .env
```bash
nano .env
```

Вставить:
```env
GITHUB_TOKEN=ваш_токен_здесь
GITHUB_OWNER=baculinivan-web
GITHUB_REPO=OFmapGen
PORT=3002
NODE_ENV=production
MAX_FILE_SIZE=5242880
ALLOWED_ORIGINS=https://mivps.ru,https://devmaps.mivps.ru
```

Сохранить: `Ctrl+O`, `Enter`, `Ctrl+X`

#### 3.7 Запустить бэкенд
```bash
pm2 start index.js --name ofmapgen-backend-dev
pm2 save
pm2 startup  # выполнить команду которую покажет PM2
```

#### 3.8 Проверить статус
```bash
pm2 status
pm2 logs ofmapgen-backend-dev
```

Должно быть:
```
🚀 Backend server running on port 3002
📦 GitHub: baculinivan-web/OFmapGen
🔐 Token configured: true
```

#### 3.9 Настроить Nginx
```bash
sudo nano /etc/nginx/sites-available/devmaps.mivps.ru
```

Добавить **перед** `location /`:
```nginx
# API proxy для галереи
location /api/ {
    proxy_pass http://localhost:3002/api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    
    # CORS headers
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
    
    if ($request_method = 'OPTIONS') {
        return 204;
    }
}
```

Сохранить: `Ctrl+O`, `Enter`, `Ctrl+X`

#### 3.10 Перезапустить Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Тестирование

#### 4.1 Health check
```bash
curl http://localhost:3002/api/health
# Должен вернуть: {"status":"ok","timestamp":"..."}
```

#### 4.2 Проверить в браузере
- [ ] Открыть: https://devmaps.mivps.ru
- [ ] Нажать кнопку "Gallery" в header
- [ ] Галерея должна открыться (пока пустая)
- [ ] Создать карту
- [ ] Добавить нации
- [ ] Нажать "Download map archive"
- [ ] Нажать "Publish to Gallery"
- [ ] Заполнить форму
- [ ] Отправить карту
- [ ] Должен появиться успех + ссылка на PR

#### 4.3 Проверить GitHub
- [ ] Перейти: https://github.com/baculinivan-web/OFmapGen/pulls
- [ ] Должен быть новый PR от нового аккаунта
- [ ] Проверить файлы в PR:
  - `maps/full/название-карты.png`
  - `maps/thumbnails/название-карты.png`
  - `maps/proof/название-карты.png`
  - `maps/metadata.json` (обновлен)
  - `maps/copyrights/название-карты.md` (если был copyright)

#### 4.4 Смержить PR
- [ ] Проверить карту
- [ ] Нажать "Merge pull request"
- [ ] Confirm merge

#### 4.5 Проверить галерею
- [ ] Обновить https://devmaps.mivps.ru/gallery.html
- [ ] Карта должна появиться в галерее
- [ ] Кликнуть на карту
- [ ] Должно открыться модальное окно с деталями
- [ ] Проверить ссылку "Download Map Package"

### 5. Деплой на продакшн (опционально)

Если всё работает на dev, повторить шаги 3.4-3.10 для продакшена:
- Папка: `/root/OFmapGen`
- Ветка: `main` (сначала смержить `dev` → `main`)
- PM2 имя: `ofmapgen-backend`
- Nginx конфиг: `/etc/nginx/sites-available/mivps.ru`
- URL: https://mivps.ru

## 📝 Полезные команды

### PM2
```bash
pm2 status                          # Статус всех процессов
pm2 logs ofmapgen-backend-dev       # Логи
pm2 restart ofmapgen-backend-dev    # Перезапуск
pm2 stop ofmapgen-backend-dev       # Остановка
pm2 delete ofmapgen-backend-dev     # Удаление
```

### Git
```bash
git pull origin dev                 # Обновить код
git status                          # Статус
git log --oneline -5                # Последние 5 коммитов
```

### Nginx
```bash
sudo nginx -t                       # Проверить конфигурацию
sudo systemctl reload nginx         # Перезапустить
sudo tail -f /var/log/nginx/error.log  # Логи ошибок
```

### Debugging
```bash
# Проверить порт
sudo lsof -i :3002

# Проверить процессы
ps aux | grep node

# Проверить .env
cat /root/OFmapGen-dev/backend/.env | grep GITHUB_TOKEN
```

## 🆘 Troubleshooting

### "Cannot find module"
```bash
cd /root/OFmapGen-dev/backend
npm install
pm2 restart ofmapgen-backend-dev
```

### "Port already in use"
```bash
pm2 delete ofmapgen-backend-dev
pm2 start index.js --name ofmapgen-backend-dev
```

### "GitHub API authentication failed"
Проверить токен в `.env` и права Collaborator

### "CORS policy error"
Проверить `ALLOWED_ORIGINS` в `.env` и nginx конфиг

## ✅ Готово!

После выполнения всех шагов:
- ✅ Бэкенд работает на VPS
- ✅ Галерея доступна
- ✅ Публикация карт работает
- ✅ PR создаются автоматически
- ✅ Карты появляются в галерее после мержа

Удачи! 🚀
