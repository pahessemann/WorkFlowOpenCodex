# Nettoyeur — `$dev nettoyeur` (technique : worktrees, branches, processus, caches)

Passe à la demande (chat `⚙️ RELAIS · nettoyage · <date>`). Toujours un DRY-RUN
d'abord ; rien n'est effacé définitivement (corbeille Windows, `~/.trash-migration-v2`
ou équivalent sur atelier).

- Worktrees : `git worktree prune` ; corbeille des worktrees propres dont la branche
  est fusionnée ; jamais un worktree avec modifications ou commits non poussés.
- Branches locales : seulement celles fusionnées et présentes dans un bundle vérifié.
- Processus orphelins : identifiés par PID et ligne de commande avant arrêt ; jamais un
  processus d'une autre campagne ou personnel.
- Ressources Docker de recette : seulement celles enregistrées comme appartenant à une
  issue close ; jamais de `prune` global.
- **Chats** : hors périmètre. Clôture, archivage, renommage, rangement et doublons de chats relèvent de `$dev menage` (`menage.md`).
- Espace disque : arrêter toute passe si `C:` passe sous 2 Gio ; worktrees et caches
  sur `D:` ou sur atelier.
- **Livrables hors Git** (`livrables/<ID>/`) : jamais effacés par le nettoyeur ni par la purge des worktrees tant que l'issue n'est pas close. La liste protégée est rendue par `node <pilote> nettoyeur candidats` (`ne_jamais_toucher`) et par `node <pilote> livrables proteges`.
- **Tâches planifiées déclarées** (`taches_planifiees` de `poste.local.json`, `protegee: true`) : jamais supprimées ni désactivées par `$dev nettoyeur` ni par le futur `$dev menage` ; la liste est rendue par `node <pilote> nettoyeur candidats` (`taches_protegees`). Elles restent cachées à l'écran mais figurent dans `$dev etat` avec leur dernière exécution réussie.
