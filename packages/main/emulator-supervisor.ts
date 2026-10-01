// EmulatorSupervisor — keeps the emulator backend processes alive from the
// client's main process. Root fix for the recurring "commands stop working /
// nothing loads" failures: the two backend servers (TouchEmu.Server.Auth on
// :3000 and TouchEmu.Server.Game on :666) had no supervisor — whenever they
// died (or the dev machine rebooted), the running game client silently lost
// its backend and every data fetch failed, which is also what poisons the
// game's IndexedDB data cache with {MISSING_ID:true} dummy records.
//
// Behaviour:
//   • If a service port is already listening (user started servers manually),
//     that service is left alone.
//   • Otherwise the exe is spawned detached-ish (normal child) with its own
//     log file under userData/emulator-logs/.
//   • If a supervised child exits it is restarted after 3s, up to 5
//     consecutive failures (counter resets after 5 min of stability).
//   • Children are killed on app 'will-quit'.
//
// In packaged builds the server sources are not expected to exist next to the
// app; resolution fails and the supervisor stays inert (no crash, no spam).
import { app } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import { logger } from './logger'

const RESTART_DELAY_MS = 3_000
const MAX_CONSECUTIVE_FAILURES = 5
const STABILITY_RESET_MS = 5 * 60_000

interface ServiceDef {
  name: 'auth' | 'game'
  port: number
  exeRel: string
}

// Port 666 is the game protocol listener of TouchEmu.Server.Game (verified:
// it binds [::1]:666). Auth serves HTTP on :3000 (config.json, /api/data/*).
const SERVICES: ServiceDef[] = [
  { name: 'auth', port: 3000, exeRel: 'TouchEmu.Server.Auth/bin/Debug/net8.0/TouchEmu.Server.Auth.exe' },
  { name: 'game', port: 666, exeRel: 'TouchEmu.Server.Game/bin/Debug/net8.0/TouchEmu.Server.Game.exe' }
]

function isPortListening(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host: 'localhost', port })
    const done = (v: boolean) => {
      sock.destroy()
      resolve(v)
    }
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
  })
}

function resolveEmuRoot(): string | null {
  const candidates = [
    process.env['CUERVOK_EMU_ROOT'],
    path.join(app.getAppPath(), '..', 'TouchEmu-Cuervok')
  ].filter((c): c is string => Boolean(c))
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, SERVICES[0].exeRel))) return c
  }
  return null
}

/** Wait until `port` accepts connections (bounded). Resolves regardless after `timeoutMs`. */
export function waitForPort(port: number, timeoutMs: number, intervalMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const attempt = async (): Promise<void> => {
      if (await isPortListening(port, 1000)) return resolve(true)
      if (Date.now() - t0 >= timeoutMs) return resolve(false)
      setTimeout(attempt, intervalMs)
    }
    void attempt()
  })
}

class EmulatorSupervisor {
  private readonly _children = new Map<string, ChildProcess>()
  private readonly _failures = new Map<string, number>()
  private readonly _logDir = path.join(app.getPath('userData'), 'emulator-logs')
  private _stopping = false

  async start(): Promise<void> {
    if (this._children.size > 0) return
    app.once('will-quit', () => this.stop())
    const root = resolveEmuRoot()
    if (!root) {
      logger.info('[emu-supervisor] emulator root not found — supervision disabled')
      return
    }
    try {
      fs.mkdirSync(this._logDir, { recursive: true })
    } catch { /* userData always exists */ }
    for (const svc of SERVICES) {
      if (await isPortListening(svc.port)) {
        logger.info(`[emu-supervisor] ${svc.name} already listening on :${svc.port} — not touching it`)
        continue
      }
      this._spawn(svc, root)
    }
  }

  stop(): void {
    this._stopping = true
    for (const [name, child] of this._children) {
      try {
        child.kill()
      } catch (err) {
        logger.warn(`[emu-supervisor] failed to stop ${name}`, err as Error)
      }
    }
    this._children.clear()
  }

  private _spawn(svc: ServiceDef, root: string): void {
    const exe = path.join(root, svc.exeRel)
    if (!fs.existsSync(exe)) {
      logger.warn(`[emu-supervisor] ${svc.name} exe missing: ${exe}`)
      return
    }
    const logPath = path.join(this._logDir, `${svc.name}.log`)
    try {
      // Truncate runaway logs (simple rotation).
      if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) {
        fs.writeFileSync(logPath, '')
      }
    } catch { /* non-fatal */ }
    const out = fs.openSync(logPath, 'a')
    const child = spawn(exe, [], {
      cwd: root,
      stdio: ['ignore', out, out],
      windowsHide: true
    })
    this._children.set(svc.name, child)
    logger.info(`[emu-supervisor] spawned ${svc.name} (pid ${child.pid}) → ${logPath}`)
    child.once('exit', (code) => {
      this._children.delete(svc.name)
      fs.closeSync(out)
      if (this._stopping) return
      const fails = (this._failures.get(svc.name) ?? 0) + 1
      this._failures.set(svc.name, fails)
      logger.warn(`[emu-supervisor] ${svc.name} exited (code ${code}) — failures=${fails}`)
      if (fails <= MAX_CONSECUTIVE_FAILURES) {
        setTimeout(() => {
          if (!this._stopping) this._spawn(svc, root)
        }, RESTART_DELAY_MS).unref?.()
      } else {
        logger.error(`[emu-supervisor] ${svc.name} keeps crashing — giving up (${fails} consecutive)`)
      }
    })
    // Stability resets the failure counter.
    setTimeout(() => {
      if (this._children.get(svc.name) === child) this._failures.set(svc.name, 0)
    }, STABILITY_RESET_MS).unref?.()
  }
}

export const emulatorSupervisor = new EmulatorSupervisor()
