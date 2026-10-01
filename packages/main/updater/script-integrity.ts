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
  'build/script.js': {
    sha256: '0b480e5afde680568f2b1a7c4b781ba7dd703e34232a0be3333244f685e1af1b',
    size: 5395253,
  },
  'build/primus.js': {
    sha256: '015f5f7d5d1b3f6fa5aa5a19acfbafbdc48e7d766366091dc030dfa73ff040a1',
    size: 201388,
  },
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
  const primus = GAME_SCRIPT_INTEGRITY['build/primus.js']
  try {
    const p = path.join(gamePath, 'build/primus.js')
    if (fs.existsSync(p)) {
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
