#!/usr/bin/env node
/**
 * extract-idb.mjs — dump real game tables from the mobile Dofus Touch
 * IndexedDB LevelDB (Chrome IDB format, snappy-compressed SSTables).
 *
 * Usage:
 *   node .freebuff/extract-idb.mjs "<path>/file__0.indexeddb.leveldb" [outDir]
 *
 * The LevelDB dir holds:
 *   - *.log : write-ahead journal (WriteBatch records, NOT compressed)
 *   - *.ldb : SSTables (data blocks may be snappy-compressed)
 *
 * Chrome IndexedDB stores each table record as an object whose V8
 * serialization lives in the LevelDB value (plain, or wrapped with a blob
 * index when the record has Blob references).  Values that decode to a plain
 * object carrying a `_type` field are game table records; we group them by
 * `_type` and dump each table to `<outDir>/<Table>.json` keyed by record id.
 *
 * Large records (e.g. SoundBones, several MB) are externalized by Chrome to
 * `file__0.indexeddb.blob/<n>/<nn>/<f>` files — each one is a 15-byte header
 * (`ff 15 fe` + 12 zero bytes) followed by a full V8 serialization; those are
 * merged in from the sibling blob directory when present.
 */
import fs from 'fs'
import path from 'path'
import v8 from 'v8'

// ────────────────────────────── varint ──────────────────────────────
function readVarint(buf, pos) {
  let val = 0
  let shift = 0
  let start = pos
  while (pos < buf.length) {
    const b = buf[pos++]
    val |= (b & 0x7f) << shift
    if (!(b & 0x80)) return { val, next: pos }
    shift += 7
  }
  return { val, next: pos }
}

// ────────────────────────────── snappy ──────────────────────────────
function snappyUncompress(src) {
  let pos = 0
  const len = readVarint(src, pos)
  pos = len.next
  const out = Buffer.allocUnsafe(len.val)
  let op = 0
  while (op < out.length) {
    const tag = src[pos++]
    const type = tag & 0x03
    if (type === 0) {
      let n = (tag >> 2) + 1
      if (n > 60) {
        const nb = n - 60
        n = 0
        for (let i = 0; i < nb; i++) n |= src[pos + i] << (8 * i)
        pos += nb
      }
      src.copy(out, op, pos, pos + n)
      pos += n
      op += n
    } else {
      let n, off
      if (type === 1) {
        n = ((tag >> 2) & 0x07) + 4
        off = ((tag >> 5) << 8) | src[pos++]
      } else if (type === 2) {
        n = (tag >> 2) + 1
        off = src[pos] | (src[pos + 1] << 8)
        pos += 2
      } else {
        n = (tag >> 2) + 1
        off = src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16) | (src[pos + 3] << 24)
        pos += 4
      }
      for (let i = 0; i < n; i++) out[op + i] = out[op + i - off]
      op += n
    }
  }
  return out
}

// ────────────────────── LevelDB log (WAL) parser ──────────────────────
function* parseLog(buf) {
  // Records are packed consecutively inside 32768-byte blocks; a record never
  // crosses a block boundary (the writer pads), so we walk record-by-record
  // and stitch FIRST/MIDDLE/LAST fragments together.
  let pos = 0
  let frag = null
  while (pos + 7 <= buf.length) {
    const len = buf.readUInt16LE(pos + 4)
    const type = buf[pos + 6]
    if (len === 0 && type === 0) {
      // padding / empty tail
      pos = Math.min(buf.length, Math.floor((pos + 7) / 32768) * 32768 + 32768)
      continue
    }
    if (pos + 7 + len > buf.length) break
    const payload = buf.subarray(pos + 7, pos + 7 + len)
    if (type === 1) {
      yield* parseBatch(payload)
      frag = null
    } else if (type === 2) {
      frag = Buffer.from(payload)
    } else if (type === 3) {
      // a mid-record without a preceding first usually means a partial
      // (crash-leftover) log tail — recover by starting a fresh fragment
      frag = frag === null ? Buffer.from(payload) : Buffer.concat([frag, payload])
    } else if (type === 4) {
      frag = frag === null ? Buffer.from(payload) : Buffer.concat([frag, payload])
      yield* parseBatch(frag)
      frag = null
    }
    pos += 7 + len
  }
}

function* parseBatch(payload) {
  // LevelDB WriteBatch: sequence(8) count(4) then entries, each
  //   [type varint][keylen varint][key][vallen varint][value]
  // (type 1 = value, 0 = deletion).  No delta encoding in batches.
  if (payload.length < 12) return
  const count = payload.readUInt32LE(8)
  let p = 12
  for (let i = 0; i < count && p < payload.length; i++) {
    const type = readVarint(payload, p); p = type.next
    const klen = readVarint(payload, p); p = klen.next
    const key = payload.subarray(p, p + klen.val)
    p += klen.val
    if (p >= payload.length) break
    const vlen = readVarint(payload, p); p = vlen.next
    if (p + vlen.val > payload.length) break
    const value = payload.subarray(p, p + vlen.val)
    p += vlen.val
    yield { key, value, deleted: type.val === 0 }
  }
}

// ────────────────────── LevelDB SSTable parser ──────────────────────
// A block is [data:size][compType:1][crc32c-masked:4] with the CRC computed
// over data + the compType byte (stock LevelDB table/format.cc ReadBlock).
function parseBlockData(buf, off, size) {
  const data = buf.subarray(off, off + size)
  const type = buf[off + size]
  if (type === 0) return data
  if (type === 1) return snappyUncompress(data)
  throw new Error(`unsupported block compression type ${type}`)
}

function* blockEntries(blockData) {
  // Block layout: [entries...][restart points 4B each][numRestarts 4B].
  // Entries end where the restart array begins; without this bound we would
  // re-parse the restarts as garbage entries with bogus handles.
  let end = blockData.length
  if (blockData.length >= 4) {
    const numRestarts = blockData.readUInt32LE(blockData.length - 4)
    if (numRestarts < blockData.length / 4) end = blockData.length - 4 - 4 * numRestarts
  }
  let p = 0
  let prev = Buffer.alloc(0)
  while (p + 3 <= end) {
    const sh = readVarint(blockData, p); p = sh.next
    const nsh = readVarint(blockData, p); p = nsh.next
    const vl = readVarint(blockData, p); p = vl.next
    const kStart = p
    p += sh.val + nsh.val
    if (p + vl.val > end) return
    const value = blockData.subarray(p, p + vl.val)
    p += vl.val
    const key = Buffer.concat([prev.subarray(0, sh.val), blockData.subarray(kStart + sh.val, kStart + sh.val + nsh.val)])
    prev = key
    yield { key, value }
  }
}

function* parseSSTable(buf) {
  if (buf.length < 48) return
  const footer = buf.subarray(buf.length - 48)
  // magic check: 0xdb4775248b80fb57 little-endian
  if (footer.readUInt32LE(40) !== 0x8b80fb57 || footer.readUInt32LE(44) !== 0xdb477524) return
  let p = 0
  const metaOff = readVarint(footer, p); p = metaOff.next
  p = readVarint(footer, p).next
  const idxOff = readVarint(footer, p); p = idxOff.next
  const idxSize = readVarint(footer, p)
  if (idxOff.val + idxSize.val + 5 > buf.length) return
  let indexData
  try {
    indexData = parseBlockData(buf, idxOff.val, idxSize.val)
  } catch {
    return
  }
  for (const entry of blockEntries(indexData)) {
    // index entry value = data block handle (offset/size varints)
    const h = readVarint(entry.value, 0)
    const size = readVarint(entry.value, h.next)
    if (h.val + size.val + 5 > buf.length) continue
    let data
    try {
      data = parseBlockData(buf, h.val, size.val)
    } catch {
      continue
    }
    let n = 0
    for (const rec of blockEntries(data)) {
      yield rec
      if (++n > 50000) break
    }
  }
}

// ────────────────────── Chrome IDB value decode ──────────────────────
function tryDeserialize(buf) {
  try {
    const obj = v8.deserialize(buf)
    return obj === undefined ? null : obj
  } catch {
    return null
  }
}

// Value layouts seen in this backing store:
//  A) plain V8 serialization (starts 0xff 0x0f)
//  B) blob-index wrapper: 0x00 version, blob count, per-blob (num,size,index)
//     varints, then varint-length + V8 bytes
//  C) WAL value for blob-externalized records: [varint][15-byte blob header
//     "ff 15 fe"+12 zeros][V8 bytes]
function decodeValue(valueBuf) {
  if (valueBuf.length === 0) return undefined
  // quick gate: table records are V8-serialized objects (start 0xff 0x0f or
  // blob-index wrapper 0x00) and are at least a few dozen bytes; index/tombstone
  // entries have tiny or empty values — skip them without touching v8
  if (valueBuf.length < 16) return undefined
  if (valueBuf[0] === 0) {
    let p = 1
    const count = readVarint(valueBuf, p); p = count.next
    if (count.val > 10000) return undefined
    for (let i = 0; i < count.val; i++) {
      p = readVarint(valueBuf, p).next
      p = readVarint(valueBuf, p).next
      p = readVarint(valueBuf, p).next
    }
    const vl = readVarint(valueBuf, p); p = vl.next
    if (vl.val > 0 && p + vl.val <= valueBuf.length) {
      const obj = tryDeserialize(valueBuf.subarray(p, p + vl.val))
      if (obj !== null) return obj
    }
  }
  const direct = tryDeserialize(valueBuf)
  if (direct !== null) return direct
  // C) [varint][15-byte blob header][v8]
  const v = readVarint(valueBuf, 0)
  if (v.next + 15 < valueBuf.length) {
    const obj = tryDeserialize(valueBuf.subarray(v.next + 15))
    if (obj !== null) return obj
  }
  return tryDeserialize(valueBuf.subarray(15)) ?? undefined
}

// Internal key → (storeId, recordKey).  Chrome IDB user key:
//   [dbName UTF-16LE][0x00][storeId varint][indexId varint][record key...]
function decodeUserKey(key) {
  // find the 0x00 that terminates the UTF-16LE db name (odd offset)
  let i = 0
  for (; i + 1 < key.length; i += 2) {
    if (key[i] === 0 && key[i + 1] === 0) { i += 2; break }
  }
  if (i >= key.length) return { storeId: -1, recordKey: Buffer.alloc(0) }
  const storeId = readVarint(key, i); i = storeId.next
  const indexId = readVarint(key, i); i = indexId.next
  return { storeId: storeId.val, indexId: indexId.val, recordKey: key.subarray(i) }
}

// ────────────────────────────── main ──────────────────────────────
function main() {
  const leveldbDir = process.argv[2]
  const outDir = process.argv[3] || path.join(path.dirname(leveldbDir), 'extracted-tables')
  if (!leveldbDir || !fs.existsSync(leveldbDir)) {
    console.error('usage: node extract-idb.mjs <indexeddb.leveldb dir> [outDir]')
    process.exit(1)
  }
  fs.mkdirSync(outDir, { recursive: true })

  // table name → Map(id → record)
  const tables = new Map()
  const storeToType = new Map()
  let parsed = 0
  let untyped = 0
  let errors = 0

  const record = (type, id, obj) => {
    let t = tables.get(type)
    if (!t) { t = new Map(); tables.set(type, t) }
    if (!t.has(id)) t.set(id, obj)
  }

  for (const f of fs.readdirSync(leveldbDir)) {
    if (!f.endsWith('.log') && !f.endsWith('.ldb')) continue
    const buf = fs.readFileSync(path.join(leveldbDir, f))
    let iter
    try {
      iter = f.endsWith('.log') ? parseLog(buf) : parseSSTable(buf)
    } catch (e) {
      console.warn(`skip ${f}: ${e.message}`)
      continue
    }
    for (const { key, value } of iter) {
      const obj = decodeValue(value)
      if (obj === undefined) { errors++; continue }
      if (typeof obj !== 'object' || obj === null || typeof obj._type !== 'string') { untyped++; continue }
      parsed++
      const { storeId } = decodeUserKey(key)
      storeToType.set(storeId, obj._type)
      const id = obj.id ?? obj.objectId ?? obj[Object.keys(obj).find((k) => k !== '_type' && typeof obj[k] === 'number') ?? '_type']
      record(obj._type, String(id ?? obj._type + '_' + parsed), obj)
    }
  }

  // Merge blob-file records (15-byte header + V8 serialization)
  const blobDir = path.join(path.dirname(leveldbDir), path.basename(leveldbDir).replace('.leveldb', '.blob'))
  if (fs.existsSync(blobDir)) {
    const walk = (d) => {
      for (const e of fs.readdirSync(d)) {
        const p = path.join(d, e)
        const st = fs.statSync(p)
        if (st.isDirectory()) walk(p)
        else {
          try {
            const raw = fs.readFileSync(p)
            const obj = v8.deserialize(raw.subarray(15))
            if (obj && typeof obj === 'object' && typeof obj._type === 'string') {
              record(obj._type, String(obj.id ?? obj._type + '_blob'), obj)
            }
          } catch { /* skip */ }
        }
      }
    }
    walk(blobDir)
  }

  console.log(`parsed records: ${parsed}  (untyped: ${untyped}, decode errors: ${errors})`)
  console.log(`stores: ${[...storeToType.entries()].map(([s, t]) => `${s}=${t}`).join(', ')}`)

  const wanted = new Set(['Item', 'Items', 'Appearances', 'MountBones', 'SkinMappings'])
  const summary = []
  for (const [type, map] of [...tables.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const out = {}
    for (const [id, obj] of map) out[id] = obj
    const file = path.join(outDir, `${type}.json`)
    fs.writeFileSync(file, JSON.stringify(out))
    summary.push(`${type}: ${map.size}`)
  }
  console.log(summary.join('\n'))
  console.log('outDir:', outDir)
  const missing = [...wanted].filter((w) => !tables.has(w))
  const present = [...wanted].filter((w) => tables.has(w))
  if (present.length) console.log('wanted present: ' + present.join(', '))
  if (missing.length) {
    console.log('wanted MISSING from this backing store (not cached client-side): ' + missing.join(', '))
    console.log('  → fetch these from the official Touch data endpoint (the emulator\'s data/ downloader) instead')
  }
}

main()
