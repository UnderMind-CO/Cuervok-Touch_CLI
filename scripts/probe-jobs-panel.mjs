#!/usr/bin/env node
/**
 * probe-jobs-panel.mjs — volcado de los templates/strings del panel de
 * Oficios en build/script.js (clases CSS, etiquetas de nivel, textos).
 * Uso: node scripts/probe-jobs-panel.mjs [ruta-a-script.js]
 */
import fs from 'node:fs'
import path from 'node:path'

const scriptPath = process.argv[2] && fs.existsSync(process.argv[2])
  ? process.argv[2]
  : path.join(process.env.APPDATA || path.join(process.env.homedir ?? '', 'AppData', 'Roaming'),
      'cuervok-touch', 'game', 'build', 'script.js')

const s = fs.readFileSync(scriptPath, 'utf8')
console.log('file:', scriptPath, `(${Buffer.byteLength(s)} B)`)

const NEEDLES = [
  'jobsList', 'jobExpBlock', 'specialisation', 'Specialisation',
  'Niv.', 'jobName', 'jobLevel', 'jobIcon', 'jobSelectSpecial',
  'hzTitle', 'jobWindow', 'jobsWindow', 'levelLabel', 'lvlLabel'
]

const esc = (needle) => needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

for (const needle of NEEDLES) {
  const re = new RegExp('.{100}' + esc(needle) + '.{240}', 'g')
  const hits = s.match(re) || []
  console.log(`\n=== ${needle} — ${hits.length} hits (mostrando primeras 3) ===`)
  for (const h of hits.slice(0, 3)) console.log('  …' + h.replace(/\s+/g, ' ') + '…')
}
