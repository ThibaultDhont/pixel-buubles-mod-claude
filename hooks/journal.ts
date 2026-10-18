// Le « journal d'actions » : une ligne par appel d'outil, avec une marque selon l'état de l'appel.
// Fonctions pures, testées ; le dessin est dans register.tsx.

export type CallState = {
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
}

export type Mark = { symbol: string; kind: 'running' | 'done' | 'failed' }

// Coche si l'appel a réussi, croix s'il a échoué ou a été interrompu, flèche tant qu'il tourne.
export const markOf = ({ isRunning, isErrored, isInterrupted }: CallState): Mark => {
  if (isInterrupted || isErrored) {
    return { symbol: '✗', kind: 'failed' }
  }

  return isRunning ? { symbol: '▸', kind: 'running' } : { symbol: '✓', kind: 'done' }
}

const fileName = (path: unknown): string =>
  typeof path === 'string' ? (path.split(/[\\/]/).filter(Boolean).pop() ?? '') : ''

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

// Texte sur une seule ligne, coupé à `max` caractères.
export const shorten = (value: string, max = 80): string => {
  const line = value.replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const record = (input: unknown): Readonly<Record<string, unknown>> =>
  typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}

// Le nom d'un outil de connecteur : « mcp__serveur__outil » devient « serveur · outil ».
const connectorName = (tool: string): string => {
  const [server, ...rest] = tool.slice('mcp__'.length).split('__')

  return rest.length > 0 ? `${server} · ${rest.join('__')}` : (server ?? tool)
}

// La ligne du journal pour un appel : un nom court d'action, puis sa cible.
export const describeLog = (tool: string, rawInput: unknown): string => {
  const input = record(rawInput)
  const file = fileName(input.file_path ?? input.notebook_path)

  switch (tool) {
    case 'Read':
      return file ? `Lecture de ${file}` : 'Lecture d’un fichier'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return file ? `Modification de ${file}` : 'Modification d’un fichier'
    case 'Write':
      return file ? `Écriture de ${file}` : 'Écriture d’un fichier'
    case 'Bash':
    case 'PowerShell': {
      const what = text(input.description) || text(input.command)

      return what ? `Commande : ${shorten(what)}` : 'Commande'
    }
    case 'Grep':
    case 'Glob': {
      const what = text(input.pattern)

      return what ? `Recherche : ${shorten(what, 60)}` : 'Recherche dans le projet'
    }
    case 'WebFetch': {
      const what = text(input.url)

      return what ? `Consultation : ${shorten(what, 60)}` : 'Consultation du web'
    }
    case 'WebSearch': {
      const what = text(input.query)

      return what ? `Recherche web : ${shorten(what, 60)}` : 'Recherche web'
    }
    case 'Agent':
    case 'Task': {
      const what = text(input.description)

      return what ? `Sous-agent : ${shorten(what, 60)}` : 'Sous-agent'
    }
    case 'Skill': {
      const what = text(input.skill)

      return what ? `Compétence : ${what}` : 'Compétence'
    }
    default:
      return tool.startsWith('mcp__') ? `Connecteur : ${connectorName(tool)}` : tool
  }
}

// Un groupe d'appels très long ne montre que les plus récents : les autres se résument en une ligne.
export const GROUP_LIMIT = 8

export const lastCalls = <T>(calls: readonly T[], limit = GROUP_LIMIT): { shown: T[]; hidden: number } => {
  const hidden = Math.max(0, calls.length - limit)

  return { shown: calls.slice(hidden), hidden }
}

export const actionCount = (count: number): string => (count === 1 ? '1 action' : `${count} actions`)
