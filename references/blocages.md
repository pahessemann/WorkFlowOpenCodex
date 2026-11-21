# Blocages et escalade

- **Circuit-breaker** : 3 essais par issue, toutes erreurs confondues
  (`pilote.mjs essai`). Au 3ᵉ échec, l'issue passe `bloquee`, le titre porte
  `⛔ BLOQUÉ`, un chat `🔵 DEV` est ouvert depuis la fiche de reprise de l'issue, et Paul
  est interrompu (motif « circuit-breaker »).
- **Qui débloque (v2.6)** : toute issue arrêtée porte `--attend paul|agents|poste|env --quoi "<cause>"`
  (`pilote.mjs statut` ou `pilote.mjs arret`) ; `$dev point` la classe ainsi, sinon « à qualifier » (`point.md`).
- **Cadreur avant blocage (v2.6.3, consigne de Paul du 20/11)** : avant de passer une issue `bloquee` (hors action
  irréversible), l'orchestrateur lance un cadreur de déblocage : `pilote.mjs lancer cadrage deblocage-<ID> --depuis-role AUTO
  --projet <projet> --nouveau --fiche-stdin` (blocage, essais, options). Mandat de Paul : le cadreur décide par défaut
  (« à confirmer »), publie au besoin une issue corrective (`campagne ajouter`) et écrit sa conclusion au journal.
  L'issue reste `en_attente` (`arret --attend agents --quoi "cadrage de déblocage"`) ; elle ne passe `bloquee --attend paul`
  que si le cadreur conclut à un motif réservé à Paul, avec sa réponse proposée.
- **Cadreur vérifié par le script (v2.9)** : `--attend paul` (`statut` ou `arret`) est refusé `CADREUR REQUIS` tant que le
  journal n'a pas, pour cette issue, une ligne « Conclusion du cadreur : … ; réservé à Paul : oui|non » (écrite par le
  cadreur avec `pilote.mjs decision`). Motif réservé d'emblée (action irréversible ou root, secret à fournir, hors mandat) :
  `--reserve "<motif>"`. Le réveil lance lui-même les cadreurs quand la campagne n'a pas bougé depuis 2 h
  (`reveil.cadreur_apres_min`, 3 au plus en même temps : `reveil.cadreurs_max`) et l'inscrit au journal.
- **Escalade** : `pilote.mjs escalade <criticite> <essai> [bug|architecture]`
  (`modeles.md` §5). Redescendre au modèle nominal dès que le correctif est validé.
- **Timeout environnement** : réseau, SSH, Docker ou permissions bloqués plus de
  5 minutes : issue mise de côté (`⛔`), signalée dans le digest. Paul n'est notifié
  immédiatement que si toute la campagne est à l'arrêt.
- **Refus fournisseur** (HTTP 429, limite d'usage) : `pilote.mjs refus <modele> "<message>"`,
  puis le routeur donne le modèle alternatif. Aucune surveillance préventive.
- **Besoin root ou action réservée** : le préparer (script relu, preuves) et le remonter
  à Paul dans le digest ou, si irréversible, en `⏸ GO`. Ne jamais solliciter un tiers.
- **Question non bloquante** : option par défaut du contrat (ou la plus simple et
  réversible), journalisée, rubrique « À confirmer » du digest.

