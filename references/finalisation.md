# Finalisation d'une issue — `$dev finaliser <ID>`

Portée : une issue réalisée, sa PR ouverte.

1. Vérifier la PR au SHA exact, la revue favorable (Opus démarré à neuf) et les
   contrôles rapides verts ; recette développeur faite si `REQUISE`.
2. Fusion dans `codex/ms-<slug>` sans GO. Pour un `issue_standalone` : fusion vers
   `main` automatique si `main_deploie: false`, sinon `⏸ GO`.
3. Préparer le bilan `.pilote/bilans/<ID>.md` : résultat, SHA, PR, preuves, décisions,
   impacts durables. Rien n'est versé dans Obsidian à ce stade.
4. `pilote.mjs statut <campagne> <ID> fusionnee`.
5. Après la fusion vers `main` (PR finale du milestone ou standalone) : ingestion
   (`ingestion.md`), puis `rendre` et `statut … close`, et fermeture de l'issue
   Linear avec son bilan (état et commentaire seulement).

**Livrables hors Git.** Une fois la planche, la note ou la maquette jointes à l'issue Linear : `node <pilote> livrables marquer <campagne> <ID> livrables_joints`. Le poste les copie ensuite dans sa sauvegarde (`sauvegarde_livrables` de `poste.local.json`, par défaut `D:\backup-livrables\<projet>\<ID>\`) par `node <pilote> livrables rapatrier`, lancé à l'ouverture de session du poste et toutes les heures ; ils ne restent jamais uniquement sur atelier. Ils ne sont effacés ni par le nettoyeur ni par la purge des worktrees tant que l'issue n'est pas close.
