# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy only production dependencies and build output
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
# Copy .env if not using docker secrets/env vars externally which is better, but for simplicity:
# COPY --from=builder /app/.env ./.env 

# Create uploads directory
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

EXPOSE 3310

USER node

CMD ["node", "dist/main"]
