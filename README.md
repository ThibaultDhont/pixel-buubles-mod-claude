# pixel-bubbles

Mod pour **Claude Desktop** (onglet Code) : chaque bloc de réponse de l'assistant s'affiche
dans une bulle de dialogue à cadre double doré et voile bleu léger, avec un portrait pixel art
en bas à gauche et une pointe qui le désigne.

Depuis la 0.26.0, chaque bulle porte son **nom en première ligne, dans le cadre** (`nameLabel`,
`hooks/register.tsx`) : « ◆ Claude » en doré, à gauche, dans mes bulles ; « Vous ◆ » en bleu clair, à
droite, dans les vôtres. Essai précédent (0.25.0) : un onglet coloré posé au-dessus du cadre, jugé mal
intégré, car Desktop trace la ligne d'une bordure au milieu d'une rangée, d'où un vide entre
l'onglet et le cadre ; un onglet posé sur la bordure (position absolue) aurait recouvert la première
ligne de texte, la bordure ne faisant qu'environ 8 px. **À confirmer** par capture.

**Vos messages** sont à droite, dans un style distinct de celui de l'assistant : **double cadre bleu
clair** (au lieu du double cadre doré), voile bleu plus marqué, pointe bleue vers la droite, sans
portrait. Leur largeur est plafonnée à celle des bulles de l'assistant par une marge vide à
gauche (`USER_GUTTER_CELLS`, 12 cellules d'environ 8,5 px, proches des 96 px du portrait). Les lignes automatiques (notifications de tâches en
arrière-plan, messages d'autres sessions ou agents, plugins…), leur version compacte et un message
sans texte gardent le dessin de Desktop.

Attention à l'origine des messages : dans Desktop, vos messages ne sont pas étiquetés « saisis au
clavier » mais `sdk` (Desktop pilote Claude Code par son SDK ; la transcription les marque
`promptSource: "sdk"`). Un premier essai, qui n'acceptait que « clavier » et « Remote Control »,
laissait donc vos messages à Desktop. La règle est maintenant inversée (`hooks/origin.ts`) : tout ce
qui n'est pas explicitement automatique est traité comme vous.

Pendant que l'assistant travaille, la bande au-dessus du champ de saisie montre le portrait
« réfléchi » en taille normale, à gauche, et, juste à sa droite, une fenêtre d'état dans le même
style, centrée **en hauteur** dans la bande :

- l'**action en cours** (« Réflexion en cours… », « Je lis README.md », « J'exécute une commande »…) ;
- une **barre d'activité** animée ;
- le **temps écoulé** et le **nombre d'outils** utilisés pendant le tour.

Les outils internes de l'application (`mcp__ccd_*`, comme les mises à jour de plan) ne comptent pas
dans ce nombre et ne changent pas l'action affichée (`isInternalTool`, `hooks/activity.ts`).

Le reste du temps, la bande reste vide. Elle cède aussi la place à un sondage quand Desktop en
affiche un.

## Journal d'actions (version 0.16.0)

Les lignes d'outils de la conversation sont redessinées en journal, encadré en doré. Desktop accepte
les deux hooks suivants (constaté sur capture) :

- **ToolGroup** (les appels que Desktop replie, même les écritures, modifications et commandes) :
  un seul cadre « Journal d'actions · N actions » qui liste les appels (les 8 plus récents), chacun
  avec sa marque : `✓` vert (réussi), `✗` rouge (échec ou interruption), `▸` doré (en cours) ;
- **ToolUse** (une ligne par appel) : `✓ Lecture de README.md`, dans un cadre doré simple. On la voit
  quand on déplie le groupe (voir ci-dessous), car le groupe replié montre le journal.

Desktop ajoute au-dessus du journal **sa propre ligne de résumé**, en fin de tour (« Lu README.md,
exécuté 2 commandes (1 échec) > », avec le nombre de lignes ajoutées et retirées). Ce n'est pas le
composant `ToolGroup` : le mod ne la redessine pas, d'où un léger doublon avec le journal. Cliquer
sur sa flèche déplie le groupe (`isExpanded`) : le journal cède la place à une ligne ToolUse par
appel, chacune encadrée en doré à l'intérieur de la carte grise de Desktop.

- **ToolResult** (le résultat d'un appel isolé, sous une ligne ToolUse seule) : **essai non retenu**.
  En 0.16.0, le hook entourait le dessin de Desktop (`await next(e)`) d'un cadre doré ; sur Desktop,
  le cadre restait **vide** (une fine boîte sous la ligne), car le résultat est dessiné hors de
  l'arbre du mod. Retiré en 0.21.0. Même leçon que pour `AskUserQuestion` : on ne peut pas entourer
  un dessin que Desktop fait lui-même (nœud « engine »).

La ligne ToolUse **isolée** (un seul appel, non replié, comme une lecture suivie d'une question) est
bien dessinée par le mod : constaté sur capture.

Si Desktop refuse un arbre, il dessine sa propre ligne : rien n'est perdu. Les phrases du journal
sont dans `hooks/journal.ts`.

## Expressions du portrait (version 0.32.0, premier jeu)

Le portrait change selon la situation. Les règles sont dans `hooks/mood.ts` (fonctions pures,
testées) ; les listes de mots et les seuils s'y règlent. Trois familles :

**Une bulle d'assistant** : d'après son seul texte, donc elle **garde son portrait** quand Desktop la
redessine. Le premier signal trouvé gagne, dans cet ordre :

| Portrait | Quand le texte contient… |
| :- | :- |
| `triste` | des excuses ou un regret : « désolé », « navré », « malheureusement », « hélas », « mes excuses », « sorry », « unfortunately »… |
| `surpris` | de l'étonnement : « étonnant », « surprenant », « inattendu », « bizarre », « curieusement », « oh », « tiens », « surprisingly »… |
| `curieux` | une **question en dernière ligne** (le texte finit par « ? », au Markdown et aux guillemets près) |
| `content` | de la joie ou un succès : « parfait », « bravo », « c'est fait », « avec succès », « les tests passent », « merci »… |
| `neutre` | rien de tout cela |

Les mots sont cherchés en français et en anglais, entiers (« supervision » n'est pas « super »). Un
texte long n'est lu que par ses 350 premiers et 350 derniers caractères : un mot au milieu d'un long
exposé ne dit rien du ton. La **bulle qui précède une question à choix** (`AskUserQuestion`) est
toujours `curieux`.

**La bande pendant le travail** : d'après le tour en cours.

| Portrait | Quand |
| :- | :- |
| `enerve` | 3 erreurs d'outils ou plus dans le tour (`ANGRY_AFTER_ERRORS`) |
| `fatigue` | contexte rempli à 85 % ou plus (`TIRED_AT_CONTEXT`) |
| `concentre` | 10 outils ou plus dans le tour (`FOCUSED_AFTER_TOOLS`) |
| `reflechi` | sinon (le portrait pensif, qui **cligne des yeux**) |

Dans cet ordre de priorité. Les erreurs sont comptées par le hook `tool.call` (résultat en
`isError`), hors outils internes de l'application et hors sous-agents, et remises à zéro à chaque tour.
Seul le portrait pensif a ses paupières : les autres expressions ne clignent pas, et le portrait
change d'image quand la situation change.

**Le panneau de statut** : au travail, mêmes règles que la bande ; au repos :

| Portrait | Quand |
| :- | :- |
| `endormi` | 5 minutes sans activité (`SLEEP_AFTER_SECONDS`, minuterie relancée à chaque fin de tour et au démarrage de la session ; un nouveau tour réveille) |
| `fatigue` | contexte rempli à 85 % ou plus |
| `neutre` | sinon |

**Pas encore utilisés** : l'expression `surpris` pour un tour interrompu (Échap), et `triste` après
un tour terminé en erreur : le texte de la bulle seul les décide pour l'instant. **À confirmer** par
des essais : l'effet des mots sur les vraies réponses (faux positifs et réponses ratées).

## Clignement des yeux (version 0.27.0, irrégulier depuis la 0.29.0)

Le portrait pensif de la bande de réflexion cligne des yeux : **constaté à l'œil, ça marche**.
Deux couches de paupières (`hooks/eyelids.ts`, générées) sont ajoutées à la fin de son SVG par
`hooks/blink.ts`, invisibles, et une animation SMIL à états discrets les montre tour à tour, sans
fondu. Un clignement : yeux ouverts, puis **clos** (80 ms), puis **mi-clos** (80 ms), puis ouverts de
nouveau (`BLINK_CLOSED_FOR`, `BLINK_HALF_FOR`). C'est le navigateur de Desktop qui anime : le mod ne
redessine rien. Desktop ne joue l'animation que pour un `Svg` déclaré `isInteractive`, d'où cette
option sur le portrait de la bande.

**Intervalles variables (0.29.0).** Un clignement toutes les 4,6 s exactement (0.27.0 et 0.28.0)
paraissait mécanique. Le calendrier est maintenant tiré d'une **graine** (`blinkPlan`, un générateur
pseudo-aléatoire : même graine, même calendrier) :

- le premier clignement tombe 2,5 à 6 s après l'apparition du portrait (1,6 à 5 s en 0.29.0) ;
- les suivants, 2,6 à 7 s après la fin du précédent ;
- une fois sur six environ, un **double clignement** : le second suit le premier de 0,45 à 0,7 s ;
- le calendrier couvre une quarantaine de secondes puis reboucle (`BLINK_SPAN`), avec une pause au
  raccord (`BLINK_SEAM`, 0,1 à 1 s) qui, avec le premier clignement du cycle suivant, donne un
  intervalle de 2,6 à 7 s, comme les autres.

**Accroc connu (non résolu).** Au premier clignement de la première session, le portrait a disparu
quelques images, puis plus jamais ensuite. Hypothèse : Desktop prépare l'image animée (cadre isolé)
à la première utilisation. Remède essayé en 0.30.0 : retarder le premier clignement (de 1,6–5 s à
2,5–6 s) : **ce n'était pas la cause**, et le délai allongé est resté sans inconvénient. Remède
prévu, non essayé : garder les couches de paupières peintes à 1 % d'opacité au lieu de 0, pour que
Desktop les prépare dès l'apparition du portrait. Précisions utiles si l'accroc revient : est-ce tout
le portrait ou seulement les yeux, et est-ce seulement au tout premier clignement après le
lancement de Desktop.

La graine change **à chaque tour** (elle vient de l'heure de départ, atome `blink`, tirée dans le hook
`turn.start`) : le portrait ne cligne pas aux mêmes instants d'un tour à l'autre. Pendant un tour, la
bande, redessinée chaque seconde, passe **la même source** à Desktop (`blinkingReflechi`, calculée
une fois par graine) : sinon l'animation repartirait de zéro à chaque redessin. Constaté en 0.27.0 :
elle n'est pas remise à zéro. Si l'heure manque au démarrage du tour, il garde la graine précédente.
Les valeurs du calendrier sont en tête de `blink.ts` : à régler là.

Les paupières sont dessinées d'après le portrait par `tools/build_blink.js` (les yeux y sont relevés
à la main dans `EYES` : colonnes et rangées de la grille 96×103). Après un changement de portrait :

```
node tools/build_blink.js . --preview clignement.png
```

`--preview` écrit une planche agrandie 10 fois : yeux ouverts, mi-clos, clos.

## Panneau de statut (version 0.22.0)

Un panneau propre au mod (`Pane`, id `statut`), qui s'affiche à droite de la conversation (constaté
sur capture : Desktop l'ancre sur toute la hauteur, avec son titre « Statut » et ses icônes pour
l'agrandir ou le fermer, et pousse ses propres cartes vers la gauche) : le
**portrait toujours visible** (pensif pendant un tour, neutre sinon) et une fenêtre à double cadre
doré avec l'état (l'action en cours, ou « En attente de vos ordres »), le **contexte** utilisé en
jauge `▰▰▱▱▱▱▱▱▱▱ 17 %`, les **limites d'usage** de l'abonnement (5 heures, 7 jours, quand Desktop les
donne), le nombre de **tours** et d'**outils** de la session (les outils internes `mcp__ccd_*` ne
comptent pas) et la **durée** de la session. Les chiffres viennent de `$.session.usage()` et de
l'événement `session.measure` ; les calculs sont dans `hooks/status.ts`.

Il s'ouvre au démarrage si Desktop est déjà connecté, ou quand Desktop se connecte
(`session.attach`) ; la commande **`/statut`** le rouvre. Le terminal n'en reçoit jamais. Si Desktop
refuse ou place mal le panneau, rien d'autre n'est touché.

Depuis la 0.24.0, un **décor pixel art** (le château et les montagnes de `art/fond.png`,
`hooks/panel-background.ts`) occupe le bas du panneau, dans un double cadre doré : la racine prend la
hauteur que Desktop donne au corps du panneau (`scroll.bodyRows`, moins deux rangées) et range le
portrait avec la fenêtre en haut, le décor en bas. Le décor (510 px de large) est rogné à droite si le
panneau est plus étroit. **À confirmer** par capture : si le décor est bien en bas, et pas collé à la
fenêtre (Desktop ne donnerait pas la hauteur).

Constaté : le champ de saisie de Desktop signale en orange « /statut n'est pas une commande ici.
Utilisez /stats » (il ne connaît pas les commandes des mods), mais la commande s'exécute bien et
répond « Panneau de statut ouvert. ». Au démarrage d'une session neuve, la jauge de contexte reste
vide (« — ») : le chiffre n'arrive qu'après la première réponse (événement `session.measure`).

## Résultat des commandes « / » (version 0.23.0, essai)

Le résultat d'une commande (`CommandOutput`, une ligne de texte brut dans Desktop) est redessiné en
double cadre doré avec le voile bleu des bulles, en rouge si la commande a échoué. Le mod redessine
le texte lui-même (un nœud `Markdown`) : entourer le dessin de Desktop donnait un cadre vide
(voir « Journal d'actions »). **À confirmer** par capture (une commande comme `/statut`).

## Ligne d'attente et attente d'une réponse (version 0.20.0)

- **Ligne d'attente de Desktop** (composant `Spinner` : « En cours… 1 s ») : le mod la remplace
  par une petite barre animée dorée, le mot de Desktop (« En cours… », déjà en français) et le temps
  écoulé du tour (`spinnerText`, `hooks/activity.ts`). Constaté sur capture : Desktop accepte le
  dessin. Le cadre simple de la 0.20.0 se réduisait à deux traits dorés, à gauche et à droite, car la
  ligne n'a la place que d'une rangée : le haut et le bas de la bordure n'apparaissaient pas. Depuis
  la 0.25.0, la bordure `quote` (une barre dorée à gauche, rien ailleurs) sur fond bleu nuit
  (`WINDOW`) le remplace, **à confirmer** par capture. Desktop écrit encore
  l'étape en gris après le dessin du mod (« Réflexion en cours »). La couleur de la ligne d'origine
  n'est pas réglable par un mod, d'où le dessin complet ; il ne montre plus la flèche qui déplie le
  détail de l'étape.
- **Attente d'une réponse** : pendant une question (`AskUserQuestion`), la fenêtre d'état de la
  bande indique « J'attends votre réponse » au lieu de « J'utilise AskUserQuestion ».

La liste d'étapes que Desktop affiche pendant le travail (cases à cocher) n'est pas un composant
redessinable : nos hooks ne l'ont pas touchée.

## Questions de l'assistant (version 0.19.0)

Le dialogue de l'outil `AskUserQuestion` (choix proposés par l'assistant) garde le dessin de
Desktop, qu'un mod ne peut pas styler : essayé en 0.17.0, le hook posait le dialogue (`await
next(e)`, le moteur exige exactement un nœud « engine » dans l'arbre) dans un double cadre doré, et
le cadre restait **vide** : Desktop dessine le dialogue hors de l'arbre du mod, sous le cadre.
Depuis la 0.19.0, une **bulle d'introduction** (portrait neutre, pointe, « J'ai une question pour
vous : ») précède le dialogue, dans le style des bulles de l'assistant ; le dialogue vient dessous,
inchangé (hook `ui.render` sur `AskUserQuestion`, constaté sur capture).

La case « prochaine étape » que l'application affiche en fin de tour (récapitulatif et boutons de
réponse) n'est pas un composant redessinable par un mod. La liste de ces composants : `AskUserQuestion`,
`UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `ToolProgress`,
`CommandOutput`, `Spinner`, `TurnDuration`, `InfoNotice`, `SessionMode`, `PromptHint`, `AbovePrompt`,
`Pane`.

La bande est habillée d'un **décor en pixel art** (une prairie, un château, des montagnes) qui
remplit son fond ; la fenêtre d'état, presque opaque, garde le texte lisible par-dessus.

L'indicateur de réflexion de Desktop (« En cours… », chronomètre, étape) n'est pas modifié : voir
« Limites connues ».

Seule la surface Desktop est modifiée : le terminal garde son affichage.

## Installation permanente

Le mod est aussi un mini-marketplace (`.claude-plugin/marketplace.json`). Dans Claude Desktop :

1. Cliquez sur **+** à côté du champ de saisie, puis **Plugins**.
2. **Add marketplace**, avec le chemin de ce dossier : `D:\Documents\CODE\Claude\pixel-bubbles`.
3. **Add plugin** : `pixel-bubbles`, en portée « user » pour qu'il se charge dans chaque session.

Depuis un terminal : `/plugin install pixel-bubbles --marketplace D:\Documents\CODE\Claude\pixel-bubbles`.

> Vérifié : Desktop accepte un dossier local comme source de marketplace (c'est ainsi que le mod est
> installé ici). Pour d'autres appareils, voir plus bas « Installer sur un autre appareil ».

### Après une modification du mod

Sur cette machine, le marketplace est un **dossier local** (`marketplace.json` : `"source": "./"`) :
d'après la documentation de Claude Code, le mod est alors lu **directement dans ce dossier**, pas
depuis une copie en cache (`claude plugin list` affiche « Read from: <ce dossier> »). Une
modification atteint les nouvelles sessions au démarrage de la session suivante (ou avec
`/reload-plugins` là où c'est disponible), **sans changer la version**. Une copie en cache
(`~/.claude/plugins/cache/mes-mods/pixel-bubbles/<version>`) existe aussi, mais n'est pas celle
qui s'exécute. Montez quand même `version` à chaque modification : c'est ce qui compte pour les
autres appareils qui installent le mod depuis un dépôt (voir « Installer sur un autre appareil »),
et cela ne coûte rien ici. La procédure que nous suivons depuis le début, qui marche :

1. Montez `version` dans `.claude-plugin/plugin.json`.
2. Lancez, depuis un terminal où `claude` est disponible :

```
claude plugin marketplace update mes-mods
claude plugin update pixel-bubbles@mes-mods
```

3. Ouvrez une **nouvelle session** (la mise à jour demande un redémarrage pour s'appliquer).

Si `claude` n'est pas dans le PATH, l'exécutable embarqué par Claude Desktop se trouve dans
`%APPDATA%\Claude\claude-code\<version>\<hash>\claude.exe`. Un simple changement du README n'exige
pas de mise à jour.

Si le mod est aussi présent dans le dossier de développement d'une session
(`~/.claude/dev-mods/<session>/pixel-bubbles`), supprimez cette copie : deux exemplaires
dessineraient les bulles deux fois.

### Installer sur un autre appareil (Linux)

**Portée.** Claude Desktop existe sur Linux en bêta (Ubuntu et Debian, par `apt`, d'après la
documentation de Claude Code). Le mod ne modifie que la surface `desktop` : dans le **terminal**
(`claude` seul), il s'installe mais ne change rien à l'affichage, par construction ; dans
l'**extension VS Code**, non plus (surface `vscode`, non traitée). Non testé sur Linux.

**Ce qu'il faut copier.** Tout le dossier : ce sont des fichiers texte (TypeScript, JSON, SVG) et deux
images sources. Aucun chemin propre à cette machine dans le code. Node n'est utile que pour
régénérer les images (`tools/`), pas pour faire tourner le mod.

**Voie 1, copie du dossier** (un appareil, une fois) : copier `pixel-bubbles` (clé USB, `scp`,
synchronisation…), puis, sur l'appareil :

```
claude plugin marketplace add ~/mods/pixel-bubbles
claude plugin install pixel-bubbles@mes-mods
```

Dans Desktop, sans terminal : **+** à côté du champ de saisie, **Plugins**, **Add marketplace** avec
le chemin du dossier, puis **Add plugin** `pixel-bubbles` en portée « user » (les étapes décrites plus
haut). Comme sur Windows, le mod est lu dans le dossier : une modification du dossier agit à la
session suivante, sans monter la version. Si le dossier est synchronisé entre appareils (Syncthing,
Nextcloud, partage réseau), une seule installation par appareil suffit.

**Voie 2, dépôt git** (recommandée pour plusieurs appareils) : le dossier devient un dépôt (privé de
préférence), qui contient déjà `.claude-plugin/marketplace.json`. Sur chaque appareil :

```
claude plugin marketplace add votre-compte/votre-depot
claude plugin install pixel-bubbles@mes-mods
```

Pour recevoir une nouvelle version : **monter `version`** dans `plugin.json`, pousser, puis, sur
chaque appareil, `claude plugin marketplace update mes-mods` et `claude plugin update
pixel-bubbles@mes-mods` (ou activer la mise à jour automatique : `/plugin`, **Marketplaces**, le
marketplace, **Enable auto-update**). Sans changement de `version`, les appareils gardent leur copie
en cache. Dépôt privé : l'appareil doit avoir des identifiants git (clé SSH chargée dans
`ssh-agent`, ou `gh auth login` puis `gh auth setup-git` ; `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` sans
clé SSH).

Le thème `bleu-et-or.json` n'est pas dans ce dossier (voir « Thème bleu et or ») et ne concerne pas
Desktop. Le marketplace est enregistré dans la configuration de **chaque** appareil : rien ne se
synchronise tout seul.

## Changer les images

Il y a dix portraits (version 0.31.0) : `art/neutre.png` et `art/reflechi.png`, puis huit expressions
(`content`, `triste`, `enerve`, `curieux`, `surpris`, `fatigue`, `endormi`, `concentre`), découpées
d'une planche (voir plus bas). Les images peuvent être de **n'importe quelle taille** (une
illustration en haute résolution convient) ; un fond transparent est préférable. Pour les changer,
remplacez ces fichiers, puis, depuis ce dossier :

```
node tools/build_mod_portraits.js . --width 96 --colors 72 neutre=art/neutre.png reflechi=art/reflechi.png content=art/content.png triste=art/triste.png enerve=art/enerve.png curieux=art/curieux.png surpris=art/surpris.png fatigue=art/fatigue.png endormi=art/endormi.png concentre=art/concentre.png
```

Les expressions sont dans `hooks/portrait.ts` (type `Expression`). Depuis la 0.32.0, le mod les
choisit selon la situation : voir « Expressions du portrait ».

Le script réduit chaque image à la largeur demandée, ramène toutes les images à une palette
commune de quelques couleurs (le rendu « pixel art limité »), puis les convertit en dessin
vectoriel net et réécrit `hooks/portrait.ts`.

- `--width` : largeur affichée en pixels (96 par défaut). La hauteur suit la première image, et les
  autres sont ajustées à la même taille : gardez des proportions voisines.
- `--colors` : taille de la palette commune (24 par défaut). **72 pour les dix portraits** : avec 40,
  les yeux verts de tous les portraits devenaient gris-bleu (une palette trop courte les absorbe dans
  le bleu des cheveux). Plus il y a de couleurs, plus chaque image pèse (56 à 62 Ko en SVG à 72
  couleurs ; `portrait.ts` fait environ 600 Ko).
- `--preview aperçu.png` : écrit une planche agrandie pour juger le rendu avant de l'adopter.
- `--inspect` : décrit les images (taille, format, transparence) sans rien écrire.

Pour ajouter une expression, ajoutez `nom=chemin.png` à la commande (le nom devient un identifiant du
code : sans accent). Chaque image doit tenir sous 131 072 caractères une fois convertie : le script
le vérifie et suggère de baisser `--colors` ou `--width` sinon.

### Une planche de plusieurs expressions

Les huit expressions viennent d'une seule image (deux rangées de quatre portraits sur fond blanc,
générée ailleurs). `tools/cut_portrait_sheet.js` la découpe et écrit un PNG par portrait dans `art/` :

```
node tools/cut_portrait_sheet.js . planche.png --names content,triste,enerve,curieux,surpris,fatigue,endormi,concentre
```

La planche doit être un **PNG** (une planche webp s'enregistre en PNG avec Paint). Le script repère
la grille tout seul, retire le fond blanc (le blanc des yeux reste) et **aligne** chaque portrait sur
le cadrage de `art/neutre.png` : même distance entre les yeux (donc même taille de visage), mêmes
yeux au même endroit en largeur, buste calé en bas du cadre comme dans une bulle. Un portrait aux
yeux fermés (`endormi`) prend la position médiane des autres. Les noms (`--names`) sont dans l'ordre
de lecture, ligne par ligne. Options : `--reference` (cadrage de référence, `art/neutre.png`),
`--scale` (taille des PNG, 0,5 de la référence par défaut : 367×394 px, assez fin pour 96 px, quatre
fois plus léger), `--out`. Pour de bons résultats, les portraits de la planche doivent garder la
tête, les yeux et la bouche à peu près aux mêmes endroits d'une expression à l'autre. Ensuite, relancer
`build_mod_portraits.js` (commande ci-dessus), puis `build_blink.js`.

Après un changement du portrait pensif, refaites aussi les paupières du clignement (voir
« Clignement des yeux »). Après un changement d'image, un rechargement du mod est nécessaire :
ouvrez une nouvelle session.

## Changer le décor de la bande

L'image source est `art/fond.png` (n'importe quelle taille ; la version actuelle fait 1979×795).
Le script en prend une **bande**, la réduit à basse résolution, limite les couleurs, puis
l'agrandit d'un facteur entier, comme un écran de jeu ; il écrit `hooks/background.ts`. Depuis ce
dossier :

```
node tools/build_mod_portraits.js . --background art/fond.png --crop 0,0.30,1,0.3485 --width 250 --height 35 --scale 3 --colors 32 --preview aperçu.png
```

- `--crop x,y,l,h` : la bande à garder, en fractions de l'image (ici toute la largeur, à partir de
  30 % de la hauteur). Gardez les mêmes proportions que `--width` sur `--height`, sinon l'image
  est déformée.
- `--width` et `--height` : résolution d'origine du décor (250×35 ici) ; `--scale` : agrandissement
  entier (3 : 750×105 px à l'écran). La colonne de messages de Desktop fait environ 752 px : au-delà,
  le décor est rogné ; en dessous, une marge du fond du panneau apparaît à droite.
- `--colors` : taille de la palette (32 ici). Le décor doit rester sous 131 072 caractères ; le
  script le vérifie (le décor actuel en fait environ 50 000, il y a donc de la marge pour une
  résolution plus fine).
- `--preview` : écrit le décor tel qu'il sera affiché, pour juger le recadrage.
- `--name` : nom du fichier et des constantes (`background` par défaut). Le décor du **panneau de
  statut** (plus carré, centré sur le château) se génère ainsi :

```
node tools/build_mod_portraits.js . --background art/fond.png --name panel-background --crop 0.55,0.28,0.45,0.337 --width 170 --height 51 --scale 3 --colors 32 --preview aperçu.png
```

## Régler l'aspect

Tout se trouve en tête de `hooks/register.tsx` : couleur du cadre (`FRAME`), voile (`TINT`, en
hexadécimal avec transparence), cadre et voile de vos messages (`USER_FRAME`, `USER_TINT`), fond du panneau de la bande (`PANEL`), taille de la pointe (`SCALE`) et sa hauteur (`marginBottom` de la
`Box` qui la contient). Les bulles montrent `PORTRAITS.neutre`, la bande `PORTRAITS.reflechi`. Les
phrases de la fenêtre d'état (`describeTool`) et le format du temps sont dans `hooks/activity.ts`.

## Thème bleu et or

Fichier **hors de ce dossier** : `%USERPROFILE%\.claude\themes\bleu-et-or.json` (format de la
documentation de Claude Code : `name`, `base` = `dark`, `overrides` = 35 couleurs en `#rrggbb`).
Mêmes couleurs que le mod : or `#d9b44a` (accent, bordure du champ de saisie, dialogues), bleu clair
`#7aa2f7` (suggestions, mode plan), fond bleu nuit pour vos messages (`#16213f`), coche verte
`#8fd694` et croix rouge `#f7768e` comme dans le journal d'actions.

Il se choisit avec `/theme` dans un terminal Claude Code (« Bleu et or »), qui range la préférence
`custom:bleu-et-or`. **Activé** : la ligne `"theme": "custom:bleu-et-or"` a été ajoutée en tête de
`%USERPROFILE%\.claude.json` (le reste du fichier est inchangé). Pour revenir en arrière : choisir un
autre thème avec `/theme`, ou retirer cette ligne. Non vérifié : que l'onglet Code de Desktop
applique ces couleurs (la documentation ne parle que du terminal) ; le thème se voit au plus tôt
dans une nouvelle session. Les éléments du mod qui nomment une clé
du thème (et non une couleur fixe) suivent le thème choisi ; ceux du mod aujourd'hui utilisent des
couleurs fixes.

## Vérifier

```
claude plugin validate .
claude plugin test .
```

## Fichiers

- `hooks/register.tsx` : le mod (bulles, bande de travail, suivi du tour et des outils).
- `hooks/portrait.ts` : portraits en SVG, **généré** par `tools/build_mod_portraits.js`.
- `hooks/background.ts` : décor de la bande en SVG, **généré** par le même script (mode `--background`).
- `hooks/activity.ts` : phrases, temps et barre de la fenêtre d'état, filtre des outils internes,
  fonctions pures testées.
- `hooks/journal.ts` : marques (✓ ✗ ▸) et phrases du journal d'actions, fonctions pures testées.
- `hooks/status.ts` : jauges, libellés des limites et durée de session du panneau de statut.
- `hooks/mood.ts` : le choix du portrait selon la situation (mots, seuils), fonctions pures testées.
- `hooks/panel-background.ts` : décor du panneau de statut en SVG, **généré** (option `--name`).
- `hooks/blink.ts` : le clignement (ajoute les paupières animées au portrait pensif).
- `hooks/eyelids.ts` : paupières mi-closes et closes en SVG, **généré** par `tools/build_blink.js`.
- `tools/cut_portrait_sheet.js` : découpe une planche d'expressions en PNG alignés sur `neutre.png`.
- `hooks/origin.ts` : distingue vos messages des lignes « utilisateur » automatiques.
- `hooks/attachments.ts` : repère les messages avec pièce jointe, qui gardent le dessin de Desktop.
- `types/index.d.ts` : contrat de l'état partagé du mod.
- `tests/bubbles.test.ts` : tests.
- `art/` : portraits sources en PNG. `tools/` : script de conversion.

## Limites connues

- L'API des mods est en accès anticipé : elle peut changer d'une version de Desktop à l'autre.
- Le portrait ne peut pas rester fixe dans la conversation : Desktop ne permet de dessiner que dans
  les lignes de la conversation, d'où un portrait par bloc. Un panneau propre au mod, qui reste
  affiché à côté, est essayé depuis la 0.22.0 (voir « Panneau de statut »).
- Certains éléments de Desktop ne sont pas redessinables par un mod : la liste d'étapes affichée
  pendant le travail, la barre latérale, le panneau de droite, le champ de saisie lui-même. Les
  lignes de résumé des outils (« Créé et modifié x.txt, exécuté 1 commande ») ne correspondent pas
  à `ToolGroup` (contrairement à ce qu'on supposait) : le mod ne les redessine pas ; `ToolGroup`
  donne le journal d'actions, dessiné sous cette ligne (voir « Journal d'actions »).
- Le dessin d'un message utilisateur remplace celui de Desktop, et le mod ne reçoit que le texte du
  message : la **carte d'une pièce jointe** (image collée, document) disparaissait avec la bulle de
  Desktop (constaté). Les messages qui portent une pièce jointe gardent donc le dessin de Desktop
  (`hooks/attachments.ts`) ; le mod les repère à l'arrivée du message dans la conversation, et au
  chargement pour ceux qui y sont déjà. Ils n'ont donc pas le style bleu et doré. Les autres
  éléments propres à Desktop (icônes d'action sous le message) ne sont pas touchés : ce sont des
  éléments à part.
- L'indicateur de réflexion (« En cours… ») est redessinable, mais sa ligne ramène les images à la
  hauteur du texte et en masque la moitié : un portrait de 96×103 px y devient une vignette
  d'environ 14 px, coupée au niveau des yeux. Essayé sans succès : conteneur de largeur fixe, puis
  dessin dans un cadre (`isInteractive`). Le portrait pensif vit donc dans la bande au-dessus du champ.
- Cette bande est entourée par Desktop d'une carte grise (fond et contour) que le mod ne peut ni
  retirer ni rendre transparente. C'est pourquoi elle n'apparaît que pendant le travail, et pourquoi
  elle contient aussi une fenêtre d'état : un portrait seul y faisait vide.
- Pour atténuer cette carte, le contenu de la bande est posé sur un **panneau pleine largeur** de la
  couleur de fond de Desktop en thème sombre (`PANEL` = `#151515`, mesurée ; la carte est `#212121`).
  Il ne reste de la carte que sa fine marge. En thème clair, ce panneau apparaît comme un bloc
  sombre. Il est habillé du décor en pixel art décrit plus haut ; il reste visible là où le décor ne
  le couvre pas.
- Superposition : dans Desktop, un élément hors du flux (`position="absolute"`) se peint au-dessus
  des éléments ordinaires, même s'il est écrit en premier, et même si les autres sont eux aussi
  positionnés (`position="relative"`). Un premier essai, avec le décor hors du flux, le faisait donc
  recouvrir le portrait et la fenêtre. C'est maintenant l'inverse : le décor reste dans le flux (il
  donne sa hauteur au panneau) et le contenu est hors du flux, au-dessus.
- Le temps écoulé est compté par une minuterie d'une seconde, donc approximatif. Il ne compte que
  la boucle principale : les outils des sous-agents ne changent pas l'action affichée.
