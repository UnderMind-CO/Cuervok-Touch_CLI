// Deployment .env loader (dependency-free).
//
// The client talks to two configurable hosts: the web platform
// (CUV_SERVER_URL — Linux VPS on deploy) and the emulator's Auth server
// (DOFEMU_BASE — Windows VPS on deploy).  In dev nothing needs to be set
// (localhost defaults apply); on a deploy, put the real domains in a .env
// file next to the app (or in real environment variables — those always
// win) and this module picks them up before anything else reads them.
//
// Loaded keys (see .env.example):
//   CUV_SERVER_URL   — base URL of the web platform / web-retro.
//   DOFEMU_BASE      — base URL of the emulator's Auth server.
//   CUERVOK_EMU_ROOT — path to the TouchEmu-Cuervok checkout for the
//                      emulator supervisor (dev machine only).
import fs from 'fs'
import path from 'path'

function parseFile(file: string): void {
  let content: string
  try {
    content = fs.readFileSync(file, 'utf-8')
  } catch {
    return
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    if (!key) continue
    // Real environment variables always win over the file.
    if (!process.env[key]) process.env[key] = value
  }
}

try {
  parseFile(path.join(process.cwd(), '.env'))
  parseFile(path.join(__dirname, '..', '.env'))
  parseFile(path.join(__dirname, '..', '..', '.env'))
} catch {
  /* a missing/unreadable .env is fine — defaults apply */
}
