import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { Eye, EyeOff, Trash2, LoaderCircle, User, Lock, Plus, ArrowLeft, X, Volume2, VolumeX } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useSavedAccountsStore, buildSavedAccount } from '@/stores/savedAccountsStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTranslation } from '@/i18n'
import { colors } from '@/theme'
import logoImg from '@/assets/logo.png'
import bgVideo from '@/assets/embed_assets_touch.mp4'
import type { AuthSession, SavedAccount } from '@cuervok/shared'

const containerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  background: '#000'
}

const videoBgStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  pointerEvents: 'none'
}

const videoOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(135deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.75) 100%)',
  pointerEvents: 'none'
}

const soundToggleStyle: CSSProperties = {
  position: 'absolute',
  bottom: 24,
  right: 24,
  zIndex: 10,
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '50%',
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.5)',
  transition: 'all 0.2s',
  backdropFilter: 'blur(8px)'
}

const overlayGlow: CSSProperties = {
  position: 'absolute',
  top: '20%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 600,
  height: 400,
  background: 'radial-gradient(ellipse, rgba(201,162,77,0.06) 0%, transparent 70%)',
  pointerEvents: 'none'
}

const cardStyle: CSSProperties = {
  position: 'relative',
  width: 360,
  padding: '40px 32px 32px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center'
}

const inputContainerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  marginBottom: 14
}

const inputBase: CSSProperties = {
  width: '100%',
  padding: '12px 14px 12px 38px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e0e0e0',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

const inputIconStyle: CSSProperties = {
  position: 'absolute',
  left: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'rgba(255,255,255,0.25)',
  pointerEvents: 'none'
}

const passwordToggleStyle: CSSProperties = {
  position: 'absolute',
  right: 10,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center'
}

const actionRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  width: '100%',
  marginBottom: 20,
  gap: 8
}

const ghostBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  fontSize: 11,
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  transition: 'color 0.15s, background 0.15s'
}

const connectBtnStyle: CSSProperties = {
  width: '100%',
  padding: '12px 0',
  borderRadius: 8,
  border: 'none',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  background: 'linear-gradient(180deg, #dbb867 0%, #c9a24d 50%, #b8913a 100%)',
  color: '#1a1510',
  letterSpacing: '0.02em',
  transition: 'opacity 0.2s, transform 0.1s',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

const errorStyle: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  background: 'rgba(255,68,68,0.1)',
  border: '1px solid rgba(255,68,68,0.25)',
  color: '#ff4444',
  fontSize: 13,
  textAlign: 'center',
  marginTop: 12,
  lineHeight: 1.4
}

const backLinkStyle: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 20,
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  fontSize: 12,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 6px',
  borderRadius: 4,
  transition: 'color 0.15s, background 0.15s'
}

const accountRowStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.03)',
  cursor: 'pointer',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, background 0.15s',
  marginBottom: 8
}

const avatarStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  fontWeight: 700,
  color: '#1a1510',
  background: 'linear-gradient(180deg, #dbb867 0%, #b8913a 100%)',
  letterSpacing: 0,
  userSelect: 'none'
}

const addAccountBtnStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px dashed rgba(255,255,255,0.12)',
  background: 'none',
  color: 'rgba(255,255,255,0.45)',
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  marginTop: 8,
  transition: 'border-color 0.15s, color 0.15s, background 0.15s',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
}

interface LoginScreenProps {
  tabId: string
  onLoginSuccess: (session: AuthSession) => void
  onReconnect: (account: SavedAccount) => void
}

function CharacterAvatar({ account }: { account: SavedAccount }) {
  const [imgError, setImgError] = useState(false)
  const hasImage = !!account.characterName && !imgError

  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: '50%',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      fontWeight: 700,
      color: '#1a1510',
      background: hasImage ? 'none' : 'linear-gradient(180deg, #dbb867 0%, #b8913a 100%)',
      letterSpacing: 0,
      userSelect: 'none',
      overflow: 'hidden'
    }}>
      {hasImage ? (
        <img
          src={window.cuervok.getCharacterImageUrl(account.characterName!)}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          onError={() => setImgError(true)}
        />
      ) : (
        (account.username || '?').charAt(0).toUpperCase()
      )}
    </div>
  )
}

function relativeTime(iso: string, t: (k: never, ...args: never[]) => string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return t('picker.lastUsedUnknown' as never)
  const diffMs = Date.now() - then
  if (diffMs < 60_000) return t('picker.lastUsedNow' as never)
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return t('picker.lastUsedMinutes' as never, min as never)
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('picker.lastUsedHours' as never, hours as never)
  const days = Math.floor(hours / 24)
  return t('picker.lastUsedDays' as never, days as never)
}

export function LoginScreen({ tabId, onLoginSuccess, onReconnect }: LoginScreenProps) {
  const t = useTranslation()
  const [soundEnabled, setSoundEnabled] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    if (soundEnabled) {
      vid.muted = false
      vid.volume = 0.3
      vid.play().catch(() => {})
    } else {
      vid.muted = true
    }
  }, [soundEnabled])
  const language = useSettingsStore((s) => s.language)

  const savedAccounts = useSavedAccountsStore((s) => s.list)
  const removeAccount = useSavedAccountsStore((s) => s.remove)

  const [view, setView] = useState<'picker' | 'form'>(() =>
    savedAccounts.length > 0 ? 'picker' : 'form'
  )
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  const { sessions } = useAuthStore()
  const session: AuthSession | undefined = sessions[tabId]

  // Focus username when entering form view
  useEffect(() => {
    if (view === 'form') {
      usernameRef.current?.focus()
    }
  }, [view])

  // Reflect store errors into local state
  useEffect(() => {
    if (session?.status === 'error') {
      setIsSubmitting(false)
      setError(session.error || t('login.errorGeneric'))
    }
  }, [session?.status, session?.error, t])

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError(t('login.errorEmpty'))
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const { login } = useAuthStore.getState()
      const result = await login(tabId, { username: username.trim(), password })

      // Persist this account so it appears in the picker next launch
      const account = buildSavedAccount({
        username: username.trim(),
        password,
        accountId: result.accountId,
        apiKey: result.apiKey,
        token: result.token,
      })
      useSavedAccountsStore.getState().addOrUpdate(account)
      useSavedAccountsStore.getState().updateCache(account.id, result.apiKey, result.token)

      onLoginSuccess(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.errorGeneric'))
      setIsSubmitting(false)
    }
  }

  const handleClear = () => {
    setUsername('')
    setPassword('')
    setError(null)
    usernameRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleSubmit()
    }
  }

  const handleRemoveAccount = (e: React.MouseEvent, account: SavedAccount) => {
    e.stopPropagation()
    if (window.confirm(t('picker.removeConfirm'))) {
      removeAccount(account.id)
      // Reset local state so the form or remaining picker isn't stuck
      setIsSubmitting(false)
      setError(null)
      // If we just removed the last one, jump to the form view
      const remaining = useSavedAccountsStore.getState().list
      if (remaining.length === 0) {
        setView('form')
      }
    }
  }

  const handleAccountClick = (account: SavedAccount) => {
    setError(null)
    setIsSubmitting(true)
    onReconnect(account)
  }

  // ─── Picker view ─────────────────────────────────────────────
  if (view === 'picker' && savedAccounts.length > 0) {
    return (
      <div style={containerStyle}>
        {/* Background video */}
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          style={videoBgStyle}
        >
          <source src={bgVideo} type="video/mp4" />
        </video>
        <div style={videoOverlayStyle} />

        <div style={overlayGlow} />
        <div style={cardStyle}>
          <img
            src={logoImg}
            alt="Cuervok"
            style={{
              width: 80,
              height: 80,
              marginBottom: 16,
              filter: 'drop-shadow(0 0 24px rgba(201,162,77,0.35))'
            }}
          />

          <div style={{ fontSize: 22, fontWeight: 700, color: '#e8e0d0', marginBottom: 6, letterSpacing: '0.02em' }}>
            {t('picker.title')}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 24, textAlign: 'center' }}>
            {t('picker.subtitle')}
          </div>

          {/* Account list */}
          <div style={{ width: '100%' }}>
            {savedAccounts.map((account) => (
              <div
                key={account.id}
                onClick={() => handleAccountClick(account)}
                style={accountRowStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(201,162,77,0.4)'
                  e.currentTarget.style.background = 'rgba(201,162,77,0.06)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleAccountClick(account)
                  }
                }}
              >
                <CharacterAvatar account={account} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: '#e0e0e0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {account.username}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                    {t('picker.lastUsed')} {relativeTime(account.lastUsedAt, t)}
                  </div>
                </div>
                <button
                  onClick={(e) => handleRemoveAccount(e, account)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.25)',
                    cursor: 'pointer',
                    padding: 6,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0
                  }}
                  aria-label={t('picker.removeAccount')}
                  title={t('picker.removeAccount')}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ff4444'; e.currentTarget.style.background = 'rgba(255,68,68,0.1)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'none' }}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add account button */}
          <button
            onClick={() => {
              setView('form')
              setError(null)
              setIsSubmitting(false)
            }}
            style={addAccountBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(201,162,77,0.4)'
              e.currentTarget.style.color = 'rgba(201,162,77,0.85)'
              e.currentTarget.style.background = 'rgba(201,162,77,0.04)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
              e.currentTarget.style.background = 'none'
            }}
            type="button"
          >
            <Plus size={14} />
            {t('picker.addAccount')}
          </button>

          {/* Submitting overlay for reconnect */}
          {isSubmitting && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              <LoaderCircle size={18} style={{ animation: 'cuervok-spin 1s linear infinite' }} />
              {t('login.connecting')}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div style={errorStyle}>
              {error}
            </div>
          )}
        </div>

        {/* Sound toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          style={soundToggleStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
            e.currentTarget.style.background = 'rgba(0,0,0,0.7)'
            e.currentTarget.style.borderColor = 'rgba(201,162,77,0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
            e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
          title={soundEnabled ? 'Mute' : 'Unmute'}
          type="button"
        >
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>

        <style>{`@keyframes cuervok-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  // ─── Form view ───────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {/* Background video */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        style={videoBgStyle}
      >
        <source src={bgVideo} type="video/mp4" />
      </video>
      <div style={videoOverlayStyle} />

      <div style={overlayGlow} />
      <div style={cardStyle}>
        {/* Back to picker — only if there are saved accounts */}
        {savedAccounts.length > 0 && (
          <button
            onClick={() => {
              setView('picker')
              setError(null)
              setIsSubmitting(false)
            }}
            style={backLinkStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(201,162,77,0.7)'; e.currentTarget.style.background = 'rgba(201,162,77,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'none' }}
            type="button"
          >
            <ArrowLeft size={13} />
            {t('login.back')}
          </button>
        )}

        {/* Logo */}
        <img
          src={logoImg}            alt="Cuervok"
            style={{
              width: 80,
              height: 80,
              marginBottom: 16,
              filter: 'drop-shadow(0 0 24px rgba(201,162,77,0.35))'
            }}
          />

        {/* Title */}
        <div style={{ fontSize: 22, fontWeight: 700, color: '#e8e0d0', marginBottom: 6, letterSpacing: '0.02em' }}>
          {t('login.title')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 28 }}>
          {t('login.subtitle')}
        </div>

        {/* Username field */}
        <div style={inputContainerStyle}>
          <User size={16} style={inputIconStyle} />
          <input
            ref={usernameRef}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('login.username')}
            style={{
              ...inputBase,
              borderColor: error && !username.trim()
                ? 'rgba(255,68,68,0.4)'
                : 'rgba(255,255,255,0.08)'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(201,162,77,0.5)'
              e.target.style.boxShadow = '0 0 0 2px rgba(201,162,77,0.1)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.08)'
              e.target.style.boxShadow = 'none'
            }}
            autoComplete="username"
            disabled={isSubmitting}
          />
        </div>

        {/* Password field */}
        <div style={inputContainerStyle}>
          <Lock size={16} style={inputIconStyle} />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('login.password')}
            style={{
              ...inputBase,
              paddingRight: 36,
              borderColor: error && !password.trim()
                ? 'rgba(255,68,68,0.4)'
                : 'rgba(255,255,255,0.08)'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'rgba(201,162,77,0.5)'
              e.target.style.boxShadow = '0 0 0 2px rgba(201,162,77,0.1)'
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'rgba(255,255,255,0.08)'
              e.target.style.boxShadow = 'none'
            }}
            autoComplete="current-password"
            disabled={isSubmitting}
          />
          <button
            onClick={() => setShowPassword(!showPassword)}
            style={passwordToggleStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
            tabIndex={-1}
            type="button"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {/* Action row: Clear all */}
        <div style={actionRowStyle}>
          <button
            onClick={handleClear}
            style={ghostBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(201,162,77,0.7)'
              e.currentTarget.style.background = 'rgba(201,162,77,0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
              e.currentTarget.style.background = 'none'
            }}
            type="button"
          >
            <Trash2 size={13} />
            {t('login.clearAll')}
          </button>
        </div>

        {/* Connect button */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          style={{
            ...connectBtnStyle,
            opacity: isSubmitting ? 0.6 : 1,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            transform: isSubmitting ? 'none' : undefined
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.opacity = '0.9'
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.opacity = '1'
            }
          }}
          onMouseDown={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.transform = 'scale(0.98)'
            }
          }}
          onMouseUp={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.transform = 'scale(1)'
            }
          }}
        >
          {isSubmitting ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <LoaderCircle size={18} style={{ animation: 'cuervok-spin 1s linear infinite' }} />
              {t('login.connecting')}
            </span>
          ) : (
            t('login.connect')
          )}
        </button>

        {/* Error message */}
        {error && (
          <div style={errorStyle}>
            {error}
          </div>
        )}
      </div>

      {/* Unused but keeps the linter happy when iterating on language (read once) */}
      <span style={{ display: 'none' }}>{language}</span>

      {/* Sound toggle */}
      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        style={soundToggleStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
          e.currentTarget.style.background = 'rgba(0,0,0,0.7)'
          e.currentTarget.style.borderColor = 'rgba(201,162,77,0.4)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
          e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
        }}
        title={soundEnabled ? 'Mute' : 'Unmute'}
        type="button"
      >
        {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>

      {/* Inject keyframe animations */}
      <style>{`
        @keyframes cuervok-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}