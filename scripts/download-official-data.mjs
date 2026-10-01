#!/usr/bin/env node
/**
 * Download Official Game Data
 * ============================
 * Downloads game data from TWO official sources:
 *
 * 1. Ankama Proxy (dt-proxy-production-login.ankama-games.com)
 *    - POST /data/map {"class":"X"} → JSON table data
 *    - POST /data/dictionary?lang=es → localized strings
 *
 * 2. Frigost/DofusDB API (frigost.dev)
 *    - GET /API/Dofus 3.0/Data/Interactives.json → interactive type catalog
 *    - GET /API/Dofus 3.0/Data/Spells.json → spell data
 *
 * Output: data/official/ directory with all downloaded JSON files.
 *
 * Usage:
 *   node scripts/download-official-data.mjs [output-dir]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const ANKAMA_PROXY = 'https://dt-proxy-production-login.ankama-games.com'
const FRIGOST_API = 'https://www.frigost.dev/API/Dofus%203.0/Data'

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const outputDir = args.find(a => !a.startsWith('--')) 
  ? path.resolve(args.find(a => !a.startsWith('--')))
  : path.join(root, 'data', 'official')

const EMPTY_THRESHOLD = 8

// ═══════════════════════════════════════════════════════════════════
// Tables from the Ankama proxy /data/map endpoint
// These are the SAME tables the game client downloads at startup
// ═══════════════════════════════════════════════════════════════════

const ANKAMA_TABLES = [
  // Interactive element data
  'Interactives',
  
  // Skill & spell data  
  'Effects',
  'SpellLevels',
  'SpellStates',
  'SpellTypes',
  'TypeActions',
  
  // Item data (for resource drops)
  'ItemTypes',
  
  // World structure
  'Areas',
  'SuperAreas',
  'WorldMaps',
  
  // Job/profession data
  // (not a separate table - embedded in Interactives)
  
  // Other useful data
  'Breeds',
  'Smileys',
  'MountBehaviors',
  'Mounts',
  
  // Quest data
  'Quests',
  'QuestSteps',
  'QuestObjectives',
  'QuestCategory',
  'QuestObjectiveTypes',
]

// Large tables - only download with --force
const ANKAMA_FORCE_TABLES = [
  'Items',
  'Spells',
  'Npcs',
  'Heads',
  'ChatChannels',
  'Monsters',
]

// ═══════════════════════════════════════════════════════════════════
// Frigost/DofusDB API endpoints
// ═══════════════════════════════════════════════════════════════════

const FRIGOST_FILES = [
  'Interactives.json',
  'Spells.json',
  'Jobs.json',
  'Items.json',
  'Breeds.json',
  'Monsters.json',
]

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function needsDownload(filePath) {
  if (FORCE) return true
  if (!fs.existsSync(filePath)) return true
  const stat = fs.statSync(filePath)
  return stat.size <= EMPTY_THRESHOLD
}

async function downloadWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (!res.ok) {
        if (attempt < retries && res.status >= 500) {
          await sleep(1000 * (attempt + 1))
          continue
        }
        throw new Error(`HTTP ${res.status} ${url}`)
      }
      return await res.text()
    } catch (err) {
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1))
        continue
      }
      throw err
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Download from Ankama proxy
// ═══════════════════════════════════════════════════════════════════

async function downloadAnkamaTable(tableName) {
  const filePath = path.join(outputDir, 'ankama', `${tableName}.json`)
  
  if (!needsDownload(filePath)) {
    const size = fs.statSync(filePath).size
    return { name: tableName, status: 'skip', size }
  }
  
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const text = await downloadWithRetry(`${ANKAMA_PROXY}/data/map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ class: tableName }),
    })
    fs.writeFileSync(filePath, text)
    return { name: tableName, status: 'ok', size: text.length }
  } catch (err) {
    return { name: tableName, status: 'fail', error: err.message }
  }
}

async function downloadAnkamaDictionary(lang) {
  const filePath = path.join(outputDir, 'ankama', 'dictionary', `${lang}.json`)
  
  if (!needsDownload(filePath)) {
    const size = fs.statSync(filePath).size
    return { name: `dictionary/${lang}`, status: 'skip', size }
  }
  
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const res = await fetch(`${ANKAMA_PROXY}/data/dictionary?lang=${lang}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    fs.writeFileSync(filePath, text)
    return { name: `dictionary/${lang}`, status: 'ok', size: text.length }
  } catch (err) {
    return { name: `dictionary/${lang}`, status: 'fail', error: err.message }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Download from Frigost/DofusDB API
// ═══════════════════════════════════════════════════════════════════

async function downloadFrigostFile(fileName) {
  const filePath = path.join(outputDir, 'frigost', fileName)
  
  if (!needsDownload(filePath)) {
    const size = fs.statSync(filePath).size
    return { name: fileName, status: 'skip', size }
  }
  
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const text = await downloadWithRetry(`${FRIGOST_API}/${fileName}`)
    fs.writeFileSync(filePath, text)
    return { name: fileName, status: 'ok', size: text.length }
  } catch (err) {
    return { name: fileName, status: 'fail', error: err.message }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Pool runner
// ═══════════════════════════════════════════════════════════════════

async function runPool(items, worker, concurrency = 4) {
  const results = []
  let index = 0
  
  async function next() {
    while (index < items.length) {
      const i = index++
      results[i] = await worker(items[i], i)
    }
  }
  
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => next())
  )
  
  return results
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('=== Download Official Game Data ===')
  console.log(`Output: ${outputDir}`)
  if (FORCE) console.log('--force: refreshing all files\n')
  
  fs.mkdirSync(outputDir, { recursive: true })
  
  // ── 1. Dictionaries ──────────────────────────────────────────
  console.log('== Dictionaries ==')
  const dictResults = await runPool(
    ['es', 'en', 'fr'],
    lang => downloadAnkamaDictionary(lang),
    3
  )
  for (const r of dictResults) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'skip' ? '–' : '✗'
    console.log(`  ${icon} ${r.name} ${r.status === 'ok' ? `(${r.size} bytes)` : r.status === 'skip' ? `(${r.size} bytes, cached)` : r.error}`)
  }
  
  // ── 2. Ankama tables ─────────────────────────────────────────
  console.log('\n== Ankama Proxy Tables ==')
  const ankamaTables = FORCE 
    ? [...new Set([...ANKAMA_TABLES, ...ANKAMA_FORCE_TABLES])]
    : ANKAMA_TABLES
    
  const ankamaResults = await runPool(ankamaTables, downloadAnkamaTable, 4)
  for (const r of ankamaResults) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'skip' ? '–' : '✗'
    console.log(`  ${icon} ${r.name}.json ${r.status === 'ok' ? `(${r.size} bytes)` : r.status === 'skip' ? `(${r.size} bytes, cached)` : r.error}`)
  }
  
  // ── 3. Frigost/DofusDB files ────────────────────────────────
  console.log('\n== Frigost/DofusDB API ==')
  const frigostResults = await runPool(FRIGOST_FILES, downloadFrigostFile, 3)
  for (const r of frigostResults) {
    const icon = r.status === 'ok' ? '✓' : r.status === 'skip' ? '–' : '✗'
    console.log(`  ${icon} ${r.name} ${r.status === 'ok' ? `(${r.size} bytes)` : r.status === 'skip' ? `(${r.size} bytes, cached)` : r.error}`)
  }
  
  // ── Summary ──────────────────────────────────────────────────
  const all = [...dictResults, ...ankamaResults, ...frigostResults]
  const ok = all.filter(r => r.status === 'ok').length
  const skip = all.filter(r => r.status === 'skip').length
  const fail = all.filter(r => r.status === 'fail').length
  
  console.log(`\nDone: ${ok} downloaded, ${skip} cached, ${fail} failed.`)
  console.log(`Output directory: ${outputDir}`)
  
  if (fail > 0) {
    console.log('\nFailed downloads:')
    for (const r of all.filter(r => r.status === 'fail')) {
      console.log(`  ✗ ${r.name}: ${r.error}`)
    }
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
