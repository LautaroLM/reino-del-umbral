# Instrucciones del proyecto

Este proyecto es un RPG multijugador 2D web-first.

## Stack
- Cliente: Phaser + TypeScript
- Servidor de juego: Colyseus + Node.js + TypeScript
- Portal web: React + TypeScript
- Base de datos: PostgreSQL
- Infra local: Docker Compose

## Principios técnicos
- El cliente representa; el servidor decide.
- El cliente nunca define daño, hp, loot, inventario ni posición final válida.
- El servidor valida toda acción importante.
- El proyecto se desarrolla por slices verticales pequeñas.
- No agregar features fuera del alcance pedido.
- No introducir complejidad de MMO masivo en la primera etapa.

## Convenciones
- TypeScript estricto.
- Código modular y legible.
- No duplicar tipos entre cliente y servidor.
- Usar packages compartidos cuando corresponda.
- No crear abstracciones innecesarias en fase inicial.

## Prioridad actual
Construir la primera slice web:
login -> selección de personaje -> entrar a una room -> movimiento -> chat -> enemigo simple -> combate básico -> persistencia mínima