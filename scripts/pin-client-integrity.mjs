#!/usr/bin/env node
/**
 * pin-client-integrity.mjs — genera el pin de integridad de app.asar
 * (client-integrity.json) para publicar junto al release en el feed:
 *
 *   <feed>/client-integrity.json
 *
 * Modo de uso (en la máquina donde se publica el release):
 *   node scripts/pin-client-integrity.mjs <ruta-a-app.asar> [version]
 *
 * - <ruta-a-app.asar>: el app.asar resultante del build/electron-builder
 *   (dist/win-unpacked/resources/app.asar).
 * - [version]: por defecto toma package.json > version.
 *
 * La salida es un JSON acumulativo por versión:
 *   { "versions": { "1.4.2": { "sha256": "...", "sha512": "...", "size": 12345 } } }
 *
 * Si ya existe un client-integrity.json en el directorio del feed, párselo
 * con --prev <archivo> para conservar los pins de versiones anteriores
 * (rotar keys y dar soporte downgrade-investigations sin perder historia).
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function usage() {
  console.log('Uso: node scripts/pin-client-integrity.mjs <app.asar> [--prev client-integrity.json] [--version x.y.z]')
  process.exit(1)
}

const args = process.argv.slice(2)
if (args.length === 0) usage()
const asarPath = args[0]
if (!fs.existsSync(asarPath)) {
  console.error(`No existe ${asarPath}`)
  process.exit(1)
}

let version = null
let prevPath = null
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--version') version = args[++i]
  else if (args[i] === '--prev') prevPath = args[++i]
  else usage()
}
if (!version) {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
  version = pkg.version
}

const buf = fs.readFileSync(asarPath)
const pin = {
  sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  sha512: crypto.createHash('sha512').update(buf).digest('hex'),
  size: buf.length
}

let manifest = { versions: {} }
if (prevPath && fs.existsSync(prevPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(prevPath, 'utf-8'))
    if (!manifest.versions) manifest.versions = {}
  } catch (e) {
    console.error(`No se pudo leer --prev (${e.message}); se genera un manifest nuevo.`)
  }
}
manifest.versions[version] = pin

const out = JSON.stringify(manifest, null, 2)
const outPath = prevPath || path.join(process.cwd(), 'client-integrity.json')
fs.writeFileSync(outPath, out + '\n')
console.log(`Pin de integridad para ${version}:`)
console.log(`  sha256: ${pin.sha256}`)
console.log(`  sha512: ${pin.sha512}`)
console.log(`  size:   ${pin.size} bytes`)
console.log(`Escrito en ${outPath} — publícalo junto a latest.yml del feed.`)
