// Publica el build de release/ como GitHub Release en Cuervok/Download-releases
// usando GitHub CLI (`gh`) — sin GH_TOKEN: gh usa su propia sesión
// (`gh auth login` una sola vez, vía browser).
//
// Sube los 3 assets que electron-updater necesita como release assets:
//   Cuervok Setup X.Y.Z.exe
//   Cuervok Setup X.Y.Z.exe.blockmap
//   latest.yml
// El repo en sí no guarda archivos: todo vive en la pestaña Releases.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'Cuervok/Download-releases'
const releaseDir = path.join(root, 'release')

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error(`Versión de package.json inválida: ${version}`)

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false })
}

function gh(args) {
  try {
    run('gh', args)
  } catch {
    throw new Error(`gh ${args[0]} falló — revisa la salida de arriba.`)
  }
}

// ── Preflight ──────────────────────────────────────────────────────────
try {
  run('gh', ['--version'])
} catch {
  console.error('GitHub CLI (gh) no está instalado.')
  console.error('Instálalo con:  winget install --id GitHub.cli')
  console.error('Luego autentícate una vez:  gh auth login')
  process.exit(1)
}
try {
  execFileSync('gh', ['auth', 'status'], { cwd: root, stdio: 'pipe' })
} catch {
  console.error('gh no está autenticado. Ejecuta:  gh auth login')
  console.error('(elige GitHub.com → HTTPS → Login with browser)')
  process.exit(1)
}

// ── Assets ─────────────────────────────────────────────────────────────
const exeName = `Cuervok Setup ${version}.exe`
const assets = [
  path.join(releaseDir, exeName),
  path.join(releaseDir, `${exeName}.blockmap`),
  path.join(releaseDir, 'latest.yml'),
]
for (const file of assets) {
  if (!fs.existsSync(file))
    throw new Error(`Falta ${path.relative(root, file)} — ejecuta primero el build (electron-builder).`)
}

// ── Release ────────────────────────────────────────────────────────────
const tag = `v${version}`
const notes = `Cuervok ${version}`

// ¿Ya existe el release? gh release view falla si no.
let exists = true
try {
  execFileSync('gh', ['release', 'view', tag, '--repo', REPO], { cwd: root, stdio: 'pipe' })
} catch {
  exists = false
}

if (exists) {
  console.log(`Release ${tag} ya existe — subiendo assets (clobber)...`)
  gh(['release', 'upload', tag, '--repo', REPO, '--clobber', ...assets])
} else {
  console.log(`Creando release ${tag} en ${REPO}...`)
  gh(['release', 'create', tag, '--repo', REPO,
    '--title', `Cuervok ${version}`, '--notes', notes, '--latest', ...assets])
}

console.log(`\nPublicado: https://github.com/${REPO}/releases/tag/${tag}`)
console.log('electron-updater lo detectará en el próximo chequeo de updates.')
