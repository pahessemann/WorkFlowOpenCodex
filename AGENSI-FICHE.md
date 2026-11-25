# Fiche Agensi — dev-orchestrator

## Permissions à cocher

**terminal**, **file_read**, **file_write**, **env_vars**, **network**. Le skill peut aussi supprimer des fichiers, créer des processus et des tâches planifiées, exécuter des commandes locales ou distantes, et modifier certains réglages système. Si Agensi distingue ces capacités par des cases supplémentaires, les déclarer aussi ; les noms exacts de ces cases dépendent de son interface.

## Hôtes à déclarer

| Hôte ou destination | Usage et conditions |
|---|---|
| `github.com` | Dépôts Git et synchronisation éventuelle du vault lorsque leur distant est hébergé sur GitHub. D'autres hébergeurs sont possibles selon les URL Git configurées. |
| `api.github.com` | API GitHub via `gh pr list` pour vérifier des PR fusionnées, lorsque le dépôt utilise GitHub. `gh` peut viser un autre hôte selon sa configuration. |
| `npm.pkg.github.com` | Registre GitHub Packages inscrit dans le `.npmrc` généré pour certains prototypes ; contacté seulement si l'utilisateur lance ensuite l'installation des paquets correspondants. |
| Serveur SSH et cibles configurés par l'acheteur | `ssh` pour piloter l'atelier, vérifier et exécuter les étapes autorisées ; `scp` pour transférer des livrables et des preuves. Les noms et adresses ne sont pas fixés dans le code. |
| Services configurés par l'acheteur | Linear est utilisé par l'agent via son intégration ; Codex, les fournisseurs de modèles, les registres de paquets et les autres distants Git utilisent les destinations de leurs propres configurations. Le dépôt ne fixe pas l'ensemble de ces hôtes : les inventorier sur l'installation réelle. |
| `127.0.0.1` / `localhost` | Éditeur Vite de prototype local, lorsque lancé ; il ne s'agit pas d'un service Internet. L'app-server peut également communiquer par socket Unix locale. |

Les adresses `github.com` et `api.github.com` sont à déclarer comme demandé par la revue. Le dépôt ne contient pas de client HTTP GitHub ou Linear avec URL fixe : les connexions passent par Git, `gh`, Codex ou leurs intégrations. Les noms des hôtes variables ne peuvent pas être déterminés sans la configuration de l'acheteur ; aucune destination unique n'est garantie pour ceux-ci.

## Description à coller

Orchestrateur de campagnes et d'issues Linear pour le développement assisté par agents. Il choisit des modèles selon la tâche, suit les décisions et les preuves, gère les branches et worktrees Git, les tâches du poste et, si configuré, le vault Obsidian et les livraisons. Il lit et écrit des fichiers de projet, d'état et de configuration, peut lire `.env.local` pour affecter des comptes de recette, utilise des variables d'environnement et exécute des commandes. Il communique avec GitHub et les services configurés par l'acheteur ; **le skill se connecte aussi en SSH au serveur configuré par l'acheteur** pour piloter les campagnes et exécuter les commandes autorisées ; il transfère des preuves et livrables par SCP et peut contacter les cibles de livraison configurées. Les droits, accès et éventuelles actions dépendent du mandat et de la configuration de l'acheteur.

## Accès → usage → fichier source

Les chemins ci-dessous sont des exemples relatifs ou des clés de configuration, pas des chemins d'une installation réelle. `<etat>` correspond à `etat` dans `poste.local.json` ou à sa configuration alternative ; il est souvent situé sous `~/.pilote`.

| Accès | Usage | Fichier source |
|---|---|---|
| `poste.local.json`, ou chemin `PILOTE_CONFIG` | Lecture de la configuration, des chemins, projets, modèles, alias SSH et options d'exécution ; `vault.mjs` lit le fichier local du skill. | `scripts/pilote.mjs` (`lireConfig`), `scripts/vault.mjs` (`lirePoste`), `poste.local.exemple.json` |
| Dépôts, `PROJECT.md`, `AGENTS.override.md`, manifestes et fichiers suivis | Lecture de la configuration du projet, des règles, de l'arborescence, des manifestes et du code ; création et modification de worktrees, branches, `.git/info/exclude` et fichiers de projet via Git ou les agents. | `scripts/pilote.mjs` (`genererCarte`, `ouvrir`, `exclure`), `scripts/carte-agent.mjs`, `scripts/validate-project.mjs`, `references/execution.md` |
| `.env.local` du checkout et des worktrees | Lecture des comptes de recette numérotés, réservation d'un compte et écriture de ses entrées dans le worktree. Le contenu peut comprendre des identifiants et mots de passe ; il ne doit pas être publié ou journalisé. | `scripts/pilote.mjs` (`lireEnv`, `numerosCompte`, `reserverCompte`), `references/comptes-recette.md` |
| `<etat>/campagnes/` | Lecture et écriture des campagnes JSON, contrats, décisions et journaux ; création des dossiers et verrous. | `scripts/pilote.mjs` (`dossierCampagnes`, `modifierCampagne`, `decision`) |
| `<etat>/carte/`, `fiches/`, `reprises/`, `preuves/` | Cartes et fiches de projet ou d'issue, fiches de reprise, preuves, fichiers temporaires et journal du lecteur de carte. | `scripts/pilote.mjs`, `scripts/carte-agent.mjs`, `references/campagne.md`, `references/test.md` |
| `<etat>/poste/`, `passerelle/`, `taches/`, `executant/`, `lourdes/` | Files, demandes, scripts, résultats, sorties, preuves, verrous et tâches de la passerelle, de l'exécutant et des charges lourdes. Le dossier de travail de passerelle peut être configuré ailleurs. | `scripts/pilote.mjs` (`dossierPoste`, `executerCommandePoste`, `demanderExecutant`, `lourde`), `references/poste.md`, `references/executant.md` |
| `<etat>/comptes.json`, `chats.json`, `refus.json`, `fournisseur.json`, `abonnement.jsonl`, `menage/`, autres fichiers d'état | Réservations, registre des chats, routage, quotas, ménage, réveil et suivi de l'hôte. | `scripts/pilote.mjs` |
| `~/.opencodex/` ou `opencodex_dir`, `~/.codex/sessions/` | Lecture des caches de quotas et de fichiers de sessions pour estimer la taille des contextes et gérer les chats. Les données sont celles de l'installation de l'utilisateur. | `scripts/pilote.mjs` (`lireAbonnement`, `taillesSessions`) |
| Vault Obsidian configuré et son dépôt Git | Lecture et écriture des notes par le workflow ; `vault.mjs` peut effectuer pull/rebase, commit et push des chemins demandés vers le distant configuré. | `scripts/vault.mjs`, `references/finalisation.md`, `references/cloture.md` |
| Livrables de projet et `livrables/livraison/<date>/` | Lecture des plans et paquets ; écriture des plans, journaux et preuves, et rapatriement des livrables via SCP. | `scripts/pilote.mjs` (`executerLivraison`, `rapatrierLivrables`), `references/livraison.md` |
| Racine des prototypes, `spec.json`, `prototype.local.json`, `package.json`, `.npmrc`, `index.html` | Lecture et création de prototypes et de leurs configurations ; la racine vient de `--root` ou `PROTOTYPES_ROOT`. | `scripts/prototype.mjs`, `scripts/prototype-check.mjs`, `assets/prototype/vite.config.mjs` |
| Fichiers temporaires, corbeille et worktrees configurés | Création, copie, déplacement et suppression de fichiers ; le nettoyage activé peut supprimer récursivement des fichiers temporaires et éléments anciens de la corbeille et déplacer des worktrees. Il ne se limite donc pas à une mise en corbeille. | `scripts/pilote.mjs` (`configNettoyage`, `nettoyerDisque`), `scripts/carte-agent.mjs`, `references/nettoyeur.md` |
| Variables `PILOTE_CONFIG`, `CODEX_THREAD_ID`, `PROTOTYPES_ROOT` | Sélection de la configuration, identification du chat demandeur et racine des prototypes. Les noms sont indiqués sans valeurs. | `scripts/pilote.mjs`, `scripts/carte-agent.mjs`, `scripts/prototype.mjs` |
| Variables héritées et `PASSERELLE_TRAVAIL`, `GIT_EDITOR` | Les processus enfants héritent de l'environnement ; le pilote ajoute `PASSERELLE_TRAVAIL` pour la passerelle et `vault.mjs` définit `GIT_EDITOR` pour Git. Les outils lancés peuvent utiliser leurs propres variables et identifiants. | `scripts/pilote.mjs`, `scripts/vault.mjs`, `scripts/evals.mjs` |
| Environnement et fichiers des outils externes | La résolution des exécutables et des dossiers utilisateur ou temporaires utilise l'environnement de la plateforme (`PATH`, dossier personnel, `TEMP`/`TMP` selon le système). Git, `gh`, SSH, Codex et les gestionnaires de paquets peuvent lire leurs propres configurations et authentifications, par exemple configuration Git, `.ssh/config`, clés et `known_hosts`, ou `.npmrc` ; les fichiers effectivement consultés dépendent des outils et de l'installation. Le relevé n'a consulté aucune valeur de secret. | `scripts/pilote.mjs` (appels de processus), `scripts/vault.mjs`, `scripts/carte-agent.mjs`, `scripts/prototype.mjs` |
| `FAUX_SSH_SCENARIO`, `IMP` | Scénarios et variables propres aux tests ou à la simulation ; elles ne sont pas nécessaires au fonctionnement standard. | `scripts/faux-ssh.mjs`, `scripts/pilote.test.mjs` |
| `node`, `git`, `gh`, `ssh`, `scp`, `codex`, `ocx` | Exécution du pilote et d'agents, Git/worktrees, recherche de PR, appels et copies SSH, routage et configuration des sous-agents. | `scripts/pilote.mjs`, `scripts/carte-agent.mjs`, `scripts/vault.mjs` |
| PowerShell, `powercfg`, commandes système et de projet | Scripts Windows, tâches planifiées, état de veille ; commande arbitraire passée à `lourde`, commande SSH ou étapes de livraison configurées. Les agents peuvent aussi lancer les outils du projet, dont Docker ou `pnpm`, lorsque la tâche le demande. | `scripts/pilote.mjs` (`posteInstaller`, `executerCommandePoste`, `lourde`, `executerLivraison`), `references/execution.md`, `references/prototype.md` |
| HTTP local du prototype (`fetch` vers `/__prototype`) | Lecture et enregistrement de la composition dans le serveur Vite local ; `curl` apparaît dans le simulateur SSH des tests, aucun appel `wget` ni client HTTP Internet fixe n’a été relevé dans les scripts. | `assets/prototype/src/main.jsx`, `assets/prototype/vite.config.mjs`, `scripts/faux-ssh.mjs` |
| Socket Unix, app-server local Codex et services externes | JSON-RPC sur WebSocket Unix ou processus Codex local ; les agents et intégrations peuvent contacter Linear et les fournisseurs configurés. | `scripts/appserver.mjs`, `scripts/pilote.mjs`, `scripts/carte-agent.mjs` |

## Points d'attention pour la revue

- L'accès en écriture est étendu aux chemins fournis par la configuration et aux projets manipulés. Les processus enfants héritent de l'environnement ; la lecture de `.env.local` peut donner accès à des secrets.
- La passerelle et les plans de livraison peuvent exécuter des commandes fournies et des scripts à distance. La configuration d'exemple prévoit notamment un accès large de l'agent ; les droits effectifs dépendent de l'installation. Ces capacités ne sont pas retirées par ce correctif.
- Le nettoyage automatique, s'il est activé, peut supprimer définitivement des fichiers temporaires et des éléments anciens de la corbeille. Examiner ses chemins et délais avant activation.
- Le fichier `references/executant.md` décrit l'interface vers un exécutant externe ; celui-ci n'est pas distribué dans ce dépôt, donc son code et ses propres accès ne peuvent pas être audités ici.
- Les exemples de discussions et d'issues ont été anonymisés dans les fichiers courants. Certains noms techniques historiques, comme `livraison_par_paul`, restent inchangés pour préserver la compatibilité des configurations ; l'historique Git antérieur n'a pas été réécrit.
