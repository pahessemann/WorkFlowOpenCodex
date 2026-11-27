# Tableau de bord — `$dev tableau` (3.3)

Une page web locale, en lecture seule, qui montre d'un coup d'œil ce que `$dev point` raconte et où en est
chaque chat, sans ouvrir un chat. Elle s'affiche **toujours dans le navigateur intégré du chat
`❓ AIDE · workflow`**, jamais dans Edge ni Chrome.

## Ce que la page montre (ordre fixe)

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
- Routes : `/` (page, `assets/tableau/`), `/api/version`, `/api/point` → `{ releve_le, erreur, point }`,
  `/api/chats` → `{ releve_le, erreur, atelier_injoignable, chats[] }`.
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

- v1 (3.3) : aucune écriture, ni registre, ni Linear, ni chat. La page appartient à Paul.
- v2 (3.4) : `POST /api/action` avec jeton de session, `Origin` contrôlée ; chaque bouton n'exécute qu'une commande
  existante du pilote sur le bon hôte et affiche son refus tel quel (`CADREUR REQUIS`, `LIVRAISON PAR PAUL`…). Hors
  périmètre : changer le statut d'une issue, fusionner, déployer, écrire dans Linear.

## Tests

`scripts/tableau.test.mjs` : liaison `127.0.0.1`, fichiers de la page, hôte étranger et méthodes refusés ; recopie
du pilote, cache et appel unique en vol, chats archivés ou `a_creer` exclus ; atelier injoignable avec derniers
chiffres conservés ; pilote réel avec atelier simulé ; `url` sans serveur, `servir` idempotent, démarrage détaché
et `arret`. Évaluations : `tableau-url`, `tableau-sous-commande`.

