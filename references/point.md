# Point des campagnes — `$dev point [campagne…]` (v2.6)

Une commande, toujours le même rendu : où en sont les campagnes, ce qui bloque, qui débloque,
ce que Paul doit faire, et le temps restant. Lecture seule : elle n'écrit rien (test dédié).

## Où la lancer

- Dans `❓ AIDE` : AIDE l'exécute lui-même, seule exception à sa délégation, car elle n'écrit rien.
- Dans tout chat du workflow, `🏛 ARCHI` compris. Pas de chat dédié.
- Commande : `node <pilote> point [campagne…] --texte`, puis recopier la sortie telle quelle, en texte normal (ni bloc de code, ni `<pre>`), sans rien
  ajouter ni retirer. Sans nom : toutes les campagnes `en_cours` ; avec des noms : celles-ci, même en pause.
- Les tâches hors campagne sont vérifiées séparément lorsque Paul le demande : consulter les chats de travail non archivés et leur dernier état sur les deux hôtes, sans en déduire une activité à partir du seul titre ; signaler les états invérifiables.
- Sur le poste, le script interroge atelier par SSH (`registre_distant`) ; les chiffres sont ceux d'atelier.

## Rendu (ordre fixe)

1. **Campagnes** : avancement (closes / total), clôtures des 24 dernières heures, issues restantes, temps restant.
2. **Blocages** : une ligne par issue arrêtée, avec **qui débloque** : `Toi`, `agents`, `poste`, `environnement`,
   ou `à qualifier` (avec la dernière ligne du journal de l'issue : le point ne devine jamais).
3. **Ce que tu dois faire** : toutes campagnes confondues, sans doublon, trié par nombre d'issues débloquées
   (l'issue et toutes celles qui en dépendent).
4. **Ressources** de l'hôte : RAM libre, charge, attente CPU, places d'admission occupées par campagne. Juste au-dessus (v2.17),
   **Abonnement** : pourcentage de la semaine Anthropic du compte actif et vitesse en points par heure, fenêtre Fable, Codex,
   dates de remise à zéro et mode de fournisseur (`auto → mixte` quand le mode auto a basculé).
5. **État par campagne** (v2.10) : le bloc d'état de chaque campagne (👤 Toi en premier), le même que celui des orchestrateurs.
6. **Ligne d'état** du point : `⏸ À TOI` s'il reste une action de Paul, sinon `✅ TERMINÉ`.

Sans `--texte` : le JSON complet (`campagnes`, `actions_paul`, `ressources`, `ligne_etat`, `rendu`).

## Qui débloque : le champ `arret` des issues

L'orchestrateur le renseigne chaque fois qu'il arrête une issue (`bloquee`, ou `revue`/`recette` qui attend
autre chose que son propre travail) :

- `pilote.mjs statut <campagne> <ID> <statut> --attend paul|agents|poste|env --quoi "<cause courte>"` ;
- `pilote.mjs arret <campagne> <ID> --attend … --quoi …` qualifie sans changer le statut (ni solder un retour
  du poste) ; `--lever` efface l'arrêt.
- `--attend paul` exige une ligne « Conclusion du cadreur : … » au journal de l'issue (`CADREUR REQUIS`, v2.9), sauf
  `--reserve "<motif>"` (irréversible ou root, secret à fournir, hors mandat). La ligne d'état liste ces issues dans
  « Toi : décider pour … », et `places` donne aussi `ouvertes` / `ouvertes_max`.
- Pour `paul`, `--quoi` donne l'action exacte et, pour une décision, la réponse proposée :
  « Choisir le moteur Word (proposé : HtmlToOpenXml) ».
- Un changement de statut sans `--attend` lève l'arrêt. `contexte` liste `a_qualifier` (issues `bloquee`
  sans arrêt) : l'orchestrateur les qualifie à sa reprise.

Sans arrêt renseigné, le script déduit seulement ce qu'il sait : issue retirée du poste ou poste à débloquer
→ `Toi` ; issue au poste → `poste` ; autre issue `bloquee` → `à qualifier`.

## Temps restant

En **heures de travail des agents** (temps écoulé, places actuelles comprises), en fourchette de 0,75 à 1,5 fois
l'estimation centrale, dans deux cas :

- **si tes actions sont faites** : toutes les issues non closes ;
- **sinon** : sans les issues qui attendent Paul et celles qui en dépendent, avec le **plafond** des issues
  atteignables sans lui.

Base de calcul (v2.13.1) : d'abord le **débit réel**, si au moins 3 issues ont été closes sur la fenêtre de mesure (24 h, ou
depuis la première admission pour une campagne plus jeune) : temps par issue = fenêtre / clôtures. Sinon, à partir de 5 issues
mesurées (`admise_le` posé par `ouvrir`, `close_le`), durée médiane divisée par le **parallélisme mesuré** (heures d'issues
closes / fenêtre où elles ont tourné, plafonné à `dev_max`) ; sinon, rythme de clôture depuis le lancement. Le nombre de
places occupées à l'instant du point n'entre plus dans le calcul : il faisait varier l'estimation d'un facteur 6 d'un point à
l'autre. **Plancher** : jamais moins que la plus longue chaîne de dépendances restante × la durée médiane. Fiabilité : `faible` sous
5 mesures, `moyenne` sous 15, `bonne` au-delà.

v2.20 : sous la ligne **Abonnement**, une ligne **Comptes Anthropic** (pourcentage, compte actif, remise à zéro), avec 🔥 quand un compte offre une fenêtre à consommer (`modeles.md` §v2.20).

v2.20.1 : **Temps restant** ne chiffre que le travail des agents. Une issue de livraison ou de recette au poste (`poste_requis: true` dans les items de la campagne, issue déposée à la passerelle, ou arrêt `--attend poste`) est comptée à part : « 3 à 6 h + 2 en attente du poste », ou « en attente du poste (DEV-x, DEV-y) » quand il ne reste qu’elles. L’unité est la durée médiane des issues déjà closes, ou le débit des 24 dernières heures, jamais le temps écoulé depuis le lancement : le total ne grimpe plus avec l’horloge. « estimation faible » ne qualifie que la part chiffrée.

v2.20.2 : **Blocages** en deux parties : « 👤 À toi » (arrêts `--attend paul` : issue, campagne, ce que tu dois faire), puis « 🤖 Les agents s’en chargent seuls » (agents, poste Windows, à qualifier ; cause raccourcie à 110 caractères).
