# Build stage
FROM node:22-alpine@sha256:e58326d0d441090181ac150dc2078d3e2cf6a0d42e809aebba3ef5880935ffdd AS builder
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage
FROM caddy:2-alpine@sha256:77c07d5ebfa5be9fd6c820d2094ae662c9e7eeb9bf98346b7f639900263ee2a2
COPY --from=builder /app/dist /srv/dist
COPY Caddyfile /etc/caddy/Caddyfile
ENV NODE_ENV=production
