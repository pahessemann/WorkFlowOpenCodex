# WorkFlowOpenCodex — branche d'essai `workflow-autonome`

Ce profil conserve les campagnes, leurs issues Linear et les bilans Obsidian. Le pilote sert surtout à router les modèles selon la tâche et à suivre l'objectif ; les agents choisissent leurs méthodes et leurs vérifications, en respectant les règles et contrats de chaque projet.

Avant toute fusion vers la branche principale, l'agent présente une version locale et son SHA, attend le GO explicite de l'utilisateur puis revérifie la version et la base. Le pilote fournit `validation-locale presenter`, `go` et `verifier` ; ces commandes enregistrent une validation, ne fusionnent pas et ne remplacent pas l'accord humain. Une commande Git externe n'est pas interceptée par le pilote.

Lire `SKILL.md` pour le fonctionnement et `references/modeles.md` pour le routeur. Activation d'essai : ajouter `"workflow_autonome": true` dans le fichier `poste.local.json` de chaque hôte. Le profil conserve les états et preuves des campagnes existantes ; ne pas effacer leur configuration propre. Retour arrière : retirer ce réglage et réinstaller le socle précédent. Ne pas fusionner cette branche d'essai dans la branche principale sans décision explicite après essai.
