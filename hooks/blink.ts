// Le clignement des yeux du portrait pensif dans la bande de réflexion.
//
// Deux couches de paupières (hooks/eyelids.ts, générées par tools/build_blink.js) sont ajoutées à la
// fin du SVG du portrait, invisibles. Une animation SMIL à états discrets les montre tour à tour :
// yeux ouverts, puis clos, puis mi-clos, puis ouverts de nouveau. C'est le navigateur de Desktop qui
// anime, sans que le mod redessine la bande ; Desktop ne la joue que pour un `Svg` déclaré
// `isInteractive`.
//
// Les clignements ne sont pas réguliers : un calendrier est tiré d'une graine (une par tour, voir
// register.tsx), avec des intervalles inégaux et, parfois, un double clignement. Le calendrier couvre
// une quarantaine de secondes puis reboucle ; la même graine donne toujours le même SVG, ce qui
// permet à la bande de passer la même source à chaque redessin sans que l'animation reparte de zéro.
import { EYELIDS_CLOSED, EYELIDS_HALF } from './eyelids'

// Durée de chaque état d'un clignement, en secondes : yeux clos, puis mi-clos.
export const BLINK_CLOSED_FOR = 0.08
export const BLINK_HALF_FOR = 0.08
const BLINK_TOTAL = BLINK_CLOSED_FOR + BLINK_HALF_FOR

// Le calendrier : le premier clignement tombe entre 2,5 et 6 s après l'apparition du portrait (assez
// tard pour que Desktop ait fini de préparer l'image animée : un accroc a été vu à un premier
// clignement plus précoce), les suivants 2,6 à 7 s après la fin du précédent, et, une fois sur six
// environ, un double clignement suit le premier de 0,45 à 0,7 s. Un cycle couvre au moins BLINK_SPAN
// secondes, puis reboucle.
export const BLINK_SPAN = 40
export const BLINK_FIRST: readonly [number, number] = [2.5, 6]
export const BLINK_INTERVAL: readonly [number, number] = [2.6, 7]
export const BLINK_DOUBLE_CHANCE = 0.18
export const BLINK_DOUBLE_GAP: readonly [number, number] = [0.45, 0.7]
// Pause entre le dernier clignement et le début du cycle suivant : avec le premier clignement du
// cycle (2,5 à 6 s), elle donne au raccord un intervalle de 2,6 à 7 s, comme les autres.
export const BLINK_SEAM: readonly [number, number] = [0.1, 1]

// Une graine d'après l'heure (en millisecondes) : un entier de 1 à 2147483646.
export const blinkSeed = (now: number): number => (Math.floor(Math.abs(now)) % 2147483646) + 1

// Générateur pseudo-aléatoire (mulberry32) : même graine, mêmes tirages.
const generator = (seed: number): (() => number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Les instants (en secondes depuis le début du cycle) où les yeux se ferment, et la durée du cycle.
export const blinkPlan = (seed: number): { times: number[]; cycle: number } => {
  const next = generator(seed)
  const between = ([low, high]: readonly [number, number]): number => low + next() * (high - low)
  const times: number[] = []
  let time = between(BLINK_FIRST)

  while (time < BLINK_SPAN) {
    times.push(time)
    time += BLINK_TOTAL + (next() < BLINK_DOUBLE_CHANCE ? between(BLINK_DOUBLE_GAP) : between(BLINK_INTERVAL))
  }

  const last = times[times.length - 1] ?? 0

  return { times, cycle: last + BLINK_TOTAL + between(BLINK_SEAM) }
}

// Une couche invisible dont l'opacité suit `steps` : des paires (instant en secondes, opacité) ;
// `calcMode="discrete"` : l'opacité saute d'une valeur à l'autre, sans fondu.
const layer = (rects: string, steps: readonly (readonly [number, 0 | 1])[], cycle: number): string => {
  const values = ['0', ...steps.map(([, opacity]) => String(opacity))].join(';')
  const keyTimes = ['0', ...steps.map(([time]) => (time / cycle).toFixed(5))].join(';')

  return (
    `<g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="${values}" ` +
    `keyTimes="${keyTimes}" dur="${cycle.toFixed(3)}s" repeatCount="indefinite"/>${rects}</g>`
  )
}

// Le portrait, avec ses deux couches de paupières animées selon le calendrier de la graine. Une source
// sans balise fermante est rendue telle quelle.
export const blinkingPortrait = (source: string, seed: number): string => {
  const end = source.lastIndexOf('</svg>')

  if (end === -1) {
    return source
  }

  const { times, cycle } = blinkPlan(seed)
  // les yeux clos de t à t + 80 ms, puis mi-clos jusqu'à t + 160 ms, puis ouverts de nouveau
  const closed = layer(
    EYELIDS_CLOSED,
    times.flatMap((t): [number, 0 | 1][] => [[t, 1], [t + BLINK_CLOSED_FOR, 0]]),
    cycle,
  )
  const half = layer(
    EYELIDS_HALF,
    times.flatMap((t): [number, 0 | 1][] => [[t + BLINK_CLOSED_FOR, 1], [t + BLINK_TOTAL, 0]]),
    cycle,
  )

  return `${source.slice(0, end)}${closed}${half}${source.slice(end)}`
}
