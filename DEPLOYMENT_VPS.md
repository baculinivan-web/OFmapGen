# Деплой галереи на VPS

## Шаг 1: Подготовка на VPS

### 1.1 Установите Node.js (если еще не установлен)

```bash
# Проверьте версию Node.js
node --version

# Если Node.js не установлен или версия < 16:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверьте установку
node --version  # должно быть >= 16.x
npm --version
```

### 1.2 Установите PM2 (менеджер процессов)

```bash
sudo npm install -g pm2
```

## Шаг 2: Обновите код на VPS

```bash
# Перейдите в папку проекта
cd /root/OFmapGen-dev  # или /root/OFmapGen для продакшена

# Получите последние изменения
git fetch origin
git pull origin dev  # или main для продакшена
```

## Шаг 3: Настройте бэкенд

### 3.1 Установите зависимости

```bash
cd backend
npm install
```

### 3.2 Создайте .env файл

```bash
nano .env
```

Вставьте следующее содержимое:

```env
# GitHub Configuration
GITHUB_TOKEN=ваш_токен_здесь
GITHUB_OWNER=baculinivan-web
GITHUB_REPO=OFmapGen

# Server Configuration
PORT=3002
NODE_ENV=production

# Security
MAX_FILE_SIZE=5242880
ALLOWED_ORIGINS=https://mivps.ru,https://devmaps.mivps.ru
```

**Важно:** Замените `ваш_токен_здесь` на реальный GitHub токен!

Сохраните: `Ctrl+O`, `Enter`, `Ctrl+X`

### 3.3 Проверьте что .env не в Git

```bash
git status
# .env НЕ должен быть в списке изменений
```

## Шаг 4: Запустите бэкенд

### 4.1 Тестовый запуск

```bash
# Находясь в папке backend/
npm start
```

Вы должны увидеть:
```
🚀 Backend server running on port 3002
📦 GitHub: baculinivan-web/OFmapGen
🔐 Token configured: true
```

Нажмите `Ctrl+C` чтобы остановить.

### 4.2 Запуск с PM2 (продакшн)

```bash
# Находясь в папке backend/
pm2 start index.js --name ofmapgen-backend-dev

# Для продакшена используйте другое имя:
# pm2 start index.js --name ofmapgen-backend

# Сохраните конфигурацию PM2
pm2 save

# Настройте автозапуск при перезагрузке
pm2 startup
# Выполните команду которую покажет PM2
```

### 4.3 Проверьте статус

```bash
pm2 status
pm2 logs ofmapgen-backend-dev
```

## Шаг 5: Настройте Nginx

### 5.1 Откройте конфиг Nginx

```bash
# Для dev сервера
sudo nano /etc/nginx/sites-available/devmaps.mivps.ru

# Для продакшена
# sudo nano /etc/nginx/sites-available/mivps.ru
```

### 5.2 Добавьте проксирование API

Найдите блок `server` и добавьте **перед** блоком `location /`:

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
    
    # Handle preflight
    if ($request_method = 'OPTIONS') {
        return 204;
    }
}

# Существующий location /
location / {
    proxy_pass http://localhost:3001;
    # ... остальные настройки
}
```

Сохраните: `Ctrl+O`, `Enter`, `Ctrl+X`

### 5.3 Проверьте и перезапустите Nginx

```bash
# Проверьте конфигурацию
sudo nginx -t

# Если OK, перезапустите
sudo systemctl reload nginx
```

## Шаг 6: Проверьте работу

### 6.1 Проверьте API

```bash
# Health check
curl http://localhost:3002/api/health

# Должен вернуть:
# {"status":"ok","timestamp":"..."}
```

### 6.2 Проверьте через браузер

Откройте в браузере:
- Dev: https://devmaps.mivps.ru/gallery.html
- Prod: https://mivps.ru/gallery.html

## Шаг 7: Мониторинг

### Просмотр логов

```bash
# Логи бэкенда
pm2 logs ofmapgen-backend-dev

# Логи Nginx
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Управление PM2

```bash
# Статус
pm2 status

# Перезапуск
pm2 restart ofmapgen-backend-dev

# Остановка
pm2 stop ofmapgen-backend-dev

# Удаление
pm2 delete ofmapgen-backend-dev
```

## Troubleshooting

### Ошибка: "Cannot find module"

```bash
cd /root/OFmapGen-dev/backend
npm install
pm2 restart ofmapgen-backend-dev
```

### Ошибка: "Port 3002 already in use"

```bash
# Найдите процесс
sudo lsof -i :3002

# Остановите старый процесс
pm2 delete ofmapgen-backend-dev
pm2 start index.js --name ofmapgen-backend-dev
```

### Ошибка: "GitHub API authentication failed"

Проверьте токен в `.env`:
```bash
cd /root/OFmapGen-dev/backend
cat .env | grep GITHUB_TOKEN
```

Убедитесь что:
1. Токен правильный
2. Новый аккаунт добавлен как Collaborator
3. Токен имеет права `repo`

### Ошибка: "CORS policy"

Проверьте `ALLOWED_ORIGINS` в `.env`:
```bash
cat .env | grep ALLOWED_ORIGINS
```

Должно быть:
```
ALLOWED_ORIGINS=https://mivps.ru,https://devmaps.mivps.ru
```

## Обновление кода

Когда вы пушите изменения в GitHub:

```bash
cd /root/OFmapGen-dev
git pull origin dev
cd backend
npm install  # если были изменения в package.json
pm2 restart ofmapgen-backend-dev
```

## Автоматический деплой

Можно настроить GitHub Actions для автоматического деплоя. Добавьте в `.github/workflows/deploy-dev.yml`:

```yaml
# После существующих шагов деплоя добавьте:
- name: Deploy Backend
  run: |
    cd /root/OFmapGen-dev/backend
    npm install
    pm2 restart ofmapgen-backend-dev || pm2 start index.js --name ofmapgen-backend-dev
```

## Готово!

Теперь система галереи работает:
- ✅ Бэкенд запущен на порту 3002
- ✅ Nginx проксирует `/api/` на бэкенд
- ✅ Галерея доступна на `/gallery.html`
- ✅ Публикация карт работает через модальное окно

Пользователи могут:
1. Создать карту
2. Добавить нации
3. Нажать "Publish to Gallery"
4. Заполнить форму
5. Отправить карту
6. Вы получите Pull Request в GitHub
7. После мержа карта появится в галерее
