# Быстрый старт галереи

## Для локальной разработки

1. **Установите зависимости:**
```bash
cd backend
npm install
```

2. **Создайте `.env`:**
```bash
cp .env.example .env
nano .env
# Вставьте GitHub токен
```

3. **Запустите бэкенд:**
```bash
npm start
```

4. **Запустите фронтенд:**
```bash
# В корне проекта
npx serve .
# или
python3 -m http.server
```

5. **Откройте в браузере:**
- http://localhost:8000 (или другой порт)
- Создайте карту
- Добавьте нации
- Нажмите "Publish to Gallery"

## Для деплоя на VPS

См. подробную инструкцию в `DEPLOYMENT_VPS.md`

**Кратко:**
```bash
# На VPS
cd /root/OFmapGen-dev
git pull origin dev
cd backend
npm install
nano .env  # добавьте токен
pm2 start index.js --name ofmapgen-backend-dev
pm2 save

# Настройте nginx (см. DEPLOYMENT_VPS.md)
sudo nano /etc/nginx/sites-available/devmaps.mivps.ru
sudo nginx -t
sudo systemctl reload nginx
```

## Проверка работы

```bash
# Health check
curl http://localhost:3002/api/health

# Должен вернуть:
{"status":"ok","timestamp":"..."}
```

## Структура проекта

```
backend/
  index.js          # Express сервер
  package.json      # Зависимости
  .env             # Настройки (НЕ в Git!)
  .env.example     # Пример настроек

maps/
  metadata.json    # Список карт
  full/           # Полные карты
  thumbnails/     # Превью
  proof/          # Watermarked доказательства
  copyrights/     # Copyright notices

gallery.html      # Страница галереи
publish.js        # Логика публикации
```

## Процесс публикации

1. Пользователь создает карту
2. Добавляет нации
3. Нажимает "Publish to Gallery"
4. Заполняет форму (название, ник, copyright)
5. Скачивает proof image
6. Отправляет карту
7. Бэкенд создает PR в GitHub
8. Вы проверяете и мержите PR
9. Карта появляется в галерее

## Полезные команды

```bash
# PM2
pm2 status
pm2 logs ofmapgen-backend-dev
pm2 restart ofmapgen-backend-dev

# Git
git pull origin dev
git status

# Nginx
sudo nginx -t
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/error.log
```
