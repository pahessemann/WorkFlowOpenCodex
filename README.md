# WorkFlowOpenCodex — workflow `$dev` pour Codex

Un skill Codex qui organise le développement assisté par agents autour d'un principe simple :
**tu cadres une fois, les agents exécutent**. Linear porte les Milestones et les issues, un VPS
(« atelier ») développe et teste, le poste Windows pilote, livre et fait les tests qui exigent
Windows. Chaque chat dit d'un coup d'œil qui parle, sur quoi, et s'il faut agir.

**Version actuelle : 2.21** (23/11/2026) — détail des versions dans [CHANGELOG.md](CHANGELOG.md), étiquettes Git `vX.Y.Z`.

Ce dépôt est le **socle commun**, sans règle propre à un projet : les règles d'un projet vivent
dans le `PROJECT.md` de son dépôt.

## Ce que fait le workflow

- **Cadrage puis autonomie** : `$dev cadrage` produit un contrat de campagne (2 pages) validé par un
  GO unique ; ensuite les agents décident seuls, et ne t'interrompent que pour 3 motifs (action
  irréversible, hors mandat, 3 échecs).
- **Campagnes** : un chat par campagne, un sous-agent par issue, un worktree et une branche par
  issue, recette groupée par Milestone, digest quotidien.
- **Modèles proportionnés** : un routeur choisit le modèle selon la tâche et sa criticité, avec une
  escalade en 3 essais (`references/modeles.md`).
- **Chats lisibles** : titre `<pastille> RÔLE · projet · objet · état`, carte d'identité, badge, et une
  **ligne d'état** en fin de chaque réponse (`▶ EN COURS`, `⏳ EN ATTENTE`, `⏸ À TOI`, `⛔ BLOQUÉ`, `✅ TERMINÉ`).
- **Passerelle poste Windows** : les tests que le VPS ne peut pas faire attendent dans une file et
  sont relevés par le poste dès qu'il est connecté, plusieurs à la fois si la RAM et le CPU le permettent
  (`references/poste.md`).
- **Livraison** depuis le poste seulement, plan figé au GO, répétition à blanc, arrêt à la première erreur.
- **Rôles fixes** : `❓ AIDE` (porte d'entrée et lanceur) et `🏛 ARCHI` (architecte du workflow).

La référence complète est `SKILL.md` ; la fiche d'utilisation de 2 pages est dans `docs/fiche/`.

## Installation

1. Copier ce dépôt dans ``/.agents/skills/dev/` sur chaque hôte (poste Windows et VPS).
2. Créer `poste.local.json` à partir de `poste.local.exemple.json` sur chaque hôte (chemins, projets,
   SSH, modèles disponibles). Ce fichier est propre à l'hôte et n'est jamais versionné.
3. Sur le poste : `node scripts/pilote.mjs poste installer` pour la tâche planifiée de la passerelle.
4. Vérifier : `node scripts/evals.mjs` et `node --test scripts/*.test.mjs`.

Prérequis : Node 20+, Codex (application et `codex exec`), Linear, un VPS joignable en SSH depuis le
poste ; Obsidian en option pour les bilans.

## Commandes principales

`$dev aide` · `$dev cadrage <sujet>` · `$dev campagne composer|lancer` · `$dev digest` · `$dev etat [chats]` ·
`$dev poste` · `$dev livrer <campagne>` · `$dev menage` · `$dev evolution <sujet>` — liste complète dans `SKILL.md` §1.
