# Référentiel et routage des modèles (`pilote.mjs modele`) — v2.2

Principe : **un socle 100 % Anthropic. Opus 5.5 cadre et code, Sonnet 5.5 relit et teste, Haiku 5.5 fait la logistique.**
Les modèles OpenAI servent de **fallback** (HTTP 429, limite d'usage) et de **second regard** à l'escalade, jamais de premier choix.
Les modèles coûteux ne voient jamais de gros volumes bruts : ils reçoivent des résumés et des diffs.

Commande : `node <pilote> modele <tache> <criticite> <volumetrie> [campagne]`

## 0. Règle de proportionnalité (pas de suivi des coûts)

On ne surveille pas les coûts : pas de budget en dollars, pas d'alerte, pas de pause pour dépassement. L'économie vient d'**une seule règle** : **le modèle est proportionné à la tâche, pas à l'importance du projet ni de la campagne.**

- **Une tâche triviale est toujours `leger`, donc Haiku**, même dans une campagne `sensible`. Exemples : modifier une variable de `.env` ou une config, renommer, changer une version de dépendance, corriger une typo, mettre à jour une doc ou un changelog, créer un fichier à partir d'un modèle existant.
- **La criticité est fixée par tâche au cadrage**, écrite dans l'issue Linear. En l'absence d'indication, le routeur part sur `leger` si le diff attendu tient en quelques lignes sans logique, sinon sur `standard`.
- **À l'intérieur d'une issue déjà en cours sur Opus**, une micro-modification (une ligne de `.env`) reste faite par Opus dans sa session. La déléguer coûterait plus cher que la faire, car le contexte est déjà chargé. La règle vise les tâches qui ne sont **que** ça.
- **On ne monte de modèle que sur échec réel** (§5), jamais par précaution.

---

## 1. Rôles des 8 modèles

Tarifs par million de tokens (entrée / sortie / lecture de cache).

### Socle Anthropic (primaires)

| Rôle | Modèle (ID API) | Tarif | Mission | Interdits |
| :--- | :--- | :--- | :--- | :--- |
| 🧠 **Cerveau et dev** | Claude Opus 5.5 `claude-opus-5-5` | 4 / 20 (0,20) | Cadrage et contrats de campagne, **développement `standard` et `sensible`** (plan et code dans la même session), revue finale de Milestone, déblocage, bilans | Boilerplate, lecture brute de dépôt, tâches `leger` |
| 👁 **Contrôle** | Claude Sonnet 5.5 `claude-sonnet-5-5` | 2 / 10 (0,10) | Revues courantes, tests, visuel, fallback d'Opus en dev ; lecteur au-delà de 100k (fenêtre 1M, sans palier) | — |
| 🔧 **Ouvrier** | Claude Haiku 5.5 `claude-haiku-5-5` | 0,10 / 0,50 (0,01) ; **×5 au-delà de 100k** | Dev léger, pilotage, titres et badges de chats, digest, compression de logs, doc ; **lecteur `large` jusqu'à 100k** | Toute entrée > 100k |
| 🎨 **Œil** et 🆘 **Recours** | Claude Fable 5.1 `claude-fable-5-1` | 10 / 50 (0,25) | **Choix visuels** (`choix-visuel`, quel que soit le niveau) ; essai 3 sur verrou d'architecture ou raisonnement long, **si `fable_autorise`** | Implémentation visuelle, tout autre usage nominal |
| 👤 **Réservé à Paul** | Claude Fable 5.2 `claude-fable-5-2` | à vérifier | Utilisé seulement par Paul, à la main | **Jamais routé** : `pilote.mjs` refuse de l'attribuer à un agent ou sous-agent |

### Relais OpenAI (fallback et second regard)

| Rôle | Modèle (ID API) | Tarif | Remplace | Usage propre |
| :--- | :--- | :--- | :--- | :--- |
| Fallback du contrôle | GPT-6.2 Sol `gpt-6.2-sol` | 2 / 10 (0,10) | Sonnet | — |
| Fallback de l'ouvrier | GPT-6 Luna `gpt-6-luna` | 0,10 / 0,50 (0,01) | Haiku | Ouvrier quand l'entrée dépasse 100k et qu'un résumé simple suffit (pas de palier à 100k) |
| Fallback du lecteur | GPT-6.1 Terra `gpt-6.1-terra` | 1 / 5 (0,05) ; palier > 272k | Haiku ou Sonnet en lecture | Computer-use, si Sonnet n'est pas disponible |
| 🔬 Second regard | GPT-6.2 Astra `gpt-6.2-astra` | 8 / 40 (0,40) ; palier > 272k | Opus à l'escalade | Bug subtil ou régression qu'Opus n'a pas trouvé : un autre fournisseur a d'autres angles morts |

> Pourquoi Haiku et non Luna comme ouvrier : même prix et meilleure précision sur les instructions courtes. La seule contrainte est le seuil de 100k, géré par le routeur.

**Passerelle poste (v2.5)** : la session `codex exec` d'une tâche Windows prend le modèle du routeur `tests <criticité>` (Sonnet en `standard`, Opus en `sensible`) ; ce n'est pas un sous-agent, Sonnet y est donc disponible. Escalade normale (§5) ; un échec d'environnement ne compte pas.

**Modèles fixes, hors routeur** : `modeles.aide` (`gpt-6-luna`) pour `❓ AIDE`, `modeles.archi` (`claude-opus-5-5`) pour `🏛 ARCHI`. Ce sont des chats permanents à rôle unique ; les tâches et sous-agents qu'ils lancent restent routés normalement.

---

## 1 bis. Disponibilité en sous-agent

Tous les modèles ne peuvent pas être lancés en sous-agent. La liste fait foi dans `poste.local.json` (`modeles.sous_agents`). Aujourd'hui sur atelier : Haiku, Sonnet, Opus, Sol et Astra (v2.13, vérifiés par un vrai `spawn_agent` le 22/11/2026). Cette liste doit refléter celle d'opencodex (`ocx agent subagents`, 5 modèles au plus) : un modèle absent d'opencodex est refusé par `spawn_agent`, quoi qu'en dise `poste.local.json`. Passer toujours à `spawn_agent` le champ `catalogue` (`anthropic/claude-sonnet-5-5`), jamais le nom court.

Quand la matrice désigne un modèle **absent de cette liste** pour une tâche exécutée en sous-agent, le routeur applique ces substitutions :

| Tâche (en sous-agent) | Matrice | Substitut |
| :--- | :--- | :--- |
| `revue` `standard` | Sonnet | **Opus démarré à neuf** (diff + fiche + critères uniquement) : regard indépendant de l'auteur du code |
| `tests` `standard` | Sonnet | **Haiku** : lancer les tests et résumer les échecs est une tâche légère |
| `visuel`, `prototype`, lecteur > 100k | Sonnet | Opus |
| Recette de Milestone | Sonnet | **Pas de substitution** : chat `🧪 TEST` Sonnet lancé par `pilote.mjs` |

## 2. Matrice de routage (`compact`, < 15k tokens)

Format : `primaire / fallback (429)`.

| Tâche | `leger` | `standard` | `sensible` |
| :--- | :--- | :--- | :--- |
| `dev` | Haiku / Luna | **Opus** / Sonnet | **Opus** / Sonnet |
| `revue` | Haiku / Luna | **Sonnet** / Sol | **Opus** / Astra |
| `tests` | Haiku / Luna | **Sonnet** / Sol | **Opus** / Astra |
| `cadrage` | Sonnet / Sol | **Opus** / Sonnet | **Opus** / Sonnet |
| `visuel` (implémentation, comparaison avant/après) | Sonnet / Terra | Sonnet / Terra | **Opus** / Astra |
| `choix-visuel` (trancher entre options, valider un rendu) | **Fable 5.1** / Opus | **Fable 5.1** / Opus | **Fable 5.1** / Opus |
| `prototype` (éditeur, `spec.json`) | Sonnet / Sol | Sonnet / Sol | **Opus** / Sonnet |
| `ingestion` (sous-agent `obsidian`) | Haiku / Luna | Sonnet / Sol | **Opus** / Sonnet |
| `finalisation` | Haiku / Luna | Haiku / Sonnet | Sonnet / Opus |
| `pilotage` / `automatisation` | Haiku / Luna | Haiku / Sonnet | **Opus** / Sonnet |

Le développement `standard` passe sur Opus : il code mieux du premier coup, ce qui évite des allers-retours et des escalades. En sous-agent, la revue passe sur un Opus démarré à neuf (regard indépendant de l'auteur) et les tests sur Haiku (§1 bis) ; Sonnet reste réservé à la recette de Milestone, dans un chat `🧪 TEST`.

`pilotage standard` reste sur Haiku : orchestrer, c'est appliquer des règles, pas réfléchir. Le pilote ne consulte Opus que pour un arbitrage `sensible`.

## 3. Volumétrie `large` (> 15k tokens) : pré-lecture, puis matrice compacte

En `large`, le routeur renvoie **deux modèles** :

```json
{ "lecteur": "claude-haiku-5-5", "executant": "<modèle de la matrice compact>", "budget_resume_tokens": 8000 }
```

1. **Le lecteur** produit un **résumé ciblé de 8k tokens maximum** (fichiers concernés, extraits utiles, erreurs, hypothèses). Il est choisi selon la taille de l'entrée :
   - **≤ 100k → Haiku** (0,10 $/MTok, quasi gratuit) ;
   - **> 100k → Sonnet** (fenêtre 1M, sans palier) ;
   - fallback : Terra (en dessous de 272k), puis Luna.
2. **L'exécutant** travaille sur ce résumé avec la matrice `compact` du §2.

**Exceptions**, avec accès direct au volume :

- `cadrage sensible large` : Opus lit directement (fenêtre 1M), car l'architecture demande une vue complète ;
- `visuel large` : Sonnet exécute lui-même (hors sous-agent ; en sous-agent : Opus) ;
- `choix-visuel` : Fable 5.1 reçoit le résumé et les captures, jamais le dépôt brut.

**Garde-fous de volume**, appliqués par `pilote.mjs` avant l'appel :

- entrée > 100k → Haiku interdit ;
- entrée > 272k → modèles OpenAI interdits, sauf découpage préalable.

---

## 4. Leviers d'économie de tokens (obligatoires)

1. **Plan et code dans la même session** : en dev, Opus rédige la fiche d'exécution (1 500 tokens maximum) puis l'applique dans la **même session**. Le cache reste chaud et il n'y a pas de passation entre modèles. Opus ne relit pas le dépôt : il part de la carte et des fichiers ciblés.
2. **Carte de dépôt** `.pilote/carte/<projet>.md` : 2k tokens maximum. Générée par Haiku (ou Sonnet si le dépôt dépasse 100k) à la composition, rafraîchie à chaque Milestone.
3. **Logs compressés** : aucun log brut de plus de 2k tokens n'est envoyé à Sonnet ou Opus. Haiku en extrait la première erreur, la stack et les tests en échec.
4. **Revue sur diff** : la revue porte sur `git diff` + fiche d'exécution, pas sur les fichiers entiers.
5. **Cache** : préfixe stable par issue (`SKILL.md` + `PROJECT.md` + carte + fiche). Pas de changement de modèle à l'intérieur d'une phase, sauf escalade ou 429. Un socle mono-fournisseur garde la même structure de prompt et de cache d'une phase à l'autre.
6. **Sorties courtes** : badge, puis 3 à 6 lignes par message d'agent. Le code va dans les fichiers.
7. **Recette lourde une seule fois** par Milestone, sur le SHA final.
8. **Pas de fiche pour les issues `leger`** : Haiku fait tout, de bout en bout.

---

## 5. Escalade et configuration

### Échelle (alignée sur le circuit-breaker, `attempts` ≤ 3)

| Essai | `leger` | `standard` | `sensible` |
| :--- | :--- | :--- | :--- |
| 1 | Haiku | Opus | Opus |
| 2 | Sonnet | Opus, nouvelle approche et contexte enrichi ; ou Astra en second regard (bug subtil) | Opus, nouvelle approche et contexte enrichi ; ou Astra en second regard (bug subtil, tests) |
| 3 | Opus | Fable* (architecture) ou Astra (bug) | Fable* ou Astra |
| Échec du 3ᵉ essai | `⛔ BLOQUÉ` → Paul | `⛔ BLOQUÉ` → Paul | `⛔ BLOQUÉ` → Paul |

\* Fable seulement si `fable_autorise: true` ; sinon, Astra.

**Désescalade** : dès que les tests ciblés passent, chaque rôle repart sur son modèle nominal (revue : Opus démarré à neuf en sous-agent ; tests et documentation : Haiku).

### Bloc `poste.local.json`

```json
"modeles": {
  "cerveau": "claude-opus-5-5",
  "dev": ["claude-opus-5-5", "claude-sonnet-5-5"],
  "controle": ["claude-sonnet-5-5", "gpt-6.2-sol"],
  "ouvrier": ["claude-haiku-5-5", "gpt-6-luna"],
  "lecteur": { "jusqu_a_100k": "claude-haiku-5-5", "au_dela": "claude-sonnet-5-5", "fallback": "gpt-6.1-terra" },
  "second_regard": "gpt-6.2-astra",
  "recours": "claude-fable-5-1",
  "oeil": "claude-fable-5-1",
  "reserve_paul": ["claude-fable-5-2"],
  "sous_agents": ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "gpt-6.2-sol", "gpt-6.2-astra"],
  "fable_autorise": false
},
"contexte": {
  "resume_large_max_tokens": 8000,
  "log_brut_max_tokens": 2000
}
```

`fable_autorise` ne concerne que l'escalade (essai 3). Les choix visuels utilisent Fable 5.1 dans tous les cas.

Changer de modèle cerveau, dev, contrôle ou œil se fait **à un seul endroit** : ce bloc. La matrice ne référence que des rôles.

## v2.7 — Sonnet en criticité standard

Décision de Paul du 21/11/2026 (mesure : 746 M tokens d'entrée Opus en 24 h sur atelier) : `dev` `standard` passe sur
**Sonnet 5.5** (fallback Opus), et la revue `standard` en sous-agent reste sur Sonnet démarré à neuf, sans substitution par
Opus puisque Sonnet est disponible en sous-agent. Escalade `standard` : essai 1 Sonnet, essai 2 Opus (ou Astra pour un bug
subtil), essai 3 Astra ou Fable. Opus reste le modèle du `sensible` et du cadrage.

## v2.13 — sous-agents Sonnet, Sol et Astra ; relais OpenAI

Demande de Paul du 22/11/2026. Liste des sous-agents d'atelier : Sonnet, Opus, Haiku, Sol, Astra (`ocx agent subagents set`).
En sous-agent, un fallback absent est relevé par un modèle proche (Luna → Sonnet, Terra → Sol, Fable → Astra), la garde de
volume prend Sonnet, et l'escalade prend Astra quand Fable n'est pas disponible. **Relais OpenAI** : un modèle Anthropic
refusé (`pilote.mjs refus <modèle> <message>`, 60 min) dont le fallback est refusé aussi passe sur **Sol** (rôles Sonnet et
Haiku) ou **Astra** (rôles Opus et Fable). L'orchestrateur note le refus dès qu'un fournisseur répond « quota » ou « surcharge ».

## v2.17 — modes de fournisseur, cadreurs sur Fable 5.1, abonnement et garde de boucle

Demandes de Paul du 23/11/2026 (fiche `evolutions/2026-11-23-fournisseurs-et-abonnement.md`). But : ménager l’abonnement, pas le prix catalogue.

**`$dev fournisseur claude|mixte|gpt|auto`** (`.pilote/fournisseur.json`, relayé du poste à atelier). Le routeur applique la table du mode ; chaque
`thread/start`, `thread/resume` et `turn/start` passe par `modeleEffectif` : en mode `gpt`, les chats existants (orchestrateurs compris) sont relancés chez OpenAI.

| Rôle | claude (défaut) | mixte | gpt |
|---|---|---|---|
| Orchestrateur, pilotage | Haiku | Haiku | Terra |
| Dev standard / sensible | Sonnet / Opus | Sonnet / Opus | Sol / Astra |
| Revue, tests standard / sensible | Sonnet / Opus | **Sol / Astra** | Sol / Astra |
| Cadrage (standard, sensible) | **Fable 5.1** | **Fable 5.1** | Astra |
| Petites tâches (`automatisation` léger, `digest`) | Haiku | Luna | Luna |
| Sous-agents d’atelier | `modeles.sous_agents` | idem | `modeles.sous_agents_gpt` (défaut : Sol, Astra, Terra, Luna, Sonnet) |

`auto` : claude sous 85 % de la semaine Anthropic (compte actif), mixte de 85 à 95 %, gpt au-delà ou si Anthropic refuse Haiku, Sonnet et Opus ;
mixte au lieu de gpt si Codex dépasse 95 % (`modeles.fournisseur_auto`). Le réveil note chaque bascule au journal de `fournisseur.json` et réécrit
la liste des sous-agents d’opencodex. Au-delà de 272 k tokens d’entrée, le mode gpt rend la main aux modèles Anthropic (palier OpenAI).

**Cadreurs sur Fable 5.1** (modes claude et mixte) : Fable vaut Opus pour comprendre un dépôt (SWE Atlas 76,5 % contre 77,4 %) et puise dans sa
propre fenêtre ; retour à Opus si cette fenêtre dépasse `modeles.fable_seuil_pct` (80 %) ou si Fable est refusé. Les cadreurs sont des chats,
pas des sous-agents : ils ne prennent pas de place dans la liste des 5. Un cadrage inline en sous-agent reste sur Opus. Fable 5.2 reste réservé à Paul.

**Relevé de l’abonnement** : le réveil et `$dev point` lisent les quotas d’opencodex (`provider-account-quota-cache.json`,
`codex-quota-cache.json`) au plus une fois par heure et les ajoutent à `.pilote/abonnement.jsonl`, avec la vitesse en points par heure.

**Garde de boucle** : `pilote.mjs modele <tâche> <criticité> compact <campagne> --sous-agent --issue <ID>` compte les sous-agents démarrés à
neuf par issue et par tâche ; au 3ᵉ en 12 h (`admission.boucle_max`, `admission.boucle_fenetre_h`), refus `CADREUR REQUIS` : l’orchestrateur
lance le cadreur de déblocage, dont la conclusion au journal rouvre deux essais. **Orchestrateurs** recréés dès 100 k tokens (150 k avant).
