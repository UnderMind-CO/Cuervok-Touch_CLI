#!/usr/bin/env node
/**
 * Downloads Dofus Touch map data from the Ankama CDN into the
 * TouchEmu-Cuervok data/maps/ folder.
 *
 * Two-phase approach:
 *   1. Uses the official MapPositions table (downloaded from the game proxy)
 *      to know exactly which map IDs exist in the game. All missing map IDs
 *      are queued for download.
 *   2. BFS from seed maps follows neighbour references (top/left/right/bottom)
 *      to discover any maps that may have been added after MapPositions was
 *      generated, or that the official table omits.
 *
 * Resumable (skips already-downloaded maps). Pass --max=N to limit downloads
 * (useful for testing).
 *
 * Zone mode: --zone=<mapId> [--radius=N] (default 5) downloads only the maps
 * around the seed: every MapPositions entry within ±N grid units of the
 * seed's posX/posY, plus BFS-discovered neighbours bounded by the same box
 * (or by BFS depth when a neighbour is missing from MapPositions — catches
 * maps added after the table snapshot).
 *
 * Usage:
 *   node scripts/download-maps.mjs [path/to/TouchEmu-Cuervok/data] [--max N]
 *   node scripts/download-maps.mjs --zone=162398720 [--radius=5]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const OFFICIAL_CONFIG = 'https://dt-proxy-production-login.ankama-games.com/config.json?lang=es'
const OFFICIAL_PROXY = 'https://dt-proxy-production-login.ankama-games.com'
const CDN_BASE = 'https://dofustouch.cdn.ankama.com/assets'
const DEFAULT_DATA_DIR = 'C:\\Users\\Jhoan\\Downloads\\Dof test\\DofusTouch\\TouchEmu-Cuervok\\data'

const args = process.argv.slice(2)
const dataDirArg = args.find((a) => !a.startsWith('--')) || DEFAULT_DATA_DIR
const maxArg = args.find((a) => a.startsWith('--max='))
const MAX_DOWNLOADS = maxArg ? parseInt(maxArg.split('=')[1], 10) : Infinity
const zoneArg = args.find((a) => a.startsWith('--zone='))
const ZONE_ID = zoneArg ? parseInt(zoneArg.split('=')[1], 10) : null
const radiusArg = args.find((a) => a.startsWith('--radius='))
const ZONE_RADIUS = radiusArg ? parseInt(radiusArg.split('=')[1], 10) : 5
const DATA_DIR = path.resolve(dataDirArg)
const MAPS_DIR = path.join(DATA_DIR, 'maps')

const SEED_IDS = [
  1, 68551169, 68551171, 68551680, 68551681, 68551682, 68551683, 68551684,
  68552192, 68552193, 68552194, 68552195, 68552196, 68552449, 68552704,
  68552705, 68552706, 68552707, 68553217, 68553218, 68553219
]

const CONCURRENCY = 6
const FALLBACK_ASSETS_PATH = '3.2.11_XmqR,JLRxKAo0jK41tA_EnsXKrTBc47Z'

let _assetsPath = null

async function fetchAssetsPath() {
  if (_assetsPath) return _assetsPath
  try {
    const res = await fetch(OFFICIAL_CONFIG, { headers: { 'User-Agent': 'DofEmu MapCrawler' } })
    if (res.ok) {
      const cfg = await res.json()
      const marker = '/assets/'
      const idx = cfg.assetsUrl ? cfg.assetsUrl.indexOf(marker) : -1
      if (idx !== -1) {
        _assetsPath = cfg.assetsUrl.slice(idx + marker.length).replace(/\/+$/, '')
        console.log(`Using CDN assets path: ${_assetsPath}`)
        return _assetsPath
      }
    }
  } catch (err) {
    console.warn(`Could not fetch official config, using fallback: ${err.message}`)
  }
  _assetsPath = FALLBACK_ASSETS_PATH
  return _assetsPath
}

/**
 * Fetches the complete MapPositions table to get every valid map ID in the game.
 * Falls back to loading from disk if the proxy is unavailable.
 * Returns null if MapPositions is not available at all (BFS-only fallback).
 */
async function fetchMapPositions() {
  // Try fetching from the official proxy first
  try {
    console.log('Fetching MapPositions from proxy...')
    const res = await fetch(`${OFFICIAL_PROXY}/data/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ class: 'MapPositions' })
    })
    if (res.ok) {
      const data = await res.json()
      const ids = Object.keys(data).map(Number).filter((n) => n > 0)
      console.log(`MapPositions fetched: ${ids.length} valid map IDs`)

      // Save to disk so future runs don't need to re-download
      const localPath = path.join(DATA_DIR, 'MapPositions.json')
      fs.writeFileSync(localPath, JSON.stringify(data))

      return new Set(ids)
    }
    throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.warn(`Could not fetch MapPositions: ${err.message}`)
  }

  // Fallback: try loading from disk
  const localPath = path.join(DATA_DIR, 'MapPositions.json')
  if (fs.existsSync(localPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(localPath, 'utf-8'))
      const ids = Object.keys(data).map(Number).filter((n) => n > 0)
      console.log(`MapPositions loaded from disk: ${ids.length} valid map IDs`)
      return new Set(ids)
    } catch (err) {
      console.warn(`Could not parse local MapPositions: ${err.message}`)
    }
  }

  console.warn('MapPositions not available — falling back to BFS-only mode')
  return null
}

async function downloadMap(id) {
  const file = path.join(MAPS_DIR, `${id}.json`)
  if (fs.existsSync(file)) return { status: 'skip', id }
  const assetsPath = await fetchAssetsPath()
  const url = `${CDN_BASE}/${assetsPath}/maps/${id}.json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'DofEmu MapCrawler' } })
    if (!res.ok) return { status: 'miss', id, code: res.status }
    const text = await res.text()
    fs.writeFileSync(file, text)
    return { status: 'ok', id, text }
  } catch (err) {
    return { status: 'err', id, error: err.message }
  }
}

function parseMapNeighbours(text) {
  // The CDN map JSON uses camelCase keys for neighbour ids
  let data
  try { data = JSON.parse(text) } catch { return null }
  const ids = []
  for (const k of ['topNeighbourId', 'leftNeighbourId', 'rightNeighbourId', 'bottomNeighbourId']) {
    const v = data[k]
    if (v && typeof v === 'number' && v > 0) ids.push(v)
  }
  return { id: data.id, neighbours: ids }
}

async function main() {
  if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true })

  // Phase 1: Get the complete list of valid map IDs from MapPositions
  const validMapIds = await fetchMapPositions()

  // Existing maps on disk (so we know what to skip)
  const existingFiles = fs.existsSync(MAPS_DIR) ? fs.readdirSync(MAPS_DIR) : []
  const existingIds = new Set(existingFiles.map((f) => parseInt(f, 10)).filter((n) => !isNaN(n)))

  // Full MapPositions table with coordinates (zone mode).  Loaded AFTER
  // fetchMapPositions() so a proxy refresh updates the file first.
  const positions = new Map()
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'MapPositions.json'), 'utf-8'))
    for (const [k, v] of Object.entries(data)) {
      const id = Number(k)
      if (id > 0 && v && typeof v.posX === 'number' && typeof v.posY === 'number')
        positions.set(id, { x: v.posX, y: v.posY })
    }
  } catch { /* zone mode without coords falls back to BFS-depth bound */ }

  // Phase 2: Build the initial download queue
  const visited = new Set()
  const queue = []
  const depth = new Map()

  let fromMapPositions = 0
  const seedPos = ZONE_ID != null ? positions.get(ZONE_ID) : null
  const inZoneBox = (id) => {
    if (!seedPos) return false
    const p = positions.get(id)
    return !!p && Math.abs(p.x - seedPos.x) <= ZONE_RADIUS && Math.abs(p.y - seedPos.y) <= ZONE_RADIUS
  }

  if (ZONE_ID != null) {
    // Zone mode: everything in the coordinate box around the seed, plus
    // BFS from the seed bounded by the same box (depth bound for coords
    // unknown to the table).
    if (seedPos) {
      console.log(`Zone mode: seed ${ZONE_ID} at (${seedPos.x}, ${seedPos.y}), radius ${ZONE_RADIUS} → box x[${seedPos.x - ZONE_RADIUS}..${seedPos.x + ZONE_RADIUS}] y[${seedPos.y - ZONE_RADIUS}..${seedPos.y + ZONE_RADIUS}]`)
      let missing = 0
      for (const [id, p] of positions) {
        if (Math.abs(p.x - seedPos.x) > ZONE_RADIUS || Math.abs(p.y - seedPos.y) > ZONE_RADIUS)
          continue
        if (!existingIds.has(id)) missing++
        // Existing maps are queued too: they 'skip' the download but their
        // neighbours still expand, keeping the BFS complete.
        queue.push(id)
        depth.set(id, id === ZONE_ID ? 0 : 1)
        fromMapPositions++
      }
      console.log(`Box contains ${fromMapPositions} known maps (${missing} missing on disk)`)
    } else {
      console.log(`Zone mode: seed ${ZONE_ID} has no coordinates in MapPositions — bounding the BFS by depth ${ZONE_RADIUS}`)
      queue.push(ZONE_ID)
      depth.set(ZONE_ID, 0)
    }
  } else if (validMapIds) {
    for (const id of validMapIds) {
      if (!existingIds.has(id)) {
        queue.push(id)
        fromMapPositions++
      }
    }
    console.log(`Queued ${fromMapPositions} missing maps from MapPositions (${existingIds.size} already on disk of ${validMapIds.size} total)`)
  }

  // Also add seed IDs for BFS discovery (catches maps that may not be in MapPositions)
  let fromSeeds = 0
  if (ZONE_ID == null) {
    for (const id of SEED_IDS) {
      if (!visited.has(id) && !existingIds.has(id)) {
        queue.push(id)
        fromSeeds++
      }
    }
    if (fromSeeds > 0) {
      console.log(`Added ${fromSeeds} seed IDs for BFS exploration`)
    }

    // Mark existing maps as visited so the BFS doesn't reprocess them
    for (const id of existingIds) visited.add(id)
  }

  // If there are no seeds added and no missing maps, we're done
  if (queue.length === 0) {
    const total = fs.readdirSync(MAPS_DIR).length
    console.log(`\nAll ${total} maps already on disk. Nothing to download.`)
    if (validMapIds && total < validMapIds.size) {
      console.log(`(Note: ${validMapIds.size - total} maps from MapPositions are not on CDN)`)
    }
    return
  }

  let downloaded = 0
  let ok = 0, skip = 0, miss = 0, err = 0, parsed = 0

  const initialQueued = queue.length
  const limitDesc = MAX_DOWNLOADS === Infinity ? 'unlimited' : String(MAX_DOWNLOADS)
  console.log(`Starting download: ${initialQueued} maps queued (max ${limitDesc})`)

  /** Enqueues a downloaded/skipped map's neighbours, honoring the zone box in
   *  zone mode (coords within ±RADIUS of the seed; BFS-depth bound when the
   *  neighbour is missing from MapPositions). */
  function pushNeighbours(mapId, neighbourIds) {
    const d = depth.get(mapId) ?? 0
    for (const n of neighbourIds) {
      if (visited.has(n)) continue
      if (ZONE_ID != null) {
        if (seedPos) {
          if (!inZoneBox(n) && d + 1 > ZONE_RADIUS) continue
        } else if (d + 1 > ZONE_RADIUS) {
          continue
        }
      }
      if (!depth.has(n)) depth.set(n, d + 1)
      queue.push(n)
    }
  }

  async function worker() {
    while (queue.length && downloaded < MAX_DOWNLOADS) {
      const id = queue.shift()
      if (visited.has(id)) continue
      visited.add(id)

      const r = await downloadMap(id)
      downloaded++

      if (r.status === 'ok') {
        ok++
        const map = parseMapNeighbours(r.text)
        if (map) {
          parsed++
          pushNeighbours(id, map.neighbours)
        }
        if (ok % 100 === 0) {
          const remaining = queue.length
          console.log(`Progress: ${ok} downloaded, ${skip} skipped, ${miss} missing, ${err} errors | ${remaining} remaining in queue`)
        }
      } else if (r.status === 'skip') {
        skip++
        // Try to parse existing file to continue BFS
        try {
          const map = parseMapNeighbours(fs.readFileSync(path.join(MAPS_DIR, `${id}.json`), 'utf-8'))
          if (map) {
            parsed++
            pushNeighbours(id, map.neighbours)
          }
        } catch { /* file may be corrupt — ignore */ }
      } else if (r.status === 'miss') {
        miss++
      } else {
        err++
        if (err <= 5) console.error(`Error on map ${id}: ${r.error}`)
      }
    }
  }

  const startTime = Date.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  const totalOnDisk = fs.readdirSync(MAPS_DIR).length
  console.log(`\nDone in ${elapsed}s:`)
  console.log(`  ${downloaded} attempted | ${ok} downloaded, ${skip} skipped, ${miss} not on CDN, ${err} errors`)
  console.log(`  Total maps on disk: ${totalOnDisk}`)

  if (validMapIds && totalOnDisk < validMapIds.size) {
    const stillMissing = [...validMapIds].filter(
      (id) => !fs.existsSync(path.join(MAPS_DIR, `${id}.json`))
    ).length
    console.log(`  Still not on CDN (in MapPositions but unreachable): ${stillMissing} maps`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })