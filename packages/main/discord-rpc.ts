import { Client, Presence } from 'discord-rpc'
import { logger } from './logger'

// ═══════════════════════════════════════════════════════════════════════
// Discord Rich Presence for Cuervok
// Application ID: 1544159430785106052
// ═══════════════════════════════════════════════════════════════════════

const DISCORD_CLIENT_ID = '1544159430785106052'

export interface DiscordPresenceState {
  details?: string
  state?: string
  largeImageKey?: string
  largeImageText?: string
  smallImageKey?: string
  smallImageText?: string
  startTimestamp?: number
  buttons?: Array<{ label: string; url: string }>
}

let rpcClient: Client | null = null
let connected = false
let connecting = false
let currentPresence: Presence | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function buildPresence(state: DiscordPresenceState): Presence {
  const presence: Presence = {}
  if (state.details) presence.details = state.details
  if (state.state) presence.state = state.state
  if (state.largeImageKey) presence.largeImageKey = state.largeImageKey
  if (state.largeImageText) presence.largeImageText = state.largeImageText
  if (state.smallImageKey) presence.smallImageKey = state.smallImageKey
  if (state.smallImageText) presence.smallImageText = state.smallImageText
  if (state.startTimestamp) presence.startTimestamp = state.startTimestamp
  if (state.buttons && state.buttons.length > 0) {
    presence.buttons = state.buttons.slice(0, 2)
  }
  return presence
}

/**
 * Connect to Discord's local IPC pipe.
 * Safe to call multiple times — no-ops if already connected/connecting.
 */
export async function connectDiscordRpc(): Promise<void> {
  if (connected || connecting) return
  connecting = true

  try {
    const client = new Client({ transport: 'ipc' })

    client.on('ready', () => {
      connected = true
      connecting = false
      logger.info('[DiscordRPC] Connected to Discord')
      // Restore the last presence if we had one
      if (currentPresence) {
        client.setActivity(currentPresence).catch((err: any) => {
          logger.debug('[DiscordRPC] Failed to restore activity:', err?.message)
        })
      }
    })

    client.on('disconnected', () => {
      connected = false
      rpcClient = null
      logger.info('[DiscordRPC] Disconnected from Discord')
      // Attempt reconnect after a delay
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        connecting = false
        connectDiscordRpc().catch(() => {})
      }, 10_000)
    })

    rpcClient = client

    await client.login({ clientId: DISCORD_CLIENT_ID })
  } catch (err: any) {
    connected = false
    connecting = false
    rpcClient = null
    // Don't spam logs — Discord may not be running
    logger.debug('[DiscordRPC] Could not connect (Discord may not be running):', err?.message || err)
  }
}

/**
 * Disconnect from Discord RPC.
 */
export async function disconnectDiscordRpc(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  const client = rpcClient
  rpcClient = null
  connected = false
  connecting = false
  if (client) {
    try {
      await client.clearActivity()
      await client.destroy()
    } catch {}
  }
}

/**
 * Set the Discord Rich Presence from a state object.
 */
export async function setDiscordPresence(state: DiscordPresenceState): Promise<void> {
  const presence = buildPresence(state)
  currentPresence = presence

  if (connected && rpcClient) {
    try {
      await rpcClient.setActivity(presence)
      logger.debug('[DiscordRPC] Activity set:', state.details || '(default)')
    } catch (err: any) {
      logger.debug('[DiscordRPC] Failed to set activity:', err?.message)
    }
  } else {
    logger.debug('[DiscordRPC] Not connected, presence queued for next connect')
  }
}

/**
 * Clear the Discord Rich Presence (show only the app name).
 */
export async function clearDiscordPresence(): Promise<void> {
  currentPresence = null
  if (connected && rpcClient) {
    try {
      await rpcClient.clearActivity()
    } catch {}
  }
}
