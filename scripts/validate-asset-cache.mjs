/**
 * validate-asset-cache.mjs — auditoría de integridad del cache de assets del
 * cliente Cuervok (solo lectura, no escribe ni borra nada).
 *
 * Qué chequea por archivo:
 *   .json → parsea como JSON válido (un XML "AccessDenied" guardado por error
 *             no parsea: es el origen de los `Unexpected non-whitespace…` del
 *             runtime y de los buffers vacíos del renderer)
 *   .png  → firma PNG (89504E47 0D0A1A0A)
 *   .jpg  → firma JPEG (FFD8 FF)
 *   .svg  → contiene "<svg"
 *   todos → tamaño 0 = corrupto; cuerpo web de error (<?xml/<Error/<html) = corrupto
 *
 * Uso: node scripts/validate-asset-cache.mjs
 * Rutas extra opcionales por CLI: node scripts/validate-asset-cache.mjs C:/ruta/extra [C:/otra]
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const userData = path.join(os.homedir(), 'AppData', 'Roaming', 'cuervok-touch')
const cliRoots = process.argv.slice(2).map((p) => [p, path.resolve(p)])
const roots = [...cliRoots,
  ['asset-overrides (userData)', path.join(userData, 'asset-overrides')],
  ['asset-overrides (repo)', path.join(process.cwd(), 'asset-overrides')],
  ['assets-local (mirrors s/versión)', path.join(userData, 'assets-local')]
]

const cacheRoot = path.join(userData, 'assets-cache')
if (fs.existsSync(cacheRoot)) {
  for (const kind of fs.readdirSync(cacheRoot)) {
    const kindDir = path.join(cacheRoot, kind)
    if (!fs.statSync(kindDir).isDirectory()) continue
    for (const versionDir of fs.readdirSync(kindDir)) {
      roots.push([`cache ${kind}/${versionDir}`, path.join(kindDir, versionDir)])
    }
  }
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const badByRoot = new Map()
let grandTotal = 0

function problemOf(full) {
  const st = fs.statSync(full)
  if (st.size === 0) return 'EMPTY (0 bytes)'
  const ext = path.extname(full).toLowerCase()
  const buf = fs.readFileSync(full)
  if (ext === '.json') {
    try { JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')) } catch (e) {
      return `JSON inválido: ${(e.message || '').slice(0, 70)}`
    }
  } else if (ext === '.png') {
    if (!buf.subarray(0, 8).equals(PNG_SIG)) return `PNG sin firma real (magic=${buf.subarray(0, 4).toString('hex')})`
  } else if (ext === '.jpg' || ext === '.jpeg') {
    const h = buf.subarray(0, 3)
    if (!(h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff)) return `JPG sin firma real (${h.toString('hex')})`
  } else if (ext === '.svg') {
    if (!buf.subarray(0, 512).toString('utf8').includes('<svg')) return 'SVG sin <svg>'
  }
  const headTxt = buf.subarray(0, 24).toString('utf8').trim()
  if (/^<\?xml|^<Error|^<!DOCTYPE|^<html/i.test(headTxt)) {
    return `body de error web (${headTxt.slice(0, 20)}…)`
  }
  return null
}

for (const [label, root] of roots) {
  if (!fs.existsSync(root)) {
    console.log(`${label}: — (no existe)`)
    continue
  }
  const bad = []
  let total = 0
  walkDir(root)
  badByRoot.set(label, bad)
  grandTotal += total
  console.log(`${label}: ${total} archivos — ${bad.length === 0 ? 'OK' : `${bad.length} CORRUPTOS`}`)

  function walkDir(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      let st
      try { st = fs.statSync(full) } catch { /* deleted mid-scan */ }
      if (!st) continue
      if (st.isDirectory()) walkDir(full)
      else {
        total++
        const p = problemOf(full)
        if (p) bad.push({ rel: path.relative(root, full), problem: p, size: st.size })
      }
    }
  }
}

console.log('\n== CORRUPTOS (detalle) ==')
let shown = 0
for (const [label, bad] of badByRoot) {
  for (const r of bad) {
    if (shown++ < 60) console.log(`[${label}] ${r.rel} → ${r.problem} (${r.size} B)`)
  }
  if (bad.length > 0) console.log(`[${label}] … total ${bad.length}`)
}
if (shown === 0) console.log('Ninguno')

console.log(`\nTotal escaneado: ${grandTotal} archivos en ${roots.length} raíces`)
