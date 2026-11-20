# Contrats locaux hors Git

Un dépôt partagé peut porter un `AGENTS.md` versionné destiné à d'autres workflows.
Les consignes personnelles prennent alors la forme d'un `AGENTS.override.md` à la
racine du checkout principal, **non versionné** (ajouté à `.git/info/exclude`). Codex
lit `AGENTS.override.md` à la place d'`AGENTS.md` au même niveau.

- `.git/info/exclude` est commun au checkout et à ses worktrees.
- Un worktree neuf ne contient pas les fichiers non versionnés : `pilote.mjs ouvrir`
  copie `AGENTS.override.md` (et tout fichier déclaré dans `hors_git` du projet) du
  checkout principal vers le worktree, puis vérifie qu'il est identique.
- Contrôle après création : le fichier existe dans le worktree et `git status` ne le
  montre pas.

