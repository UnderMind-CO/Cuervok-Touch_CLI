import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { colors } from '@/theme'
import checkingGif from '@/assets/checking-updates.gif'
import type { AppUpdateStatus } from '@cuervok/shared'

/*
 * Updater Window — una sola UI para todo el ciclo de arranque:
 *
 *   Please Wait... Checking Updates...  → mientras se valida la app/game
 *   Updating...                         → descarga de app/game en curso
 *   Update Complete...                  → listo (se abre el juego o se
 *                                         auto-instala la app y reinicia)
 *   Update failed... (clic para reintentar) → solo error de descarga nueva
 *
 * El panel clásico del updater ya no se muestra en ningún punto: la ventana
 * frameless está SIEMPRE en el overlay (gif + texto), así no hay parpadeos ni
 * UI antigua visible detrás. El ciclo es:
 *
 *   arranque → check app update → si hay: auto-instalar (quitAndInstall) y
 *   relanzar → si no hay: update del juego → launchGameWindow.
 */

type Status = 'checking' | 'app-downloading' | 'app-ready' | 'downloading' | 'done' | 'error'

function overlayText(status: Status): string {
  if (status === 'downloading' || status === 'app-downloading') return 'Updating...'
  if (status === 'done' || status === 'app-ready') return 'Update Complete...'
  if (status === 'error') return 'Update failed — click to retry'
  return 'Please Wait, Checking Updates...'
}

function shouldRunGameUpdate(status: AppUpdateStatus): boolean {
  return status.phase === 'disabled' || status.phase === 'not-available' || status.phase === 'error' || status.phase === 'idle'
}

export function SetupScreen() {
  const [status, setStatus] = useState<Status>('checking')
  const didStartRef = useRef(false)
  const gameUpdateStartedRef = useRef(false)
  const installedRef = useRef(false)
  const autoInstallStartedRef = useRef(false)
  const launchTimeoutRef = useRef<number | null>(null)

  const scheduleLaunch = () => {
    if (launchTimeoutRef.current !== null) return
    launchTimeoutRef.current = window.setTimeout(() => {
      window.cuervok.launchGameWindow()
    }, 700)
  }

  const startGameUpdate = (installed: boolean) => {
    if (gameUpdateStartedRef.current) return
    gameUpdateStartedRef.current = true
    installedRef.current = installed
    setStatus('downloading')

    void window.cuervok.downloadGame().then(() => {
      setStatus('done')
      scheduleLaunch()
    }).catch((err: unknown) => {
      window.cuervok.logger.warn('Game update failed', err)
      if (installedRef.current) {
        // Update fallido con instalación previa: abrimos lo que ya hay.
        window.cuervok.launchGameWindow()
        return
      }
      setStatus('error')
    })
  }

  const retryDownload = () => {
    if (status !== 'error') return
    gameUpdateStartedRef.current = false
    startGameUpdate(installedRef.current)
  }

  const handleAppUpdateStatus = (update: AppUpdateStatus) => {
    // Una vez que arrancó el update del juego, cualquier emisión tardia del
    // check de la app (doble "Checking for update") no debe devolver la UI a
    // "Checking Updates" — eso era la causa visible del parpadeo.
    if (gameUpdateStartedRef.current) {
      if (update.phase === 'downloaded' && !autoInstallStartedRef.current) {
        autoInstallStartedRef.current = true
        setStatus('app-ready')
        window.setTimeout(() => window.cuervok.installAppUpdate(), 1400)
      }
      return
    }

    if (update.phase === 'downloaded') {
      // Hay app update listo: "Update Complete..." y auto-instalación
      // (quitAndInstall → relanza → re-entra este ciclo sin update pendiente).
      if (!autoInstallStartedRef.current) {
        autoInstallStartedRef.current = true
        setStatus('app-ready')
        window.setTimeout(() => window.cuervok.installAppUpdate(), 1400)
      }
      return
    }

    if (update.phase === 'checking' || update.phase === 'available') {
      setStatus('checking')
      return
    }

    if (update.phase === 'downloading') {
      setStatus('app-downloading')
      return
    }

    if (shouldRunGameUpdate(update)) {
      startGameUpdate(installedRef.current)
    }
  }

  useEffect(() => {
    if (didStartRef.current) return
    didStartRef.current = true

    window.cuervok.checkGameInstalled().then(async (installed) => {
      installedRef.current = installed

      const current = await window.cuervok.getAppUpdateStatus()
      handleAppUpdateStatus(current)
      // La auto-check de AppUpdater.start() (1.8s) emite su resultado por la
      // suscripción de abajo. Lanzar un segundo check manual duplicaría las
      // emisiones ("Checking for update" dos veces) y era fuente de parpadeo;
      // solo consultamos manualmente cuando no hay estado previo (idle).
      if (current.phase !== 'idle') return

      const checked = await window.cuervok.checkAppUpdate()
      handleAppUpdateStatus(checked)
    }).catch((err: unknown) => {
      window.cuervok.logger.error('Updater boot failed', err)
      startGameUpdate(installedRef.current)
    })
  }, [])

  useEffect(() => {
    const unsubAppUpdate = window.cuervok.onAppUpdateStatus(handleAppUpdateStatus)
    return () => unsubAppUpdate()
  }, [])

  useEffect(() => {
    return () => {
      if (launchTimeoutRef.current !== null) {
        window.clearTimeout(launchTimeoutRef.current)
      }
    }
  }, [])

  const clickable = status === 'error'

  return (
    <div
      onClick={clickable ? retryDownload : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        // Fondo opaco: la ventana del updater nunca deja ver otra cosa detrás.
        background: colors.bg,
        zIndex: 100,
        // Frameless: el overlay ES la ventana. En error se vuelve clicable
        // (reintentar), así que ahí se libera el drag.
        WebkitAppRegion: clickable ? 'no-drag' : 'drag',
        ...(clickable ? ({ cursor: 'pointer' } as CSSProperties) : {})
      } as CSSProperties}
    >
      <img src={checkingGif} alt="" style={{ width: 150, height: 150, pointerEvents: 'none' }} />
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: 0.4,
          color: colors.text
        }}
      >
        {overlayText(status)}
      </div>
    </div>
  )
}

function isActiveAppUpdate(status: AppUpdateStatus): boolean {
  return status.phase === 'available' || status.phase === 'downloading' || status.phase === 'downloaded'
}
