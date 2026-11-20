# UI — assembler, migrer ou mettre à jour

À lire pendant l’exécution d’une surface UI raccordée au Design System,
après le préflight lorsqu’il existe. Ne charger ni cadrage ni ingestion.

Partir du `PROJECT.md` : thème, paquet et version adoptée. Vérifier l’accord
avec le manifeste et le verrouillage des dépendances ; signaler toute divergence
avant de choisir la base UI. Consulter seulement la documentation correspondant
à la version et aux composants nécessaires. Le Storybook courant ne suffit pas
à prouver l’API d’une ancienne version.

Importer uniquement le paquet dédié au thème de l’application et ses styles.
Composer les composants existants avec leurs options documentées. Ne pas inventer
de tokens, de variantes de thème, de copies de composants ou de surcharges pour
recréer un visuel. Les données, appels API, permissions et règles métier restent
dans l’application. Vérifier la compatibilité de plateforme avant intégration.

Respecter l’agencement validé si une maquette de composition a été retenue.
Dans une issue de maquette, produire seulement les zones, noms de composants et
besoins manquants ; ne pas anticiper le développement des surfaces.

Un manque confirmé suit le mode : en `$dev issue` ou en campagne, l’issue passe
`⛔` avec l’existant examiné et sa limite (digest), les issues indépendantes continuent ; en itération, proposer la
demande à l’utilisateur puis, avec son accord, la cadrer par
[cadrage-court.md](cadrage-court.md) et poursuivre les parties indépendantes.
Ne jamais modifier une bibliothèque
partagée depuis le dépôt consommateur ni dépendre d’une version locale ou
provisoire. Un composant métier local nécessite l’accord explicite de
l’utilisateur et reste composé du socle disponible autant que possible.

Pour une migration, préserver les comportements convenus : parcours, données,
droits et états utiles. Pour une montée de version, lire les changements et le
guide de migration pertinents, mettre à jour le paquet, son verrouillage et
`PROJECT.md` ensemble dans le périmètre autorisé. La version du dépôt ne prouve
pas la version déployée.

Effectuer les contrôles prévus par l’issue et les gates déclenchées, proportionnés
aux surfaces modifiées. Réutiliser les preuves encore valides. Dans le compte
rendu existant, fournir : résultat/aperçu, thème-paquet-version et principaux
composants, critères satisfaits/non satisfaits/non vérifiés et preuves, contrôles
réalisés, écarts ou décisions restantes. Référencer les preuves sans les recopier.
Pour une migration, inclure les comportements préservés et leurs vérifications.
Ne créer ni rapport parallèle ni reporting intermédiaire obligatoire.
