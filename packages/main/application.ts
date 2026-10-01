import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import crypto from 'crypto'
import { Server } from 'http'
import { AddressInfo } from 'net'
import { join } from 'path'
import fs from 'fs'
import ElectronStore from 'electron-store'
import { IPCEvents, GameContext, NativeNotificationPayload, AppUpdateStatus, AuthSession } from '@cuervok/shared'
import { get, DTO_NEWS_PATH } from './constants'
import { GameWindow } from './windows/game-window'
import { existsSync } from 'node:fs'
import { UpdaterWindow } from './windows/updater-window'
import { AppUpdater, GameUpdater } from './updater'
import { verificationOnLaunch } from './updater/script-integrity'
import { handleAssetRequest, syncAssetVersions, getOverrideRoots, getOverrideWriteRoot } from './updater/asset-proxy'
import { logger } from './logger'
import { emulatorSupervisor, waitForPort } from './emulator-supervisor'
import { platform } from 'os'
import { connectDiscordRpc, setDiscordPresence, clearDiscordPresence, type DiscordPresenceState } from './discord-rpc'

const MIME_TYPES: Record<string, string> = {
  html: 'text/html',
  js: 'application/javascript',
  css: 'text/css',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  webp: 'image/webp'
}

/** Recursively collects relative file paths under a directory. */
function walkDir(dir: string, prefix: string, out: Set<string>) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) walkDir(join(dir, entry.name), rel, out)
    else out.add(rel)
  }
}

function createStaticHandler(basePath: string, urlPrefix: string) {
  // Ensure basePath uses OS separators so path.join result matches the prefix check
  const normalizedBase = join(basePath)

  return async (c: Context) => {
    const reqPath = c.req.path.slice(urlPrefix.length)
    const filePath = join(normalizedBase, decodeURIComponent(reqPath))

    if (!filePath.startsWith(normalizedBase)) {
      return c.text('Forbidden', 403)
    }

    try {
      const stat = fs.statSync(filePath)
      if (!stat.isFile()) return c.text('Not Found', 404)
    } catch {
      return c.text('Not Found', 404)
    }

    const content = fs.readFileSync(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''

    return new Response(content, {
      headers: {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

type StoreSchema = Record<string, unknown>

// Fixed local port: must match assetsUrl/uiUrl in the emulator's data/config.json
const LOCAL_SERVER_PORT = 8765

export class Application {
  private static _instance: Application | null = null
  private _gameWindow: GameWindow | null = null
  private _updaterWindow: UpdaterWindow | null = null
  private _appUpdater: AppUpdater | null = null
  private readonly _server: Server
  private readonly _hash: string
  private _buildVersion = ''

  /// Fallos de la última verificación de integridad del bundle (null = OK).
  /// Expuesto por IPC para que la UI pueda avisar al usuario.
  private _gameIntegrityFailures: string[] | null = null
  private _appVersion = ''
  private _store: ElectronStore<StoreSchema>
  private _startupComplete = false

  static async init() {
    if (Application._instance) throw new Error('Application already initialized')

    const hash = crypto.createHash('sha256').update(app.getName() + app.getVersion()).digest('hex')

    const honoApp = new Hono()

    honoApp.use('*', async (c, next) => {
      await next()
      c.res.headers.set('Access-Control-Allow-Origin', '*')
    })

    // ─── Web-retro auth proxy ──────────────────────────────────
    // Proxies /api/web/* → the web-retro PHP backend (port 8080).
    // The login form authenticates against the web platform FIRST,
    // then calls the DofEmu HAAPI for the game API key.
    const WEBRETRO_BASE = process.env.WEBRETRO_BASE || 'http://localhost:8080'
    honoApp.all('/api/web/*', async (c) => {
      const targetPath = c.req.path.replace('/api/web', '/api')
      const targetUrl = `${WEBRETRO_BASE}${targetPath}${new URL(c.req.url).search}`
      try {
        const init: RequestInit = {
          method: c.req.method,
          headers: { ...Object.fromEntries(c.req.raw.headers) },
        }
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
          init.body = c.req.raw.body
        }
        const resp = await fetch(targetUrl, init)
        const respHeaders: Record<string, string> = {}
        resp.headers.forEach((v, k) => { respHeaders[k] = v })
        return new Response(resp.body, { status: resp.status, headers: respHeaders })
      } catch (err: any) {
        logger.error(`Web-retro proxy error: ${err.message}`)
        return c.json({ error: 'Web platform not reachable', detail: err.message }, 502)
      }
    })

    // ─── HAAPI proxy to DofEmu emulator ────────────────────────
    // The login form and game scripts need to reach the emulator's
    // HAAPI endpoints. By proxying through this server the frontend
    // never has to hard-code the emulator port.
    const DOFEMU_BASE = process.env.DOFEMU_BASE || 'http://localhost:3000'

    honoApp.get('/api/haapi/Ankama/v5/Cms/Items/Get', async (c) => {
      // CMS news data is owned by the emulator, not by the client build.
      // If the packaged client still ships its own data/news.json, ignore it
      // so players cannot swap in a local file and change news/changelogs.
      if (existsSync(DTO_NEWS_PATH)) {
        logger.info('[HAAPI] Ignoring bundled client-side data/news.json for CMS — server owns news/changelogs')
      }

      const targetPath = c.req.path
      const targetUrl = `${DOFEMU_BASE}${targetPath}${new URL(c.req.url).search}`
      try {
        const init: RequestInit = {
          method: c.req.method,
          headers: { ...Object.fromEntries(c.req.raw.headers) },
        }
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
          init.body = c.req.raw.body
        }
        const resp = await fetch(targetUrl, init)
        const respHeaders: Record<string, string> = {}
        resp.headers.forEach((v, k) => { respHeaders[k] = v })

        // Forum/CMS news is server-owned by the emulator. Tag responses so the
        // client knows to ignore any local data/news.json and always refresh from
        // the emulator (important once this builds are deployed to more users).
        const bodyText = await resp.text()
        respHeaders['X-Emulator-Serves-News'] = 'true'
        try {
          const parsed = JSON.parse(bodyText)
          if (Array.isArray(parsed)) {
            respHeaders['X-Emulator-Serves-News-Count'] = String(parsed.length)
          } else if (parsed && typeof parsed === 'object') {
            respHeaders['X-Emulator-Serves-News-Id'] = String((parsed as any).id ?? (parsed as any).topic_id ?? '')
          }
        } catch {}
        return new Response(bodyText, { status: resp.status, headers: respHeaders })
      } catch (err: any) {
        logger.error(`HAAPI proxy error: ${err.message}`)
        return c.json({ error: 'DofEmu emulator not reachable', detail: err.message }, 502)
      }
    })

    honoApp.all('/api/haapi/*', async (c) => {
      const targetPath = c.req.path // e.g. /api/haapi/Ankama/v5/Api/CreateApiKey
      const targetUrl = `${DOFEMU_BASE}${targetPath}${new URL(c.req.url).search}`
      try {
        const init: RequestInit = {
          method: c.req.method,
          headers: { ...Object.fromEntries(c.req.raw.headers) },
        }
        if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
          init.body = c.req.raw.body
        }
        const resp = await fetch(targetUrl, init)
        const respHeaders: Record<string, string> = {}
        resp.headers.forEach((v, k) => { respHeaders[k] = v })

        // Forum/CMS news is server-owned by the emulator. Tag responses so the
        // client knows to ignore any local data/news.json and always refresh from
        // the emulator (important once this builds are deployed to more users).
        if (targetPath.includes('Cms/Items/Get') || targetPath.includes('getForumPostsList') || targetPath.includes('getForumTopicsList')) {
          const bodyText = await resp.text()
          respHeaders['X-Emulator-Serves-News'] = 'true'
          try {
            const parsed = JSON.parse(bodyText)
            if (Array.isArray(parsed)) {
              respHeaders['X-Emulator-Serves-News-Count'] = String(parsed.length)
            } else if (parsed && typeof parsed === 'object') {
              respHeaders['X-Emulator-Serves-News-Id'] = String((parsed as any).id ?? (parsed as any).topic_id ?? '')
            }
          } catch {}
          return new Response(bodyText, { status: resp.status, headers: respHeaders })
        }

        return new Response(resp.body, { status: resp.status, headers: respHeaders })
      } catch (err: any) {
        logger.error(`HAAPI proxy error: ${err.message}`)
        return c.json({ error: 'DofEmu emulator not reachable', detail: err.message }, 502)
      }
    })

    // ─── Login page for native game launcher ──────────────────
    // The game's "JUGAR / CUENTA ANKAMA" button opens
    // http://localhost:3000/login/ankama?... which the emulator doesn't serve.
    // We intercept that URL (see game-window.ts request interceptor) and
    // redirect to this route, which renders a styled login form. On submit it
    // calls the emulator's HAAPI CreateApiKey endpoint and redirects back to
    // the game via the dofustouch:// custom scheme.
    honoApp.get('/login/ankama', (c) => {
      const params = new URL(c.req.url).searchParams
      const redirectUri = params.get('redirect_uri') || 'dofustouch://authorized'
      const clientId = params.get('client_id') || '18'
      const originTracker = params.get('origin_tracker') || ''
      const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cuervok — Iniciar Sesión</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:#0a0a0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;
    min-height:100vh}
  .card{width:380px;padding:40px 32px;border-radius:12px;
    background:linear-gradient(180deg,rgba(20,20,30,0.95),rgba(12,12,18,0.98));
    border:1px solid rgba(201,162,77,0.15);box-shadow:0 24px 70px rgba(0,0,0,0.5)}
  .title{font-size:22px;font-weight:700;color:#e8e0d0;text-align:center;margin-bottom:4px}
  .subtitle{font-size:13px;color:rgba(255,255,255,0.35);text-align:center;margin-bottom:28px}
  .field{position:relative;margin-bottom:14px}
  .field input{width:100%;padding:12px 14px 12px 38px;border-radius:8px;
    border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);
    color:#e0e0e0;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s}
  .field input:focus{border-color:rgba(201,162,77,0.5);box-shadow:0 0 0 2px rgba(201,162,77,0.1)}
  .field .icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);
    color:rgba(255,255,255,0.25);pointer-events:none;font-size:16px}
  .btn{width:100%;padding:12px 0;border:none;border-radius:8px;font-size:15px;font-weight:600;
    cursor:pointer;background:linear-gradient(180deg,#dbb867,#c9a24d 50%,#b8913a);
    color:#1a1510;letter-spacing:.02em;transition:opacity .2s,transform .1s;margin-top:8px}
  .btn:hover{opacity:.9}
  .btn:active{transform:scale(.98)}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .error{width:100%;padding:10px 14px;border-radius:8px;background:rgba(255,68,68,0.1);
    border:1px solid rgba(255,68,68,0.25);color:#ff4444;font-size:13px;text-align:center;
    margin-top:12px;display:none;line-height:1.4}
  .spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(0,0,0,0.2);
    border-top-color:#1a1510;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:8px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .footer{text-align:center;margin-top:20px;font-size:11px;color:rgba(255,255,255,0.2)}
</style>
</head>
<body>
<div class="card">
  <div class="title">Cuervok</div>
  <div class="subtitle">Inicia sesión con tu cuenta</div>
  <form id="loginForm">
    <div class="field">
      <span class="icon">👤</span>
      <input type="text" id="username" placeholder="Usuario" autocomplete="username" autofocus>
    </div>
    <div class="field">
      <span class="icon">🔒</span>
      <input type="password" id="password" placeholder="Contraseña" autocomplete="current-password">
    </div>
    <button class="btn" type="submit" id="submitBtn">Conectar</button>
    <div class="error" id="error"></div>
  </form>
  <div class="footer">Cuervok Desktop</div>
</div>
<script>
  const form = document.getElementById('loginForm');
  const errEl = document.getElementById('error');
  const btn = document.getElementById('submitBtn');
  const REDIRECT = ${JSON.stringify(redirectUri)};
  const GAME_ID = ${JSON.stringify(clientId)};

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const login = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    if (!login || !password) { showErr('Por favor completa todos los campos'); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class=\'spinner\'></span> Conectando...';
    errEl.style.display = 'none';
    try {
      // Step 1: Authenticate against the web platform (security layer)
      btn.innerHTML = '<span class=\'spinner\'></span> Verificando cuenta web...';
      const webAuthRes = await fetch('/api/web/login.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ username: login, password: password })
      });
      if (!webAuthRes.ok) {
        const txt = await webAuthRes.text();
        let reason = txt;
        try { const p = JSON.parse(txt); reason = p.error || p.reason || txt; } catch(e) {}
        throw new Error(reason || 'Credenciales web incorrectas (HTTP ' + webAuthRes.status + ')');
      }
      const webData = await webAuthRes.json();
      if (!webData.success) throw new Error(webData.error || 'Credenciales web incorrectas');

      // Step 2: Get game API key from DofEmu emulator
      btn.innerHTML = '<span class=\'spinner\'></span> Conectando al juego...';
      const body = new URLSearchParams({ login: login, password: password, game_id: GAME_ID });
      const apiKeyRes = await fetch('/api/haapi/Ankama/v5/Api/CreateApiKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: body.toString()
      });
      if (!apiKeyRes.ok) {
        const txt = await apiKeyRes.text();
        let reason = txt;
        try { reason = JSON.parse(txt).reason || txt; } catch(e) {}
        throw new Error(reason || 'Error al obtener clave de juego (HTTP ' + apiKeyRes.status + ')');
      }
      const keyData = await apiKeyRes.json();
      const apiKey = keyData.key || keyData.apiKey;
      if (!apiKey) throw new Error('No se recibió la clave API');
      const accountId = keyData.account_id != null ? Number(keyData.account_id) : 0;
      // Send auth data to the parent (Cuervok GameScreen) via postMessage.
      // The iframe can't navigate to dofustouch:// custom protocol, so we
      // communicate the session directly to the parent which updates authStore.
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'cuervok:native-login-success',
          gameId: new URLSearchParams(window.location.search).get('id') || '',
          apiKey: apiKey,
          token: '',
          accountId: accountId,
          username: login
        }, '*');
      }
      // Also try the protocol redirect as fallback (works if opened outside iframe)
      window.location.href = REDIRECT + '?code=' + encodeURIComponent(apiKey) + '&account_id=' + accountId;
    } catch(err) {
      showErr(err.message || 'Error de conexión');
      btn.disabled = false;
      btn.textContent = 'Conectar';
    }
  });
  function showErr(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
</script>
</body>
</html>`
      return c.html(html)
    })

    honoApp.get('/game/*', createStaticHandler(get.GAME_PATH(), '/game/'))
    honoApp.get('/character-images/*', createStaticHandler(get.CHARACTER_IMAGES_PATH(), '/character-images/'))
    honoApp.get('/character-images/*', createStaticHandler(get.CHARACTER_IMAGES_PATH(), '/character-images/'))
honoApp.get('/renderer/*', createStaticHandler(join(__dirname, '../renderer/'), '/renderer/'))

    // Asset caching proxy: /assets/* → versioned Ankama CDN with disk cache
    honoApp.get('/assets/*', async (c) => {
      const route = c.req.path.slice('/assets/'.length)
      const result = await handleAssetRequest('assets', route)
      if (result.status !== 200 || !result.body) return c.text('Asset not found', result.status as any)
      return new Response(new Uint8Array(result.body), {
        headers: { 'Content-Type': result.contentType, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' }
      })
    })
    honoApp.get('/assets-ui/*', async (c) => {
      const route = c.req.path.slice('/assets-ui/'.length)
      const result = await handleAssetRequest('ui', route)
      if (result.status !== 200 || !result.body) return c.text('Asset not found', result.status as any)
      return new Response(new Uint8Array(result.body), {
        headers: { 'Content-Type': result.contentType, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' }
      })
    })

    // Shop article images: /shopimg/{iconId}.png → gfx/items/{iconId}.png
    // from the local asset proxy (the in-game shop renders article tiles from
    // media[].url, which the emulator server fills with this route).
    honoApp.get('/shopimg/*', async (c) => {
      const iconId = c.req.path.slice('/shopimg/'.length).replace(/[^0-9]/g, '')
      if (!iconId) return c.text('Not Found', 404)
      const result = await handleAssetRequest('assets', `gfx/items/${iconId}.png`)
      if (result.status !== 200 || !result.body) return c.text('Asset not found', result.status as any)
      return new Response(new Uint8Array(result.body), {
        headers: { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' }
      })
    })



    // Overrides HTTP bridge: lets the web data editor auto-connect to the
    // client's asset-overrides folder (fixed port, no file picker needed).
    //   GET  /overrides/list      → JSON list of files across all override roots
    //   GET  /overrides/{route}   → serve an override file (skins/, gfx/…)
    //   POST /overrides/{route}   → write a new/updated override file
    // The editor runs on a DIFFERENT origin (its own dev server / static
    // host), so its cross-origin POST needs a CORS preflight — the OPTIONS
    // handler below answers it. Loopback-only server: acceptable for a local
    // emulator tool (do not "harden" this into blocking OPTIONS or the
    // editor's auto-connect writes stop working).
    honoApp.options('/overrides/*', (c) =>
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    )
    honoApp.get('/overrides/list', async (c) => {
      const files = new Set<string>()
      for (const root of getOverrideRoots()) {
        try {
          walkDir(root, '', files)
        } catch {
          // root missing — fine
        }
      }
      return c.json({ files: [...files].sort() })
    })
    honoApp.get('/overrides/*', async (c) => {
      const cleanRoute = c.req.path.slice('/overrides/'.length).replace(/^\/+/, '')
      if (!cleanRoute || cleanRoute.includes('..')) return c.text('Forbidden', 403)
      for (const root of getOverrideRoots()) {
        const file = join(root, cleanRoute)
        try {
          const stat = fs.statSync(file)
          if (!stat.isFile()) continue
          const content = fs.readFileSync(file)
          const ext = file.split('.').pop()?.toLowerCase() ?? ''
          return new Response(content, {
            headers: { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }
          })
        } catch {
          // try next root
        }
      }
      return c.text('Not Found', 404)
    })
    honoApp.post('/overrides/*', async (c) => {
      const cleanRoute = c.req.path.slice('/overrides/'.length).replace(/^\/+/, '')
      if (!cleanRoute || cleanRoute.includes('..')) return c.text('Forbidden', 403)
      const body = await c.req.arrayBuffer()
      const root = getOverrideWriteRoot()
      const file = join(root, cleanRoute)
      fs.mkdirSync(join(file, '..'), { recursive: true })
      fs.writeFileSync(file, Buffer.from(body))
      logger.info(`Overrides write: ${cleanRoute}`)
      return c.json({ ok: true, path: cleanRoute })
    })

    // ─── Character Render (uses game's own WebGL renderer) ────────
    honoApp.post('/character-render', async (c) => {
      try {
        const body = await c.req.json()
        const { lookString, direction = 4, width = 192, height = 192 } = body as any
        if (!lookString) return c.json({ error: 'lookString required' }, 400)

        // Find an active game window
        const allWindows = BrowserWindow.getAllWindows()
        const gameWin = allWindows.find((w: any) => !w.isDestroyed() && w.webContents.getURL().includes('game'))
        if (!gameWin) return c.json({ error: 'No game window running' }, 503)

        const dataUrl: string | null = await gameWin.webContents.executeJavaScript(
          `(function() {
            try {
              if (!window.CharacterDisplay) return null;
              const m = ${JSON.stringify(lookString)}.match(/\{([^}]+)\}/);
              if (!m) return null;
              const parts = m[1].split('|');
              const bonesId = parseInt(parts[0]) || 1;
              const skinIds = parts[1] ? parts[1].split(',').map(Number).filter(Boolean) : [];
              const colorParts = parts[2] ? parts[2].split(',') : [];
              const indexedColors = colorParts.map(function(p) {
                const parts2 = p.split('=');
                const idx = parseInt(parts2[0]);
                const val = parts2[1];
                if (val && val.startsWith('#')) {
                  const hex = val.replace('#','');
                  const n = parseInt(hex, 16);
                  return ((idx & 0x0F) << 24) | (n & 0x00FFFFFF);
                }
                return ((idx & 0x0F) << 24) | (parseInt(val) & 0x00FFFFFF);
              });
              const scale = parseInt(parts[3]) || 100;
              const look = { _type: 'EntityLook', bonesId, skins: skinIds, indexedColors, scales: [scale], subentities: [] };
              const cd = new window.CharacterDisplay({ scale: 'fitin' });
              cd.setLook(look, { riderOnly: true, direction: ${direction}, animation: 'AnimArtwork', boneType: 'timeline/', skinType: 'timeline/' });
              cd.rootElement.style.cssText = 'position:absolute;left:-9999px;width:${width}px;height:${height}px;';
              document.body.appendChild(cd.rootElement);
              return new Promise(function(resolve) {
                setTimeout(() => {
                  try {
                    const canvas = cd.canvas?.rootElement || cd.rootElement?.querySelector('canvas');
                    if (!canvas || canvas.width === 0) { cd.rootElement.remove(); resolve(null); return; }
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { cd.rootElement.remove(); resolve(null); return; }
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const d = imgData.data;
                    let minX=canvas.width,minY=canvas.height,maxX=0,maxY=0;
                    for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) {
                      if (d[(y*canvas.width+x)*4+3]>10) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
                    }
                    if (maxX<=minX||maxY<=minY) { cd.rootElement.remove(); resolve(null); return; }
                    const pad=4; minX=Math.max(0,minX-pad); minY=Math.max(0,minY-pad); maxX=Math.min(canvas.width-1,maxX+pad); maxY=Math.min(canvas.height-1,maxY+pad);
                    const tmp=document.createElement('canvas'); tmp.width=maxX-minX+1; tmp.height=maxY-minY+1;
                    tmp.getContext('2d')!.drawImage(canvas,minX,minY,tmp.width,tmp.height,0,0,tmp.width,tmp.height);
                    cd.rootElement.remove(); resolve(tmp.toDataURL('image/png'));
                  } catch(e) { cd.rootElement.remove(); resolve(null); }
                }, 1500);
              });
            } catch(e) { return null; }
          })()`,
          true
        )

        if (!dataUrl) return c.json({ error: 'Render failed' }, 500)
        return c.json({ dataUrl })
      } catch (err: any) {
        return c.json({ error: err.message }, 500)
      }
    })

    // Sync versioned CDN paths from the official config in the background
    syncAssetVersions()

    // Fixed port: the emulator's config.json and the game's localStorage
    // (HAAPI session persistence) depend on a stable origin.
    const server: Server = await new Promise((resolve) => {
      const s = serve({
        fetch: honoApp.fetch,
        port: LOCAL_SERVER_PORT,
        hostname: '127.0.0.1'
      }) as Server

      s.on('listening', () => {
        const addr = s.address() as AddressInfo
        logger.info(`Local server on port ${addr.port}`)
        resolve(s)
      })
    })

    Application._instance = new Application(server, hash)
  }

  static get instance(): Application {
    return Application._instance!
  }

  private constructor(server: Server, hash: string) {
    this._server = server
    this._hash = hash
    this._store = new ElectronStore<StoreSchema>({ name: 'cuervok-data' })
  }

  get gameWindow(): GameWindow | null {
    return this._gameWindow
  }

  get serverPort(): number {
    return (this._server.address() as AddressInfo).port
  }

  get localBase(): string {
    return `http://127.0.0.1:${this.serverPort}`
  }

  run() {
    this._loadVersions()
    this._setupIPCHandlers()
    this._appUpdater = new AppUpdater((status) => this._broadcastAppUpdateStatus(status))
    this.ensureWindow()
    this._appUpdater.start()

    // Connect to Discord Rich Presence (best-effort, non-blocking)
    connectDiscordRpc().catch(() => {})
  }

  private _loadVersions() {
    try {
      if (fs.existsSync(get.LOCAL_VERSIONS_PATH())) {
        const data = JSON.parse(fs.readFileSync(get.LOCAL_VERSIONS_PATH(), 'utf-8'))
        if (data.buildVersion) this._buildVersion = data.buildVersion
        if (data.appVersion) this._appVersion = data.appVersion
        logger.info(`Loaded versions: build=${this._buildVersion} app=${this._appVersion}`)
      }
    } catch (err) {
      logger.warn('Failed to load versions.json', err)
    }
  }

  ensureWindow() {
    if (this._updaterWindow) {
      if (this._updaterWindow.isMinimized()) this._updaterWindow.restore()
      this._updaterWindow.focus()
      return
    }

    if (this._gameWindow) {
      if (this._gameWindow.isMinimized()) this._gameWindow.restore()
      this._gameWindow.focus()
      return
    }

    if (this._startupComplete) this._createGameWindow()
    else this._createUpdaterWindow()
  }

  setBuildVersion(v: string) { this._buildVersion = v }
  setAppVersion(v: string) { this._appVersion = v }

  processAuthCallback(url: string) {
    logger.info(`Auth callback: ${url.length} chars`)
    this._gameWindow?.processAuthCallback(url)
  }

  private _createGameWindow() {
    const rendererUrl = this._getRendererUrl('/game')
    this._store.set('game_renderer_url', rendererUrl)
    this._gameWindow = new GameWindow({ url: rendererUrl, index: 0 })

    this._gameWindow.on('closed', () => {
      this._gameWindow = null
      if (!this._updaterWindow) app.quit()
    })
  }

  private _createUpdaterWindow() {
    this._updaterWindow = new UpdaterWindow({ url: this._getRendererUrl('/updater') })

    this._updaterWindow.on('closed', () => {
      this._updaterWindow = null
      if (!this._gameWindow) app.quit()
    })
  }

  private _getRendererUrl(route: '/game' | '/updater') {
    const devServer = process.env['VITE_DEV_SERVER_HOST'] && process.env['VITE_DEV_SERVER_PORT']
    return devServer
      ? `http://${process.env['VITE_DEV_SERVER_HOST']}:${process.env['VITE_DEV_SERVER_PORT']}#${route}`
      : `${this.localBase}/renderer/index.html#${route}`
  }

  private async _openGameWindow() {
    // Ensure the emulator backend (Auth :3000 + Game :666) is up BEFORE the
    // game window boots: without it every static-data fetch fails and the
    // game poisons its IndexedDB cache with missing-id dummies (broken spell
    // book, shortcuts, etc.). Spawned processes get a bounded grace period;
    // if they were already running, this returns instantly.
    try {
      await emulatorSupervisor.start()
      await waitForPort(3000, 20_000)
    } catch (err) {
      logger.warn('Emulator supervisor startup issue — continuing', err as Error)
    }
    this._startupComplete = true

    if (!this._gameWindow) {
      this._createGameWindow()
    } else {
      this._gameWindow.focus()
    }

    if (this._updaterWindow) {
      const updaterWindow = this._updaterWindow
      this._updaterWindow = null
      updaterWindow.close()
    }
  }

  private _setupIPCHandlers() {
    ipcMain.handle(IPCEvents.GET_GAME_CONTEXT, (event) => {
      const context: GameContext = {
        gameSrc: `${this.localBase}/game/index.html?delayed=true`,
        characterImagesSrc: `${this.localBase}/character-images/`,
        windowId: event.sender.id,
        hash: this._hash,
        platform: platform(),
        buildVersion: this._buildVersion,
        appVersion: this._appVersion
      }
      return JSON.stringify(context)
    })

    ipcMain.handle(IPCEvents.GET_SETTINGS, () => {
      return JSON.stringify(this._store.get('settings', {}))
    })

    ipcMain.on(IPCEvents.SET_SETTINGS, (_event, settings: string) => {
      try {
        this._store.set('settings', JSON.parse(settings))
      } catch {}
    })

    ipcMain.handle(IPCEvents.STORE_GET, (_event, key: string) => {
      const val = this._store.get(key)
      return val !== undefined ? JSON.stringify(val) : null
    })

    ipcMain.on(IPCEvents.STORE_SET, (_event, key: string, value: string) => {
      try {
        this._store.set(key, JSON.parse(value))
      } catch {}
    })

    ipcMain.on(IPCEvents.STORE_DELETE, (_event, key: string) => {
      this._store.delete(key)
    })

    ipcMain.on(IPCEvents.OPEN_EXTERNAL, (_event, url: string) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url)
      }
    })

    ipcMain.on(IPCEvents.SET_AUDIO_MUTE, (_event, value: boolean) => {
      this._gameWindow?.setAudioMute(value)
    })

    ipcMain.on(IPCEvents.SET_SOUND_ON_FOCUS, (_event, value: boolean) => {
      this._gameWindow?.setSoundOnFocus(value)
    })

    ipcMain.on(IPCEvents.WINDOW_MINIMIZE, (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize()
    })

    ipcMain.on(IPCEvents.WINDOW_MAXIMIZE, (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        win.isMaximized() ? win.unmaximize() : win.maximize()
      }
    })

    ipcMain.on(IPCEvents.WINDOW_CLOSE, (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close()
    })

    ipcMain.on(IPCEvents.APP_READY_TO_SHOW, (event) => {
      BrowserWindow.fromWebContents(event.sender)?.show()
    })

    ipcMain.on(IPCEvents.SAVE_CHARACTER_IMAGE, (_event, name: string, imageData: string) => {
      const charImagesPath = get.CHARACTER_IMAGES_PATH()
      fs.mkdirSync(charImagesPath, { recursive: true })
      const base64 = imageData.replace(/^data:image\/png;base64,/, '')
      const filePath = join(charImagesPath, `${name}.png`)
      fs.writeFile(filePath, base64, 'base64', (err) => {
        if (err) logger.error('Failed to save character image', err)
        else logger.info(`Saved character image: ${name}.png`)
      })
    })

    ipcMain.handle(IPCEvents.GET_APP_UPDATE_STATUS, () => {
      return this._appUpdater?.getStatus() ?? {
        phase: 'idle',
        message: 'App updater is not initialized.'
      } satisfies AppUpdateStatus
    })

    ipcMain.handle(IPCEvents.CHECK_APP_UPDATE, () => {
      return this._appUpdater?.checkNow() ?? {
        phase: 'idle',
        message: 'App updater is not initialized.'
      } satisfies AppUpdateStatus
    })

    ipcMain.on(IPCEvents.INSTALL_APP_UPDATE, () => {
      this._appUpdater?.installNow()
    })

    ipcMain.on(IPCEvents.SHOW_NATIVE_NOTIFICATION, (event, payload: NativeNotificationPayload) => {
      if (!Notification.isSupported() || !payload?.title) return

      const win = BrowserWindow.fromWebContents(event.sender)
      const notification = new Notification({
        title: payload.title.slice(0, 120),
        body: payload.body?.slice(0, 260)
      })

      notification.on('click', () => {
        if (win) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
          win.webContents.send(IPCEvents.NATIVE_NOTIFICATION_CLICK, payload.tabId)
        }
      })

      notification.show()
    })

    ipcMain.handle(IPCEvents.CHECK_GAME_INSTALLED, () => {
      return ['index.html', join('build', 'script.js')].every((file) => fs.existsSync(join(get.GAME_PATH(), file)))
    })

    ipcMain.handle(IPCEvents.DOWNLOAD_GAME, async (event) => {
      const sender = event.sender
      const updater = new GameUpdater((message, percent) => {
        sender.send(IPCEvents.DOWNLOAD_PROGRESS, message, percent)
      })
      try {
        const versions = await updater.run()
        this._buildVersion = versions.buildVersion
        this._appVersion = versions.appVersion
        logger.info(`Game downloaded: build=${versions.buildVersion} app=${versions.appVersion}`)
        this._gameWindow?.processGame()
      } catch (err) {
        logger.error('Game download failed', err)
        throw err
      }
    })

    ipcMain.on(IPCEvents.OPEN_GAME_WINDOW, () => {
      this._openGameWindow()
    })

    // Auth IPC handlers
    ipcMain.handle(IPCEvents.LOGIN, (_event, tabId: string, apiKey: string, token: string) => {
      this._store.set(`auth_${tabId}`, { tabId, apiKey, token, loggedInAt: new Date().toISOString() })
      logger.info(`Auth: tab ${tabId} logged in`)
    })

    ipcMain.handle(IPCEvents.GET_AUTH_SESSION, (_event, tabId: string): AuthSession | null => {
      const data = this._store.get(`auth_${tabId}`) as any
      if (!data) return null
      return {
        username: data.username || '',
        token: data.token || '',
        apiKey: data.apiKey || '',
        accountId: data.accountId ?? null,
        refreshToken: data.refreshToken || '',
        status: (data.status as AuthSession['status']) || 'authenticated',
        createdAt: data.loggedInAt || data.createdAt || new Date().toISOString()
      }
    })

    ipcMain.on(IPCEvents.LOGOUT, (_event, tabId: string) => {
      this._store.delete(`auth_${tabId}`)
      logger.info(`Auth: tab ${tabId} logged out`)
    })

    // Retry login: re-load the login URL (used by fallback page)
    ipcMain.on('retry-login', (_event, url: string) => {
      if (this._gameWindow) {
        if (url === 'back-to-game') {
          const rendererUrl = this._store.get('game_renderer_url') as string
          if (rendererUrl) {
            logger.info('[FALLBACK] Navigating back to game renderer')
            this._gameWindow.loadURL(rendererUrl)
          }
        } else {
          logger.info(`[FALLBACK] Retrying login URL: ${url}`)
          this._gameWindow.loadURL(url)
        }
      }
    })

    // Health check: ping a service origin with a short timeout
    ipcMain.handle('check-service-health', async (_event, origin: string): Promise<boolean> => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 3000)
        const resp = await fetch(origin, { method: 'HEAD', signal: controller.signal })
        clearTimeout(timer)
        return resp.ok || resp.status < 500
      } catch {
        return false
      }
    })

    // Game login complete: store auth and navigate back to the game
    ipcMain.handle('game-login-complete', (_event, authData: string) => {
      try {
        const data = JSON.parse(authData)
        // Store as a pending login for GameScreen to pick up
        this._store.set('pending_game_login', data)
        logger.info(`Game login complete: stored pending auth for user '${data.username || ''}'`)
        // Navigate back to the game renderer
        const rendererUrl = this._store.get('game_renderer_url') as string
        if (rendererUrl && this._gameWindow) {
          this._gameWindow.loadURL(rendererUrl)
          logger.info('Navigating back to game renderer after login')
        }
      } catch (err) {
        logger.error('game-login-complete failed', err)
      }
    })

    // Freeze IPC handlers
    ipcMain.handle(IPCEvents.CHECK_GAME_FROZEN, () => {
      // Post-install integrity check (anti client-tampering): recomprueba los
      // archivos sin patch en disco en cada arranque. Un fallo NO bloquea la
      // partida (un falso positivo no debe romper el juego) pero queda en el
      // log del cliente y marca el estado para la UI.
      try {
        const integrity = verificationOnLaunch()
        if (!integrity.ok) {
          logger.error('[integrity] archivos del juego modificados:', integrity.failures)
          this._gameIntegrityFailures = integrity.failures
        } else {
          this._gameIntegrityFailures = null
        }
      } catch { /* la verificación nunca bloquea el arranque */ }

      return GameUpdater.checkFrozen()
    })

    ipcMain.handle(IPCEvents.UNFREEZE_GAME, async () => {
      await GameUpdater.removeFrozenMarker()
    })

    ipcMain.handle(IPCEvents.REDOWNLOAD_GAME, async (event) => {
      const sender = event.sender
      // Remove frozen marker first, then re-download
      await GameUpdater.removeFrozenMarker()
      const updater = new GameUpdater((message, percent) => {
        sender.send(IPCEvents.DOWNLOAD_PROGRESS, message, percent)
      })
      try {
        const versions = await updater.run()
        this._buildVersion = versions.buildVersion
        this._appVersion = versions.appVersion
        logger.info(`Game re-downloaded: build=${versions.buildVersion} app=${versions.appVersion}`)
        this._gameWindow?.processGame()
      } catch (err) {
        logger.error('Game re-download failed', err)
        throw err
      }
    })

    // Discord RPC handlers
    ipcMain.on(IPCEvents.DISCORD_RPC_UPDATE, (_event, stateJson: string) => {
      try {
        const state: DiscordPresenceState = JSON.parse(stateJson)
        setDiscordPresence(state)
      } catch (err: any) {
        logger.debug('[DiscordRPC] Failed to update presence:', err?.message)
      }
    })

    ipcMain.on(IPCEvents.DISCORD_RPC_CLEAR, () => {
      clearDiscordPresence()
    })
  }

  private _broadcastAppUpdateStatus(status: AppUpdateStatus) {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPCEvents.APP_UPDATE_STATUS, status)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Admin API: inline route handler (no dynamic import needed)
// ═══════════════════════════════════════════════════════════════════


