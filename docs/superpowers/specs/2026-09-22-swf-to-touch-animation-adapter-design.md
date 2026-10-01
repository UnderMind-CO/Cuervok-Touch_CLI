# Adaptador de animaciones SWF 1.29/2.xx a Dofus Touch

## Objetivo

Mejorar el editor ubicado en `C:\Users\Jhoan\Downloads\Dof test\DofusTouch\editor` para convertir SWF de Dofus 1.29 y 2.xx en assets que el cliente Touch reconozca como un item completo y animado en todas las posiciones `static`, `walk` y `run`.

El resultado debe publicarse automáticamente en las rutas de overrides que consumen el cliente y/o el emulador. No se requiere entregar manualmente archivos al usuario: el editor debe generar y colocar los archivos necesarios.

## Problema confirmado

Los SWF contienen masters completos y piezas internas. En el ejemplo `bouftea_maur.swf` existen masters como `runR`, `runL`, `runF`, `runB`, `runS`, `walkR`, `walkL`, `walkF`, `walkB`, `walkS` y `static*`, junto con símbolos como `runR_Front`, `runR_Back`, `walkL_Front` y `walkL_Back`.

Las piezas `_Front` y `_Back` no son sprites raíz. Si el adaptador las selecciona directamente, el juego recibe solo una parte del objeto y muestra piezas sueltas durante idle, caminar o correr. Las clases `AnimCourse_*`, `AnimMarche_*` y `AnimStatique_*` son nombres de salida Touch o símbolos intermedios; no deben confundirse automáticamente con los masters originales.

## Decisiones aprobadas

- Rasterizar frame a frame la display-list completa de cada master.
- Detectar automáticamente candidatos, pero permitir selección manual por cada una de las 15 salidas.
- Usar preview animado para confirmar que el master compone el objeto completo.
- Admitir nombres distintos entre SWF 1.29 y 2.xx.
- Asignar automáticamente el siguiente `bonesId` libre, permitiendo actualizar un ID existente.
- Conservar todas las animaciones y frames disponibles; el tamaño de los archivos no es una restricción.
- Publicar de forma atómica solamente después de validar la salida.

## Masters requeridos

El editor debe producir estas 15 entradas lógicas:

```text
staticR staticL staticF staticB staticS
walkR   walkL   walkF   walkB   walkS
runR    runL    runF    runB    runS
```

Los nombres anteriores son nombres lógicos de salida del adaptador. No son requisitos rígidos para los nombres internos del SWF.

## Arquitectura

### 1. Importador SWF

Construye un catálogo de símbolos con export name, `characterId`, frames, hijos, matrices, profundidad, bounding box y preview rasterizado.

Debe funcionar con las herramientas y dependencias existentes del editor, incluyendo `swf-parse.mjs`, `retro129-bake.mjs`, `per-anim-export.mjs`, `jeff`, `@napi-rs/canvas` y `pngjs`.

### 2. Detector de candidatos

Usa tres niveles:

1. Alias de nombres conocidos, con tolerancia a mayúsculas, separadores, prefijos y nombres equivalentes.
2. Análisis estructural: cantidad de frames, jerarquía de hijos, presencia de `_Front`/`_Back`, bounding box, orientación y diferencia entre idle/walk/run.
3. Selección manual cuando la confianza no sea suficiente.

Un símbolo que sea claramente `_Front`, `_Back` o una pieza individual debe quedar clasificado como interno y no como master sugerido.

### 3. Mapeo manual

La interfaz debe mostrar una tabla de 15 filas. Cada fila incluye destino lógico, candidato sugerido, selector de símbolos, nombre, número de frames, bounding box, preview del primer frame y tira animada.

El usuario puede sustituir cualquier candidato. Debe existir una acción para aceptar las sugerencias cuando sean válidas.

No se permite publicar si falta una entrada, un candidato está vacío, una salida de movimiento tiene un solo frame sin confirmación explícita, o dos destinos comparten un símbolo sin confirmación explícita.

### 4. Compositor

Para cada master seleccionado:

1. Reproducir todos sus frames.
2. Recorrer recursivamente la display-list completa.
3. Resolver símbolos hijos.
4. Aplicar matrices acumuladas, escalas, desplazamientos, rotaciones, espejos y profundidad.
5. Dibujar en el orden correcto.
6. Calcular bounding box completo.
7. Rasterizar el frame con su offset original.

No debe ensamblar manualmente `_Front` y `_Back`; el master seleccionado decide qué subcomponentes aparecen en cada frame.

Los movimientos conservan el número real de frames. `walk` y `run` no pueden reducirse silenciosamente a un frame estático.

### 5. Generador Touch/Jeff

Genera el atlas principal y los archivos por animación que el cliente requiera:

```text
motion.json
motion.png
AnimStatique_0..7
AnimMarche_0..7
AnimCourse_0..7
AnimStart_0..7
```

El mapeo base es:

```text
S → 0
R → 1
F → 2
L → 5
B → 6
```

Las direcciones adicionales se derivan por simetría únicamente cuando corresponda. Nunca se deben eliminar ni sustituir las cinco direcciones reales.

### 6. Publicador

Genera primero una salida temporal. Tras validar, asigna el siguiente `bonesId` libre o usa el ID seleccionado para actualización, elimina/reemplaza de forma controlada los archivos antiguos de ese ID y publica en las rutas efectivas de overrides del cliente, emulador y userData según la configuración existente.

La operación debe ser atómica: un error de render, validación o copia no debe dejar una instalación parcialmente actualizada.

## Validaciones

La salida debe comprobar:

- 15 masters lógicos seleccionados.
- JSON y PNG presentes.
- PNG legible y con dimensiones compatibles.
- Todos los índices dentro de rango.
- Transformaciones válidas.
- Sin símbolos vacíos.
- Ocho direcciones Touch por familia.
- `walk` y `run` con sus frames reales.
- `AnimStatique`, `AnimMarche` y `AnimCourse` no son copias silenciosas entre sí, salvo que el SWF original realmente las comparta.
- Ninguna salida está compuesta únicamente por un símbolo `_Front` o `_Back`.
- El bounding box de cada salida no es sospechosamente pequeño frente a sus masters relacionados.

## Errores de usuario

Los errores deben indicar la fila y el símbolo responsable. Ejemplos:

- No se encontró candidato para `runL`.
- `walkR_Front` parece ser una pieza interna y no un master completo.
- `runB` contiene un solo frame.
- `staticS` produjo una imagen vacía.
- Dos destinos usan el mismo símbolo.
- No se pudo resolver la display-list del `characterId` indicado.

No se publicará una salida inválida.

## Pruebas

Se añadirá una regresión basada en `bouftea_maur.swf` que:

1. Catalogue los símbolos del SWF.
2. Detecte los masters completos y descarte piezas `_Front`/`_Back` como raíz.
3. Componga las 15 animaciones.
4. Compruebe que `staticR/L`, `walkR/L` y `runR/L` no contienen solo una pieza.
5. Compruebe que `walk` y `run` tienen múltiples frames cuando el master los tiene.
6. Valide el atlas y los per-animation JSON/PNG.
7. Simule publicación nueva, actualización de ID, fallo de validación y fallo de copia.

También se probará un SWF 2.xx (`Cocodrial`) con nombres diferentes para confirmar que la selección manual permite completar el mapeo sin depender de aliases 1.29.

## Criterio de éxito

Una adaptación válida debe ser reconocida por Touch y mostrar:

```text
staticR/L/F/B/S: sprite completo quieto
walkR/L/F/B/S:   animación completa de caminar
runR/L/F/B/S:    animación completa de correr
```

No debe aparecer un sprite congelado, una celda aislada, solo cuerpo, solo montura, solo jinete ni un subclip `_Front`/`_Back` fuera de la composición del master.
