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
- **Recette d'une issue, avant clôture** : un sous-agent démarré à neuf (`pilote.mjs modele revue ... --sous-agent`) lit la fiche Linear et dresse la matrice de couverture : une ligne par critère d'acceptation, par ligne de scénario de recette et par décision applicable. Chaque ligne a un contrôle qui **joue le scénario** (saisir, modifier, changer d'entreprise, recharger, refuser, annuler) ; vérifier qu'une page, une carte ou un onglet s'affiche ne couvre pas un scénario. La matrice est écrite dans `<dossier de preuves>/<ID>.recette.json` : `{ "issue": "<ID>", "criteres": [ { "critere", "controle", "resultat": "ok" | "echec" | "non_applicable", "preuve", "justification" } ] }`. `non_applicable` exige une justification (ex. tablette physique réservée à Paul). La clôture se fait par `pilote.mjs statut <campagne> <ID> close <matrice.json>` : sans matrice, ou avec un critère en échec ou non justifié, elle est refusée. Une revue finale de Milestone exige en plus ses gates `final:*` vertes sur le SHA final.



**Charge lourde (verrou réel)** : suite de tests complète, build complet, Docker, runtime de recette ou migration SQL se lance uniquement par `node <pilote> lourde <campagne> -- <commande>`. Plusieurs en parallèle selon l'hôte : sur atelier, 4 par campagne (`admission.lourdes_max`), 8 au total sur l'hôte (`lourdes_max_hote`, un par cœur) et seulement si 6 Gio de mémoire restent disponibles (`garde_ram_lourde_gio`) ; sur le poste, 1. Au-delà, la commande attend son tour. Les tests ciblés d'une issue n'en sont pas.

**Chat de travail** : créé par `node <pilote> chat-travail TEST <projet> <objet> --modele <node <pilote> modele recette-milestone <criticite> <volumetrie>> --consigne-fichier <f>`, jamais par l'outil de création de chat de l'application ; accès de l'hôte appliqué à chaque tour ; en accès restreint, aucune demande d'élévation (SKILL.md §2).
