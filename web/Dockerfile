# Contexto de build: raiz do repositório (workspaces npm + package-lock.json únicos).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w web --include-workspace-root=false
COPY web/ web/
RUN npm run build -w web

FROM nginx:1.27-alpine AS runtime
ENV API_URL=http://server:3333
COPY web/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
