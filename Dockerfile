# Key2lix - Node server + static client (Debian slim for better-sqlite3 prebuilds)
FROM node:20-slim

WORKDIR /app

# Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Application
COPY . .

# SQLite data directory (created at runtime if missing)
RUN mkdir -p client/data client/data/backup

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
