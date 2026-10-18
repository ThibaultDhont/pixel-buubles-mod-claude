import type { Attached } from '../types'

// Le dessin d'un message utilisateur remplace celui de Desktop, et avec lui la carte d'une pièce
// jointe (image collée, document) : le mod ne reçoit que le texte du message, pas la pièce jointe.
// Pour ne rien faire disparaître, les messages qui en portent une gardent le dessin de Desktop.

type Block = { type: string; [field: string]: unknown }

export const hasAttachment = (content: readonly Block[]): boolean =>
  content.some(block => block.type === 'image' || block.type === 'document')

// Texte des blocs de texte d'un message, mis bout à bout.
export const textOf = (content: readonly Block[]): string =>
  content
    .map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text.trim() : ''))
    .filter(text => text !== '')
    .join('\n')

// Le message affiché a-t-il une pièce jointe ? On compare d'abord l'identifiant (celui de la
// ligne, si Desktop le donne comme `requestId`), puis le texte : l'un ou l'autre suffit. Se
// tromper dans ce sens est sans gravité : le message garde alors le dessin de Desktop.
export const isAttached = (attached: Attached, requestId: string, text: string): boolean => {
  const shown = text.trim()

  return attached.ids.includes(requestId) || (shown !== '' && attached.texts.some(known => known.includes(shown)))
}

// On ne garde que les derniers : la liste ne doit pas grossir sans fin.
export const remember = (attached: Attached, id: string, text: string, keep = 100): Attached => ({
  ids: [...attached.ids, id].slice(-keep),
  texts: [...attached.texts, text].slice(-keep),
})
