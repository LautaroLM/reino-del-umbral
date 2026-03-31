# 03 - MVP y roadmap

## Definición del MVP

El MVP debe responder esta pregunta:

**¿Puede un jugador abrir el juego en navegador, entrar rápido, ver a otros, moverse, combatir, chatear, conseguir un objeto y salir sabiendo que su progreso quedó guardado?**

## Features obligatorias

### Infraestructura base

- registro/login,
- selección de personaje,
- conexión a servidor,
- persistencia básica.

### Núcleo jugable

- movimiento,
- colisiones,
- render de mapa,
- visualización de otros jugadores.

### Interacción

- chat local,
- chat privado,
- interacción con NPC,
- combate básico.

### Progreso

- hp,
- nivel,
- experiencia,
- loot,
- inventario,
- guardado.

### Contenido mínimo

- una zona segura,
- una zona de combate,
- un enemigo simple,
- una misión o guía inicial.

## Features deseables

- party,
- banco,
- comercio entre jugadores,
- más variedad de enemigos,
- loot más rico,
- crafting básico.

## Features postergadas

- clanes,
- facciones,
- PvP complejo,
- mercado global,
- housing,
- sistema político,
- eventos masivos,
- oficios profundos.

## Orden recomendado de implementación

### Etapa 1
Cliente básico con mapa, movimiento y colisiones.

### Etapa 2
Servidor con room simple y sincronización de jugadores.

### Etapa 3
Chat y presencia online funcional.

### Etapa 4
Enemigos, combate, daño y muerte.

### Etapa 5
Persistencia y guardado mínimo.

### Etapa 6
Pulido del flujo completo portal → juego → logout.

## Roadmap por fases

### Fase 0 - Preproducción
Congelar visión, stack y arquitectura.

### Fase 1 - Slice técnica local
Levantar monorepo, apps y entorno.

### Fase 2 - Slice online inicial
Dos jugadores conectados, movimiento y chat.

### Fase 3 - Slice jugable
Combate, enemigo, loot, guardado.

### Fase 4 - Alpha cerrada
Prueba con pocos usuarios reales.

## Criterios de éxito del MVP

El MVP está funcionando cuando:

- los jugadores pueden entrar sin fricción,
- pueden verse y moverse juntos,
- el combate es entendible,
- el chat se usa,
- el progreso se conserva,
- el mundo ya no parece una demo técnica vacía.