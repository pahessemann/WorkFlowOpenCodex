# Comptes de recette

- **Source** : réserve numérotée `<COMPTE>_1`, `<COMPTE>_2`… dans le `.env.local` du
  checkout principal du projet, sur chaque hôte qui exécute des recettes. Pour un
  projet sans réserve (ex. une nouvelle application), l’utilisateur fournit les comptes et les place lui-même.
- **Registre** : `.pilote/comptes.json`, numéros seulement, jamais d'identifiant ni de
  mot de passe.
- **Réserver** : `pilote.mjs ouvrir <campagne> <ID> --compte <COMPTE>` choisit un numéro
  libre, l'inscrit au registre et copie le couple sous les noms sans numéro dans le
  `.env.local` du worktree (mode 600), sans afficher les valeurs.
- **Rendre** : `pilote.mjs rendre <campagne> <ID>` à la clôture ; le passage de relais
  est tracé (date, issue).
- **Exclusivité** : deux agents n'utilisent jamais le même compte en même temps.
- **Réserve vide ou absente** : l'issue n'est pas admise ; le cadrage le signale en amont.

