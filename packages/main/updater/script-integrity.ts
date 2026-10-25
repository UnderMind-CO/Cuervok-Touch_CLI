/**
 * script-integrity.ts — pin de integridad del bundle del juego (anti-tamper).
 *
 * El updater descarga build/script.js (todo el engine del juego) desde el CDN
 * de Ankama y le aplica los regex patches. Ese archivo es EL punto donde un
 * atacante inyectaría código (auto-follow, auto-farm, robo de sesión, exploit
 * del protocolo): basta modificar el archivo en disco o el contenido servido.
 *
 * Defensa en profundidad, 100% transparente para el server:
 *  1. PRE-PATCH  — tras descargar cada actualización, los entrypoints se
 *     verifican contra esta allowlist ANTES de aplicar los regex propios. Un
 *     bundle modificado aborta el update (el juego no se sobreescribe).
 *  2. POST-INSTALL — verificationOnLaunch() recomprueba los archivos en disco
 *     en cada arranque del cliente (protege contra edits locales entre
 *     updates). El fallo se reporta a la UI en vez de arrancar el juego.
 *
 * Mantenimiento: cuando Ankama publique una nueva versión del bundle los
 * hashes cambian → updateFilesFailed. Regenerar con:
 *   node scripts/pin-script-integrity.mjs
 * (lee el juego instalado y reescribe GAME_SCRIPT_INTEGRITY aquí).
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { get } from '../constants'
import { logger } from '../logger'

export interface ScriptIntegrityEntry {
  /** SHA-256 hex del contenido ORIGINAL (pre-regex, tal como sale del CDN). */
  sha256: string
  /** Longitud exacta en bytes — un hash colisionado no cambia también el tamaño. */
  size: number
}

/**
 * Allowlist fijada (pinned) del bundle oficial. La generó
 * scripts/pin-script-integrity.mjs desde el juego instalado y verificado.
 * Claves = rutas relativas dentro de GAME_PATH (formato del manifest).
 */
export const GAME_SCRIPT_INTEGRITY: Record<string, ScriptIntegrityEntry> = {
  "build/script.js": {
    "sha256": "19ef3558e4520620091bd3123dd0643fa01d333fde7755bb64bd8acfdefcbff9",
    "size": 5397029
  },
  "build/primus.js": {
    "sha256": "015f5f7d5d1b3f6fa5aa5a19acfbafbdc48e7d766366091dc030dfa73ff040a1",
    "size": 201388
  }
}

function sha256Of(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Verifica el diccionario { ruta → contenido } que produce el updater
 * (ANTES de _applyRegex). Devuelve true si TODOS los entrypoints pinneados
 * presentes en el download coinciden. Los archivos ausentes no fallan (el
 * manifest oficial puede omitirlos en alguna versión); lo que SÍ falla es
 * que un archivo pinneado presente tenga otro hash/tamaño.
 */
export function verifyScriptIntegrity(
  files: Record<string, string>,
): boolean {
  const failures: string[] = []

  for (const [rel, expected] of Object.entries(GAME_SCRIPT_INTEGRITY)) {
    const content = files[rel]
    if (content === undefined) continue // no ven en este manifest: nada que verificar

    const actualHash = sha256Of(content)
    const actualSize = Buffer.byteLength(content, 'utf-8')
    if (actualHash !== expected.sha256 || actualSize !== expected.size) {
      failures.push(
        `${rel}: esperado sha=${expected.sha256.slice(0, 12)}…/${expected.size}B, ` +
        `recibido sha=${actualHash.slice(0, 12)}…/${actualSize}B`)
    }
  }

  if (failures.length) {
    logger.error('[integrity] FALLO de integridad del bundle del juego:')
    for (const f of failures) logger.error(`[integrity]   ✗ ${f}`)
    return false
  }

  logger.info('[integrity] Bundle del juego verificado contra el pin SHA-256.')
  return true
}

/**
 * Verificación post-install: recomprueba los archivos EN DISCO (los hashes
 * post-patch difieren de los pre-patch, así que aquí solo validamos los
 * archivos que NO tocamos con regex — hoy primus.js). Se llama en el arranque
 * del cliente; un fallo indica que alguien editó el juego entre updates.
 */
export function verificationOnLaunch(): { ok: boolean; failures: string[] } {
  const failures: string[] = []
  const gamePath = get.GAME_PATH()

  // primus.js se copia sin regex → hash estable entre updates.
  // El pin puede estar AUSENTE si el manifest oficial dejó de servirlo y
  // el pin se regeneró con una versión antigua del script de pineado: sin
  // esta guardia, primus.sha256 de undefined TIRABA el arranque del cliente
  // (TypeError) — el fallo se reporta, nunca se tira.
  const primus = GAME_SCRIPT_INTEGRITY['build/primus.js']
  try {
    const p = path.join(gamePath, 'build/primus.js')
    if (primus && fs.existsSync(p)) {
      const buf = fs.readFileSync(p)
      if (sha256Of(buf) !== primus.sha256 || buf.length !== primus.size) {
        failures.push(`build/primus.js modificado en disco (sha=${sha256Of(buf).slice(0, 12)}…)`)
      }
    }
  } catch (e: any) {
    failures.push(`build/primus.js ilegible: ${e?.message ?? e}`)
  }

  if (failures.length) {
    logger.error('[integrity] Archivos del juego modificados en disco:')
    for (const f of failures) logger.error(`[integrity]   ✗ ${f}`)
  }

  return { ok: failures.length === 0, failures }
}

/* ── PIN POST-PATCH del script.js (build/.script-pin.json) ───────────
 *
 * verificationOnLaunch() solo puede recomprobar los archivos que NO
 * tocamos con regex (hoy primus.js): los hashes post-patch de script.js
 * difieren del pin CDN por diseño. Ese hueco permitía editar script.js
 * EN DISCO entre updates (auto-follow, auto-farm, exploits) sin
 * detección — el vector que este archivo existe para cerrar.
 *
 * Cierre: processGame() re-pinnea el archivo que va a servir (hash
 * post-patch + stamp del patch set) y mantiene una copia BASELINE
 * (build/.script.baseline.js, copia post-regex). En el arranque
 * siguiente, si el hash difiere con el MISMO stamp, se restaura la
 * baseline y el propio processGame re-aplica los patches sobre ella.
 */

/** Stamp del patch set actual — BUMP MANUAL al cambiar los patches de processGame. */
export const SCRIPT_PIN_STAMP = 'v1-2026-10-24'

export interface ScriptPin {
  sha256: string
  size: number
  stamp: string
  writtenAt: string
}

function scriptPaths() {
  const gamePath = get.GAME_PATH()
  return {
    scriptPath: path.join(gamePath, 'build', 'script.js'),
    pinPath: path.join(gamePath, 'build', '.script-pin.json'),
    baselinePath: path.join(gamePath, 'build', '.script.baseline.js')
  }
}

export function readScriptPin(): ScriptPin | null {
  try {
    const { pinPath } = scriptPaths()
    return fs.existsSync(pinPath) ? JSON.parse(fs.readFileSync(pinPath, 'utf-8')) : null
  } catch {
    return null
  }
}

/**
 * Comprueba el script.js de disco contra el pin post-patch. En mismatch
 * con el mismo stamp intenta restaurar la baseline (post-regex,
 * pre-processGame). Nunca lanza: un fallo inesperado se registra en
 * logs, y el arranque de la ventana de juego no se bloquea.
 */
export function verifyPatchedScriptOnLaunch(): { tampered: boolean; restored: boolean; reason?: string } {
  const pin = readScriptPin()
  if (!pin || pin.stamp !== SCRIPT_PIN_STAMP) return { tampered: false, restored: false }

  const { scriptPath, baselinePath } = scriptPaths()
  try {
    const buf = fs.readFileSync(scriptPath)
    if (sha256Of(buf) === pin.sha256 && buf.length === pin.size) {
      return { tampered: false, restored: false }
    }

    const reason = `sha actual=${sha256Of(buf).slice(0, 12)}…/${buf.length}B, pin=${pin.sha256.slice(0, 12)}…/${pin.size}B`
    if (!fs.existsSync(baselinePath)) {
      logger.error(`[integrity] script.js MODIFICADO en disco y sin baseline disponible (${reason})`)
      return { tampered: true, restored: false, reason }
    }
    logger.error(`[integrity] script.js MODIFICADO en disco (${reason}) — restaurando baseline pinneada`)
    fs.writeFileSync(scriptPath, fs.readFileSync(baselinePath))
    return { tampered: true, restored: true, reason }
  } catch (e: any) {
    logger.error(`[integrity] verificación del script parcheado falló: ${e?.message ?? e}`)
    return { tampered: true, restored: false, reason: e?.message ?? String(e) }
  }
}

/**
 * Garantiza la copia baseline (post-regex, pre-processGame) de script.js.
 * La llama el updater justo tras escribir el juego (tras el gate pre-regex)
 * y processGame como último recurso.
 */
export function ensureScriptBaseline(): void {
  try {
    const { scriptPath, baselinePath } = scriptPaths()
    if (fs.existsSync(scriptPath) && !fs.existsSync(baselinePath)) {
      fs.copyFileSync(scriptPath, baselinePath)
      logger.info('[integrity] baseline de script.js creada (post-regex)')
    }
  } catch (e: any) {
    logger.warn(`[integrity] no se pudo crear la baseline: ${e?.message ?? e}`)
  }
}

/**
 * Re-pinnea el script.js que processGame va a servir (hash post-patch +
 * stamp) y asegura la baseline. Se ejecuta al FINAL de processGame en cada
 * arranque, así que el pin siempre tiene el último estado legal conocido.
 */
export function writeScriptPin(): void {
  try {
    const { scriptPath, pinPath } = scriptPaths()
    if (!fs.existsSync(scriptPath)) return
    ensureScriptBaseline()
    const buf = fs.readFileSync(scriptPath)
    const pin: ScriptPin = {
      sha256: sha256Of(buf),
      size: buf.length,
      stamp: SCRIPT_PIN_STAMP,
      writtenAt: new Date().toISOString()
    }
    fs.writeFileSync(pinPath, JSON.stringify(pin))
  } catch (e: any) {
    logger.warn(`[integrity] no se pudo escribir el pin post-patch: ${e?.message ?? e}`)
  }
}
