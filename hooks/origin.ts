// D'où vient une ligne « utilisateur » : vos propres messages, ou une ligne automatique ?
//
// Dans Desktop, vos messages ne sont pas étiquetés « saisis au clavier » (`composer`) : Desktop
// pilote Claude Code par son SDK, et la transcription les marque `promptSource: "sdk"`. Plutôt que
// de lister les origines qui comptent comme vous (au risque d'en oublier), on liste les origines
// automatiques ; tout le reste est traité comme un message de vous.
const AUTOMATIC = new Set([
  'task-notification',
  'scheduled-trigger',
  'peer',
  'peer-send-message',
  'projects-relay',
  'channel',
  'coordinator',
  'observer',
  'observer-activity',
  'auto-continuation',
  'plugin',
])

export const isOwnMessage = (kind: string): boolean => !AUTOMATIC.has(kind)
