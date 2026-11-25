# Ingestion du bilan d’un développement

## Déclencheur

Charger ce contrat uniquement après réception de la synthèse terminale d’un
développeur confirmant que le merge autorisé d’une issue ou d’une itération a
réellement eu lieu et donnant le lien de l’issue de clôture
ainsi que celui de la pull request.

Une difficulté en cours de développement, une demande de recette ou un travail
non mergé ne déclenche pas cette ingestion.

## Déclencheur v2.2

L’ingestion n’a lieu qu’après la **fusion vers `main`** : pour une issue de Milestone,
après la recette verte du Milestone et la fusion de sa PR finale ; pour un
`issue_standalone`, après la fusion de sa PR. Le bilan préparé par `$dev finaliser`
(`.pilote/bilans/<ID>.md`) est la source. Un travail qui n’atteint jamais `main`
n’entre jamais dans le vault. Le sous-agent `obsidian` (modèle donné par
`pilote.mjs modele ingestion <criticite> compact`) réalise l’ingestion.

## Fermeture de l’issue

Après l’ingestion : `node <pilote> rendre <campagne> <ID>` (rend le
compte de recette éventuel), puis `pilote.mjs statut <campagne> <ID> close`. Si un
chat `🔵 DEV` existait (blocage ou lancement manuel), il reçoit `✅` et part dans
`99 Archives` au passage suivant de `$dev nettoyeur`. Un refus est seulement
reporté dans la sortie, sans enquête ni nouvel essai.

Exception : une revue terminale explicitement validée sans diff fournit le
SHA de base, ses preuves transverses et les PR déjà intégrées ; elle suit la
même ingestion sans prétendre avoir créé ou fusionné une nouvelle PR.

Dans une campagne, l’orchestrateur fait ingérer directement selon le contrat de
campagne ; aucun relais vers l’utilisateur. Après `INGÉRÉ`, il conserve une
ligne de synthèse et reprend l’issue suivante du lot. Si le bilan de revue
terminale démontre tous les critères du milestone et ses issues terminées,
actualiser son état terminal disponible dans Linear, sans reclôturer les issues.

## Sources autorisées

Lire uniquement :

- la synthèse terminale reçue ;
- le commentaire canonique `Bilan de clôture de l’issue` de l’issue exécutée,
  y compris l’issue de revue finale d’un milestone, ou `Bilan de clôture de
  l’itération` de l’unique issue d’itération ;
- le `PROJECT.md` pour résoudre la racine documentaire et ses exceptions ;
- la convention du vault et les seules notes qui doivent réellement être
  mises à jour.

Ne pas relire les autres issues, la tâche développeur, le code, les commits ou
les preuves déjà validées. Le bilan Linear et la pull request conservent le
détail d’exécution.

## Ingestion bornée

1. Extraire les capacités réellement livrées, les écarts au cadrage, les
   décisions durables de développement ou de recette, les restes et risques,
   leurs impacts documentaires et leur effet sur les prochains milestones.
   Si un contrat producteur–consommateur réellement livré diffère des lignes de
   cadrage, mettre à jour uniquement les lignes concernées des matrices données
   ou technique ; les tests et preuves d’exécution restent dans Linear et la
   pull request.
   Si le bilan contient `Évolution de l’environnement`, relever uniquement les
   clés, fichiers et actions restantes. Ne jamais lire, demander, recopier ou
   documenter leur valeur ; le développeur reste responsable de la
   synchronisation de `.env.local` vers le checkout canonique.
2. Résoudre la racine Obsidian déclarée dans `PROJECT.md`, lire la convention
   du vault et appliquer uniquement les exceptions structurelles explicites du
   projet.
3. Écrire dans le checkout canonique du vault résolu depuis `PROJECT.md`, sans
   worktree, branche ni pull request : `vault.mjs lire` avant d’écrire, puis
   `vault.mjs envoyer` avec les seuls fichiers modifiés, selon la règle
   « Synchronisation du vault » ci-dessous.
4. Si une information contredit le cadrage ou exige une décision de l’utilisateur pour
   la suite, la signaler sans rouvrir le développement fusionné. Sinon, ne
   demander aucune validation.
5. Ne renvoyer aucun message au développeur et ne transformer cette ingestion
   en surveillance ou en nouvelle phase de revue.

## Routage documentaire

Deux écritures sont systématiques après un développement fusionné :

- `00-ACCUEIL.md` : état courant, dernière action et prochaine action ;
- `log/log.md` : entrée compacte conforme à la convention, avec les références
  de la dernière issue et de la pull request.

Les autres écritures dépendent uniquement d’un changement durable :

| Information | Destination relative au projet |
|---|---|
| Fonctionnalité ou comportement | `01-FONCTIONNELLE` |
| Source, flux ou contrat de données | `02-DONNEES` |
| Architecture ou contrat technique | `03-TECHNIQUE` |
| Autorisation, secret ou donnée sensible | `04-SECURITE` |
| Environnement, service ou accès | `05-INFRA` |
| Particularité de workflow du projet | `06-WORKFLOW` |
| Justification durable sans cible existante | `vie-du-projet/03-reflexions` |
| Décision architecturale consolidée | `vie-du-projet/07-decisions` |

Privilégier une fiche ou un zoom existant. Ne créer une note qu’en l’absence de
cible adaptée, avec le template et le frontmatter canoniques. Mettre à jour
`derniere_maj` sur chaque note touchée et sur `00-ACCUEIL.md`.

Ne modifier ni la genèse, ni le cahier des charges. Ne créer aucune note
récapitulative de milestone, d’issue ou d’itération.
`vie-du-projet/05-publications` et `vie-du-projet/06-rapports-qualite` restent
hors de la clôture ordinaire.

Si aucune vérité durable ne change, limiter l’ingestion aux deux écritures
systématiques.

## Sortie

Répondre brièvement avec :

- `INGÉRÉ` ;
- la ligne de fermeture de l’unité ;
- les fichiers modifiés ;
- les impacts retenus sur la suite ;
- la seule décision attendue de l’utilisateur, uniquement si elle est indispensable.

## Synchronisation du vault

Le vault Obsidian est partagé et modifié directement sur sa branche principale,
sans branche ni pull request. Avant toute lecture ou écriture :
`node scripts/vault.mjs lire` (récupère la dernière version, replace les commits
locaux par-dessus). Pour enregistrer : `node scripts/vault.mjs envoyer -m "<message>"
<fichiers>`, avec les seuls fichiers modifiés (chemins relatifs ou `vault:<chemin>`).
Si l’envoi est refusé parce que le vault a avancé, le script intègre et réessaie
(trois tentatives au plus). Un vrai conflit est annulé proprement : le commit
local est conservé et la décision revient à l’utilisateur, dans le digest. Jamais d’envoi
forcé. Le chemin du vault est lu dans `poste.local.json` (`vault`).
