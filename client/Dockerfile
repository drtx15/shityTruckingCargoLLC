FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=/api
ARG VITE_WS_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build

FROM nginx:1.27-alpine
ENV API_UPSTREAM_1=backend-a:3000
ENV API_UPSTREAM_2=backend-b:3000
ENV STORAGE_UPSTREAM=127.0.0.1:9000
ENV OBJECT_STORAGE_BUCKET=transit-grid-uploads
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.gateway.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
