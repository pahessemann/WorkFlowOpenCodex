# Itération — `$dev iteration <ID>`

Session interactive : l’utilisateur affine une capacité existante, demande après demande, dans
un chat `🔵 DEV · <projet> · #<n> <objet>`.

1. L'issue d'itération existe (sinon `$dev cadrage-court` d'abord, modèle
   `templates/ISSUE-iteration.md`).
2. Préflight : `pilote.mjs ouvrir iteration <ID>` (worktree, branche, contrats hors Git).
3. Chaque demande : modification bornée, contrôles ciblés, retour court avec preuve.
   Proportionnalité : une retouche triviale reste sur Haiku.
4. Fin : PR, puis `$dev finaliser <ID>`.

