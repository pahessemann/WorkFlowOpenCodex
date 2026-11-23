# Cadrage interactif pour le développement

## Finalité

Transformer un sujet déjà exploré avec l’utilisateur en documentation fonctionnelle et
technique canonique, matrices complètes, milestones cohérents et issues Linear
directement exécutables. Le cadrage prépare le développement ; il ne développe
rien et ne crée aucune tâche applicative.

Cette commande suppose que le projet documentaire existe. La création ou la
migration de la structure Obsidian d’un projet relève d’un autre contrat.

## Commande

Utiliser :

```text
$dev cadrage [sujet] [projet]
```

Si le sujet est omis, reprendre le sujet cohérent actuellement discuté. Si la
discussion contient plusieurs sujets possibles, demander à l’utilisateur lequel doit
être formalisé avant toute lecture longue ou toute écriture.

L’invocation ou l’acceptation explicite d’une proposition de l’agent vaut GO pour
commencer l’analyse de cadrage. Elle ne vaut pas validation anticipée des
écritures Obsidian, du découpage ou de la publication Linear.

## Interaction par défaut (v2.2 : un seul lot de questions)

Paul reste maître du besoin, du périmètre et du découpage, mais n’intervient
qu’**une fois**. Effectuer sans interruption lectures, inventaires, analyses,
rapprochements et brouillons (resynthèse, matrices, milestones, issues), puis
présenter **un seul lot** regroupant :

1. la resynthèse et les écritures Obsidian prévues ;
2. toutes les questions sur les informations manquantes, chacune avec une
   **réponse proposée** ;
3. le découpage en milestones et en issues (vue compacte) ;
4. le contrat de campagne (section 9) ;
5. le paquet de publication Obsidian et Linear.

Pour chaque question : la recommandation, ses raisons, l’alternative qui change
réellement le résultat et la décision attendue. Paul valide, corrige ou complète
en une fois ; son **GO unique** fige le contrat et autorise les écritures
Obsidian et Linear décrites. Ne pas demander de GO pour une lecture ou une
préparation sans effet externe ; ne jamais transformer l’échange en validation
ligne par ligne.

## 1. Résoudre le projet et les sources

1. Résoudre le projet Codex par son identité réelle.
2. Lire le `PROJECT.md` du projet uniquement comme fiche de raccordement :
   projet Linear, racine Obsidian, branche principale, environnements,
   gates, surfaces sensibles et exceptions locales. Si son état est seulement
   `RACCORDEMENT`, poursuivre la formalisation fonctionnelle mais ne pas rendre
   le milestone prêt au développement avant que les paramètres nécessaires ne
   soient complétés et validés.
3. Résoudre le checkout canonique `vault-obsidian` en environnement local.
4. Lire `AGENTS.md` et `CONVENTIONS-VAULT.md` à la racine du vault avant
   toute proposition d’écriture.
5. Suivre les renvois de la convention uniquement pour les types de fichiers
   concernés. Pour un projet sous la structure actuelle, utiliser
   `_templates/tpl-projet-app/README.md` comme contrat de structure sans
   exécuter sa procédure de création.
6. Lire seulement les fiches du projet et les sources transverses nécessaires
   au sujet. Ne pas auditer tout le vault ni tout le code applicatif.


## 2. Resynthétiser la discussion

Extraire du fil courant sans recommencer la réflexion :

- le besoin et la valeur recherchée ;
- les utilisateurs et parcours concernés ;
- les décisions acquises ;
- le périmètre inclus et exclu ;
- les hypothèses ;
- les contraintes et invariants ;
- les questions encore ouvertes ;
- les idées reportées ou abandonnées.

Distinguer les faits sourcés, les décisions de l’utilisateur et les propositions de
l’agent. Ne rien inventer pour remplir un silence.

La resynthèse et les fichiers Obsidian qui seraient créés ou modifiés font partie
du lot unique de questions ; aucune écriture avant le GO unique.

## 3. Réinjecter les acquis dans Obsidian

Après validation, mettre à jour uniquement les surfaces concernées du projet :

- `01-FONCTIONNELLE` pour les usages, comportements, écrans et règles métier ;
- `02-DONNEES` pour les données, leurs sources, transformations et
  destinations ;
- `03-TECHNIQUE` pour l’architecture et les contrats techniques propres au
  projet ;
- `04-SECURITE` pour les acteurs, droits, données sensibles et frontières de
  confiance ;
- `05-INFRA` pour les environnements, services, comptes et accès ;
- `06-WORKFLOW` uniquement pour les particularités du projet, sans dupliquer
  le workflow transverse ;
- `vie-du-projet` pour la matière de réflexion, le cahier des charges et les
  décisions selon la convention du vault.

Préserver une synthèse lisible par un humain et placer le détail dense dans les
zooms prévus par la convention. Mettre à jour le journal seulement si la
convention l’exige pour les fichiers effectivement modifiés.

Pour le vault canonique, travailler dans le checkout local : aucun worktree,
aucune branche, aucun commit, aucun push et aucune PR. L’automatisation externe
conserve la responsabilité de Git.

## 4. Compléter les trois matrices canoniques

Effectuer une première passe avec les seules informations acquises :

| Matrice | Chemin relatif au projet Obsidian | Objet |
|---|---|---|
| Données | `02-DONNEES/02-Zoom-Donnees/04-matrice-donnees.md` | Sources, accès, transformations, destinations et preuves |
| Technique | `03-TECHNIQUE/02-Zoom-Technique/04-matrice-technique.md` | Sources autoritaires, versions, ressources, exécution et décisions déléguées |
| Environnements | `05-INFRA/02-Zoom-Infra/04-matrice-environnements.md` | Accès, actions autorisées ou interdites et validations par environnement |

Marquer les informations absentes, ambiguës ou contradictoires. Une ligne vide
ou `À définir` empêche la surface concernée d’être prête pour le
développement. `Sans objet` est acceptable seulement avec une justification.

### Contrats producteur–consommateur

Appliquer cette section uniquement lorsqu’une issue produit une donnée, une
action ou un état qu’une autre issue ou surface devra consommer. Ne créer ni
quatrième matrice, ni document supplémentaire : inscrire la vérité durable dans
les lignes applicables des matrices données et technique existantes.

Formaliser un contrat compact :

| Besoin consommateur | Producteur ou interface | Entrée | Réponse, états et erreurs | Droits | Preuve |
|---|---|---|---|---|---|

Les états vide, attente, réussite et erreur sont détaillés seulement lorsqu’une
interface doit réellement les afficher. Une information essentielle absente ou
`À définir` empêche l’issue consommatrice d’être déclarée prête.

Recopier dans Linear uniquement les lignes applicables :

- l’issue productrice reçoit le contrat qu’elle doit exposer et la preuve qu’un
  vrai consommateur peut l’utiliser ;
- l’issue consommatrice reçoit le même contrat, sa dépendance explicite envers
  l’issue productrice et ses états d’interface propres ;
- une issue sans consommateur distinct ne reçoit aucune section supplémentaire.

Le cadreur formalise ce contrat pendant le cadrage mais n’audite ni le
code, ni l’existence réelle des endpoints au lancement. Ce contrôle appartient
au développeur dans le contrat d’exécution concerné.

### Données legacy et couverture de l’API centrale

Pour toute donnée issue d’une application legacy :

1. rechercher d’abord son exposition dans l’API centrale ou le service officiel ;
2. distinguer dans la matrice l’accès de l’application en runtime et l’accès
   d’investigation du développeur ;
3. si la couverture paraît absente ou ambiguë, définir une investigation en
   lecture seule avec la base, l’environnement, la référence d’accès et la
   preuve attendue, sans consigner de secret ;
4. interdire toute écriture, modification de schéma ou connexion directe de
   l’application à la base SQL Server legacy ;
5. si le manque est confirmé, proposer l’évolution de l’API centrale, son projet
   propriétaire, sa dépendance et son caractère bloquant pour le milestone.

Une inspection legacy sert à comprendre la source ou à démontrer un manque de
couverture. Elle ne constitue jamais une architecture applicative acceptable.

### Sécurité selon les surfaces

Pendant le cadrage, appliquer uniquement les invariants correspondant aux
surfaces du besoin et les transmettre dans le milestone ou les issues
concernées :

- cloisonnement et contrôle des droits côté serveur par entreprise, dossier ou
  utilisateur ;
- absence de JWT manipulé ou stocké par un frontend web lorsque
  l’authentification repose sur un cookie HttpOnly ;
- stockage des jetons mobiles dans `SecureStore` ou un stockage chiffré
  équivalent ;
- absence de création de JWT par un backend si `auth-central` en est
  l’émetteur ;
- absence de secret, token, cookie, DSN ou donnée sensible dans le code, les
  commits, les logs et les preuves.

Mapper les composants concernés dans les surfaces sensibles de `PROJECT.md`.
Ne pas recopier dans une issue les invariants qui ne concernent pas son delta.

## 5. Conduire les ateliers ciblés

Construire les questions à partir des lacunes réelles des fiches et matrices,
pas à partir d’un questionnaire générique. Grouper les questions par décision
cohérente et proposer une recommandation lorsqu’elle est raisonnablement
déductible.

Couvrir selon le besoin :

- comportements fonctionnels et cas limites ;
- surfaces et contrats techniques ;
- sources et qualité des données ;
- services internes, API internes et applications legacy ;
- couverture des données nécessaires par l’API centrale et éventuelle investigation
  legacy autorisée en lecture seule ;
- environnement local, sandbox et production ;
- comptes de test, utilisateurs, administrateurs, rôles et permissions ;
- secrets ou accès requis, sans jamais les afficher ni les consigner ;
- scénarios de recette et preuves attendues ;
- dépendances, sécurité et infrastructure ;
- caractère bloquant ou non de l’absence d’un environnement, d’un accès ou
  d’une preuve.

Reporter les réponses dans les brouillons des fiches et matrices. Ne pas écrire
une nouvelle version dans Obsidian sans la validation prévue au paquet final,
sauf si l’utilisateur demande explicitement une capitalisation intermédiaire.

## 6. Proposer les milestones

Présenter le découpage recommandé avant de rédiger les issues complètes :

| Milestone | Objectif | Inclus | Hors périmètre | Dépendances | Résultat vérifiable |
|---|---|---|---|---|---|

Expliquer les arbitrages qui ont conduit à fusionner, scinder ou ordonner les
milestones. Ce découpage fait partie du lot unique de questions.

Après validation du découpage, rédiger chaque description avec le modèle de
milestone déclaré dans `PROJECT.md`, dont le modèle canonique est
`templates/MILESTONE.md`. Le milestone contient une seule fois le
résultat partagé, le périmètre, les décisions canoniques, les lignes communes
des trois matrices, le contrat d’environnement, la carte des dépendances et les
critères globaux de recette.

## 7. Proposer les issues

Pour chaque milestone accepté, présenter d’abord une vue compacte :

| Issue | Objectif | Surface | Dépendances | Critères principaux | Environnement et preuves |
|---|---|---|---|---|---|

Les descriptions complètes sont rédigées en brouillon et publiées après le GO
unique. Utiliser ensuite les modèles du skill : `templates/ISSUE-milestone.md` pour une issue ordinaire
et `templates/ISSUE-review-milestone.md` pour la dernière issue.
Chaque issue ordinaire est un delta autonome : elle reprend uniquement les
décisions et lignes de matrices qui lui sont applicables afin que le
développeur n’ait pas à relire le vault ni à reconstituer le besoin. Elle ne
répète ni le contrat partagé du milestone, ni les règles de workflow. Pour les
validations techniques, elle référence les identifiants de gates existants de
`PROJECT.md` et ne recopie pas leurs commandes ; elle détaille seulement ses
scénarios fonctionnels, sandbox ou métier propres.

Pour chaque issue ordinaire, renseigner explicitement le statut de la recette
développeur dans le modèle : `REQUISE` lorsqu’un parcours utilisateur, une
validation d’interface ou une authentification apporte une preuve nécessaire à
l’acceptation ; sinon `SANS OBJET — <raison>`. La seule présence d’un frontend,
d’identifiants ou d’un environnement ne rend pas la recette obligatoire.

Proportionner la recette à l’issue. Pour une retouche de composant ou une
petite issue d’interface, la recette développeur se limite par défaut à une
vérification visuelle dans Storybook ou dans la page, avec captures, et aux
tests ciblés. L’accessibilité se vérifie dans la page (texte complet présent,
nom accessible), jamais avec un lecteur d’écran réel. N’ajouter aucune exigence
de test, de navigateur ou d’accessibilité que l’utilisateur n’a pas demandée.
Seules les preuves principales de l’acceptation peuvent bloquer : ne jamais
écrire qu’une preuve secondaire absente bloque la recette.

Pour une recette `REQUISE`, lire et appliquer uniquement
[`recette-developpeur.md`](recette-developpeur.md), puis inscrire dans l’issue
les parcours bornés, l’environnement, chaque profil ou rôle sans secret, les
actions, le résultat, les régressions concernées et la preuve attendue. Cette
recette développeur reste distincte de la recette de Paul ou de l’orchestrateur de campagne (recette de Milestone).

Lorsqu’un contrat producteur–consommateur est applicable, ajouter à l’issue la
section conditionnelle suivante, sans recopier les matrices complètes :

```markdown
## Contrat de consommation — si applicable

- Rôle : producteur | consommateur
- Surface et issue liées :
- Lignes contractuelles applicables :
- Preuve attendue :
```

Omettre entièrement cette section lorsqu’elle est sans objet.

Si une issue dépend d’une donnée legacy, elle précise l’API ou le service à
utiliser par l’application, l’éventuelle inspection en lecture seule autorisée
au développeur, la preuve d’un manque de couverture et la conduite attendue.
Une modification de l’API située hors du dépôt ou du périmètre courant devient
une dépendance explicite ; elle n’est pas absorbée silencieusement par l’issue.

La dernière issue vérifie l’intégration globale depuis la branche principale, après fusion
des issues précédentes : interactions, scénarios transverses et critères du
milestone. Elle réutilise les preuves valides et applique les gates et la revue
à son propre diff éventuel, sans refaire les revues de chaque issue ni exiger
une PR unique de milestone.

Ne jamais prendre la structure d’anciennes issues Linear comme modèle. Elles
peuvent révéler un manque à éviter, mais seuls les trois modèles du workflow
cible déterminent la structure publiée.

## 8. Valider et publier le paquet final

Présenter en une seule fois :

- les fichiers Obsidian à créer ou modifier ;
- les trois matrices et leurs éventuels restes ;
- les milestones et issues à créer ou modifier dans Linear ;
- les dépendances ;
- les environnements, comptes, accès et preuves attendues ;
- les points restant ouverts et leur caractère bloquant ou non.

Avant cette présentation, contrôler le paquet complet :

- aucun placeholder, champ vide ou `À définir` ne subsiste ;
- chaque `Sans objet` est justifié ;
- aucune décision produit, architecture ou sécurité indispensable ne reste
  ouverte ;
- tout usage d’une sandbox, d’un service ou de données réelles précise
  l’environnement, les comptes ou rôles, la référence d’accès, la preuve et la
  conséquence d’une indisponibilité ;
- chaque issue ordinaire déclare une recette développeur `REQUISE` complète ou
  `SANS OBJET` avec une justification ;
- toute donnée legacy précise son chemin d’accès applicatif par l’API centrale, et
  toute investigation directe éventuelle est autorisée en lecture seule,
  bornée et distincte du fonctionnement de l’application ;
- la carte des dépendances est cohérente et la revue finale dépend de toutes les
  issues applicables ;
- chaque identifiant de gate référencé existe dans `PROJECT.md` et les gates
  finales ou conditionnelles utiles sont couvertes ;
- le milestone porte le contexte partagé une fois et les issues uniquement
  leurs deltas ;
- aucun secret n’est consigné et aucune règle générique du workflow n’est
  recopiée dans Linear.

Le GO final autorise les écritures Obsidian et Linear exactement dans ce
périmètre. Effectuer ces écritures dans le chat `🟣 CADRE`, sans
créer d’agent ou de discussion intermédiaire, puis relire les objets modifiés.
Les écritures Obsidian suivent la section « Synchronisation du vault » de `references/ingestion.md` : `vault.mjs lire` avant, puis `vault.mjs envoyer`.

Rendre l’un des verdicts :

- `PRÊT POUR $dev campagne composer` (ou `$dev milestone <projet> <ms-id>`) si le milestone et ses issues sont
  publiés, cohérents et autonomes, avec `$dev issue <identifiant>` disponible
  si l’utilisateur choisit une progression bornée issue par issue ;
- `CADRAGE À COMPLÉTER` si l’utilisateur choisit de conserver des questions ouvertes ;
- `CADRAGE BLOQUÉ` si une convention, une matrice, une source, un accès ou une
  décision indispensable manque.

Après le verdict, le GO de cadrage vaut autorisation pour tout ce que le
contrat couvre : `$dev campagne composer` puis `$dev campagne lancer` peuvent
suivre sans nouvelle validation (3 motifs d’interruption seulement).

## Surface UI raccordée au Design System

Si le besoin concerne la création, migration ou mise à jour d’une page raccordée
au Design System, appliquer [ui-cadrage.md](ui-cadrage.md) lors du découpage.

## 9. Contrat de campagne

Linear reste la source de vérité : critères d’acceptation dans la description de
chaque issue, relations `Blocked by` réelles, milestones et projet. Le contrat
(`.pilote/campagnes/<nom>.contrat.md`, 2 pages maximum) n’ajoute que ce que
Linear ne porte pas :

1. mandat et résultat attendu, vérifiable ;
2. périmètre inclus et **exclu** ;
3. critères d’acceptation : **lien vers les issues Linear uniquement** ;
4. règles de décision tranchables par l’agent, avec leur option par défaut ;
5. lignes rouges (par défaut les 3 motifs : action irréversible, hors mandat,
   circuit-breaker) ;
6. questions tranchées pendant le cadrage.

Un résumé du contrat est placé dans la description du projet ou du milestone
Linear, avec le chemin du fichier.

**Criticité par issue** : fixer `leger`, `standard` ou `sensible` dans chaque
issue selon la règle de proportionnalité (`modeles.md` §0) : une tâche triviale
est `leger`, même dans une campagne sensible.

**Comptes de recette** : pour chaque issue dont la recette développeur est
`REQUISE` avec authentification, vérifier qu’une réserve existe sur l’hôte
d’exécution (`comptes-recette.md`). Sinon, le signaler dans le lot de questions :
sans réserve, l’issue ne sera pas admise.

**Définition de « prêt »** : une issue n’entre dans une campagne que si elle a des
critères d’acceptation ; sinon le cadrage les rédige et Paul les valide dans le
même lot.

**Pas de modèle dans une issue.** Une issue ne nomme jamais de modèle. Elle indique la tâche (dev, choix-visuel, prototype…) et la criticité ; le routeur (`node <pilote> modele`) choisit le modèle. Une mention trouvée dans une fiche est ignorée par `pilote.mjs ouvrir` et signalée dans le digest, sans jamais arrêter le travail.

**Chat de travail** : créé par `node <pilote> chat-travail CADRE <projet> <objet> --modele <node <pilote> modele cadrage <criticite> <volumetrie>> --consigne-fichier <f>`, jamais par l'outil de création de chat de l'application ; accès de l'hôte appliqué à chaque tour ; en accès restreint, aucune demande d'élévation (SKILL.md §2).

**Lancé depuis n’importe quel chat.** `$dev cadrage <sujet>` tapé dans un chat dont le modèle n’est pas celui du routeur (ex. AIDE sur Luna) est délégué par le lanceur : un chat `🟣 CADRE` sur Opus est créé dans `03 Cadrage & prototypes` (ou rouvert s’il existe), avec la fiche de lancement pour seul contexte (`lanceur.md`).

## Issue publiée pour une campagne en cours (v2.6.2)

Si le cadrage publie une issue destinée à une campagne déjà lancée (mandat de Paul, correctif), le cadreur
l'y inscrit lui-même : `node <pilote> campagne ajouter <campagne> <ID> --motif "<mandat ou décision>"
[--bloquee-par ID,ID]`, sur l'hôte d'exécution. L'orchestrateur l'admet au réveil suivant.

v2.20.1 : dans les items de la campagne, marquer `poste_requis: true` une issue qui se livre ou se recette depuis le poste Windows ; `$dev point` la compte alors « en attente du poste » au lieu de la chiffrer en heures d’agents.
