# Revue finale — {{MILESTONE_TITLE}}

> Dernière issue obligatoire du milestone. Elle applique les quatre phases au
> résultat intégré et ne répète pas les validations déjà prouvées. Supprimer
> cette note lors de la publication.

## Résultat attendu

Vérifier l’intégration du milestone {{MILESTONE_TITLE}}, puis assurer sa clôture
traçable après recette et merge autorisé, ou validation explicite sans diff.

## Prérequis

- Dépend de : {{TOUTES_LES_ISSUES_APPLICABLES}}
- Base d’intégration : branche principale contenant les merges des issues précédentes.
- Environnement de recette : {{ENVIRONNEMENT}}
- Comptes, rôles et accès : {{REFERENCES_SANS_SECRET}}

## Phase 1 — Consolidation transverse

- [ ] Vérifier {{INTERACTIONS_ENTRE_ISSUES}}.
- [ ] Exécuter {{SCENARIOS_TRANSVERSES_MANQUANTS}}.
- [ ] Contrôler les critères globaux du milestone et réutiliser les preuves
      valides déjà produites.
- [ ] Documenter tout écart entre le résultat intégré et le cadrage accepté.

## Phase 2 — Contrôles transverses et qualité du diff éventuel

La revue porte sur le diff éventuel de cette issue indépendante ; ne pas
rejouer les revues des issues déjà fusionnées ni créer une PR globale de milestone.
Sans changement à livrer, conserver les preuves dans Linear et déclarer
`PR SANS OBJET — revue sans diff`, sans commit vide ni PR artificielle.

- Gate finale : appliquer les identifiants `final:*` de `PROJECT.md`.
- Gates conditionnelles : {{IDENTIFIANTS_DECLENCHES_PAR_LE_DIFF_OU_AUCUNE}}
- Revue indépendante si cette issue produit un diff : un seul agent interne distinct, dont le modèle est donné par le routeur (`node <pilote> modele revue <criticite> compact --sous-agent`), en lecture seule, relit
  le diff exact de la PR pour la qualité, les régressions et la sécurité selon
  les surfaces sensibles déclarées dans `PROJECT.md`.
- Risques résiduels : reprendre les constats P2/P3 inscrits dans les PR et
  bilans des issues du milestone ; corriger chacun dans cette issue ou le
  présenter à l’utilisateur comme risque accepté, sans rejouer la revue
  complète des issues fusionnées.

Les constats indiquent sévérité, emplacement, preuve et conséquence. Le
développeur principal les trie, corrige dans la même branche et rejoue
uniquement les contrôles affectés, selon le verrou de revue de
`finalisation.md`.

## Phase 3 — Préparation de recette

| Scénario | Données et rôle | Action | Résultat attendu | Preuve |
|---|---|---|---|---|
| {{SCENARIO}} | {{DONNEES_ROLE}} | {{ACTION}} | {{RESULTAT}} | {{PREUVE}} |

- Si l’environnement ou l’accès manque : {{BLOQUANT_OU_REPORT_AUTORISE}}.
- Verdict attendu : `PRÊT POUR RECETTE`, `NON PRÊT` ou `BLOQUÉ`.
- Les corrections de recette restent dans la même tâche, la même branche et la
  même pull request.

## Phase 4 — Clôture validée

Après recette de Paul ou de l’orchestrateur de campagne (recette de Milestone), appliquer `$dev finaliser <ID>` à
cette seule issue. Après son merge, ou sa validation explicite sans diff,
publier le bilan et notifier le cadreur. L’orchestrateur ingère les résultats
globaux et termine le milestone si toutes ses issues et ses critères sont
validés, sans modifier les bilans des issues précédentes.

## Critères d’acceptation

- [ ] Toutes les issues applicables sont intégrées.
- [ ] Les scénarios transverses et globaux sont démontrés.
- [ ] La gate finale ne conserve aucun constat bloquant.
- [ ] Chaque risque résiduel des issues du milestone est corrigé ou accepté
      explicitement par l’utilisateur.
- [ ] La recette dispose de l’environnement et des preuves prévus, ou rend un
      verdict bloqué conforme au cadrage.
- [ ] Le merge n’est jamais effectué sans autorisation explicite.
- [ ] `$dev finaliser <ID>` prépare le bilan ; l’ingestion Obsidian suit la fusion vers `main`.

## Règle de blocage

Bloquer uniquement si une dépendance n’est pas intégrée, si un constat final
empêche la recette, ou si l’environnement, l’accès ou la preuve déclarée comme
obligatoire manque. Remonter la preuve, l’impact et la décision attendue.
