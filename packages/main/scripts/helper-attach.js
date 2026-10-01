var attach = function () {
  // ─── Runtime crash capture (debug aid) ───
  // The main process only forwards console message TEXT to stdout; the game's
  // own error logging loses the stack.  Register once per page, report the full
  // stack as a console.error so it appears verbatim as `[renderer] ...` in the
  // main process output (grep for `DofEmu-Crash`).
  if (!window.$_dofEmuErrorCapture) {
    window.$_dofEmuErrorCapture = true
    var reportError = function (label, err) {
      try {
        var stack = err && err.stack ? err.stack : err ? String(err) : 'unknown error'
        console.error('[DofEmu-Crash] ' + label + '\n' + stack)
      } catch (e) {}
    }
    window.addEventListener('error', function (event) {
      // Resource-load failures (script/link/img 404 / net error) arrive here
      // with no event.error and no message — the failing URL lives on
      // event.target.  Report it so a boot failure is diagnosable from the
      // main-process log alone.
      var tgt = event && event.target
      if (tgt && tgt !== window && (tgt.src || tgt.href)) {
        console.error('[DofEmu-Crash] resource failed to load: ' + (tgt.src || tgt.href) +
          ' <' + (tgt.tagName || '?').toLowerCase() + '>')
        return
      }
      reportError('error', (event && (event.error || event.message)) || 'unknown error')
    }, true)
    window.addEventListener('unhandledrejection', function (event) {
      reportError('unhandledrejection', event && event.reason)
    }, true)
    var origOnerror = window.onerror
    window.onerror = function (message, source, lineno, colno, error) {
      reportError('onerror', error || message)
      if (typeof origOnerror === 'function') return origOnerror.apply(this, arguments)
    }
  }

  try {
    var gui = window.gui
    var auth = window.$_authManager
    var account = (auth && auth.account) || (gui && gui.account) || window.$_haapiAccount

    // ─── Ensure the game's internal logger object has an error() method ──
    // Some game builds call l.error() during disconnect/shutdown paths and
    // crash the renderer when l.error is undefined.  This is a defensive,
    // non-invasive shim: it only adds a no-op error() when missing.
    try {
      var lLogger = gui && (gui.logger || gui._log || gui.log || (gui && gui.l))
      if (lLogger && typeof lLogger.error !== 'function') {
        lLogger.error = function () {}
      }
    } catch (e) {}

    // ─── Patch getText to be crash-resilient ─────────────────────
    // The game's i18n getText() internally calls l.error() when a key is
    // missing, but the logger object may not have an error() method in some
    // builds.  Wrap getText so it never crashes the renderer.
    if (gui && typeof gui.getText === 'function' && !gui.$_getTextPatched) {
      gui.$_getTextPatched = true
      var originalGetText = gui.getText.bind(gui)
      gui.getText = function (key) {
        try {
          return originalGetText.apply(this, arguments)
        } catch (e) {
          console.warn('[DofEmu] getText failed for key:', key, e && e.message)
          return key || ''
        }
      }
    }

    if (gui && gui.playerData && typeof gui.playerData.setLoginName === 'function') {
      window.$_setLoginName = gui.playerData.setLoginName.bind(gui.playerData)
      if (window.parent && window.parent !== window) window.parent.$_setLoginName = window.$_setLoginName
    }

    if (account) {
      if (typeof account.createToken === 'function') {
        window.$_createToken = account.createToken.bind(account)
        if (window.parent && window.parent !== window) window.parent.$_createToken = window.$_createToken

        if (!window.$_createTokenWithParams) {
          window.$_createTokenWithParams = function (params, cb) {
            try {
              var payload = params || {}
              if (!payload.certificate_id && window.$_authCertId) payload.certificate_id = window.$_authCertId
              if (!payload.certificate_hash && window.$_authCertHash) payload.certificate_hash = window.$_authCertHash
              return account.createToken(payload, cb)
            } catch (err) {
              console.error('DofEmu createToken failed:', err)
            }
          }
          if (window.parent && window.parent !== window) window.parent.$_createTokenWithParams = window.$_createTokenWithParams
        }
      }

      if (typeof account.createTokenWithCertificate === 'function') {
        window.$_createTokenWithCertificate = account.createTokenWithCertificate.bind(account)
        if (window.parent && window.parent !== window) window.parent.$_createTokenWithCertificate = window.$_createTokenWithCertificate
      }
    }

    var mgr = auth && typeof auth.getHaapiKeyManager === 'function'
      ? auth.getHaapiKeyManager()
      : (window.$_haapiModule && typeof window.$_haapiModule.getHaapiKeyManager === 'function')
        ? window.$_haapiModule.getHaapiKeyManager()
        : null

    if (mgr) {
      if (!window.$_setHaapiKey && typeof mgr.setHaapiKey === 'function') {
        window.$_setHaapiKey = function (apiKey, refreshKey, options) {
          try { mgr.setHaapiKey(apiKey, refreshKey || '', options) } catch (err) { console.error('DofEmu setHaapiKey failed:', err) }
        }
        if (window.parent && window.parent !== window) window.parent.$_setHaapiKey = window.$_setHaapiKey
      }

      if (!window.$_getHaapiKey && typeof mgr.getHaapiKey === 'function') {
        window.$_getHaapiKey = function () {
          try { return mgr.getHaapiKey() } catch (err) { console.error('DofEmu getHaapiKey failed:', err); return null }
        }
        if (window.parent && window.parent !== window) window.parent.$_getHaapiKey = window.$_getHaapiKey
      }

      if (!window.$_setHaapiAccountId && typeof mgr.setHaapiAccountId === 'function') {
        window.$_setHaapiAccountId = function (id, options) {
          try { mgr.setHaapiAccountId(id, options) } catch (err) { console.error('DofEmu setHaapiAccountId failed:', err) }
        }
        if (window.parent && window.parent !== window) window.parent.$_setHaapiAccountId = window.$_setHaapiAccountId
      }

      if (!mgr.$_dofEmuApiKeyOnlyPatch && typeof mgr.getHaapiKey === 'function') {
        mgr.$_dofEmuApiKeyOnlyPatch = true
        var originalGetHaapiKey = mgr.getHaapiKey.bind(mgr)
        mgr.getHaapiKey = function () {
          try {
            var keyData = originalGetHaapiKey()
            if (keyData && keyData.key) return keyData
            var fallbackApiKey = window.$_pendingApiKeyHeader || (window.parent && window.parent.$_pendingApiKeyHeader)
            if (!fallbackApiKey && window.localStorage && typeof window.localStorage.getItem === 'function') {
              fallbackApiKey = window.localStorage.getItem('HAAPI_KEY')
            }
            return fallbackApiKey ? { key: fallbackApiKey, refreshToken: '' } : keyData
          } catch (err) {
            console.error('DofEmu getHaapiKey api-key patch failed:', err)
            return null
          }
        }
      }
    }

    if (account && typeof account.createToken === 'function') {
      window.$_haapiDirectLogin = function (opts, cb) {
        try {
          var o = opts || {}
          var localMgr = mgr
          var restoreGet = null
          if (localMgr && typeof localMgr.getHaapiKey === 'function' && o.apiKey) {
            restoreGet = localMgr.getHaapiKey.bind(localMgr)
            localMgr.getHaapiKey = function () {
              return { key: o.apiKey, refreshToken: o.refreshKey || '' }
            }
          }
          if (localMgr) {
            if (o.accountId && localMgr.setHaapiAccountId) localMgr.setHaapiAccountId(o.accountId, { save: o.save !== false })
            if (o.apiKey && localMgr.setHaapiKey) localMgr.setHaapiKey(o.apiKey, o.refreshKey || '', { save: o.save !== false })
          }
          if (o.certificateId) window.$_authCertId = o.certificateId
          if (o.certificateHash) window.$_authCertHash = o.certificateHash
          var payload = Object.assign({}, o.params || {})
          if (!payload.certificate_id && o.certificateId) payload.certificate_id = o.certificateId
          if (!payload.certificate_hash && o.certificateHash) payload.certificate_hash = o.certificateHash
          var done = function (err, res) {
            if (restoreGet && localMgr) localMgr.getHaapiKey = restoreGet
            if (typeof cb === 'function') cb(err, res)
          }
          return account.createToken(payload, done)
        } catch (err) {
          console.error('DofEmu haapiDirectLogin failed:', err)
          if (typeof cb === 'function') cb(err)
        }
      }
      if (window.parent && window.parent !== window) window.parent.$_haapiDirectLogin = window.$_haapiDirectLogin
    }

    if (window.$_haapiModule && window.$_haapiModule.loginWithHaapiKey && !window.$_haapiModule.$_dofEmuPatched) {
      window.$_haapiModule.$_dofEmuPatched = true
      var haapiModule = window.$_haapiModule
      var keyManager = haapiModule.getHaapiKeyManager && haapiModule.getHaapiKeyManager()

      // ── Override loginWithHaapiKey for character-switch re-auth ────
      // When the game disconnects for a character switch and tries to
      // re-authenticate, the key manager is fresh (no key).  Override
      // loginWithHaapiKey so that if the key manager has no key but
      // localStorage has one, we drive the direct-login flow instead of
      // the native HAAPI identification (which fails with reasonNOKEY).
      var _origLoginWithHaapiKey = haapiModule.loginWithHaapiKey.bind(haapiModule)
      haapiModule.loginWithHaapiKey = function (opts, cb) {
        try {
          // Check if key manager already has a key
          var existingKey = keyManager && typeof keyManager.getHaapiKey === 'function' ? keyManager.getHaapiKey() : null
          if (existingKey && existingKey.key) {
            return _origLoginWithHaapiKey(opts, cb)
          }
          // No key in manager — check localStorage
          if (window.localStorage) {
            var storedKey = window.localStorage.getItem('HAAPI_KEY')
            var storedRefresh = window.localStorage.getItem('HAAPI_REFRESH_TOKEN')
            var storedAccountId = window.localStorage.getItem('HAAPI_ACCOUNTID')
            if (storedKey) {
              console.debug('[DofEmu] loginWithHaapiKey: no key in manager, using localStorage fallback')
              // Prime the key into the manager
              if (keyManager) {
                if (typeof keyManager.setHaapiKey === 'function') keyManager.setHaapiKey(storedKey, storedRefresh || '', { save: true })
                if (storedAccountId && typeof keyManager.setHaapiAccountId === 'function') keyManager.setHaapiAccountId(Number(storedAccountId), { save: true })
              }
              // Also try the direct login path if we have a token
              var storedToken = window.localStorage.getItem('HAAPI_TOKEN')
              if (storedToken && typeof window.$_finishDirectLogin === 'function') {
                try {
                  if (typeof window.$_primeHaapiKey === 'function') {
                    window.$_primeHaapiKey(storedKey, storedRefresh || '', storedAccountId ? Number(storedAccountId) : null)
                  }
                  window.$_finishDirectLogin({
                    token: storedToken,
                    loginName: '',
                    account: '',
                    forcedAccount: ''
                  })
                  if (typeof cb === 'function') cb(null)
                  return
                } catch (e) {
                  console.error('[DofEmu] Direct login fallback failed:', e)
                }
              }
              // Fallback: retry the original with the primed key
              return _origLoginWithHaapiKey(opts, cb)
            }
          }
          // No stored key at all — fall through to original
          return _origLoginWithHaapiKey(opts, cb)
        } catch (err) {
          console.error('[DofEmu] loginWithHaapiKey override failed:', err)
          if (typeof cb === 'function') cb(err)
        }
      }

      window.$_primeHaapiKey = function (apiKey, refreshKey, accountId, certificateId, certificateHash) {
        try {
          var km = (haapiModule.getHaapiKeyManager ? haapiModule.getHaapiKeyManager() : null) || keyManager
          if (km) {
            if (accountId && km.setHaapiAccountId) km.setHaapiAccountId(accountId, { save: true })
            if (apiKey && km.setHaapiKey) km.setHaapiKey(apiKey, refreshKey || '', { save: true })
          }
          if (window.localStorage) {
            window.localStorage.setItem('HAAPI_KEY', apiKey || '')
            window.localStorage.setItem('HAAPI_REFRESH_TOKEN', refreshKey || '')
            // Also save the current token for character-switch re-auth
            // (loginWithHaapiKey override reads this to drive direct login)
            var currentToken = window.dofus && window.dofus._token ? window.dofus._token : ''
            if (currentToken) window.localStorage.setItem('HAAPI_TOKEN', currentToken)
            if (typeof accountId === 'number') {
              window.localStorage.setItem('HAAPI_ACCOUNTID', accountId.toString())
              window.localStorage.setItem(accountId + '_CERTIFICATE_ID', certificateId || '')
              window.localStorage.setItem(accountId + '_CERTIFICATE_HASH', certificateHash || '')
            }
          }
          window.$_authCertId = certificateId || ''
          window.$_authCertHash = certificateHash || ''
          if (window.parent && window.parent !== window) {
            window.parent.$_authCertId = window.$_authCertId
            window.parent.$_authCertHash = window.$_authCertHash
          }
        } catch (err) {
          console.error('DofEmu primeHaapiKey failed:', err)
        }
      }

      window.$_finishDirectLogin = function (options) {
        try {
          var manager = haapiModule.getHaapiKeyManager()
          if (!manager || typeof manager.getHaapiAccountId !== 'function') throw new Error('No haapi key manager')
          var accountId = manager.getHaapiAccountId()
          if (!accountId) throw new Error('Missing account id')
          var forcedAccount = options && options.forcedAccount || ''
          window.gui.playerData.setForcedAccount(forcedAccount)
          window.dofus.setCredentials(accountId.toString(), options.token, forcedAccount)
          var loginName = options && (options.loginName || options.account)
          if (loginName) window.gui.playerData.setLoginName(loginName)
          window.gui.splashScreen.show()
          window.dofus.login(function (err, state) {
            if (err) {
              window.dofus.disconnect()
              console.error('Direct login failed', err)
              window.gui.loginScreen.displayAppropriateForm()
              return
            }
            if (state && state.disconnected) {
              window.dofus.disconnect()
              return
            }
            // Save the token for character-switch re-auth
            if (options && options.token && window.localStorage) {
              window.localStorage.setItem('HAAPI_TOKEN', options.token)
            }
            window.gui.initializeAfterLogin(function (initErr) {
              if (initErr) {
                console.error('initializeAfterLogin failed:', initErr)
                window.gui.openSimplePopup(window.gui.getText('ui.popup.connectionFailed.text'))
                window.gui.loginScreen.displayAppropriateForm()
              }
            })
          })
        } catch (err) {
          console.error('finishDirectLogin failed:', err)
          window.gui.loginScreen.displayAppropriateForm()
        }
      }
    }

    // ─── Launcher "SEGUIR COMO" auto-login ────────────────────────
    // The game's native launcher shows a "SEGUIR COMO <nick>" button
    // (ContinueForm._continue -> loginScreen.continuePlay) whenever a HAAPI
    // key is present in storage. Clicking it runs the official HAAPI flow
    // (resetHaapiKey + _login -> startLoginProcess) which our emulator can't
    // complete, so the player gets stuck on the launcher. We intercept
    // continuePlay: ask the parent app for the saved session for this game
    // window and drive the proven direct login (primeHaapiKey +
    // finishDirectLogin). If the parent has no session (or never answers), we
    // fall back to the original flow so the launcher keeps working.
    var loginScreen = gui && gui.loginScreen
    if (loginScreen && typeof loginScreen.continuePlay === 'function' && !loginScreen.$_dofEmuContinuePatched) {
      loginScreen.$_dofEmuContinuePatched = true
      var originalContinuePlay = loginScreen.continuePlay.bind(loginScreen)
      loginScreen.continuePlay = function () {
        try {
          var settled = false
          var settle = function (session) {
            if (settled) return
            settled = true
            window.removeEventListener('message', onSessionMsg)
            if (session && session.token && typeof window.$_finishDirectLogin === 'function') {
              try {
                if (typeof window.$_primeHaapiKey === 'function') {
                  window.$_primeHaapiKey(session.apiKey, session.refreshToken || '', session.accountId)
                }
                window.$_finishDirectLogin({
                  token: session.token,
                  loginName: session.username,
                  account: session.username,
                  forcedAccount: ''
                })
                return
              } catch (err) {
                console.error('DofEmu launcher direct login failed:', err)
              }
            }
            originalContinuePlay()
          }
          var onSessionMsg = function (e) {
            var d = e && e.data
            if (d && d.type === 'cuervok:launcher-login-response') settle(d.session || null)
          }
          window.addEventListener('message', onSessionMsg)
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: 'cuervok:launcher-login-request',
              gameId: window.$game_id || ''
            }, '*')
            setTimeout(function () { settle(null) }, 4000)
          } else {
            settle(null)
          }
        } catch (err) {
          originalContinuePlay()
        }
      }
    }

    // ─── Auto-reprime HAAPI key after character switch ─────────
    // When the game disconnects (CLIENT_CLOSING) for a character switch, the
    // HAAPI module is recreated from scratch.  The old key manager patch is
    // gone, so identification() fails with reasonNOKEY.  On every attach(),
    // check localStorage for a saved API key and re-prime it into the fresh
    // key manager so identification() succeeds automatically.
    if (mgr && window.localStorage) {
      var storedKey = window.localStorage.getItem('HAAPI_KEY')
      var storedRefresh = window.localStorage.getItem('HAAPI_REFRESH_TOKEN')
      var storedAccountId = window.localStorage.getItem('HAAPI_ACCOUNTID')
      if (storedKey && typeof mgr.setHaapiKey === 'function') {
        try {
          mgr.setHaapiKey(storedKey, storedRefresh || '', { save: true })
          if (storedAccountId && typeof mgr.setHaapiAccountId === 'function') {
            mgr.setHaapiAccountId(Number(storedAccountId), { save: true })
          }
          console.debug('[DofEmu] Re-primed HAAPI key from localStorage')
        } catch (e) {
          console.warn('[DofEmu] Failed to re-prime HAAPI key:', e)
        }
      }
    }

    // ─── makeUrlSticky is handled in processGame() (regex patch on script.js) ───
    // The game's script.js defines makeUrlSticky as a local function, NOT on
    // Primus.prototype.  primus.js is an older version that doesn't have
    // makeUrlSticky at all.  The fix is applied via processGame() which changes
    // console.warn to console.debug.

    // ─── Notify parent when the game is fully initialized ──────────
    // The parent (GameScreen) shows a "Loading game assets" backdrop until
    // it receives a `cuervok:init-done` postMessage.  We detect readiness by
    // checking for the core game objects that initDofus sets up.
    if (!window.$_initDoneSent) {
      if (window.gui && window.dofus && typeof window.dofus.setCredentials === 'function') {
        window.$_initDoneSent = true
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'cuervok:init-done' }, '*')
          }
        } catch (err) {
          console.error('DofEmu init-done postMessage failed:', err)
        }
      }
    }

    if (!window.$_dofEmuFetchPatched && typeof window.fetch === 'function') {
      window.$_dofEmuFetchPatched = true
      var originalFetch = window.fetch
      window.fetch = function (input, init) {
        try {
          var url = typeof input === 'string' ? input : input && input.url ? input.url.toString() : ''

          // ─── Sentry IPC: silently swallow ───
          // The game's embedded Sentry SDK attempts to fetch from
          // sentry-ipc://scope/sentry_key which is a custom protocol
          // provided by @sentry/electron's main process.  Since we
          // don't run the full Sentry Electron integration, these
          // requests fail with "URL scheme sentry-ipc is not supported".
          // Return an empty response to avoid polluting the logs.
          if (url && url.indexOf('sentry-ipc://') === 0) {
            return Promise.resolve(new Response('null', {
              status: 200,
              statusText: 'OK',
              headers: { 'Content-Type': 'application/json' }
            }))
          }

          var isHaapiV5 = url && url.indexOf('/json/Ankama/v5/') !== -1
          var shouldInjectApiKey = isHaapiV5 && url.indexOf('/Cms') === -1 && url.indexOf('/Forum') === -1
          if (shouldInjectApiKey) {
            init = init || {}
            var headers = init.headers && typeof init.headers === 'object' ? init.headers : {}
            var apiKey = window.$_pendingApiKeyHeader || (window.parent && window.parent.$_pendingApiKeyHeader)
            if (apiKey) {
              var hasApiKeyHeader = false
              if (typeof headers.forEach === 'function') {
                headers.forEach(function (_value, key) {
                  if (String(key).toLowerCase() === 'apikey') hasApiKeyHeader = true
                })
              } else {
                hasApiKeyHeader = Object.keys(headers).some(function (key) {
                  return String(key).toLowerCase() === 'apikey'
                })
              }
              if (!hasApiKeyHeader) {
                if (typeof headers.append === 'function') {
                  headers.append('APIKEY', apiKey)
                } else {
                  headers = Object.assign({}, headers, { APIKEY: apiKey })
                }
              }
              init.headers = headers
            }
          }
        } catch (err) {
          console.error('DofEmu fetch override failed:', err)
        }
        return originalFetch.call(this, input, init).then(function(response) {
          try {
            if (url.indexOf('/json/Ankama/v5/') !== -1) {
              if (url.indexOf('/CreateApiKey') !== -1) {
                response.clone().json().then(function(data) {
                  window.$_nativeAuthCapture = window.$_nativeAuthCapture || {}
                  window.$_nativeAuthCapture.apiKey = data.key || data.apiKey || ''
                  window.$_nativeAuthCapture.accountId = data.account_id != null ? Number(data.account_id) : null
                  if (init && init.body && typeof init.body === 'string') {
                    try {
                      var params = new URLSearchParams(init.body)
                      window.$_nativeAuthCapture.username = params.get('login') || ''
                    } catch(e) {}
                  }
                }).catch(function() {})
              }
              if (url.indexOf('/CreateToken') !== -1) {
                response.clone().json().then(function(data) {
                  window.$_nativeAuthCapture = window.$_nativeAuthCapture || {}
                  window.$_nativeAuthCapture.token = data.token || ''
                  var auth = window.$_nativeAuthCapture
                  // Save token to localStorage for character-switch re-auth
                  if (data.token && window.localStorage) {
                    window.localStorage.setItem('HAAPI_TOKEN', data.token)
                  }
                  if (auth.apiKey && auth.token) {
                    try {
                      window.parent.postMessage({
                        type: 'cuervok:native-login-success',
                        gameId: window.$game_id || '',
                        apiKey: auth.apiKey,
                        token: auth.token,
                        accountId: auth.accountId || null,
                        username: auth.username || ''
                      }, '*')
                    } catch(e) {}
                  }
                }).catch(function() {})
              }
            }
          } catch(e) {}
          return response
        })
      }
    }
  } catch (err) {
    console.error('DofEmu expose helpers failed:', err)
  }
}
