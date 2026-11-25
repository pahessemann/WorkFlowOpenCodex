# Issue — `$dev issue <ID>` et sous-agent `dev`

Une issue Linear cadrée (critères d'acceptation présents), une unité isolée.

1. **Préflight** : `node <pilote> ouvrir <campagne> <ID>`, sans réglage : la fiche Linear est toujours lue par un sous-agent (Luna, mise en cache dans `.pilote/fiches/`) et analysée ; si elle est illisible, le démarrage continue et le digest le signale. **Réparation automatique** d'abord : dossier `.pilote/` créé, carte de dépôt absente générée sur place en squelette, puis complétée aussitôt en arrière-plan par un sous-agent Haiku (arborescence, manifestes, commandes de test, `PROJECT.md` ; 2 000 tokens maximum) ; une carte encore squelette reste utilisable et figure dans le digest, mentions de modèle de la fiche ignorées et signalées. Il ne bloque que sur ce qu'il ne peut pas créer : dépôt introuvable, accès Git refusé, réserve de comptes vide ; le message dit ce qui manque et qui le fournit (l’utilisateur). Il vérifie le
   worktree propre (créé sur l'hôte d'exécution, jamais sur un disque saturé), crée la
   branche distante `codex/issue-<id>`, copie les contrats hors Git
   (`worktree-local.md`), réserve le compte de recette si besoin
   (`comptes-recette.md`). Échec : statut `bloquee`, message
   `PRÉFLIGHT TECHNIQUE BLOQUÉ`, sans compter d'essai.
2. **Reprise** : si `sha_reprise` est renseigné, partir du SHA validé et examiner le
   `WIP` de `branche_reprise` ; reprendre ce qui est sain.
3. **Plan puis code** (`standard`, `sensible`) : fiche d'exécution de 1 500 tokens
   maximum, appliquée dans la même session. `leger` : Haiku de bout en bout, sans fiche.
4. **Contrôles rapides** : lint, typecheck, tests ciblés (sous-agent `tests`, Haiku).
5. **Recette développeur** si l'issue porte `Statut recette : REQUISE`
   (`recette-developpeur.md`).
6. **Revue** : sous-agent Opus démarré à neuf, avec le diff, la fiche et les critères.
7. **PR** vers `codex/ms-<slug>` (ou `main` pour un `issue_standalone`), puis
   `$dev finaliser <ID>` (`finalisation.md`).
8. Chaque échec : `pilote.mjs essai <campagne> <ID> echec` ; modèle de l'essai suivant
   par `pilote.mjs escalade`. Au 3ᵉ échec : `⛔ BLOQUÉ` (`blocages.md`).

Rapport rendu à l'orchestrateur : 20 lignes au plus (statut, SHA, preuves, décisions, suite).
Le contenu de l'issue Linear n'est jamais modifié (seul le cadrage l'écrit).



**Charge lourde (verrou réel)** : suite de tests complète, build complet, Docker, runtime de recette ou migration SQL se lance uniquement par `node <pilote> lourde <campagne> -- <commande>`. Plusieurs en parallèle selon l'hôte : sur atelier, 4 par campagne (`admission.lourdes_max`), 6 au total sur l'hôte (`lourdes_max_hote`, pour garder de la marge de CPU) et seulement si 6 Gio de mémoire restent disponibles (`garde_ram_lourde_gio`) ; sur le poste, 1. Au-delà, la commande attend son tour. Les tests ciblés d'une issue n'en sont pas.

**Livrable sans code** (planche, note, maquette statique ; fiche avec recette développeur « sans objet » et aucun code, ou `--livrable`) : démarrage allégé, sans worktree applicatif, sans branche ni compte. Les livrables vont dans `livrables/<ID>/` du dépôt, ou dans l'emplacement indiqué par la ligne `Livrables :` du `PROJECT.md`. Une direction visuelle est routée sur `choix-visuel` (Fable 5.1). Revue et clôture inchangées (tableau de couverture).

**Chat de travail** : créé par `node <pilote> chat-travail DEV <projet> <objet> --modele <node <pilote> modele dev <criticite> <volumetrie>> --consigne-fichier <f>`, jamais par l'outil de création de chat de l'application ; accès de l'hôte appliqué à chaque tour ; en accès restreint, aucune demande d'élévation (SKILL.md §2).
