import fs from 'fs'
import crypto from 'crypto'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import path from 'path'
import { get, FROZEN_VERSION } from '../constants'
import { DOFUS_ORIGIN, DOFUS_ITUNES } from '@cuervok/shared'
import { logger } from '../logger'
import { GAME_SCRIPT_INTEGRITY, verifyScriptIntegrity } from './script-integrity'

export interface FrozenState {
  frozen: boolean
  buildVersion?: string
  frozenAt?: string
}

const MAX_RETRIES = 3
const RETRY_DELAY = 1000
const USER_AGENT = 'Cuervok Updater'

interface Manifest {
  files: Record<string, { filename: string; version: string }>
}

type DiffManifest = Record<string, 1 | 0 | -1>
type RegexPatch = [string, string]
type RegexPatches = Record<string, RegexPatch[]>

interface ItunesLookup {
  resultCount: number
  results: { version: string }[]
}

interface GameVersion {
  buildVersion: string
  appVersion: string
  regexHash?: string
}

export type ProgressCallback = (message: string, percent: number) => void

/** Re-export for application.ts: post-install verification of on-disk files. */
export { GAME_SCRIPT_INTEGRITY, verifyScriptIntegrity } from './script-integrity'

async function fetchRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (res.ok) return res
      if (i < retries && res.status >= 500) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY * (i + 1)))
        continue
      }
      throw new Error(`HTTP ${res.status} for ${url}`)
    } catch (err) {
      if (i >= retries) throw err
      await new Promise((r) => setTimeout(r, RETRY_DELAY * (i + 1)))
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`)
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchRetry(url)
  return res.json() as Promise<T>
}

async function fetchText(url: string): Promise<string> {
  const res = await fetchRetry(url)
  return res.text()
}

async function fetchToFile(url: string, filePath: string): Promise<void> {
  const res = await fetchRetry(url)
  if (!res.body) throw new Error(`No body for ${url}`)
  const ws = fs.createWriteStream(filePath)
  await pipeline(Readable.fromWeb(res.body as any), ws)
}

export class GameUpdater {
  private readonly _onProgress: ProgressCallback

  constructor(onProgress: ProgressCallback) {
    this._onProgress = onProgress
  }

  static checkFrozen(): FrozenState {
    const markerPath = get.FROZEN_MARKER_PATH()
    try {
      if (fs.existsSync(markerPath)) {
        const data = JSON.parse(fs.readFileSync(markerPath, 'utf-8'))
        return { frozen: true, buildVersion: data.buildVersion, frozenAt: data.frozenAt }
      }
    } catch (err) {
      logger.warn('Failed to read frozen marker', err)
    }
    return { frozen: false }
  }

  static async createFrozenMarker(buildVersion: string): Promise<void> {
    const markerPath = get.FROZEN_MARKER_PATH()
    const data = { buildVersion, appVersion: '', frozenAt: new Date().toISOString() }
    try {
      const versionsPath = get.LOCAL_VERSIONS_PATH()
      if (fs.existsSync(versionsPath)) {
        const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'))
        data.appVersion = versions.appVersion || ''
      }
    } catch {}
    fs.writeFileSync(markerPath, JSON.stringify(data, null, 2))
    logger.info(`Frozen marker created: buildVersion=${buildVersion}`)
  }

  static async removeFrozenMarker(): Promise<void> {
    const markerPath = get.FROZEN_MARKER_PATH()
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath)
      logger.info('Frozen marker removed')
    }
  }

  async run(): Promise<GameVersion> {
    const gamePath = get.GAME_PATH()
    fs.mkdirSync(gamePath, { recursive: true })
    fs.mkdirSync(path.join(gamePath, 'build'), { recursive: true })

    // Check frozen marker — skip full download if frozen version matches
    const frozen = GameUpdater.checkFrozen()
    if (frozen.frozen && frozen.buildVersion === FROZEN_VERSION) {
      this._onProgress('Game data is frozen at version ' + frozen.buildVersion, 100)
      logger.info(`Skipping download: frozen at ${frozen.buildVersion}`)
      // Load existing versions from disk
      const versions: GameVersion = fs.existsSync(get.LOCAL_VERSIONS_PATH())
        ? JSON.parse(fs.readFileSync(get.LOCAL_VERSIONS_PATH(), 'utf-8'))
        : { buildVersion: FROZEN_VERSION, appVersion: '' }
      return versions
    }

    this._onProgress('Copying base files...', 5)
    this._copyBaseFiles()

    this._onProgress('Downloading manifests...', 10)
    const [localAsset, remoteAsset, assetDiff] = await this._retrieveManifests(
      get.LOCAL_ASSET_MAP_PATH(),
      DOFUS_ORIGIN + 'assetMap.json'
    )
    const [localDofus, remoteDofus, dofusDiff] = await this._retrieveManifests(
      get.LOCAL_DOFUS_MANIFEST_PATH(),
      DOFUS_ORIGIN + 'manifest.json'
    )

    // If our regex patches changed, force re-download of patched files so they get re-patched
    const regexPath = path.join(gamePath, 'regex.json')
    const regexHash = fs.existsSync(regexPath)
      ? crypto.createHash('sha1').update(fs.readFileSync(regexPath)).digest('hex')
      : ''
    const storedVersions: GameVersion = fs.existsSync(get.LOCAL_VERSIONS_PATH())
      ? JSON.parse(fs.readFileSync(get.LOCAL_VERSIONS_PATH(), 'utf-8'))
      : { buildVersion: '', appVersion: '' }
    if (storedVersions.regexHash && storedVersions.regexHash !== regexHash) {
      logger.info('Regex patches changed, forcing re-download of game files')
      for (const key in dofusDiff) if (dofusDiff[key] === 0) dofusDiff[key] = 1
    }

    this._onProgress('Downloading assets...', 15)
    await this._downloadAssetFiles(assetDiff, remoteAsset)

    this._onProgress('Downloading game files...', 50)
    const dofusFiles = await this._downloadGameFiles(dofusDiff, remoteDofus)

    this._onProgress('Finding versions...', 65)
    const versions = await this._findVersions(dofusFiles)
    versions.regexHash = regexHash

    // ── Integrity gate (anti client-tampering) ──
    // Verify the downloaded bundle's known entrypoints against the pinned
    // SHA-256 allowlist BEFORE applying our own patches. Anything injected
    // upstream (CDN swap, MITM, tampered manifest) or carried in by a
    // modified file fails here and the update is aborted.
    if (!verifyScriptIntegrity(dofusFiles)) {
      throw new Error(
        'Integrity check FAILED for downloaded game files — update aborted. ' +
        'The bundle does not match the pinned SHA-256 allowlist.')
    }

    this._onProgress('Applying patches...', 75)
    this._applyRegex(dofusFiles)

    this._onProgress('Writing files...', 85)
    this._writeFiles(dofusFiles)

    this._onProgress('Cleaning up...', 90)
    this._removeOld(assetDiff, localAsset)
    this._removeOld(dofusDiff, localDofus)

    this._onProgress('Saving manifests...', 95)
    await Promise.all([
      fs.promises.writeFile(get.LOCAL_ASSET_MAP_PATH(), JSON.stringify(remoteAsset)),
      fs.promises.writeFile(get.LOCAL_DOFUS_MANIFEST_PATH(), JSON.stringify(remoteDofus)),
      fs.promises.writeFile(get.LOCAL_VERSIONS_PATH(), JSON.stringify(versions))
    ])

    // After successful download, create frozen marker
    await GameUpdater.createFrozenMarker(versions.buildVersion)

    this._onProgress('Done', 100)
    return versions
  }

  private _copyBaseFiles() {
    const baseDir = path.join(__dirname, '../game-base')
    const gamePath = get.GAME_PATH()
    const files = ['index.html', 'fixes.js', 'fixes.css', 'regex.json', 'keymaster2.js']

    for (const file of files) {
      const src = path.join(baseDir, file)
      const dest = path.join(gamePath, file)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
        logger.info(`Copied ${file} to game dir`)
      } else {
        logger.warn(`Base file not found: ${src}`)
      }
    }

    // primus.js → build/primus.js: the game loads it at runtime via
    // r() + "/build/primus.js" and the emulator no longer serves that URL
    // (its root WebApi 404s it). The client serves its bundled engine.io
    // copy from GAME_PATH/build/primus.js and the request interceptor
    // redirects the emulator URL there.
    const primusSrc = path.join(baseDir, 'primus.js')
    const primusDest = path.join(gamePath, 'build', 'primus.js')
    if (fs.existsSync(primusSrc)) {
      fs.mkdirSync(path.dirname(primusDest), { recursive: true })
      fs.copyFileSync(primusSrc, primusDest)
      logger.info('Copied primus.js to game build dir')
    } else {
      logger.warn(`Base file not found: ${primusSrc}`)
    }
  }

  private async _retrieveManifests(localPath: string, remoteUrl: string): Promise<[Manifest, Manifest, DiffManifest]> {
    const local: Manifest = fs.existsSync(localPath) ? JSON.parse(fs.readFileSync(localPath, 'utf-8')) : { files: {} }
    const remote = await fetchJson<Manifest>(remoteUrl)
    const diff: DiffManifest = {}

    if (remote?.files) {
      for (const key in remote.files) {
        if (!local?.files?.[key] || local.files[key].version !== remote.files[key].version) {
          diff[key] = 1
        } else {
          diff[key] = 0
        }
      }
    }
    if (local?.files) {
      for (const key in local.files) {
        if (!remote?.files?.[key]) diff[key] = -1
      }
    }

    return [local, remote, diff]
  }

  private async _downloadAssetFiles(diff: DiffManifest, manifest: Manifest) {
    const keys = Object.keys(diff).filter((k) => diff[k] === 1)
    let done = 0
    for (const key of keys) {
      const url = DOFUS_ORIGIN + manifest.files[key].filename
      const filePath = get.GAME_PATH() + manifest.files[key].filename
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      await fetchToFile(url, filePath)
      done++
      this._onProgress(`Downloading assets (${done}/${keys.length})`, 15 + (done / keys.length) * 35)
    }
  }

  private async _downloadGameFiles(diff: DiffManifest, manifest: Manifest): Promise<Record<string, string>> {
    const files: Record<string, string> = {}
    const keys = Object.keys(diff).filter((k) => diff[k] === 1)
    let done = 0

    for (const key of keys) {
      const url = DOFUS_ORIGIN + manifest.files[key].filename
      logger.info(`Downloading ${key} from ${url}`)
      files[key] = await fetchText(url)
      done++
      this._onProgress(`Downloading game files (${done}/${keys.length})`, 50 + (done / keys.length) * 15)
    }

    return files
  }

  private async _findVersions(dofusFiles: Record<string, string>): Promise<GameVersion> {
    const existing: GameVersion = fs.existsSync(get.LOCAL_VERSIONS_PATH())
      ? JSON.parse(fs.readFileSync(get.LOCAL_VERSIONS_PATH(), 'utf-8'))
      : { buildVersion: '', appVersion: '' }

    const localScriptPath = path.join(get.GAME_PATH(), 'build', 'script.js')
    const script =
      dofusFiles['build/script.js'] ??
      (fs.existsSync(localScriptPath) ? fs.readFileSync(localScriptPath, 'utf-8') : undefined)

    if (script) {
      const match = script.match(/window\.buildVersion\s?=\s?"(\d+\.\d+\.\d+(?:-\d+)?)"/)
      if (match) existing.buildVersion = match[1]

      if (dofusFiles['build/script.js'] || !existing.appVersion) {
        try {
          const iTunes = await fetchJson<ItunesLookup>(DOFUS_ITUNES + '&t=' + Date.now())
          existing.appVersion = iTunes.results[0]?.version ?? existing.appVersion
        } catch (err) {
          logger.warn('Could not fetch iTunes version', err)
        }
      }
    }

    logger.info(`Versions: build=${existing.buildVersion} app=${existing.appVersion}`)
    return existing
  }

  private _applyRegex(dofusFiles: Record<string, string>) {
    const regexPath = path.join(get.GAME_PATH(), 'regex.json')
    if (!fs.existsSync(regexPath)) {
      logger.warn('No regex.json found, skipping patches')
      return
    }

    const regex: RegexPatches = JSON.parse(fs.readFileSync(regexPath, 'utf-8'))

    for (const filename in regex) {
      if (dofusFiles[filename]) {
        let patched = 0
        for (const [pattern, replacement] of regex[filename]) {
          const before = dofusFiles[filename]
          dofusFiles[filename] = dofusFiles[filename].replace(new RegExp(pattern, 'g'), replacement)
          if (dofusFiles[filename] !== before) patched++
        }
        logger.info(`Applied ${patched}/${regex[filename].length} regex patches to ${filename}`)
      }
    }
  }

  private _writeFiles(files: Record<string, string>) {
    for (const filename in files) {
      const filePath = get.GAME_PATH() + filename
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, files[filename])
      logger.info(`Wrote ${filename} (${(files[filename].length / 1024).toFixed(0)}KB)`)
    }
  }

  private _removeOld(diff: DiffManifest, manifest: Manifest) {
    for (const key in diff) {
      if (diff[key] !== -1) continue

      const file = manifest.files?.[key]
      if (!file) continue

      const filePath = get.GAME_PATH() + file.filename
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        const dir = path.dirname(filePath)
        try {
          if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
        } catch {}
      }
    }
  }
}
