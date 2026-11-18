FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ffmpeg ca-certificates   && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --network-timeout 600000
COPY . .
CMD ["yarn", "docker"]
