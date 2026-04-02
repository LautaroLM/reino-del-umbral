FROM node:22-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ao/game-server build

FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/game-server/package.json ./apps/game-server/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/shared-constants/package.json ./packages/shared-constants/package.json
COPY packages/shared-protocol/package.json ./packages/shared-protocol/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/shared-utils/package.json ./packages/shared-utils/package.json

RUN pnpm install --prod --frozen-lockfile --filter @ao/game-server...

COPY --from=builder /app/apps/game-server/dist ./apps/game-server/dist
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/shared-constants/dist ./packages/shared-constants/dist
COPY --from=builder /app/packages/shared-protocol/dist ./packages/shared-protocol/dist
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-utils/dist ./packages/shared-utils/dist

EXPOSE 2567

WORKDIR /app/apps/game-server

CMD ["node", "dist/index.js"]
