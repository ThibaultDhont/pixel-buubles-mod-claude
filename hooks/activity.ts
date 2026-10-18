// Ce que l'assistant est en train de faire, en phrases courtes pour la fenêtre d'état de la bande.

export const WAITING_LABEL = 'Réflexion en cours…'

// Outils internes de l'application Desktop (mises à jour de plan, gestion de session…) : ils ne
// comptent pas dans la bande et ne changent pas l'action affichée.
export const isInternalTool = (tool: string): boolean => tool.startsWith('mcp__ccd_')

const fileName = (path: unknown): string =>
  typeof path === 'string' ? (path.split(/[\\/]/).filter(Boolean).pop() ?? '') : ''

// La phrase qui décrit un appel d'outil, d'après son nom et ses arguments.
export const describeTool = (tool: string, input: Readonly<Record<string, unknown>>): string => {
  const file = fileName(input.file_path ?? input.notebook_path)

  switch (tool) {
    case 'Read':
      return file ? `Je lis ${file}` : 'Je lis un fichier'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return file ? `Je modifie ${file}` : 'Je modifie un fichier'
    case 'Write':
      return file ? `J'écris ${file}` : "J'écris un fichier"
    case 'Bash':
    case 'PowerShell':
      return "J'exécute une commande"
    case 'Grep':
    case 'Glob':
      return 'Je cherche dans le projet'
    case 'WebFetch':
    case 'WebSearch':
      return 'Je consulte le web'
    case 'Agent':
    case 'Task':
      return 'Je délègue à un sous-agent'
    case 'Skill':
      return "J'utilise une compétence"
    case 'AskUserQuestion':
      return "J'attends votre réponse"
    default:
      return tool.startsWith('mcp__') ? "J'utilise un connecteur" : `J'utilise ${tool}`
  }
}

// Le texte de la ligne d'attente de Desktop : l'étape en cours (`word`, ou `message` s'il la
// remplace), suivie des points de suspension. « Working », que Desktop écrit quand la ligne n'a pas
// de mots, devient « Réflexion en cours ».
export const spinnerText = (word: string, message: string | null, suffix: string): string => {
  const text = message ?? (word === 'Working' ? 'Réflexion en cours' : word)

  return text.endsWith('…') ? text : `${text}${suffix}`
}

// La phrase de la bulle qui précède un dialogue de questions.
export const questionIntro = (count: number): string =>
  count > 1 ? `J'ai ${count} questions pour vous :` : "J'ai une question pour vous :"

// Temps écoulé : « 8 s », « 1 min 05 s ».
export const formatElapsed = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds} s`
  }

  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`
}

export const toolCount = (count: number): string =>
  count === 0 ? 'Aucun outil' : count === 1 ? '1 outil' : `${count} outils`

// Barre d'activité : un bloc de deux cases qui fait des allers-retours, une case par seconde.
export const activityBar = (step: number, width = 12): string => {
  const span = width - 2
  const cycle = span * 2
  const at = step % cycle
  const position = at <= span ? at : cycle - at

  return Array.from({ length: width }, (_, i) => (i === position || i === position + 1 ? '▰' : '▱')).join('')
}
