# Cadrage court — une issue unique

## Finalité

Créer ou modifier une seule issue Linear sans le cadrage complet : itération,
demande de composant au Design System ou petite issue isolée. Avec
`cadrage.md`, c’est la seule voie d’écriture du contenu d’une issue Linear.

## Déclenchement

`$dev cadrage` applique ce contrat lorsque le besoin tient en une issue et
n’exige aucune nouvelle décision fonctionnelle, technique ou de sécurité ; sinon
il applique `cadrage.md`. Une demande comme « mets ça dans Linear », « crée
l’issue » ou « génère le cadrage dans Linear » vaut invocation. En cas de doute
entre court et complet, poser une seule question.

Le cadreur l’utilise. Un développeur ne l’utilise qu’en
itération, pour une demande de composant au Design System, avec l’accord de
l’utilisateur.

## Déroulé

1. Résoudre le projet Linear cible : celui du `PROJECT.md` courant ; pour une
   demande de composant, le projet de « destination des demandes » du
   `PROJECT.md` de l’application.
2. Rechercher une seule fois une issue ouverte équivalente dans ce projet ; la
   compléter plutôt que créer un doublon.
3. Rédiger l’issue selon son modèle de `templates/` du skill `dev` :
   `ISSUE-iteration.md` (milestone `Itérations produit`, réutilisé ou créé une
   seule fois), `ISSUE-composant.md`, ou les seules sections utiles de
   `ISSUE-milestone.md` sans milestone.
4. Dépendances : lier par « bloque » uniquement les issues qui ne peuvent pas
   avancer sans celle-ci. Si seule une partie en dépend, proposer de découper
   une issue d’intégration bloquée et laisser avancer le reste.
5. Recette proportionnée : pour une retouche de composant ou une petite issue
   d’interface, une vérification visuelle dans Storybook ou dans la page, avec
   captures, et les tests ciblés. L’accessibilité se vérifie dans la page (texte
   complet présent, nom accessible), jamais avec un lecteur d’écran réel.
   N’ajouter aucune exigence de test, de navigateur ou d’accessibilité non
   demandée par l’utilisateur ; une preuve secondaire absente ne bloque pas la
   recette.
6. Présenter le brouillon et les liens, obtenir le GO de l’utilisateur, écrire
   dans Linear, relire l’issue créée puis rendre son identifiant, son lien et la
   commande suivante (`$dev issue` ou `$dev iteration`).

## Limites

Aucune matrice, aucun découpage en milestones. Le cadreur n’écrit dans
Obsidian qu’une décision durable validée par l’utilisateur, avec `vault.mjs`
(règle « Synchronisation du vault ») ; un développeur n’écrit jamais dans Obsidian. Si le besoin
dépasse une issue ou révèle une
décision structurante, proposer le cadrage complet.

**Pas de modèle dans une issue.** Une issue ne nomme jamais de modèle. Elle indique la tâche (dev, choix-visuel, prototype…) et la criticité ; le routeur (`node <pilote> modele`) choisit le modèle. Une mention trouvée dans une fiche est ignorée par `pilote.mjs ouvrir` et signalée dans le digest, sans jamais arrêter le travail.
