/**
 * afterpack.cjs — hook de electron-builder (build.afterPack en package.json).
 *
 * Aplica Electron Fuses al ejecutable empaquetado ANTES de crear el
 * instalador. Objetivo anti-tamper: un asar trocado ni siquiera carga.
 *
 *   - ENABLE_EMBEDDED_ASAR_INTEGRITY_VALIDATION: Electron incrusta el hash
 *     del asar firmado en el binario; si resources/app.asar se edita a mano
 *     (asar extract → patch → pack), el proceso muere al arrancar.
 *   - ONLY_LOAD_APP_FROM_ASAR: cierra el bypass de cargar main desde
 *     app.asar.unpacked u otros paths arbitrarios.
 *   - RUN_AS_NODE=false / ENABLE_NODE_OPTIONS_ENV_VAR=false /
 *     ENABLE_NODE_CLI_INSPECT=false: bloquean ELECTRON_RUN_AS_NODE,
 *     NODE_OPTIONS y --inspect, los tres saltos clásicos para ejecutar
 *     el binario sin respetar el entrypoint ni con un inspector abierto.
 *   - ENABLE_COOKIE_ENCRYPTION=true: el cookies store usa los OS secrets
 *     (tokens de sesión no legibles copiando el archivo).
 *
 * Nota: la validación embebida de asar se apoya en que el binario esté
 * firmado (Authenticode en Windows). Sin firma funciona igual el flip del
 * fuse, pero la barrera más sólida es firma + fuse.
 */

const path = require('path')
const fs = require('fs')

async function afterPack(context) {
  // electron-builder empaqueta SIN asar si build.asar=false; los fuses de
  // integridad exigen asar: advertir claramente si la config lo desactiva.
  const packager = context.packager
  const usesAsar = packager.config.asar !== false
  if (!usesAsar) {
    console.warn('[afterpack] build.asar está en false — los fuses ONLY_LOAD_APP_FROM_ASAR y EMBEDDED_ASAR_INTEGRITY_VALIDATION no se aplican (requieren empaquetado asar).')
  }

  const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

  const productName = packager.appInfo.productFilename
  const executableCandidates = process.platform === 'win32'
    ? [path.join(context.appOutDir, `${productName}.exe`)]
    : process.platform === 'darwin'
      ? [path.join(context.appOutDir, `${productName}.app`, 'Contents', 'MacOS', productName)]
      : [path.join(context.appOutDir, productName)]

  const executable = executableCandidates.find((p) => fs.existsSync(p))
  if (!executable) {
    console.warn(`[afterpack] ejecutable no encontrado en ${context.appOutDir} (se buscó: ${executableCandidates.join(', ')}) — fuses NO aplicados`)
    return
  }

  // flipFuses exige el directorio o el binario; usar el binario directo.
  // Empaquetamos con Electron >= v28 → fuses v1 es el formato correcto.
  await flipFuses(executable, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: usesAsar,
    [FuseV1Options.OnlyLoadAppFromAsar]: usesAsar,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
  })

  console.log(`[afterpack] Fuses aplicados a ${executable}: RunAsNode/NODE_OPTIONS/inspect desactivados, asar-only=${usesAsar}, cookie encryption ON.`)
}

module.exports = afterPack
