FROM node:22-bookworm-slim AS dev
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run db:generate

FROM dev AS production
RUN npm run build
ENV HOST=0.0.0.0
EXPOSE 3002
CMD ["npm", "start"]
