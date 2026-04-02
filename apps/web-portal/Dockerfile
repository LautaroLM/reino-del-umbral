FROM node:22-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

ARG VITE_API_URL
ARG VITE_GAME_CLIENT_URL

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GAME_CLIENT_URL=$VITE_GAME_CLIENT_URL

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ao/web-portal build

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/web-portal/dist /usr/share/nginx/html

EXPOSE 80
