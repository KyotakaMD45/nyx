FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
CMD ["npx", "pm2-runtime", "index.js", "--name", "nyx"]
