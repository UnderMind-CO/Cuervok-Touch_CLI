import { create } from 'zustand'
import type { AuthSession, LoginCredentials, SavedAccount } from '@cuervok/shared'

const EMULATOR_AUTH = '/api/haapi'
const GAME_ID = 18

interface AuthState {
  sessions: Record<string, AuthSession>
  isLoading: boolean

  login: (tabId: string, credentials: LoginCredentials) => Promise<AuthSession>
  /** Fast-path reconnect: reuse the account's cached apiKey to mint a fresh token. Throws if the apiKey is expired. */
  loginWithApiKey: (tabId: string, account: SavedAccount) => Promise<AuthSession>
  logout: (tabId: string) => void
  getSession: (tabId: string) => AuthSession | undefined
  clearAll: () => void
  setSession: (tabId: string, session: AuthSession) => void
  hydrateFromStore: () => Promise<void>
  setError: (tabId: string, message: string) => void
}

function persistSessions(sessions: Record<string, AuthSession>) {
  try {
    const safe: Record<string, AuthSession> = {}
    for (const [tabId, session] of Object.entries(sessions)) {
      safe[tabId] = {
        username: session.username,
        token: session.token,
        apiKey: session.apiKey,
        accountId: session.accountId,
        refreshToken: session.refreshToken,
        status: session.status,
        error: session.error,
        createdAt: session.createdAt
      }
    }
    window.cuervok.storeSet('auth_sessions', JSON.stringify(safe))
  } catch { /* silent */ }
}

function formEncode(obj: Record<string, string | number>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  sessions: {},
  isLoading: false,

  login: async (tabId: string, credentials: LoginCredentials): Promise<AuthSession> => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [tabId]: {
          username: credentials.username,
          token: '',
          apiKey: '',
          accountId: null,
          refreshToken: '',
          status: 'authenticating',
          createdAt: new Date().toISOString()
        }
      },
      isLoading: true
    }))

    try {
      // Step 1: CreateApiKey — the emulator parses form-urlencoded (login, password, game_id)
      const apiKeyBody = formEncode({
        login: credentials.username,
        password: credentials.password,
        game_id: GAME_ID
      })

      const apiKeyRes = await fetch(`${EMULATOR_AUTH}/Ankama/v5/Api/CreateApiKey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: apiKeyBody
      })

      if (!apiKeyRes.ok) {
        const text = await apiKeyRes.text()
        let reason: string
        try {
          const parsed = JSON.parse(text)
          reason = parsed.reason || text || `HTTP ${apiKeyRes.status}`
        } catch {
          reason = text || `HTTP ${apiKeyRes.status}`
        }
        throw new Error(reason)
      }

      const keyData = await apiKeyRes.json()
      const apiKey = keyData.key || keyData.apiKey
      if (!apiKey) throw new Error('No api key returned by server')

      // Step 2: CreateToken — GET with apikey header
      const tokenRes = await fetch(`${EMULATOR_AUTH}/Ankama/v5/Account/CreateToken`, {
        headers: { apikey: String(apiKey), Accept: 'application/json' }
      })

      if (!tokenRes.ok) {
        const text = await tokenRes.text()
        let reason: string
        try {
          const parsed = JSON.parse(text)
          reason = parsed.reason || text || `HTTP ${tokenRes.status}`
        } catch {
          reason = text || `HTTP ${tokenRes.status}`
        }
        throw new Error(reason)
      }

      const tokenData = await tokenRes.json()
      const token = tokenData.token
      if (!token) throw new Error('No token returned by server')

      const session: AuthSession = {
        username: credentials.username,
        token: String(token),
        apiKey: String(apiKey),
        accountId: keyData.account_id != null ? Number(keyData.account_id) : null,
        refreshToken: String(keyData.refresh_token || ''),
        status: 'authenticated',
        createdAt: new Date().toISOString()
      }

      set((state) => ({
        sessions: { ...state.sessions, [tabId]: session },
        isLoading: false
      }))
      persistSessions(get().sessions)
      return session
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      set((state) => ({
        sessions: {
          ...state.sessions,
          [tabId]: {
            ...state.sessions[tabId],
            username: credentials.username,
            token: '',
            apiKey: '',
            accountId: null,
            refreshToken: '',
            status: 'error',
            error: errorMsg,
            createdAt: state.sessions[tabId]?.createdAt || new Date().toISOString()
          }
        },
        isLoading: false
      }))
      throw err
    }
  },

  loginWithApiKey: async (tabId: string, account: SavedAccount): Promise<AuthSession> => {
    const cachedApiKey = account.cachedApiKey
    if (!cachedApiKey) {
      throw new Error('No cached api key')
    }

    // Set an "authenticating" placeholder so the UI reflects activity
    set((state) => ({
      sessions: {
        ...state.sessions,
        [tabId]: {
          username: account.username,
          token: '',
          apiKey: cachedApiKey,
          accountId: account.accountId,
          refreshToken: '',
          status: 'authenticating',
          createdAt: new Date().toISOString()
        }
      },
      isLoading: true
    }))

    try {
      // CreateToken — GET with apikey header
      const tokenRes = await fetch(`${EMULATOR_AUTH}/Ankama/v5/Account/CreateToken`, {
        headers: { apikey: cachedApiKey, Accept: 'application/json' }
      })

      if (!tokenRes.ok) {
        const text = await tokenRes.text().catch(() => '')
        throw new Error(text || `HTTP ${tokenRes.status}`)
      }

      const tokenData = await tokenRes.json()
      const token: string | undefined = tokenData.token
      if (!token) {
        throw new Error('No token returned by server')
      }

      const session: AuthSession = {
        username: account.username,
        token,
        apiKey: cachedApiKey,
        accountId: account.accountId,
        refreshToken: '',
        status: 'authenticated',
        createdAt: new Date().toISOString()
      }

      set((state) => ({
        sessions: { ...state.sessions, [tabId]: session },
        isLoading: false
      }))
      persistSessions(get().sessions)
      return session
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Connection failed'
      set((state) => ({
        sessions: {
          ...state.sessions,
          [tabId]: {
            ...state.sessions[tabId],
            username: account.username,
            apiKey: account.cachedApiKey ?? '',
            accountId: account.accountId,
            token: '',
            refreshToken: '',
            status: 'error',
            error: errorMsg,
            createdAt: state.sessions[tabId]?.createdAt || new Date().toISOString()
          }
        },
        isLoading: false
      }))
      throw err
    }
  },

  logout: (tabId: string) => {
    set((state) => {
      const { [tabId]: _, ...rest } = state.sessions
      persistSessions(rest)
      return { sessions: rest }
    })
  },

  getSession: (tabId: string): AuthSession | undefined => {
    return get().sessions[tabId]
  },

  clearAll: () => {
    set({ sessions: {} })
    persistSessions({})
  },

  setSession: (tabId: string, session: AuthSession) => {
    set((state) => ({
      sessions: { ...state.sessions, [tabId]: session }
    }))
    persistSessions(get().sessions)
  },

  setError: (tabId: string, message: string) => {
    set((state) => {
      const existing = state.sessions[tabId]
      const updated: AuthSession = {
        username: existing?.username || '',
        token: '',
        apiKey: '',
        accountId: null,
        refreshToken: '',
        status: 'error',
        error: message,
        createdAt: existing?.createdAt || new Date().toISOString()
      }
      return { sessions: { ...state.sessions, [tabId]: updated } }
    })
    persistSessions(get().sessions)
  },

  hydrateFromStore: async () => {
    try {
      const raw = await window.cuervok.storeGet('auth_sessions')
      if (raw) {
        const parsed: Record<string, AuthSession> = JSON.parse(raw)
        set({ sessions: parsed })
      }
    } catch { /* silent */ }
  }
}))
