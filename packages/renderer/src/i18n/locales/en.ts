/** Type of the English locale table — used as the canonical shape for all other locales. */
export type EnKeys = Record<string, string | ((...args: number[]) => string)>

export const en: EnKeys = {
  'login.title': 'Sign in',
  'login.subtitle': 'Enter your credentials to connect',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.connect': 'Connect',
  'login.connecting': 'Connecting...',
  'login.clearAll': 'Clear all',
  'login.errorEmpty': 'Please enter your username and password.',
  'login.errorGeneric': 'Connection failed',
  'login.back': 'Back',

  'picker.title': 'Your accounts',
  'picker.subtitle': 'Select an account to connect automatically',
  'picker.addAccount': 'Add account',
  'picker.removeAccount': 'Remove account',
  'picker.removeConfirm': 'Remove this saved account?',
  'picker.lastUsed': 'Last used',
  'picker.lastUsedNow': 'just now',
  'picker.lastUsedMinutes': (n: number) => `${n}m ago`,
  'picker.lastUsedHours': (n: number) => `${n}h ago`,
  'picker.lastUsedDays': (n: number) => `${n}d ago`,
  'picker.lastUsedUnknown': 'a while ago',
}