FROM nginx:alpine
COPY *.html *.css *.js *.abr *.py /usr/share/nginx/html/
COPY brushes/ /usr/share/nginx/html/brushes/
COPY map-test-kit/ /usr/share/nginx/html/map-test-kit/
EXPOSE 80
