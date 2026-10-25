/**
 * prepare-vps-feed.mjs — deja release/latest.yml listo para el feed estático
 * de web-retro.
 *
 * web-retro (Caddy) sirve next-app/public con file_server, así que el feed
 * de actualizaciones es simplemente carpetas de archivos estáticos:
 *
 *   next-app/public/prod/updater/latest.yml           ← release/latest.yml
 *   next-app/public/prod/updater/releases/*.exe       ← release/Cuervok Setup X.Y.Z.exe
 *   next-app/public/prod/updater/releases/*.exe.blockmap ← igual + ".blockmap"
 *
 * electron-updater (provider generic) resuelve cada entrada `url:` del
 * latest.yml RELATIVA al baseUrl del feed. Sin este script el exe se pedirá
 * como /prod/updater/<exe>, al lado del yml; con este script las entradas
 * .exe / .exe.blockmap pasan a `releases/<nombre>` → el cliente descarga de
 * /prod/updater/releases/<exe>. El yml debe subirse SIN el prefijo (éste
 * vive apartado de los binarios a petición del flujo /prod/updater/{name}.yml
 * vs /prod/updater/releases/{release}.exe).
 *
 * Uso tras `npm run release`:
 *   npm run feed:prepare
 *
 * Idempotente: si una url ya empieza por releases/ no se duplica.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const ymlPath = path.join(root, 'release', 'latest.yml')

if (!fs.existsSync(ymlPath)) {
  console.error(`No existe ${ymlPath}. Ejecuta "npm run release" antes de preparar el feed.`)
  process.exit(1)
}

const original = fs.readFileSync(ymlPath, 'utf8')
let changes = 0
const rewritten = original
  .split('\n')
  .map((line) => {
    const m = line.match(/^(\s*(?:-\s*)?url:\s*)(.+)$/)
    if (!m) return line
    const url = m[2].trim().replace(/^["']|["']$/g, '')
    if (!/\.(exe|exe\.blockmap)$/i.test(url)) return line
    if (url.startsWith('releases/')) return line
    changes++
    return `${m[1]}releases/${url}`
  })
  .join('\n')

if (changes === 0) {
  console.log('latest.yml ya apunta a releases/ — nada que cambiar.')
  process.exit(0)
}

fs.writeFileSync(ymlPath, rewritten)
console.log(`latest.yml actualizado (${changes} entradas → releases/).`)
console.log('Sube a web-retro (next-app/public):')
console.log('  prod/updater/latest.yml                    (este archivo)')
console.log('  prod/updater/releases/<setup .exe>         (exe con "url" reescrito)')
console.log('  prod/updater/releases/<setup .exe.blockmap> (mapa para descarga diferencial)')
