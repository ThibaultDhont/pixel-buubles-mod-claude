// Quel portrait pour quelle situation : les règles du « premier jeu ». Fonctions pures, testées ;
// register.tsx les branche sur les bulles, la bande, le panneau et la bulle de question.
//
// Trois familles de règles :
//   - une BULLE d'assistant : d'après son seul texte (elle garde donc son portrait quand Desktop la
//     redessine, même si la situation a changé depuis) ;
//   - la BANDE pendant le travail : d'après le tour en cours (outils, erreurs) et le contexte ;
//   - le PANNEAU au repos : d'après le contexte et l'inactivité.
// Les mots sont cherchés en français et en anglais. Tout se règle ici : les listes de mots et les
// seuils.
import type { Expression } from './portrait'

// ---------- Seuils ----------
// Nombre d'erreurs d'outils, dans un tour, à partir duquel le portrait de la bande s'énerve.
export const ANGRY_AFTER_ERRORS = 3
// Nombre d'outils, dans un tour, à partir duquel il se concentre.
export const FOCUSED_AFTER_TOOLS = 10
// Remplissage du contexte (en pour cent) à partir duquel il est fatigué.
export const TIRED_AT_CONTEXT = 85
// Secondes sans activité à partir desquelles le panneau s'endort.
export const SLEEP_AFTER_SECONDS = 300

// ---------- Mots ----------
const SAD_WORDS = [
  'désolé', 'désolée', 'désolés', 'désolées', 'navré', 'navrée', 'malheureusement', 'hélas',
  'sorry', 'unfortunately', 'apologies', 'apologize', 'apologise',
]
const SAD_PHRASES = ['mes excuses', "je m'excuse", 'toutes mes excuses', 'my apologies', "i'm afraid"]

const SURPRISE_WORDS = [
  'oh', 'ah', 'tiens', 'étonnant', 'étonnante', 'étonnamment', 'surprenant', 'surprenante',
  'inattendu', 'inattendue', 'bizarre', 'curieusement', 'étrangement',
  'wow', 'whoa', 'surprisingly', 'unexpectedly', 'weird', 'strange',
]
const SURPRISE_PHRASES = ['contre toute attente', "je ne m'y attendais pas", "didn't expect"]

const HAPPY_WORDS = [
  'parfait', 'parfaite', 'excellent', 'excellente', 'super', 'bravo', 'génial', 'géniale', 'ravi',
  'ravie', 'réussi', 'réussie', 'réussis', 'voilà', 'félicitations', 'merci',
  'perfect', 'great', 'awesome', 'congratulations', 'thanks',
]
const HAPPY_PHRASES = [
  "c'est fait", 'avec succès', 'tout passe', 'tous les tests passent', 'tests passent',
  'bonne nouvelle', 'avec plaisir', 'de rien', 'successfully', 'it works', 'all tests pass', 'glad to',
]

// ---------- Outils de lecture ----------
// minuscules, apostrophes typographiques ramenées à l'apostrophe droite
const normalize = (text: string): string => text.toLowerCase().replace(/[’‘]/g, "'")

// les mots du texte : suites de lettres (accentuées comprises) et d'apostrophes
const wordsOf = (lower: string): Set<string> => new Set(lower.split(/[^a-zà-ÿœæ']+/).filter(Boolean))

const mentions = (lower: string, words: Set<string>, listed: readonly string[], phrases: readonly string[]): boolean =>
  listed.some(word => words.has(word)) || phrases.some(phrase => lower.includes(phrase))

// Un texte long n'est lu que par son début et sa fin : un mot au milieu d'un long exposé ne dit rien
// du ton de la réponse.
const SAMPLE = 350
const sampleOf = (text: string): string =>
  text.length > 2 * SAMPLE ? `${text.slice(0, SAMPLE)} ${text.slice(-SAMPLE)}` : text

// La dernière ligne du texte se termine-t-elle par une question (au Markdown et aux guillemets près) ?
export const endsWithQuestion = (text: string): boolean => {
  const lines = text.trim().split('\n').map(line => line.trim()).filter(line => line !== '')
  const last = lines[lines.length - 1] ?? ''

  return last.replace(/[\s*_`"'»)\]”’]+$/, '').endsWith('?')
}

// ---------- Les règles ----------
// Une bulle d'assistant, d'après son texte. Le premier signal gagne : excuses (triste), surprise,
// question finale (curieux), joie ou remerciement (content) ; sinon neutre.
export const bubbleExpression = (text: string): Expression => {
  const lower = normalize(sampleOf(text))
  const words = wordsOf(lower)

  if (mentions(lower, words, SAD_WORDS, SAD_PHRASES)) {
    return 'triste'
  }
  if (mentions(lower, words, SURPRISE_WORDS, SURPRISE_PHRASES)) {
    return 'surpris'
  }
  if (endsWithQuestion(text)) {
    return 'curieux'
  }
  if (mentions(lower, words, HAPPY_WORDS, HAPPY_PHRASES)) {
    return 'content'
  }

  return 'neutre'
}

export type WorkSituation = {
  // outils appelés depuis le début du tour (hors outils internes de l'application)
  tools: number
  // outils en erreur depuis le début du tour
  errors: number
  // remplissage du contexte en pour cent, `null` tant qu'on ne le connaît pas
  contextPercent: number | null
}

const isTired = (contextPercent: number | null): boolean => contextPercent !== null && contextPercent >= TIRED_AT_CONTEXT

// Le portrait pendant le travail : énervé après plusieurs erreurs, fatigué si le contexte est presque
// plein, concentré après beaucoup d'outils ; sinon pensif.
export const workExpression = ({ tools, errors, contextPercent }: WorkSituation): Expression => {
  if (errors >= ANGRY_AFTER_ERRORS) {
    return 'enerve'
  }
  if (isTired(contextPercent)) {
    return 'fatigue'
  }
  if (tools >= FOCUSED_AFTER_TOOLS) {
    return 'concentre'
  }

  return 'reflechi'
}

export type RestSituation = {
  contextPercent: number | null
  // vrai après SLEEP_AFTER_SECONDS sans activité
  idle: boolean
}

// Le portrait au repos : endormi après un long moment sans activité, fatigué si le contexte est
// presque plein ; sinon neutre.
export const restingExpression = ({ contextPercent, idle }: RestSituation): Expression => {
  if (idle) {
    return 'endormi'
  }
  if (isTired(contextPercent)) {
    return 'fatigue'
  }

  return 'neutre'
}

// Le portrait de la bulle qui précède une question à choix : toujours curieux.
export const QUESTION_EXPRESSION: Expression = 'curieux'
