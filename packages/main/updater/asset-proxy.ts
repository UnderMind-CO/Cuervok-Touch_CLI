import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { logger } from '../logger'
import { RETIRED_MAP_IDS } from './map-registry'

const CDN_BASE = 'https://dofustouch.cdn.ankama.com/assets'
const OFFICIAL_CONFIG_URL = 'https://dt-proxy-production-login.ankama-games.com/config.json?lang=es'
const USER_AGENT = 'Cuervok Asset Proxy'

// ── Editor "Quitar del mapa" (tab Interactivos) ─────────────────────
// The game server hides a removed interactive from the interactive payload
// (not clickable), but the map JSON served to the client still DRAWS its
// sprite. This watcher hot-reloads data/custom/Interactives.json (mtime, same
// as the game server) so patchMapResponse can strip the removed entries from
// the midground layer: the visual disappears from the map the moment the
// editor saves, without restarting anything. Entries may be element ids (the
// midground `id` field) or gfx ids (the `g` field — shared visuals).
const REMOVED_INTERACTIVES_FILE = (() => {
  // Candidates: explicit env override → sibling of the app checkout (dev:
  // cwd/appPath = DofuEmu-Client, game data lives in ../TouchEmu-Cuervok/data).
  const candidates = [
    process.env.CUERVOK_GAME_DATA
      ? path.join(process.env.CUERVOK_GAME_DATA, 'custom', 'Interactives.json')
      : null,
    path.resolve(app.getAppPath(), '..', 'TouchEmu-Cuervok', 'data', 'custom', 'Interactives.json'),
    path.resolve(process.cwd(), '..', 'TouchEmu-Cuervok', 'data', 'custom', 'Interactives.json'),
  ].filter((p): p is string => !!p)
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c } catch { /* keep looking */ }
  }
  return candidates[1]
})()
let _removedMtime = -1
let _removedByMap = new Map<string, Set<number>>()

function loadRemovedInteractives(): Map<string, Set<number>> {
  try {
    const mtime = fs.existsSync(REMOVED_INTERACTIVES_FILE)
      ? fs.statSync(REMOVED_INTERACTIVES_FILE).mtimeMs : 0
    if (mtime === _removedMtime) return _removedByMap
    _removedMtime = mtime
    const next = new Map<string, Set<number>>()
    if (mtime > 0) {
      const raw = JSON.parse(fs.readFileSync(REMOVED_INTERACTIVES_FILE, 'utf-8'))
      for (const [mapId, cfg] of Object.entries<any>(raw || {})) {
        const del = Array.isArray(cfg?.deleted) ? cfg.deleted : []
        if (!del.length) continue
        const set = new Set<number>()
        for (const d of del) {
          const n = Number(d)
          if (Number.isFinite(n) && n > 0) set.add(n)
        }
        if (set.size) next.set(String(mapId), set)
      }
    }
    _removedByMap = next
  } catch (err) {
    logger.warn(`Could not load Interactives.json for midground stripping: ${err}`)
  }
  return _removedByMap
}

/** Strips removed interactives (editor "Quitar del mapa") from a map JSON's
 * midground layer so the client stops DRAWING them. Matches:
 *   • the midground `id` field (real ids from the CDN dump);
 *   • the `g` field (gfx of a shared visual — hides every clone);
 *   • the game server's GENERATED id for id-less entries:
 *     (mapId % 100000) * 100000 + cell * 100 + gfxIndex, gfxIndex counting
 *     the gfx-bearing entries of the cell array (same formula the server and
 *     the editor's tab use, so editor ids always land here). */
function stripRemovedMidground(mapId: string, map: any): boolean {
  const removed = loadRemovedInteractives().get(mapId)
  if (!removed || removed.size === 0) return false
  const mg = map?.midgroundLayer
  if (!mg || typeof mg !== 'object') return false
  const mapNum = Number(mapId)
  const genBase = Number.isFinite(mapNum) ? (mapNum % 100000) * 100000 : NaN
  let changed = false
  for (const [cellKey, entries] of Object.entries<any>(mg)) {
    if (!Array.isArray(entries)) continue
    const cell = Number(cellKey)
    let gfxIndex = 0
    const kept = entries.filter((e: any) => {
      let hit = false
      const eid = Number(e?.id)
      if (Number.isFinite(eid) && eid > 0) {
        hit = removed.has(eid)
      } else {
        // Id-less entry: match the server-generated id of this slot.
        const gid = Number(e?.g)
        if (Number.isFinite(gid) && removed.has(gid)) hit = true
        if (!hit && Number.isFinite(genBase) && Number.isFinite(cell)
          && Number.isFinite(gid) && gid > 0) {
          const gen = genBase + cell * 100 + gfxIndex
          if (removed.has(gen)) hit = true
        }
      }
      if (Number.isFinite(Number(e?.g)) && Number(e?.g) > 0) gfxIndex++
      if (hit) changed = true
      return !hit
    })
    if (kept.length !== entries.length) {
      if (kept.length === 0) delete mg[cellKey]
      else mg[cellKey] = kept
    }
  }
  return changed
}

// When the CDN is unreachable (blocked / changed / offline) a fetch should not
// hang the game: abort after this long and fall back to the local data.
const CDN_FETCH_TIMEOUT_MS = 8000

// Simple circuit breaker: after a burst of server-side failures the CDN is
// considered degraded and the proxy skips the network for a cooldown — so a
// blocked/hanging CDN can't turn every asset request into a full 8s timeout at
// game startup.
const CDN_BREAKER_THRESHOLD = 3
const CDN_BREAKER_COOLDOWN_MS = 60_000
let _cdnFailStreak = 0
let _cdnDegradedUntil = 0

function isCdnDegraded(): boolean {
  return Date.now() < _cdnDegradedUntil
}

function noteCdnFailure(): void {
  _cdnFailStreak++
  if (_cdnFailStreak >= CDN_BREAKER_THRESHOLD && !isCdnDegraded()) {
    _cdnDegradedUntil = Date.now() + CDN_BREAKER_COOLDOWN_MS
    logger.warn(`CDN degraded: ${_cdnFailStreak} consecutive failures — serving assets from local data for ${CDN_BREAKER_COOLDOWN_MS / 1000}s`)
  }
}

function noteCdnSuccess(): void {
  if (_cdnFailStreak !== 0 || _cdnDegradedUntil !== 0) {
    _cdnFailStreak = 0
    _cdnDegradedUntil = 0
    logger.info('CDN recovered — normal network priority restored')
  }
}

// Fallbacks if the official config cannot be fetched (current as of build 1.73.8)
const FALLBACK_ASSETS_PATH = '3.2.12_cLlB,151J4Vd.fZX3eoz-xHi7Tx6Mw*3'
const FALLBACK_UI_PATH = 'ui/1.9.8_,OGnbUiqc0PuT6gr,.TnsfcRbM2d0Ovl'

// Optional private CDN mirroring the Ankama CDN tree (or a version-agnostic
// tree without the version segment). When set, it is tried BEFORE the official
// CDN, so deleted cache/mirror files are re-downloaded from OUR infrastructure
// instead of Ankama's — and the game keeps working even if the official CDN
// disappears or blocks the emulator.
const CUSTOM_CDN = (process.env.CUERVOK_ASSET_CDN || '').replace(/\/+$/, '')

let _assetsPath = FALLBACK_ASSETS_PATH
let _uiPath = FALLBACK_UI_PATH
let _cacheRoot: string | null = null

function getCacheRoot(): string {
  if (!_cacheRoot) {
    _cacheRoot = path.join(app.getPath('userData'), 'assets-cache')
    fs.mkdirSync(_cacheRoot, { recursive: true })
  }
  return _cacheRoot
}

/**
 * Characters that are invalid in Windows paths (and hostile in any filesystem
 * path). Ankama's CDN version tokens are base64-ish and DO contain some of
 * these — e.g. `3.2.12_cLlB,151J4Vd.fZX3eoz-xHi7Tx6Mw*3` has a literal `*`,
 * which made fs.mkdirSync throw ENOENT on Windows and every asset request 500
 * (→ ASSET_MISSING disconnect). The URL must keep the RAW token; only the
 * on-disk cache dir gets the sanitized copy.
 */
const INVALID_FS_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g

function fsSafeVersion(version: string): string {
  return version.replace(INVALID_FS_CHARS, '_')
}

/** On-disk cache dir for a kind: `{cacheRoot}/{kind}/{sanitizedVersion}`. */
function getVersionCacheDir(kind: 'assets' | 'ui'): string {
  const version = kind === 'assets' ? _assetsPath : _uiPath
  return path.join(getCacheRoot(), kind, fsSafeVersion(version))
}

function cacheFileFor(kind: 'assets' | 'ui', cleanRoute: string): string {
  return path.join(getVersionCacheDir(kind), cleanRoute)
}

/** Best-effort write-through cache write. A failure (read-only dir, disk full,
 * exotic path chars…) must NEVER fail the asset request itself — the body is
 * already in memory and can be served regardless. */
function writeCacheFile(cacheFile: string, body: Buffer): void {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
    fs.writeFileSync(cacheFile, body)
  } catch (err) {
    logger.warn(`Cache write failed (serving in-memory): ${cacheFile}`, err)
  }
}

/**
 * Version-agnostic local asset mirrors, consulted BEFORE the versioned cache
 * and the network: `{root}/assets/maps/68552706.json`, `{root}/ui/…` (WITHOUT
 * the version segment). Ankama bumps the version token frequently; a mirror
 * never breaks on a bump.
 *
 * Point CUERVOK_LOCAL_ASSETS at an extracted Dofus Touch asset tree (e.g. the
 * mobile `wizAssets` dump) to make the whole game playable with zero network.
 */
export function getLocalAssetRoots(): string[] {
  const roots: string[] = []
  if (process.env.CUERVOK_LOCAL_ASSETS) roots.push(process.env.CUERVOK_LOCAL_ASSETS)
  try {
    roots.push(path.join(app.getPath('userData'), 'assets-local'))
  } catch {
    // app not ready — skip default mirror
  }
  return roots
}

/**
 * Override folders checked in priority order (see handleAssetRequest).
 * The bundled one ships WITH the client (repo asset-overrides/ in dev, copied
 * to resources/asset-overrides/ by electron-builder extraResources in packaged
 * builds) so every fresh install carries the custom skins/icons.
 */
export function getOverrideRoots(): string[] {
  const roots = [path.join(app.getPath('userData'), 'asset-overrides')]
  try {
    roots.push(path.join(process.resourcesPath, 'asset-overrides'))
  } catch {
    // process.resourcesPath unavailable — skip bundled packaged location
  }
  try {
    roots.push(path.join(app.getAppPath(), 'asset-overrides'))
  } catch {
    // app not ready — skip repo checkout location
  }
  return roots
}

/**
 * Destination folder for NEW override files written by the editor's HTTP
 * bridge (/overrides/* POST). Tries the folder that SHIPS with the client
 * first so editor saves travel with fresh installs:
 *   1. {appPath}/asset-overrides     → dev repo checkout (writable)
 *   2. {resourcesPath}/asset-overrides → packaged extraResources folder
 *   3. {userData}/asset-overrides    → last resort (e.g. read-only install dir)
 * Reading (getOverrideRoots) still prefers userData, so a userData copy would
 * shadow the bundled one — writing bundled-first avoids that split-brain.
 * In packaged builds appPath points inside app.asar (read-only), so the
 * mkdir/access check fails and it falls through — safe.
 */
export function getOverrideWriteRoot(): string {
  const candidates: string[] = []
  try { candidates.push(path.join(app.getAppPath(), 'asset-overrides')) } catch { /* app not ready */ }
  try { candidates.push(path.join(process.resourcesPath, 'asset-overrides')) } catch { /* unavailable */ }
  candidates.push(path.join(app.getPath('userData'), 'asset-overrides'))
  for (const root of candidates) {
    try {
      fs.mkdirSync(root, { recursive: true })
      fs.accessSync(root, fs.constants.W_OK)
      return root
    } catch {
      // root not writable — try the next one
    }
  }
  const fallback = path.join(app.getPath('userData'), 'asset-overrides')
  fs.mkdirSync(fallback, { recursive: true })
  return fallback
}

/**
 * Fetches the official config.json and extracts the versioned CDN paths
 * for assets (e.g. "3.2.12_cLlB,...*3") and UI (e.g. "ui/1.9.8_,...").
 * Keeps the local proxy pointed at the latest version automatically.
 */
export async function syncAssetVersions(): Promise<void> {
  try {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(CDN_FETCH_TIMEOUT_MS) : undefined
    const res = await fetch(OFFICIAL_CONFIG_URL, { headers: { 'User-Agent': USER_AGENT }, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const config = await res.json()

    const extract = (url: string): string | null => {
      const marker = '/assets/'
      const idx = url.indexOf(marker)
      return idx === -1 ? null : url.slice(idx + marker.length).replace(/\/+$/, '')
    }

    const assetsPath = extract(config.assetsUrl || '')
    const uiPath = extract(config.uiUrl || '')

    if (assetsPath) _assetsPath = assetsPath
    if (uiPath) _uiPath = uiPath

    logger.info(`Asset versions: assets=${_assetsPath} ui=${_uiPath} (cache dirs: ${fsSafeVersion(_assetsPath)}, ${fsSafeVersion(_uiPath)})`)
  } catch (err) {
    logger.warn('Could not sync asset versions, using fallback', err)
  }
}

export function getAssetsPath(): string {
  return _assetsPath
}

export function getUiPath(): string {
  return _uiPath
}

/** Single fetch with the shared CDN timeout; null on network failure. */
async function fetchWithTimeout(url: string): Promise<Response | null> {
  // The timeout only covers connection + headers: once the response arrives
  // the timer is cleared so the body read is never aborted (large map jpgs can
  // legitimately take longer than 8s on a slow connection).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CDN_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Network sources for a route, best first:
 *   1. custom CDN with the version segment    {cdn}/{version}/{route}
 *   2. custom CDN version-agnostic            {cdn}/{route}
 *   3. official Ankama CDN                    {CDN_BASE}/{version}/{route}
 * The first candidate that returns ok wins; failures fall through.
 */
function networkUrlsFor(versionPath: string, cleanRoute: string): string[] {
  const urls: string[] = []
  if (CUSTOM_CDN) {
    urls.push(`${CUSTOM_CDN}/${versionPath}/${cleanRoute}`)
    urls.push(`${CUSTOM_CDN}/${cleanRoute}`)
  }
  urls.push(`${CDN_BASE}/${versionPath}/${cleanRoute}`)
  return urls
}

/**
 * Serves a game asset from LOCAL DATA FIRST (overrides → mirror → versioned
 * cache → previous-version caches), downloading from a CDN (custom → official)
 * only when no local copy exists, with write-through cache.
 *
 * kind = 'assets' → {CDN}/assets/{version}/{route}
 * kind = 'ui'     → {CDN}/assets/{uiVersion}/{route}
 */
export async function handleAssetRequest(
  kind: 'assets' | 'ui',
  route: string
): Promise<{ status: number; body: Buffer | null; contentType: string }> {
  const versionPath = kind === 'assets' ? _assetsPath : _uiPath
  const cleanRoute = route.replace(/^\/+/, '')
  if (!cleanRoute || cleanRoute.includes('..')) {
    return { status: 400, body: null, contentType: 'text/plain' }
  }

  // Local overrides take precedence over cache and CDN.  This is how custom
  // items created in the editor reach the game: drop `skins/{id}.json` +
  // `skins/{id}.png` and `gfx/items/{iconId}.png` into an asset-overrides
  // folder and the client will load them instead of the official CDN asset.
  //
  // Lookup order (first hit wins):
  //   1. {userData}/asset-overrides      → per-user additions (win over bundled)
  //   2. {resourcesPath}/asset-overrides → bundled WITH the client (ships in
  //      every install via extraResources, so fresh installs get custom items)
  //   3. {appPath}/asset-overrides       → repo checkout (dev mode)
  for (const root of getOverrideRoots()) {
    const overrideFile = path.join(root, cleanRoute)
    if (fs.existsSync(overrideFile)) {
      let body: Buffer = fs.readFileSync(overrideFile)
      body = patchMapResponse(cleanRoute, body)
      return { status: 200, body, contentType: mimeFor(cleanRoute) }
    }
  }

  // Sanitized versioned cache.  The dir name is the fs-safe copy of the CDN
  // token, so a token containing `*` (or any Windows-invalid char) can never
  // break mkdir again.
  const cacheFile = cacheFileFor(kind, cleanRoute)

  if (fs.existsSync(cacheFile)) {
    let body: Buffer = fs.readFileSync(cacheFile)
    // Inyectar campos opcionales faltantes en mapas (el renderer del cliente
    // requiere ambientSounds[] y heroAllowedOnMap para no lanzar TypeError).
    body = patchMapResponse(cleanRoute, body)
    return { status: 200, body, contentType: mimeFor(cleanRoute) }
  }

  // Version-agnostic local mirrors (assets-local / CUERVOK_LOCAL_ASSETS).
  // Extracted assets never break when Ankama bumps the version token, and are
  // the "datos locales" that make the game fully playable offline. Served
  // directly AND backfilled into the versioned cache for next time.
  const mirrored = tryLocalAsset(kind, cleanRoute, cacheFile)
  if (mirrored) return mirrored

  // Previous-version caches: asset files barely change between CDN token
  // bumps, so reuse the last downloaded tree instead of re-downloading
  // everything (or 500ing like before). Genuinely NEW routes miss here and go
  // to the network, so new content still downloads.
  const stale = tryPreviousVersionCache(kind, cleanRoute, cacheFile)
  if (stale) return stale

  // CDN known-broken (circuit breaker): skip the network entirely. The mirror
  // and stale caches above already failed, so a fetch would just pile up 8s
  // timeouts. Return 404 and let the next request retry after the cooldown.
  // Protected assets still get their graceful fallback: a bone animation the
  // CDN never published must not hard-fight rendering while the breaker is open.
  if (isCdnDegraded()) {
    if (isProtectedAsset(cleanRoute)) {
      const fallback = await protectedAssetFallback(cleanRoute)
      logger.warn(`CDN degraded (protected fallback served, not cached): ${kind}/${cleanRoute}`)
      return { status: 200, body: fallback, contentType: mimeFor(cleanRoute) }
    }
    logger.warn(`Asset not in local data (CDN degraded): ${kind}/${cleanRoute}`)
    return { status: 404, body: null, contentType: 'text/plain' }
  }

  // Network: custom CDN (if configured) → official CDN.
  let res: Response | null = null
  let usedUrl = ''
  for (const candidate of networkUrlsFor(versionPath, cleanRoute)) {
    const r = await fetchWithTimeout(candidate)
    if (r) {
      res = r
      usedUrl = candidate
      if (r.ok) break
    }
  }

  if (!res) {
    // Network failure for every source (offline, DNS, blocked, timeout...).
    // Local data is the last line of defense so nothing breaks if the CDN
    // disappears entirely.
    noteCdnFailure()
    const local = tryLocalAsset(kind, cleanRoute, cacheFile)
    if (local) return local
    if (isProtectedAsset(cleanRoute)) {
      const fallback = await protectedAssetFallback(cleanRoute)
      logger.warn(`Network failed (protected fallback served, not cached): ${kind}/${cleanRoute}`)
      return { status: 200, body: fallback, contentType: mimeFor(cleanRoute) }
    }
    logger.error(`Asset fetch failed: ${usedUrl || networkUrlsFor(versionPath, cleanRoute).join(', ')}`)
    return { status: 502, body: null, contentType: 'text/plain' }
  }

  if (!res.ok) {
    // Every source answered with an error (blocked route, changed version,
    // 404...). Serve the local mirror when it has the file instead of failing
    // the game. This runs BEFORE the protected fallback: for a 403'd
    // gfx/skin/ornament that the extract actually contains, the real file
    // beats an empty atlas.
    const local = tryLocalAsset(kind, cleanRoute, cacheFile)
    if (local) return local
    // Some CDN assets are Cloudflare-protected and return 403 (S3 AccessDenied)
    // even though the game references them (e.g. gfx/ornaments/ornament_183.json).
    // Serve a graceful fallback instead of failing the request so the client
    // never crashes with "Failed to load json ... 403".
    //
    // NEVER persist that fallback into the versioned cache: the cache is
    // consulted BEFORE the network on every later request, so a cached empty
    // jeff would PERMANENTLY kill a bone's animations (idle/walk/run resolved
    // to an empty template → entities frozen on one static sprite, direction
    // suffixes L/R/B effectively ignored). Serving in-memory only keeps the
    // retry path alive for when the CDN (or our custom CDN) starts answering.
    // 404 gets the same treatment as 403: the CDN simply never published
    // some routes the client requests on every fight (attack animations of
    // several monsters, e.g. bones/355 AnimAttaque603_1.png — Dopeul Sadida).
    // Raw 404s used to reach the renderer and spam "[WebGLRenderer._drawSubBatch]
    // Texture not loaded" on every attack. Fallbacks are NEVER cached, so the
    // retry path stays alive if the CDN starts answering later.
    if ((res.status === 403 || res.status === 404) && isProtectedAsset(cleanRoute)) {
      const fallback = await protectedAssetFallback(cleanRoute)
      logger.warn(`Asset ${res.status} (fallback served, not cached): ${usedUrl}`)
      return { status: 200, body: fallback, contentType: mimeFor(cleanRoute) }
    }
    if (res.status >= 500) noteCdnFailure()
    logger.warn(`Asset ${res.status}: ${usedUrl}`)
    return { status: res.status, body: null, contentType: 'text/plain' }
  }

  noteCdnSuccess()
  let body: Buffer
  try {
    body = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    noteCdnFailure()
    const local = tryLocalAsset(kind, cleanRoute, cacheFile)
    if (local) return local
    logger.error(`Asset body read failed: ${usedUrl}`, err)
    return { status: 502, body: null, contentType: 'text/plain' }
  }
  body = patchMapResponse(cleanRoute, body)
  writeCacheFile(cacheFile, body)
  return { status: 200, body, contentType: mimeFor(cleanRoute) }
}

/**
 * Assets the CDN 403s but the game still requests.  Ornaments are the known
 * case: some ornament ids (e.g. 183, 200, 300) are Cloudflare-protected even
 * though lower ids (1..100) load fine.  Item icons are too: e.g. item 22879
 * (Tik-Tok Topper) has iconId 172825 whose PNG returns 403 on the CDN.
 *
 * Skins too: the CDN only ships character skin atlases for ids 1..4150 —
 * every skins/{id}.json above that (items with id > 4150, e.g. the level-191
 * cape 8876) returns an S3 AccessDenied.  Those items have no character
 * visual in the official assets; serving the empty-atlas fallback lets the
 * rest of the character look render instead of the whole look failing.
 * A custom skin dropped into asset-overrides (skins/{id}.json + .png, e.g.
 * generated by the SWF import tool) still wins because overrides are checked
 * before the CDN.
 */
function isProtectedAsset(route: string): boolean {
  return (
    route.startsWith('gfx/ornaments/') ||
    route.startsWith('gfx/items/') ||
    route.startsWith('skins/') ||
    // bones/{id}.json and bones/{id}/{anim}.json+png: the CDN only publishes
    // SOME animation files per bone (e.g. AnimHit/AnimMort); the idle/move
    // ones (AnimStatique, AnimMarche…) return S3 AccessDenied for most
    // monsters.  Serving the empty-jeff/transparent fallback lets the look
    // resolve and the fight scene render instead of crashing with
    // "amsal: The look is missing" + "Cannot read properties of undefined
    // (reading 'speed')".
    route.startsWith('bones/')
  )
}

/**
 * Version-agnostic local mirror lookup: `{root}/{kind}/{route}`.
 * Serves the file and backfills the versioned write-through cache so
 * subsequent requests skip the mirror stat entirely.
 */
function tryLocalAsset(
  kind: 'assets' | 'ui',
  cleanRoute: string,
  cacheFile: string
): { status: number; body: Buffer; contentType: string } | null {
  for (const root of getLocalAssetRoots()) {
    const file = path.join(root, kind, cleanRoute)
    if (!fs.existsSync(file)) continue
    let body: Buffer
    try {
      body = fs.readFileSync(file)
    } catch (err) {
      logger.warn(`Local mirror unreadable: ${file}`, err)
      continue
    }
    body = patchMapResponse(cleanRoute, body)
    writeCacheFile(cacheFile, body)
    logger.warn(`Asset served from local mirror: ${kind}/${cleanRoute} <- ${file}`)
    return { status: 200, body, contentType: mimeFor(cleanRoute) }
  }
  return null
}

/**
 * Reuses the previous CDN version's cache: Ankama bumps the version token
 * (3.2.11_… → 3.2.12_…*3) without changing most files, and each bump used to
 * orphan the whole cache (new dir, everything re-downloaded — or 500ed when
 * the new token broke mkdir). Look for the route in every OTHER cache dir
 * under {cacheRoot}/{kind} (newest first) and backfill it into the current
 * version dir. Covers both the flat layout (`{root}/assets/3.2.11_…/{route}`)
 * and the legacy ui layout (`{root}/ui/ui/1.9.8_…/{route}`).
 */
function tryPreviousVersionCache(
  kind: 'assets' | 'ui',
  cleanRoute: string,
  currentCacheFile: string
): { status: number; body: Buffer; contentType: string } | null {
  const kindDir = path.join(getCacheRoot(), kind)
  const currentDir = path.dirname(currentCacheFile)

  // Collect candidate cache dirs: subdirs of {kindDir}, plus one level deeper
  // (the legacy ui layout nests the version under {kindDir}/ui/…).
  const dirs: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(kindDir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const sub = path.join(kindDir, entry.name)
    if (sub === currentDir) continue
    dirs.push(sub)
    try {
      for (const nested of fs.readdirSync(sub, { withFileTypes: true })) {
        if (nested.isDirectory() && !nested.name.startsWith('.')) {
          const deep = path.join(sub, nested.name)
          if (deep !== currentDir) dirs.push(deep)
        }
      }
    } catch {
      // not a directory — skip
    }
  }

  // Newest first (most likely to match the current assets).
  dirs.sort((a, b) => {
    let ma = 0
    let mb = 0
    try { ma = fs.statSync(a).mtimeMs } catch { /* ignore */ }
    try { mb = fs.statSync(b).mtimeMs } catch { /* ignore */ }
    return mb - ma
  })

  for (const dir of dirs) {
    const file = path.join(dir, cleanRoute)
    if (!fs.existsSync(file)) continue
    let body: Buffer
    try {
      body = fs.readFileSync(file)
    } catch {
      continue
    }
    body = patchMapResponse(cleanRoute, body)
    writeCacheFile(currentCacheFile, body)
    logger.warn(`Asset served from previous version cache: ${kind}/${cleanRoute} <- ${path.relative(getCacheRoot(), file)}`)
    return { status: 200, body, contentType: mimeFor(cleanRoute) }
  }
  return null
}

/** Cached generic item icon (id 15116 — the game's own fallback icon). */
let _genericItemIcon: Buffer | null = null

async function getGenericItemIcon(): Promise<Buffer> {
  if (_genericItemIcon) return _genericItemIcon
  const cacheFile = cacheFileFor('assets', 'gfx/items/15116.png')
  try {
    if (fs.existsSync(cacheFile)) {
      _genericItemIcon = fs.readFileSync(cacheFile)
      return _genericItemIcon
    }
    // Local mirror first (extracted dump always has this icon).
    const local = tryLocalAsset('assets', 'gfx/items/15116.png', cacheFile)
    if (local) {
      _genericItemIcon = local.body
      return local.body
    }
    // Previous-version cache (same icon under an older token).
    const stale = tryPreviousVersionCache('assets', 'gfx/items/15116.png', cacheFile)
    if (stale) {
      _genericItemIcon = stale.body
      return stale.body
    }
    const res = await fetchWithTimeout(`${CDN_BASE}/${_assetsPath}/gfx/items/15116.png`)
    if (res && res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      writeCacheFile(cacheFile, buf)
      _genericItemIcon = buf
      return buf
    }
  } catch (err) {
    logger.warn('Could not fetch generic item icon 15116', err)
  }
  return transparentPng()
}

/** 1x1 transparent PNG. */
function transparentPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
}

/**
 * Builds a valid fallback for a protected asset:
 *  - .json → a minimal Jeff sprite-atlas JSON (meta + empty symbols) so
 *    loadAndParseJson succeeds and the client simply renders nothing.
 *  - gfx/items/*.png → the generic item icon 15116 (always available), so
 *    protected item icons still render instead of showing nothing.
 *  - other .png → a 1x1 transparent PNG.
 */
async function protectedAssetFallback(route: string): Promise<Buffer> {
  if (route.endsWith('.json')) {
    const name = path.basename(route, '.json')
    const json = JSON.stringify({
      meta: { app: 'jeff', version: '0.2.2', frameRate: 25, scale: 1, filtering: ['linear', 'linear'], mipmapCompatible: false, compressedMatrices: true, prerendered: false, image: `${name}.png` },
      symbols: {},
      transforms: [],
      colors: [],
    })
    return Buffer.from(json, 'utf-8')
  }
  if (route.startsWith('gfx/items/')) {
    return getGenericItemIcon()
  }
  return transparentPng()
}

/**
 * The Dofus Touch client renderer expects every map JSON to contain
 * `ambientSounds` (array), `heroAllowedOnMap` (boolean), and the fight theme
 * id `tacticalModeId` (int).  Many CDN maps (especially outdoor/farm maps
 * like 68552706) lack these optional fields, causing:
 *   • "Cannot read properties of undefined (reading 'ambientSounds')"
 *   • "Cannot read properties of undefined (reading 'heroAllowedOnMap')"
 *   • "IndexedDB id to get in object store: TacticalThemes, is invalid: null"
 *   • "WebGLRenderer.updateVertexBuffer: No buffer loaded for tacticalMode*"
 *
 * This function injects safe defaults so the client never sees undefined, and
 * nulls neighbour links that point at RETIRED maps (see map-registry.ts) — the
 * client uses topNeighbourId/bottomNeighbourId/leftNeighbourId/rightNeighbourId
 * to offer exits; a stale exit would ChangeMap the player to a map whose asset
 * 403s on the CDN, producing an ASSET_MISSING disconnect mid-navigation.
 *
 * NOTE: the client reads the fight theme from CurrentMapMessage.tacticalModeId
 * (sent by the game server), not from the map JSON — the tacticalModeId injected
 * here is only a safe default for maps served through this proxy.
 */
function patchMapResponse(route: string, body: Buffer): Buffer {
  if (!route.endsWith('.json') || !route.includes('/maps/')) return body

  try {
    const map = JSON.parse(body.toString('utf-8'))
    let changed = false

    // Editor "Quitar del mapa": strip removed interactives from the midground
    // layer so the client stops drawing their sprites (the game server already
    // hides them from the interactive payload). Map id from the route tail.
    const routeMapId = route.split('/').pop()?.replace(/\.json$/, '')
    if (routeMapId && stripRemovedMidground(routeMapId, map))
      changed = true

    if (!map.ambientSounds) {
      map.ambientSounds = []
      changed = true
    }
    if (map.heroAllowedOnMap === undefined) {
      map.heroAllowedOnMap = true
      changed = true
    }
    // tacticalModeId: the client reads it from CurrentMapMessage to pick the
    // fight theme (TacticalThemes[id].mapId → theme map), but maps served from
    // this proxy should also carry a safe default.  Theme 7 → map 77332993 is
    // the verified-public fallback (maps/77332993.json, backgrounds/77332993.jpg
    // and its gfx/world atlas all 200 on the CDN).  Themes whose assets 403
    // (e.g. the client's DEFAULT_TACTICAL_THEME_MAP 4624 — maps/4624.json and
    // its background/foreground are S3 AccessDenied) made the tactical overlay
    // fail with "No buffer loaded for tacticalModeFloorStaticSprites" and could
    // hang the map load.
    if (map.tacticalModeId == null) {
      map.tacticalModeId = 7
      changed = true
    }

    // Retired-map neighbour links: null them so the client shows no exit.
    for (const key of ['topNeighbourId', 'bottomNeighbourId', 'leftNeighbourId', 'rightNeighbourId'] as const) {
      const n = map[key]
      if (n != null && RETIRED_MAP_IDS.has(n)) {
        map[key] = null
        changed = true
      }
    }

    return changed ? Buffer.from(JSON.stringify(map), 'utf-8') : body
  } catch {
    // Not a valid JSON file or not a map — return as-is
    return body
  }
}

function mimeFor(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    swf: 'application/x-shockwave-flash',
    css: 'text/css',
    js: 'application/javascript',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf'
  }
  return map[ext] || 'application/octet-stream'
}
