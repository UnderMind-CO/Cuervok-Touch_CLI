// Census: coverage of the captured item-appearance maps (ItemSkinMap.cs) vs
// the full catalog (data/item-gids.json).  Parses the C# dictionaries with a
// line-tolerant regex instead of executing C#.
//
// Usage: node scripts/skin-census.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')
const CS = path.join(ROOT, 'TouchEmu.Server.Game', 'Managers', 'ItemSkinMap.cs')

function parseCsMaps(csText) {
  // Sections start with "public static readonly Dictionary<int, """ + optional int[] values +
  // mount scales (Dictionary<int,int>).  We walk braces and capture entries
  // like "{ 123, 456 }" / "{ 123, new[] { 456, 789 } }" between them.
  const mapStartRe = /(public\s+static\s+(?:readonly\s+)?([\w<>.,\s]+?)Dictionary<[^>]+>\s+(\w+)\s*=)/g
  const maps = {}
  let m
  while ((m = mapStartRe.exec(csText))) {
    const name = m[3]
    // find the closing "};" of the initializer
    const open = csText.indexOf('{', m.index + m[0].length)
    let depth = 0
    let i = open
    while (i < csText.length) {
      const c = csText[i]
      if (c === '{') depth++
      else if (c === '}') { depth--; if (depth === 0) break }
      i++
    }
    const body = csText.slice(open, i)
    const ents = {}
    const entRe = /\{\s*(\d+)\s*,\s*(?:new\[\]\s*\{([^}]*)\}|(\d+)\s*)\}/g
    let e
    while ((e = entRe.exec(body))) {
      if (e[2] !== undefined) ents[Number(e[1])] = e[2].split(',').map(s => Number(s.trim())).filter(Boolean)
      else ents[Number(e[1])] = Number(e[3])
    }
    maps[name] = ents
  }
  return maps
}

const csText = fs.readFileSync(CS, 'utf8')
const maps = parseCsMaps(csText)
const knownGids = new Map() // gid -> { skins, petBones, mountBones }
let skinsCount = 0
let petCount = 0
let mountCount = 0
for (const [name, ents] of Object.entries(maps)) {
  for (const [gid, v] of Object.entries(ents)) {
    const row = knownGids.get(Number(gid)) || {}
    if (Array.isArray(v)) { row.skins = v; skinsCount++ }
    else if (/Pet/i.test(name)) { row.petBones = v; petCount++ }
    else if (/Mount/i.test(name)) { row.mountBones = v; mountCount++ }
    knownGids.set(Number(gid), row)
  }
}

// Catalog + item types
const gids = JSON.parse(fs.readFileSync(path.join(DATA, 'item-gids.json'), 'utf8'))
// Items.json localized variants; prefer #en fallback es/fr
function loadItems() {
  for (const f of ['Items#en.json', 'Items#en.json', 'Items#es.json']) {
    const p = path.join(DATA, f)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  }
  return null
}
const items = loadItems() || {}
const epicEq = new Set()
const epicAll = new Set()
for (const [id, it] of Object.entries(items)) {
  epicAll.add(Number(id))
  if (it && Array.isArray(it.possiblePositions) && it.possiblePositions.length > 0) epicEq.add(Number(id))
}

const missingEquip = []
const coveredEquip = []
for (const gid of epicEq) {
  if (knownGids.has(gid)) coveredEquip.push(gid)
  else missingEquip.push(gid)
}

const summary = {
  catalogGids: gids.length,
  itemsFile: Object.keys(items).length,
  equippableItems: epicEq.size,
  compiledMaps: { skins: skinsCount, petBones: petCount, mountBones: mountCount },
  coveredEquippable: coveredEquip.length,
  missingEquippable: missingEquip.length,
  missingByType: {},
  previewCost: { ugAt250ms: Math.round((summary?.missingEquippable || 0) * 0.25 / 60), min: Math.round((missingEquip.length * 0.25) / 60) },
}
for (const gid of missingEquip) {
  const t = items[gid]?.typeId ?? -1
  summary.missingByType[t] = (summary.missingByType[t] || 0) + 1
}

fs.writeFileSync(path.join(DATA, 'skin-census.json'), JSON.stringify(
  { summary, coveredEquip, missingEquip: missingEquip.slice(0, 20000) }, null, 2))
console.log(JSON.stringify(summary, null, 2))
