# Recette et tests — `$dev test <projet>`

- **Tests ciblés d'une issue** : sous-agent `tests` (Haiku) : lance les contrôles
  déclarés dans `PROJECT.md`, résume les échecs (première erreur, stack, tests en
  échec ; aucun log brut de plus de 2k tokens).
- **Recette de Milestone** : une seule fois, sur le SHA final de `codex/ms-<slug>` :
  suite complète, non-régression, revue globale sur le diff, bilan. Elle se fait dans un
  chat `🧪 TEST · <projet> · ms <slug>` lancé par `pilote.mjs` avec Sonnet
  (`pilote.mjs modele recette-milestone standard compact`), rangé dans
  `04 Relais & maintenance`. C'est une charge lourde (1 à la fois).
- **Recette sur atelier** : dispositifs décrits dans `recette-atelier.md` et règles
  d'exécution du `PROJECT.md` du projet.
- Preuves : commande exécutée et code de sortie, ou extrait de log pertinent.
- **Réutilisation vérifiée (v2.23)** : le recetteur indépendant peut citer une preuve existante, y compris celle du développeur, si elle est accessible, complète, réussie et rattache exactement le scénario, le SHA testé, la commande et les paramètres, l'environnement et les dépendances concernés. Il vérifie lui-même sa pertinence et la référence dans chaque ligne de matrice ; un scénario incomplet, une preuve absente, périmée ou dont l'équivalence est incertaine est joué. La revue du diff reste indépendante et la suite complète finale sur le SHA intégré reste exigée ; ne pas déduire qu'un scénario est couvert de la seule présence d'une capture.
- **Recette d'une issue, avant clôture** : un sous-agent démarré à neuf (`pilote.mjs modele revue ... --sous-agent`) lit la fiche Linear et dresse la matrice de couverture : une ligne par critère d'acceptation, par ligne de scénario de recette et par décision applicable. Chaque ligne a un contrôle qui **joue le scénario** (saisir, modifier, changer d'entreprise, recharger, refuser, annuler) ; vérifier qu'une page, une carte ou un onglet s'affiche ne couvre pas un scénario. La matrice est écrite dans `<dossier de preuves>/<ID>.recette.json` : `{ "issue": "<ID>", "criteres": [ { "critere", "controle", "resultat": "ok" | "echec" | "non_applicable", "preuve", "justification" } ] }`. `non_applicable` exige une justification (ex. tablette physique réservée à Paul). La clôture se fait par `pilote.mjs statut <campagne> <ID> close <matrice.json>` : sans matrice, ou avec un critère en échec ou non justifié, elle est refusée ; elle l'est aussi tant que la branche de l'issue n'est pas fusionnée dans la branche principale (`CLÔTURE SANS FUSION`, v2.8.4 ; `--sans-fusion "<motif>"` pour une issue sans code livré). Une revue finale de Milestone exige en plus ses gates `final:*` vertes sur le SHA final.



**Charge lourde (verrou réel)** : suite de tests complète, build complet, Docker, runtime de recette ou migration SQL se lance uniquement par `node <pilote> lourde <campagne> -- <commande>`. Plusieurs en parallèle selon l'hôte : sur atelier, 4 par campagne (`admission.lourdes_max`), 6 au total sur l'hôte (`lourdes_max_hote`, pour garder de la marge de CPU) et seulement si 6 Gio de mémoire restent disponibles (`garde_ram_lourde_gio`) ; sur le poste, 1. Au-delà, la commande attend son tour. Les tests ciblés d'une issue n'en sont pas.

**Chat de travail** : créé par `node <pilote> chat-travail TEST <projet> <objet> --modele <node <pilote> modele recette-milestone <criticite> <volumetrie>> --consigne-fichier <f>`, jamais par l'outil de création de chat de l'application ; accès de l'hôte appliqué à chaque tour ; en accès restreint, aucune demande d'élévation (SKILL.md §2).

## Voie de recette dédiée (v2.7)

`$dev campagne voie-recette <campagne>` ouvre un chat `🧪 TEST · <projet> · recettes <campagne>` (Sonnet). L'orchestrateur passe
en `recette` une issue dont le code est fait et la revue favorable ; la voie prend ces issues et les `fusionnee`
(`node <pilote> recettes <campagne>`, triées par nombre d'issues retenues), joue leur recette par sous-agents (6 au plus,
charges lourdes par `pilote.mjs lourde`, Windows par la passerelle), puis clôt avec la matrice ou renvoie l'issue en
`en_cours` avec la cause au journal. Ces issues ne comptent pas dans les places de l'orchestrateur. Le réveil relance la
voie comme un orchestrateur (sur changement, sinon une fois par heure) ; elle n'est jamais archivée tant que la campagne
est en cours.
