# 07 - Base de datos

## Objetivo

Definir una base persistente simple, consistente y suficiente para la primera slice web.

## Tablas iniciales

### `accounts`

Campos sugeridos:

- id
- email o username
- password_hash
- created_at
- updated_at

## `characters`

Campos sugeridos:

- id
- account_id
- name
- race
- class
- level
- experience
- hp_current
- hp_max
- map_id
- pos_x
- pos_y
- gold
- created_at
- updated_at

## `inventory_slots`

Campos sugeridos:

- id
- character_id
- slot_index
- item_template_id
- quantity
- updated_at

## `item_templates`

Campos sugeridos:

- id
- name
- type
- stackable
- max_stack
- sell_value
- metadata_json

## Persistencia mínima requerida

El sistema debe persistir, como mínimo:

- cuenta,
- personaje,
- hp al salir,
- posición segura,
- nivel,
- experiencia,
- inventario,
- oro.

## Cuándo guardar

### Guardado obligatorio

- al entrar con personaje,
- al salir,
- al cambiar progreso relevante,
- al modificar inventario,
- al actualizar estado persistente importante.

## Reglas de consistencia

- un personaje no debe ser controlado por dos sesiones simultáneas,
- el inventario debe pertenecer a un personaje válido,
- los objetos usados deben existir y pertenecer al jugador,
- los cambios de progreso no deben perderse ante logout normal.