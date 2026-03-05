# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage
FROM caddy:2-alpine
COPY --from=builder /app/dist /srv/dist
COPY Caddyfile /etc/caddy/Caddyfile
ENV NODE_ENV=production
