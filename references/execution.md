# Milestone isolé — `$dev milestone <projet> <ms-id>`

Même mécanique qu'une campagne d'un seul milestone, sans composition préalable :

1. `pilote.mjs campagne composer ms-<slug> <projet> <ms-id>` puis `lancer ms-<slug> auto`.
   Le chat porte la pastille `🔷 MS` (`pilote.mjs titre MS <projet> <slug> <n/total>`).
2. Exige un contrat validé (issu de `$dev cadrage`) couvrant le milestone.
3. Branche d'intégration `codex/ms-<slug>` sur le SHA de départ validé ; une issue = un
   sous-agent `dev` = un worktree = une branche `codex/issue-<id>` = une PR vers
   `codex/ms-<slug>`.
4. Recette groupée une seule fois sur le SHA final (`test.md`), puis PR finale vers
   `main` selon `main_deploie`.
5. Clôture : `$dev cloture ms-<slug>`.

**Chat de travail** : créé par `node <pilote> chat-travail MS <projet> <objet> --modele <node <pilote> modele pilotage <criticite> <volumetrie>> --consigne-fichier <f>`, jamais par l'outil de création de chat de l'application ; accès de l'hôte appliqué à chaque tour ; en accès restreint, aucune demande d'élévation (SKILL.md §2).
