# Itération — {{ITERATION_TITLE}}

> Support minimal d’une session interactive. Les règles communes restent dans
> `$dev iteration`. Supprimer cette note lors de la publication.

## Résultat attendu

{{RESULTAT_OBSERVABLE_DE_LA_SESSION}}

## Surface de travail

- Surface(s) d’exécution : {{FRONTEND_WEB_FRONTEND_MOBILE_BACKEND_API_DONNEES_INFRASTRUCTURE_OU_TRANSVERSE}}
- Modifiable : {{ECRANS_COMPOSANTS_OU_CHEMINS}}
- Consultable sans modification : {{CONTEXTE_LECTURE_SEULE_OU_AUCUN}}
- Frontières structurelles : {{API_DONNEES_SECURITE_ARCHITECTURE_PARTAGEE}}

Un ajustement adjacent contenu dans la même surface est autorisé. Tout
élargissement raisonnable est décrit, validé par l’utilisateur puis ajouté ici avant la
modification. Une évolution structurelle retourne au cadreur.

## Delta UI — facultatif

Supprimer cette section si elle n’apporte rien au travail. Référencer le contrat
UI de `PROJECT.md`, sans recopier ses valeurs stables ni le catalogue.

- Parcours : {{COMPOSITION_MIGRATION_MONTEE_DE_VERSION_OU_MAQUETTE}}
- Surface et résultat visuel attendus : {{RESULTAT_UI}}
- Agencement : {{REFERENCE_VALIDEE_OU_VALIDATION_ATTENDUE_OU_NON_NECESSAIRE}}
- Demande au Design System (cadreur du projet Design System, accord de l’utilisateur) : {{REFERENCE_OU_AUCUNE}}
- Delta de version et comportements à préserver : {{DELTA_OU_SANS_OBJET}}

Intégrer les preuves UI utiles aux critères et validations déjà présents.

## Interaction et environnement

- Prévisualisation : {{COMMANDE_URL_OU_ENVIRONNEMENT}}
- Données, compte ou rôle de recette : {{REFERENCE_SANS_SECRET_OU_SANS_OBJET}}
- Demandes : formulées directement par l’utilisateur dans la tâche développeur.
- Validation : résultat montré après chaque ensemble cohérent ; aucune mise à
  jour Linear par micro-ajustement.

## Critères de clôture

- [ ] L’utilisateur confirme que le résultat de la session est conforme.
- [ ] Les gates `PROJECT.md` déclenchées par le diff sont vertes.
- [ ] Une seule pull request regroupe l’itération.
- [ ] Aucun changement ne dépasse la surface validée.
- [ ] `$dev finaliser <ID>` prépare le bilan ; il est versé dans Obsidian après la fusion vers `main`.

## Règle de blocage

Bloquer uniquement si l’environnement indispensable est indisponible, si Git
est incohérent ou si la demande exige une décision structurelle. Remonter alors
la preuve, l’impact et la seule décision attendue.
