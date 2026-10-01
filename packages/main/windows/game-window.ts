import { app, BrowserWindow, shell, BeforeSendResponse } from 'electron'
import path, { join } from 'path'
import fs from 'fs'
import { EventEmitter } from 'events'
import * as Sentry from '@sentry/electron/main'
import { MOBILE_UA_BASE } from '@cuervok/shared'
import { get } from '../constants'
import { logger } from '../logger'
import { getHelperSnippet, getRuntimeHelperSnippet } from '../scripts'
import { getAppIconPath } from '../icon-path'
import { NetworkCapture } from './network-capture'

interface GameWindowOptions {
  url: string
  index: number
}

const INITIAL_WIDTH = 1280
const INITIAL_HEIGHT = 720

// primus.js is the Primus client library the game bootstraps `window.Primus`
// from. The game loads it at runtime as r() + "/build/primus.js", so after
// the base-URL rewrite in processGame() the request lands on
// http://localhost:3000/build/primus.js. The emulator auth server USED to
// serve it from its data/build/primus.js folder, but its root WebApi
// (RootConfigController, added for config.json language handling) now 404s
// every root path it doesn't own — including /build/primus.js — which makes
// the game die with "[DofEmu-Crash] error loading script" + reload loop.
//
// The emulator's bundled primus.js speaks engine.io (the transport its own
// server implements); the version Ankama serves does NOT (it is a plain
// websocket build) and the auth WebSocket handshake fails with ERR_FAILED.
// So the client bundles that engine.io primus.js (game-base/primus.js,
// copied to GAME_PATH/build/primus.js) and the interceptor redirects the
// emulator URL to the client's own server. The WebSocket connection itself
// still targets localhost:3000.
const LOCAL_SERVER_ORIGIN = 'http://127.0.0.1:8765' // must match LOCAL_SERVER_PORT in application.ts
const PRIMUS_JS_URL = `${LOCAL_SERVER_ORIGIN}/game/build/primus.js`
// Web-retro platform origin for login page (security layer)
// Set CUV_SERVER_URL env var to point to VPS (e.g. https://yourdomain.com)
const WEBRETRO_ORIGIN = process.env.CUV_SERVER_URL || 'http://localhost:3001'

// Fallback HTML shown when the web-retro platform is unreachable
// Uses the Electron preload API (window.cuervok) for smart retry.
const SERVICE_UNAVAILABLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Service Temporarily Unavailable</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
    background:#0a0a0f;color:#c8c0d0;display:flex;align-items:center;
    justify-content:center;min-height:100vh;overflow:hidden;position:relative}

  /* Back button — top-left corner */
  .back{position:fixed;top:20px;left:20px;z-index:100;padding:8px 16px;
    background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);
    border-radius:6px;color:#706880;font-size:12px;font-weight:500;
    cursor:pointer;transition:all 0.3s;letter-spacing:0.5px;
    font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
  .back:hover{color:#e8e0f0;border-color:rgba(180,60,60,0.4);
    background:rgba(180,60,60,0.1)}
  .back svg{width:14px;height:14px;vertical-align:middle;margin-right:4px;
    stroke:currentColor;fill:none;stroke-width:2}

  /* Card with animated wave border */
  .card-wrap{position:relative;width:480px;padding:40px 32px;text-align:center;
    border-radius:16px;background:rgba(12,8,18,0.8);
    box-shadow:0 0 80px rgba(180,40,40,0.06)}

  /* Animated border layer */
  .card-wrap::before{content:'';position:absolute;inset:-2px;border-radius:18px;
    background:conic-gradient(from var(--angle,0deg),
      rgba(180,60,60,0.0) 0%,
      rgba(180,60,60,0.4) 10%,
      rgba(220,80,60,0.6) 20%,
      rgba(180,60,60,0.3) 35%,
      rgba(100,30,30,0.0) 50%,
      rgba(180,60,60,0.0) 65%,
      rgba(201,168,76,0.3) 80%,
      rgba(180,60,60,0.4) 90%,
      rgba(180,60,60,0.0) 100%);
    z-index:-1;animation:spinBorder 4s linear infinite;
    filter:blur(1px)}

  /* Inner cutout so only the border glows */
  .card-wrap::after{content:'';position:absolute;inset:0;border-radius:16px;
    background:rgba(12,8,18,0.92);z-index:-1}

  @keyframes spinBorder{to{--angle:360deg}}
  @property --angle{syntax:'<angle>';initial-value:0deg;inherits:false}

  /* Glow pulse behind the card */
  .glow{position:absolute;width:300px;height:300px;border-radius:50%;
    background:radial-gradient(circle,rgba(180,40,40,0.08) 0%,transparent 70%);
    top:50%;left:50%;transform:translate(-50%,-50%);
    animation:glowPulse 3s ease-in-out infinite;z-index:-2}
  @keyframes glowPulse{0%,100%{opacity:0.4;transform:translate(-50%,-50%) scale(1)}
    50%{opacity:0.8;transform:translate(-50%,-50%) scale(1.15)}}

  /* Floating particles canvas */
  #particles{position:fixed;inset:0;z-index:-3;pointer-events:none}

  /* Icon */
  .ico{width:64px;height:64px;margin:0 auto 24px;border-radius:50%;
    background:rgba(180,60,60,0.12);display:flex;align-items:center;
    justify-content:center;border:1.5px solid rgba(180,60,60,0.25);
    animation:iconPulse 2s ease-in-out infinite}
  @keyframes iconPulse{0%,100%{box-shadow:0 0 0 0 rgba(180,60,60,0.1)}
    50%{box-shadow:0 0 20px 4px rgba(180,60,60,0.15)}}
  .ico svg{width:32px;height:32px;stroke:#b34040;fill:none;stroke-width:2}

  h1{font-size:22px;font-weight:700;color:#e8e0f0;margin-bottom:12px}
  p{font-size:14px;line-height:1.6;color:#807890;margin-bottom:8px}

  .st{margin-top:20px;padding:12px 20px;border-radius:8px;
    background:rgba(180,60,60,0.08);border:1px solid rgba(180,60,60,0.15);
    font-size:13px;color:#b34040}
  .spin{display:inline-block;width:14px;height:14px;vertical-align:middle;
    margin-right:8px;border:2px solid rgba(180,60,60,0.15);
    border-top-color:#b34040;border-radius:50%;animation:r 1s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
  .ok{color:#4caf50}
</style>
</head>
<body>
<canvas id="particles"></canvas>
<button class="back" onclick="goBackToGame()">
  <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>Back
</button>
<div class="card-wrap">
  <div class="glow"></div>
  <div class="ico">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  </div>
  <h1>Service Temporarily Unavailable</h1>
  <p>The login service could not be reached. Please make sure the web platform is running.</p>
  <div class="st" id="st"><span class="spin"></span>Checking service in <span id="cd">10</span>s&hellip;</div>
</div>
<script>
var tries=0,max=30,interval=10,wait=interval;
var cd=document.getElementById('cd'),st=document.getElementById('st');
function checkHealth(){
  if(window.cuervok&&window.cuervok.checkServiceHealth){
    window.cuervok.checkServiceHealth('http://localhost:3001').then(function(ok){
      if(ok){
        st.innerHTML='<span class="ok">&#10003; Service is back! Loading&hellip;</span>';
        clearInterval(iv);
        setTimeout(function(){
          if(window.cuervok&&window.cuervok.retryLogin){
            window.cuervok.retryLogin(decodeURIComponent(location.hash.slice(1)));
          } else {
            location.reload();
          }
        },500);
      }
    }).catch(function(){});
  } else {
    fetch('http://localhost:3001',{mode:'no-cors',cache:'no-store'}).then(function(){
      st.innerHTML='<span class="ok">&#10003; Service is back! Loading&hellip;</span>';
      clearInterval(iv); setTimeout(function(){location.reload();},500);
    }).catch(function(){});
  }
}
var iv=setInterval(function(){
  wait--;
  if(wait<=0){
    wait=interval; tries++;
    if(tries>=max){
      clearInterval(iv);
      st.innerHTML='Could not reconnect after '+max+' attempts.<br><button onclick="retryNow()" style="margin-top:10px;padding:8px 20px;background:rgba(180,60,60,0.15);border:1px solid rgba(180,60,60,0.3);border-radius:6px;color:#e8e0f0;cursor:pointer;font-size:13px">Try Again</button>';
      return;
    }
    checkHealth();
  }
  cd.textContent=wait;
},1000);
function retryNow(){
  st.innerHTML='<span class="spin"></span> Checking service&hellip;';
  checkHealth();
}
function goBackToGame(){
  if(window.cuervok&&window.cuervok.retryLogin){
    window.cuervok.retryLogin('back-to-game');
  } else {
    history.back();
  }
}

/* ── Floating particles ────────────────────── */
(function(){
  var c=document.getElementById('particles'),ctx=c.getContext('2d');
  var W,H,particles=[],COUNT=60;
  function resize(){W=c.width=window.innerWidth;H=c.height=window.innerHeight}
  window.addEventListener('resize',resize);resize();
  function Particle(){this.reset(true)}
  Particle.prototype.reset=function(init){
    this.x=Math.random()*W;
    this.y=init?Math.random()*H:H+10;
    this.r=Math.random()*2+0.5;
    this.vx=(Math.random()-0.5)*0.3;
    this.vy=-(Math.random()*0.4+0.1);
    this.alpha=Math.random()*0.4+0.1;
    this.pulse=Math.random()*Math.PI*2;
    this.pulseSpeed=Math.random()*0.02+0.005;
    this.color=Math.random()>0.7?'rgba(201,168,76,':'rgba(180,60,60,';
  };
  Particle.prototype.update=function(){
    this.x+=this.vx+Math.sin(this.pulse)*0.15;
    this.y+=this.vy;
    this.pulse+=this.pulseSpeed;
    if(this.y<-10||this.x<-10||this.x>W+10)this.reset(false);
  };
  Particle.prototype.draw=function(){
    var a=this.alpha*(0.5+0.5*Math.sin(this.pulse));
    ctx.beginPath();ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
    ctx.fillStyle=this.color+a+')';ctx.fill();
  };
  for(var i=0;i<COUNT;i++)particles.push(new Particle());
  function frame(){
    ctx.clearRect(0,0,W,H);
    for(var i=0;i<particles.length;i++){particles[i].update();particles[i].draw();}
    /* draw connections between nearby particles */
    for(var i=0;i<particles.length;i++){
      for(var j=i+1;j<particles.length;j++){
        var dx=particles[i].x-particles[j].x,dy=particles[i].y-particles[j].y;
        var d=dx*dx+dy*dy;
        if(d<15000){
          var a=(1-d/15000)*0.08;
          ctx.beginPath();ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.strokeStyle='rgba(180,60,60,'+a+')';ctx.lineWidth=0.5;ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
})();
</script>
</body>
</html>`

export class GameWindow extends EventEmitter {
  private readonly _win: BrowserWindow
  private _globalMuted = false
  private _soundOnFocus = true
  private _capture: NetworkCapture

  constructor(opts: GameWindowOptions) {
    super()

    this._win = new BrowserWindow({
      show: true,
      width: INITIAL_WIDTH,
      height: INITIAL_HEIGHT,
      frame: false,
      resizable: true,
      fullscreenable: true,
      title: 'Cuervok',
      icon: getAppIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        backgroundThrottling: false,
        partition: 'persist:' + opts.index,
        sandbox: false,
        // NOTE: webSecurity must remain false because the game client
        // (served from 127.0.0.1:8765) makes XHR requests to the DofEmu
        // server on localhost:3000.  The DofEmu server doesn't have CORS
        // headers, and doesn't handle OPTIONS preflight (returns 405).
        // To enable webSecurity, the DofEmu server would need full CORS
        // support (Access-Control-Allow-Origin + OPTIONS handler).
        webSecurity: false,
        allowRunningInsecureContent: true,
        webviewTag: true
      }
    })

    this._win.webContents.setUserAgent(
      `${MOBILE_UA_BASE} DofusTouch Client 3.10.1`
    )

    this._setupRequestInterceptors()
    this._setupEventHandlers()
    this.processGame()

    // Start network capture for protocol reverse-engineering
    this._capture = new NetworkCapture(this._win.webContents)
    this._capture.start()

    logger.info(`Loading URL: ${opts.url}`)
    // v7 — one-shot purge of the game's IndexedDB data caches from the MAIN
    // process before the first navigation, then load. The in-page boot patch
    // (v6) proved unreliable: it can fail silently in the partition context
    // (no localStorage/IDB yet before navigation), which left poisoned dummy
    // records {MISSING_ID:true} in place forever — the game's data loader
    // treats any stored record as "present" and never re-requests the id,
    // so custom spells (e.g. !addspell of a studio spell) never appeared in
    // the spell book. clearStorageData(['indexdb']) is the same primitive
    // Electron exposes for exactly this and cannot be blocked by page state.
    // Cookies/localStorage are preserved. Sentinel file = runs once per
    // profile; delete it to force another purge.
    void this._purgeDataCachesThenLoad(opts.url, opts.index)
  }

  private async _purgeDataCachesThenLoad(url: string, index: string | number) {
    // Version-driven: the sentinel file stores the Auth's staticDataVersion
    // of the last purge. If the server's data version changed (new custom
    // spell/item saved in the Studio, content update), the cache is wiped so
    // the client re-downloads the fresh tables — never carrying dummies.
    // Auth down → skip (don't block boot; keep last state).
    const sentinel = join(get.GAME_PATH(), `.datacache-purged-${index}`)
    try {
      let serverVersion = ''
      try {
        const res = await fetch('http://localhost:3000/api/assetsVersions.json', {
          signal: AbortSignal.timeout(5000)
        })
        if (res.ok) {
          const j = (await res.json()) as { staticDataVersion?: string }
          serverVersion = String(j?.staticDataVersion ?? '')
        }
      } catch {
        // Auth unreachable — keep previous sentinel state, just boot
      }
      const lastPurgeVersion = fs.existsSync(sentinel)
        ? fs.readFileSync(sentinel, 'utf8').trim()
        : ''
      if (serverVersion && serverVersion !== lastPurgeVersion) {
        await this._win.webContents.session.clearStorageData({ storages: ['indexdb'] })
        fs.writeFileSync(sentinel, serverVersion)
        logger.info(
          `Purged IndexedDB data caches (data version ${serverVersion}, previous ${lastPurgeVersion || '(none)'})`
        )
      }
    } catch (err) {
      logger.warn('IndexedDB data-cache purge failed — loading anyway', err as Error)
    }
    this._win.loadURL(url)
  }

  get id() {
    return this._win.webContents.id
  }

  focus() {
    this._win.focus()
  }

  isMinimized() {
    return this._win.isMinimized()
  }

  restore() {
    this._win.restore()
  }

  close() {
    this._win.close()
  }

  loadURL(url: string) {
    this._win.loadURL(url)
  }

  setAudioMute(value: boolean) {
    const prev = this._globalMuted
    this._globalMuted = value
    this._win.webContents.setAudioMuted(value)
    this._logToFile(`[win] setAudioMute ${value} (prev globalMuted=${prev}) muted=${this._win.webContents.isAudioMuted()}`)
  }

  setSoundOnFocus(value: boolean) {
    this._soundOnFocus = value
  }

  processAuthCallback(url: string) {
    const escaped = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const js = `
      (function() {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try {
            var win = iframes[i].contentWindow;
            if (win && typeof win.$appSchemeLinkCalled === 'function') {
              win.$appSchemeLinkCalled('${escaped}');
              return 'dispatched to iframe ' + i;
            }
          } catch(e) {}
        }
        if (typeof window.$appSchemeLinkCalled === 'function') {
          window.$appSchemeLinkCalled('${escaped}');
          return 'dispatched to window';
        }
        return 'no handler found';
      })()
    `
    this._win.webContents
      .executeJavaScript(js)
      .then((result: string) => logger.info('Auth callback:', result))
      .catch((err: Error) => logger.error('Auth callback inject failed', err))
  }

  processGame() {
    const gamePath = get.GAME_PATH()
    const buildPath = path.join(gamePath, 'build', 'script.js')
    const indexPath = path.join(gamePath, 'index.html')

    // ─── Patch the game's index.html to boot once Config is ready ──
    // The game-base index.html (copied by the updater) only DEFINES
    // window.initDofus but never calls it — so the game never loads and
    // the iframe stays black.  We inject an auto-boot script that waits
    // for window.Config (fetched from the emulator, with a fallback
    // timeout) and then calls window.initDofus() to start the real game.
    if (fs.existsSync(indexPath)) {
      let indexHtml = fs.readFileSync(indexPath, 'utf-8')
      // Always remove any previous config guard (v1/v2/v3) so it can't
      // clobber the current boot script's initDofus wrapper.
      indexHtml = indexHtml.replace(/<script>\$_configGuarded[^]*?<\/script>\s*/g, '')
      indexHtml = indexHtml.replace(/<script>\$_configBoot_v\d[^]*?<\/script>\s*/g, '')
      indexHtml = indexHtml.replace(/<script>\$_dummyPurge_v\d[^]*?<\/script>\s*/g, '')
      if (!indexHtml.includes('$_configBoot_v5')) {
        // v5: requests config.json with the language SAVED by the game's login
        // language selector (localStorage key "all#lang" / "<account>#lang")
        // instead of the hardcoded "es", so the session boots in the language
        // the user picked. Content localization rides on /data/map?lang=X and
        // the client's per-language static-data caches (esDataCache/frDataCache/...).
        // Keeps the v4 retry behavior (every 2s, up to 15 tries) so launching
        // the client slightly before the emulator auth server doesn't dead-end
        // the session on the fallback config. The fallback dataUrl points at the
        // emulator (/api) — NOT at 127.0.0.1:8765/data, which has no route and
        // makes staticContent fail with 404 ("No es/en dictionary").
        const boot = `
<script>$_configBoot_v5=true;
(function(){var _bootStarted=false;function _boot(){if(_bootStarted)return;_bootStarted=true;if(window.initDofus)window.initDofus()}
function _tryBoot(){if(window.Config)_boot()}
function _savedLang(){var def='es';try{var L=window.localStorage;if(!L)return def;var cands=[],all=null;for(var i=0;i<L.length;i++){var k=L.key(i);if(k&&/#lang$/.test(k)){var v=L.getItem(k);if(v&&/^[a-z]{2}$/.test(v)){cands.push(v);if(k==='all#lang'||k.indexOf('#all#lang')>=0)all=v}}}if(all)return all;if(cands.length)return cands[cands.length-1]}catch(e){}return def}
function _useFallback(){if(!window.Config){window.Config={language:_savedLang(),assetsUrl:'http://127.0.0.1:8765/assets/',dataUrl:'http://localhost:3000/api'}}clearInterval(_p);_boot()}
if(window.Config){_boot();return}
var _p=setInterval(_tryBoot,50),_tries=0
function _fetchConfig(){fetch('http://localhost:3000/config.json?lang='+_savedLang(),{signal:AbortSignal.timeout(4e3)}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(c){if(c){window.Config=c;clearInterval(_p);_boot()}}).catch(function(e){_tries++;if(_tries<15)setTimeout(_fetchConfig,2e3);else{console.warn('Config fetch failed, using fallback config:',e&&e.message);_useFallback()}})}
_fetchConfig()})();
</script>`
        if (indexHtml.includes('</body>')) {
          indexHtml = indexHtml.replace('</body>', boot + '</body>')
        } else if (indexHtml.includes('</html>')) {
          indexHtml = indexHtml.replace('</html>', boot + '</html>')
        } else {
          indexHtml += boot
        }
        fs.writeFileSync(indexPath, indexHtml)
        logger.info('Patched game index.html: auto-boot initDofus with saved language (v5)')
      }

    }

    // ─── Ensure the bundled primus.js is in the game build folder ──
    // The game loads it at runtime from r() + "/build/primus.js"; the request
    // interceptor redirects that URL to {LOCAL_SERVER_ORIGIN}/game/build/primus.js,
    // served from GAME_PATH/build/primus.js. Copy our bundled copy there on
    // every launch if missing (covers existing installs without a re-download
    // and survives game updates that wipe the build folder).
    const primusDest = path.join(gamePath, 'build', 'primus.js')
    if (!fs.existsSync(primusDest)) {
      const primusCandidates = [
        join(__dirname, '../game-base/primus.js'),
        join(__dirname, '../../packages/main/game-base/primus.js'),
        join(__dirname, 'game-base/primus.js')
      ]
      for (const cand of primusCandidates) {
        try {
          if (fs.existsSync(cand)) {
            fs.mkdirSync(path.dirname(primusDest), { recursive: true })
            fs.copyFileSync(cand, primusDest)
            logger.info('Primus.js restored to game build folder')
            break
          }
        } catch (err) {
          logger.warn('Failed to copy bundled primus.js', err)
        }
      }
    }

    // ─── Always copy fixes.js / fixes.css from game-base to game dir ──
    // The updater only copies these on a fresh download. When the game is
    // "frozen" the updater skips _copyBaseFiles(), so hotfixes in
    // packages/main/game-base/fixes.js would never reach the player.
    // Copy them every launch so edits to game-base/ take effect immediately.
    const fixFiles = ['fixes.js', 'fixes.css']
    for (const fixFile of fixFiles) {
      const fixCandidates = [
        join(__dirname, '../game-base/' + fixFile),
        join(__dirname, '../../packages/main/game-base/' + fixFile),
        join(__dirname, 'game-base/' + fixFile)
      ]
      for (const cand of fixCandidates) {
        try {
          if (fs.existsSync(cand)) {
            fs.copyFileSync(cand, path.join(gamePath, fixFile))
            logger.info('Copied ' + fixFile + ' to game dir (processGame)')
            break
          }
        } catch (err) { /* skip */ }
      }
    }

    if (!fs.existsSync(buildPath)) return

    let build = fs.readFileSync(buildPath, 'utf-8')
    let changed = false

    const patches: Array<{ name: string; re: RegExp; template: (m: RegExpExecArray) => string }> = [
      {
        name: '$_haapiModule',
        re: /(\w)\.getHaapiKeyManager\s*=\s*function\s*\(\)/,
        template: (m) => `window.$_haapiModule=${m[1]},${m[0]}`
      },
      {
        name: '$_authManager',
        re: /(\w)\.requestWebAuthToken\s*=\s*function/,
        template: (m) => `window.$_authManager=${m[1]},${m[0]}`
      },
      {
        name: '$_haapiAccount',
        re: /(\w)\.account\s*=\s*new\s+(\w)\((\w),\s*(\w)\)/,
        template: (m) => `${m[0]},window.$_haapiAccount=${m[1]}.account`
      },
      {
        // Expose the GuildWindow class (module 1275) so fixes.js can hook
        // _setupDom and inject the custom "Donation/Boosts" tab.
        // Anchor: the unique `_buildGuildGeneralInfoArea` method definition.
        name: '$_guildBoostWindowClass',
        re: /(e\.exports=(\w)),\2\.prototype\._buildGuildGeneralInfoArea=function/,
        template: (m) => `window.$_guildBoostWindowClass=${m[2]},${m[0]}`
      },
      {
        // Expose the client's i18n module (module 17: getText/hasText/processText)
        // so custom UI (guild boosts tab) can use the OFFICIAL dictionaries:
        // every label then follows the language the client downloaded
        // (es/en/fr/...), exactly like the native tabs.  Exposing the whole
        // exports object keeps getText AND hasText resolvable at call time.
        // Anchor: the unique `t.hasText=function` assignment of module 17
        // (getText is already assigned at that point).
        name: '$_i18nModule',
        re: /t\.hasText=function/,
        template: (m) => `window.$_i18nModule=t,${m[0]}`
      },
      {
        // CRASH GUARD — StatBuff.remove: `Cannot read properties of null
        // (reading 'active')`.  The buff's EffectInstance.effect (template row
        // from the Effects table) is resolved ASYNC after the buff is built;
        // if the lookup fails (unknown effectId, cache miss, server hiccup)
        // it stays null and the next turn start calls remove() on it.  Guard
        // the dereference so one bad effect can never kill the fight: with a
        // null template the buff just doesn't adjust stats on removal.
        // Anchor: the exact minified StatBuff.remove body (unique:
        // `!this._removed&&!this.effect.effect.active`).
        name: '$_buffTemplateGuard',
        re: /n\.prototype\.remove=function\(\)\{if\(!this\._removed&&!this\.effect\.effect\.active\)\{var e=this\.getDelta\(\);this\.decrementStats\(e\)\}o\.prototype\.remove\.call\(this\)\}/,
        template: () =>
          'n.prototype.remove=function(){if(!this._removed&&!this.effect.effect||!this._removed&&this.effect.effect&&!this.effect.effect.active){var e=this.effect.effect?this.getDelta():0;' +
          'if(e)this.decrementStats(e)}o.prototype.remove.call(this)};$_buffTemplateGuard=true',
      },
      {
        // Same guard for unstack() (the dispel path dereferences the same
        // template — without the guard, dispelling an unresolved buff would
        // crash the same way).
        name: '$_buffUnstackGuard',
        re: /n\.prototype\.unstack=function\(e\)\{if\(!this\._removed\)\{var t=this\.getDelta\(\);this\.decrementStats\(t\)\}o\.prototype\.unstack\.call\(this,e\)\}/,
        template: () =>
          'n.prototype.unstack=function(e){if(!this._removed){var t=this.effect.effect?this.getDelta():0;' +
          'if(t)this.decrementStats(t)}o.prototype.unstack.call(this,e)};$_buffUnstackGuard=true',
      },
      {
        // TIMELINE ORDER FIX — the official widget only INSERTS new pictos
        // (`if(!this.fighterList.getChild(e))`) relative to whatever was
        // already mounted, so during a fight the invocation pictos keep the
        // order they had at placement and end up scattered instead of
        // matching the server's turn order.  This patch adds a pre-pass:
        // when a fighter's timeline position (index in the turn list) differs
        // from its picto position, the picto is re-inserted at the exact slot
        // via insertChildBefore (public WUI API used by the widget itself).
        // Anchor: the unique start of the refresh loop in refreshTimeline.
        name: '$_timelineOrderFix',
        re: /this\.buffList\.hide\(\)\);var h=r\.length,f=0;for\(i=0;i<h;i\+\+\)/,
        template: () =>
          'window.$_timelineOrderFix=!0,this.buffList.hide());' +
          'if(!n){for(var _tl=0;_tl<r.length;_tl++){var _fid=r[_tl],_pc=this.fighterList.getChild(_fid);' +
          'if(_pc&&this.fighterList._childrenList[_tl]!==_pc){' +
          'this.fighterList.insertChildBefore(_pc,_tl+1<r.length?this.fighterList.getChild(r[_tl+1]):null)}}}' +
          'var h=r.length,f=0;for(i=0;i<h;i++)',
      }
    ]

    for (const patch of patches) {
      if (build.includes(patch.name)) continue
      const match = patch.re.exec(build)
      if (!match) continue
      build = build.replace(match[0], patch.template(match))
      changed = true
      logger.info(`Patched: ${patch.name} exposed`)
    }

    if (!build.includes('Ignoring blocked delete for ')) {
      const blockedDeleteMatch =
        /(\w+)\.onblocked\s*=\s*function\(\)\s*\{\s*return\s+(\w+)\((\w+)\("Delete database operation was blocked, name: "\s*\+\s*(\w+)\)\)\s*\}/.exec(build)

      if (blockedDeleteMatch) {
        build = build.replace(
          blockedDeleteMatch[0],
          `${blockedDeleteMatch[1]}.onblocked = function() { return console.warn("Ignoring blocked delete for " + ${blockedDeleteMatch[4]}), ${blockedDeleteMatch[2]}() }`
        )
        changed = true
        logger.info('Patched: blocked IndexedDB delete downgraded')
      }
    }

    // Remove any previous helper snippet by finding the latest occurrence of the marker.
    // Using the marker directly is more reliable than lastIndexOf(';(function () {')
    // which can match other game code.
    const helperMarker = '$_deExposeLoginAndCert_v2'
    const helperIdx = build.lastIndexOf('$_deExposeLoginAndCert_v2')
    if (helperIdx !== -1) {
      // Walk backwards to find the start of the IIFE that wraps the helper
      const beforeMarker = build.lastIndexOf(';(function () {', helperIdx)
      const beforeArrow = build.lastIndexOf(';(() => {', helperIdx)
      const iifeStart = Math.max(beforeMarker, beforeArrow)
      if (iifeStart !== -1) {
        build = build.slice(0, iifeStart).replace(/\s+$/, '')
        changed = true
        logger.info('Patched: old helper snippet removed')
      }
    }

    // --- Local emulator mode: rewrite server URLs in script.js ---
    // Script.js uses https:// URLs (not wss://); Primus handles protocol upgrade internally.
    const WS_REWRITES: Array<{ from: RegExp; to: string; label: string }> = [
      // Login server base URL → emulator auth server. This rewrites the base
      // URL literal so r() (and every other runtime-constructed URL) resolves
      // to localhost:3000. Note: that also makes r() + "/build/primus.js"
      // point at the emulator, which no longer serves primus.js — the request
      // interceptor redirects that single URL to the client's local copy.
      { from: /https:\/\/dt-proxy-production-login\.ankama-games\.com/g, to: 'http://localhost:3000', label: 'login server → localhost:3000' },
      // HAAPI session server
      { from: /https:\/\/sessionserver\.ankama\.com/g, to: 'http://localhost:3000', label: 'session server → localhost:3000' },
    ]

    for (const rewrite of WS_REWRITES) {
      if (rewrite.from.test(build)) {
        build = build.replace(rewrite.from, rewrite.to)
        changed = true
        logger.info(`Patched: ${rewrite.label}`)
      }
    }

    // config.json MUST stay pointing at localhost:3000 (served by auth server).
    // primus.js: current game builds load it at runtime via r() + "/build/primus.js"
    // (a variable, not a literal), so this replace is a no-op for them — the
    // request is handled by the webRequest interceptor in
    // _setupRequestInterceptors(). The replace below only guards older game
    // builds that DID inline the full URL, pointing them at the client's copy
    // (served from GAME_PATH/build/primus.js) instead of the emulator's 404.
    build = build.replace(/http:\/\/localhost:3000\/build\/primus\.js/g, PRIMUS_JS_URL)
    build = build.replace(/http:\/\/127\.0\.0\.1:3000\/build\/primus\.js/g, PRIMUS_JS_URL)

    // ─── makeUrlSticky: downgrade log from warn to debug ─────────────
    // The game's Primus connection code calls makeUrlSticky(url) which
    // checks window.Config.sessionId.  If the session hasn't been
    // established yet (expected when switching to the game server), it
    // logs console.warn("Cannot make URL sticky...") and returns the URL
    // unchanged — the logic is correct, only the log level is excessive.
    // We change it to console.debug so it doesn't flood [ERROR] logs.
    //
    // NOTE: The regex uses [^\"]* to avoid matching the first closing paren
    // inside the string "(no session ID has been set)".  The minified code
    // pattern is: console.warn("Cannot make URL sticky...",e),e
    if (!build.includes('$_stickyWarnPatched')) {
      const stickyMatch = build.match(/console\.warn\("Cannot make URL sticky[^"]*",[^)]+\)/);
      if (stickyMatch) {
        build = build.replace(stickyMatch[0], stickyMatch[0].replace('console.warn', 'console.debug'));
        changed = true;
        logger.info('Patched: makeUrlSticky warn → debug');
      }
    }

    if (!build.includes('$_deExposeLoginAndCert_v2')) {
      build = build.replace(/\s*$/, '') + '\n' + getHelperSnippet()
      changed = true
      logger.info('Patched: helper snippet appended')
    }

    if (changed) {
      fs.writeFileSync(buildPath, build)
      logger.info('processGame: wrote patched script.js')
    }
  }

  private _setupRequestInterceptors() {
    // --- Server mode: redirect HTTP traffic ---
    // Set CUV_SERVER_URL env var to use VPS (e.g. https://yourdomain.com)
    const AUTH_BASE = process.env.CUV_SERVER_URL || 'http://localhost:3000'

    this._win.webContents.session.webRequest.onBeforeRequest(
      {
        urls: [
          // NOTE: Electron's webRequest keeps only the LAST listener attached
          // per event ("Only the last attached listener will be used"), so ALL
          // redirects MUST live in this single onBeforeRequest listener.
          'https://sessionserver.ankama.com/*',
          'https://haapi.ankama.com/*',
          'https://haapi.localhost/*',
          'https://dt-proxy-production-login.ankama-games.com/*',
          'https://dt-proxy-production-canada.ankama-games.com/*',
          'https://shop-api.ankama.com/*',
          'https://dofustouch.cdn.ankama.com/export-web/*',
          'http://localhost:3000/build/primus.js',
          'http://127.0.0.1:3000/build/primus.js',
          'http://localhost:3000/login/ankama*',
          'http://127.0.0.1:3000/login/ankama*',
          'https://localhost:3000/login/ankama*',
          'https://127.0.0.1:3000/login/ankama*'
        ]
      },
      (details, callback) => {
        const url = new URL(details.url)

        // DEBUG: log every intercepted request so we can see what's happening
        logger.info(`[INTERCEPT] ${details.resourceType} → ${details.url}`)

        // primus.js bootstrap (see PRIMUS_JS_URL): the game loads it at runtime
        // as r() + "/build/primus.js" → http://localhost:3000/build/primus.js,
        // which the emulator 404s ("[DofEmu-Crash] error loading script" +
        // fatal reload). Serve the bundled engine.io primus.js (the same build
        // the emulator used to serve; Ankama's version doesn't speak engine.io
        // and the auth WebSocket handshake fails with ERR_FAILED) from the
        // client's own server instead.
        if (url.pathname === '/build/primus.js' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
          logger.info(`[REDIRECT] primus.js → ${PRIMUS_JS_URL}`)
          callback({ redirectURL: PRIMUS_JS_URL })
          return
        }

        // Login page: the game's launcher opens /login/ankama on the emulator
        // which 404s. Redirect to the web-retro platform login page
        // (security layer with rate limiting, brute force protection, etc.)
        if (url.pathname === '/login/ankama') {
          const loginUrl = `${WEBRETRO_ORIGIN}/login/ankama${url.search}`
          logger.info(`[REDIRECT] login page → ${loginUrl}`)
          callback({ redirectURL: loginUrl })
          return
        }

        // Catch-all: any localhost:3000 request that wasn't matched above
        // If it looks like it was meant for the login page, redirect anyway
        if (url.pathname.startsWith('/login') && url.search.includes('code_challenge')) {
          const loginUrl = `${WEBRETRO_ORIGIN}/login/ankama${url.search}`
          logger.info(`[REDIRECT] login fallback → ${loginUrl}`)
          callback({ redirectURL: loginUrl })
          return
        }

        // HAAPI CreateApiKey: POST https://sessionserver.ankama.com/json/Ankama/v5/Api/CreateApiKey
        // → POST http://localhost:3000/api/haapi/Ankama/v5/Api/CreateApiKey
        if (url.pathname.includes('/CreateApiKey')) {
          const newPath = '/api/haapi' + url.pathname.replace('/json', '')
          logger.info(`[REDIRECT] HAAPI CreateApiKey → ${AUTH_BASE}${newPath}`)
          callback({ redirectURL: `${AUTH_BASE}${newPath}` })
          return
        }

        // HAAPI CreateToken: GET https://sessionserver.ankama.com/json/Ankama/v5/Account/CreateToken
        // → GET http://localhost:3000/api/haapi/Ankama/v5/Account/CreateToken
        if (url.pathname.includes('/CreateToken')) {
          const newPath = '/api/haapi' + url.pathname.replace('/json', '')
          logger.info(`[REDIRECT] HAAPI CreateToken → ${AUTH_BASE}${newPath}`)
          callback({ redirectURL: `${AUTH_BASE}${newPath}` })
          return
        }

        // Data endpoints (dictionary, map, text): POST https://...ankama-games.com/data/...
        // → POST http://localhost:3000/api/data/...
        if (url.pathname.startsWith('/data/')) {
          const newPath = '/api' + url.pathname + url.search
          logger.info(`[REDIRECT] Data request → ${AUTH_BASE}${newPath}`)
          callback({ redirectURL: `${AUTH_BASE}${newPath}` })
          return
        }

        // Logger endpoint → swallow (don't send to real servers)
        if (url.pathname === '/logger') {
          logger.info(`[REDIRECT] Logger swallowed → ${details.url}`)
          callback({ cancel: true })
          return
        }

        // HAAPI domains (haapi.ankama.com / haapi.localhost): route to emulator where possible, stub the rest
        if (url.hostname === 'haapi.ankama.com' || url.hostname === 'haapi.localhost') {
          // Mega shop bearer token: GET /json/Ankama/v5/Shop/GetAccessTokenFromAnkamaApiKey
          // → GET http://localhost:3000/api/haapi/Ankama/v5/Shop/GetAccessTokenFromAnkamaApiKey
          if (url.pathname.includes('/Shop/GetAccessTokenFromAnkamaApiKey')) {
            const newPath = '/api/haapi' + url.pathname.replace('/json', '')
            logger.info(`[REDIRECT] HAAPI MegaShop Token → ${AUTH_BASE}${newPath}`)
            callback({ redirectURL: `${AUTH_BASE}${newPath}` })
            return
          }
          // Known emulator routes
          if (url.pathname.includes('/CreateApiKey')) {
            const newPath = '/api/haapi' + url.pathname.replace('/json', '')
            logger.info(`[REDIRECT] HAAPI CreateApiKey → ${AUTH_BASE}${newPath}`)
            callback({ redirectURL: `${AUTH_BASE}${newPath}` })
            return
          }
          if (url.pathname.includes('/CreateToken')) {
            const newPath = '/api/haapi' + url.pathname.replace('/json', '')
            logger.info(`[REDIRECT] HAAPI CreateToken → ${AUTH_BASE}${newPath}`)
            callback({ redirectURL: `${AUTH_BASE}${newPath}` })
            return
          }
          if (url.pathname.includes('/TopicsList') || url.pathname.includes('/PostsList')) {
            // Both forum endpoints are served by the same handler in the emulator.
            // The client hits /TopicsList to list changelog topics and then hits
            // /PostsList (with topic_id) to fetch the content of a specific news.
            const suffix = url.pathname.includes('/PostsList')
              ? '/api/haapi/getForumPostsList'
              : '/api/haapi/getForumTopicsList'
            const newPath = `${AUTH_BASE}${suffix}${url.search}`
            logger.info(`[REDIRECT] HAAPI Forum ${url.pathname.includes('/PostsList') ? 'Posts' : 'Topics'} → ${newPath}`)
            callback({ redirectURL: newPath })
            return
          }
          if (url.pathname.includes('/Cms/Items/Get')) {
            // CmsController is registered under /haapi prefix in the server
            // (routes: /Cms/Items/Get and /Cms/Items/GetPopupIngame). Strip the
            // /json/Ankama/v5 prefix from the client path and route under /haapi.
            const cmsPath = url.pathname
              .replace(/^\/json/, '')
              .replace(/^\/Ankama\/v\d+/, '')
            const newPath = `${AUTH_BASE}/haapi${cmsPath}${url.search}`
            logger.info(`[REDIRECT] HAAPI Cms/Items/Get → ${newPath}`)
            callback({ redirectURL: newPath })
            return
          }
          // Almanax daily event (saint of the day, offering, bonus images):
          // the Almanax tab opens → GET /json/Ankama/v5/Almanax/GetEvent.
          // The auth server proxies it from the real HAAPI (Krosmoz data)
          // with a per-date cache. It used to hit the generic stub below,
          // which returned {} and made the Almanax tab show an error.
          if (url.pathname.includes('/Almanax/GetEvent')) {
            const newPath = '/api/haapi' + url.pathname.replace('/json', '')
            logger.info(`[REDIRECT] HAAPI Almanax GetEvent → ${AUTH_BASE}${newPath}${url.search}`)
            callback({ redirectURL: `${AUTH_BASE}${newPath}${url.search}` })
            return
          }
          // All other HAAPI → stub with empty JSON (client will get no response → error)
          // Return an empty JSON array so the client doesn't crash with JSON parse errors
          logger.info(`[REDIRECT] HAAPI stub → ${url.pathname} — returning empty JSON`)
          callback({ redirectURL: `data:application/json,{}` })
          return
        }

        // Mega shop API (isMegaShop): https://shop-api.ankama.com/{lang}/shops/DOFUS_TOUCH_INGAME/*
        // → http://localhost:3000/api/mega/shops/DOFUS_TOUCH_INGAME/* (the {lang} prefix is stripped;
        //   the ":" in catalog-pages:get is rewritten to "_" to dodge any EmbedIO route quirk —
        //   the server registers both)
        if (url.hostname === 'shop-api.ankama.com') {
          const langless = url.pathname.replace(/^\/[a-z]{2,5}(?=\/shops\/DOFUS_TOUCH_INGAME)/i, '')
          const safePath = langless.replace('catalog-pages:get', 'catalog-pages_get')
          const newPath = '/api/mega' + safePath
          logger.info(`[REDIRECT] MegaShop → ${AUTH_BASE}${newPath}${url.search}`)
          callback({ redirectURL: `${AUTH_BASE}${newPath}${url.search}` })
          return
        }

        // Mega shop IAP list: https://dofustouch.cdn.ankama.com/export-web/iaps.json
        // → http://localhost:3000/api/mega/iaps.json
        if (url.hostname === 'dofustouch.cdn.ankama.com' && url.pathname.startsWith('/export-web/')) {
          const suffix = url.pathname.slice('/export-web/'.length) || 'iaps.json'
          const newPath = '/api/mega/' + suffix
          logger.info(`[REDIRECT] MegaShop IAP → ${AUTH_BASE}${newPath}`)
          callback({ redirectURL: `${AUTH_BASE}${newPath}` })
          return
        }

        // Anything else to ankama-games.com → pass through (WebSocket handled by script.js patch)
        callback({ cancel: false })
      }
    )

    this._win.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['https://*.ankama.com/*', 'https://*.ankama-games.com/*', 'http://localhost:*/*'] },
      (details, callback) => {
        const requestHeaders = { ...(details.requestHeaders ?? {}) }
        // Never touch WebSocket upgrade handshakes: stripping Sec-WebSocket-Key
        // / Sec-WebSocket-Version makes the server reject the upgrade and the
        // auth connection dies with net::ERR_FAILED. Electron reports the
        // resource type as "webSocket" (camelCase), so compare
        // case-insensitively; also skip any /primus path as a fallback.
        const resourceType = String(details.resourceType ?? '').toLowerCase()
        const isSocketUpgrade = resourceType === 'websocket' || details.url.includes('/primus')
        if (!isSocketUpgrade) {
          delete requestHeaders['Referer']
          for (const key of Object.keys(requestHeaders)) {
            if (key.startsWith('Sec-')) delete requestHeaders[key]
          }
        }
        callback({ requestHeaders } as BeforeSendResponse)
      }
    )

    this._win.webContents.setWindowOpenHandler(({ url }) => {
      // If this is the login page URL, handle it inside Electron
      // so the onBeforeRequest interceptor can redirect it
      if (url.includes('/login/ankama')) {
        logger.info(`[WINDOW_OPEN] login URL detected, navigating inside Electron: ${url}`)
        this._win.webContents.loadURL(url)
        return { action: 'deny' }
      }
      // External URLs: open in system browser
      if (url.startsWith('https:') || url.startsWith('http:')) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    this._win.webContents.session.webRequest.onCompleted((details) => {
      if (details.url.startsWith('http://127.0.0.1')) return
      const tag = details.statusCode >= 400 ? 'ERR' : 'OK'
      logger.info(`[HTTP ${tag}] ${details.method} ${details.statusCode} ${details.url}`)
      this._capture.logHttpResponse({
        method: details.method,
        url: details.url,
        statusCode: details.statusCode,
        responseHeaders: details.responseHeaders as Record<string, string | string[]>
      })
    })

    this._win.webContents.session.webRequest.onErrorOccurred((details) => {
      if (details.url.startsWith('http://127.0.0.1')) return
      logger.error(`[HTTP FAIL] ${details.method} ${details.url} — ${details.error}`)
      this._capture.logHttpError(details)
    })
  }

  private _setupEventHandlers() {
    this._win.webContents.on('did-finish-load', () => {
      this._injectHelperBridge()
    })

    // Fallback: when the web-retro platform is down and the login page
    // fails to load, show a user-friendly "Service Unavailable" page
    // with auto-retry instead of a blank/error screen.
    this._win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === -6 /* ERR_FILE_NOT_FOUND */ ||
          errorCode === -102 /* ERR_CONNECTION_REFUSED */ ||
          errorCode === -106 /* ERR_INTERNET_DISCONNECTED */ ||
          errorCode === -118 /* ERR_CONNECTION_TIMED_OUT */ ||
          errorCode === -137 /* ERR_NAME_NOT_RESOLVED */) {
        // Only intercept failures for web-retro URLs
        if (validatedURL.startsWith(WEBRETRO_ORIGIN)) {
          logger.error(`[FALLBACK] Web-retro unavailable (${errorDescription}), showing fallback page for: ${validatedURL}`)
          // Store the failed URL in the hash so the fallback page can use it for retry
          const retryUrl = `data:text/html;charset=utf-8,${encodeURIComponent(SERVICE_UNAVAILABLE_HTML)}#${encodeURIComponent(validatedURL)}`
          this._win.webContents.loadURL(retryUrl)
        }
      }
    })

    const webContentsWithCrashEvent = this._win.webContents as unknown as {
      on(event: 'crashed', listener: (event: Electron.Event, killed: boolean) => void): void
    }
    webContentsWithCrashEvent.on('crashed', (_event, killed) => {
      Sentry.captureEvent({
        message: 'Renderer process crashed',
        level: 'fatal',
        tags: { killed: String(killed) }
      })
      logger.error(`[renderer] Process crashed: killed=${killed}`)
    })

    this._win.webContents.on('unresponsive', () => {
      Sentry.captureMessage('Renderer process unresponsive', 'warning')
      logger.warn('[renderer] Process unresponsive')
    })

    this._win.webContents.on('console-message', (_e: Electron.Event<Electron.WebContentsConsoleMessageEventParams>) => {
      const level = _e.level
      const message = _e.message
      // Persist warnings/errors + diagnostic probes to userData/game-console.log
      // so the game's console can be inspected without the launch terminal.
      if (level === 'warning' || level === 'error' || message.includes('[AUDIOPROBE]')) {
        this._logToFile(`[${level}] ${message}`)
      }
      if (level === 'warning' || level === 'error') {
        logger.error(`[renderer] ${message}`)
        if (message.includes('Uncaught') || message.includes('TypeError') || message.includes('ReferenceError')) {
          Sentry.captureMessage(`[Game] ${message}`, 'error')
        }
      } else {
        logger.info(`[renderer] ${message}`)
      }
    })

    this._win.on('focus', () => {
      const before = this._win.webContents.isAudioMuted()
      if (!this._globalMuted) this._win.webContents.setAudioMuted(false)
      this._logToFile(`[win] focus globalMuted=${this._globalMuted} mutedBefore=${before} mutedAfter=${this._win.webContents.isAudioMuted()}`)
    })

    this._win.on('blur', () => {
      const before = this._win.webContents.isAudioMuted()
      if (this._soundOnFocus) this._win.webContents.setAudioMuted(true)
      this._logToFile(`[win] blur soundOnFocus=${this._soundOnFocus} mutedBefore=${before} mutedAfter=${this._win.webContents.isAudioMuted()}`)
    })

    this._win.on('closed', () => {
      this._capture.stop()
      this.emit('closed')
    })
  }

  private _logToFile(line: string) {
    // Release hardening: renderer stack traces + diagnostic probes in a
    // plaintext file hand internals to users; dev keeps them, packaged
    // builds only log with CUERVOK_DEBUG_LOG=1 (support sessions).
    if (app.isPackaged && process.env.CUERVOK_DEBUG_LOG !== '1') return
    try {
      const logPath = path.join(app.getPath('userData'), 'game-console.log')
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
    } catch { /* best-effort */ }
  }

  private _injectHelperBridge() {
    this._win.webContents.executeJavaScript(getRuntimeHelperSnippet()).catch(() => {})
  }
}
