---
name: dev-orchestrator
description: Workflow autonome de campagnes et d'issues, avec routage économe des modèles et validation locale avant fusion.
---

# Workflow autonome (v2.23.1) — branche d'essai

Le workflow sert à choisir un modèle proportionné, limiter le contexte et suivre l'avancement d'un objectif. Les agents choisissent eux-mêmes leur organisation, leur méthode de développement, leurs outils et les vérifications adaptées. Une tâche simple comme une modification de configuration appelle un modèle léger ; une tâche difficile ou sensible peut justifier un modèle plus capable. Consulter `references/modeles.md` et `node <pilote> modele <tâche> <criticité> <volumétrie> [campagne]`. Éviter les sous-agents et transferts de contexte sans bénéfice ; ne pas répéter des contrôles déjà couverts par une preuve valable.

## Campagne et issues

Paul donne un objectif, des issues et, si nécessaire, ses contraintes. La campagne conserve son identité, ses issues, leurs dépendances et son état. Linear reste la source des issues et de leur progression. L'orchestrateur coordonne le travail, tient le suivi à jour et poursuit les tâches indépendantes quand une issue est bloquée. Les campagnes déjà en cours conservent leur travail, leurs branches et leurs preuves.

Les agents sont autonomes et responsables du résultat : ils lisent les règles du dépôt, en particulier `PROJECT.md` et `AGENTS.override.md`, les contrats et les bonnes pratiques propres au projet. Ils préservent les routes et contrats d'API, les données, la sécurité, la compatibilité et les comportements existants, sauf changement explicitement demandé. Ils choisissent des tests et une revue proportionnés, et indiquent leurs résultats et limites. Ni matrice, ni recette à plusieurs niveaux, ni revue séparée ne sont systématiquement imposées. Une validation explicite d'issue conserve un compte rendu de preuve libre ; la clôture reste après fusion.

## Version locale et GO

Le travail peut être intégré sur une branche de campagne. Aucune fusion vers `main`, `master` ou la branche principale n'est autorisée avant que Paul ait pu essayer la version locale et donné son GO explicite pour le SHA exact. Présenter le SHA, la branche, les instructions de lancement et d'essai, les contrôles faits et les limites. Après le GO, revérifier le SHA, le worktree et la base distante ; si une version ou base a changé, représenter le résultat à Paul. Un outil ne peut empêcher un `git` ou `gh` indépendant : cette règle s'applique à toutes les commandes des agents.

Le pilote peut enregistrer la présentation et vérifier la correspondance :

- `node <pilote> validation-locale presenter <campagne> --dossier <chemin-absolu> --branche <branche> --lancer "<instructions>"`
- Après le GO de Paul seulement : `node <pilote> validation-locale go <campagne> --sha <SHA-complet>`
- Après avoir actualisé les références distantes, juste avant la fusion : `node <pilote> validation-locale verifier <campagne>`

Ces commandes vérifient le dépôt accessible depuis l'hôte du pilote ; elles ne prouvent pas qu'une application a été lancée sur le poste de Paul. L'agent doit réellement préparer et expliquer l'essai local. L'enregistrement du GO ne remplace jamais l'accord de Paul. Les commandes ne fusionnent ni ne déploient.

## Après fusion et garde-fous

Après la fusion validée, actualiser les issues Linear et consigner dans Obsidian les acquis, décisions et preuves durables, selon `references/ingestion.md`. Les projets dont le déploiement revient à Paul restent déployés par Paul. Toute autre action irréversible reste soumise à son autorisation. Ne jamais consulter ni utiliser un gestionnaire de mots de passe ; suppression par la Corbeille, et protection du poste selon ses instructions. Paul est l'unique autorité humaine.

Le pilote existant reste disponible pour suivre les campagnes, choisir les modèles et accéder à la passerelle ; le profil d'essai `workflow_autonome: true` privilégie ces règles pour les campagnes nouvelles et existantes. Les tâches déjà lancées continuent sans interruption. Les anciens contrats et références restent accessibles pour comprendre l'historique mais ne doivent pas réintroduire une fusion automatique vers la branche principale ni des contrôles imposés en contradiction avec ce profil.

Sans commande `$dev` explicite, aucune campagne, issue, écriture Obsidian ou notification n'est déclenchée ; une discussion libre reste une discussion. Toujours répondre en français et terminer les messages du workflow par la ligne d'état.
