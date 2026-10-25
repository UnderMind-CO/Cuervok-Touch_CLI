import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateStatus } from '@cuervok/shared'
import { logger } from '../logger'

type StatusCallback = (status: AppUpdateStatus) => void

/*
 * El feed se fija en electron-builder (package.json → build.publish →
 * provider generic, verlo en el "app-update.yml" empaquetado). En runtime
 * se admite un override por variable de entorno (solo en packaged) para
 * poder cambiar de VPS o probar un feed de staging sin rebuild:
 * - CUV_UPDATES_URL: URL completa del feed (e.g. https://midominio.com/releases/cuervok)
 * - CUV_SERVER_URL: mismo dominio del servidor (se sirve desde <base>/releases/cuervok)
 */
function applyFeedOverride(): void {
  if (!app.isPackaged) return
  const feedUrl =
    process.env.CUV_UPDATES_URL ||
    (process.env.CUV_SERVER_URL ? `${process.env.CUV_SERVER_URL.replace(/\/+$/, '')}/releases/cuervok` : null)
  if (!feedUrl) return
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
  logger.info(`[app-update] feed override → ${feedUrl}`)
}

export class AppUpdater {
  private readonly _onStatus: StatusCallback
  private _status: AppUpdateStatus = { phase: 'idle', message: 'Waiting to check for app updates.' }
  private _started = false
  private _checking: Promise<AppUpdateStatus> | null = null

  constructor(onStatus: StatusCallback) {
    this._onStatus = onStatus

    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => {
      this._setStatus({ phase: 'checking', message: 'Checking for app update...' })
    })

    autoUpdater.on('update-available', (info) => {
      this._setStatus({
        phase: 'available',
        version: info.version,
        percent: 0,
        message: `App update ${info.version} found.`
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      this._setStatus({
        phase: 'not-available',
        version: info.version,
        message: 'Cuervok is up to date.'
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this._setStatus({
        phase: 'downloading',
        percent: progress.percent,
        message: `Downloading app update ${Math.round(progress.percent)}%...`
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this._setStatus({
        phase: 'downloaded',
        version: info.version,
        percent: 100,
        message: `App update ${info.version} is ready to install.`
      })
    })

    autoUpdater.on('error', (err) => {
      logger.warn('App update failed', err)
      this._setStatus({
        phase: 'error',
        error: err instanceof Error ? err.message : String(err),
        message: 'App update check failed.'
      })
    })
  }

  getStatus(): AppUpdateStatus {
    return this._status
  }

  start() {
    if (this._started) return
    this._started = true

    applyFeedOverride()

    if (!app.isPackaged) {
      this._setStatus({
        phase: 'disabled',
        message: 'App auto-update is enabled only in packaged builds.'
      })
      return
    }

    setTimeout(() => {
      void this.checkNow()
    }, 1800)
  }

  async checkNow(): Promise<AppUpdateStatus> {
    if (!app.isPackaged) {
      this._setStatus({
        phase: 'disabled',
        message: 'App auto-update is enabled only in packaged builds.'
      })
      return this._status
    }

    if (this._checking) return this._checking

    this._checking = autoUpdater.checkForUpdates()
      .then(() => this._status)
      .catch((err) => {
        logger.warn('App update check failed', err)
        this._setStatus({
          phase: 'error',
          error: err instanceof Error ? err.message : String(err),
          message: 'App update check failed.'
        })
        return this._status
      })
      .finally(() => {
        this._checking = null
      })

    return this._checking
  }

  installNow() {
    if (this._status.phase !== 'downloaded') return
    autoUpdater.quitAndInstall(false, true)
  }

  private _setStatus(status: AppUpdateStatus) {
    this._status = status
    this._onStatus(status)
  }
}
