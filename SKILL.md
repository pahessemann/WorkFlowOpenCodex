---
name: dev-orchestrator
description: Orchestrateur de campagnes autonomes et supervisées (Linear Milestones et Issues) : composition à froid, chats identifiables d'un coup d'œil, routage économe des modèles et exécution hybride (PC local / VPS atelier).
---

# Orchestrateur Dev — Workflow opérationnel (v2.7)

Ce skill régit l'orchestration des travaux via `pilote.mjs`, sur le poste local Windows et sur le VPS `atelier` (Linux).

**Chemin de `pilote.mjs`** : `<pilote>`, partout dans ce skill, désigne la valeur `"pilote"` de `poste.local.json` (chemin absolu, propre à chaque hôte : `C:\Users\<utilisateur>\.agents\skills\dev\scripts\pilote.mjs` sur le poste, `/home/utilisateur/.agents/skills/dev/scripts/pilote.mjs` sur atelier). On ne cherche **jamais** `pilote.mjs` dans le dépôt du projet ni dans le dossier courant. Le skill se charge uniquement depuis `~/.agents/skills/dev/`.

## Principe directeur : Paul cadre, les agents exécutent

Paul intervient **une fois, au cadrage**. Ensuite, les agents travaillent seuls jusqu'à la livraison. Toute la v2.2 en découle :

1. **Le cadrage est le seul vrai point de contact.** Il produit un **contrat de campagne** (§3 bis), validé par un GO unique. Ce GO vaut autorisation pour tout ce que le contrat couvre.
2. **Un agent ne demande pas, il décide.** Face à un choix non tranché, il applique les règles de décision du contrat. À défaut, il retient l'option la plus simple et la plus réversible, puis la note dans le journal de décisions. Il continue sans attendre.
3. **Paul n'est interrompu que pour 3 motifs** : une action irréversible (déploiement serveur, suppression de données, migration de production, **fusion vers une branche qui déploie**, c'est-à-dire `main_deploie: true`), une action hors mandat, un circuit-breaker déclenché. Tout le reste passe dans le digest.
4. **Un blocage ne bloque pas la campagne.** L'issue concernée est mise de côté (`⛔`) et les issues indépendantes continuent.
5. **Paul lit, il ne surveille pas.** Un digest par campagne et par jour remplace les notifications au fil de l'eau.

## Règles fondamentales

* **Autorité unique** : Paul est la seule autorité humaine. Ne jamais solliciter, mentionner ou attendre un tiers dans Linear ou dans les chats.
* **Socle autonome** : ce workflow ne dépend d'aucun autre dépôt ni d'aucun autre workflow à l'exécution. Les règles propres à un projet vivent uniquement dans son `PROJECT.md`.
* **Chargement paresseux** : ne lire que `poste.local.json`, le `PROJECT.md` du dépôt cible, la carte de dépôt `.pilote/carte/<projet>.md` et le contrat de la commande invoquée. Ne jamais précharger tous les `references/*.md` ni les historiques de chats.
* **Reprise par fiche, pas par historique** : un chat repris démarre de sa fiche de reprise (10 lignes maximum), jamais de la relecture d'un ancien fil.
* **Discussion libre** : sans commande `$dev` explicite, rien n'est déclenché : ni campagne, ni issue, ni écriture dans le vault Obsidian, ni notification.

---

## 1. Commandes

| Commande | Action / contrat | Type de chat |
| :--- | :--- | :--- |
| `$dev campagne composer <nom> <projet> <MS\|ID...>` | Créer ou enrichir une campagne en **brouillon**, sans agent | inline |
| `$dev campagne scinder <campagne> --projet <p> --vers <nouvelle>` | Scinder une campagne en cours en campagnes sœurs par projet, chacune avec son orchestrateur ; dépendances suivies entre sœurs, commandes visant une issue transférée redirigées (v2.7) | inline |
| `$dev campagne voie-recette <campagne>` | Ouvrir la voie de recette dédiée (chat `🧪 TEST`, Sonnet) : elle prend les issues en recette ou fusionnées, joue leur recette et les clôt, hors des places de l'orchestrateur (`test.md`, v2.7) | `TEST` |
| `$dev campagne ajouter <campagne> <ID…> --motif "…"` | Ajouter une issue à une campagne **en cours** (ou en pause), avec la décision ou la clause du contrat qui la couvre ; options `--projet`, `--criticite`, `--bloquee-par`, `--milestone` ; ligne au journal, admission au prochain réveil (v2.6.2) | inline |
| `$dev campagne lancer <nom> [auto\|supervise]` | Resynchroniser Linear, vérifier les dépendances, démarrer (`campagne.md`) | `AUTO` / `SUP` |
| `$dev milestone <projet> <ms-id>` | Exécuter un Milestone isolé (`execution.md`) | `MS` |
| `$dev issue <ID>` | Traiter une issue (`issue.md`) | `DEV` |
| `$dev iteration <ID>` | Session interactive : Paul affine une fonction existante, demande après demande (`iteration.md`) | `DEV` |
| `$dev finaliser <ID>` | **Portée : une issue.** Préparer sa recette, fusionner si autorisé, la fermer dans Linear, préparer son bilan (`finalisation.md`) | inline |
| `$dev cadrage <sujet>` | **Cadrage complet avec Paul** : Linear, Obsidian, tableaux de référence, contrat de campagne (`cadrage.md`) | `CADRE` |
| `$dev cadrage-court <ID\|sujet>` | Créer ou modifier **une seule** issue Linear (itération, demande de composant), sans cadrage complet (`cadrage-court.md`) | inline |
| `$dev projet <nom>` | Créer ou raccorder un dépôt, vérifier son `PROJECT.md` jusqu'à `PRET_POUR_DEVELOPPEMENT` (`projet.md`) | inline |
| `$dev point [campagne…]` | **Le point des campagnes** en un rendu fixe : avancement, blocages et qui débloque, ce que Paul doit faire, temps restant en heures de travail des agents ; lecture seule, lancé depuis AIDE ou tout chat du workflow (`point.md`) | inline |
| `$dev digest [nom]` | Résumé des dernières 24 h : avancement, décisions prises seul, blocages | inline |
| `$dev prototype <sujet>` | Composer une page avec les vrais composants dans l'éditeur, exporter un `spec.json` v1 vérifié (`prototype.md`) | `PROTO` |
| `$dev test <projet>` | Recette ou tests ciblés (`test.md`) | inline ou `TEST` |
| `$dev nettoyeur` | Worktrees, branches closes, processus orphelins ; les chats relèvent de `$dev menage` (`nettoyeur.md`) | `RELAIS` |
| `$dev livrer <campagne> [--a-blanc]` | **Poste uniquement**, après un GO enregistré : plan figé (empreinte), répétition à blanc, arrêt à la première erreur, journal et messages dans le chat SUP (`livraison.md`) | `SUP` |
| `$dev menage` | Analyse des chats des deux hôtes, en lecture seule : à clôturer, archiver, renommer, ranger, rattacher, doublons, dormants, trop lourds (`menage.md`) | inline |
| `$dev menage appliquer surs|<numéros>|tout` | Applique les actions validées ; jamais de suppression, AIDE et campagnes en cours protégés (`menage.md`) | inline |
| `$dev aide [--recreer]` | Ouvrir le chat d'aiguillage, ou le recréer s'il manque ou n'est plus à jour (`aide.md`) | `AIDE` |
| `$dev archi` | Ouvrir le chat de l'architecte du workflow `🏛 ARCHI · workflow` (`archi.md`) | `ARCHI` |
| `$dev evolution <sujet>` | Démarrer une évolution du workflow dans `🏛 ARCHI` : analyse, fiche d'évolution, GO de Paul, implémentation sur les deux hôtes (`archi.md`) | `ARCHI` |
| `$dev cloture <campagne>` | **Portée : une campagne entière.** Bilan de campagne dans Obsidian, archivage des chats et registres, fermeture (`cloture.md`) | `BILAN` |
| `$dev pause <nom>` / `$dev reprendre <nom>` | Suspendre ou relancer une campagne | inline |
| `$dev etat [nom]` | Diagnostic machine, RAM, files d'attente, périmètre, passerelle poste | inline |
| `$dev etat chats` | Tableau : la dernière ligne d'état de chaque chat (§2.3 bis) | inline |
| `$dev poste [file\|installer\|retirer <ID> --motif <m>]` | Passerelle poste Windows : file des tests en attente, dernier passage du poste ; `installer` pose la tâche planifiée ; `retirer` sort une tâche de la file et réserve l'issue à Paul (`poste.md`) | inline |
| `$dev modele <tache> <criticite> <volumetrie>` | Interroger le routeur (`modeles.md`) | inline |

---

## 1 bis. Chats et sous-agents : qui fait quoi

**Les sous-agents font le travail, les chats servent à Paul.**

| | Chat | Sous-agent |
| :--- | :--- | :--- |
| Rôle | Point de lecture et de décision pour Paul | Unité d'exécution |
| Durée de vie | Celle de la campagne ou du cadrage | Une tâche, puis il rend son rapport |
| Contexte | Contrat, état, digest | Vierge : fiche + fichiers ciblés uniquement |
| Visible par Paul | Oui, nommé selon le §2 | Non : visible via son badge dans le chat parent |

Règles :

1. **Un chat par campagne** (`🟢 AUTO` / `🟠 SUP`) : c'est l'orchestrateur. Il délègue **chaque issue à un sous-agent `dev`** dans son propre worktree et sa propre branche. Il n'y a plus de chat `🔵 DEV` par défaut.
2. **Un chat `🔵 DEV` n'est ouvert que dans 2 cas** : une issue passe `⛔ BLOQUÉ` (Paul doit pouvoir la reprendre) ou Paul lance lui-même `$dev issue <ID>`. Le chat démarre alors de la fiche de reprise de l'issue.
3. **Sous-agents spécialisés**, appelés par l'agent `dev` ou par l'orchestrateur, chacun avec le modèle donné par le routeur :
   - `lecteur` (Haiku / Sonnet) : pré-lecture `large`, carte de dépôt ;
   - `revue` (Opus, **démarré à neuf** : son seul contexte est le diff, la fiche et les critères de l'issue) : relit le diff ;
   - `tests` (Haiku) : lance les contrôles et résume les échecs ;
   - `digest` (Haiku) : le résumé quotidien ;
   - `obsidian` (Sonnet ; Haiku pour les bilans courts) : verse les bilans dans le vault après une fusion confirmée (§5).
4. **Rapport de retour borné** : un sous-agent rend au plus 20 lignes (statut, SHA, preuves, décisions prises, suite). Jamais de log brut ni de fichier entier. C'est ce qui garde le contexte de l'orchestrateur léger, même sur une longue campagne.
5. **L'état vit sur disque, pas dans la mémoire du sous-agent** : chaque sous-agent écrit son avancement dans `.pilote/campagnes/<nom>.json` et committe sur sa branche. Si la session ou SSH tombe, `pilote.mjs contexte <campagne>` relance les sous-agents là où ils en étaient, sans en dupliquer aucun.
6. **Parallélisme** : le nombre de sous-agents `dev` actifs respecte les limites d'admission (§4). Les sous-agents `lecteur`, `revue` et `tests` légers n'entrent pas dans ce quota ; une suite de tests complète, si.
7. **Pas de sous-agent pour ce qui tient en une commande** : un lint ou un `git status` s'exécutent directement.

**Modèles disponibles en sous-agent** : la liste est lue dans `poste.local.json` (`modeles.sous_agents`). Le routeur ne propose jamais en sous-agent un modèle absent de cette liste. Aujourd'hui, Sonnet n'en fait pas partie : il ne sert que pour la **recette de Milestone**, dans un chat `🧪 TEST` lancé par `pilote.mjs` et rangé dans `04 Relais & maintenance`.

Si l'outil ne permet pas de lancer des sous-agents avec un modèle choisi, `pilote.mjs` revient au mode « un chat `🔵 DEV` par issue », sans rien changer d'autre.

## 2. Chats : savoir au premier regard à qui on parle

Trois repères fixes, générés par `pilote.mjs titre` et jamais saisis à la main.

**Création des chats de travail.** Tout chat de travail (`🔵 DEV`, `🔷 MS`, `🧪 TEST`, `🟣 CADRE`, `🎨 PROTO`, campagnes) est créé **uniquement** par `pilote.mjs` via l'app-server de l'hôte d'exécution, avec le réglage d'accès de `poste.local.json` (`execution` ; sur atelier : accès complet, approbations jamais), appliqué aussi à chaque reprise : `node <pilote> chat-travail <RÔLE> <projet> <objet> --modele <id du routeur> [--issue <ID>] [--campagne <nom>] [--cwd <dossier>] --consigne-fichier <f>` ; campagnes : `node <pilote> chat <campagne>`. Depuis le poste, la création est déléguée à `pilote.mjs` d'atelier par SSH. Jamais par l'outil de création de chat de l'application. L'agent range ensuite le chat dans le dossier rendu (`dossier`).

**Chats de travail sur le poste.** Aucun chat de travail interactif n'est créé sur le poste (`chat_local.actif: false`, option b retenue par Paul le 20/11/2026) : `chat-travail --hote local` et `--livraison` sont toujours refusés (`CHAT LOCAL INDISPONIBLE`). Une livraison passe uniquement par `$dev livrer <campagne>`, autorisé par `chat_local.option: "b"` (session `codex exec` en accès complet, `livraison.md`) ; sans cette option, refus `LIVRAISON LOCALE INDISPONIBLE`. Une campagne à livraison locale le signale dans son contexte et son digest : la livraison est préparée sur atelier puis exécutée par Paul depuis le poste après le GO. Seuls `❓ AIDE` et `🏛 ARCHI` vivent sur le poste, créés à la main à partir d'un bloc à coller s'ils manquent.

**Accès restreint.** Un chat de travail qui constate un accès plus restreint que celui de l'hôte ne demande **jamais** d'élévation : il exécute `node <pilote> acces-restreint <chat>`, termine son tour par « ⛔ ACCÈS RESTREINT — relance demandée à pilote.mjs », et le réveil (`pilote.mjs reveil`, vérification toutes les 10 min sur atelier ; un orchestrateur au repos n'est relancé que si l'état de sa campagne a changé, sinon une fois par heure, v2.6.5) ou `node <pilote> relancer-chat <chat>` le relance avec le bon réglage (3 relances au plus, puis circuit-breaker).

### 2.1 Titre du chat : rôle, projet, objet, état

Format : `<pastille> <RÔLE> · <projet> · <objet> · <état>`

Exceptions : le chat d'aiguillage s'appelle toujours `❓ AIDE · workflow` et celui de l'architecte `🏛 ARCHI · workflow`, sans projet ni suffixe d'état (`aide.md`, `archi.md`).

| Pastille | Rôle | Exemple de titre | Dossier |
| :---: | :--- | :--- | :--- |
| ❓ | `AIDE` : aiguillage | `❓ AIDE · workflow` | 00 Accueil |
| 🏛 | `ARCHI` : architecte du workflow | `🏛 ARCHI · workflow` | 00 Accueil |
| 🟢 | `AUTO` : campagne autonome | `🟢 AUTO · mon-api · refonte-auth · 42%` | 01 Campagnes |
| 🟠 | `SUP` : campagne supervisée | `🟠 SUP · deployeur · release-v3 · 10% · ⏸ GO` | 01 Campagnes |
| 🔷 | `MS` : milestone isolé | `🔷 MS · mon-api · auth-core · 3/7` | 01 Campagnes |
| 🔵 | `DEV` : une issue | `🔵 DEV · mon-api · #101 login-token` | 02 Développement / `<projet>` |
| 🟣 | `CADRE` : cadrage | `🟣 CADRE · mon-api · multi-tenant` | 03 Cadrage & prototypes |
| 🎨 | `PROTO` : prototype UI | `🎨 PROTO · mon-web · tableau-bord v2` | 03 Cadrage & prototypes |
| 🧪 | `TEST` : recette de Milestone (Sonnet) | `🧪 TEST · mon-api · ms auth-core` | 04 Relais & maintenance |
| ⚙️ | `RELAIS` : maintenance | `⚙️ RELAIS · nettoyage · 2026-11-19` | 04 Relais & maintenance |
| 📘 | `BILAN` : clôture | `📘 BILAN · refonte-auth` | 04 Relais & maintenance |

**Suffixes d'état**, à droite et un seul à la fois :

- `⏸ GO` : le chat attend Paul, **uniquement pour l'un des 3 motifs d'interruption** ;
- `⛔ BLOQUÉ` : circuit-breaker déclenché ou timeout ;
- `✅` : clos avec preuve.

Ces suffixes, avec les statuts d'issue (`en_attente`, `preflight`, `en_cours`, `revue`, `recette`, `fusionnee`, `close`, `bloquee`, `en_pause`), forment une **liste fermée** définie dans `references/etats.md`. `pilote.mjs` refuse tout autre statut, ce qui les rend lisibles par un outil de supervision.

Le pourcentage des campagnes est tenu à jour par `pilote.mjs`. Règle de lecture : **la pastille dit qui parle, le suffixe dit si Paul doit agir.**

### 2.2 Carte d'identité : premier message de chaque chat

```
▣ 🔵 DEV #101 — mon-api
Mandat     : <1 phrase>
Campagne   : refonte-auth (AUTO)  ·  Milestone : auth-core
Branche    : codex/issue-DEV-101 → codex/ms-auth-core
Worktree   : <chemin>   ·   Hôte : ☁ atelier
Modèle     : claude-opus-5-5 (dev · standard · compact)
Essais     : 0/3
```

### 2.3 Badge : première ligne de chaque message d'agent

Dans le chat de campagne, chaque rapport de sous-agent est précédé de son badge, ce qui permet de savoir d'un coup d'œil quel sous-agent parle.

`▸ 🔵 DEV #101 · mon-api · ☁ atelier · Opus 5.5 · essai 1/3`

Hôtes : `☁ atelier`, `💻 local`. Le badge tient sur une ligne et ne coûte que quelques tokens.

### 2.3 bis Ligne d'état : dernière ligne de chaque message final

Tout message final d'un chat du workflow (campagnes, DEV, CADRE, PROTO, TEST, RELAIS, BILAN, AIDE, ARCHI, sessions de la passerelle poste) se termine par une ligne seule :

`<icône> <ÉTAT> · <ce que fait ou attend le chat, en une phrase> · Toi : <rien | action exacte>`

| Icône | État | Sens |
| :---: | :--- | :--- |
| ▶ | `EN COURS` | le chat ou ses sous-agents travaillent ; reprise automatique prévue |
| ⏳ | `EN ATTENTE` | poste Windows, créneau, dépendance, réveil |
| ⏸ | `À TOI` | un des 3 motifs d'interruption |
| ⛔ | `BLOQUÉ` | circuit-breaker ou environnement |
| ✅ | `TERMINÉ` | objet clos |

Exemple : `⏳ EN ATTENTE · retour du poste Windows attendu pour DEV-1038 · Toi : rien`. Pour une campagne, la ligne est calculée par `node <pilote> ligne-etat <campagne>` et recopiée telle quelle. Le réveil lit la ligne de chaque chat d'atelier : statut du registre (▶ ⏳ → `actif`, ⏸ → `attente_go`, ⛔ → `bloque`, ✅ → `clos`) et suffixe du titre des chats de travail. Une ligne absente est signalée par `$dev menage` (`sans_ligne`). `$dev etat chats` affiche la dernière ligne de chaque chat.

### 2.4 Hygiène des chats

* Un chat = un rôle = un objet. Ne jamais traiter deux issues dans le même chat.
* Une question sur le workflow va dans `❓ AIDE` (`$dev aide`), jamais dans le chat d'une campagne. Une demande d'évolution du workflow lui-même va dans `🏛 ARCHI` (`$dev evolution <sujet>`) ; AIDE l'y oriente.
* Un chat clos reçoit `✅` puis part dans `99 Archives` après 7 jours (`$dev menage`).
* Réponses d'agent au **format compact** par défaut : badge, puis 3 à 6 lignes (fait, preuve, suite). Pas de récit, pas de répétition du contexte.

### 2.5 Registre des chats

`.pilote/chats.json`, sur chaque hôte, tenu par `pilote.mjs` : `chat_id`, `titre`, `role`, `objet`, `dossier`, `modele`, `hote`, `cree_le`, `derniere_activite`, `lien` (campagne, issue ou sujet), `statut` (`actif`, `attente_go`, `bloque`, `clos`, `archive`, `a_creer`), `taille_contexte` estimée, et `historique` des actions. Tout chat créé par le lanceur, une campagne ou `$dev aide` y est inscrit ; `$dev menage` rattache les chats créés à la main.

**Archivage automatique (v2.6.2).** Le réveil d'atelier archive dans `99 Archives` tout chat de travail terminé (ligne `✅ TERMINÉ`, statut `clos`) depuis `chats.archive_apres_heures` (1 h), et le chat d'une campagne close dès que son `📘 BILAN` est terminé. Jamais archivés : `❓ AIDE`, `🏛 ARCHI`, les campagnes en cours, un chat en plein tour, le chat d'une issue non close. `archive_le` est inscrit au registre ; le digest et `$dev point` listent les chats archivés depuis 24 h. Rien n'est supprimé ; `$dev menage` rattrape un archivage manqué.

---

## 2 ter. Lanceur : n’importe quel chat lance une commande $dev

Un chat n’exécute une commande `$dev` que si son modèle est celui du routeur pour cette commande. Sinon, il délègue par `node <pilote> lancer <commande> … --depuis-modele <son modèle> --fiche-stdin` : chat dédié pour une commande à type de chat, sous-agent pour une commande inline (résultat en 5 lignes). Le lanceur ne transmet qu’une fiche de 15 lignes au plus, rouvre un chat existant plutôt que d’en créer un doublon, et répond en une ligne « → ouvert : … ». Il ne cadre pas et ne code pas. Détail : `references/lanceur.md`.

**❓ AIDE, porte d’entrée.** Le chat `❓ AIDE · workflow` aiguille les questions et lance toute commande `$dev` selon cette règle, sans jamais faire le travail lui-même. Seule exception (v2.6) : `$dev point`, qui n'écrit rien, qu'AIDE exécute lui-même et recopie tel quel (`point.md`).

**🏛 ARCHI délègue toujours (v2.5.4).** ARCHI lance avec `--depuis-role ARCHI` : le lanceur ne lui répond jamais `executer_ici`, même quand son modèle est celui du routeur ; il conçoit, il n'exécute ni cadrage, ni issue, ni campagne.

**🏛 ARCHI, chat fixe.** `$dev archi` et `$dev evolution <sujet>` ne passent pas par le routeur : le modèle est `modeles.archi` (`poste.local.json`), le chat vit sur le poste et il est unique. Le lanceur rouvre le chat enregistré et rend le message à y poster ; s'il manque, il rend le bloc à coller (`archi.md`). Dans ARCHI, `$dev evolution` s'exécute sur place.

---

## 3. Campagnes : composition, stockage, modes

### 3 bis. Contrat de campagne : le cadrage de Paul

**Linear reste la source de vérité.** Le cadrage conserve son fonctionnement avec Linear (création et mise à jour des Milestones, issues, relations et champs, selon `references/cadrage.md`). Les critères d'acceptation sont écrits **dans la description de chaque issue Linear**. Le contrat de campagne n'ajoute que ce que Linear ne porte pas : règles de décision, lignes rouges, questions tranchées. Un résumé du contrat est placé dans la description du projet ou du Milestone Linear, avec un lien vers le fichier.

Le contrat est produit par `$dev cadrage` (cerveau : Opus 5.5) et stocké dans `.pilote/campagnes/<nom>.contrat.md`. Il fait **2 pages maximum** :

1. **Mandat et résultat attendu** : ce qui doit être vrai à la fin, vérifiable.
2. **Périmètre** : ce qui est inclus et, surtout, ce qui est **exclu**.
3. **Critères d'acceptation** : **lien vers les issues Linear uniquement**. Les critères vivent dans la description de chaque issue, jamais en double dans le contrat.
4. **Règles de décision** : les arbitrages que l'agent peut trancher seul, avec leur option par défaut. Exemples : « bibliothèque déjà présente dans le dépôt plutôt qu'une nouvelle », « en cas de doute UI, suivre le prototype validé ».
5. **Lignes rouges** : ce qui exige un GO (par défaut, les 3 motifs du principe directeur, plus d'éventuels ajouts).
6. **Questions tranchées** : toutes les ambiguïtés repérées dans Linear, résolues pendant la session de cadrage.

Déroulé de la session de cadrage :

1. L'agent reprend la discussion et le vault Obsidian, réinjecte les acquis dans Obsidian, puis complète les **trois matrices canoniques** du projet : **Données**, **Technique** et **Environnements** (chemins dans le vault : `references/cadrage.md` §4). Les contrats producteur–consommateur, la couverture des données legacy par l'API centrale et les invariants de sécurité par surface en sont des sections, pas des tableaux séparés.
2. Il propose les Milestones et les issues, puis lit l'existant Linear et repère les trous : critères absents, ambiguïtés, dépendances implicites.
3. Il **regroupe toutes ses questions en un seul lot**, avec une réponse proposée pour chacune. Paul valide, corrige ou complète.
4. Il écrit le résultat dans Linear (Milestones, issues, critères, relations), puis fige le contrat.

**Définition de « prêt »** : une issue n'entre dans une campagne que si elle a des critères d'acceptation. Sinon, le cadrage les rédige et Paul les valide dans le même lot.

### Cycle de vie

1. **`composer`** : crée ou met à jour `.pilote/campagnes/<nom>.json` avec `"statut": "brouillon"`. Développe chaque `MS-XX` en ses issues ; chaque `DEV-XX` isolé devient un `issue_standalone`. Pose le label Linear `campagne:<nom>`. Aucun agent n'est lancé.
2. **`lancer`** : refuse de démarrer sans contrat validé. Resynchronise Linear (une issue ajoutée depuis le cadrage et non couverte par le contrat est mise de côté et signalée dans le digest), passe la campagne `"en_cours"`, ouvre le chat de campagne et admet les premières issues éligibles.

### Schéma (`.pilote/campagnes/<nom>.json`)

```json
{
  "id": "refonte-auth",
  "projet": "mon-api",
  "mode": "auto",
  "statut": "brouillon",
  "mandat": "Refondre le flux d'authentification et migrer les tokens",
  "hote_execution": "atelier",
  "hote_livraison": "atelier",
  "items": [
    {
      "type": "milestone",
      "linear_id": "MS-12",
      "slug": "auth-core",
      "branche_integration": "codex/ms-auth-core",
      "sha_depart": "<sha validé>",
      "statut": "en_attente",
      "issues": [
        {
          "linear_id": "DEV-101",
          "statut": "en_attente",
          "criticite": "standard",
          "branche": "codex/issue-DEV-101",
          "sha_valide": null,
          "sha_reprise": null,
          "branche_reprise": null,
          "attempts": 0,
          "modele_courant": null,
          "blocked_by": []
        }
      ]
    },
    {
      "type": "issue_standalone",
      "linear_id": "DEV-115",
      "statut": "en_attente",
      "criticite": "leger",
      "branche": "codex/issue-DEV-115",
      "sha_valide": null,
      "attempts": 0,
      "modele_courant": null,
      "blocked_by": []
    }
  ]
}
```

Pour une campagne de déploiement (ex. `deployeur`) : `"mode": "supervise"`, `"hote_execution": "atelier"`, `"hote_livraison": "local"`.

### Profils

* **`AUTO`** (par défaut) : exécution continue sur la base du contrat, nuit et week-end compris : issues, fusions dans les branches de Milestone, recettes, PR finales. La campagne ne s'arrête que pour les 3 motifs d'interruption.
* **`SUP`** : identique à `AUTO`, avec **un seul point d'arrêt supplémentaire, juste avant la livraison**. Pas d'arrêt avant chaque fusion d'issue. L'agent prépare tout jusqu'au bout (PR finale, recette verte, paquet de livraison, procédure de retour arrière), passe le titre en `⏸ GO` et attend Paul. Réservé aux projets qui déploient sur des serveurs (ex. `deployeur`).
* **Fusion de la PR finale vers `main`** : automatique en `AUTO` si la recette du Milestone est verte, la revue favorable **et `main_deploie: false`** pour ce projet. Si `main` déploie, la fusion est une action irréversible : arrêt `⏸ GO`. Si la recette ou la revue échoue, le Milestone est mis de côté et signalé dans le digest.

---

## 4. Parallélisme et ressources

1. **Dépendances** : une issue dont un `blocked_by` n'est pas clos reste en attente.
2. **Conflits** : deux issues qui touchent les mêmes fichiers critiques passent en séquentiel.
3. **Admission** (lue dans `poste.local.json` de l'hôte d'exécution, à chaque admission) : sur atelier, 15 développements actifs au maximum par campagne et 4 charges lourdes par campagne, 6 sur l'hôte (suite de tests complète, migration SQL, build complet, Docker), chacune seulement si 6 Gio restent disponibles ; sur le poste, 4 développements et 1 charge lourde. Le message de reprise automatique (et du digest) et `pilote.mjs contexte` donnent ces limites en clair : elles priment sur la consigne initiale d'un orchestrateur et sur toute décision antérieure de son journal. Une issue qui attend le poste Windows (`poste: en_file` ou `en_cours`) ne compte pas dans ces limites. **Garde CPU** (v2.5.4) : `pilote.mjs` diffère toute nouvelle admission tant que l'attente CPU moyenne sur 60 s dépasse `admission.garde_cpu_pct` (40 %) ; une issue déjà active n'est pas concernée. Les agents en attente d'un créneau entrent dans la file de `pilote.mjs` sans demander de nouveau GO.

---

## 5. Cycle de vie d'une issue

1. **Isolation** : 1 issue = 1 sous-agent `dev` = 1 worktree = 1 branche `codex/issue-<id>` = 1 PR. Le chat `🔵 DEV` n'existe qu'en cas de blocage ou de lancement manuel (§1 bis). La PR cible `codex/ms-<slug>`, ou `main` pour un `issue_standalone`.
2. **Préflight outillé** (`pilote.mjs ouvrir <ID>`), avant de toucher au code :
   - worktree propre ;
   - branche distante créée ;
   - contrats hors Git copiés dans le worktree (`AGENTS.md`, `PROJECT.md` non versionnés : `worktree-local.md`) ;
   - environnement prêt ;
   - compte de recette réservé (point 3).
   
   En cas d'échec : statut `bloquee`, message `PRÉFLIGHT TECHNIQUE BLOQUÉ`, sans compter d'essai.
3. **Comptes de recette** (`comptes-recette.md`) :
   - **Source** : une réserve numérotée (`<COMPTE>_1`, `<COMPTE>_2`, …) dans le `.env.local` du checkout principal de chaque projet, **sur chaque hôte** qui exécute des recettes. Le registre des réservations est dans `.pilote/comptes.json` ; il ne contient que des numéros, jamais d'identifiants.
   - **Attribution** : chaque issue qui en a besoin reçoit un compte **exclusif**, copié dans le `.env.local` de son worktree, puis rendu à la clôture avec un passage de relais tracé. Deux agents n'utilisent jamais le même compte en même temps.
   - **Réserve fournie par Paul** : pour un projet sans réserve sur aucun hôte (ex. une nouvelle application), Paul fournit les comptes sandbox, placés directement dans le `.env.local` du checkout principal de l'hôte d'exécution.
   - **Reprise d'une issue interrompue** : si `sha_reprise` est renseigné, le sous-agent repart du SHA validé et examine le `WIP` de `branche_reprise` avant de coder.
   - **Réserve vide ou absente sur l'hôte** : l'issue n'est pas admise. Le cadrage le détecte en amont et le signale dans le lot de questions, pour éviter un blocage au préflight.
4. **Plan, puis exécution** : pour les issues `standard` et `sensible`, Opus rédige une **fiche d'exécution** de 1 500 tokens maximum (fichiers, étapes, critères d'acceptation, commandes de test), puis l'applique dans la même session. La revue est faite par un sous-agent Opus démarré à neuf (diff, fiche et critères uniquement), les tests par un sous-agent Haiku. Pas de fiche pour les issues `leger` : Haiku les traite de bout en bout.
5. **Contrôles rapides** par issue : lint, typecheck et tests unitaires ciblés sur les fichiers modifiés.
6. **Recette développeur** (`recette-developpeur.md`) : si l'issue Linear porte `Statut recette : REQUISE`, l'agent fait la recette lui-même, avec les accès autorisés et les outils exclus indiqués dans l'issue. Une recette qu'atelier ne peut pas faire (Windows : wkhtmltopdf, IIS Express, PowerShell) part au poste par la passerelle : `node <pilote> poste deposer <campagne> <ID> --fiche <f>` ; le retour arrive dans `retours_poste` (`poste.md`).
7. **Recette groupée** par Milestone : suite complète, non-régression, revue globale *sur le diff* et bilan, **une seule fois** sur le SHA final de `codex/ms-<slug>`.
8. **Finalisation et Obsidian** (`finalisation.md`, `ingestion.md`) : à la fusion dans `codex/ms-<slug>`, le bilan de l'issue est seulement **préparé** (`.pilote/bilans/<ID>.md`). Le sous-agent `obsidian` ne le verse dans le vault qu'**après la fusion vers `main`** : pour une issue de Milestone, après la recette verte du Milestone et la fusion de sa PR finale. Un travail qui n'atteint jamais `main` n'entre donc jamais dans le vault. `vault.mjs` resynchronise le vault avant chaque lecture ou écriture. L'issue Linear est fermée en même temps, avec son bilan.
9. **UI** : pour toute surface raccordée au Design System, le parcours est `ui-cadrage` (thème, paquet et version adoptés), puis `🎨 PROTO` validé (`spec.json` v1 vérifié par `prototype-check.mjs`), puis implémentation (`ui-realisation`), puis contrôle du résultat livré sur le SHA exact (`ui-resultat`).

---

## 6. Modèles : routage économe

Ne jamais choisir un modèle à la main. À chaque démarrage d'issue, changement de phase ou sous-agent :
`node <pilote> modele <tache> <criticite> <volumetrie> [campagne]`

Le socle est **100 % Anthropic** : **Opus 5.5** (cadrage et développement), **Sonnet 5.5** (recette de Milestone dans un chat `🧪 TEST`, implémentation visuelle hors sous-agent ; il n'est pas disponible en sous-agent), **Haiku 5.5** (logistique, tâches légères et pré-lecture), **Fable 5.1** (modèle nominal des choix visuels, et recours à l'essai 3). Fable 5.2 est réservé à l'usage manuel de Paul et n'est jamais attribué automatiquement. Les modèles OpenAI ne servent que de fallback en cas de 429 et de second regard à l'escalade. **Proportionnalité** : le modèle suit la taille de la tâche, pas l'importance du projet. Modifier un `.env` ou une config reste sur Haiku, même dans une campagne sensible. Aucun suivi des coûts. Le détail (rôles, matrice, pré-lecture) est dans `references/modeles.md`.

**Échelle d'escalade**, alignée sur le circuit-breaker :

| Essai | Modèle |
| :--- | :--- |
| 1 | Modèle nominal |
| 2 | `leger` : Sonnet. `standard` / `sensible` (déjà sur Opus) : Opus avec une nouvelle approche et un contexte enrichi, ou Astra en second regard sur un bug subtil |
| 3 | `leger` : Opus. `standard` / `sensible` : Fable (architecture, si autorisé) ou Astra (bug / tests) |
| Après 3 échecs | `⛔ BLOQUÉ`, escalade à Paul (`blocages.md`) |

Le détail fait foi dans `references/modeles.md` §5.

Dès que le correctif est validé, **redescendre au niveau nominal**.

**Modèle obligatoire** : aucun sous-agent ni chat n'est lancé sans modèle explicitement fourni par le routeur. `pilote.mjs` refuse le lancement plutôt que d'hériter du modèle de la session courante.

**Fallback fournisseur** : en cas de HTTP 429 ou de limite d'usage, `pilote.mjs refus`, puis bascule sur le modèle alternatif. Aucune surveillance préventive des quotas.

---

## 7. Garde-fous

* **Droits d'écriture dans Linear** : seuls `$dev cadrage` et `$dev cadrage-court` écrivent le **contenu** d'une issue (titre, description, critères d'acceptation, découpage). Les autres étapes n'écrivent que l'état, des commentaires et le bilan. Un agent ne réécrit jamais les critères de l'issue qu'il traite : s'il les juge faux, il le signale dans le digest, rubrique « À confirmer ».
* **Journal de décisions** (`.pilote/campagnes/<nom>.decisions.md`) : chaque choix fait sans Paul y est consigné en une ligne (issue, décision, règle appliquée, comment revenir en arrière). Paul le parcourt dans le digest et peut annuler une décision a posteriori. Quand une règle commune change après un GO de Paul (limite d'admission, par exemple), `🏛 ARCHI` inscrit une ligne `GLOBAL · Paul (…) : …` dans le journal de chaque campagne en cours (`node <pilote> decision-globale <texte>`, sur l'hôte d'exécution).
* **Qui débloque (v2.6)** : quand un orchestrateur arrête une issue (`bloquee`, ou `revue`/`recette` qui attend autre chose que son travail), il le dit : `pilote.mjs statut … --attend paul|agents|poste|env --quoi "<cause ; pour Paul : action exacte et réponse proposée>"`, ou `pilote.mjs arret …` sans changer le statut. `$dev point` s'en sert ; une issue arrêtée sans ce champ y apparaît « à qualifier » (`point.md`).
* **Cadreur avant blocage (v2.6.3)** : une campagne ne bloque une issue qu'après un cadreur de déblocage (`pilote.mjs lancer cadrage deblocage-<ID> --depuis-role AUTO …`), qui décide par défaut sous mandat de Paul ou publie un correctif ; seule une conclusion « réservé à Paul » (irréversible, hors mandat) bloque l'issue, avec la réponse proposée (`blocages.md`).
* **Questions non bloquantes** : une question qui ne relève pas des 3 motifs n'arrête jamais une issue. L'agent prend l'option par défaut, la journalise et la place dans le digest, rubrique « À confirmer ».
* **Digest quotidien** : un message par campagne et par jour dans son chat, généré par Haiku, 15 lignes maximum (avancement, issues closes, décisions prises seul, `⛔`). Pas d'autre notification hors des 3 motifs.

* **Circuit-breaker** : `attempts` limité à 3 par issue, toutes erreurs confondues. Au 3ᵉ échec : arrêt, état exact documenté, titre en `⛔ BLOQUÉ`.
* **Timeout environnement** : réseau, SSH, Docker ou permissions bloqués plus de 5 minutes → l'issue est mise de côté (`⛔`) et signalée dans le digest ; les issues indépendantes continuent. Paul n'est notifié immédiatement que si **toute** la campagne est à l'arrêt.
* **Preuves** : commande exécutée + code de sortie ou extrait de log pertinent. Une absence d'erreur n'est pas une preuve.
* **Secrets** : uniquement dans les environnements autorisés. Jamais dans les messages, registres, preuves ou Linear.

---

## 8. Topologie hybride (PC local / VPS `atelier`)

* **Par défaut** : développement, builds et recettes sur `atelier`. Le poste local pilote et vérifie.
* **Frontière de déploiement** : tout déploiement ou toute administration de serveur cible (sandbox, préproduction, production) se fait **exclusivement depuis le poste local** (`"deploiement_serveurs": true`). Sur `atelier`, `pilote.mjs` refuse ces commandes. `atelier` développe, teste, construit et pousse des branches Git.
* **Continuité SSH** : une coupure ne lance jamais d'agent concurrent. À la reconnexion : `node <pilote> contexte <campagne>`.
* **Spécificités OS** (`tty: false`, `windowsHide`, maintien éveillé, chemins) : lues exclusivement dans `poste.local.json`.
* **Passerelle poste Windows** (`poste.md`) : la file des tests Windows vit sur atelier ; la tâche planifiée `pilote-poste-passerelle` du poste la relève à l'ouverture de session, au déverrouillage et toutes les 10 minutes, une tâche à la fois, en priorité basse, par une session `codex exec` en accès complet.
* **Recette sur appareil** (Android / iOS) : quand les outils de l'app manquent sur la machine, suivre `discussions-distance.md` (ouvrir une discussion, envoyer un aperçu, recetter sur l'appareil).
