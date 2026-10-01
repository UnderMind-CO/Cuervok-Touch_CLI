import { app, nativeImage } from 'electron'
import path from 'path'
import { APP_SCHEME_PROTOCOLS } from '@cuervok/shared'
import { Application } from './application'
import { logger } from './logger'
import { config } from './config'
import { getAppIconPath } from './icon-path'
import * as Sentry from '@sentry/electron/main'

if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    tracesSampleRate: config.tracesSampleRate,
    beforeSend(event) {
      if (event.exception?.values?.[0]?.value?.includes('EPIPE')) return null
      return event
    }
  })
}

process.on('uncaughtException', (err) => {
  if (err.message?.includes('EPIPE')) return
  Sentry.captureException(err)
  logger.error('Uncaught exception:', err)
})

app.setName('Cuervok')
app.setPath('userData', path.join(app.getPath('appData'), 'cuervok-touch'))

// Suppress Electron security warnings (intentional: emulator needs these)
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('max-active-webgl-contexts', '32')
app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disk-cache-size', '0')

if (process.platform === 'win32') app.setAppUserModelId('com.cuervok.app')

if (!app.requestSingleInstanceLock()) {
  logger.warn('Another instance is already running — exiting.')
  app.exit(0)
  process.exit(0)
}

for (const scheme of APP_SCHEME_PROTOCOLS) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient(scheme)
  }
  logger.info(`Registered protocol: ${scheme}`)
}

function isAuthUrl(url: string): boolean {
  if (!url) return false
  return APP_SCHEME_PROTOCOLS.some((s) => url.startsWith(s + '://'))
}

let pendingAuthUrl: string | null = null

function handleAuthUrl(url: string) {
  if (!isAuthUrl(url)) return
  logger.info(`Auth URL received: ${url.substring(0, 60)}...`)
  const instance = Application.instance
  if (!instance || !instance.gameWindow) {
    logger.info('Application not ready — queueing auth URL for replay.')
    pendingAuthUrl = url
    return
  }
  instance.processAuthCallback(url)
}

if (process.platform === 'darwin') {
  app.on('open-url', (event, url) => {
    event.preventDefault()
    handleAuthUrl(url)
  })
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine[commandLine.length - 1]
    handleAuthUrl(url)
    Application.instance?.ensureWindow()
  })
}

app.whenReady().then(async () => {
  logger.info('App ready')

  const iconPath = getAppIconPath()

  const icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) {
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(icon)
    }
  } else {
    logger.warn(`Failed to load app icon from ${iconPath}`)
  }

  await Application.init()
  Application.instance.run()

  if (pendingAuthUrl) {
    const url = pendingAuthUrl
    pendingAuthUrl = null
    logger.info('Replaying queued auth URL after app ready.')
    handleAuthUrl(url)
  }
})

app.on('window-all-closed', () => {
  import('./discord-rpc').then(m => m.disconnectDiscordRpc().catch(() => {})).catch(() => {})
  app.quit()
})

app.on('activate', () => {
  Application.instance?.ensureWindow()
})
