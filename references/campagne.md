# Campagne — composer, lancer, piloter

Contrat de `$dev campagne composer` et `$dev campagne lancer`. Lire aussi
`SKILL.md` §3 et le contrat de campagne (`.pilote/campagnes/<nom>.contrat.md`).

## Composer (brouillon, sans agent)

1. `node <pilote> campagne composer <nom> <projet> <MS|ID...> [--depuis <items.json>]`.
   Le script crée ou complète `.pilote/campagnes/<nom>.json` en `brouillon`.
2. L'agent développe chaque milestone en ses issues depuis Linear et fournit
   `items.json` (identifiant, criticité, `blocked_by`, branche, SHA de départ validé).
   Chaque `DEV-XX` isolé devient un `issue_standalone`.
3. Poser le label Linear `campagne:<nom>` (état seulement : aucun contenu d'issue modifié).
4. Générer la carte de dépôt `.pilote/carte/<projet>.md` (2k tokens maximum,
   modèle : `pilote.mjs modele lecteur leger large`).

## Lancer

`node <pilote> campagne lancer <nom> auto|supervise` refuse sans contrat
validé (`contrat_valide: true`). Il passe la campagne `en_cours` et rend le titre et
la carte d'identité du chat `🟢 AUTO` ou `🟠 SUP` à ouvrir dans `01 Campagnes`.
Resynchroniser Linear : une issue ajoutée après le cadrage et non couverte par le
contrat est mise de côté et signalée dans le digest.

## Piloter (orchestrateur)

- Admettre les issues éligibles : dépendances closes, fichiers critiques non
  partagés, limites d'admission (`SKILL.md` §4), réserve de comptes présente si la
  recette authentifiée l'exige.
- Chaque issue : `pilote.mjs ouvrir` (préflight), puis un sous-agent `dev` avec le
  modèle de `pilote.mjs modele dev <criticite> <volumetrie> <campagne> --sous-agent`.
- Revue : sous-agent Opus démarré à neuf (diff, fiche, critères). Tests : sous-agent Haiku.
- Statuts uniquement par `pilote.mjs statut` (liste fermée, `etats.md`) ; chaque échec
  par `pilote.mjs essai <campagne> <ID> echec` (circuit-breaker à 3).
- Issue arrêtée (`bloquee`, ou `revue`/`recette` qui attend autre chose que ton travail) : dis qui la
  débloque, `pilote.mjs statut … --attend paul|agents|poste|env --quoi "<cause>"` ou `pilote.mjs arret …`
  sans changer le statut ; pour Paul, l'action exacte et la réponse proposée. Qualifie aussi chaque issue
  de `a_qualifier` (`contexte`) à ta reprise. `$dev point` en dépend (`point.md`, v2.6).
- Fusions dans `codex/ms-<slug>` sans GO. Recette de Milestone : chat `🧪 TEST` Sonnet
  (`test.md`). PR finale vers `main` : automatique si recette verte, revue favorable et
  `main_deploie: false` ; sinon `⏸ GO`.
- Toute décision prise seul : une ligne dans `.pilote/campagnes/<nom>.decisions.md`.
- Avant tout blocage : cadreur de déblocage (`blocages.md`, v2.6.3) ; l'orchestrateur lance avec `--depuis-role AUTO`
  (ou `SUP`), le lanceur ne lui répond jamais `executer_ici`.
- Issue à ajouter en cours de campagne (cadreur, décision de Paul) : `pilote.mjs campagne ajouter <campagne> <ID…>
  --motif "<décision ou clause du contrat>" [--bloquee-par ID,ID] [--milestone slug]`, jamais en modifiant le JSON
  à la main ; la ligne au journal est écrite par le script (v2.6.2).
- Digest quotidien : `$dev digest <nom>` (Haiku, 15 lignes).
- Réveil (v2.6.5) : vérification toutes les 10 min, sans token. Un orchestrateur au repos est relancé si l'état de sa
  campagne a changé (statut, retour du poste, ligne de journal, commit d'une issue active), sinon une fois par heure
  (`reveil.relance_sans_changement_min`, 60) ; toutes les 20 min (`reveil.relance_admission_min`) tant qu'une admission est possible :
  place libre, attente CPU sous la garde, issue admissible (v2.8.3). Essai sans effet : `ouvrir … --a-blanc` (`--dry-run` accepté). Ne termine donc pas un tour en laissant des issues de `a_relancer` sans agent.

## Passerelle poste et ligne d'état (v2.5)

- Une recette qu'atelier ne peut pas faire part au poste Windows : `node <pilote> poste deposer <campagne> <ID> --fiche <f>` (`poste.md`). L'issue sort du quota et apparaît dans `au_poste` de `contexte` ; elle n'est jamais relancée par l'orchestrateur.
- Les retours arrivent dans `retours_poste` : lire `retour.md` et les preuves, clore si la matrice est complète, sinon noter la cause et redéposer. Tout changement de statut solde le retour.
- Une issue de `poste_a_debloquer` a atteint le plafond des échecs d'environnement au poste : ne la redépose pas, elle attend une action de Paul (v2.5.4). Une admission peut être différée par la garde CPU : réessaie au réveil suivant.
- Une issue de `exclues_poste` a été retirée de la passerelle par Paul : ni redéposée, ni admise ; elle attend Paul (`poste retirer`, v2.5.1).
- Chaque message final de l'orchestrateur se termine par la ligne de `node <pilote> ligne-etat <campagne>` (SKILL.md §2.3 bis).

## Interruptions

Seulement 3 motifs : action irréversible (déploiement serveur, suppression de
données, migration de production, fusion vers une branche qui déploie), action hors
mandat, circuit-breaker. Tout le reste va dans le digest. Un blocage met l'issue de
côté (`⛔`) ; les issues indépendantes continuent.

## Reprise

Après une coupure : `pilote.mjs contexte <nom>`. L'état vit sur disque ; aucun agent
concurrent n'est relancé. Une issue avec `sha_reprise` repart du SHA validé et
examine le `WIP` de `branche_reprise` avant de coder.



**Charge lourde (verrou réel)** : suite de tests complète, build complet, Docker, runtime de recette ou migration SQL se lance uniquement par `node <pilote> lourde <campagne> -- <commande>`. Plusieurs en parallèle selon l'hôte : sur atelier, 4 par campagne (`admission.lourdes_max`), 6 au total sur l'hôte (`lourdes_max_hote`, pour garder de la marge de CPU) et seulement si 6 Gio de mémoire restent disponibles (`garde_ram_lourde_gio`) ; sur le poste, 1. Au-delà, la commande attend son tour. Les tests ciblés d'une issue n'en sont pas.

**Chat d'orchestration** : créé uniquement par `node <pilote> chat <campagne>` (app-server, accès de l'hôte, consigne avec la règle d'accès restreint) et repris par `pilote.mjs reveil` avec le même réglage. Les chats de travail des issues passent par `node <pilote> chat-travail`.

## Campagnes sœurs et voie de recette (v2.7)

- `pilote.mjs campagne scinder <c> --projet <p>[,<q>] --vers <nouvelle>` : les items de ces projets (milestones entiers)
  passent dans une campagne sœur, même contrat, journal copié, tâches du poste suivies. `transferts` redirige toute
  commande (`statut`, `essai`, `decision`, `ouvrir`…) visant une issue transférée ; les dépendances sont lues dans les deux
  campagnes (`statutsAvecSoeurs`). Ouvrir ensuite le chat de la sœur : `pilote.mjs chat <nouvelle>`.
- Admission : `dev_max` 6 par orchestrateur sur atelier (plafond réel des sous-agents) ; le parallélisme vient des
  campagnes sœurs et de la voie de recette.
- Orchestrateur recréé au point stable dès 150 k tokens de contexte (`chats.seuil_orchestrateur`) ; sur atelier, Codex
  compresse le contexte à 200 k tokens (`model_auto_compact_token_limit` dans ``/.codex/config.toml`).

## Chaîne critique et admission empilée (v2.8)

- `contexte` donne `chaine_critique` (plus longue suite de dépendances non closes, campagnes sœurs comprises), `admissibles`
  (avec « empilée sur X » le cas échéant) et `a_rebaser`. Traite d'abord la chaîne critique.
- Une issue dont les dépendances sont en `recette` est admissible : `pilote.mjs ouvrir` part de `origin/<branche de la
  dépendance>` (même dépôt) et rend `empilement` ; sa PR vise cette branche. Dépendance d'un autre dépôt : empilement logique,
  base par défaut. Profondeur maximale : `admission.empilement_max` (3). Plusieurs dépendances du même dépôt en recette : attendre.
- Clôture d'une issue empilée refusée tant que sa dépendance n'est pas fusionnée ou close (`CLÔTURE PRÉMATURÉE`). Si la
  dépendance repasse en développement, les issues empilées reviennent en `en_attente` (`sha_reprise` conservé, ligne au journal).
- Après fusion de la dépendance (`a_rebaser`) : rebase sur la cible, PR rétablie vers la cible, `pilote.mjs desempiler <c> <ID>`.
- Charges lourdes : `pilote.mjs lourde <c> --issue <ID> -- <commande>` ; priorité = issues retenues, +1000 sur la chaîne critique.
