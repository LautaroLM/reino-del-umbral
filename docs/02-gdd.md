# 02 - GDD

## Género

RPG multijugador 2D web-first.

## Perspectiva

Top-down / cenital.

## Estilo visual inicial

Pixel art o low-detail 2D con tiles y sprites simples.

## Loop principal

1. El jugador entra al mundo desde una ciudad o zona segura.
2. Se mueve, explora o conversa con otros.
3. Sale a una zona de combate.
4. Enfrenta enemigos.
5. Obtiene loot o progreso.
6. Regresa, se equipa, interactúa y vuelve a salir.

## Estructura del mundo inicial

### Zona segura
Espacio social de entrada con NPCs básicos y jugadores conectados.

### Exterior cercano
Zona de bajo riesgo para combate inicial y primeros recursos.

### Zona de mayor peligro
Área o mapa donde el combate tenga más tensión y mejores recompensas.

## Creación de personaje

La primera versión debe incluir un creador simple con:

- nombre,
- raza,
- clase.

## Razas iniciales posibles

- humano,
- elfo,
- enano,
- nómade.

## Clases iniciales posibles

- guerrero,
- mago,
- explorador.

## Progresión

La progresión inicial será por niveles, con stats simples y visibles.

### Variables iniciales sugeridas

- hp,
- nivel,
- experiencia,
- daño,
- oro.

## Combate

El combate debe ser sencillo, rápido de entender y validado por servidor.

### Componentes mínimos

- ataque básico,
- daño,
- muerte,
- respawn,
- recompensa.

## Inventario

El inventario inicial debe ser simple, con slots y objetos básicos.

### Tipos de objeto iniciales

- arma,
- consumible,
- loot simple,
- oro,
- objetos de misión básicos.

## NPCs

La primera versión necesita al menos:

- vendedor,
- curador o equivalente,
- NPC de diálogo/tutorial.

## Social

El sistema social mínimo debe incluir:

- chat local,
- mensaje privado,
- presencia de otros jugadores en pantalla.

## Diseño del onboarding

El jugador debe poder entender en pocos minutos:

- cómo moverse,
- cómo hablar,
- cómo atacar,
- cómo volver a la zona segura,
- cómo conservar progreso.

## Regla de diseño

La primera versión no debe intentar resolver todos los sistemas del MMORPG. Solo debe validar que existe un mundo compartido con sentido.