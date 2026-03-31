# 06 - Monorepo y contratos

## Estructura del monorepo

```text
reino-del-umbral/
├─ apps/
│  ├─ web-portal/
│  ├─ game-client/
│  ├─ game-server/
│  └─ admin/
├─ packages/
│  ├─ shared-types/
│  ├─ shared-protocol/
│  ├─ shared-constants/
│  ├─ shared-utils/
│  └─ config/
├─ infrastructure/
│  ├─ docker/
│  ├─ db/
│  └─ scripts/
├─ docs/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ docker-compose.yml