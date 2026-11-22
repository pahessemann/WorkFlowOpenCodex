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

## Nettoyage automatique du disque d'atelier (v2.14)

`node <pilote> nettoyer` (répétition à blanc, avec tailles) puis `nettoyer --appliquer`. Actif seulement si
`nettoyage.actif: true` dans le `poste.local.json` d'atelier (refus `NETTOYAGE INACTIF` sinon ; hors Linux, chemins explicites
obligatoires). Le réveil le lance toutes les 6 h, ou chaque heure sous 40 Gio libres.

- `/tmp` : entrée de l'agent, rien de modifié depuis 24 h, aucun processus dessus : supprimée.
- Corbeille `~/.trash-migration-v2` : élément entré depuis plus de 48 h : purgé. C'est la seule purge définitive hors `/tmp`.
- Worktrees liés d'issues closes, propres, poussés, hors livrables protégés et hors processus : déplacés dans la corbeille
  (`nettoyage-<date>`), puis `git worktree prune`. Raison affichée pour chaque worktree gardé.
- Hors automatisme : qualifications, images containerd, environnements de recette, instantanés Incus.

Réglages (`nettoyage`) : `tmp_heures` (24), `corbeille_heures` (48), `intervalle_heures` (6), `seuil_libre_gio` (40), `tmp`,
`corbeille`, `worktrees`. Compte rendu : `.pilote/nettoyage.json`. L'exécutant de l'hôte surveille l'espace non alloué du volume
btrfs (balance sous 15 Gio, agrandissement de 20 Gio sous 2 Gio dans la limite de 300 Gio) ; `$dev point` affiche les deux.
