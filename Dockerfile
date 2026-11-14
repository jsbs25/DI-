# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install dependencies (no package-lock in repo; keep deterministic enough for deploy)
COPY package.json bun.lock* ./
RUN npm install --no-audit --no-fund

# Copy source and build frontend (VITE_BASE=/ for same-origin production)
COPY . .
ARG VITE_BASE=/
ENV VITE_BASE=${VITE_BASE}
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV EARTH_ONE_SERVE_DIST=true

# Runtime deps + tsx for TypeScript server entry
COPY package.json bun.lock* ./
RUN npm install --omit=dev --no-audit --no-fund && npm install tsx --no-audit --no-fund

# App runtime files
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/src ./src
COPY --from=build /app/data ./data
COPY --from=build /app/public ./public
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/package.json ./package.json

# Persistent data must be mounted here (Render Disk). Do NOT bake production data into image.
RUN mkdir -p /var/data
VOLUME ["/var/data"]

EXPOSE 10000
CMD ["sh", "-c", "PORT=${PORT:-10000} npx tsx server.ts"]
