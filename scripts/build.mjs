import { build } from 'vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import JavaScriptObfuscator from 'javascript-obfuscator'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function copyDir(srcRel, destRel) {
  const src = path.join(root, srcRel)
  const dest = path.join(root, destRel)
  fs.mkdirSync(dest, { recursive: true })
  for (const file of fs.readdirSync(src)) {
    const srcFile = path.join(src, file)
    if (fs.statSync(srcFile).isFile()) {
      fs.copyFileSync(srcFile, path.join(dest, file))
    }
  }
}

function copyGameBase() {
  copyDir('packages/main/game-base', 'dist/game-base')
  console.log('Copied game-base files to dist/')
  copyDir('packages/main/scripts', 'dist/scripts')
  console.log('Copied helper scripts to dist/')
  const fixesPath = path.join(root, 'dist/game-base/fixes.js')
  const fixesSource = fs.readFileSync(fixesPath, 'utf8')
  const obfuscated = JavaScriptObfuscator.obfuscate(fixesSource, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    disableConsoleOutput: false,
    selfDefending: false,
    stringArray: true,
    stringArrayRotate: true,
    stringArrayThreshold: 0.75
  })
  fs.writeFileSync(fixesPath, obfuscated.getObfuscatedCode())
  console.log('Obfuscated game fixes for distribution')
  // Copy admin panel HTML to dist/main/
  const adminSrc = path.join(root, 'packages/main/admin-panel.html')
  const adminDest = path.join(root, 'dist/main/admin-panel.html')
  if (fs.existsSync(adminSrc)) {
    fs.copyFileSync(adminSrc, adminDest)
    console.log('Copied admin-panel.html to dist/main/')
  }
}

function obfuscateFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const obfuscated = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    disableConsoleOutput: false,
    selfDefending: false,
    stringArray: true,
    stringArrayRotate: true,
    stringArrayThreshold: 0.75
  })
  fs.writeFileSync(filePath, obfuscated.getObfuscatedCode())
  console.log(`Obfuscated ${path.relative(root, filePath)}`)
}

function obfuscateDistribution() {
  // Matches the fixes.js pass below — cheap, reversible-by-none wall around
  // the main + preload bundle (kernel gate, attestation stamp, updater)
  // before the installer ships. Renderer is obfuscated upstream by
  // vite-plugin-javascript-obfuscator in its own vite.config.ts.
  for (const dir of ['dist/main', 'dist/preload']) {
    const distDir = path.join(root, dir)
    if (!fs.existsSync(distDir)) {
      throw new Error(`Missing ${dir}/ — build must create it before obfuscation`)
    }
    for (const file of fs.readdirSync(distDir)) {
      if (file.endsWith('.cjs') || file.endsWith('.js')) {
        obfuscateFile(path.join(distDir, file))
      }
    }
  }
  console.log('Obfuscated main + preload distribution')
}

async function run() {
  console.log('Building main...')
  await build({ configFile: path.join(root, 'packages/main/vite.config.ts') })

  console.log('Building preload...')
  await build({ configFile: path.join(root, 'packages/preload/vite.config.ts') })

  copyGameBase()
  // Must run after preload/main build, before electron-builder packaging —
  // obfuscated .cjs obliterates source maps, and original code would leak
  // into the installer otherwise.
  obfuscateDistribution()

  console.log('Building renderer...')
  await build({ configFile: path.join(root, 'packages/renderer/vite.config.ts') })

  console.log('Build complete.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
