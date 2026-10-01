# Distribución de Cuervok

## Compilación de desarrollo

`pnpm build` genera el contenido compilado en `dist/`. No crea un instalador.

## Instalador Windows

Usar:

```powershell
pnpm run dist
```

Cada ejecución incrementa automáticamente la versión patch (`0.1.0` -> `0.1.1`) antes de empaquetar. El cambio se escribe en `package.json` y `package-lock.json`; conviene revisar y confirmar esos archivos antes de publicar el release.

El instalador NSIS queda en:

```text
release/Cuervok Setup 0.1.0.exe
```

También se genera `release/Cuervok Setup 0.1.0.exe.blockmap`, `release/latest.yml` y `release/win-unpacked/`. Para compartir en GitHub Releases se publica normalmente el `.exe`; el `.blockmap` y `latest.yml` se conservan si se desea actualización diferencial.

El proceso copia el runtime del juego, ofusca `fixes.js` y empaqueta la aplicación. No incluye credenciales ni archivos privados del servidor.

Para mapas custom publicados fuera del checkout de desarrollo, el cliente y AME deben compartir la carpeta de overrides mediante `CUERVOK_CLIENT_ASSET_OVERRIDES`. El servidor Touch debe apuntar a la carpeta de mapas mediante `CUERVOK_TOUCHEMU_MAPS`.