FROM nginx:alpine
COPY *.html *.css *.js /usr/share/nginx/html/
EXPOSE 80
