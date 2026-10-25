// Boot the packaged app and capture full-desktop screenshots every 400ms
// so we can SEE what flashes behind/around the updater overlay.
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = path.join(__dirname, 'repro-shots')
fs.rmSync(shotsDir, { recursive: true, force: true })
fs.mkdirSync(shotsDir, { recursive: true })

// Kill any running instance (we own the test env)
spawnSync('taskkill', ['/F', '/IM', 'Cuervok.exe', '/T'], { encoding: 'utf8' })

const exe = path.join(__dirname, '..', 'release', 'win-unpacked', 'Cuervok.exe')
const psShots = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$dir = '${shotsDir.replace(/\\/g, '\\\\')}'
for ($i = 0; $i -lt 20; $i++) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save("$dir\\shot-$i.png")
  $g.Dispose(); $bmp.Dispose()
  Start-Sleep -Milliseconds 400
}
`], { stdio: 'ignore', detached: false })

const child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' })
console.log('LAUNCHED pid=' + child.pid)
child.unref()

setTimeout(() => {
  psShots.kill()
  setTimeout(() => {
    spawnSync('taskkill', ['/F', '/IM', 'Cuervok.exe', '/T'], { encoding: 'utf8' })
    console.log('done', fs.readdirSync(shotsDir).length, 'shots')
  }, 1000)
}, 9000)
