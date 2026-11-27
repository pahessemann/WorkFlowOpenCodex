# Changelog du socle public

## 3.2.0-test — GO unique et fusions autonomes — 26/11/2026

L'humain valide une fois au lancement ; les agents fusionnent les travaux couverts par le mandat après tests et revue, y compris dans les campagnes en cours, sans GO par SHA. Le déploiement reste à la main de l'humain, y compris quand une fusion le déclencherait automatiquement.

## 3.1.0-test — une campagne, un chat autonome — 25/11/2026

En mode autonome, une campagne est un seul chat (modèle le plus capable, effort élevé) qui gère toute la campagne ; un chat développeur ne traite qu'une issue. Le workflow ne sert qu'à l'affichage : le réveil n'admet plus d'issues et ne lance plus de cadreurs pour ces campagnes, et il ne relance pas un chat qui attend l'humain. Version locale et GO explicite sur le SHA avant fusion conservés.

## 3.0.2-test — déplacer des issues entre campagnes — 25/11/2026

`campagne deplacer` déplace des issues précises, y compris celles d'une milestone, vers une autre campagne, avec la trace des transferts.

## 3.0.1-test — réveil borné — 25/11/2026

Le réveil admet les issues éligibles dans un processus borné dans le temps ; une issue arrêtée n'est jamais admise automatiquement.

## Essai autonome — reprises cohérentes — 24/11/2026

Le réveil et la reprise après pause utilisent la même consigne autonome : méthodes libres, API existantes préservées et validation locale de Paul avant fusion.

## Essai autonome — clarification API — 24/11/2026

Les procédures propres aux dépôts ne sont pas imposées par le workflow. Les API existantes restent inchangées ; les besoins incompatibles passent par un ajout distinct.

## Essai — branche workflow-autonome — 24/11/2026

Routage proportionné et suivi des campagnes ; méthodes laissées aux agents. Version locale et GO explicite sur le SHA avant fusion dans la branche principale ; Linear et Obsidian conservés.

## 2.23 — 24/11/2026

Passerelle : sortie sans tampon, preuves partielles conservées et diagnostic avant redépôt après échec d'environnement. Recette : preuves équivalentes réutilisables après vérification, revue indépendante et suite finale conservées.

## 2.22 — 23/11/2026

Projets livrés par l'humain lui-même (`livraison_par_paul` dans `poste.local.json`) : les agents s'arrêtent à la fusion ; livraison, GO et exécutant de livraison sont refusés pour ces projets. 104 évaluations, 93 tests.

## 2.21.2 — 23/11/2026

Les actions attendues de l'humain s'affichent une par ligne, sous « À toi » en gras. 104 évaluations, 92 tests.

## 2.21.1 — 23/11/2026

Bloc d'état plus lisible : l'action attendue de l'humain en clair dans la dernière ligne, plus de doublon entre « Toi » et « Bloquée », issues arrêtées affichées « en attente », recopie sans bloc de code. 104 évaluations, 92 tests.

## 2.21 — 23/11/2026

Une revue favorable inscrite suffit pour démarrer les issues qui en dépendent, sans attendre la recette (`pilote.mjs revue`). 104 évaluations, 91 tests.

## 2.20.3 — 23/11/2026

Une fiche qui cite du code n'est plus classée « livrable » au démarrage, et `ouvrir --nature code|livrable` corrige une issue déjà admise. 104 évaluations, 90 tests.

## 2.20.2 — 23/11/2026

Le point sépare les blocages qui attendent l'humain de ceux que les agents règlent seuls. 104 évaluations, 89 tests.

## 2.20.1 — 23/11/2026

Temps restant du point : seul le travail des agents est chiffré, les issues au poste sont affichées « en attente du poste », et le total ne grimpe plus avec l'horloge. 104 évaluations, 88 tests.

## 2.20 — 23/11/2026

Plusieurs comptes Anthropic : bascule horaire sur celui qui se réinitialise le plus tôt, fenêtre à consommer qui reprend les campagnes mises en pause par économie, comptes affichés dans le point ; la reprise d'une campagne relance son orchestrateur. 104 évaluations, 87 tests.

## 2.19.2 — 23/11/2026

`fournisseur` et `abonnement` connus du lanceur, commandes directes exécutées par le lanceur, test de couverture des commandes documentées. 104 évaluations, 84 tests.

## 2.19.1 — 23/11/2026

Le lanceur accepte une commande de chat (`discute`, `cadrage`, `prototype`…) sans le mot `lancer`. 104 évaluations, 83 tests.

## 2.19 — 23/11/2026

Mains du poste : tout chat de l'hôte d'exécution fait jouer une commande sur le poste, ou sur un serveur que seul le poste joint, sans passer par l'humain (`poste demander`, résultat rendu dans le même tour) ; écoute permanente du poste quand il est connecté. 104 évaluations, 82 tests.

## 2.18.1 — 23/11/2026

Alias `$dev discute` et `$dev discussion` ; sans projet, une discussion générale sur les projets en cours ; le chat d'aiguillage nomme la commande. 102 évaluations, 81 tests.

## 2.18 — 23/11/2026

`$dev discuter <projet> [sujet]` : un nouveau chat de discussion `💬 PROJET` à chaque appel, en lecture seule, qui charge le contexte du projet et confie au lanceur toute action demandée ; rangé après 24 h sans activité. 102 évaluations, 81 tests.

## 2.17 — 23/11/2026

Modes de fournisseur `$dev fournisseur claude|mixte|gpt|auto` (tout Claude, revues et tests chez OpenAI, tout GPT, ou bascule selon l'abonnement), cadreurs sur Fable 5.1, relevé horaire de l'abonnement dans `$dev point`, orchestrateurs plus légers (100 k) et garde de boucle avant cadreur. 100 évaluations, 80 tests.

## 2.16 — 23/11/2026

La passerelle du poste range automatiquement les chats du workflow terminés ou inactifs du poste, jamais les chats libres. 97 évaluations, 79 tests.

## 2.15.3 — 23/11/2026

Archivage automatique des chats : fin reconnue par la clôture de l'issue liée, par 48 h d'inactivité (hors attente de décision), et campagne close sans chat de bilan rangée après 24 h. 97 évaluations, 78 tests.

## 2.15.2 — 22/11/2026

Construction de contrôle sur l'environnement de test par l'exécutant de l'hôte (versions, plan, apply, status ; sans migration). Le bloc d'état ne renvoie à l'humain que les refus de l'exécutant faute de mandat. 97 évaluations, 77 tests.

## 2.15.1 — 22/11/2026

Correctif de l'exécutant de l'hôte (non publié dans le socle) ; version alignée. 97 évaluations, 77 tests.

## 2.15 — 22/11/2026

Nouvelle demande possible à l'exécutant de l'hôte : construction de contrôle sur l'environnement de test, limitée à cet environnement et sans migration. 97 évaluations, 77 tests.

## 2.14.1 — 22/11/2026

Consigne des orchestrateurs : une livraison se demande d'abord à l'exécutant de l'hôte ; seule l'absence de mandat justifie d'attendre l'humain. 97 évaluations, 76 tests.

## 2.14 — 22/11/2026

Nettoyage automatique du disque du VPS par le réveil : fichiers temporaires de plus de 24 h sans processus, corbeille purgée après 48 h, worktrees d'issues closes propres et poussés déplacés dans la corbeille. Activation explicite seulement (`nettoyage.actif`). Le point des campagnes affiche le disque libre. 97 évaluations, 76 tests.

## 2.13.1 — 22/11/2026

Correctif de calcul : le temps restant du point des campagnes repose sur le débit réel (24 dernières heures, ou depuis la première admission), sinon sur la durée médiane divisée par le parallélisme mesuré, avec un plancher de chaîne de dépendances. Il ne dépend plus du nombre d'agents au travail à l'instant du point. 97 évaluations, 75 tests.

## 2.13 — 22/11/2026

Modèles des sous-agents : le routeur relève un fallback absent par un modèle proche, prend Astra à l'escalade quand Fable n'est pas disponible, et relaie vers les modèles OpenAI (Sol, Astra) quand un modèle Anthropic et son fallback sont refusés. La consigne des orchestrateurs impose le nom de catalogue pour lancer un sous-agent. 97 évaluations, 74 tests.

## 2.12.1 — 22/11/2026

Correctif d'affichage : dans le bloc d'état, une issue au plafond des échecs d'environnement n'est plus attribuée à l'humain quand un arrêt confié aux agents est posé, comme dans le point des campagnes. 97 évaluations, 73 tests.

## 2.12 — 22/11/2026

Passerelle poste : relèves parallèles. Quand la relève principale est occupée, jusqu'à deux voies supplémentaires prennent d'autres tests Windows si la RAM libre et le CPU le permettent ; seule la relève principale règle l'imprimante et la veille. 97 évaluations, 73 tests.

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
