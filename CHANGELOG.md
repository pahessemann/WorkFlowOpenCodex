# Changelog du socle public

## 2.11.2 — 21/11/2026

Correctif d’affichage : une issue fusionnée qui attend sa recette reste visible dans le bloc d’état (rubrique des agents, « à recetter »). 97 évaluations, 72 tests.

## 2.11.1 — 21/11/2026

Correctif : la règle de clôture après fusion vérifie la tête réelle du travail (worktree de l’issue), et non plus seulement la branche distante, qui pouvait être restée à son point de départ et passer pour fusionnée. 97 évaluations, 72 tests.

## 2.11 — 21/11/2026

`pilote.mjs executant demander|etat` : une campagne dépose une demande d’action réservée à l’humain (installation root, commandes du serveur de déploiement, livraison sous mandat), traitée par un exécutant installé sur l’hôte et propre à chaque installation (non publié). Le bloc d’état montre ces demandes, et un refus remonte dans « ce que tu dois faire ». Le réveil relance les orchestrateurs dont des issues admises ne bougent plus, et signale le poste éteint. 97 évaluations, 71 tests.

## 2.10 — 21/11/2026

État de campagne lisible d’un coup d’œil : le script rend un bloc d’une ligne par rubrique (ce que Paul doit faire en premier, puis agents, poste Windows, attentes, issues à venir, bloquées) et une ligne d’état courte ; les orchestrateurs les recopient à l’identique, et `$dev point` affiche le même bloc. 97 évaluations, 70 tests.

## 2.9.1 — 21/11/2026

Correctif : quand le reste d’une campagne attend ses dépendances, la ligne d’état affiche l’action attendue de Paul (⏸) au lieu d’un message générique. 97 évaluations, 69 tests.

## 2.9 — 21/11/2026

Plus d’attente sans travail. Une issue qui attend Paul, le poste ou l’environnement libère sa place d’admission (le total ouvert reste borné). Une issue ne peut attendre Paul qu’après la conclusion d’un cadreur de déblocage, sauf motif réservé déclaré (`--reserve`). Le réveil lance lui-même les cadreurs quand une campagne n’a pas bougé depuis deux heures. La ligne d’état nomme ce que Paul doit décider. 97 évaluations, 69 tests.

## 2.8.5 — 21/11/2026

Correctif : `pilote.mjs badge` accepte les options nommées et refuse un badge incomplet au lieu d’afficher « undefined » ; `pilote.mjs decision` refuse un appel sans identifiant ou sans texte au lieu d’écrire une ligne vide au journal. La consigne des orchestrateurs donne la syntaxe exacte. 97 évaluations, 68 tests.

## 2.8.4 — 21/11/2026

Une issue de campagne ne peut plus être close tant que sa branche n’est pas fusionnée dans la branche principale de son dépôt : la commande répond « CLÔTURE SANS FUSION ». Une issue qui ne livre pas de code se clôt avec `--sans-fusion "<motif>"`, inscrit au journal. 97 évaluations, 67 tests.

## 2.8.3 — 21/11/2026

Le réveil relance toutes les 20 minutes un orchestrateur au repos tant qu’une admission est possible (place libre, CPU sous la garde, issue admissible). `ouvrir --dry-run` est un synonyme de `--a-blanc` ; un nom de campagne absent donne un message explicite. 97 évaluations, 66 tests.

## 2.8.2 — 21/11/2026

`$dev livrer` lance directement l’exécuteur de livraison, au premier plan, avec la progression affichée : la session intermédiaire, qui coupait les étapes longues au bout d’une dizaine de secondes, est supprimée. Le réveil relance un orchestrateur dès qu’une admission redevient possible (2.8.1). 97 évaluations, 65 tests.

## 2.8 — 21/11/2026

Chaîne critique raccourcie : admission empilée (une issue démarre sur la branche de sa dépendance dès la revue favorable, profondeur 3, clôture après la dépendance, désempilement automatique si elle échoue), chaîne critique et issues admissibles dans le contexte de l’orchestrateur, file des charges lourdes par priorité, poste Windows maintenu éveillé sur secteur tant que des tests l’attendent. 97 évaluations, 63 tests.

## 2.7 — 21/11/2026

Consommation réduite : Sonnet pour le développement et la revue de criticité standard (Opus en sensible et à l’escalade), relances des orchestrateurs seulement sur changement d’état (sinon une fois par heure), recréation des orchestrateurs à 150 k tokens, compression du contexte à 200 k. Campagnes plus rapides : `campagne scinder` (campagnes sœurs avec dépendances croisées et redirection des issues transférées), voie de recette dédiée (`campagne voie-recette`, `recettes`), tri des issues par nombre d’issues retenues. Versions 2.6.3 à 2.6.5 : cadreur de déblocage avant tout blocage, relances corrigées. 95 évaluations, 58 tests.

## 2.6.2 — 20/11/2026

Archivage automatique des chats terminés par le réveil du VPS, une heure après la fin (jamais l’accueil, l’architecte, une campagne en cours ni un chat actif). Commande `campagne ajouter` pour inscrire une issue dans une campagne en cours, avec son motif. Correctif 2.6.1 : un fichier JSON étranger dans le dossier des campagnes faisait planter le ménage. 93 évaluations, 53 tests.

## 2.6 — 20/11/2026

`$dev point` : le point des campagnes en un rendu fixe, en lecture seule (avancement, blocages et qui les débloque, actions de l’humain dédoublonnées et triées, ressources de l’hôte, temps restant en heures de travail des agents). Les orchestrateurs disent qui débloque chaque issue arrêtée (`statut --attend --quoi`, `arret`). Tests indépendants de la charge réelle de l’hôte. 91 évaluations, 49 tests.

## 2.5.4 — 20/11/2026

Passerelle poste : imprimante PDF basculée et restaurée automatiquement, plafond des échecs d’environnement, rendu d’un résultat produit à la main. Garde CPU à l’admission. ARCHI délègue toujours au lanceur. 86 évaluations, 46 tests.

## 2.5.3 — 20/11/2026

Plus de développements en parallèle par campagne ; plafond des charges lourdes de l’hôte inchangé, car c’est lui qui protège le CPU.

## 2.5.2 — 20/11/2026

Limites d’admission du VPS ajustées sur mesure : plus de développements en parallèle par campagne (la mémoire a de la marge), moins de charges lourdes simultanées sur l’hôte (le CPU est le facteur limitant).

## 2.5.1 — 20/11/2026

Première publication du socle commun, issu du workflow `$dev` v2.5.1 :

- contrat de campagne, GO unique, 3 motifs d'interruption, campagnes `AUTO` et `SUP` ;
- routeur de modèles proportionné et escalade en 3 essais ;
- chats identifiables (titre, carte d'identité, badge), registre, lanceur, `❓ AIDE`, `🏛 ARCHI`, ménage ;
- ligne d'état en fin de chaque réponse, calculée pour les campagnes, lue par le réveil ;
- passerelle poste Windows : file sur le VPS, relève automatique, retrait (`poste retirer`) ;
- livraison depuis le poste, plan figé, répétition à blanc ;
- limites d'admission lisibles et rappelées à chaque reprise ;
- 82 évaluations et 42 tests.
