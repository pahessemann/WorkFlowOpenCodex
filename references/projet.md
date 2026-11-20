# Projet — `$dev projet <nom>`

Créer ou raccorder le socle minimal d'un dépôt, sans auditer le code métier.

1. Dépôt : créer ou cloner ; branche principale et dépôt distant déclarés.
2. `PROJECT.md` : projet Linear, racine Obsidian (`vault:`), branche principale,
   environnements, gates (identifiants et commandes), surfaces sensibles, règles
   d'exécution propres au projet, valeur `main_deploie`.
3. Contrôle : `node scripts/validate-project.mjs <dépôt>` jusqu'à
   `PRET_POUR_DEVELOPPEMENT`.
4. Inscrire le projet dans `poste.local.json` (`projets`) avec son chemin et
   `main_deploie`, sur chaque hôte concerné.
5. Un dépôt partagé avec des utilisateurs d'un autre workflow garde ses fichiers
   versionnés ; les consignes personnelles vont dans un `AGENTS.override.md` non
   versionné (`worktree-local.md`).

