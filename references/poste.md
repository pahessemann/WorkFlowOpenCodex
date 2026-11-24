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

Délai maximal par tâche : `passerelle.delai_max_min` (180). Depuis la v2.23, une nouvelle tâche dépassée est bloquée dès le premier dépassement : diagnostiquer et vérifier que la session précédente est arrêtée avant tout redépôt. Les tâches déjà déposées avant la v2.23 conservent leur règle précédente jusqu'à leur retour.

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
- **Après un nouveau retour environnement (v2.23)** : lire le retour et les preuves partielles, diagnostiquer puis vérifier un changement pertinent avant tout nouveau dépôt. Fournir `--changement "<diagnostic et changement vérifié>"` (20 caractères minimum), consigné au journal ; cette déclaration ne prouve pas automatiquement le changement. `--forcer` ne dispense pas de ce diagnostic et conserve son rôle pour le plafond ou une exclusion. Ne jamais relancer une tâche dont la session précédente pourrait encore agir.
- **Sortie des recettes longues** : la sortie standard et d'erreur de la session est écartée sans tampon mémoire ; `dernier-message.md`, `retour.md`, `resultat.json` et les preuves restent les supports de résultat. Les preuves partielles sont transférées même après interruption.
- **Rendu hors file** : un résultat produit à la main sur le poste se rend en une commande, depuis le poste :
  `node <pilote> poste rendre --issue <ID> --campagne <nom> --resultat ok|echec|environnement --retour-stdin --preuves <dossier>`.
  La tâche existante est reprise, sinon une tâche « hors passerelle » est créée (jamais relevée ni remise
  en file) ; les preuves sont copiées sur atelier avant le rendu.

## Retour

- `ok` ou `echec` ou `environnement` ; l'issue passe à `poste: retour` et apparaît dans
  `retours_poste` de `contexte` et dans le message de reprise.
- `echec` (le code de la branche est en cause) compte un essai ; `environnement` (poste, outil,
  délai) ne compte pas, comme `PRÉFLIGHT TECHNIQUE BLOQUÉ`, et le digest le signale.
- L'orchestrateur lit `retour.md` et les preuves, clôt l'issue si la matrice est complète ; après un retour environnement, il ne redépose qu'après diagnostic et changement vérifié ci-dessus. Tout changement de statut de l'issue solde le retour.

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

## Rangement des chats du poste (v2.16)

Avant chaque relève, au plus une fois par heure et si `passerelle.archivage_chats: true`, la passerelle lance un app-server local et
archive les chats du workflow du poste terminés par ✅ depuis 1 h ou inactifs depuis 48 h (règles de `menage.md`). Jamais AIDE, ARCHI,
un chat libre (titre sans rôle du workflow), un GO attendu (⏸) ni un chat en plein tour. Compte rendu :
`.pilote/archivage-chats-poste.json` ; le résultat de `poste relever` le reprend dans `chats_archives`.

## Mains du poste : commandes à la demande (v2.19)

Tout chat d’atelier (cadreur, DEV, orchestrateur, voie de recette) fait jouer une commande hors atelier **sans passer par Paul** :
sur le poste Windows, ou sur un serveur que seul le poste joint par ses alias SSH (ex. `deployeur-web`, `sudo -n` permis).

`node <pilote> poste demander --shell ssh:<alias>|powershell --objet "<quoi>" [--attendre <s>] [--delai <s>] --script-stdin`

- Le script complet passe sur l’entrée standard (`bash -s` sur le serveur, fichier `.ps1` UTF-8 sur le poste).
- `--attendre 300` : la commande rend la main dès le résultat (`statut: rendu`, `resultat` ok/echec/environnement, `code`, `sortie`,
  `erreurs`, 30 000 caractères au plus chacun) ; sinon `poste resultat <tâche>` le relit plus tard.
- `--agent --fiche-stdin` : une session de développement sur le poste (Sonnet par le routeur), pour une tâche qui demande du jugement ;
  retour `retour.md` (40 lignes) et `resultat.json`.
- Gardes : gestionnaire de mots de passe et suppression définitive sur le poste refusés (`COMMANDE REFUSÉE`). Une action irréversible
  sur un serveur reste soumise au GO de Paul (la fiche le cite).
- Poste non connecté : la demande attend sa connexion ; le chat termine son tour en `⏳ EN ATTENTE`, sans rien demander à Paul.

**Écoute du poste** : tâche planifiée `pilote-poste-ecoute` (ouverture de session, déverrouillage, toutes les 10 min, une seule instance,
sans limite de durée) qui lance `node <pilote> poste ecouter` : une attente longue sur atelier (`poste attendre-commande`, 80 s) répétée
tant que la session est ouverte ; une demande est prise en 2 s environ, jouée, puis rendue (`poste rendre-commande`). Atelier sait que
le poste écoute par `.pilote/poste/ecoute.json` (`connecte` si vu depuis moins de 150 s) ; `$dev poste` l’affiche (`commandes.ecoute`).
Après 10 échecs SSH de suite (poste en veille, réseau), l’écoute s’arrête ; la tâche planifiée la relance. La relève des recettes ne
prend jamais une commande. Installation : `node <pilote> poste installer` (les deux tâches). Désactivation : `passerelle.ecoute: false`.
