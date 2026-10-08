#!/usr/bin/env node
/**
 * pin-script-integrity.mjs — regenera el pin SHA-256 del bundle del juego.
 *
 * Lee los archivos ORIGINALES (pre-regex) del juego instalado y reescribe
 * GAME_SCRIPT_INTEGRITY en packages/main/updater/script-integrity.ts.
 * Los pines de archivos que el manifest ya no sirve (p.ej. build/primus.js,
 * que el cliente copia de game-base) SE PRESERVAN entre regeneraciones.
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

// DOFUS_ORIGIN vive en @cuervok/shared — se lee del SOURCE (constants/index.ts)
// porque este script corre fuera del bundle de Vite y shared no genera dist.
const SHARED_SRC = path.resolve(__dirname, '../packages/shared/constants/index.ts')
const DOFUS_ORIGIN =
  fs.readFileSync(SHARED_SRC, 'utf8').match(/DOFUS_ORIGIN\s*=\s*'([^']+)'/)?.[1]
  ?? 'https://dofustouch.cdn.ankama.com/'
const DISK_ONLY = process.argv.includes('--disk')

const gamePath = path.join(
  process.env.APPDATA || path.join(process.env.homedir ?? '', 'AppData', 'Roaming'),
  'cuervok-touch', 'game')

const FILES = ['build/script.js', 'build/primus.js']

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

// Pines existentes en TARGET: el manifest oficial puede omitir archivos que el
// cliente sigue copiando y verificando (p.ej. build/primus.js sale de
// game-base). Esas entradas se PRESERVAN salvo que el manifest las traiga.
function parseExistingPin(tsSource) {
  const block = tsSource.match(/export const GAME_SCRIPT_INTEGRITY[^=]*= \{([\s\S]*?)\n\}\n/)
  if (!block) return {}
  const existing = {}
  const entryRe = /['"]([^'"]+)['"]:\s*\{\s*['"]?sha256['"]?:\s*['"]([0-9a-f]{64})['"],\s*['"]?size['"]?:\s*(\d+),?\s*\}/g
  for (const m of block[1].matchAll(entryRe)) {
    existing[m[1]] = { sha256: m[2], size: Number(m[3]) }
  }
  return existing
}

const entries = parseExistingPin(fs.readFileSync(TARGET, 'utf8'))
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
    if (!entry) {
      console.warn(entries[rel]
        ? `⚠ ${rel} no está en el manifest — se conserva el pin existente (${entries[rel].size} B)`
        : `⚠ ${rel} no está en el manifest y no había pin previo — omitido`)
      continue
    }
    const url = DOFUS_ORIGIN + rel.replace(/^build\//, 'build/') // misma forma que el updater
    const res = await fetch(`${DOFUS_ORIGIN}${entry.filename}?v=${entry.version}`)
      .catch(() => null)
    // Algunas versiones sirven por ruta directa; fallback a la ruta plana.
    const raw = res && res.ok ? Buffer.from(await res.arrayBuffer()) : null
    const direct = await fetch(DOFUS_ORIGIN + rel)
      .then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null))
      .catch(() => null)
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

let src = fs.readFileSync(TARGET, 'utf8')
const start = src.indexOf('export const GAME_SCRIPT_INTEGRITY')
const declEnd = start < 0 ? -1 : src.indexOf('= {', start)
const end = src.indexOf('\n}\n', start)
if (start < 0 || declEnd < 0 || end < 0) { console.error('✗ no encontré el bloque GAME_SCRIPT_INTEGRITY en script-integrity.ts'); process.exit(1) }
// Se conserva la cabecera de la declaración —incluida la anotación de tipo
// `: Record<string, ScriptIntegrityEntry>`— y solo se sustituye el cuerpo.
const declHeader = src.slice(start, declEnd + 3) // hasta e incluido '= {'
const rendered = declHeader + '\n' + JSON.stringify(entries, null, 2).slice(2) + '\n'
src = src.slice(0, start) + rendered.trimEnd() + src.slice(end + 2)
fs.writeFileSync(TARGET, src)
console.log(`\nPinned → ${path.relative(process.cwd(), TARGET)}`)
