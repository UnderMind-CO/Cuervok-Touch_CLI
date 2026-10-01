import type { EnKeys } from './en'

export const es: EnKeys = {
  'login.title': 'Iniciar sesión',
  'login.subtitle': 'Introduce tus credenciales para conectarte',
  'login.username': 'Usuario',
  'login.password': 'Contraseña',
  'login.connect': 'Conectar',
  'login.connecting': 'Conectando...',
  'login.clearAll': 'Limpiar',
  'login.errorEmpty': 'Introduce tu usuario y contraseña.',
  'login.errorGeneric': 'Error de conexión',
  'login.back': 'Volver',

  'picker.title': 'Tus cuentas',
  'picker.subtitle': 'Selecciona una cuenta para conectarte automáticamente',
  'picker.addAccount': 'Agregar cuenta',
  'picker.removeAccount': 'Eliminar cuenta',
  'picker.removeConfirm': '¿Eliminar esta cuenta guardada?',
  'picker.lastUsed': 'Usado',
  'picker.lastUsedNow': 'recién',
  'picker.lastUsedMinutes': (n: number) => `hace ${n}m`,
  'picker.lastUsedHours': (n: number) => `hace ${n}h`,
  'picker.lastUsedDays': (n: number) => `hace ${n}d`,
  'picker.lastUsedUnknown': 'hace un tiempo',
}