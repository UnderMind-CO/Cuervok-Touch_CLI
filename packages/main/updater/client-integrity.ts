/**
 * client-integrity.ts — pin de integridad de app.asar del PROPIO cliente.
 *
 * El vector que este archivo cierra: extraer resources/app.asar con
 * @electron/asar, editar el JS del main/preload (herramientas/trampas) y
 * re-empaquetar. electron-updater ya firma los instaladores, pero el asar
 * desplegado en disco puede editarse entre updates sin dejar rastro.
 *
 * Defensa (misma estrategia que script-integrity.ts usa para el bundle del
 * juego): en el arranque, calcular SHA-256 + tamaño de app.asar y comparar
 * contra lo publicado en el feed de updates (client-integrity.json, junto a
 * latest.yml). Un hash distinto significa "cliente modificado" y se reporta
 * a la UI en el canal IPCEvents.CLIENT_INTEGRITY_STATUS. La verificación
 * NUNCA bloquea el arranque: es detección + reporte, no un gate destructivo.
 *
 * Publicación del pin (release): generar el JSON con
 *   node scripts/pin-client-integrity.mjs
 * y servirlo desde el mismo directorio del feed
 * (<CUV_SERVER_URL>/releases/cuervok/client-integrity.json).
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { ClientIntegrityStatus } from '@cuervok/shared'
import { logger } from '../logger'

const INTEGRITY_FILE = 'client-integrity.json'
const FETCH_TIMEOUT_MS = 8000

function sha256Of(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/**
 * URL del feed de updates — misma resolución que el AppUpdater usa vía
 * electron-updater: override por env (CUV_UPDATES_URL / CUV_SERVER_URL) y,
 * en su defecto, la URL fijada por electron-builder en app-update.yml.
 */
function resolveFeedUrl(): string | null {
  const override =
    process.env.CUV_UPDATES_URL ||
    (process.env.CUV_SERVER_URL ? `${process.env.CUV_SERVER_URL.replace(/\/+$/, '')}/releases/cuervok` : null)
  if (override) return override.replace(/\/+$/, '')
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf-8')
    const m = yml.match(/^\s*url:\s*(\S+)\s*$/m)
    if (m) return m[1].replace(/\/+$/, '')
  } catch { /* dev build o feed sin app-update.yml */ }
  return null
}

interface IntegrityManifest {
  versions?: Record<string, { sha256?: string; sha512?: string; size?: number }>
  sha256?: string
  sha512?: string
  size?: number
}

/** Extrae el pin del manifest para la versión instalada (o el pin suelto). */
function pinFor(manifest: IntegrityManifest, version: string): { sha256?: string; sha512?: string; size?: number } | null {
  if (manifest.versions) {
    const perVersion = manifest.versions[version]
    if (perVersion && (perVersion.sha256 || perVersion.sha512)) return perVersion
    return null
  }
  if (manifest.sha256 || manifest.sha512) return manifest
  return null
}

let _cached: ClientIntegrityStatus | null = null
let _pending: Promise<ClientIntegrityStatus> | null = null

export function getClientIntegrityResult(): ClientIntegrityStatus | null {
  return _cached
}

/**
 * Gate bloqueante: corre la verificación y decide si el cliente puede
 * arrancar. El usuario pidió "modified O unknown (sin pin / feed caído)
 * → el cliente se BLOQUEA por completo": el arranque aborta — no se
 * registran IPC, no se abren ventanas ni updater, no se sirve contexto.
 * Implementación de "cualquier cosa de este" según lo pedido: exit con
 * ventana bloqueadora inline (data: URL, sin proceso hijo de Electron).
 */
export async function enforceClientIntegrity(): Promise<{ blocked: boolean; status: ClientIntegrityStatus }> {
  const status = await verifyClientIntegrity()
  const blocked = status.phase === 'modified' || status.phase === 'unknown'
  return { blocked, status }
}

/** Ejecuta la verificación una única vez por sesión. Idempotente. */
export function verifyClientIntegrity(): Promise<ClientIntegrityStatus> {
  if (_cached) return Promise.resolve(_cached)
  if (_pending) return _pending
  _pending = run().then((status) => {
    _cached = status
    _pending = null
    return status
  }).catch((err) => {
    logger.error('[client-integrity] verification crashed', err)
    _cached = { phase: 'unknown', reason: `verification error: ${err instanceof Error ? err.message : String(err)}`, checkedAt: new Date().toISOString() }
    _pending = null
    return _cached
  })
  return _pending
}

/**
 * Lee un archivo REAL de disco, sin el parche fs-para-asar de Electron.
 * El fs normal resuelve cualquier path que contenga app.asar como un path
 * DENTRO del asar: leer el propio app.asar con fs normal falla con
 * "ENOENT,  not found in <app.asar>" (path interno vacío). original-fs es
 * el fs sin parche que Electron empaca en runtime; si no está disponible
 * (dev unweighted), cae al fs normal.
 */
function readAsarRaw(p: string): Buffer {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ofs: typeof fs = require('original-fs')
    return ofs.readFileSync(p)
  } catch {
    return fs.readFileSync(p)
  }
}

async function run(): Promise<ClientIntegrityStatus> {
  const checkedAt = new Date().toISOString()

  if (!app.isPackaged) {
    const status: ClientIntegrityStatus = { phase: 'dev', reason: 'dev build: asar integrity check disabled', checkedAt }
    _cached = status
    return status
  }

  // app.asar desplegado: resources/app.asar (electron-builder default).
  const asarPath = app.getAppPath().endsWith('.asar')
    ? app.getAppPath()
    : path.join(process.resourcesPath, 'app.asar')

  let actualSha512 = ''
  let actualSha256 = ''
  let actualSize = -1
  try {
    const buf = readAsarRaw(asarPath)
    actualSize = buf.length
    actualSha512 = sha512Of(buf)
    actualSha256 = sha256Of(buf)
  } catch (e: any) {
    const status: ClientIntegrityStatus = { phase: 'unknown', reason: `app.asar ilegible: ${e?.message ?? e}`, checkedAt }
    logger.error('[client-integrity]', status.reason)
    return status
  }

  const feedUrl = resolveFeedUrl()
  if (!feedUrl) {
    const status: ClientIntegrityStatus = { phase: 'unknown', reason: 'feed de updates no resuelto — sin pin con que comparar', checkedAt }
    logger.warn('[client-integrity]', status.reason)
    return status
  }

  let manifest = await fetchManifestWithRetry(feedUrl)
  if (!manifest) {
    const status: ClientIntegrityStatus = { phase: 'unknown', reason: `feed de updates inaccesible tras ${FEED_FETCH_RETRIES} reintentos — sin pin con que comparar`, checkedAt }
    logger.warn('[client-integrity]', status.reason)
    return status
  }

  const pin = pinFor(manifest!, app.getVersion())
  if (!pin) {
    const status: ClientIntegrityStatus = { phase: 'unknown', reason: `el feed no publica pin para la versión ${app.getVersion()}`, checkedAt }
    logger.warn('[client-integrity]', status.reason)
    return status
  }

  // sha512 del feed (formato electron-updater "base64" o "hex") → hex may be base64; decode when needed
  const raw512 = pin.sha512 ? decodeSha512(pin.sha512) : ''
  if (raw512 && raw512 === actualSha512) {
    const status: ClientIntegrityStatus = { phase: 'verified', checkedAt }
    logger.info('[client-integrity] app.asar verificado contra el feed (sha512).')
    return status
  }

  if (!pin.sha256) {
    // Solo sha512 en feed: comparar por tamaño + sha512 descodificado
    if (pin.size && pin.size !== actualSize) {
      const status: ClientIntegrityStatus = { phase: 'modified', reason: `app.asar: tamaño ${actualSize}B ≠ esperado ${pin.size}B`, actualSha256, checkedAt }
      logger.error('[client-integrity] CLIENTE MODIFICADO:', status.reason)
      return status
    }
    // sha512 != y size no puede compararse sin base64: marca unknown → best-effort
    const status: ClientIntegrityStatus = { phase: raw512 ? 'modified' : 'unknown', reason: raw512 ? 'app.asar: sha512 distinto del pin del feed' : 'pin del feed incompleto (ni sha256 ni sha512 legible)', actualSha256, checkedAt }
    if (status.phase === 'modified') logger.error('[client-integrity] CLIENTE MODIFICADO:', status.reason)
    else logger.warn('[client-integrity]', status.reason)
    return status
  }

  if (actualSha256 !== pin.sha256) {
    const status: ClientIntegrityStatus = { phase: 'modified', reason: `app.asar modificado (sha256 ${actualSha256.slice(0, 12)}… ≠ ${pin.sha256.slice(0, 12)}…)`, actualSha256, expectedSha256: pin.sha256, checkedAt }
    logger.error('[client-integrity] CLIENTE MODIFICADO:', status.reason)
    return status
  }

  const status: ClientIntegrityStatus = { phase: 'verified', actualSha256: actualSha256, expectedSha256: pin.sha256, checkedAt }
  logger.info('[client-integrity] app.asar verificado contra el pin del feed (sha256).')
  return status
}

function sha512Of(buf: Buffer): string {
  return crypto.createHash('sha512').update(buf).digest('hex')
}

const FEED_FETCH_RETRIES = 3
const FEED_RETRY_DELAY_MS = 4000

/** Descarga el manifest de integridad con reintentos (red flaky no debe bloquear). */
async function fetchManifestWithRetry(feedUrl: string): Promise<IntegrityManifest | null> {
  for (let attempt = 1; attempt <= FEED_FETCH_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      const resp = await fetch(`${feedUrl}/${INTEGRITY_FILE}`, { signal: controller.signal, cache: 'no-store' })
      clearTimeout(timer)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      return await resp.json() as IntegrityManifest
    } catch (e: any) {
      logger.warn(`[client-integrity] intento ${attempt}/${FEED_FETCH_RETRIES} falló: ${e?.message ?? e}`)
      if (attempt < FEED_FETCH_RETRIES) await new Promise((r) => setTimeout(r, FEED_RETRY_DELAY_MS))
    }
  }
  return null
}

/** Acepta base64 (formato electron-updater) o hex y devuelve hex normalizado. */
function decodeSha512(value: string): string {
  try {
    if (/^[0-9a-f]{128}$/i.test(value)) return value.toLowerCase()
    const decoded = Buffer.from(value, 'base64')
    if (decoded.length === 64) return decoded.toString('hex')
  } catch { /* invalid */ }
  return ''
}
