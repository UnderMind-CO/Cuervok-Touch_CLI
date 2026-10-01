import type { EnKeys } from './en'

export const fr: EnKeys = {
  'login.title': 'Connexion',
  'login.subtitle': 'Saisissez vos identifiants pour vous connecter',
  'login.username': 'Identifiant',
  'login.password': 'Mot de passe',
  'login.connect': 'Se connecter',
  'login.connecting': 'Connexion...',
  'login.clearAll': 'Effacer',
  'login.errorEmpty': 'Veuillez saisir votre identifiant et votre mot de passe.',
  'login.errorGeneric': 'Échec de la connexion',
  'login.back': 'Retour',

  'picker.title': 'Vos comptes',
  'picker.subtitle': 'Sélectionnez un compte pour vous connecter automatiquement',
  'picker.addAccount': 'Ajouter un compte',
  'picker.removeAccount': 'Supprimer le compte',
  'picker.removeConfirm': 'Supprimer ce compte enregistré ?',
  'picker.lastUsed': 'Utilisé',
  'picker.lastUsedNow': 'à l\'instant',
  'picker.lastUsedMinutes': (n: number) => `il y a ${n}m`,
  'picker.lastUsedHours': (n: number) => `il y a ${n}h`,
  'picker.lastUsedDays': (n: number) => `il y a ${n}j`,
  'picker.lastUsedUnknown': 'il y a un moment',
}