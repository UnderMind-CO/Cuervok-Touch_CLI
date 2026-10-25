/** Electron Fuses — hardening del binario (hook afterPack de electron-builder).
 *
 * El proyecto es ESM ("type": "module"), pero electron-builder 22 carga este
 * hook con require(), por eso es un .cjs y exporta `exports.default`.
 *
 * Qué bloquea cada fuse (FuseV1Options de @electron/fuses):
 * - RunAsNode: ELECTRON_RUN_AS_NODE convierte el cliente en un Node genérico
 *   (permite ejecutar JS arbitrario con TODOS los módulos del app) → off.
 * - EnableNodeOptionsEnvironmentVariable: la variable NODE_OPTIONS permite
 *   cargar módulos arbitrarios (--require) en el arranque → off.
 * - EnableNodeCliInspectArguments: el debugger remoto (--inspect) queda off,
 *   bloquea manipular el proceso del cliente corriendo desde fuera → off.
 * - EnableCookieEncryption: cifra las cookies en disco con una key ligada a
 *   la cuenta de Windows → ON, evita robar sesiones copiando el perfil.
 * - OnlyLoadAppFromAsar: el binario solo carga la app desde app.asar.
 *   Es el fuse más invasivo (un fallo rompe el arranque del instalador
 *   empaquetado): se deja en false explícito y se enciende cuando el
 *   instalador haya sido probado de extremo a extremo.
 * - EnableEmbeddedAsarIntegrityValidation: DEBE quedar en false con
 *   electron-builder 22 — el builder no escribe el recurso de checksum del
 *   app.asar dentro del .exe en Windows y el runtime muere en el arranque
 *   con FATAL "asar/archive_win.cc: FindResource failed 0x715"
 *   (verificado: exit -36861). Cuando se suba electron-builder a >= 24.9
 *   (embed de asar integrity para Windows) se reenciende junto con
 *   OnlyLoadAppFromAsar.
 *
 * ⚠ Un fuse que crashea el arranque deja el cliente inusable hasta un nuevo
 *   instalador: cualquier cambio aquí debe probarse lanzando
 *   release/win-unpacked/Cuervok.exe antes de publicar.
 */
const path = require('path')
const { flipFuses, FuseV1Options, FuseVersion } = require('@electron/fuses')

exports.default = async function afterPack(context) {
  const isWin = context.electronPlatformName === 'win32'
  // electron-builder: Windows → <ProductName>.exe, Linux → <productName>
  const exeName = isWin
    ? `${context.packager.appInfo.productFilename}.exe`
    : context.packager.appInfo.productFilename
  const exePath = path.join(context.appOutDir, exeName)

  console.log(`[afterpack] Flipping Electron Fuses on ${exePath}`)

  try {
    await flipFuses(exePath, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolToExtraUtility]: false
    })
  } catch (err) {
    console.error('[afterpack] flipFuses FAILED:', err)
    throw err
  }

  console.log('[afterpack] Fuses flipped OK')
}
