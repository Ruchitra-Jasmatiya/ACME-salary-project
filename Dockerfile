# Stage 1: build the React UI
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Stage 2: run the API (no npm dependencies) and serve the built UI
FROM node:22-alpine
WORKDIR /app
COPY server/ ./server/
COPY --from=web /app/web/dist ./web/dist
ENV PORT=3001 \
    DB_PATH=/data/acme.db \
    WEB_DIR=/app/web/dist
RUN mkdir -p /data
EXPOSE 3001
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]
