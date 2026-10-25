# Contexto de build: raiz do repositório (workspaces npm + package-lock.json únicos).
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci -w server --include-workspace-root=false

FROM deps AS build
COPY server/ server/
RUN npx -w server prisma generate && npm run build -w server

# A imagem final mantém as dependências de desenvolvimento porque o Prisma CLI
# (migrate deploy) e o tsx (seed) rodam na inicialização do container.
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3333 \
    DATABASE_URL=file:/data/fogo.db \
    PRISMA_HIDE_UPDATE_MESSAGE=true
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server server
COPY server/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data
WORKDIR /app/server
VOLUME /data
EXPOSE 3333
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "dist/index.js"]
