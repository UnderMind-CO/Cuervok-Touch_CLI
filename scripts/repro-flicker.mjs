// Lanza el exe empacado capturando stdout/stderr del main a un log,
// y a la vez observa las ventanas visibles de todos los procesos Cuervok.
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const exe = path.join(__dirname, '..', 'release', 'win-unpacked', 'Cuervok.exe')
const out = fs.openSync(path.join(__dirname, 'repro-main.log'), 'a')
const child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: ['ignore', out, out] })
console.log('LAUNCHED pid=' + child.pid)
child.unref()

const watcher = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
  path.join(__dirname, 'watch-windows.ps1'), '-Seconds', '45'], { encoding: 'utf8', timeout: 60_000 })
console.log('--- WATCH ---')
console.log(watcher.stdout)
console.log('--- MAIN LOG ---')
console.log(fs.readFileSync(path.join(__dirname, 'repro-main.log'), 'utf8'))
