// Ce que montre le panneau de statut : jauges, libellés et durée. Fonctions pures, testées ; le
// dessin est dans register.tsx.

export type Limit = { kind: string; percent: number }

// Jauge de dix cases, comme la barre d'activité : « ▰▰▰▱▱▱▱▱▱▱ » pour 30 %.
export const meter = (percent: number, width = 10): string => {
  const clamped = Math.min(100, Math.max(0, percent))
  const filled = Math.round((clamped / 100) * width)

  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

export const percentLabel = (percent: number | null | undefined): string =>
  percent === null || percent === undefined ? '—' : `${Math.round(percent)} %`

// Les fenêtres de limite d'usage que Claude Code annonce : cinq heures, sept jours, plafond de dépense.
export const limitLabel = (kind: string): string => {
  switch (kind) {
    case 'five_hour':
      return 'Limite 5 h'
    case 'seven_day':
      return 'Limite 7 jours'
    case 'spend_limit':
      return 'Plafond de dépense'
    default:
      return kind.replace(/_/g, ' ')
  }
}

export const limitsOf = (rows: readonly { kind: string; percentUsed: number }[]): Limit[] =>
  rows.map(row => ({ kind: row.kind, percent: row.percentUsed }))

// Durée de la session : « moins d'une minute », « 12 min », « 1 h 05 min ».
export const formatSession = (milliseconds: number): string => {
  const minutes = Math.max(0, Math.floor(milliseconds / 60000))

  if (minutes < 1) {
    return "moins d'une minute"
  }
  if (minutes < 60) {
    return `${minutes} min`
  }

  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

export const turnCount = (count: number): string => (count === 1 ? '1 tour' : `${count} tours`)

export const RESTING_LABEL = 'En attente de vos ordres'
