# Stage 1: Build the client assets and vendor WASM
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy dependency manifests and build scripts
COPY package*.json ./
COPY scripts/ ./scripts/

# Install dependencies (runs postinstall copy-vendor.mjs)
RUN npm ci

# Copy source and static assets
COPY . .

# Compile TypeScript and Vite production bundle
RUN npm run build

# Stage 2: Production runtime image
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    MEDIQ_HOST=0.0.0.0 \
    MEDIQ_API_PORT=5173 \
    MEDIQ_DOCKER=true

# Install production dependencies only
COPY package*.json ./
COPY scripts/ ./scripts/
RUN npm ci --omit=dev

# Copy compiled frontend and server files
COPY --from=builder /app/dist ./dist
COPY server/ ./server/
COPY shared/ ./shared/
COPY public/ ./public/

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5173/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
