import { useState, useEffect, useCallback } from 'react'
import { Globe, Keyboard, Info, Download, LoaderCircle, ExternalLink } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { recordKeyCombo } from '@/hooks/use-hotkeys'
import { HOTKEY_ACTIONS, HOTKEY_ACTION_LABELS, RESOLUTIONS, LANGUAGES } from '@cuervok/shared'
import { colors } from '@/theme'
import type { HotkeyAction, Language } from '@cuervok/shared'

const ghostBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: colors.textFaint,
  fontSize: 10, cursor: 'pointer',
}

function hoverColor(e: React.MouseEvent, color: string) {
  (e.currentTarget as HTMLElement).style.color = color
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
        background: checked ? colors.accent : colors.toggleOff,
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: 8, background: colors.white,
        transition: 'left 0.15s', boxShadow: colors.shadow,
      }} />
    </button>
  )
}

function Select({ value, onChange, options, width }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; width?: number }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        appearance: 'none', background: `${colors.input} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E") no-repeat right 10px center`,
        border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textLight,
        fontSize: 12, padding: '6px 28px 6px 10px', outline: 'none', width: width || 'auto', minWidth: 140,
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}


function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', minHeight: 36 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.3 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: colors.textDesc, marginTop: 1, lineHeight: 1.2 }}>{desc}</div>}
      </div>
      <div style={{ marginLeft: 16, flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.accent, padding: '10px 0 3px', opacity: 0.7 }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}

const GAME_DATA_STORAGE_KEY = 'game_data_frozen_state'

function GameDataSection() {
  const [frozenState, setFrozenState] = useState<{ frozen: boolean; buildVersion?: string; frozenAt?: string } | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [progress, setProgress] = useState<{ message: string; percent: number } | null>(null)

  useEffect(() => {
    window.cuervok.checkGameFrozen().then(setFrozenState).catch(() => setFrozenState({ frozen: false }))
  }, [])

  useEffect(() => {
    const unsub = window.cuervok.onDownloadProgress((message, percent) => {
      setProgress({ message, percent })
    })
    return unsub
  }, [])

  const handleRedownload = async () => {
    const confirmed = window.confirm('This will re-download all game files. Current version will be lost. Continue?')
    if (!confirmed) return

    setIsDownloading(true)
    setProgress({ message: 'Starting download...', percent: 0 })

    try {
      // First unfreeze, then re-download
      await window.cuervok.unfreezeGame()
      await window.cuervok.redownloadGame()
      // Refresh frozen state after completion
      const newState = await window.cuervok.checkGameFrozen()
      setFrozenState(newState)
    } catch (err) {
      console.error('Re-download failed:', err)
    } finally {
      setIsDownloading(false)
      setProgress(null)
    }
  }

  const buildVersion = frozenState?.buildVersion || '—'

  return (
    <>
      <Row label="Build version" desc="Frozen game version">
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: colors.textMuted }}>
          {buildVersion}
          {frozenState?.frozen && (
            <span style={{ color: colors.accent, marginLeft: 6, fontSize: 10 }}>● Frozen</span>
          )}
        </span>
      </Row>
      <div style={{ padding: '8px 0' }}>
        <button
          onClick={handleRedownload}
          disabled={isDownloading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 6, fontSize: 12,
            background: isDownloading ? colors.surfaceActive : colors.accent,
            border: 'none', color: isDownloading ? colors.textDisabled : colors.white,
            cursor: isDownloading ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s', fontWeight: 500,
          }}
        >
          {isDownloading ? (
            <LoaderCircle size={14} style={{ animation: 'cuervok-spin 1s linear infinite' }} />
          ) : (
            <Download size={14} />
          )}
          {isDownloading ? (progress?.message || 'Downloading...') : 'Re-download game data'}
        </button>
        {isDownloading && progress && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress.percent}%`, height: '100%',
                borderRadius: 3, background: colors.accent,
                transition: 'width 0.3s'
              }} />
            </div>
            <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 4 }}>
              {progress.percent.toFixed(0)}%
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function GeneralTab() {
  const { language, window: win, game, setLanguage, setResolution, toggleAudioMute, toggleSoundOnFocus, toggleAutoGroup, toggleAutoInvite, toggleNotifications } = useSettingsStore()

  return (
    <>
      <Section title="Language">
        <Row label="Interface language">
          <Select value={language} onChange={(v) => setLanguage(v as Language)} options={LANGUAGES.map((l) => ({ value: l.value, label: l.name }))} />
        </Row>
      </Section>
      <Section title="Display">
        <Row label="Resolution" desc="Game rendering resolution">
          <Select value={`${win.resolution.width}x${win.resolution.height}`} onChange={(v) => { const [w, h] = v.split('x').map(Number); setResolution(w, h) }} options={RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
        </Row>
      </Section>
      <Section title="Audio">
        <Row label="Mute audio"><Toggle checked={win.audioMuted} onChange={toggleAudioMute} /></Row>
        <Row label="Sound only when focused" desc="Mute when window is in background"><Toggle checked={win.soundOnFocus} onChange={toggleSoundOnFocus} /></Row>
      </Section>
      <Section title="Game">
        <Row label="Auto-group" desc="Followers auto-follow leader across maps"><Toggle checked={game.autoGroupEnabled} onChange={toggleAutoGroup} /></Row>
        {game.autoGroupEnabled && (
          <Row label="Auto-invite" desc="Automatically send and accept party invites"><Toggle checked={game.autoInviteEnabled} onChange={toggleAutoInvite} /></Row>
        )}
        <Row label="Notifications"><Toggle checked={game.notificationsEnabled} onChange={toggleNotifications} /></Row>
      </Section>
      <Section title="Game Data">
        <GameDataSection />
      </Section>
    </>
  )
}

function HotkeysTab() {
  const { hotkeys, setHotkey, resetHotkeys } = useSettingsStore()
  const [recording, setRecording] = useState<HotkeyAction | null>(null)

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    const combo = recordKeyCombo(event)
    if (combo) { setHotkey(recording, combo); setRecording(null) }
  }, [recording, setHotkey])

  useEffect(() => {
    if (!recording) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording, handleKeyDown])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
        <button
          onClick={resetHotkeys}
          style={{ background: 'none', border: 'none', color: colors.textDim, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          onMouseEnter={(e) => hoverColor(e, colors.hoverLight)}
          onMouseLeave={(e) => hoverColor(e, colors.textDim)}
        >
          Reset to defaults
        </button>
      </div>
      {HOTKEY_ACTIONS.map((action) => (
        <div key={action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${colors.borderFaint}` }}>
          <span style={{ fontSize: 13, color: colors.textSecondary }}>{HOTKEY_ACTION_LABELS[action]}</span>
          <button
            onClick={() => setRecording(recording === action ? null : action)}
            style={{
              minWidth: 110, padding: '4px 12px', borderRadius: 5, fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', textAlign: 'center',
              background: recording === action ? colors.accentFocus : colors.input,
              border: `1px solid ${recording === action ? colors.accentBorder : colors.border}`,
              color: recording === action ? colors.accentText : colors.textMuted,
            }}
          >
            {recording === action ? 'Press keys...' : hotkeys[action] || 'None'}
          </button>
        </div>
      ))}
    </>
  )
}

function AboutTab() {
  return (
    <Section title="About Cuervok">
      <Row label="Version"><span style={{ fontFamily: 'monospace', fontSize: 12, color: colors.textMuted }}>0.1.0</span></Row>
      <Row label="Platform"><span style={{ fontFamily: 'monospace', fontSize: 12, color: colors.textMuted }}>{navigator.platform}</span></Row>

      <div style={{
        padding: '16px 0 12px',
        fontSize: 12,
        color: colors.textDim,
        lineHeight: 1.7,
        borderTop: `1px solid ${colors.borderFaint}`,
        marginTop: 8
      }}>
        <p style={{ margin: '0 0 12px' }}>
          This project is an enthusiast idea from a young developer passionate about video games and software.
        </p>
        <p style={{ margin: 0, fontSize: 10, color: colors.textFaint }}>
          All rights reserved to Ankama Games.
        </p>
      </div>

      <div style={{
        padding: '10px 0',
        borderTop: `1px solid ${colors.borderFaint}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6
      }}>
        <button
          onClick={() => window.cuervok.openExternal('https://github.com/UnderMind-CO')}
          style={{
            background: 'none',
            border: 'none',
            color: colors.accent,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 16px',
            borderRadius: 6,
            transition: 'all 0.15s',
            fontFamily: 'inherit'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(201,162,77,0.1)'
            e.currentTarget.style.transform = 'scale(1.02)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.transform = 'scale(1)'
          }}
          type="button"
        >
          <ExternalLink size={14} />
          Dev By Under
        </button>
      </div>
    </Section>
  )
}

const TABS = [
  { id: 'General', icon: Globe },
  { id: 'Hotkeys', icon: Keyboard },
  { id: 'About', icon: Info },
] as const

export function SettingsScreen() {
  const [tab, setTab] = useState('General')
  const { loadSettings, isHydrated } = useSettingsStore()
  useEffect(() => { if (!isHydrated) loadSettings() }, [isHydrated, loadSettings])

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${colors.borderSubtle}`, marginBottom: 4 }}>
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px 8px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                color: active ? colors.text : colors.textFaint, fontWeight: active ? 500 : 400,
                borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) hoverColor(e, colors.hoverMid) }}
              onMouseLeave={(e) => { if (!active) hoverColor(e, colors.textFaint) }}
            >
              <Icon size={13} />
              {t.id}
            </button>
          )
        })}
      </div>
      {tab === 'General' && <GeneralTab />}
      {tab === 'Hotkeys' && <HotkeysTab />}
      {tab === 'About' && <AboutTab />}
    </div>
  )
}
