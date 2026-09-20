FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 precisa compilar codigo nativo
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data

EXPOSE 4001

CMD ["node", "server/index.js"]
