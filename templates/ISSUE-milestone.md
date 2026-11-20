# Issue — {{ISSUE_TITLE}}

> Delta autonome à exécuter dans le contrat du milestone. Ne pas répéter le
> workflow, l’historique du projet ni les règles communes. Supprimer cette note
> lors de la publication.

## Résultat attendu

{{RESULTAT_OBSERVABLE_DE_L_ISSUE}}

## Périmètre

- Surface(s) d’exécution : {{FRONTEND_WEB_FRONTEND_MOBILE_BACKEND_API_DONNEES_INFRASTRUCTURE_OU_TRANSVERSE}}
- Inclus : {{PERIMETRE_INCLUS}}
- Hors périmètre : {{PERIMETRE_EXCLU}}

## Dépendances

- Bloquée par : {{ISSUES_OU_AUCUNE}}
- Bloque : {{ISSUES_OU_AUCUNE}}

## Décisions applicables

Ne reprendre que les décisions et lignes de matrices propres à cette issue.
Écrire `Sans objet — <raison>` pour une catégorie non applicable.

### Données

| Donnée | Source et accès | Transformation ou règle | Destination | Preuve attendue |
|---|---|---|---|---|
| {{DONNEE}} | {{SOURCE_ET_ACCES}} | {{REGLE}} | {{DESTINATION}} | {{PREUVE}} |

Pour une donnée legacy, `Source et accès` précise l’API ou le service utilisé
par l’application et, séparément, l’éventuelle inspection de base autorisée en
lecture seule. Si une donnée manque dans l’API, indiquer la preuve attendue,
l’évolution à proposer et si cette dépendance bloque l’issue. Une connexion
directe de l’application à la base legacy n’est jamais une solution.

### Technique

| Élément | Contrainte nécessaire | Choix explicitement délégué |
|---|---|---|
| {{ELEMENT}} | {{CONTRAINTE}} | {{CHOIX_OU_AUCUN}} |

### Environnement

| Environnement ou service | Données, compte ou rôle | Accès de référence | Action attendue | Preuve | Si indisponible |
|---|---|---|---|---|---|
| {{ENVIRONNEMENT}} | {{DONNEES_COMPTE_ROLE}} | {{REFERENCE_SANS_SECRET}} | {{ACTION}} | {{PREUVE}} | {{BLOQUANT_OU_REPORT_AUTORISE}} |

## Delta UI — facultatif

Supprimer cette section si elle n’apporte rien au travail. Référencer le contrat
UI de `PROJECT.md`, sans recopier ses valeurs stables ni le catalogue.

- Parcours : {{COMPOSITION_MIGRATION_MONTEE_DE_VERSION_OU_MAQUETTE}}
- Surface et résultat visuel attendus : {{RESULTAT_UI}}
- Agencement : {{REFERENCE_VALIDEE_OU_VALIDATION_ATTENDUE_OU_NON_NECESSAIRE}}
- Demande au Design System (cadreur du projet Design System, accord de l’utilisateur) : {{REFERENCE_OU_AUCUNE}}
- Delta de version et comportements à préserver : {{DELTA_OU_SANS_OBJET}}

Intégrer les preuves UI utiles aux critères et validations déjà présents.

## Critères d’acceptation

- [ ] {{CRITERE_OBSERVABLE}}
- [ ] {{CAS_LIMITE_OU_ERREUR_ATTENDUE}}

## Recette développeur

- Statut : {{REQUISE_OU_SANS_OBJET_JUSTIFIE}}

Si le statut est `REQUISE`, conserver et compléter ce tableau. Sinon, le
supprimer après avoir indiqué `SANS OBJET — <raison>` ci-dessus.

| Parcours | Environnement | Profil ou rôle | Actions | Résultat attendu | Régressions à contrôler | Preuve |
|---|---|---|---|---|---|---|
| {{PARCOURS}} | {{ENVIRONNEMENT}} | {{PROFIL_SANS_SECRET}} | {{ACTIONS}} | {{RESULTAT}} | {{REGRESSIONS_BORNEES}} | {{PREUVE}} |

## Validations et preuves

- Gates projet applicables : {{IDENTIFIANTS_PROJECT_MD}}
- Validation propre à l’issue : {{SCENARIO_TECHNIQUE_OU_FONCTIONNEL}}
- Validation sandbox ou service réel : {{SCENARIO_OU_SANS_OBJET_JUSTIFIE}}
- Preuve à conserver : {{RESULTAT_LOG_CAPTURE_OU_ARTEFACT}}

## État de départ utile — facultatif

{{FAIT_VERIFIE_NECESSAIRE_OU_SUPPRIMER_LA_SECTION}}

## Règle de blocage

Bloquer uniquement si {{CONDITION_PRECISE}}. Remonter alors la preuve,
l’impact et la décision ou l’accès attendu. Toute autre incertitude non
structurante est traitée par le développeur dans le périmètre de l’issue.
