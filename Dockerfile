FROM nginx:alpine
COPY *.html *.css *.js *.abr /usr/share/nginx/html/
COPY brushes/ /usr/share/nginx/html/brushes/
EXPOSE 80
