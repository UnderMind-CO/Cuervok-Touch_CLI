import { useSettingsStore } from '@/stores/settingsStore'
import { en, type EnKeys } from './locales/en'
import { es } from './locales/es'
import { fr } from './locales/fr'

const locales: Record<string, EnKeys> = { en, es, fr }

/**
 * Lightweight i18n hook. Returns a `t(key, ...args)` function that reads the
 * active language from the settings store and resolves the key, falling back to
 * English then to the literal key when not found.
 *
 * Reactive: components using `t()` re-render when the language changes (Zustand
 * selector subscription on `settingsStore.language`).
 *
 * Supports function-valued entries (`picker.lastUsedMinutes(5)`) by forwarding
 * extra args.
 */
export function useTranslation(): (key: keyof EnKeys, ...args: never[]) => string {
  const language = useSettingsStore((s) => s.language)
  const table = locales[language] ?? en

  return (key, ...args) => {
    const value = (table[key] ?? en[key] ?? key) as unknown
    if (typeof value === 'function') {
      return String(value(...args))
    }
    return String(value)
  }
}