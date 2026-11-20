# Milestone — {{MILESTONE_TITLE}}

> Contrat partagé par toutes les issues du milestone. Il contient le contexte
> commun une seule fois ; chaque issue décrit ensuite uniquement son propre
> delta. Supprimer cette note lors de la publication.

## Résultat attendu

{{RESULTAT_FONCTIONNEL_OBSERVABLE}}

## Périmètre

- Inclus : {{PERIMETRE_INCLUS}}
- Hors périmètre : {{PERIMETRE_EXCLU}}

## Sources et décisions canoniques

| Sujet | Référence exacte | Décision applicable |
|---|---|---|
| {{SUJET}} | {{FICHE_OBSIDIAN_OU_AUTRE_SOURCE}} | {{DECISION_UTILE_AU_MILESTONE}} |

Ne référencer que les sources nécessaires. Ne pas recopier leur historique.

## Contrat commun issu des matrices

### Données

| Donnée | Source autoritaire | Accès | Transformation | Destination | Preuve attendue |
|---|---|---|---|---|---|
| {{DONNEE}} | {{SOURCE}} | {{ACCES}} | {{TRANSFORMATION}} | {{DESTINATION}} | {{PREUVE}} |

Pour une donnée legacy, la colonne `Accès` distingue obligatoirement l’accès
runtime de l’application par l’API centrale ou le service officiel et l’éventuelle
investigation en lecture seule autorisée au développeur. Si l’API ne couvre pas
la donnée, préciser l’évolution attendue, son propriétaire et son effet sur le
milestone ; ne jamais prévoir une connexion directe depuis l’application.

### Technique

| Élément | Décision applicable | Source ou version | Choix laissé au développeur |
|---|---|---|---|
| {{ELEMENT}} | {{DECISION}} | {{REFERENCE_EXACTE}} | {{CHOIX_DELEGUE_OU_AUCUN}} |

### Environnements, accès et preuves

| Environnement ou service | Usage | Données et comptes attendus | Accès de référence | Actions autorisées ou interdites | Preuve requise | Si indisponible |
|---|---|---|---|---|---|---|
| {{ENVIRONNEMENT}} | {{USAGE}} | {{DONNEES_COMPTES_ROLES}} | {{REFERENCE_SANS_SECRET}} | {{ACTIONS}} | {{PREUVE}} | {{BLOQUANT_OU_REPORT_AUTORISE}} |

Pour une matrice sans ligne applicable, écrire `Sans objet — <raison>`. Ne
jamais consigner de secret.

## Découpage et dépendances

| Ordre | Issue | Résultat propre | Dépend de |
|---:|---|---|---|
| 1 | {{ISSUE}} | {{RESULTAT}} | {{DEPENDANCES_OU_AUCUNE}} |
| Final | {{ISSUE_REVUE_FINALE}} | Revue transverse, recette et clôture | Toutes les issues applicables |

## Critères globaux de recette

- [ ] {{CRITERE_TRANSVERSE_OBSERVABLE}}
- [ ] {{SCENARIO_DE_RECETTE_ET_PREUVE_ATTENDUE}}

## Points ouverts

`Aucun` ou liste des seuls points non bloquants, avec leur propriétaire et le
moment de décision. Un point indispensable non résolu interdit la publication
du milestone comme prêt au développement.
