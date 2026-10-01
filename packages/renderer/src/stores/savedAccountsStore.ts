import { create } from 'zustand'
import type { SavedAccount } from '@cuervok/shared'

const STORAGE_KEY = 'saved_accounts'

interface SavedAccountsState {
  list: SavedAccount[]
  isHydrated: boolean

  hydrate: () => Promise<void>
  addOrUpdate: (account: SavedAccount) => void
  remove: (id: string) => void
  touchLastUsed: (id: string) => void
  updateCache: (id: string, apiKey: string, token: string) => void
  getById: (id: string) => SavedAccount | undefined
  getByUsername: (username: string) => SavedAccount | undefined
}

function persist(list: SavedAccount[]) {
  try {
    window.cuervok.storeSet(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* silent */
  }
}

function makeId(account: { username: string; accountId: number | null }): string {
  if (account.accountId != null) return `acct_${account.accountId}`
  return `acct_${account.username.toLowerCase()}`
}

export function buildSavedAccount(input: {
  username: string
  password: string
  accountId: number | null
  apiKey?: string
  token?: string
  characterName?: string
}): SavedAccount {
  const id = makeId(input)
  const now = new Date().toISOString()
  return {
    id,
    username: input.username,
    password: input.password,
    accountId: input.accountId,
    lastUsedAt: now,
    cachedApiKey: input.apiKey,
    cachedToken: input.token,
    cachedAt: now,
    characterName: input.characterName,
  }
}

export const useSavedAccountsStore = create<SavedAccountsState>()((set, get) => {
  const mutate = (updater: (s: SavedAccountsState) => { list: SavedAccount[] }) => {
    set((state) => {
      const result = updater(state)
      persist(result.list)
      return { list: result.list }
    })
  }

  return {
    list: [],
    isHydrated: false,

    hydrate: async () => {
      try {
        const raw = await window.cuervok.storeGet(STORAGE_KEY)
        if (raw) {
          const parsed: SavedAccount[] = JSON.parse(raw)
          set({ list: Array.isArray(parsed) ? parsed : [], isHydrated: true })
          return
        }
      } catch {
        /* silent — start with empty list */
      }
      set({ list: [], isHydrated: true })
    },

    addOrUpdate: (account) =>
      mutate((s) => {
        const idx = s.list.findIndex((a) => a.id === account.id)
        if (idx === -1) {
          return { list: [account, ...s.list] }
        }
        const next = [...s.list]
        // Merge: keep cached fields if the new account doesn't provide them
        const prev = next[idx]
        next[idx] = {
          ...prev,
          ...account,
          cachedApiKey: account.cachedApiKey ?? prev.cachedApiKey,
          cachedToken: account.cachedToken ?? prev.cachedToken,
          cachedAt: account.cachedAt ?? prev.cachedAt,
          lastUsedAt: account.lastUsedAt ?? prev.lastUsedAt,
        }
        return { list: next }
      }),

    remove: (id) =>
      mutate((s) => ({ list: s.list.filter((a) => a.id !== id) })),

    touchLastUsed: (id) =>
      mutate((s) => ({
        list: s.list.map((a) =>
          a.id === id ? { ...a, lastUsedAt: new Date().toISOString() } : a
        ),
      })),

    updateCache: (id, apiKey, token) =>
      mutate((s) => ({
        list: s.list.map((a) =>
          a.id === id
            ? { ...a, cachedApiKey: apiKey, cachedToken: token, cachedAt: new Date().toISOString() }
            : a
        ),
      })),

    getById: (id) => get().list.find((a) => a.id === id),
    getByUsername: (username) =>
      get().list.find((a) => a.username.toLowerCase() === username.toLowerCase()),
  }
})