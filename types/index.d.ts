// Ce que montre la fenêtre d'état de la bande pendant le travail : secondes écoulées depuis le
// début du tour, nombre d'outils appelés, et phrase décrivant le dernier.
export type Work = { seconds: number; tools: number; label: string }

// Messages de l'utilisateur qui portent une pièce jointe (identifiants de leur ligne, et textes) :
// ils gardent le dessin de Desktop, car le mod ne sait pas dessiner la pièce jointe.
export type Attached = { ids: string[]; texts: string[] }

// Ce que montre le panneau de statut : l'état de toute la session (et non d'un tour). `null` tant
// que Desktop n'a pas donné le chiffre (contexte, début de session).
export type Status = {
  turns: number
  tools: number
  // outils en erreur dans le tour en cours (remis à zéro au début de chaque tour)
  errors: number
  working: boolean
  // vrai après plusieurs minutes sans activité (voir hooks/mood.ts)
  idle: boolean
  contextPercent: number | null
  limits: { kind: string; percent: number }[]
  startedAt: number | null
}

// La graine du calendrier de clignement du portrait pensif, tirée au début de chaque tour (voir
// hooks/blink.ts) : la bande passe la même source à Desktop pendant tout le tour.
export type Blink = { seed: number }

declare module 'claude-code' {
  interface PluginState {
    'pixel-bubbles': { work: Work; attached: Attached; status: Status; blink: Blink }
  }
}
