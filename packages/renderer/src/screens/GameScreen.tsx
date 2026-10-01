import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react'
import { useSettings } from '@/App'
import { Plus, X, Settings, Minus, Square, Copy } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useSavedAccountsStore, buildSavedAccount } from '@/stores/savedAccountsStore'
import { WindowButton } from '@/components/WindowButton'
import { useGameTabStore, GameTab } from '@/stores/gameTabStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTeamStore } from '@/stores/teamStore'
import { useHotkeys } from '@/hooks/use-hotkeys'
import { initAutoGroup, broadcastLeaderPosition, destroyAutoGroup, sendPartyInvite, autoAcceptPartyInvite } from '@/mods/auto-group'
import { initNotificationFocus } from '@/mods/notification-focus'
import { colors } from '@/theme'
import { captureCharacterIcon } from '@/utils/capture-icon'
import type { HotkeyAction, AuthSession, SavedAccount } from '@cuervok/shared'
import { DofusWindow, HTMLIFrameElementWithDofus } from '@/types/dofus-window'
import logoImg from '@/assets/logo.png'
import loadingBgImg from '@/assets/game-loading-bg.png'

const TITLEBAR_HEIGHT = 32
const MAX_POLL_ATTEMPTS = 50
const POLL_INTERVAL = 200
const RESIZE_DELAYS = [100, 250, 500, 1000, 2000]
const PARTY_INVITE_DELAY = 3000

declare global {
  interface Window {
    $gameWindows: DofusWindow[]
    $game_id: string
    $current_id: string
    $appSchemeLinkCalled: (payload: string) => void
  }
}

const loadingBackdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  background: '#07080c'
}

function GameLoadingBackdrop({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={loadingBackdropStyle}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${loadingBgImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          transform: 'scale(1.05)',
          filter: 'saturate(1.02)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(7,8,12,0.18) 0%, rgba(7,8,12,0.6) 42%, rgba(7,8,12,0.92) 100%)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(7,8,12,0.88) 0%, rgba(7,8,12,0.36) 44%, rgba(7,8,12,0.82) 100%)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '8%',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 'min(420px, 78vw)',
          padding: '24px 24px 22px',
          borderRadius: 22,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(8,10,16,0.74) 0%, rgba(8,10,16,0.86) 100%)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(8px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <img src={logoImg} alt="" style={{ width: 44, height: 44, filter: 'drop-shadow(0 0 18px rgba(201,162,77,0.4))' }} />
          <div>
            <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(201,162,77,0.92)', fontWeight: 700 }}>
              Cuervok
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>Preparing the client</div>
          </div>
        </div>

        <div style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 800, color: '#fff', marginBottom: 10 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.64)', marginBottom: 18 }}>
          {subtitle}
        </div>

        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.1)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: '42%',
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, rgba(201,162,77,0.62) 0%, rgba(232,199,106,0.98) 100%)',
              boxShadow: '0 0 24px rgba(201,162,77,0.28)',
              animation: 'cuervok-pulse 2s ease-in-out infinite',
              transformOrigin: 'left center'
            }}
          />
        </div>
      </div>
    </div>
  )
}


function GameIframe({ tab, gameSrc, isVisible, onIframeRef }: { tab: GameTab; gameSrc: string; isVisible: boolean; onIframeRef?: (el: HTMLIFrameElementWithDofus | null) => void }) {
  const iframeRef = useRef<HTMLIFrameElementWithDofus>(null)
  const cleanupRef = useRef<Array<() => void>>([])
  const initCalledRef = useRef(false)
  const { setTabReady, setTabLoading, setTabCharacter } = useGameTabStore()

  // Stable ref to avoid the effect re-running on every render (onIframeRef is inline)
  const onIframeRefRef = useRef(onIframeRef)
  onIframeRefRef.current = onIframeRef

  useEffect(() => {
    onIframeRefRef.current?.(iframeRef.current)
    return () => onIframeRefRef.current?.(null)
  }, []) // Only mount/unmount — always reads the latest callback via ref

  const cleanupGameListeners = () => {
    for (const cleanup of cleanupRef.current) cleanup()
    cleanupRef.current = []
  }

  useEffect(() => cleanupGameListeners, [])

  // Safety net: if the game never sends cuervok:init-done, force-ready the tab
  // after 15s so the iframe is always usable. Also attach game listeners if the
  // game window is reachable (covers the case where postMessage never fires).
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (initCalledRef.current) return
      window.cuervok.logger.info('GameIframe: safety timeout reached, forcing isReady=true for tab', tab.id)
      initCalledRef.current = true
      setTabReady(tab.id, true)
      setTabLoading(tab.id, false)

      const iframe = iframeRef.current
      if (iframe?.contentWindow) {
        const gw = iframe.contentWindow as unknown as DofusWindow
        if (gw.gui || gw.dofus) {
          if (!window.parent.$gameWindows) {
            window.parent.$gameWindows = []
          }
          gw.$game_id = tab.id
          window.parent.$current_id = tab.id
          if (!window.parent.$gameWindows.some((w) => w.$game_id === tab.id)) {
            window.parent.$gameWindows.push(gw)
          }
          onInitDone(gw)
        }
      }
    }, 15_000)
    return () => clearTimeout(timeout)
  }, [tab.id, setTabReady, setTabLoading])

  // Listen for auto-init from iframe (postMessage)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'cuervok:init-done') return
      if (initCalledRef.current) return

      const iframe = iframeRef.current
      if (!iframe || e.source !== iframe.contentWindow) return

      initCalledRef.current = true
      const gameWindow = iframe.contentWindow as DofusWindow
      window.cuervok.logger.info('initDofus done for tab', tab.id)

      if (!window.parent.$gameWindows) {
        window.parent.$gameWindows = []
      }
      gameWindow.$game_id = tab.id
      window.parent.$current_id = tab.id
      window.parent.$gameWindows.push(gameWindow)

      setTabReady(tab.id, true)
      setTabLoading(tab.id, false)

      onInitDone(gameWindow)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [tab.id])

  const handleLoad = () => {
    if (!iframeRef.current) return
    cleanupGameListeners()
    initCalledRef.current = false
  }

  const onInitDone = (gameWindow: DofusWindow) => {
    // Discord RPC: game initialized, show 'In menus' state
    try {
      window.cuervok.updateDiscordPresence(JSON.stringify({
        details: 'In menus',
        state: 'Character selection',
        largeImageKey: 'dofus_logo',
        largeImageText: 'Dofus Touch — Cuervok',
        buttons: [
          { label: 'Join Discord', url: 'https://discord.gg/hbKhGnQFM' },
          { label: 'Website', url: 'https://cuervok.com' }
        ]
      }))
    } catch {}

    const kickResize = () => {
      try {
        gameWindow.dispatchEvent(new Event('resize'))
        gameWindow.gui?._resizeUi?.()
      } catch {}
    }

    kickResize()
    RESIZE_DELAYS.forEach((ms) => setTimeout(kickResize, ms))

    const observer = new ResizeObserver(kickResize)
    if (iframeRef.current) observer.observe(iframeRef.current)
    cleanupRef.current.push(() => observer.disconnect())

    const gw = gameWindow as any

    const attachGameListeners = () => {
      if (!gw.gui?.playerData || !gw.dofus?.connectionManager) return false

      gw.gui.playerData.on('characterSelectedSuccess', () => {
        const name = gw.gui.playerData.characterBaseInformations?.name
        if (name) {
          setTabCharacter(tab.id, name)

          // Update Discord Rich Presence with character info
          const charInfo = gw.gui.playerData.characterBaseInformations
          const breed = charInfo?.breed ?? 0
          const level = charInfo?.level ?? 0
          const DOFUS_CLASS_NAMES: Record<number, string> = {
            1: 'Feca', 2: 'Osamodas', 3: 'Enutrof', 4: 'Sram',
            5: 'Xelor', 6: 'Ecaflip', 7: 'Eniripsa', 8: 'Iop',
            9: 'Cra', 10: 'Sadida', 11: 'Sacrier', 12: 'Pandawa',
            13: 'Rogue', 14: 'Masqueraider', 15: 'Foggernaut'
          }
          const className = DOFUS_CLASS_NAMES[breed] || 'Adventurer'
          try {
            window.cuervok.updateDiscordPresence(JSON.stringify({
              details: 'Playing as ' + name,
              state: 'Level ' + level + ' ' + className,
              largeImageKey: 'dofus_logo',
              largeImageText: 'Dofus Touch — Cuervok',
              smallImageKey: className.toLowerCase(),
              smallImageText: className,
              startTimestamp: Date.now(),
              buttons: [
                { label: 'Join Discord', url: 'https://discord.gg/hbKhGnQFM' },
                { label: 'Website', url: 'https://cuervok.com' }
              ]
            }))
          } catch {}

          const teamState = useTeamStore.getState()
          const matchedChar = teamState.getCharacterByName(name)
          if (matchedChar) {
            teamState.linkCharacterToTab(matchedChar.id, tab.id)


            const settings = useSettingsStore.getState()
            if (settings.game.autoGroupEnabled && settings.game.autoInviteEnabled && teamState.activeTeamId) {
              const team = teamState.getTeam(teamState.activeTeamId)
              if (team && team.memberIds.includes(matchedChar.id)) {
                const leader = teamState.getCharacter(team.leaderId)

                if (matchedChar.id !== team.leaderId && leader) {

                  autoAcceptPartyInvite(gw, leader.name)


                  const leaderTabId = teamState.getTabForCharacter(team.leaderId)
                  if (leaderTabId) {
                    const leaderGw = window.$gameWindows?.find((gw) => gw.$game_id === leaderTabId)
                    if (leaderGw) {
                      setTimeout(() => sendPartyInvite(leaderGw, name), PARTY_INVITE_DELAY)
                    }
                  }
                }
              }
            }
          }
        }

        const look = gw.gui.playerData.characterBaseInformations?.entityLook
        if (!gw.CharacterDisplay || !look) return

        const charDisplay = new gw.CharacterDisplay({ scale: 'fitin' })
        charDisplay.setLook(look, {
          riderOnly: true, direction: 4, animation: 'AnimArtwork',
          boneType: 'timeline/', skinType: 'timeline/'
        })
        charDisplay.rootElement.style.cssText = 'position:absolute;left:-9999px;width:128px;height:128px;'
        gw.document.body.appendChild(charDisplay.rootElement)

        captureCharacterIcon(charDisplay, gw.document, (dataUrl) => {
          const charName = gw.gui.playerData.characterBaseInformations?.name
          if (charName) {
            window.cuervok.saveCharacterImage(charName, dataUrl)
            // Update the saved account with the character name
            const account = useSavedAccountsStore.getState().getByUsername(
              useAuthStore.getState().sessions[tab.id]?.username ?? ''
            )
            if (account) {
              useSavedAccountsStore.getState().addOrUpdate({
                ...account,
                characterName: charName,
                lastUsedAt: new Date().toISOString()
              })
            }
          }
          window.top?.postMessage({ type: 'cuervok:char-icon', tabId: tab.id, dataUrl }, '*')
        })
      })

      cleanupRef.current.push(initNotificationFocus(gameWindow, tab.id, {
        shouldNotify: () => useSettingsStore.getState().game.notificationsEnabled,
        isActiveTab: (tabId) => useGameTabStore.getState().activeTabId === tabId,
        focusTab: (tabId) => useGameTabStore.getState().setActiveTab(tabId)
      }))

      return true
    }

    if (!attachGameListeners()) {
      let attempts = 0
      const poll = setInterval(() => {
        if (attachGameListeners() || ++attempts > MAX_POLL_ATTEMPTS) clearInterval(poll)
      }, POLL_INTERVAL)
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: isVisible ? 'block' : 'none'
      }}
    >
      <iframe
        ref={iframeRef}
        onLoad={handleLoad}
        src={gameSrc + '?id=' + tab.id}
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'block'
        }}
      />
      {!tab.isReady && (
        <GameLoadingBackdrop
          title="Loading game assets"
          subtitle={`Opening ${tab.characterName || tab.name}. The game screen will appear as soon as the client finishes booting.`}
        />
      )}
    </div>
  )
}

export function GameScreen() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, canAddTab, reorderTabs } = useGameTabStore()
  const { hotkeys, game, loadSettings, isHydrated } = useSettingsStore()
  const authSessions = useAuthStore((s) => s.sessions)
  const { activeTeamId, teams, characterTabMap } = useTeamStore()
  const { setSettingsOpen } = useSettings()
  const [gameSrc, setGameSrc] = useState('')
  const [isMaximized, setIsMaximized] = useState(false)
  const [dragTabId, setDragTabId] = useState<string | null>(null)
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null)
  const iframeRefs = useRef<Record<string, HTMLIFrameElementWithDofus | null>>({})

  const getGameWindow = useCallback((tabId: string): any => {
    return iframeRefs.current[tabId]?.contentWindow ?? null
  }, [])

  /**
   * Drive the game's native login from our authenticated session.
   * The helper bridge (injected into the game iframe) exposes $_primeHaapiKey
   * and $_finishDirectLogin; the latter calls window.dofus.setCredentials +
   * window.dofus.login to perform the WebSocket handshake against the emulator.
   */
  const driveGameLogin = useCallback((tabId: string, session: AuthSession) => {
    let cancelled = false
    let pollCount = 0

    const readyPoll = setInterval(() => {
      if (cancelled) return clearInterval(readyPoll)
      pollCount++
      const gw = getGameWindow(tabId) as any
      if (!gw) {
        if (pollCount > 120) {
          clearInterval(readyPoll)
          window.cuervok.logger.error('[driveGameLogin] timeout: game window never appeared for tab', tabId)
          useAuthStore.getState().setError(tabId, 'No se pudo conectar: la ventana del juego no está disponible')
        }
        return
      }
      // Wait for the helper bridge + dofus login entry points to be ready
      if (typeof gw.$_finishDirectLogin !== 'function' || !gw.dofus?.setCredentials || !gw.gui?.playerData) {
        if (pollCount > 120) {
          clearInterval(readyPoll)
          window.cuervok.logger.error('[driveGameLogin] timeout: game not ready', {
            hasFinishDirectLogin: typeof gw.$_finishDirectLogin,
            hasSetCredentials: !!gw.dofus?.setCredentials,
            hasPlayerData: !!gw.gui?.playerData
          })
          useAuthStore.getState().setError(tabId, 'No se pudo conectar: el juego aún no está listo (timeout)')
        }
        return
      }
      clearInterval(readyPoll)
      window.cuervok.logger.info('[driveGameLogin] game window ready, injecting credentials for tab', tabId)

      try {
        if (typeof gw.$_primeHaapiKey === 'function') {
          gw.$_primeHaapiKey(session.apiKey, session.refreshToken || '', session.accountId)
        }
        gw.dofus.setCredentials(String(session.accountId || ''), session.token, '')
        gw.gui.playerData.setLoginName(session.username)
        gw.$_finishDirectLogin({
          token: session.token,
          loginName: session.username,
          account: session.username,
          forcedAccount: ''
        })
      } catch (err) {
        window.cuervok.logger.error('[driveGameLogin] failed', err)
        useAuthStore.getState().setError(tabId, err instanceof Error ? err.message : 'Login injection failed')
      }

      // Poll for game-side login confirmation: playerData.loginName set or login screen hidden
      let confirmCount = 0
      const confirmPoll = setInterval(() => {
        if (cancelled) return clearInterval(confirmPoll)
        confirmCount++
        const w = getGameWindow(tabId) as any
        if (!w) {
          if (confirmCount > 90) {
            clearInterval(confirmPoll)
            window.cuervok.logger.error('[driveGameLogin] confirm timeout: game window disappeared', tabId)
          }
          return
        }
        const loginName = w.gui?.playerData?.loginName
        const connected = typeof w.gui?.isConnected === 'function' ? w.gui.isConnected() : false
        if ((loginName && loginName === session.username) || connected) {
          clearInterval(confirmPoll)
          window.cuervok.logger.info('[driveGameLogin] game confirmed login for tab', tabId, { loginName, connected })
          useAuthStore.getState().setSession(tabId, { ...session, status: 'authenticated' })
          return
        }
        if (confirmCount > 90) {
          clearInterval(confirmPoll)
          window.cuervok.logger.error('[driveGameLogin] confirm timeout: game did not respond', tabId, { loginName, connected })
          useAuthStore.getState().setError(tabId, 'El juego no respondió al login (timeout)')
        }
      }, 500)
    }, 500)

    return () => { cancelled = true }
  }, [getGameWindow])

  /**
   * One-click reconnect from a saved account. Tries the cached apiKey first
   * (CreateToken only — fast path); if the apiKey has expired, falls back to a
   * full re-auth using the stored password (private emulator: any password works).
   */
  const reconnectAccount = useCallback(async (tabId: string, account: SavedAccount) => {
    try {
      const session = await useAuthStore.getState().loginWithApiKey(tabId, account)
      useSavedAccountsStore.getState().updateCache(account.id, session.apiKey, session.token)
      useSavedAccountsStore.getState().touchLastUsed(account.id)
      driveGameLogin(tabId, session)
    } catch {
      // Cached apiKey expired — fall back to full re-auth with stored credentials
      try {
        const session = await useAuthStore.getState().login(tabId, {
          username: account.username,
          password: account.password
        })
        useSavedAccountsStore.getState().updateCache(account.id, session.apiKey, session.token)
        useSavedAccountsStore.getState().touchLastUsed(account.id)
        driveGameLogin(tabId, session)
      } catch (err) {
        useAuthStore.getState().setError(tabId, err instanceof Error ? err.message : 'Reconnect failed')
      }
    }
  }, [driveGameLogin])

  useEffect(() => {
    if (!isHydrated) loadSettings()
  }, [isHydrated, loadSettings])

  useEffect(() => {
    useSavedAccountsStore.getState().hydrate()
  }, [])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'cuervok:char-icon') {
        useGameTabStore.getState().setTabIcon(e.data.tabId, e.data.dataUrl)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // ─── Native login capture ─────────────────────────────────────
  // When the user logs in through the game's native login screen (inside the
  // iframe), the helper script intercepts CreateApiKey + CreateToken responses
  // and sends the auth data here via postMessage.  We store it in authStore
  // so the Cuervok client knows the user is authenticated, and persist the
  // account in savedAccountsStore for one-click reconnect on next launch.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'cuervok:native-login-success') return
      const { apiKey, token, accountId, username, gameId } = e.data as {
        apiKey: string; token: string; accountId: number | null;
        username: string; gameId: string
      }

      // Identify which tab this message belongs to
      let tabId = gameId || ''
      if (!tabId) {
        for (const [tid, el] of Object.entries(iframeRefs.current)) {
          if (el?.contentWindow === e.source) { tabId = tid; break }
        }
      }
      if (!tabId) tabId = useGameTabStore.getState().activeTabId ?? ''

      window.cuervok.logger.info('[native-login] captured auth data for tab', tabId, { username, hasApiKey: !!apiKey, hasToken: !!token })

      const session: AuthSession = {
        username: username || '',
        token: String(token || ''),
        apiKey: String(apiKey || ''),
        accountId: accountId ?? null,
        refreshToken: '',
        status: 'authenticated',
        createdAt: new Date().toISOString()
      }

      useAuthStore.getState().setSession(tabId, session)

      // Persist account for one-click reconnect
      if (username) {
        const account = buildSavedAccount({
          username,
          password: '',
          accountId,
          apiKey,
          token,
        })
        useSavedAccountsStore.getState().addOrUpdate(account)
        useSavedAccountsStore.getState().updateCache(account.id, apiKey, token)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])


  useEffect(() => {
    const teamState = useTeamStore.getState()
    const tabIds = new Set(tabs.map((t) => t.id))
    for (const [, tid] of Object.entries(teamState.characterTabMap)) {
      if (!tabIds.has(tid)) teamState.unlinkTab(tid)
    }
  }, [tabs])

  useEffect(() => {
    const unsub = window.cuervok.onAuthCallback((url) => {
      const iframes = document.querySelectorAll('iframe')
      for (const iframe of iframes) {
        try {
          const win = (iframe as HTMLIFrameElement).contentWindow as any
          if (win?.$appSchemeLinkCalled) {
            win.$appSchemeLinkCalled(url)
            return
          }
        } catch {}
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    return window.cuervok.onNativeNotificationClick((tabId) => {
      if (tabId) useGameTabStore.getState().setActiveTab(tabId)
    })
  }, [])

  useEffect(() => {
    window.cuervok.fetchGameContext().then((ctx) => {
      window.buildVersion = ctx.buildVersion
      window.appVersion = ctx.appVersion
      window.appInfo = { version: ctx.appVersion }
      ;(window as typeof window & { platform?: string }).platform = ctx.platform
      setGameSrc(ctx.gameSrc)
    })
  }, [])

  // ─── Auto-login: pick up pending auth from the login page ───────────
  // After the user authenticates on the login page (loaded via
  // setWindowOpenHandler → loadURL), the main process stores the auth
  // in electron-store as 'pending_game_login' and navigates back to
  // this renderer. We read it here and drive the game login.
  useEffect(() => {
    const checkPending = async () => {
      try {
        const raw = await window.cuervok.storeGet('pending_game_login')
        if (!raw) return
        const pending = JSON.parse(raw)
        if (!pending?.apiKey) return
        // Clear the pending login so it's not consumed again
        window.cuervok.storeDelete('pending_game_login')

        window.cuervok.logger.info('[pending-login] Consuming pending game login', { username: pending.username })

        // Find or create a tab
        const activeId = useGameTabStore.getState().activeTabId
        const tabId = activeId || tabs[0]?.id
        if (!tabId) return

        const session: AuthSession = {
          username: pending.username || '',
          token: String(pending.token || ''),
          apiKey: String(pending.apiKey || ''),
          accountId: pending.accountId ?? null,
          refreshToken: pending.refreshToken || '',
          status: 'authenticated',
          createdAt: new Date().toISOString()
        }

        useAuthStore.getState().setSession(tabId, session)
        driveGameLogin(tabId, session)
      } catch (err) {
        window.cuervok.logger.error('[pending-login] Failed to consume pending login', err)
      }
    }
    // Small delay to let the game iframe start loading
    const timer = setTimeout(checkPending, 800)
    return () => clearTimeout(timer)
  }, [tabs, driveGameLogin])

  const handleHotkeyAction = useCallback(
    (action: HotkeyAction) => {
      const tabStore = useGameTabStore.getState()
      const currentTabs = tabStore.tabs
      const currentActiveId = tabStore.activeTabId

      switch (action) {
        case 'switch-tab-1':
        case 'switch-tab-2':
        case 'switch-tab-3':
        case 'switch-tab-4':
        case 'switch-tab-5': {
          const index = parseInt(action.replace('switch-tab-', ''), 10) - 1
          if (currentTabs[index]) tabStore.setActiveTab(currentTabs[index].id)
          break
        }
        case 'new-tab':
          if (tabStore.canAddTab()) tabStore.addTab()
          break
        case 'close-tab':
          if (currentActiveId) tabStore.removeTab(currentActiveId)
          break
        case 'toggle-mute':
          useSettingsStore.getState().toggleAudioMute()
          break
        case 'toggle-notifications':
          useSettingsStore.getState().toggleNotifications()
          break
        case 'next-tab': {
          const currentIdx = currentTabs.findIndex((t) => t.id === currentActiveId)
          const nextIdx = (currentIdx + 1) % currentTabs.length
          tabStore.setActiveTab(currentTabs[nextIdx].id)
          break
        }
        case 'prev-tab': {
          const currentIdx = currentTabs.findIndex((t) => t.id === currentActiveId)
          const prevIdx = (currentIdx - 1 + currentTabs.length) % currentTabs.length
          tabStore.setActiveTab(currentTabs[prevIdx].id)
          break
        }
        case 'zoom-in':
          document.body.style.zoom = `${(parseFloat(document.body.style.zoom || '1') + 0.1)}`
          break
        case 'zoom-out':
          document.body.style.zoom = `${Math.max(0.5, parseFloat(document.body.style.zoom || '1') - 0.1)}`
          break
      }
    },
    []
  )

  useHotkeys({
    hotkeys,
    onAction: handleHotkeyAction,
    enabled: true
  })


  /**
   * Serve the launcher "SEGUIR COMO" auto-login: the game's native launcher
   * (ContinueForm) intercepts continuePlay and asks us for a session. We reply
   * with the active session for that tab when present; otherwise we try the
   * most recently used saved account (fast apiKey path, then full re-auth).
   */
  const resolveLauncherSession = useCallback(async (tabId: string) => {
    const active = useAuthStore.getState().sessions[tabId]
    if (active?.token && active.status === 'authenticated') return active

    const accounts = useSavedAccountsStore.getState().list
    if (!accounts.length) return null
    const account = [...accounts].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0]
    try {
      const session = await useAuthStore.getState().loginWithApiKey(tabId, account)
      useSavedAccountsStore.getState().updateCache(account.id, session.apiKey, session.token)
      return session
    } catch {
      try {
        const session = await useAuthStore.getState().login(tabId, {
          username: account.username,
          password: account.password
        })
        useSavedAccountsStore.getState().updateCache(account.id, session.apiKey, session.token)
        return session
      } catch {
        return null
      }
    }
  }, [])

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.data?.type !== 'cuervok:launcher-login-request') return

      // Find the tab by iframe source first, then by gameId sent by the game.
      let tabId = e.data?.gameId || ''
      if (!tabId) {
        for (const [tid, el] of Object.entries(iframeRefs.current)) {
          if (el?.contentWindow === e.source) {
            tabId = tid
            break
          }
        }
      }
      if (!tabId) tabId = useGameTabStore.getState().activeTabId

      const session = tabId ? await resolveLauncherSession(tabId) : null
      const reply = session
        ? {
            username: session.username,
            token: session.token,
            apiKey: session.apiKey,
            accountId: session.accountId,
            refreshToken: session.refreshToken
          }
        : null
      try {
        ;(e.source as Window).postMessage(
          { type: 'cuervok:launcher-login-response', session: reply },
          '*'
        )
      } catch { /* iframe gone */ }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [resolveLauncherSession])

  useEffect(() => {
    if (!game.autoGroupEnabled || !activeTeamId) {
      destroyAutoGroup()
      return
    }

    const team = teams.find((t) => t.id === activeTeamId)
    if (!team || !team.leaderId) return

    const leaderTabId = characterTabMap[team.leaderId] ?? null
    if (!leaderTabId) return

    const followerTabIds = team.memberIds
      .filter((id) => id !== team.leaderId)
      .map((id) => characterTabMap[id])
      .filter((tabId): tabId is string => !!tabId)

    const gameWindows = window.$gameWindows
    if (!gameWindows || gameWindows.length === 0) return

    const cleanups: Array<() => void> = []
    for (const gw of gameWindows) {
      const cleanup = initAutoGroup(gw, gw.$game_id, {
        enabled: true,
        leaderTabId,
        leaderMapId: null,
        leaderPosition: null,
        followerTabIds
      }, {
        onLeaderMapChange: (mapId, position) => {
          broadcastLeaderPosition(mapId, position)
        },
        onFollowerMoved: () => {}
      })
      cleanups.push(cleanup)
    }

    return () => {
      for (const fn of cleanups) fn()
    }
  }, [game.autoGroupEnabled, activeTeamId, teams, tabs, characterTabMap])

  if (!gameSrc) {
    return (
      <div style={{ position: 'relative', flex: 1 }}>
        <GameLoadingBackdrop
          title="Starting Cuervok"
          subtitle="Loading the local game context and preparing the client shell."
        />
      </div>
    )
  }

  const handleDrop = (targetTabId: string) => {
    if (dragTabId && dragTabId !== targetTabId) {
      const oldIndex = tabs.findIndex((t) => t.id === dragTabId)
      const newIndex = tabs.findIndex((t) => t.id === targetTabId)
      const newOrder = tabs.map((t) => t.id)
      newOrder.splice(oldIndex, 1)
      newOrder.splice(newIndex, 0, dragTabId)
      reorderTabs(newOrder)
    }
    setDragTabId(null)
    setDragOverTabId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: TITLEBAR_HEIGHT,
          paddingLeft: 4,
          background: colors.titlebar,
          borderBottom: `1px solid ${colors.brandBorder}`,
          flexShrink: 0,
          overflow: 'hidden',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        <div style={{ display: 'flex', alignItems: 'center', height: '100%', overflow: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              draggable
              onClick={() => setActiveTab(tab.id)}
              onDragStart={(e) => {
                setDragTabId(tab.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverTabId(tab.id)
              }}
              onDragEnter={(e) => { e.preventDefault(); setDragOverTabId(tab.id) }}
              onDragLeave={() => { if (dragOverTabId === tab.id) setDragOverTabId(null) }}
              onDrop={(e) => { e.preventDefault(); handleDrop(tab.id) }}
              onDragEnd={() => { setDragTabId(null); setDragOverTabId(null) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 12px',
                height: '100%',
                fontSize: 11,
                fontFamily: 'monospace',
                border: 'none',
                borderRight: `1px solid ${colors.borderSubtle}`,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: tab.id === activeTabId ? colors.surfaceActive : 'transparent',
                color: tab.id === activeTabId ? colors.text : colors.textDim,
                opacity: dragTabId === tab.id ? 0.5 : 1,
                borderLeft: dragOverTabId === tab.id && dragTabId !== tab.id ? `2px solid ${colors.accent}` : undefined,
                transition: 'opacity 0.15s',
              }}
            >
              {tab.characterIcon && (
                <img src={tab.characterIcon} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              )}
              <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tab.characterName || tab.name}
              </span>
              {tabs.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); removeTab(tab.id) }}
                  style={{ opacity: 0.4, cursor: 'pointer', lineHeight: 1 }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1' }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.4' }}
                >
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
          {canAddTab() && (
            <button
              onClick={() => addTab()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: '100%', background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer' }}
            >
              <Plus size={13} />
            </button>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', height: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setSettingsOpen(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: '100%', background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer' }}
          >
            <Settings size={12} />
          </button>
          <WindowButton onClick={() => window.cuervok.minimize()}><Minus size={12} /></WindowButton>
          <WindowButton onClick={() => { window.cuervok.maximize(); setIsMaximized(!isMaximized) }}>
            {isMaximized ? <Copy size={10} /> : <Square size={10} />}
          </WindowButton>
          <WindowButton onClick={() => window.cuervok.close()} hoverBg={colors.dangerClose}><X size={14} /></WindowButton>
        </div>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {tabs.map((tab) => {
          return (
            <div key={tab.id} style={{ position: 'absolute', inset: 0, display: tab.id === activeTabId ? 'block' : 'none' }}>
              <GameIframe
                tab={tab}
                gameSrc={gameSrc}
                isVisible={true}
                onIframeRef={(el) => { iframeRefs.current[tab.id] = el }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
