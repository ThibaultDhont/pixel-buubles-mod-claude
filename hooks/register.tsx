import { atom, read, update } from 'claude-code'
import type { Elements, Register, Timer } from 'claude-code'

import {
  WAITING_LABEL,
  activityBar,
  describeTool,
  formatElapsed,
  isInternalTool,
  questionIntro,
  spinnerText,
  toolCount,
} from './activity'
import { hasAttachment, isAttached, remember, textOf } from './attachments'
import { BACKGROUND, BACKGROUND_HEIGHT, BACKGROUND_WIDTH } from './background'
import { blinkSeed, blinkingPortrait } from './blink'
import { actionCount, describeLog, lastCalls, markOf } from './journal'
import type { Mark } from './journal'
import { isOwnMessage } from './origin'
import { PANEL_BACKGROUND, PANEL_BACKGROUND_HEIGHT, PANEL_BACKGROUND_WIDTH } from './panel-background'
import { PORTRAITS, PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from './portrait'
import type { Expression } from './portrait'
import {
  RESTING_LABEL,
  formatSession,
  limitLabel,
  limitsOf,
  meter,
  percentLabel,
  turnCount,
} from './status'

// État du travail en cours. Il doit être déclaré ici, dans le fichier du mod : le moteur lit les
// références d'état dans ce fichier pour en lister les valeurs.
const work = atom({ plugin: 'pixel-bubbles', key: 'work' } as const, {
  seconds: 0,
  tools: 0,
  label: WAITING_LABEL,
})

// Messages de l'utilisateur qui portent une pièce jointe : ils gardent le dessin de Desktop.
const attached = atom({ plugin: 'pixel-bubbles', key: 'attached' } as const, { ids: [], texts: [] })

// La graine du calendrier de clignement du portrait de la bande, tirée au début de chaque tour.
const blink = atom({ plugin: 'pixel-bubbles', key: 'blink' } as const, { seed: 1 })

// État de toute la session, pour le panneau de statut : tours, outils, travail en cours, remplissage
// du contexte, limites d'usage et début de session.
const status = atom({ plugin: 'pixel-bubbles', key: 'status' } as const, {
  turns: 0,
  tools: 0,
  working: false,
  contextPercent: null,
  limits: [],
  startedAt: null,
})

// Le panneau de statut : le portrait toujours visible et une fenêtre de jauges, à côté de la
// conversation. `columns` demande sa largeur (en cellules d'environ 8,5 px) quand il est ancré.
const PANE = 'statut'
const PANE_ARGS = { id: PANE, title: 'Statut', columns: 34 }

// Le portrait pensif de la bande, avec ses paupières animées (hooks/blink.ts) selon le calendrier de
// la graine du tour. Il est calculé une fois par graine : la bande est redessinée chaque seconde et
// doit passer la même source à Desktop pendant tout le tour, pour que l'animation ne reparte pas de
// zéro.
let blinkingSeed: number | undefined
let blinkingSource = ''
const blinkingReflechi = (seed: number): string => {
  if (blinkingSeed !== seed) {
    blinkingSeed = seed
    blinkingSource = blinkingPortrait(PORTRAITS.reflechi, seed)
  }

  return blinkingSource
}

// Cadre doré et voile bleu léger façon menu de jeu. Le voile est translucide : il ne
// touche pas à la couleur du texte, qui suit le thème de Desktop (clair ou sombre).
const FRAME = '#d9b44a'
const TINT = '#4068c826'

// Fond du panneau qui recouvre la carte grise de la bande : la couleur de fond de Desktop en
// thème sombre (#151515, mesurée ; la carte, elle, est #212121). En thème clair, ce panneau
// apparaît comme un bloc sombre. Il reste visible derrière le décor, si celui-ci ne le couvre pas.
const PANEL = '#151515'

// Fond de la fenêtre d'état, presque opaque pour que le texte reste lisible sur le décor.
const WINDOW = '#0d1424eb'

// Vos messages se distinguent de ceux de l'assistant par la couleur (bleu clair au lieu de doré) et
// un voile bleu plus marqué. Leur cadre est double, comme celui de l'assistant (un cadre arrondi,
// essayé d'abord, ne vous plaisait pas).
const USER_FRAME = '#7aa2f7'
const USER_TINT = '#3a56c066'

// Marge à gauche de vos bulles, en cellules : elle plafonne leur largeur à celle des bulles de
// l'assistant, dont la marge gauche porte le portrait (96 px) et la pointe (12 px). Une cellule de
// Desktop fait environ 8,5 px : 12 cellules (environ 100 px) sont donc proches du portrait (96 px)
// et, au pire, rendent vos bulles un peu plus étroites que les miennes.
const USER_GUTTER_CELLS = 12

// Journal d'actions : cadre doré simple (les bulles ont le double), voile bleu très léger, coche
// verte pour un appel réussi, croix rouge pour un échec ou une interruption.
const JOURNAL_TINT = '#4068c81a'
const JOURNAL_OK = '#8fd694'
const JOURNAL_FAIL = '#f7768e'
const markColor = (kind: Mark['kind']) =>
  kind === 'done' ? JOURNAL_OK : kind === 'failed' ? JOURNAL_FAIL : FRAME

// Pointe de la bulle : triangle pixel art de 6x11, affiché à 2x. Vers la gauche pour les bulles
// de l'assistant (elle désigne le portrait), vers la droite pour celles de l'utilisateur.
const SCALE = 2
const TAIL_UNITS_WIDE = 6
const TAIL_UNITS_HIGH = 11
const tailSvg = (pointing: 'left' | 'right', color: string = FRAME) => {
  const path = Array.from({ length: TAIL_UNITS_HIGH }, (_, row) => {
    const inset = Math.abs(row - (TAIL_UNITS_HIGH - 1) / 2)
    const width = TAIL_UNITS_WIDE - inset
    // Vers la gauche, la base est collée au bord droit du dessin ; vers la droite, au bord gauche.
    return `M${pointing === 'left' ? inset : 0} ${row}h${width}v1h-${width}z`
  }).join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TAIL_UNITS_WIDE} ${TAIL_UNITS_HIGH}" ` +
    `width="${TAIL_UNITS_WIDE * SCALE}" height="${TAIL_UNITS_HIGH * SCALE}" shape-rendering="crispEdges">` +
    `<path fill="${color}" d="${path}"/></svg>`
  )
}
const TAIL = tailSvg('left')
const TAIL_RIGHT = tailSvg('right', USER_FRAME)
const TAIL_WIDTH = TAIL_UNITS_WIDE * SCALE
const TAIL_HEIGHT = TAIL_UNITS_HIGH * SCALE

// Nom en tête d'une bulle, dans le cadre : en gras, de la couleur du cadre, avec un losange. À
// gauche pour l'assistant, à droite pour vous. Un onglet posé au-dessus du cadre (essai 0.25.0) restait
// détaché : Desktop trace la ligne de la bordure au milieu d'une rangée, d'où un vide sous l'onglet.
const nameLabel = (
  { Box, Text }: Pick<Elements['desktop'], 'Box' | 'Text'>,
  name: string,
  color: string,
  side: 'left' | 'right',
) => (
  <Box alignSelf={side === 'left' ? 'flex-start' : 'flex-end'}>
    <Text weight="bold" color={color}>
      {side === 'left' ? `◆ ${name}` : `${name} ◆`}
    </Text>
  </Box>
)

// Le portrait en bas à gauche, avec la pointe dorée qui s'en détache vers la bulle.
const portraitWithTail = ({ Box, Svg }: Pick<Elements['desktop'], 'Box' | 'Svg'>, expression: Expression) => (
  <Box flexDirection="row" alignItems="flex-end" flexShrink={0}>
    <Svg
      source={PORTRAITS[expression]}
      alt="Portrait du personnage"
      width={PORTRAIT_WIDTH}
      height={PORTRAIT_HEIGHT}
    />
    <Box marginBottom={1}>
      <Svg source={TAIL} alt="Pointe de la bulle de dialogue" width={TAIL_WIDTH} height={TAIL_HEIGHT} />
    </Box>
  </Box>
)

export const register: Register = on => {
  let timer: Timer | undefined
  const stopTimer = () => {
    timer?.cancel()
    timer = undefined
  }

  // Au chargement (et après un rechargement du mod), on relève les messages déjà présents qui
  // portent une pièce jointe, pour qu'ils gardent le dessin de Desktop.
  on('session.start', async ($, e, next) => {
    const rows = await $.session.messages({ as: 'api' })
    const texts = rows
      .filter(row => row.role === 'user' && hasAttachment(row.content))
      .map(row => textOf(row.content))
      .filter(text => text !== '')
    await update($, attached, () => ({ ids: [], texts: texts.slice(-100) }))

    // Panneau de statut : la commande /statut, les chiffres de départ, et le panneau lui-même si
    // Desktop est déjà connecté. Une panne ici ne doit pas priver le reste du mod de son départ.
    try {
      await $.command.register({
        name: 'statut',
        description: 'Ouvre le panneau de statut : portrait et jauges de la session',
      })
      const usage = await $.session.usage()
      await update($, status, current => ({
        ...current,
        contextPercent: usage.context.percent ?? null,
        limits: limitsOf(usage.rateLimits),
        startedAt: usage.startedAt,
      }))

      if ((await $.session.surfaces()).includes('desktop')) {
        await $.ui.open(PANE_ARGS)
      }
    } catch {
      // le panneau est un plus : sans lui, bulles et bande fonctionnent comme avant
    }

    return next(e)
  })

  // Puis, à chaque nouveau message de l'utilisateur qui porte une pièce jointe.
  on('session.append', { door: 'prompt' }, async ($, e, next) => {
    const stored = await next(e)

    if (e.message.type === 'user' && hasAttachment(e.message.content)) {
      await update($, attached, current => remember(current, e.uuid, textOf(e.message.content)))
    }

    return stored
  }).catch(($, e, next) => next(e))

  // Début d'un tour de la boucle principale : la fenêtre d'état repart de zéro, et un compteur
  // d'une seconde la fait vivre tant que le tour dure.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      stopTimer()
      // un nouveau calendrier de clignements à chaque tour, d'après l'heure de départ ; si l'heure
      // manque, le tour garde la graine précédente, et le reste du hook (chronomètre) s'exécute
      try {
        const seed = blinkSeed(await $.clock.now())
        await update($, blink, () => ({ seed }))
      } catch {
        // le clignement est un plus
      }
      await update($, status, current => ({ ...current, working: true }))
      await update($, work, () => ({ seconds: 0, tools: 0, label: WAITING_LABEL }))
      timer = $.clock.every(1000, () => {
        void update($, work, current => ({ ...current, seconds: current.seconds + 1 }))
      })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      stopTimer()
      await update($, status, current => ({ ...current, working: false, turns: current.turns + 1 }))
    }

    return next(e)
  })

  // Chaque appel d'outil de la boucle principale met à jour l'action affichée, sauf les outils
  // internes de l'application (mcp__ccd_*), qui ne comptent pas. Le hook ne modifie jamais l'appel :
  // il passe la main tel quel.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && !isInternalTool(String(e.tool))) {
      const input: Readonly<Record<string, unknown>> = { ...e }
      await update($, work, current => ({
        ...current,
        tools: current.tools + 1,
        label: describeTool(String(e.tool), input),
      }))
      await update($, status, current => ({ ...current, tools: current.tools + 1 }))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Chaque bloc de réponse de l'assistant devient une bulle de dialogue, avec son portrait
  // en bas à gauche et une pointe dorée qui le désigne. Seule la surface desktop est touchée.
  //
  // L'indicateur de réflexion de Desktop (« En cours… ») n'est pas touché : sa ligne ramène les
  // images à la hauteur du texte et en masque la moitié, si bien qu'un portrait y devient une
  // vignette illisible. C'est la bande au-dessus du champ de saisie, plus bas, qui montre le
  // portrait pensif.
  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.isSummary) {
      return next(e)
    }

    const { Box, Markdown, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" alignItems="flex-end" marginY="xs">
        {portraitWithTail({ Box, Svg }, 'neutre')}
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor={FRAME}
          backgroundColor={TINT}
          paddingX="sm"
          flexGrow={1}
          flexShrink={1}
        >
          {nameLabel({ Box, Text }, 'Claude', FRAME, 'left')}
          <Markdown text={e.props.text} />
        </Box>
      </Box>
    )
  })

  // Vos messages : une bulle dans le même style que celles de l'assistant, alignée à droite, avec
  // une pointe vers la droite. Dans Desktop, ils arrivent avec l'origine « sdk » (voir origin.ts).
  // Les lignes automatiques (notifications de tâches, messages d'autres sessions ou agents), la
  // version compacte d'une ligne, un message sans texte et un message avec pièce jointe gardent
  // le dessin de Desktop.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (
      e.surface !== 'desktop' ||
      !isOwnMessage(e.props.origin.kind) ||
      !e.props.isExpanded ||
      e.props.text.trim() === ''
    ) {
      return next(e)
    }

    // Un message qui porte une pièce jointe garde le dessin de Desktop, qui sait la montrer.
    if (isAttached(await read($, attached), e.requestId, e.props.text)) {
      return next(e)
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    // Une marge vide à gauche borne la largeur de la bulle ; le reste de la ligne, aligné à
    // droite, contient la bulle et sa pointe.
    return (
      <Box flexDirection="row" alignItems="flex-end" marginY="xs">
        <Box width={USER_GUTTER_CELLS} flexShrink={0} />
        <Box
          flexDirection="row"
          alignItems="flex-end"
          justifyContent="flex-end"
          flexGrow={1}
          flexShrink={1}
        >
          <Box
            flexDirection="column"
            borderStyle="double"
            borderColor={USER_FRAME}
            backgroundColor={USER_TINT}
            paddingX="sm"
            flexShrink={1}
          >
            {nameLabel({ Box, Text }, 'Vous', USER_FRAME, 'right')}
            <Text wrap="wrap">{e.props.text}</Text>
          </Box>
          <Box marginBottom={1} flexShrink={0}>
            <Svg
              source={TAIL_RIGHT}
              alt="Pointe de la bulle de dialogue"
              width={TAIL_WIDTH}
              height={TAIL_HEIGHT}
            />
          </Box>
        </Box>
      </Box>
    )
  })

  // Journal d'actions : une ligne encadrée en doré par appel d'outil, avec une coche (réussi), une
  // croix (échec ou interruption) ou une flèche (en cours). Essai : si Desktop refuse l'arbre, le
  // moteur dessine sa propre ligne, et rien n'est perdu.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const mark = markOf(e.props)

    return (
      <Box
        flexDirection="row"
        alignSelf="flex-start"
        gap="xs"
        borderStyle="single"
        borderColor={FRAME}
        backgroundColor={JOURNAL_TINT}
        paddingX="sm"
        marginY="xs"
      >
        <Text weight="bold" color={markColor(mark.kind)}>
          {mark.symbol}
        </Text>
        <Text wrap="truncate-end">
          {describeLog(e.props.tool, e.props.input)}
          {e.props.isInterrupted ? ' (interrompu)' : ''}
        </Text>
      </Box>
    )
  })

  // Les appels que Desktop replie en une ligne de compte (« Lu 3 fichiers… ») deviennent un seul
  // cadre qui les liste. Déplié, le groupe retombe sur des lignes d'outil, que le hook ci-dessus habille.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.isExpanded) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const { shown, hidden } = lastCalls(e.props.calls)

    return (
      <Box
        flexDirection="column"
        alignSelf="flex-start"
        borderStyle="single"
        borderColor={FRAME}
        backgroundColor={JOURNAL_TINT}
        paddingX="sm"
        marginY="xs"
      >
        <Text weight="bold" color={FRAME}>
          Journal d'actions · {actionCount(e.props.calls.length)}
        </Text>
        {hidden > 0 ? <Text dimColor>… {hidden} plus anciennes</Text> : null}
        {shown.map(call => {
          const mark = markOf(call)

          return (
            <Box flexDirection="row" gap="xs">
              <Text weight="bold" color={markColor(mark.kind)}>
                {mark.symbol}
              </Text>
              <Text wrap="truncate-end">{describeLog(call.tool, call.input)}</Text>
            </Box>
          )
        })}
      </Box>
    )
  })

  // Le résultat d'un appel isolé (ToolResult) garde le dessin de Desktop : l'entourer d'un cadre
  // (essai 0.16.0) donnait un cadre vide, car Desktop dessine ce résultat hors de l'arbre du mod.

  // Le résultat d'une commande « / » (ligne de texte brut dans Desktop) : même double cadre doré et
  // même voile bleu que les bulles, en rouge si la commande a échoué. Le texte est redessiné par le
  // mod (un nœud Markdown), pas repris de Desktop : un cadre autour du dessin de Desktop restait vide.
  on('ui.render', { component: 'CommandOutput' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.text.trim() === '') {
      return next(e)
    }

    const { Box, Markdown } = $.ui.resolve(e)

    return (
      <Box
        borderStyle="double"
        borderColor={e.props.isErrored ? JOURNAL_FAIL : FRAME}
        backgroundColor={TINT}
        paddingX="sm"
        marginY="xs"
        flexShrink={1}
      >
        <Markdown text={e.props.text} />
      </Box>
    )
  })

  // Le dialogue AskUserQuestion garde le dessin de Desktop, qui le dessine hors de l'arbre du mod :
  // l'entourer d'un cadre (essai 0.17.0) donnait un cadre vide. Le mod ajoute donc au-dessus une
  // bulle d'introduction avec le portrait ; le moteur exige exactement un nœud « engine » dans
  // l'arbre, qui est ici le dialogue (`await next(e)`).
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const original = await next(e)

    if (e.surface !== 'desktop' || original === undefined || original === null) {
      return original
    }

    const { Box, Svg, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="flex-end" marginY="xs">
          {portraitWithTail({ Box, Svg }, 'neutre')}
          <Box
            borderStyle="double"
            borderColor={FRAME}
            backgroundColor={TINT}
            paddingX="sm"
            flexGrow={1}
            flexShrink={1}
          >
            <Text>{questionIntro(e.props.questions.length)}</Text>
          </Box>
        </Box>
        {original}
      </Box>
    )
  })

  // Panneau de statut. Au démarrage (voir `session.start`, si Desktop est déjà là) ou quand Desktop
  // se connecte, le mod ouvre le panneau ; la commande /statut le rouvre. Le terminal n'en reçoit
  // jamais.
  on('session.attach', async ($, e, next) => {
    if (e.surface === 'desktop') {
      await $.ui.open(PANE_ARGS)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'statut' }, async $ => {
    const opened = await $.ui.open(PANE_ARGS)

    return { text: opened.isPlaced ? 'Panneau de statut ouvert.' : "Le panneau de statut n'a pas de place ici." }
  })

  on('session.measure', async ($, e, next) => {
    await update($, status, current => ({
      ...current,
      contextPercent: e.context.percent ?? null,
      limits: limitsOf(e.rateLimits),
    }))

    return next(e)
  }).catch(($, e, next) => next(e))

  // Le dessin du panneau : le portrait (pensif pendant le travail, neutre sinon), puis une fenêtre à
  // double cadre doré avec l'état, les jauges de contexte et de limites d'usage, les tours, les outils
  // et la durée de la session. Seule la surface desktop le dessine.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    const state = await read($, status)
    const { label } = await read($, work)
    const elapsed = state.startedAt === null ? null : (await $.clock.now()) - state.startedAt

    // Le décor est tout en bas : la racine prend la hauteur que Desktop donne au corps du panneau
    // (moins deux rangées de marge, pour ne pas faire défiler le panneau), et répartit le portrait
    // avec sa fenêtre en haut, le décor en bas. Si Desktop ne donne pas la hauteur, le décor suit
    // simplement la fenêtre.
    return (
      <Box
        flexDirection="column"
        alignItems="stretch"
        justifyContent="space-between"
        minHeight={Math.max(0, e.props.scroll.bodyRows - 2)}
        paddingY="xs"
      >
        <Box flexDirection="column" alignItems="stretch" gap="sm">
          <Box alignSelf="center">
            <Svg
              source={state.working ? PORTRAITS.reflechi : PORTRAITS.neutre}
              alt="Portrait du personnage"
              width={PORTRAIT_WIDTH}
              height={PORTRAIT_HEIGHT}
            />
          </Box>
          <Box
            flexDirection="column"
            borderStyle="double"
            borderColor={FRAME}
            backgroundColor={WINDOW}
            paddingX="sm"
          >
            <Text weight="bold" color={FRAME}>
              Statut
            </Text>
            <Text wrap="truncate-end">{state.working ? label : RESTING_LABEL}</Text>
            <Text dimColor>Contexte</Text>
            <Text mono color={FRAME}>
              {meter(state.contextPercent ?? 0)} {percentLabel(state.contextPercent)}
            </Text>
            {state.limits.map(limit => (
              <Box flexDirection="column">
                <Text dimColor>{limitLabel(limit.kind)}</Text>
                <Text mono color={FRAME}>
                  {meter(limit.percent)} {percentLabel(limit.percent)}
                </Text>
              </Box>
            ))}
            <Text dimColor tabular>
              {turnCount(state.turns)} · {toolCount(state.tools)}
            </Text>
            {elapsed === null ? null : (
              <Text dimColor tabular>
                Session : {formatSession(elapsed)}
              </Text>
            )}
          </Box>
        </Box>
        {/* Le décor est plus large que le panneau : la boîte le rogne à droite. */}
        <Box overflow="hidden" borderStyle="double" borderColor={FRAME} marginTop="sm">
          <Svg
            source={PANEL_BACKGROUND}
            alt="Décor : un château et des montagnes en pixel art"
            width={PANEL_BACKGROUND_WIDTH}
            height={PANEL_BACKGROUND_HEIGHT}
          />
        </Box>
      </Box>
    )
  })

  // La ligne d'attente de Desktop (« En cours… », l'étape et le chronomètre) devient une ligne à
  // barre dorée sur fond bleu nuit : une petite barre animée, l'étape, le temps écoulé du tour. Le mod
  // ne peut pas changer la couleur de la ligne d'origine, il en dessine donc une à la place ; elle ne
  // montre plus la flèche qui déplie le détail de l'étape. La bordure « quote » (une barre à gauche,
  // rien sur les trois autres côtés) remplace le cadre complet, dont Desktop ne laissait voir que les
  // deux côtés, la ligne n'ayant la place que d'une rangée.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const { seconds } = await read($, work)

    return (
      <Box
        flexDirection="row"
        alignSelf="flex-start"
        gap="xs"
        borderStyle="quote"
        borderColor={FRAME}
        backgroundColor={WINDOW}
        paddingX="sm"
        marginY="xs"
      >
        <Text mono color={FRAME}>
          {activityBar(seconds, 6)}
        </Text>
        <Text weight="bold" color={FRAME} wrap="truncate-end">
          {spinnerText(e.props.word, e.props.message, e.props.suffix)}
        </Text>
        <Text dimColor tabular>
          {formatElapsed(seconds)}
        </Text>
      </Box>
    )
  })

  // Pendant que l'assistant travaille, la bande au-dessus du champ de saisie montre le portrait
  // « réfléchi » et une fenêtre d'état : l'action en cours, une barre d'activité, le temps écoulé
  // et le nombre d'outils. Le reste du temps, la bande reste vide (le moteur n'y dessine rien) ;
  // elle cède aussi la place à un sondage. Desktop entoure cette bande d'une carte grise que le
  // mod ne peut pas retirer : un panneau pleine largeur (`PANEL`) la recouvre presque entièrement,
  // il n'en reste que la fine marge, et un décor en pixel art (`BACKGROUND`) habille le panneau.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey || !e.props.isWorking) {
      return next(e)
    }

    const { Box, Svg, Text } = $.ui.resolve(e)
    const { seconds, tools, label } = await read($, work)
    const { seed } = await read($, blink)

    return (
      <Box
        position="relative"
        flexDirection="row"
        alignItems="flex-start"
        width="100%"
        flexGrow={1}
        backgroundColor={PANEL}
        paddingX="xs"
        overflow="hidden"
      >
        {/* Le décor reste dans le flux : il donne sa hauteur au panneau, qui le rogne en largeur. */}
        <Svg
          source={BACKGROUND}
          alt="Décor : une prairie, un château et des montagnes en pixel art"
          width={BACKGROUND_WIDTH}
          height={BACKGROUND_HEIGHT}
        />
        {/* Le contenu est hors du flux : dans Desktop, un tel élément se peint au-dessus des
            éléments ordinaires (l'inverse, un décor hors du flux, recouvrait le contenu). Une
            couche transparente sur toute la hauteur du panneau, en haut à gauche : le portrait,
            la pointe et la fenêtre d'état s'y suivent de gauche à droite, centrés en hauteur. */}
        <Box
          position="absolute"
          top={0}
          left={0}
          bottom={0}
          paddingX="xs"
          flexDirection="row"
          alignItems="center"
        >
          <Svg
            source={blinkingReflechi(seed)}
            alt="Portrait du personnage"
            width={PORTRAIT_WIDTH}
            height={PORTRAIT_HEIGHT}
            isInteractive
          />
          <Box flexShrink={0}>
            <Svg
              source={TAIL}
              alt="Pointe de la bulle de dialogue"
              width={TAIL_WIDTH}
              height={TAIL_HEIGHT}
            />
          </Box>
          <Box
            flexDirection="column"
            borderStyle="double"
            borderColor={FRAME}
            backgroundColor={WINDOW}
            paddingX="sm"
            minWidth={32}
          >
            <Text weight="bold" color={FRAME}>
              {label}
            </Text>
            <Text mono color={FRAME}>
              {activityBar(seconds)}
            </Text>
            <Text dimColor tabular>
              {formatElapsed(seconds)} · {toolCount(tools)}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
