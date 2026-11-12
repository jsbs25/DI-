FROM node:22-slim
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV EARTH_ONE_SERVE_DIST=true
EXPOSE 3000

# Persist /app/server_data and /app/.env via mounted volumes in production.
CMD ["npx", "tsx", "server.ts"]
