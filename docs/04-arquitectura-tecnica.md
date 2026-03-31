# 04 - Arquitectura técnica

## Principio rector

**El cliente representa; el servidor decide.**

## Arquitectura general

El proyecto se divide en cuatro capas:

1. portal web,
2. cliente de juego,
3. servidor de juego,
4. persistencia y servicios auxiliares.

## Portal web

Responsable de:

- registro,
- login,
- selección de personaje,
- entrada al juego.

## Cliente de juego

Responsable de:

- render del mundo,
- input del usuario,
- UI,
- representación visual del estado,
- interpolación visual.

El cliente no decide:

- daño,
- hp,
- inventario real,
- resultado del combate,
- validez del movimiento,
- drops,
- progreso.

## Servidor de juego

Responsable de:

- rooms o zonas,
- estado del mundo,
- movimiento validado,
- combate,
- enemigos,
- NPCs,
- loot,
- experiencia,
- persistencia crítica,
- broadcasting.

## Persistencia

Responsable de guardar:

- cuentas,
- personajes,
- inventario,
- nivel,
- experiencia,
- posición segura,
- oro,
- estado persistente relevante.

## Módulos lógicos del servidor

### Autenticación
Valida sesión y personaje.

### Mundo
Gestiona mapas, zonas y visibilidad.

### Movimiento
Valida intención, colisiones y estado del personaje.

### Combate
Resuelve ataques, daño y muerte.

### Inventario
Gestiona objetos, uso, slots y ownership.

### Social
Gestiona chat y presencia.

### Persistencia
Carga y guarda estado.

## Flujo de entrada al mundo

1. El usuario hace login.
2. Selecciona personaje.
3. El cliente entra a `/play`.
4. El cliente conecta a la room.
5. El servidor valida sesión.
6. El servidor carga estado persistente.
7. El personaje aparece en una posición válida.
8. El cliente recibe snapshot inicial.

## Flujo de movimiento

1. El cliente envía intención de movimiento.
2. El servidor valida.
3. El servidor actualiza posición real.
4. El servidor sincroniza a clientes relevantes.

## Flujo de combate

1. El cliente envía solicitud de ataque.
2. El servidor valida estado, rango y target.
3. El servidor calcula daño.
4. El servidor actualiza hp.
5. El servidor resuelve muerte si corresponde.
6. El servidor emite resultado.

## Snapshot y eventos incrementales

### Snapshot
Se usa al entrar a una room o mapa.

### Eventos incrementales
Se usan para cambios posteriores:

- movimiento,
- daño,
- chat,
- spawn,
- despawn,
- loot,
- updates.

## Seguridad mínima

- validación de sesión,
- contraseñas hasheadas,
- rate limiting,
- validación estricta del lado servidor,
- rechazo de mensajes inválidos,
- ownership correcto de objetos y personaje.

## Riesgos principales

- desincronización,
- persistencia inconsistente,
- lógica demasiado acoplada,
- falta de herramientas de debug.