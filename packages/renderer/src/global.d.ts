/// <reference types="vite/client" />
import type { GameContext } from '@cuervok/shared'
import type { NativeNotificationPayload } from '@cuervok/shared'
import type { AppUpdateStatus } from '@cuervok/shared'
import type { AuthSession } from '@cuervok/shared'

interface CuervokAPI {
  fetchGameContext(): Promise<GameContext>
  appReadyToShow(): void
  openExternal(url: string): void
  setAudioMute(value: boolean): void
  minimize(): void
  maximize(): void
  close(): void
  getSettings(): Promise<string>
  setSettings(settings: string): void
  checkGameInstalled(): Promise<boolean>
  downloadGame(): Promise<void>
  launchGameWindow(): void
  onAuthCallback(cb: (url: string) => void): () => void
  onSelectTab(cb: (index: number) => void): () => void
  onDownloadProgress(cb: (message: string, percent: number) => void): () => void
  saveCharacterImage(name: string, imageData: string): void
  getAppUpdateStatus(): Promise<AppUpdateStatus>
  checkAppUpdate(): Promise<AppUpdateStatus>
  installAppUpdate(): void
  onAppUpdateStatus(cb: (status: AppUpdateStatus) => void): () => void
  showNativeNotification(payload: NativeNotificationPayload): void
  onNativeNotificationClick(cb: (tabId?: string) => void): () => void
  setSoundOnFocus(value: boolean): void
  storeGet(key: string): Promise<string | null>
  storeSet(key: string, value: string): void
  storeDelete(key: string): void
  getCharacterImageUrl(characterName: string): string
  // Auth
  login(tabId: string, apiKey: string, token: string): Promise<void>
  getAuthSession(tabId: string): Promise<AuthSession | null>
  logout(tabId: string): void
  // Freeze
  checkGameFrozen(): Promise<{ frozen: boolean; buildVersion?: string; frozenAt?: string }>
  unfreezeGame(): Promise<void>
  redownloadGame(): Promise<void>
  // Discord RPC
  updateDiscordPresence(stateJson: string): void
  clearDiscordPresence(): void
  logger: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
    debug(...args: unknown[]): void
  }
}

declare global {
  interface Window {
    cuervok: CuervokAPI
    buildVersion: string
    appVersion: string
    appInfo: { version: string }
  }
}
