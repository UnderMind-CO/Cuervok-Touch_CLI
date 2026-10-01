import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')

function incrementPatch(version) {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(version)
  if (!match) throw new Error(`Unsupported app version: ${version}`)
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const nextVersion = incrementPatch(packageJson.version)
packageJson.version = nextVersion
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)

if (fs.existsSync(lockPath)) {
  const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  lockJson.version = nextVersion
  if (lockJson.packages?.['']) lockJson.packages[''].version = nextVersion
  fs.writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`)
}

console.log(`Cuervok version bumped to ${nextVersion}`)
