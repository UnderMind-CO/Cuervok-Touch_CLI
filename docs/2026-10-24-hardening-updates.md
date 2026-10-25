# Hardening del cliente + updates en VPS privado — 2026-10-24

Guía compacta de la corte defensiva del cliente Cuervok y de cómo siguen
recibiendo updates cuando el repo está privado. Los números de archivo
corresponden a los cambios de hoy.

## 1. Anti-tamper del script.js del juego (pin + baseline)

**Archivos:** `packages/main/updater/script-integrity.ts`,
`packages/main/windows/game-window.ts`, `packages/main/updater/game-updater.ts`

- **Pre-patch** (ya existía): los entrypoints descargados se comparan contra
  `GAME_SCRIPT_INTEGRITY` ANTES de aplicar los regex. Un bundle alterado
  aborta el update.
- **Pin post-patch** (nuevo): `processGame()` al terminar llama
  `writeScriptPin()` — escribe `build/.script-pin.json` con el SHA-256 +
  tamaño del script QUE VA A SERVIR, más un `SCRIPT_PIN_STAMP`.
- **Baseline** (nueva): `build/.script.baseline.js`, copia post-regex.
  La crea `ensureScriptBaseline()` en el updater justo tras escribir los
  archivos (detrás del gate pre-regex).
- **Arranque** (nuevo): `verifyPatchedScriptOnLaunch()` se ejecuta al
  inicio de `processGame()`. Si el hash del disco difiere del pin con el
  mismo stamp → alguien editó el juego fuera del updater → se restaura la
  baseline y el mismo `processGame()` re-aplica los patches sobre ella.

**Mantenimiento:** al cambiar cualquier patch dentro de `processGame()`,
bump de `SCRIPT_PIN_STAMP` (ej. `v1-2026-10-24` → `v2…`). Con un stamp
distinto la verificación considera el arranque como "update legítimo del
cliente" y no dispara restauración.

## 2. Electron Fuses + ofuscación (anti decompilación)

**Archivos:** `scripts/afterpack.cjs` (hook en `build.afterPack`),
`scripts/build.mjs`, `package.json`

Fuses volteados en `release/win-unpacked/Cuervok.exe` y en el instalador:

| Fuse                     | Valor | Efecto                                                        |
|--------------------------|-------|---------------------------------------------------------------|
| RunAsNode                | false | ELECTRON_RUN_AS_NODE no puede abrir la app como Node          |
| EnableCookieEncryption   | true  | Cookies cifradas con key ligada a la cuenta de Windows        |
| EnableNodeOptions…       | false | NODE_OPTIONS no carga módulos --require al arranque           |
| EnableNodeCliInspect…    | false | Inspector remoto (--inspect) deshabilitado                    |
| EnableEmbeddedAsar…      | false | ⚠ must stay false with electron-builder 22 — enabling it kills the startup with FATAL "asar/archive_win.cc: FindResource failed 0x715" (builder 22 does not embed the asar checksum into the Windows .exe). Re-enable when updating the builder to >= 24.9 along with OnlyLoadAppFromAsar |
| OnlyLoadAppFromAsar      | false | Se enciende cuando el instalador esté probado E2E             |

- `main` (`dist/main/index.cjs`) y `preload` (`dist/preload/*.js`) se
  ofuscan tras el build (mismas opciones que `fixes.js`); renderer ya usa
  `vite-plugin-javascript-obfuscator`.
- Eso protege el kernel gate, el attestation stamp y la lógica del updater
  de lectura casual. NO es criptografía: Ofuscación + Fuses = costo. El
  secreto persistente sigue siendo el emulador (attestation+HMAC server).
- ✅ **Validado:** `npx electron-builder --win nsis` genera `Cuervok Setup
  0.1.0.exe` con fuses aplicados, y `release/win-unpacked/Cuervok.exe` boots
  real (main + renderer + preload + updater). El `App update failed ...
  ERR_NAME_NOT_RESOLVED` que aparece es esperado: intenta resolver el
  placeholder del dominio VPS de `build.publish.url`; al fijar el dominio
  real y rebuild, llega.
- Smoke test permanente: `scripts/smoke-fuses.ps1` (arranca win-unpacked y
  reporta ALIVE/EXITED). Cualquier cambio de fuse se prueba con ese script;
  un fuse equivocado deja al cliente inusable hasta nuevo instalador.

## 3. Feed genérico servido por web-retro (repo privado)

**Archivos:** `package.json` (`build.publish.provider=generic`, url
`https://<dominio-web-retro>/prod/updater`),
`scripts/prepare-vps-feed.mjs` (`npm run feed:prepare`),
`packages/main/updater/app-updater.ts` (override runtime
`CUV_UPDATES_URL` / `CUV_SERVER_URL + /prod/updater`).

web-retro (Caddy) sirve `next-app/public` con file_server, así que el feed
es una carpeta estática — NO hace falta tocar el Caddyfile ni proxys:

```
next-app/public/prod/updater/latest.yml            ← release/latest.yml
next-app/public/prod/updater/releases/Cuervok Setup X.Y.Z.exe
next-app/public/prod/updater/releases/cuervok Setup X.Y.Z.exe.blockmap
```

Flujo de release:

1. Fija el dominio real en `build.publish.url` de `package.json`
   (placeholder actual) y compila con `npm run release` — el feed queda
   congelado en el `app-update.yml` internalizado del instalador.
2. `npm run feed:prepare` — reescribe las entradas `url:` del exe y el
   blockmap en `release/latest.yml` para que apunten a `releases/…`
   (idempotente; electron-updater las resuelve relativas al baseUrl).
3. Copia los tres archivos a la estructura de arriba (los binarios viven
   en `releases/`, el yml en la raíz del feed).

La ruta es de lectura pública por diseño (el updater no envía
credenciales); nadie puede escribir ahí desde internet y Caddy no lista
directorios por defecto.

### Override por variable de entorno (staging / VPS alternativo)

Sin rebuild: `CUV_UPDATES_URL=https://otro.vps.com/prod/updater` en el
entorno del proceso del cliente (o `CUV_SERVER_URL` y se compone
`<base>/prod/updater`). Solo aplica cuando `app.isPackaged`.

### ¿Público vs privado del repo?

Ni entra en juego: electron-updater NO consulta el repo con feed genérico —
solo lee `latest.yml` del URL que le configs. El repo pudo ser cerrado y el
instalador iniciar de nuevo sin validación.

### Qué subir NUNCA al repo ni al VPS

- `packages/main/admin-panel.html` (código fuente completo)
- `.env*`, `game/` (assets), cualquier cluster ejecutable.

## 4. Overlay "Please Wait, Checking Updates..."

**Archivo:** `packages/renderer/src/screens/SetupScreen.tsx`

Mientras el updater esta en fase `checking`/`available` se dibuja una capa
full-screen negra translúcida (`rgba(0,0,0,0.72)`) con el GIF de
`packages/renderer/src/assets/checking-updates.gif` (copiado de
`C:\Users\Jhoan\Pictures\Saved Pictures\loading.gif`, 150×150) y el texto
"Please Wait, Checking Updates...". La ventana del updater
(`packages/main/windows/updater-window.ts`) es FRAMELESS: sin barra título
ni botones nativos de min/max/cerrar — solo el gif y el texto. Alt+F4 o
cerrar desde la barra de tareas siguen disponibles como salida de
emergencia. Al pasar a `app-downloading` / `downloading` / `error` vuelve
el panel de siempre (barra + retry) sobre la misma ventana sin frame.

## 5. Checklist de validación pendiente (requiere un instalador)

1. `npm run release` → correr `release/win-unpacked/Cuervok.exe` y
   comprobar que arranca y pega el juego (los fuses están aplicados).
2. Tamper test: edita `build/script.js` instalado (AppData) → relanza →
   en el log debe salir `[integrity] script.js MODIFICADO en disco …
   restaurando baseline pinneada` y el juego debe bootear normal.
3. Feed: con el dominio real en `build.publish.url`, build 0.1.x → bájale
   0.0.17 al `version` de package.json en un fixture, sube `latest.yml` +
   setup al VPS → relaunch → debe detectar y descargar.
