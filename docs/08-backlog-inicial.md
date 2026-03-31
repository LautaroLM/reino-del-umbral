# 08 - Backlog inicial

## Objetivo

Traducir la documentación a una secuencia concreta de trabajo.

## Bloque 1 - Infraestructura del repo

- inicializar monorepo con pnpm,
- crear `apps/` y `packages/`,
- configurar TypeScript base,
- configurar ESLint y Prettier,
- crear `docker-compose.yml`,
- levantar PostgreSQL local,
- crear `.env.example`.

## Bloque 2 - Portal web

- crear app React con Vite,
- pantalla de login,
- pantalla de registro,
- pantalla de selección de personaje,
- almacenamiento de sesión,
- navegación a `/play`.

## Bloque 3 - Game client

- crear app Phaser con TypeScript,
- escena de boot,
- preload de assets,
- `GameScene`,
- conexión a room,
- render del jugador propio,
- render de otros jugadores,
- input de movimiento,
- HUD mínimo,
- chat box.

## Bloque 4 - Game server

- crear proyecto Colyseus,
- definir `GameRoom`,
- definir estado sincronizado,
- implementar `join_game`,
- validar sesión,
- spawnear jugador,
- implementar movimiento validado,
- sincronizar estado,
- implementar chat local.

## Bloque 5 - Combate y enemigos

- crear enemigo simple,
- lógica básica de target,
- ataque del jugador,
- daño,
- muerte,
- loot simple.

## Bloque 6 - Persistencia

- esquema inicial de base,
- carga de personaje,
- guardado al salir,
- persistencia de nivel, hp, oro e inventario.

## Bloque 7 - Integración vertical

- login completo,
- entrada al juego,
- join a room,
- snapshot inicial,
- movimiento online,
- chat online,
- combate online,
- guardado y relogin.

## Criterios de aceptación de la primera slice

- un usuario puede iniciar sesión,
- puede entrar al juego,
- puede ver a otro jugador,
- puede moverse,
- puede escribir por chat,
- puede atacar a un enemigo,
- el servidor valida el combate,
- el progreso mínimo se conserva tras logout.