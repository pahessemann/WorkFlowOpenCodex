# Prototype UI — `$dev prototype <sujet>`

Créer une référence UI validée avant toute implémentation d'une surface du Design
System. Chat `🎨 PROTO · <projet> · <sujet>` dans `03 Cadrage & prototypes`.

1. Lire la section UI du `PROJECT.md` (thème, paquet, version) et `ui-cadrage.md`.
2. Composer avec les composants réels publiés dans l'éditeur du skill
   (`node scripts/prototype.mjs`, procédure et contrat `spec.json` v1 :
   `prototype-editeur.md`).
3. Vérifier par `node scripts/prototype-check.mjs` ; une révision validée a son
   empreinte.
4. Choix visuels : `pilote.mjs modele choix-visuel <criticite> compact` (Fable 5.1),
   à partir des captures et d'un résumé, jamais du dépôt brut.
5. Validation par Paul au cadrage (lot unique) ; l'issue de réalisation référence la
   révision, son chemin et son empreinte.

**Chat de travail** : créé par `node <pilote> chat-travail PROTO <projet> <objet> --modele <node <pilote> modele prototype <criticite> <volumetrie>> --consigne-fichier <f>`, jamais par l'outil de création de chat de l'application ; accès de l'hôte appliqué à chaque tour ; en accès restreint, aucune demande d'élévation (SKILL.md §2).
