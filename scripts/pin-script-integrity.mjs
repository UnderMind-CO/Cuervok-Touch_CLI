#!/usr/bin/env node
/**
 * pin-script-integrity.mjs — regenera el pin SHA-256 del bundle del juego.
 *
 * Lee los archivos ORIGINALES (pre-regex) del juego instalado y reescribe
 * GAME_SCRIPT_INTEGRITY en packages/main/updater/script-integrity.ts.
 *
 * OJO: build/script.js en disco queda POST-patch tras una instalación. Para
 * pinear el ORIGINAL hay que obtenerlo limpio del CDN (manifest.json →
 * build/script.js) — este script lo descarga del DOFUS_ORIGIN activo y
 * comprueba que el tamaño coincide con el disco (misma versión).
 *
 * Uso:
 *   node scripts/pin-script-integrity.mjs            # descarga del CDN + pinea
 *   node scripts/pin-script-integrity.mjs --disk     # pinea lo que hay en disco (¡post-patch!)
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGET = path.resolve(__dirname, '../packages/main/updater/script-integrity.ts')

// DOFUS_ORIGIN vive en @cuervok/shared — resuelto por import dinámico para no
// duplicar la constante (el script corre fuera del bundle de Vite).
const shared = await import('../packages/shared/dist/index.js').catch(() => null)
const DOFUS_ORIGIN = shared?.DOFUS_ORIGIN ?? 'https://dofustouch.cdn.ankama.com/'
const DISK_ONLY = process.argv.includes('--disk')

const gamePath = path.join(
  process.env.APPDATA || path.join(process.env.homedir ?? '', 'AppData', 'Roaming'),
  'cuervok-touch', 'game')

const FILES = ['build/script.js', 'build/primus.js']

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const entries = {}
for (const rel of FILES) {
  let buf
  if (DISK_ONLY) {
    buf = fs.readFileSync(path.join(gamePath, rel))
  } else {
    // Limpio del CDN: manifest oficial → filename + version → URL.
    const manifest = await (await fetch(DOFUS_ORIGIN + 'manifest.json')).json()
    const entry = manifest.files?.[rel]
    // El manifest oficial puede omitir archivos (p.ej. primus.js dejó de
    // venir — el updater lo copia de game-base). Misma semántica que el
    // runtime: un archivo ausente no se pinea, no es un error.
    if (!entry) { console.warn(`⚠ ${rel} no está en el manifest — omitido`); continue }
    const url = DOFUS_ORIGIN + rel.replace(/^build\//, 'build/') // misma forma que el updater
    const res = await fetch(`${DOFUS_ORIGIN}${entry.filename}?v=${entry.version}`)
      .catch(() => null)
    // Algunas versiones sirven por ruta directa; fallback a la ruta plana.
    const raw = res && res.ok ? Buffer.from(await res.arrayBuffer()) : null
    const direct = await fetch(DOFUS_ORIGIN + rel).then((r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null)).catch(() => null)
    buf = raw ?? direct
    if (!buf) { console.error(`✗ no pude descargar ${rel} del CDN`); process.exit(1) }
    const diskBuf = fs.existsSync(path.join(gamePath, rel)) ? fs.readFileSync(path.join(gamePath, rel)) : null
    if (diskBuf && Math.abs(diskBuf.length - buf.length) > 64) {
      console.warn(`⚠ ${rel}: CDN ${buf.length}B vs disco ${diskBuf.length}B — ¿cambio de versión? El pin queda con el del CDN.`)
    }
  }
  entries[rel] = { sha256: sha256(buf), size: buf.length }
  console.log(`✓ ${rel}  ${entries[rel].sha256}  (${entries[rel].size} B)`)
}

const rendered =
  `/**\n` +
  ` * Pines generados por scripts/pin-script-integrity.mjs — NO editar a mano.\n` +
  ` * Regenerar cuando Ankama publique un bundle nuevo (el updater avisará con\n` +
  ` * un fallo de integridad).\n` +
  ` */\n` +
  `export const GAME_SCRIPT_INTEGRITY = ${JSON.stringify(entries, null, 2)}\n`

let src = fs.readFileSync(TARGET, 'utf8')
const start = src.indexOf('export const GAME_SCRIPT_INTEGRITY')
const end = src.indexOf('\n}\n', start)
if (start < 0 || end < 0) { console.error('✗ no encontré el bloque GAME_SCRIPT_INTEGRITY en script-integrity.ts'); process.exit(1) }
src = src.slice(0, start) + rendered.trimEnd() + src.slice(end + 2)
fs.writeFileSync(TARGET, src)
console.log(`\nPinned → ${path.relative(process.cwd(), TARGET)}`)
