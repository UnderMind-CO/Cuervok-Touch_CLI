# Adaptador SWF 1.29/2.xx a Touch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir SWF de Dofus 1.29 y 2.xx usando los masters completos seleccionados por el usuario, rasterizar todas las animaciones `static/walk/run` y publicar automáticamente assets Jeff válidos en el cliente/emulador.

**Architecture:** Añadir un catálogo y detector de símbolos independiente del renderer. El usuario confirmará o corregirá un `MasterSelection` de 15 entradas; el horno existente replayará la display-list completa de cada símbolo seleccionado, y un publicador transaccional generará `motion.*`, pares per-animation, `bonesId` libre y las copias necesarias de overrides. El flujo antiguo de skins de items equipables seguirá separado del flujo de entidades.

**Tech Stack:** Node.js ESM, TypeScript/React, `swf-parse.mjs`, FFDec, `@napi-rs/canvas`, `pngjs`, `jeff`, servidor HTTP local en `editor-server.mjs`.

## Global Constraints

- No elegir nunca un símbolo raíz terminado en `_Front` o `_Back` cuando exista un master/wrapper completo.
- Los nombres `staticR/L/F/B/S`, `walkR/L/F/B/S` y `runR/L/F/B/S` son destinos lógicos, no nombres obligatorios del SWF de entrada.
- La composición debe replayar la display-list completa del master; no ensamblar manualmente piezas internas.
- `walk` y `run` deben conservar todos los frames reales disponibles.
- La salida Touch debe exponer las ocho direcciones por familia y los pares JSON/PNG separados que el cliente solicita.
- El publish no puede modificar las rutas finales hasta que toda la salida temporal pase la validación.
- La asignación automática debe reutilizar el ID del item cuando corresponda y, si no, seleccionar el siguiente `bonesId` libre.
- No añadir dependencias: usar las versiones ya presentes en `editor/package.json`.
- No modificar el cliente ni el emulador para resolver un error que pueda corregirse en el adaptador; solo publicar en sus overrides efectivos.

---

## Mapa de archivos

### Archivos existentes a modificar

- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/swf-parse.mjs` — exponer metadatos de símbolos suficientes para catalogar nombres, exports, frames, hijos y bounds sin duplicar el parser.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/retro129-bake.mjs` — aceptar una selección explícita de masters y sustituir la búsqueda rígida de nombres por `MasterSelection`; mantener el replay recursivo y el formato Jeff.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/per-anim-export.mjs` — conservar la extracción por animación, pero endurecer la detección de las 24 clases y validar que las celdas correspondan al atlas nuevo.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/verify-retro129-output.mjs` — añadir validaciones de cobertura, frames de movimiento, símbolos internos y consistencia de los per-animation.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/editor-server.mjs` — añadir inspección/mapeo/preview/publicación transaccional de entidades; corregir el alcance de `baked` y evitar copiar antes de validar.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/src/components/SpriteImporter.tsx` — reemplazar el toggle simple de retro por el asistente de 15 masters con preview, selección manual y confirmación.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/src/i18n/index.ts` — textos de catálogo, estados de confianza, errores por fila, validación y publicación.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/src/App.css` — estilos del grid de mapeo, preview animado, estados de error/advertencia y resumen de publicación.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/package.json` — añadir un script de prueba local si el runner final lo necesita, sin cambiar el gestor ni agregar paquetes.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/README.md` — documentar el flujo SWF 1.29/2.xx y las rutas publicadas.

### Archivos nuevos a crear

- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/entity-animation-model.mjs` — constantes, tipos de datos serializables y helpers de `MasterSelection`.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/entity-animation-catalog.mjs` — catalogación y preview de símbolos a partir de `parseSwfBinary()`.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/entity-animation-detector.mjs` — aliases, scoring y detección de candidatos para los 15 destinos.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/entity-animation-output.mjs` — construcción de salida temporal, mapeo de direcciones Touch y coordinación de atlas/per-animation.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/entity-animation-publish.mjs` — selección de `bonesId`, copia atómica, sincronización de `characters/`, userData y limpieza de caché.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/scripts/entity-animation.test.mjs` — pruebas de parser/catalogador/detector/validador contra los SWF de `bouftea maur` y `Cocodrial`.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/src/components/EntityAnimationMapper.tsx` — tabla de 15 filas, selectores, previews y validación interactiva.
- `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor/src/components/AnimatedSpritePreview.tsx` — reproducción controlada de una secuencia de frames y preview de frame único.

---

## Task 1: Definir el modelo de selección y el catálogo serializable

**Files:**
- Create: `editor/scripts/entity-animation-model.mjs`
- Modify: `editor/scripts/swf-parse.mjs`
- Test: `editor/scripts/entity-animation.test.mjs`

**Interfaces:**

```js
export const MASTER_KEYS = [
  'staticR', 'staticL', 'staticF', 'staticB', 'staticS',
  'walkR', 'walkL', 'walkF', 'walkB', 'walkS',
  'runR', 'runL', 'runF', 'runB', 'runS',
]

export const TOUCH_DIR = { S: 0, R: 1, F: 2, L: 5, B: 6 }

export function emptyMasterSelection() {
  return Object.fromEntries(MASTER_KEYS.map((key) => [key, null]))
}

export function normalizeMasterSelection(input) {
  // return { staticR: { charId, exportName, confidence, source }, ... }
}

export function selectionErrors(selection, catalog) {
  // return [{ key, code, message, severity: 'error'|'warning' }]
}
```

- [ ] **Step 1: Escribir los casos fallidos para las 15 claves, direcciones Touch y rechazo de piezas internas.**

```js
import assert from 'node:assert/strict'
import { MASTER_KEYS, TOUCH_DIR, selectionErrors } from './entity-animation-model.mjs'

assert.equal(MASTER_KEYS.length, 15)
assert.deepEqual(TOUCH_DIR, { S: 0, R: 1, F: 2, L: 5, B: 6 })
const errors = selectionErrors({ staticR: { charId: 3, exportName: 'staticR_Front' } }, { byId: new Map([[3, { isInternalPart: true }]]) })
assert.equal(errors[0].code, 'INTERNAL_PART')
```

- [ ] **Step 2: Ejecutar el test y confirmar que falla porque los módulos aún no existen.**

Run: `node scripts/entity-animation.test.mjs`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar el modelo y helpers puros sin depender de React ni del servidor.**

`selectionErrors()` debe detectar entrada ausente, `charId` inexistente, nombre `_Front`/`_Back`, frame count cero y duplicate `charId` cuando el duplicado no fue confirmado explícitamente.

- [ ] **Step 4: Exponer desde `parseSwfBinary()` una función o datos derivados para obtener `frameCount`, exports por `charId`, hijos y bounds sin volver a leer el SWF.**

- [ ] **Step 5: Ejecutar el test y verificar PASS.**

Run: `node scripts/entity-animation.test.mjs`
Expected: PASS para los casos de modelo.

---

## Task 2: Crear el catálogo y la detección automática 1.29/2.xx

**Files:**
- Create: `editor/scripts/entity-animation-catalog.mjs`
- Create: `editor/scripts/entity-animation-detector.mjs`
- Modify: `editor/scripts/editor-server.mjs`
- Test: `editor/scripts/entity-animation.test.mjs`

**Interfaces:**

```js
export function buildAnimationCatalog(swfPath) {
  // Promise<{ work, swfPath, entries: CatalogEntry[], byName, byId }>
}

export function detectMasterCandidates(catalog) {
  // { selection: MasterSelection, candidates: Record<MasterKey, Candidate[]>, errors }
}

export function scoreCandidate(entry, key, catalog) {
  // { score, reasons, warnings }
}
```

`CatalogEntry` debe contener `{ charId, exportNames, primaryName, frameCount, childIds, childNames, bounds, isInternalPart, isAnimationOutput, previewable }`.

- [ ] **Step 1: Añadir pruebas con los dos SWF reales.**

Las pruebas deben cargar:

```text
C:/Users/Jhoan/Downloads/Dof test/Tool d2p descomprimir-comprimir/Tool D2P - 02/IconsId - 2.73 custom/por implementar/items/montura/bouftea maur/bouftea_maur.swf
C:/Users/Jhoan/Downloads/Dof test/Tool d2p descomprimir-comprimir/Tool D2P - 02/IconsId - 2.73 custom/por implementar/items/montura/Cocodrial/26689.swf
```

Deben comprobar que `bouftea maur` incluye candidatos sin sufijo para static/walk/run y que los símbolos `_Front`/`_Back` se catalogan como internos.

- [ ] **Step 2: Ejecutar la prueba para observar el fallo inicial.**

Run: `node scripts/entity-animation.test.mjs`
Expected: FAIL porque el catálogo/detector aún no están implementados.

- [ ] **Step 3: Implementar la catalogación usando `parseSwfBinary()` y recorrer `exportsMap`/`charExports`.**

Clasificar como interno un nombre cuyo último segmento sea `_front`, `_back`, `front`, `back`, `part`, `piece` o una variante de esos nombres. Clasificar como salida generada las clases `AnimStatique_*`, `AnimMarche_*`, `AnimCourse_*` y `AnimStart_*`.

- [ ] **Step 4: Implementar scoring por aliases y estructura.**

Normalizar separadores y case; reconocer aliases de `static`, `idle`, `stand`, `marche`, `walk`, `course`, `run`, además de las letras de orientación. Penalizar piezas internas, salidas `Anim*`, candidatos sin hijos y candidatos cuyo bounds sea significativamente menor que sus hermanos. Premiar wrappers que contienen piezas internas relacionadas y que tengan frames coherentes para la familia.

- [ ] **Step 5: Añadir endpoints de inspección.**

Implementar en `editor-server.mjs`:

```text
POST /api/entity-swf/catalog
GET  /api/entity-swf/catalog-preview?work=<id>&charId=<id>&frame=<n>
POST /api/entity-swf/validate-selection
```

El endpoint de validación recibe `{ work, selection }` y devuelve `{ ok, errors, warnings, catalog, selection }`.

- [ ] **Step 6: Ejecutar las pruebas reales y comprobar PASS.**

Run: `node scripts/entity-animation.test.mjs`
Expected: candidatos completos detectados en el SWF 1.29 y catálogo usable aunque los nombres del SWF 2.xx no coincidan.

---

## Task 3: Hacer que el horno reproduzca cualquier master seleccionado

**Files:**
- Modify: `editor/scripts/retro129-bake.mjs`
- Create: `editor/scripts/entity-animation-output.mjs`
- Test: `editor/scripts/entity-animation.test.mjs`

**Interfaces:**

```js
export async function bakeEntityAnimations(swfPath, selection, opts = {}) {
  // Promise<{ doc, atlasPng, meta, framesByKey, validations }>
}

export function mapMasterToTouchAnimations(framesByKey, opts = {}) {
  // { AnimStatique_0..7, AnimMarche_0..7, AnimCourse_0..7 }
}
```

- [ ] **Step 1: Añadir prueba que pase explícitamente `selection` para `bouftea maur`.**

Verificar que el resultado de `walkL`, `walkR`, `runL`, `runR`, `staticL` y `staticR` contiene más de una capa cuando el master las coloca y que no usa directamente el `charId` de `_Front`/`_Back` como raíz.

- [ ] **Step 2: Ejecutar la prueba antes del cambio y confirmar que el horno ignora la selección o falla al no usarla.**

Run: `node scripts/entity-animation.test.mjs`
Expected: FAIL por API inexistente o por output no asociado al master seleccionado.

- [ ] **Step 3: Extraer la composición actual de `retro129-bake.mjs` a una función que reciba `charId`, frame count y escala.**

Conservar `snapshotAt`, `collectFrame`, `renderChar`, matrices acumuladas, recursion guard y el comportamiento de sub-sprites animados. No volver a componer `_Back + _Front` manualmente.

- [ ] **Step 4: Cambiar `bakeRetro129()` para aceptar `{ selection }`.**

Cuando `selection` exista, usar exactamente los 15 `charId` seleccionados. Mantener un fallback compatible únicamente para llamadas antiguas que no proporcionen selección, pero marcarlo como legacy y no usarlo desde el nuevo endpoint/UI.

- [ ] **Step 5: Implementar `bakeEntityAnimations()` para 1.29 y 2.xx.**

El mismo compositor se utilizará para cualquier SWF cuyo catálogo permita resolver masters completos. El render de FFDec seguirá siendo la fuente de shapes; el compositor no dependerá del nombre del SWF.

- [ ] **Step 6: Implementar `mapMasterToTouchAnimations()`.**

Mapear `S/R/F/L/B` a `0/1/2/5/6` y producir `3/4/7` mediante las reglas de simetría existentes del cliente/Jeff. No reemplazar las cinco direcciones reales con espejos.

- [ ] **Step 7: Ejecutar las pruebas y generar una salida temporal de `bouftea maur`.**

Run: `node scripts/entity-animation.test.mjs`
Expected: PASS en composición y mapeo de direcciones.

---

## Task 4: Endurecer atlas, per-animation y validador

**Files:**
- Modify: `editor/scripts/per-anim-export.mjs`
- Modify: `editor/scripts/verify-retro129-output.mjs`
- Modify: `editor/scripts/entity-animation-output.mjs`
- Test: `editor/scripts/entity-animation.test.mjs`

- [ ] **Step 1: Escribir pruebas de regresión para los fallos observados.**

Las pruebas deben fallar si:

- un per-animation usa un PNG menor que su celda;
- una celda se sale del PNG propio;
- un clip tiene cero gráficos;
- `walk` o `run` queda con un solo frame cuando la selección tiene más;
- el per-animation no coincide con la celda equivalente del atlas;
- falta `meta.version` o `meta.image`;
- una animación está compuesta solo por un símbolo interno.

- [ ] **Step 2: Ejecutar las pruebas sobre una salida corrupta sintética.**

Run: `node scripts/entity-animation.test.mjs`
Expected: FAIL con errores identificables por nombre de animación y frame.

- [ ] **Step 3: Reforzar `exportPerAnimFiles()`.**

Exigir exactamente las 24 clases base × 8 direcciones cuando el output se marca como entidad completa, mantener índices locales de transforms y rechazar PNGs no potencia de dos o celdas fuera de rango antes de escribir resultados finales.

- [ ] **Step 4: Extender `verifyRetro129Output()` con metadatos de origen.**

El output debe incluir un bloque `meta.cuervok` con `{ sourceFormat, selection, masterCharIds, generatedAt }`. El validador comprobará que las clases generadas proceden del `MasterSelection`, que `walk/run` conservan frame counts y que ningún `charId` raíz es una pieza interna.

- [ ] **Step 5: Ejecutar tests sobre el output bueno y el corrupto.**

Run: `node scripts/entity-animation.test.mjs`
Expected: PASS para `bouftea maur`; FAIL limpio para cada fixture corrupto.

---

## Task 5: Crear publicación transaccional y asignación automática de bonesId

**Files:**
- Create: `editor/scripts/entity-animation-publish.mjs`
- Modify: `editor/scripts/editor-server.mjs`
- Test: `editor/scripts/entity-animation.test.mjs`

**Interfaces:**

```js
export function nextFreeBonesId({ overrideRoots, base = 10000 }) {
  // number
}

export function publishEntityOutput({ outputDir, bonesId, destinations, cacheRoots }) {
  // { files, destinations, removed, cachePurged }
}

export function collectEntityDestinations({ clientRoot, userDataRoot }) {
  // string[]
}
```

- [ ] **Step 1: Añadir pruebas de IDs libres y destinos.**

Usar carpetas temporales con IDs `10000`, `10001` y un hueco para comprobar que se elige el siguiente ID disponible sin colisionar. Comprobar que se generan los destinos planos y `characters/` cuando existen.

- [ ] **Step 2: Añadir prueba de rollback.**

Forzar un error al copiar un archivo y comprobar que los destinos finales conservan el output anterior y no quedan con un `motion.json` nuevo sin su `motion.png`.

- [ ] **Step 3: Implementar selección de destinos a partir de la configuración existente.**

Reutilizar `CLIENT_OVERRIDES_DIR` y el userData de `cuervok-touch`; no hardcodear una tercera ruta. Reportar al cliente las rutas que realmente fueron escritas.

- [ ] **Step 4: Implementar publicación mediante staging + rename.**

Crear una carpeta temporal junto al destino, copiar y validar todos los archivos, renombrar el destino anterior a backup temporal, renombrar staging al destino final y eliminar backup solo cuando todos los destinos hayan terminado. Si falla, restaurar el backup.

- [ ] **Step 5: Integrar limpieza de caché.**

Purgar únicamente entradas de `bones/<bonesId>` y `bones/characters/<bonesId>` relacionadas con el objeto publicado; no borrar caches oficiales no relacionadas. Devolver el número de entradas eliminadas.

- [ ] **Step 6: Corregir `/api/entity-swf/publish`.**

Separar claramente `built`/`baked` fuera de bloques de scope. Crear la salida temporal completa, ejecutar `exportPerAnimFiles()` y `verifyRetro129Output()` antes de llamar al publicador. No copiar nada a `CLIENT_OVERRIDES_DIR` hasta obtener `verdict.ok`.

- [ ] **Step 7: Mantener item/mapa y bones sincronizados.**

Después de publicar assets, actualizar `Items.json`, `ItemSkinMap.json`, `MountSaddles.json` y las rutas de `gfx/mounts` usando las escrituras atómicas existentes. Si una escritura de datos falla, restaurar el output de assets o informar el rollback completo.

- [ ] **Step 8: Ejecutar las pruebas de publicación.**

Run: `node scripts/entity-animation.test.mjs`
Expected: PASS para nueva publicación, actualización del mismo item, asignación automática y rollback.

---

## Task 6: Implementar el asistente de mapeo visual

**Files:**
- Create: `editor/src/components/AnimatedSpritePreview.tsx`
- Create: `editor/src/components/EntityAnimationMapper.tsx`
- Modify: `editor/src/components/SpriteImporter.tsx`
- Modify: `editor/src/i18n/index.ts`
- Modify: `editor/src/App.css`

**Interfaces:**

```ts
type MasterKey =
  | 'staticR' | 'staticL' | 'staticF' | 'staticB' | 'staticS'
  | 'walkR' | 'walkL' | 'walkF' | 'walkB' | 'walkS'
  | 'runR' | 'runL' | 'runF' | 'runB' | 'runS'

type Selection = Record<MasterKey, { charId: number; exportName: string } | null>

interface EntityAnimationMapperProps {
  catalog: CatalogReport
  selection: Selection
  onChange: (selection: Selection) => void
  onValidate: () => Promise<void>
  validation: ValidationReport | null
}
```

- [ ] **Step 1: Añadir componentes de preview.**

`AnimatedSpritePreview` debe aceptar una URL de preview o frames serializados, reproducirlos con un timer controlado y permitir pausar, avanzar y seleccionar frame. Debe mostrar `frameCount`, dimensiones y nombre del símbolo.

- [ ] **Step 2: Implementar la tabla de 15 filas.**

Cada fila debe mostrar destino lógico, candidato sugerido, `<select>` de símbolos compatibles, confidence/warnings, preview de primer frame, preview animado y número de frames. Filtrar o marcar visualmente `_Front`, `_Back` y `Anim*` como internos.

- [ ] **Step 3: Añadir acciones `Aceptar sugerencias`, `Validar selección` y `Cambiar SWF`.**

`Aceptar sugerencias` solo rellena celdas que no tengan error. `Validar selección` llama al backend y bloquea publicar mientras existan errores.

- [ ] **Step 4: Sustituir el toggle `retro129` del flujo de entidad.**

El flujo de mascota/montura/monstruo debe hacer: cargar SWF → catalogar → mostrar mapeo → validar → publicar con selección. El checkbox 1.29 puede mantenerse como indicador de formato, pero no debe activar un camino que ignore la selección.

- [ ] **Step 5: Añadir estado de progreso y errores por fila.**

Mostrar etapas `catalogando`, `detectando`, `renderizando`, `validando`, `publicando`, `limpiando caché` y `terminado`. Los errores deben identificar el destino y símbolo; nunca mostrar únicamente un HTTP 500 genérico.

- [ ] **Step 6: Añadir textos en español, inglés y francés.**

Actualizar las claves duplicadas existentes de `swf.*` sin eliminar traducciones actuales usadas por el flujo de items equipables.

- [ ] **Step 7: Ejecutar build del editor.**

Run from `C:/Users/Jhoan/Downloads/Dof test/DofusTouch/editor`: `pnpm build`
Expected: TypeScript y Vite terminan sin errores.

---

## Task 7: Integración end-to-end con los SWF de referencia

**Files:**
- Modify: `editor/scripts/entity-animation.test.mjs`
- Modify: `editor/README.md`
- Optionally modify: `editor/package.json` to add `test:entity`

- [ ] **Step 1: Ejecutar el test completo con `bouftea_maur.swf`.**

Run from editor root: `node scripts/entity-animation.test.mjs --swf "C:/Users/Jhoan/Downloads/Dof test/Tool d2p descomprimir-comprimir/Tool D2P - 02/IconsId - 2.73 custom/por implementar/items/montura/bouftea maur/bouftea_maur.swf"`

Expected:

```text
15 masters válidos
0 masters raíz Front/Back
static: 5 direcciones completas
walk: 5 direcciones con frames reales
run: 5 direcciones con frames reales
24 per-animation válidos
publish staging válido
```

- [ ] **Step 2: Ejecutar el flujo de `Cocodrial` con selección manual.**

Run: `node scripts/entity-animation.test.mjs --swf "C:/Users/Jhoan/Downloads/Dof test/Tool d2p descomprimir-comprimir/Tool D2P - 02/IconsId - 2.73 custom/por implementar/items/montura/Cocodrial/26689.swf"`

Expected: el detector puede dejar celdas pendientes, pero el `MasterSelection` manual permite completar las 15 entradas y el compositor genera salida válida.

- [ ] **Step 3: Verificar las rutas publicadas.**

Comprobar que cada destino contiene `motion.json`, `motion.png` y todos los pares esperados, y que el userData del emulador no conserva una versión anterior del mismo `bonesId`.

- [ ] **Step 4: Ejecutar el build y lint del editor.**

Run: `pnpm build && pnpm lint`
Expected: ambos comandos pasan.

- [ ] **Step 5: Actualizar README.**

Documentar la tabla de mapeo, la diferencia entre masters y piezas internas, la selección manual para 2.xx, el `bonesId` automático, el staging/publish y la validación antes de usar el objeto en el juego.

- [ ] **Step 6: Prueba manual en el juego.**

Reiniciar o recargar el cliente, equipar la montura y verificar:

```text
staticR/L/F/B/S
walkR/L/F/B/S
runR/L/F/B/S
```

Confirmar que no aparecen `Could not find any Animation`, `TemporaryAnimationManager.assignSymbol`, assets 404 de `bones/<id>` ni piezas parciales.

---

## Self-review del plan

- **Cobertura:** catálogo/detección (Tasks 1–2), composición (Task 3), atlas/per-animation/validación (Task 4), IDs/publicación/caché (Task 5), UI (Task 6), SWF 1.29/2.xx y prueba en juego (Task 7).
- **Placeholders:** no se usan `TBD`, `TODO`, instrucciones vagas ni interfaces sin nombre.
- **Consistencia:** `MasterSelection`, `MASTER_KEYS`, `TOUCH_DIR`, `bakeEntityAnimations()`, `verifyRetro129Output()` y `publishEntityOutput()` mantienen los mismos nombres a través de las tareas.
- **Alcance:** es un único subsistema integrado — adaptación de entidades SWF a assets Touch — separado del importador de skins equipables.
- **Riesgo principal controlado:** el publisher no escribe al cliente hasta que el output completo, los per-animation y las validaciones hayan pasado.
