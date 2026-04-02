FROM node:22-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

ARG VITE_WS_URL

ENV VITE_WS_URL=$VITE_WS_URL

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ao/game-client build

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/game-client/dist /usr/share/nginx/html

EXPOSE 80
