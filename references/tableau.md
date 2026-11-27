# Tableau de bord — `$dev tableau` (3.3, actions 3.4, page 3.5)

Une page web locale qui montre d'un coup d'œil ce que `$dev point` raconte et où en est chaque chat, et qui
permet depuis la 3.4 de jouer quelques commandes du pilote sans ouvrir un chat. Elle s'affiche **toujours dans le
navigateur intégré du chat `❓ AIDE · workflow`**, jamais dans Edge ni Chrome.

## Ce que la page montre (ordre fixe)

Depuis la 3.5 : en-tête collant avec l'état global du point, trois compteurs (à toi, campagnes en cours, chats dont la ligne
d'état t'attend), fraîcheur relative et liseré jusqu'au prochain relevé, bouton « Relever » (raccourci `r`), thème
automatique / clair / sombre et densité normale / compacte mémorisés dans le navigateur ; deux colonnes à partir de 1100 px
(contenu, puis panneau d'actions collant à droite), tout empilé en dessous (panneau intégré à côté du chat, bouton
« Actions », raccourci `a`). « À toi » est ambre seulement quand quelque chose t'attend. Les chats sont regroupés par hôte et
dossier, les ⏸ en premier, avec filtres (m'attend, hôte, rôle), ligne d'état dépliable au clic, « relevée il y a … » ; les
chats sans ligne d'état relevée sont repliés. Les confirmations sont inline (Oui / Non), le résultat d'une action s'affiche
en toast puis en détail dans le panneau, le journal se filtre (faits / refus). `/maquette.html` sert la même page avec des
données fictives (`maquette-donnees.js` remplace `fetch`, rien n'est envoyé) : c'est le banc d'essai visuel.

1. **👤 À toi** : les actions de Paul (`actions_paul` du point) et la ligne d'état du point.
2. **Campagnes** : une carte par campagne en cours (avancement, clôtures 24 h, temps restant, places, ligne d'état, bloc d'état).
3. **Blocages** : une ligne par issue arrêtée, avec qui débloque.
4. **Ressources** et **Abonnement** de l'hôte d'exécution.
5. **Chats ouverts** des deux hôtes : titre, hôte, dossier, dernière ligne d'état (relevée par le réveil pour les chats
   d'atelier ; « non relevée » pour les chats du poste, dont seul `read_thread` lit le dernier message), date du relevé.
6. **Point complet** : le champ `rendu` de `pilote.mjs point`, replié.

Rafraîchissement automatique toutes les `tableau.rafraichissement_s` secondes (60), horodatage « relevé à »,
bandeau rouge si le serveur ne répond plus, bandeau jaune avec les derniers chiffres conservés si atelier est
injoignable ou si le pilote refuse.

## Le serveur : `scripts/tableau.mjs`

- Node seul, sans dépendance, lié à `127.0.0.1` ; refuse tout en-tête `Host` étranger (`HÔTE REFUSÉ`, 403) et toute
  méthode autre que GET/HEAD (`MÉTHODE REFUSÉE`, 405). Aucun secret : il ne sert que ce que `point` et le registre des
  chats rendent déjà.
- Données : `node <pilote> point` et `node <pilote> chats --deux-hotes` (registre local + registre d'atelier, champ
  `atelier_injoignable` quand SSH échoue), exécutés **hors du processus** du serveur ; cache de `tableau.cache_s`
  secondes (60) et un seul appel en vol par route, pour ne pas marteler SSH.
- Routes : `/` (page, `assets/tableau/`), `/api/version` (version, actions, commandes du lanceur, projets,
  `livraison_par_paul`), `/api/point` → `{ releve_le, erreur, point }`, `/api/chats` →
  `{ releve_le, erreur, atelier_injoignable, chats[] }`, `/api/campagnes` (3.4, `pilote.mjs tableau-campagnes` :
  projet, chat, hôte de livraison, plan présenté, `livraison_par_paul`), `/api/journal` (3.4), `POST /api/action` (3.4).
- Ports : `tableau.port` (8421) puis `tableau.ports_secours` (8521, 8621, 8721, 9421). Windows réserve des plages de
  100 ports qui changent à chaque démarrage (Hyper-V, WSL) ; le serveur prend le premier port libre et note le port
  effectif dans `.pilote/tableau.json` (pid, port, url, démarré le), que `tableau url` lit en premier.
- Journal : `.pilote/tableau.log`.

## Commandes

| Commande | Effet |
| :--- | :--- |
| `node <pilote> tableau [servir]` | Idempotent : si un serveur répond déjà, rend son `url` (`deja_actif: true`) ; sinon le démarre détaché et attend qu'il réponde (`TABLEAU INACTIF` après 8 s, journal indiqué). Sans argument : `servir` ; c'est aussi ce que le lanceur exécute pour `$dev tableau` tapé dans un autre chat (commande directe) |
| `node <pilote> tableau url` | `{ url, port, actif, version, demarre_le, consigne }`, sans rien démarrer |
| `node <pilote> tableau arret` | Arrête le serveur noté dans `tableau.json` (`TABLEAU SANS PID`, `TABLEAU NON ARRÊTÉ`) |
| `node scripts/tableau.mjs --servir [--port n]` | Le serveur au premier plan (tâche planifiée, essais) |

`pilote.mjs` lance `tableau.mjs` dans un processus séparé (le tableau importe le pilote, l'inverse créerait un cycle).

## Toujours dans le navigateur intégré d'AIDE

Dans `❓ AIDE`, `$dev tableau` (ou « tableau de bord », « ouvre le tableau ») est, avec `$dev point`, l'une des deux
commandes qu'AIDE exécute lui-même : `node <pilote> tableau servir`, puis ouverture de l'`url` rendue dans le
navigateur intégré du chat AIDE, dans cet ordre : `open_in_codex` (`target: { type: "browser", url }`, outil de
l'application qui ouvre le panneau du chat ou le met en file, `queued`, s'il n'est pas affiché), sinon
`cua.createBrowserTab("iab", url, { visible: true })` (ne répond que pour le chat affiché à l'écran :
`Browser is not available: iab` ailleurs), sinon l'URL à cliquer. Jamais Edge ni Chrome. AIDE ne clique sur rien
dans la page. Après un `$dev point`, AIDE rappelle en une ligne que le tableau existe.

## Toujours disponible

La tâche planifiée `pilote-tableau` (poste, ouverture de session de Paul, cachée, sans limite de durée, instance
unique) lance `node scripts/tableau.mjs --servir` ; `tableau servir` depuis AIDE rattrape une tâche absente. Le
serveur vit dans la session Windows : il s'arrête avec elle et repart à l'ouverture suivante.

## Garde-fous

- La lecture n'écrit rien. Les actions (3.4) ne font qu'assembler une commande existante du pilote ; hors périmètre :
  changer le statut d'une issue, fusionner, déployer, écrire dans Linear.

## Actions (3.4)

**Jeton de session.** Le serveur tire un jeton à chaque démarrage, l'inscrit dans `.pilote/tableau.json` et dans l'URL
que rendent `tableau servir` et `tableau url` (`?jeton=…`) : c'est cette URL qu'AIDE ouvre. La page garde le jeton pour
la session de l'onglet et l'envoie dans l'en-tête `X-Jeton` de chaque `POST /api/action` ; sans jeton
(`JETON ABSENT`, 403), avec le jeton d'une session précédente (`JETON INVALIDE`) ou depuis une autre origine
(`ORIGINE REFUSÉE`), rien n'est joué. Une page ouverte sans jeton reste en lecture seule et le dit ; après un
redémarrage du serveur, retaper `$dev tableau` dans AIDE.

**Chaque action = une commande du pilote**, jouée sur le poste ou sur l'hôte d'exécution (SSH ; atelier simulé en
test), avec les mêmes refus que dans un chat, rendus tels quels (`CADREUR REQUIS`, `CAMPAGNE NON LANCÉE`,
`CHAT DÉJÀ OUVERT`, `LIVRAISON PAR PAUL`…). Les paramètres sont validés avant tout appel (`PARAMÈTRE INVALIDE`, 400).

| Bouton | Commande | Hôte |
| :--- | :--- | :--- |
| ⏸ Pause / ▶ Reprendre (carte de campagne) | `pause <campagne>` / `reprendre <campagne> --motif "Paul, via le tableau de bord"` | poste (le pilote route vers atelier) |
| ↻ Relancer (chat d'atelier) | `relancer-chat <chat> --motif …` | atelier |
| 💬 Créer le chat (campagne en cours sans chat) | `chat <campagne>` | atelier |
| Lancer un chat de travail | `lancer cadrage\|issue\|discuter\|prototype <args> --depuis-role AIDE --depuis-modele <modeles.aide> --fiche-stdin [--projet p] [--nouveau]` ; la fiche (15 lignes au plus) part sur l'entrée standard ; jamais `executer_ici` | poste |
| 🚚 GO de livraison (campagne à livraison locale, projet hors `livraison_par_paul`) | `livraison-info` pour afficher le plan présenté, puis `livraison-go <campagne> <plan>` seulement si l'empreinte saisie (8 caractères au moins) est celle du sha256 du plan affiché (`EMPREINTE DIFFÉRENTE` sinon) ; aucun plan : `PLAN ABSENT` | atelier |
| Décision globale | `decision-globale --texte-stdin`, texte préfixé « Paul (<date>, via le tableau de bord) : » | atelier |
| Compte Anthropic | `abonnement compte <id>` (comptes relevés par le point) | atelier |
| Ménage : Analyser, puis Appliquer les sûres | `menage`, puis `menage appliquer surs` (jamais de suppression ; AIDE, ARCHI et campagnes en cours protégés) | poste |

Après chaque action réussie, le cache du point, des chats et des campagnes est vidé et la page se rafraîchit. Chaque
action, réussie ou refusée, est inscrite dans `.pilote/tableau-actions.jsonl` (date, action, paramètres sans la fiche
complète, résultat ou refus), visible dans « Journal des actions ». Les commandes jouées portent la mention « Paul,
via le tableau de bord » là où le pilote accepte un motif ou un texte.

## Tests

`scripts/tableau.test.mjs` : liaison `127.0.0.1`, fichiers de la page, hôte étranger et méthodes refusés ; recopie
du pilote, cache et appel unique en vol, chats archivés ou `a_creer` exclus ; atelier injoignable avec derniers
chiffres conservés ; pilote réel avec atelier simulé ; `url` sans serveur, `servir` idempotent, démarrage détaché
et `arret`. Évaluations : `tableau-url`, `tableau-sous-commande`.

