/**
 * Admin API Routes
 * ================
 * REST API for managing game content via the database.
 * Mounted on the existing Hono server at /admin/*
 *
 * Features:
 *   - CRUD for dungeons, anomalies, map access rules, zone bonuses
 *   - Data migration from JSON to DB
 *   - Backup/restore
 *   - SQL query executor for analysis
 *
 * Security: Loopback-only (127.0.0.1) — no auth needed for local emulator.
 */

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { BrowserWindow } from 'electron'

// ═══════════════════════════════════════════════════════════════════
// Database (SQLite via better-sqlite3)
// ═══════════════════════════════════════════════════════════════════

let db: any = null

function getDb(dbPath: string) {
  if (db) return db
  try {
    const Database = require('better-sqlite3')
    db = new Database(dbPath, { readonly: false })
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    return db
  } catch (e) {
    console.error('Failed to load better-sqlite3:', e)
    // Fallback: use the sqlite3 CLI
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// Helper: Execute SQL via CLI (fallback when better-sqlite3 unavailable)
// ═══════════════════════════════════════════════════════════════════

function execSqlite(dbPath: string, sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sqlite3', [dbPath, '-json', sql], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => stdout += d)
    proc.stderr.on('data', (d) => stderr += d)
    proc.on('close', (code) => {
      if (code !== 0 && stderr) reject(new Error(stderr))
      else resolve(stdout)
    })
  })
}

function execSqliteSimple(dbPath: string, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sqlite3', [dbPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    proc.stdin.write(sql)
    proc.stdin.end()
    let stderr = ''
    proc.stderr.on('data', (d) => stderr += d)
    proc.on('close', (code) => {
      if (code !== 0 && stderr) reject(new Error(stderr))
      else resolve()
    })
  })
}

// ═══════════════════════════════════════════════════════════════════
// Create Admin Router
// ═══════════════════════════════════════════════════════════════════

export function createAdminRouter(dbPath: string, getGameWindows?: () => any[]) {
  const app = new Hono()

  // ─── Dashboard ────────────────────────────────────────────────
  app.get('/dashboard', async (c) => {
    const queries = [
      { name: 'dungeons', sql: 'SELECT COUNT(*) as count FROM dungeons WHERE is_enabled = 1' },
      { name: 'anomalies', sql: 'SELECT COUNT(*) as count FROM temporal_anomalies WHERE status = "active"' },
      { name: 'map_rules', sql: 'SELECT COUNT(*) as count FROM map_access_rules WHERE is_enabled = 1' },
      { name: 'zone_bonuses', sql: 'SELECT COUNT(*) as count FROM zone_bonuses WHERE bonus_pct > 0' },
      { name: 'events', sql: 'SELECT COUNT(*) as count FROM map_events WHERE is_active = 1' },
    ]

    const results: any = {}
    for (const q of queries) {
      try {
        const rows = await queryJson(dbPath, q.sql)
        results[q.name] = rows[0]?.count ?? 0
      } catch {
        results[q.name] = 0
      }
    }

    return c.json(results)
  })

  // ─── Dungeons CRUD ────────────────────────────────────────────
  app.get('/dungeons', async (c) => {
    const rows = await queryJson(dbPath,
      'SELECT * FROM dungeons ORDER BY optimal_level, name'
    )
    return c.json(rows)
  })

  app.get('/dungeons/:id', async (c) => {
    const id = c.req.param('id')
    const rows = await queryJson(dbPath,
      `SELECT * FROM dungeons WHERE id = ${Number(id)}`
    )
    if (!rows.length) return c.json({ error: 'Not found' }, 404)
    
    // Get dungeon maps
    const maps = await queryJson(dbPath,
      `SELECT * FROM dungeon_maps WHERE dungeon_id = ${Number(id)} ORDER BY map_order`
    )
    return c.json({ ...rows[0], maps })
  })

  app.put('/dungeons/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    
    const allowed = ['is_enabled', 'min_level', 'max_level', 'required_quest_id', 
                     'required_achievement_id', 'max_players', 'allow_recursion', 'notes']
    const updates: string[] = []
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates.push(`${key} = ${sqlValue(body[key])}`)
      }
    }
    updates.push('updated_at = CURRENT_TIMESTAMP')
    
    await execSqliteSimple(dbPath,
      `UPDATE dungeons SET ${updates.join(', ')} WHERE id = ${id}`
    )
    return c.json({ ok: true })
  })

  // ─── Anomalies CRUD ───────────────────────────────────────────
  app.get('/anomalies', async (c) => {
    const status = c.req.query('status') || 'active'
    const rows = await queryJson(dbPath,
      `SELECT a.*, z.bonus_pct as zone_bonus
       FROM temporal_anomalies a
       LEFT JOIN zone_bonuses z ON a.sub_area_id = z.sub_area_id
       WHERE a.status = '${status}'
       ORDER BY a.spawned_at DESC`
    )
    return c.json(rows)
  })

  app.post('/anomalies', async (c) => {
    const body = await c.req.json()
    const { sub_area_id, zaap_map_id, guardian_monster_id, elixir_level = 0 } = body
    
    await execSqliteSimple(dbPath,
      `INSERT INTO temporal_anomalies (sub_area_id, zaap_map_id, guardian_monster_id, elixir_level)
       VALUES (${sub_area_id}, ${zaap_map_id}, ${guardian_monster_id}, ${elixir_level})`
    )
    return c.json({ ok: true })
  })

  app.put('/anomalies/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    
    const allowed = ['status', 'closes_at', 'elixir_level', 'maps_cleared', 'guardian_defeated']
    const updates: string[] = []
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates.push(`${key} = ${sqlValue(body[key])}`)
      }
    }
    
    if (updates.length) {
      await execSqliteSimple(dbPath,
        `UPDATE temporal_anomalies SET ${updates.join(', ')} WHERE id = ${id}`
      )
    }
    return c.json({ ok: true })
  })

  app.delete('/anomalies/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await execSqliteSimple(dbPath,
      `DELETE FROM temporal_anomalies WHERE id = ${id}`
    )
    return c.json({ ok: true })
  })

  // ─── Zone Bonuses ─────────────────────────────────────────────
  app.get('/zone-bonuses', async (c) => {
    const rows = await queryJson(dbPath,
      `SELECT * FROM zone_bonuses WHERE bonus_pct != 0 ORDER BY bonus_pct DESC`
    )
    return c.json(rows)
  })

  app.put('/zone-bonuses/:subAreaId', async (c) => {
    const subAreaId = Number(c.req.param('subAreaId'))
    const body = await c.req.json()
    
    await execSqliteSimple(dbPath,
      `UPDATE zone_bonuses 
       SET bonus_pct = ${body.bonus_pct ?? 0}, 
           fight_count = ${body.fight_count ?? 0},
           last_updated = CURRENT_TIMESTAMP,
           is_anomaly_eligible = ${body.bonus_pct >= 70 ? 'TRUE' : 'FALSE'}
       WHERE sub_area_id = ${subAreaId}`
    )
    return c.json({ ok: true })
  })

  // ─── Map Access Rules CRUD ────────────────────────────────────
  app.get('/map-rules', async (c) => {
    const mapId = c.req.query('map_id')
    let sql = 'SELECT * FROM map_access_rules'
    if (mapId) sql += ` WHERE map_id = ${Number(mapId)}`
    sql += ' ORDER BY map_id, priority DESC'
    
    const rows = await queryJson(dbPath, sql)
    return c.json(rows)
  })

  app.post('/map-rules', async (c) => {
    const body = await c.req.json()
    const { map_id, rule_type, min_level, max_level, required_quest_id,
            required_achievement_id, required_item_id, required_subscription,
            event_name, deny_message, redirect_map_id, priority = 0, notes } = body
    
    await execSqliteSimple(dbPath,
      `INSERT INTO map_access_rules 
       (map_id, rule_type, min_level, max_level, required_quest_id,
        required_achievement_id, required_item_id, required_subscription,
        event_name, deny_message, redirect_map_id, priority, notes)
       VALUES (${map_id}, '${rule_type}', ${sqlNullable(min_level)}, ${sqlNullable(max_level)},
               ${sqlNullable(required_quest_id)}, ${sqlNullable(required_achievement_id)},
               ${sqlNullable(required_item_id)}, ${sqlNullable(required_subscription)},
               ${sqlNullable(event_name)}, ${sqlNullable(deny_message)},
               ${sqlNullable(redirect_map_id)}, ${priority}, ${sqlNullable(notes)})`
    )
    return c.json({ ok: true })
  })

  app.delete('/map-rules/:id', async (c) => {
    const id = Number(c.req.param('id'))
    await execSqliteSimple(dbPath,
      `DELETE FROM map_access_rules WHERE id = ${id}`
    )
    return c.json({ ok: true })
  })

  // ─── Events CRUD ──────────────────────────────────────────────
  app.get('/events', async (c) => {
    const rows = await queryJson(dbPath,
      'SELECT * FROM map_events ORDER BY start_date DESC'
    )
    return c.json(rows)
  })

  app.post('/events', async (c) => {
    const body = await c.req.json()
    const { event_name, display_name, start_date, end_date,
            affected_sub_area_ids, affected_map_ids, bonus_pct = 0,
            min_level, required_achievement_id } = body
    
    await execSqliteSimple(dbPath,
      `INSERT INTO map_events 
       (event_name, display_name, start_date, end_date,
        affected_sub_area_ids, affected_map_ids, bonus_pct,
        min_level, required_achievement_id)
       VALUES ('${event_name}', '${display_name}', '${start_date}', '${end_date}',
               '${affected_sub_area_ids || '[]'}', '${affected_map_ids || '[]'}',
               ${bonus_pct}, ${sqlNullable(min_level)}, ${sqlNullable(required_achievement_id)})`
    )
    return c.json({ ok: true })
  })

  app.put('/events/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    
    const allowed = ['is_active', 'bonus_pct', 'end_date', 'spawn_overrides']
    const updates: string[] = []
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates.push(`${key} = ${sqlValue(body[key])}`)
      }
    }
    
    if (updates.length) {
      await execSqliteSimple(dbPath,
        `UPDATE map_events SET ${updates.join(', ')} WHERE id = ${id}`
      )
    }
    return c.json({ ok: true })
  })

  // ─── Guardians ────────────────────────────────────────────────
  app.get('/guardians', async (c) => {
    const rows = await queryJson(dbPath,
      'SELECT * FROM anomaly_guardians ORDER BY spawn_weight DESC'
    )
    return c.json(rows)
  })

  app.put('/guardians/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    
    const allowed = ['is_enabled', 'spawn_weight', 'time_loop_drop_rate', 'fragment_drop_rate']
    const updates: string[] = []
    for (const key of allowed) {
      if (body[key] !== undefined) {
        updates.push(`${key} = ${sqlValue(body[key])}`)
      }
    }
    
    if (updates.length) {
      await execSqliteSimple(dbPath,
        `UPDATE anomaly_guardians SET ${updates.join(', ')} WHERE id = ${id}`
      )
    }
    return c.json({ ok: true })
  })

  // ─── Data Migration ───────────────────────────────────────────
  app.post('/migrate/json-to-db', async (c) => {
    const body = await c.req.json()
    const { source, table } = body  // source = 'dungeons', 'subareas', etc.
    
    const dataDir = path.join(process.cwd(), 'data', 'official', 'ankama')
    
    if (source === 'dungeons') {
      const filePath = path.join(dataDir, 'Dungeons.json')
      if (!fs.existsSync(filePath)) return c.json({ error: 'Dungeons.json not found' }, 404)
      
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      let count = 0
      
      for (const [id, d] of Object.entries(data) as any[]) {
        const maps = JSON.stringify(d.mapIds || [])
        await execSqliteSimple(dbPath,
          `INSERT OR REPLACE INTO dungeons 
           (id, name, optimal_level, entrance_map_id, exit_map_id, dungeon_key_item_id, dungeon_type)
           VALUES (${id}, '${(d.nameId || '').replace(/'/g, "''")}', ${d.optimalPlayerLevel || 0}, 
                   ${d.entranceMapId || 0}, ${d.exitMapId || 0}, ${d.dungeonKey || 'NULL'}, ${d.dungeonType || 1})`
        )
        
        // Insert map connections
        await execSqliteSimple(dbPath, `DELETE FROM dungeon_maps WHERE dungeon_id = ${id}`)
        if (d.mapIds) {
          for (let i = 0; i < d.mapIds.length; i++) {
            await execSqliteSimple(dbPath,
              `INSERT INTO dungeon_maps (dungeon_id, map_id, map_order) VALUES (${id}, ${d.mapIds[i]}, ${i})`
            )
          }
        }
        count++
      }
      return c.json({ ok: true, migrated: count, source: 'Dungeons.json' })
    }
    
    return c.json({ error: 'Unknown source. Available: dungeons' }, 400)
  })

  // ─── Backup / Restore ─────────────────────────────────────────
  app.post('/backup', async (c) => {
    const backupDir = path.join(path.dirname(dbPath), 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(backupDir, `cuervok-${timestamp}.db`)
    
    // Use sqlite3 .backup command
    try {
      await execSqliteSimple(dbPath, `.backup '${backupPath}'`)
      const stats = fs.statSync(backupPath)
      return c.json({ ok: true, path: backupPath, size: stats.size })
    } catch (e: any) {
      // Fallback: just copy the file
      fs.copyFileSync(dbPath, backupPath)
      const stats = fs.statSync(backupPath)
      return c.json({ ok: true, path: backupPath, size: stats.size, method: 'copy' })
    }
  })

  app.get('/backups', async (c) => {
    const backupDir = path.join(path.dirname(dbPath), 'backups')
    if (!fs.existsSync(backupDir)) return c.json([])
    
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(backupDir, f),
        size: fs.statSync(path.join(backupDir, f)).size,
        created: fs.statSync(path.join(backupDir, f)).birthtime
      }))
      .sort((a, b) => b.created.getTime() - a.created.getTime())
    
    return c.json(files)
  })

  // ─── SQL Query (for analysis) ─────────────────────────────────
  app.post('/query', async (c) => {
    const body = await c.req.json()
    const { sql } = body
    
    // Safety: only allow SELECT queries
    const trimmed = sql.trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH') && !trimmed.startsWith('PRAGMA')) {
      return c.json({ error: 'Only SELECT queries allowed' }, 400)
    }
    
    try {
      const rows = await queryJson(dbPath, sql)
      return c.json({ rows, count: rows.length })
    } catch (e: any) {
      return c.json({ error: e.message }, 400)
    }
  })

  // ─── Schema Info ──────────────────────────────────────────────
  app.get('/schema', async (c) => {
    const tables = await queryJson(dbPath,
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    
    const result: any = {}
    for (const t of tables) {
      const columns = await queryJson(dbPath,
        `PRAGMA table_info(${t.name})`
      )
      const count = await queryJson(dbPath,
        `SELECT COUNT(*) as count FROM ${t.name}`
      )
      result[t.name] = {
        columns: columns.map((c: any) => `${c.name} (${c.type})`),
        rowCount: count[0]?.count ?? 0
      }
    }
    
    return c.json(result)
  })

  // ─── Character Render (uses game's WebGL renderer) ──────────────
  app.post('/character-render', async (c) => {
    try {
      const body = await c.req.json()
      const { lookString, direction = 4, width = 192, height = 192 } = body
      if (!lookString) return c.json({ error: 'lookString required' }, 400)

      // Find an active game window
      const gameWindows = getGameWindows?.() || BrowserWindow.getAllWindows().filter((w: any) => !w.isDestroyed() && w.webContents.getURL().includes('game'))
      if (!gameWindows.length) return c.json({ error: 'No game window running' }, 503)

      const win = gameWindows[0]
      const dataUrl: string | null = await win.webContents.executeJavaScript(`
        (function() {
          try {
            const gw = window;
            if (!gw.CharacterDisplay) return null;

            // Parse look string: {bonesId|skins|colors|scale}
            const m = ${JSON.stringify(lookString)}.match(/\{([^}]+)\}/);
            if (!m) return null;
            const parts = m[1].split('|');
            const bonesId = parseInt(parts[0]) || 1;
            const skinIds = parts[1] ? parts[1].split(',').map(Number).filter(Boolean) : [];
            const colorParts = parts[2] ? parts[2].split(',') : [];
            const indexedColors = colorParts.map(p => {
              const [idx, val] = p.split('=');
              if (val && val.startsWith('#')) {
                const hex = val.replace('#','');
                const n = parseInt(hex, 16);
                return ((parseInt(idx) & 0x0F) << 24) | (n & 0x00FFFFFF);
              }
              return ((parseInt(idx) & 0x0F) << 24) | (parseInt(val) & 0x00FFFFFF);
            });
            const scale = parseInt(parts[3]) || 100;

            const look = {
              _type: 'EntityLook',
              bonesId,
              skins: skinIds,
              indexedColors,
              scales: [scale],
              subentities: []
            };

            const cd = new gw.CharacterDisplay({ scale: 'fitin' });
            cd.setLook(look, {
              riderOnly: true,
              direction: ${direction},
              animation: 'AnimArtwork',
              boneType: 'timeline/',
              skinType: 'timeline/'
            });
            cd.rootElement.style.cssText = 'position:absolute;left:-9999px;width:${width}px;height:${height}px;';
            gw.document.body.appendChild(cd.rootElement);

            return new Promise((resolve) => {
              let attempts = 0;
              const check = () => {
                const canvas = cd.canvas?.rootElement || cd.rootElement?.querySelector('canvas');
                if (canvas && canvas.width > 0 && canvas.height > 0) {
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    // Find opaque bounds
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const d = imgData.data;
                    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
                    for (let y = 0; y < canvas.height; y++) {
                      for (let x = 0; x < canvas.width; x++) {
                        if (d[(y * canvas.width + x) * 4 + 3] > 10) {
                          if (x < minX) minX = x; if (x > maxX) maxX = x;
                          if (y < minY) minY = y; if (y > maxY) maxY = y;
                        }
                      }
                    }
                    if (maxX > minX && maxY > minY) {
                      const pad = 4;
                      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
                      maxX = Math.min(canvas.width - 1, maxX + pad); maxY = Math.min(canvas.height - 1, maxY + pad);
                      const tmp = gw.document.createElement('canvas');
                      tmp.width = maxX - minX + 1; tmp.height = maxY - minY + 1;
                      tmp.getContext('2d').drawImage(canvas, minX, minY, tmp.width, tmp.height, 0, 0, tmp.width, tmp.height);
                      cd.rootElement.remove();
                      resolve(tmp.toDataURL('image/png'));
                      return;
                    }
                  }
                }
                cd.rootElement.remove();
                resolve(null);
              };
              setTimeout(check, 1500);
            });
          } catch(e) { return null; }
        })()
      `, true)

      if (!dataUrl) return c.json({ error: 'Render failed - game renderer not ready' }, 500)
      return c.json({ dataUrl })
    } catch (err: any) {
      return c.json({ error: err.message }, 500)
    }
  })

  return app
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function sqlValue(v: any): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `'${String(v).replace(/'/g, "''")}'`
}

function sqlNullable(v: any): string {
  if (v === null || v === undefined) return 'NULL'
  return sqlValue(v)
}

async function queryJson(dbPath: string, sql: string): Promise<any[]> {
  try {
    const result = await execSqlite(dbPath, sql)
    return result ? JSON.parse(result) : []
  } catch {
    return []
  }
}
