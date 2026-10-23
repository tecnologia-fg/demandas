FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1 TZ=America/Sao_Paulo
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && node node_modules/next/dist/bin/next dev --hostname 0.0.0.0"]
