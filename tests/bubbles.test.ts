import { describe, expect, mock, test } from 'claude-code/testing'

import {
  WAITING_LABEL,
  activityBar,
  describeTool,
  formatElapsed,
  isInternalTool,
  questionIntro,
  spinnerText,
  toolCount,
} from '../hooks/activity'
import { hasAttachment, isAttached, remember, textOf } from '../hooks/attachments'
import { BACKGROUND } from '../hooks/background'
import {
  BLINK_CLOSED_FOR,
  BLINK_DOUBLE_GAP,
  BLINK_FIRST,
  BLINK_HALF_FOR,
  BLINK_INTERVAL,
  blinkPlan,
  blinkSeed,
  blinkingPortrait,
} from '../hooks/blink'
import { EYELIDS_CLOSED, EYELIDS_HALF } from '../hooks/eyelids'
import { actionCount, describeLog, lastCalls, markOf, shorten } from '../hooks/journal'
import { isOwnMessage } from '../hooks/origin'
import { PANEL_BACKGROUND } from '../hooks/panel-background'
import { PORTRAITS } from '../hooks/portrait'
import { formatSession, limitLabel, limitsOf, meter, percentLabel, turnCount } from '../hooks/status'

const MESSAGE = { text: 'Bonjour **monde**', isFirstOfReply: true } as const
const NEXT_MESSAGE = { text: 'Suite', isFirstOfReply: false } as const
const BAND = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

describe('pixel-bubbles : bulles', () => {
  test('chaque bloc de réponse porte son portrait neutre et sa pointe', async $ => {
    for (const props of [MESSAGE, NEXT_MESSAGE]) {
      const ui = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface: 'desktop',
        component: 'AssistantMessage',
        props,
      })

      const images = await ui.findAll({ type: 'Svg' })
      expect(images.length).toBe(2)
      expect(images[0]?.props.source).toBe(PORTRAITS.neutre)
      expect((await ui.find({ type: 'Markdown' }))?.text).toBe(props.text)

      // le nom en tête de bulle, dans le cadre : « ◆ Claude » en doré, à gauche
      expect((await ui.find({ type: 'Text', text: '◆ Claude' }))?.props.color).toBe('#d9b44a')
      const label = (await ui.findAll({ type: 'Box' })).find(box => box.props.alignSelf === 'flex-start')
      expect(label).toBeDefined()

      await ui.unmount()
    }
  })

  test("un résumé garde l'affichage du moteur", async ($, on) => {
    on('ui.render', { component: 'AssistantMessage' }, ($, e) =>
      $.ui.resolve(e).Text({ children: 'affichage du moteur' }),
    )

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AssistantMessage',
      props: { ...MESSAGE, isSummary: true },
    })

    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'affichage du moteur' })).toBeDefined()

    await ui.unmount()
  })
})

const USER = { text: 'Bonjour, peux-tu corriger ce bug ?', origin: { kind: 'composer' }, isExpanded: true } as const

describe('pixel-bubbles : vos messages', () => {
  test('votre message devient une bulle bleue et dorée, avec une pointe à droite', async $ => {
    // « sdk » est l'origine des messages saisis dans Desktop
    for (const kind of ['sdk', 'composer', 'bridge', 'unclassified'] as const) {
      const ui = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface: 'desktop',
        component: 'UserMessage',
        props: { ...USER, origin: { kind } },
      })

      // un double cadre comme celui de l'assistant, mais bleu clair au lieu de doré
      const boxes = await ui.findAll({ type: 'Box' })
      const frames = boxes.filter(box => box.props.borderStyle !== undefined)
      expect(frames.length).toBe(1)
      expect(frames[0]?.props.borderStyle).toBe('double')
      expect(frames[0]?.props.borderColor).toBe('#7aa2f7')
      expect(await ui.find({ type: 'Text', text: USER.text })).toBeDefined()
      // le nom en tête de bulle, à droite : « Vous ◆ » en bleu clair
      expect((await ui.find({ type: 'Text', text: 'Vous ◆' }))?.props.color).toBe('#7aa2f7')
      expect(boxes.find(box => box.props.alignSelf === 'flex-end')).toBeDefined()
      // une marge vide à gauche plafonne la largeur de la bulle à celle des bulles de l'assistant
      expect(boxes.find(box => box.props.width === 12)).toBeDefined()
      // la pointe seule : pas de portrait de votre côté
      expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)

      await ui.unmount()
    }
  })

  test('les autres lignes « utilisateur » gardent le dessin de Desktop', async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) =>
      $.ui.resolve(e).Text({ children: 'ligne du moteur' }),
    )

    const others = [
      { ...USER, origin: { kind: 'task-notification' } },
      { ...USER, origin: { kind: 'peer' } },
      { ...USER, isExpanded: false },
      { ...USER, text: '   ' },
    ] as const

    for (const props of others) {
      const ui = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface: 'desktop',
        component: 'UserMessage',
        props,
      })

      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: 'ligne du moteur' })).toBeDefined()

      await ui.unmount()
    }
  })

  test('un message avec pièce jointe garde le dessin de Desktop, les autres non', async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) =>
      $.ui.resolve(e).Text({ children: 'ligne du moteur' }),
    )

    const plain = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'UserMessage',
      props: { ...USER, text: 'Un message sans pièce jointe' },
    })
    const withImage = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'UserMessage',
      props: { ...USER, text: 'Voici une capture' },
    })
    // avant que le message arrive dans la conversation : les deux sont dessinés par le mod
    expect((await plain.findAll({ type: 'Svg' })).length).toBe(1)
    expect((await withImage.findAll({ type: 'Svg' })).length).toBe(1)

    // le message arrive avec une image : il retourne à Desktop, l'autre reste dessiné par le mod
    await $.session.append({
      message: {
        type: 'user',
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          { type: 'text', text: 'Voici une capture' },
        ],
      },
      door: 'prompt',
      origin: { kind: 'sdk' },
      uuid: 'user-with-image',
    })
    expect(await withImage.find({ type: 'Svg' })).toBeUndefined()
    expect(await withImage.find({ type: 'Text', text: 'ligne du moteur' })).toBeDefined()
    expect((await plain.findAll({ type: 'Svg' })).length).toBe(1)

    await plain.unmount()
    await withImage.unmount()
  })

  test('les pièces jointes se reconnaissent et se retiennent sans grossir sans fin', () => {
    const image = { type: 'image', source: {} }
    const text = { type: 'text', text: ' Voici une capture ' }

    expect(hasAttachment([text])).toBe(false)
    expect(hasAttachment([image, text])).toBe(true)
    expect(hasAttachment([{ type: 'document' }, text])).toBe(true)
    expect(textOf([image, text, { type: 'text', text: '' }])).toBe('Voici une capture')

    const known = { ids: ['u1'], texts: ['Voici une capture'] }
    expect(isAttached(known, 'u1', 'autre chose')).toBe(true)
    expect(isAttached(known, 'u2', 'Voici une capture')).toBe(true)
    expect(isAttached(known, 'u2', 'autre chose')).toBe(false)
    expect(isAttached(known, 'u2', '   ')).toBe(false)
    expect(isAttached({ ids: [], texts: [] }, 'u1', 'Voici une capture')).toBe(false)

    let many = { ids: [] as string[], texts: [] as string[] }
    for (let i = 0; i < 150; i++) many = remember(many, `u${i}`, `message ${i}`)
    expect(many.ids.length).toBe(100)
    expect(many.texts.at(-1)).toBe('message 149')
    expect(many.ids[0]).toBe('u50')
  })

  test('seules les origines automatiques ne comptent pas comme vos messages', () => {
    for (const kind of ['sdk', 'composer', 'bridge', 'unclassified', 'slack-ping', 'human']) {
      expect(isOwnMessage(kind)).toBe(true)
    }
    for (const kind of ['task-notification', 'scheduled-trigger', 'peer', 'channel', 'plugin', 'auto-continuation']) {
      expect(isOwnMessage(kind)).toBe(false)
    }
  })

  test('le terminal garde son affichage', async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) =>
      $.ui.resolve(e).Text({ children: 'ligne du moteur' }),
    )

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'terminal',
      component: 'UserMessage',
      props: USER,
    })

    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'ligne du moteur' })).toBeDefined()

    await ui.unmount()
  })
})

describe('pixel-bubbles : bande de travail', () => {
  test('pendant le travail, la bande montre le portrait pensif et la fenêtre d\'état', async $ => {
    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: BAND,
    })

    // le décor, le portrait, puis la pointe
    const images = await ui.findAll({ type: 'Svg' })
    expect(images.length).toBe(3)
    expect(images[0]?.props.source).toBe(BACKGROUND)
    // le portrait pensif de la bande cligne : son SVG porte les paupières animées, dans un cadre
    // « interactif » (le seul où Desktop joue l'animation)
    expect(images[1]?.props.source).toBe(blinkingPortrait(PORTRAITS.reflechi, 1))
    expect(images[1]?.props.isInteractive).toBe(true)
    expect(images[1]?.props.width).toBe(96)
    expect(images[1]?.props.height).toBe(103)

    expect(await ui.find({ type: 'Text', text: WAITING_LABEL })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▰/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '0 s · Aucun outil' })).toBeDefined()

    await ui.unmount()
  })

  test('un panneau pleine largeur de la couleur du fond recouvre la carte de la bande', async $ => {
    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: BAND,
    })

    // la première boîte est la racine : le panneau, qui rogne le décor
    const boxes = await ui.findAll({ type: 'Box' })
    const panel = boxes[0]
    expect(panel?.props.backgroundColor).toBe('#151515')
    expect(panel?.props.width).toBe('100%')
    expect(panel?.props.overflow).toBe('hidden')
    expect(panel?.props.position).toBe('relative')

    // le contenu est hors du flux, pour se peindre au-dessus du décor (resté dans le flux) : une
    // seule couche, en haut à gauche et sur toute la hauteur du panneau. Le portrait, la pointe et
    // la fenêtre d'état s'y suivent de gauche à droite, centrés en hauteur seulement.
    const layers = boxes.filter(box => box.props.position === 'absolute')
    expect(layers.length).toBe(1)
    const layer = layers[0]
    expect(layer?.props.left).toBe(0)
    expect(layer?.props.top).toBe(0)
    expect(layer?.props.bottom).toBe(0)
    expect(layer?.props.right).toBeUndefined()
    expect(layer?.props.alignItems).toBe('center')
    expect(layer?.props.justifyContent).toBeUndefined()

    await ui.unmount()
  })

  test('le compteur avance chaque seconde tant que le tour dure', async ($, on) => {
    const clock = mock.clock(on)
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: BAND,
    })

    await $.turn.start({ text: 'salut', turnId: 't1' })
    await clock.advance(3000)
    expect(await ui.find({ type: 'Text', text: '3 s · Aucun outil' })).toBeDefined()

    await clock.advance(2000)
    expect(await ui.find({ type: 'Text', text: '5 s · Aucun outil' })).toBeDefined()

    await ui.unmount()
  })

  test("chaque appel d'outil met à jour l'action et le nombre d'outils", async ($, on) => {
    // Le test tient le rôle du moteur : l'outil « s'exécute » sous le mod, qui doit seulement
    // observer l'appel sans le modifier.
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: BAND,
    })
    expect(await ui.find({ type: 'Text', text: WAITING_LABEL })).toBeDefined()

    const answer = await $.tool.call({
      tool: 'Read',
      file_path: 'D:\\Documents\\CODE\\Claude\\README.md',
      tool_use_id: 'u1',
    })
    // l'appel passe sans être altéré
    expect(answer.text).toBe('ok')

    expect(await ui.find({ type: 'Text', text: 'Je lis README.md' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 outil$/ })).toBeDefined()

    await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'u2' })
    expect(await ui.find({ type: 'Text', text: "J'exécute une commande" })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 outils$/ })).toBeDefined()

    await ui.unmount()
  })

  test("les outils internes de l'application ne comptent pas", async ($, on) => {
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: BAND,
    })

    await $.tool.call({ tool: 'Read', file_path: 'README.md', tool_use_id: 'u1' })
    expect(await ui.find({ type: 'Text', text: /1 outil$/ })).toBeDefined()

    // une mise à jour du plan ne change ni le nombre d'outils ni l'action affichée
    await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', tool_use_id: 'u2' })
    await $.tool.call({ tool: 'mcp__ccd_session__mark_chapter', tool_use_id: 'u3' })
    expect(await ui.find({ type: 'Text', text: /1 outil$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Je lis README.md' })).toBeDefined()

    // un autre connecteur compte
    await $.tool.call({ tool: 'mcp__terminal__read_terminal', tool_use_id: 'u4' })
    expect(await ui.find({ type: 'Text', text: /2 outils$/ })).toBeDefined()

    await ui.unmount()
  })

  test('le compteur s\'arrête quand le tour se termine', async ($, on) => {
    const clock = mock.clock(on)
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: BAND,
    })

    await $.turn.start({ text: 'salut', turnId: 't1' })
    await clock.advance(2000)
    await $.turn.complete({ answer: 'ok', durationMs: 2000, isAborted: false, reason: 'answer', turnId: 't1' })
    await clock.advance(5000)
    expect(await ui.find({ type: 'Text', text: '2 s · Aucun outil' })).toBeDefined()

    await ui.unmount()
  })

  test('la bande reste vide hors travail et cède la place à un sondage', async ($, on) => {
    // Le test tient le rôle du moteur : c'est lui qui dessine la bande quand le mod passe la main.
    on('ui.render', { component: 'AbovePrompt' }, ($, e) =>
      $.ui.resolve(e).Text({ children: 'bande du moteur' }),
    )

    for (const props of [
      { ...BAND, isWorking: false },
      { ...BAND, hasSurvey: true },
    ]) {
      const ui = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface: 'desktop',
        component: 'AbovePrompt',
        props,
      })

      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: 'bande du moteur' })).toBeDefined()

      await ui.unmount()
    }
  })

  test('le terminal garde son affichage', async ($, on) => {
    on('ui.render', { component: 'AssistantMessage' }, ($, e) =>
      $.ui.resolve(e).Text({ children: 'message du moteur' }),
    )
    on('ui.render', { component: 'AbovePrompt' }, ($, e) =>
      $.ui.resolve(e).Text({ children: 'bande du moteur' }),
    )

    const message = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: MESSAGE,
    })
    expect(await message.find({ type: 'Svg' })).toBeUndefined()
    expect(await message.find({ type: 'Text', text: 'message du moteur' })).toBeDefined()
    await message.unmount()

    const band = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: BAND,
    })
    expect(await band.find({ type: 'Svg' })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'bande du moteur' })).toBeDefined()
    await band.unmount()
  })
})

const CALL = { isRunning: false, isErrored: false, isInterrupted: false } as const
const READ = { tool_use_id: 'u1', tool: 'Read', input: { file_path: 'D:\\Documents\\README.md' }, ...CALL } as const

describe("pixel-bubbles : journal d'actions", () => {
  test('une ligne d\'outil est un cadre doré avec sa marque', async $ => {
    const cases = [
      { state: { ...CALL, isRunning: true }, symbol: '▸', color: '#d9b44a' },
      { state: CALL, symbol: '✓', color: '#8fd694' },
      { state: { ...CALL, isErrored: true }, symbol: '✗', color: '#f7768e' },
      { state: { ...CALL, isInterrupted: true }, symbol: '✗', color: '#f7768e' },
    ] as const

    for (const { state, symbol, color } of cases) {
      const ui = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface: 'desktop',
        component: 'ToolUse',
        props: { ...READ, ...state },
      })

      const frame = (await ui.findAll({ type: 'Box' })).find(box => box.props.borderStyle !== undefined)
      expect(frame?.props.borderStyle).toBe('single')
      expect(frame?.props.borderColor).toBe('#d9b44a')
      const mark = await ui.find({ type: 'Text', text: symbol })
      expect(mark?.props.color).toBe(color)
      expect(await ui.find({ type: 'Text', text: /Lecture de README\.md/ })).toBeDefined()

      await ui.unmount()
    }
  })

  test('un groupe replié liste ses appels dans un seul cadre', async $ => {
    const calls = [
      READ,
      { ...READ, tool_use_id: 'u2', tool: 'Grep', input: { pattern: 'TODO' } },
      { ...READ, tool_use_id: 'u3', tool: 'Bash', input: { command: 'ls' }, isErrored: true },
      { ...READ, tool_use_id: 'u4', tool: 'Glob', input: { pattern: '*.ts' }, isRunning: true },
    ]
    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'ToolGroup',
      props: { calls, isActive: true, isExpanded: false },
    })

    const frames = (await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle !== undefined)
    expect(frames.length).toBe(1)
    expect(await ui.find({ type: 'Text', text: "Journal d'actions · 4 actions" })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Lecture de README.md' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Recherche : TODO' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Commande : ls' })).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: '✓' })).length).toBe(2)
    expect((await ui.findAll({ type: 'Text', text: '✗' })).length).toBe(1)
    expect((await ui.findAll({ type: 'Text', text: '▸' })).length).toBe(1)

    await ui.unmount()
  })

  test("un groupe déplié et les autres surfaces gardent le dessin du moteur", async ($, on) => {
    on('ui.render', { component: 'ToolGroup' }, ($, e) => $.ui.resolve(e).Text({ children: 'groupe du moteur' }))
    on('ui.render', { component: 'ToolUse' }, ($, e) => $.ui.resolve(e).Text({ children: 'ligne du moteur' }))

    const group = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'ToolGroup',
      props: { calls: [READ], isActive: false, isExpanded: true },
    })
    expect(await group.find({ type: 'Text', text: 'groupe du moteur' })).toBeDefined()
    await group.unmount()

    const terminal = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'terminal',
      component: 'ToolUse',
      props: READ,
    })
    expect(await terminal.find({ type: 'Text', text: 'ligne du moteur' })).toBeDefined()
    await terminal.unmount()
  })

  test("une question est précédée d'une bulle avec portrait, le dialogue reste celui du moteur", async ($, on) => {
    // Le moteur dessine ce dialogue par un nœud « engine », et il en exige un seul dans l'arbre.
    on('ui.render', { component: 'AskUserQuestion' }, () => ({ type: 'engine', ref: 0 }))

    for (const [questions, intro] of [
      [[{ question: 'Quelle couleur ?' }], "J'ai une question pour vous :"],
      [[{ question: 'a' }, { question: 'b' }], "J'ai 2 questions pour vous :"],
    ] as const) {
      const desktop = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface: 'desktop',
        component: 'AskUserQuestion',
        props: { tool: 'AskUserQuestion', questions: [...questions] },
      })

      const frame = (await desktop.findAll({ type: 'Box' })).find(box => box.props.borderStyle !== undefined)
      expect(frame?.props.borderStyle).toBe('double')
      expect(frame?.props.borderColor).toBe('#d9b44a')
      expect((await desktop.findAll({ type: 'Svg' })).length).toBe(2)
      expect(await desktop.find({ type: 'Text', text: intro })).toBeDefined()
      await desktop.unmount()
    }

    const terminal = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'terminal',
      component: 'AskUserQuestion',
      props: { tool: 'AskUserQuestion', questions: [{ question: 'Quelle couleur ?' }] },
    })
    expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
    await terminal.unmount()
  })

  test("la ligne d'attente de Desktop devient une ligne dorée avec l'étape et le temps", async ($, on) => {
    const clock = mock.clock(on)
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('ui.render', { component: 'Spinner' }, ($, e) => $.ui.resolve(e).Text({ children: 'ligne du moteur' }))
    const props = { word: 'Création de notes.md', message: null, suffix: '…', mode: 'tool-use' } as const

    const desktop = await $.ui.mount({ plugin: 'pixel-bubbles', surface: 'desktop', component: 'Spinner', props })
    const frame = (await desktop.findAll({ type: 'Box' })).find(box => box.props.borderStyle !== undefined)
    // une barre dorée à gauche (bordure « quote ») sur fond bleu nuit, sans cadre complet
    expect(frame?.props.borderStyle).toBe('quote')
    expect(frame?.props.borderColor).toBe('#d9b44a')
    expect(frame?.props.backgroundColor).toBe('#0d1424eb')
    expect(await desktop.find({ type: 'Text', text: 'Création de notes.md…' })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: '0 s' })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: 'ligne du moteur' })).toBeUndefined()

    // le temps avance avec le tour
    await $.turn.start({ text: 'salut', turnId: 't1' })
    await clock.advance(4000)
    expect(await desktop.find({ type: 'Text', text: '4 s' })).toBeDefined()
    await desktop.unmount()

    const terminal = await $.ui.mount({ plugin: 'pixel-bubbles', surface: 'terminal', component: 'Spinner', props })
    expect(await terminal.find({ type: 'Text', text: 'ligne du moteur' })).toBeDefined()
    await terminal.unmount()
  })

  test("le texte de la ligne d'attente et la phrase d'une question se disent en français", () => {
    expect(spinnerText('Création de notes.md', null, '…')).toBe('Création de notes.md…')
    expect(spinnerText('Working', null, '…')).toBe('Réflexion en cours…')
    expect(spinnerText('Working', 'Compactage…', '…')).toBe('Compactage…')
    expect(spinnerText('Étape', null, '')).toBe('Étape')
    expect(describeTool('AskUserQuestion', {})).toBe("J'attends votre réponse")
    expect(questionIntro(1)).toBe("J'ai une question pour vous :")
    expect(questionIntro(3)).toBe("J'ai 3 questions pour vous :")
  })

  test('le résultat d\'une commande est un double cadre doré, rouge en cas d\'échec', async ($, on) => {
    on('ui.render', { component: 'CommandOutput' }, ($, e) => $.ui.resolve(e).Text({ children: 'ligne du moteur' }))
    const props = { command: 'statut', args: '', text: 'Panneau de statut ouvert.', isErrored: false }

    for (const [isErrored, color] of [
      [false, '#d9b44a'],
      [true, '#f7768e'],
    ] as const) {
      const ui = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface: 'desktop',
        component: 'CommandOutput',
        props: { ...props, isErrored },
      })

      const frame = (await ui.findAll({ type: 'Box' })).find(box => box.props.borderStyle !== undefined)
      expect(frame?.props.borderStyle).toBe('double')
      expect(frame?.props.borderColor).toBe(color)
      expect((await ui.find({ type: 'Markdown' }))?.text).toBe('Panneau de statut ouvert.')
      expect(await ui.find({ type: 'Text', text: 'ligne du moteur' })).toBeUndefined()
      await ui.unmount()
    }

    // un texte vide et le terminal gardent le dessin du moteur
    for (const [surface, text] of [
      ['desktop', '   '],
      ['terminal', 'Panneau de statut ouvert.'],
    ] as const) {
      const ui = await $.ui.mount({
        plugin: 'pixel-bubbles',
        surface,
        component: 'CommandOutput',
        props: { ...props, text },
      })
      expect(await ui.find({ type: 'Text', text: 'ligne du moteur' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('la marque, la ligne et les groupes longs se calculent', () => {
    expect(markOf({ ...CALL, isRunning: true }).kind).toBe('running')
    expect(markOf(CALL).symbol).toBe('✓')
    expect(markOf({ ...CALL, isErrored: true }).symbol).toBe('✗')
    expect(markOf({ isRunning: true, isErrored: false, isInterrupted: true }).kind).toBe('failed')

    expect(describeLog('Read', { file_path: '/a/b/c.ts' })).toBe('Lecture de c.ts')
    expect(describeLog('Edit', { file_path: 'x.ts' })).toBe('Modification de x.ts')
    expect(describeLog('Write', {})).toBe('Écriture d’un fichier')
    expect(describeLog('Bash', { command: 'ls -la', description: 'Liste le dossier' })).toBe('Commande : Liste le dossier')
    expect(describeLog('PowerShell', { command: 'Get-Date' })).toBe('Commande : Get-Date')
    expect(describeLog('Grep', { pattern: 'foo' })).toBe('Recherche : foo')
    expect(describeLog('WebSearch', { query: 'pixel art' })).toBe('Recherche web : pixel art')
    expect(describeLog('Skill', { skill: 'init' })).toBe('Compétence : init')
    expect(describeLog('mcp__terminal__read_terminal', {})).toBe('Connecteur : terminal · read_terminal')
    expect(describeLog('Inconnu', undefined)).toBe('Inconnu')

    expect(shorten('a\n  b', 10)).toBe('a b')
    expect(shorten('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`)

    const many = Array.from({ length: 12 }, (_, i) => i)
    expect(lastCalls(many)).toEqual({ shown: many.slice(4), hidden: 4 })
    expect(lastCalls([1, 2]).hidden).toBe(0)
    expect(actionCount(1)).toBe('1 action')
    expect(actionCount(3)).toBe('3 actions')
  })

  test('les outils internes de l\'application se reconnaissent', () => {
    expect(isInternalTool('mcp__ccd_turn__update_plan')).toBe(true)
    expect(isInternalTool('mcp__ccd_session__start_session')).toBe(true)
    expect(isInternalTool('mcp__terminal__run_in_terminal')).toBe(false)
    expect(isInternalTool('Read')).toBe(false)
  })
})

describe('pixel-bubbles : clignement', () => {
  const blinking = blinkingPortrait(PORTRAITS.reflechi, 1)

  // les intervalles entre la fin d'un clignement et le début du suivant, dans un calendrier
  const gaps = (seed: number) => {
    const { times } = blinkPlan(seed)

    return times.slice(1).map((t, i) => t - (times[i] ?? 0) - (BLINK_CLOSED_FOR + BLINK_HALF_FOR))
  }

  test('le portrait garde son dessin et reçoit deux couches de paupières animées', () => {
    // le dessin d'origine est intact, les couches sont ajoutées juste avant la balise fermante
    const original = PORTRAITS.reflechi.slice(0, PORTRAITS.reflechi.lastIndexOf('</svg>'))
    expect(blinking.startsWith(original)).toBe(true)
    expect(blinking.endsWith('</svg>')).toBe(true)
    expect(blinking.includes(EYELIDS_CLOSED)).toBe(true)
    expect(blinking.includes(EYELIDS_HALF)).toBe(true)

    // deux couches, chacune invisible au départ et animée sans fondu, en boucle
    expect(blinking.match(/<g opacity="0">/g)?.length).toBe(2)
    expect(blinking.match(/<animate /g)?.length).toBe(2)
    expect(blinking.match(/calcMode="discrete"/g)?.length).toBe(2)
    expect(blinking.match(/repeatCount="indefinite"/g)?.length).toBe(2)
    // les deux couches ont la durée du cycle de la graine
    const { cycle } = blinkPlan(1)
    expect(blinking.match(new RegExp(`dur="${cycle.toFixed(3)}s"`, 'g'))?.length).toBe(2)

    // Desktop refuse un SVG de plus de 131072 caractères
    expect(blinking.length).toBeLessThan(131072)
  })

  test("clos 80 ms, puis mi-clos 80 ms, puis ouvert : chaque clignement de la graine", () => {
    const { times, cycle } = blinkPlan(1)
    const closed = blinking.match(/values="([^"]+)" keyTimes="([^"]+)"/g) ?? []
    expect(closed.length).toBe(2)

    // pour chaque couche : autant d'opacités que d'instants, le premier à 0, les instants croissants
    for (const attributes of closed) {
      const [, values, keyTimes] = attributes.match(/values="([^"]+)" keyTimes="([^"]+)"/) ?? []
      const opacities = (values ?? '').split(';')
      const instants = (keyTimes ?? '').split(';').map(Number)
      expect(opacities.length).toBe(instants.length)
      expect(opacities[0]).toBe('0')
      expect(instants[0]).toBe(0)
      expect(instants.every((t, i) => i === 0 || t > (instants[i - 1] ?? 0))).toBe(true)
      expect(instants.at(-1)).toBeLessThan(1)
      // un clignement = deux marches (apparition, disparition) par couche
      expect(opacities.length).toBe(1 + 2 * times.length)
    }

    // les yeux clos de t à t + 80 ms, les mi-clos de t + 80 ms à t + 160 ms
    const first = times[0] ?? 0
    expect(blinking).toContain(`keyTimes="0;${(first / cycle).toFixed(5)};${((first + BLINK_CLOSED_FOR) / cycle).toFixed(5)}`)
    expect(blinking).toContain(`keyTimes="0;${((first + BLINK_CLOSED_FOR) / cycle).toFixed(5)};${((first + BLINK_CLOSED_FOR + BLINK_HALF_FOR) / cycle).toFixed(5)}`)
    expect(Math.round(BLINK_CLOSED_FOR * 1000)).toBe(80)
    expect(Math.round(BLINK_HALF_FOR * 1000)).toBe(80)
  })

  test('les intervalles sont inégaux, bornés, avec parfois un double clignement', () => {
    let doubles = 0
    let normals = 0

    for (let seed = 1; seed <= 200; seed++) {
      const { times, cycle } = blinkPlan(seed)

      // le premier clignement, puis au moins une dizaine d'autres sur la quarantaine de secondes
      expect(times[0]).toBeGreaterThanOrEqual(BLINK_FIRST[0])
      expect(times[0]).toBeLessThanOrEqual(BLINK_FIRST[1])
      expect(times.length).toBeGreaterThanOrEqual(6)
      expect(cycle).toBeGreaterThan(times.at(-1) ?? 0)

      for (const gap of gaps(seed)) {
        if (gap <= BLINK_DOUBLE_GAP[1] + 1e-9) {
          // un double clignement : le second suit le premier de 0,45 à 0,7 s
          expect(gap).toBeGreaterThanOrEqual(BLINK_DOUBLE_GAP[0] - 1e-9)
          doubles++
        } else {
          expect(gap).toBeGreaterThanOrEqual(BLINK_INTERVAL[0] - 1e-9)
          expect(gap).toBeLessThanOrEqual(BLINK_INTERVAL[1] + 1e-9)
          normals++
        }
      }
    }

    // les doubles clignements sont une minorité, mais existent
    expect(doubles).toBeGreaterThan(0)
    expect(doubles).toBeLessThan(normals / 2)
  })

  test("la même graine donne le même portrait, une autre graine un autre calendrier", () => {
    expect(blinkingPortrait(PORTRAITS.reflechi, 42)).toBe(blinkingPortrait(PORTRAITS.reflechi, 42))
    expect(blinkingPortrait(PORTRAITS.reflechi, 42)).not.toBe(blinkingPortrait(PORTRAITS.reflechi, 43))
    expect(blinkPlan(42).times).toEqual(blinkPlan(42).times)
    expect(blinkPlan(42).times).not.toEqual(blinkPlan(43).times)

    // une graine d'après l'heure : un entier de 1 à 2147483646
    for (const now of [0, 1, 1760000000000, 2 ** 40, -5]) {
      const seed = blinkSeed(now)
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(1)
      expect(seed).toBeLessThanOrEqual(2147483646)
    }
  })

  test('la bande garde la même source pendant un tour et en change au tour suivant', async ($, on) => {
    const clock = mock.clock(on)
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: BAND,
    })
    const portraitSource = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.source

    // avant tout tour : la graine de départ
    expect(await portraitSource()).toBe(blinkingPortrait(PORTRAITS.reflechi, 1))

    // un tour commence : la graine vient de l'heure, et le portrait ne change pas à chaque redessin
    await $.turn.start({ text: 'salut', turnId: 't1' })
    const first = await portraitSource()
    expect(first).toBe(blinkingPortrait(PORTRAITS.reflechi, blinkSeed(clock.now())))
    await clock.advance(3000)
    expect(await portraitSource()).toBe(first)
    await clock.advance(2000)
    expect(await portraitSource()).toBe(first)
    await $.turn.complete({ answer: 'ok', durationMs: 5000, isAborted: false, reason: 'answer', turnId: 't1' })

    // un autre tour, plus tard : un autre calendrier
    await clock.advance(90_000)
    await $.turn.start({ text: 'encore', turnId: 't2' })
    const second = await portraitSource()
    expect(second).not.toBe(first)
    expect(second).toBe(blinkingPortrait(PORTRAITS.reflechi, blinkSeed(clock.now())))
    await clock.advance(2000)
    expect(await portraitSource()).toBe(second)

    await ui.unmount()
  })

  test('une source sans balise fermante est rendue telle quelle', () => {
    expect(blinkingPortrait('pas un svg', 1)).toBe('pas un svg')
  })
})

const PANE_PROPS = {
  title: 'Statut',
  isFocused: false,
  bodyColumns: 34,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
} as const

describe('pixel-bubbles : panneau de statut', () => {
  test('le panneau montre le portrait neutre et les jauges au repos', async $ => {
    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'statut',
      props: PANE_PROPS,
    })

    // le portrait en haut, le décor en bas
    const images = await ui.findAll({ type: 'Svg' })
    expect(images.length).toBe(2)
    expect(images[0]?.props.source).toBe(PORTRAITS.neutre)
    expect(images[1]?.props.source).toBe(PANEL_BACKGROUND)
    expect(images[1]?.props.width).toBe(510)

    // la fenêtre et le décor ont un double cadre doré ; le décor est rogné s'il déborde
    const boxes = await ui.findAll({ type: 'Box' })
    const frames = boxes.filter(box => box.props.borderStyle !== undefined)
    expect(frames.length).toBe(2)
    for (const frame of frames) {
      expect(frame.props.borderStyle).toBe('double')
      expect(frame.props.borderColor).toBe('#d9b44a')
    }
    expect(boxes.find(box => box.props.overflow === 'hidden')).toBeDefined()

    // la racine prend la hauteur du corps du panneau, moins deux rangées
    expect(boxes[0]?.props.minHeight).toBe(28)
    expect(boxes[0]?.props.justifyContent).toBe('space-between')

    expect(await ui.find({ type: 'Text', text: 'Statut' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'En attente de vos ordres' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /▱▱▱▱▱▱▱▱▱▱ —$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '0 tours · Aucun outil' })).toBeDefined()

    await ui.unmount()
  })

  test('le panneau suit le travail, les outils et les chiffres de la session', async ($, on) => {
    on('turn.start', (_$, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'statut',
      props: PANE_PROPS,
    })

    // pendant un tour, le portrait devient pensif et l'action en cours s'affiche
    await $.turn.start({ text: 'salut', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: 'README.md', tool_use_id: 'u1' })
    await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', tool_use_id: 'u2' })
    expect((await ui.findAll({ type: 'Svg' }))[0]?.props.source).toBe(PORTRAITS.reflechi)
    expect(await ui.find({ type: 'Text', text: 'Je lis README.md' })).toBeDefined()

    // la fin du tour compte un tour ; les outils internes ne comptent pas
    await $.turn.complete({ answer: 'ok', durationMs: 1000, isAborted: false, reason: 'answer', turnId: 't1' })
    expect((await ui.findAll({ type: 'Svg' }))[0]?.props.source).toBe(PORTRAITS.neutre)
    expect(await ui.find({ type: 'Text', text: '1 tour · 1 outil' })).toBeDefined()

    // les jauges de contexte et de limites d'usage
    await $.session.measure({
      context: { window: 200000, tokens: 34000, percent: 17 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 12 },
        { kind: 'seven_day', percentUsed: 40 },
      ],
      changed: ['context', 'rateLimits'],
    })
    expect(await ui.find({ type: 'Text', text: '▰▰▱▱▱▱▱▱▱▱ 17 %' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Limite 5 h' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▰▱▱▱▱▱▱▱▱▱ 12 %' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Limite 7 jours' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▰▰▰▰▱▱▱▱▱▱ 40 %' })).toBeDefined()

    await ui.unmount()
  })

  test('le terminal garde son affichage', async ($, on) => {
    on('ui.render', { component: 'Pane' }, ($, e) => $.ui.resolve(e).Text({ children: 'panneau du moteur' }))

    const ui = await $.ui.mount({
      plugin: 'pixel-bubbles',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'statut',
      props: PANE_PROPS,
    })
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'panneau du moteur' })).toBeDefined()
    await ui.unmount()
  })

  test('les jauges, libellés et durées se calculent', () => {
    expect(meter(0)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(meter(30)).toBe('▰▰▰▱▱▱▱▱▱▱')
    expect(meter(100)).toBe('▰▰▰▰▰▰▰▰▰▰')
    expect(meter(250)).toBe('▰▰▰▰▰▰▰▰▰▰')
    expect(meter(-5)).toBe('▱▱▱▱▱▱▱▱▱▱')
    expect(percentLabel(16.6)).toBe('17 %')
    expect(percentLabel(null)).toBe('—')
    expect(limitLabel('five_hour')).toBe('Limite 5 h')
    expect(limitLabel('seven_day')).toBe('Limite 7 jours')
    expect(limitLabel('spend_limit')).toBe('Plafond de dépense')
    expect(limitLabel('une_autre')).toBe('une autre')
    expect(limitsOf([{ kind: 'five_hour', percentUsed: 12 }])).toEqual([{ kind: 'five_hour', percent: 12 }])
    expect(formatSession(30_000)).toBe("moins d'une minute")
    expect(formatSession(12 * 60_000)).toBe('12 min')
    expect(formatSession(65 * 60_000)).toBe('1 h 05 min')
    expect(turnCount(1)).toBe('1 tour')
    expect(turnCount(0)).toBe('0 tours')
  })
})

describe('pixel-bubbles : phrases de la fenêtre d\'état', () => {
  test('un appel d\'outil se décrit en une phrase', () => {
    expect(describeTool('Read', { file_path: 'D:\\Documents\\CODE\\Claude\\README.md' })).toBe('Je lis README.md')
    expect(describeTool('Edit', { file_path: '/home/dhont/app/src/main.ts' })).toBe('Je modifie main.ts')
    expect(describeTool('Write', { file_path: 'notes.md' })).toBe("J'écris notes.md")
    expect(describeTool('Read', {})).toBe('Je lis un fichier')
    expect(describeTool('Bash', { command: 'ls' })).toBe("J'exécute une commande")
    expect(describeTool('Grep', { pattern: 'x' })).toBe('Je cherche dans le projet')
    expect(describeTool('WebSearch', { query: 'x' })).toBe('Je consulte le web')
    expect(describeTool('Agent', {})).toBe('Je délègue à un sous-agent')
    expect(describeTool('mcp__serveur__outil', {})).toBe("J'utilise un connecteur")
    expect(describeTool('Autre', {})).toBe("J'utilise Autre")
  })

  test('le temps écoulé et le nombre d\'outils se disent en français', () => {
    expect(formatElapsed(0)).toBe('0 s')
    expect(formatElapsed(59)).toBe('59 s')
    expect(formatElapsed(60)).toBe('1 min 00 s')
    expect(formatElapsed(125)).toBe('2 min 05 s')
    expect(toolCount(0)).toBe('Aucun outil')
    expect(toolCount(1)).toBe('1 outil')
    expect(toolCount(4)).toBe('4 outils')
  })

  test('la barre d\'activité garde deux cases pleines et fait des allers-retours', () => {
    const bars = Array.from({ length: 21 }, (_, step) => activityBar(step))

    for (const bar of bars) {
      expect([...bar].length).toBe(12)
      expect([...bar].filter(cell => cell === '▰').length).toBe(2)
    }
    expect(bars[0]).toBe('▰▰▱▱▱▱▱▱▱▱▱▱')
    expect(bars[10]).toBe('▱▱▱▱▱▱▱▱▱▱▰▰')
    expect(bars[20]).toBe(bars[0])
    expect(bars[11]).toBe(bars[9])
  })
})
