# 05 - Stack web

## Stack elegido

### Cliente de juego
Phaser + TypeScript

### Servidor de juego
Colyseus + Node.js + TypeScript

### Portal web
React + TypeScript

### Base de datos
PostgreSQL

### Cache y soporte futuro
Redis

### Infra local
Docker Compose

### Organización del repo
Monorepo

## Justificación del stack

## Phaser

Se elige Phaser porque:

- está pensado para navegador,
- funciona muy bien para 2D,
- encaja con mapas por tiles y sprites,
- reduce fricción para un juego top-down,
- tiene una curva razonable para una slice web rápida.

## Colyseus

Se elige Colyseus porque:

- está orientado a multijugador en tiempo real,
- permite rooms o zonas,
- facilita sincronización autoritativa,
- encaja con una primera versión compartida en browser.

## React

Se usa React para el portal porque:

- simplifica login, registro y selección de personaje,
- separa claramente la web pública del canvas del juego,
- es cómodo para crecer después hacia cuenta, perfil o ranking.

## PostgreSQL

Se usa PostgreSQL porque:

- el dominio del juego es estructurado,
- conviene consistencia fuerte para cuentas, personajes e inventario,
- es una base sólida para crecer.

## Redis

Redis no será el corazón del sistema, pero puede servir más adelante para:

- rate limiting,
- presencia,
- sesiones efímeras,
- cachés,
- coordinación entre procesos.

## Regla de implementación

La prioridad no es usar tecnología sofisticada, sino construir un stack estable, claro y mantenible.