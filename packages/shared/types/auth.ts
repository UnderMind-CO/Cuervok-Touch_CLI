export interface AuthSession {
  username: string
  token: string
  apiKey: string
  accountId: number | null
  refreshToken: string
  status: 'idle' | 'authenticating' | 'authenticated' | 'error'
  error?: string
  createdAt: string
}

export interface LoginCredentials {
  username: string
  password: string
  serverAddress?: string
}

/**
 * A saved account for one-click reconnect on app launch.
 *
 * Private-emulator context: the emulator auto-creates accounts and accepts any
 * password, so storing the password in plain text in electron-store is acceptable
 * here (this is NOT a production Ankama credential). The password is stored so we
 * can fall back to a full re-auth when the cached apiKey expires (4h TTL).
 */
export interface SavedAccount {
  /** Stable unique id, e.g. `acct_<accountId>` (or `acct_<username>` when accountId is null). */
  id: string
  username: string
  password: string
  accountId: number | null
  lastUsedAt: string
  /** Cached apiKey returned by CreateApiKey — used for fast reconnect via CreateToken. */
  cachedApiKey?: string
  /** Cached token returned by CreateToken — informational; the emulator regenerates it on every call. */
  cachedToken?: string
  /** ISO date when the cache was populated. */
  cachedAt?: string
  /**
   * Last known in-game character name for this account.
   * Used to load the character portrait from:
   *   %appdata%/Cuervok/character-images/{characterName}.png
   */
  characterName?: string
}