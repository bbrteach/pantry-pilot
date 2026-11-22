# Stage 1: Build React + Vite frontend
FROM node:22-slim AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build Express + TypeScript backend & compile native better-sqlite3
FROM node:22-slim AS server-builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build
RUN npm prune --omit=dev

# Stage 3: Minimal production runtime (keeps Railway memory footprint low)
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=client-builder /app/client/dist ./client/dist

# Ensure default data directory exists (override with DATABASE_PATH=/data/pantrypilot.db on Railway Volume)
RUN mkdir -p /app/server/data

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
