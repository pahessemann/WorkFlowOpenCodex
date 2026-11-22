# Passerelle poste Windows — `$dev poste` (v2.5, voies parallèles v2.12)

Quand une recette ou un test exige Windows (wkhtmltopdf, IIS Express, PowerShell, pilotes),
atelier ne l'improvise plus : il dépose une tâche dans une file, et le poste la relève dès qu'il
est connecté. La file vit sur atelier, toujours allumé ; le poste vient la chercher, car atelier
ne peut pas joindre le poste.

## Côté atelier : déposer

`node <pilote> poste deposer <campagne> <ID> --fiche <f> [--priorite 1-9] [--reglages "a;b"] [--criticite c]`

- **Fiche** (obligatoire) : dépôt et SHA à tester, branche, étapes et commandes exactes, dispositif,
  attendu et critères, ce qui reste hors périmètre. Pas de secret, pas de modèle nommé.
- **Réglages** : seuls les réglages Windows temporaires permis (ex. « imprimante par défaut :
  Microsoft Print to PDF »). Ils sont toujours restaurés ; une imprimante physique, jamais.
- L'issue garde son statut et reçoit `poste: en_file` : **elle sort du quota `dev_max`** tant
  qu'elle attend le poste, et `contexte` la liste dans `au_poste` (jamais dans `a_relancer`).
- Refus `TÂCHE DÉJÀ EN FILE` si l'issue attend déjà le poste ; `FICHE ABSENTE` sans fiche.

## Côté poste : relever

Tâche planifiée cachée et protégée `pilote-poste-passerelle` (installée par
`node <pilote> poste installer`) : à l'ouverture de session, au déverrouillage, puis toutes les
`passerelle.intervalle_min` minutes (10). `node <pilote> poste relever` :

1. ne fait rien si `passerelle.actif` est faux ou si C: est sous la garde ; si la relève principale tourne déjà, ouvre une voie
   supplémentaire quand la RAM et le CPU le permettent (voir « Relèves parallèles »), sinon s'arrête en donnant la raison ;
2. prend **une** tâche sur atelier (verrou, priorité puis ancienneté) et note le passage du poste ;
3. garde le poste éveillé, passe en priorité basse et lance une session `codex exec` en accès
   complet, avec le modèle du routeur `tests <criticité>` et les règles du poste (aucun gestionnaire de
   mots de passe, aucun secret, Corbeille, D: pour les worktrees, réglages restaurés, ligne d'état) ;
4. la session écrit dans `passerelle.dossier_travail\<tâche>\` : `preuves\`, `retour.md` (15 lignes),
   `resultat.json` (`ok`, `echec` ou `environnement`) ;
5. dépose les preuves sur atelier (`.pilote/poste/retours/<tâche>/`) et rend la tâche.

Délai maximal par tâche : `passerelle.delai_max_min` (180). Une tâche dépassée est remise en file,
puis bloquée au 3ᵉ dépassement.

## Retirer : `node <pilote> poste retirer <tâche|ID> --motif "<raison>" [--campagne <nom>]` (v2.5.1)

Pour une tâche que le poste ne doit pas faire (ex. recette sur tablette physique, faite par Paul) :

- seule une tâche `en_file` se retire ; `en_cours` est refusée (`TÂCHE EN COURS` : attendre son retour) ;
- la tâche passe `retiree` et n'est plus jamais relevée ; l'issue perd `poste` et reçoit `poste_exclu: <motif>` ;
- une ligne est inscrite au journal de la campagne (« Retirée de la passerelle poste par Paul… ») ;
- l'issue apparaît dans `exclues_poste` de `contexte` : elle n'est ni redéposée (`POSTE EXCLU`, sauf
  `--forcer` sur instruction de Paul) ni admise (`ADMISSION DIFFÉRÉE` : elle attend Paul) ;
- la ligne d'état de la campagne dit « Toi : à faire par toi : <ID> (<motif>) », et `⏸ À TOI` quand il ne
  reste que cette part.

## Automatismes de la passerelle (v2.5.4)

- **Imprimante** : pendant chaque tâche, la passerelle met « Microsoft Print to PDF » par défaut, puis
  restaure l'imprimante d'origine, même si la session échoue (`finally`). Le retour le note. Si l'imprimante
  PDF manque, rien ne change et le retour le signale. Jamais d'imprimante physique. Réglage :
  `passerelle.imprimante_pdf` (vrai par défaut).
- **Plafond des échecs d'environnement** : chaque retour `environnement` incrémente `poste_env_echecs` de
  l'issue (cause tirée du retour) ; un retour `ok` le remet à zéro. À `passerelle.max_echecs_env` (2), un
  nouveau dépôt est refusé (`POSTE À DÉBLOQUER`), l'issue apparaît dans `poste_a_debloquer` de `contexte`,
  et la ligne d'état dit « Toi : débloquer le poste pour <ID> (<cause>) ». Après l'action de Paul :
  `poste deposer … --forcer`, qui remet le compteur à zéro.
- **Rendu hors file** : un résultat produit à la main sur le poste se rend en une commande, depuis le poste :
  `node <pilote> poste rendre --issue <ID> --campagne <nom> --resultat ok|echec|environnement --retour-stdin --preuves <dossier>`.
  La tâche existante est reprise, sinon une tâche « hors passerelle » est créée (jamais relevée ni remise
  en file) ; les preuves sont copiées sur atelier avant le rendu.

## Retour

- `ok` ou `echec` ou `environnement` ; l'issue passe à `poste: retour` et apparaît dans
  `retours_poste` de `contexte` et dans le message de reprise.
- `echec` (le code de la branche est en cause) compte un essai ; `environnement` (poste, outil,
  délai) ne compte pas, comme `PRÉFLIGHT TECHNIQUE BLOQUÉ`, et le digest le signale.
- L'orchestrateur lit `retour.md` et les preuves, clôt l'issue si la matrice est complète, sinon
  note la cause et redépose. Tout changement de statut de l'issue solde le retour.

## Suivi

`$dev poste` (`node <pilote> poste file`) : en file, en cours, bloquées, rendues sur 24 h, dernier
passage du poste. `$dev etat` l'inclut. Le digest signale un poste non vu depuis 24 h alors que des
tâches attendent. La ligne d'état d'une campagne dit `⏳ EN ATTENTE · retour du poste Windows attendu`,
avec « Toi : ouvrir ta session sur le poste » si le poste n'est pas passé depuis une heure.

## Configuration (`poste.local.json` du poste)

`"passerelle": { "actif": true, "intervalle_min": 10, "delai_max_min": 180, "dossier_travail": "D:\\passerelle-poste", "voies_max": 3, "ram_libre_min_gio": 4, "cpu_max_pct": 60 }`

## Relèves parallèles (v2.12)

La tâche planifiée accepte plusieurs instances (`-MultipleInstances Parallel`). La voie 1 (`poste-releve.verrou`) est la relève
principale. Quand elle est occupée par un processus vivant, une relève ouvre la voie 2 puis 3 (`poste-releve-<n>.verrou`) si :

- une voie est libre (`voies_max`, 3 ; `1` rétablit une seule relève) ;
- la RAM libre atteint `ram_libre_min_gio` (4 Gio) ;
- le CPU, mesuré sur 2 s, ne dépasse pas `cpu_max_pct` (60 %).

Sinon, la relève s'arrête et donne la raison chiffrée (RAM, CPU ou voies occupées). Seule la voie 1 règle l'imprimante par
défaut et la veille sur secteur. Une voie supplémentaire n'y touche pas, et sa session doit désigner explicitement
« Microsoft Print to PDF » à chaque impression. La voie 1 compte les tâches en cours pour ne pas rétablir la veille pendant
qu'une autre voie travaille. Une tâche prise par une voie supplémentaire porte le nom du poste suivi de `-voie<n>`.

## Poste éveillé sur secteur (v2.8)

À chaque relève, la passerelle compte les tâches en file ou en cours. S'il en reste, elle coupe la veille et la veille
prolongée **sur secteur** (`powercfg /setacvalueindex … STANDBYIDLE|HIBERNATEIDLE 0`), après avoir sauvegardé les valeurs dans
`.pilote/poste-veille.json` ; dès que la file est vide, elle les restaure. Les réglages sur batterie ne sont jamais touchés.
La fermeture du capot reste du ressort de Paul. Désactivation : `passerelle.eveil_secteur: false`.
