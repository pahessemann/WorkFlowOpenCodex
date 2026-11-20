# Blocages et escalade

- **Circuit-breaker** : 3 essais par issue, toutes erreurs confondues
  (`pilote.mjs essai`). Au 3ᵉ échec, l'issue passe `bloquee`, le titre porte
  `⛔ BLOQUÉ`, un chat `🔵 DEV` est ouvert depuis la fiche de reprise de l'issue, et Paul
  est interrompu (motif « circuit-breaker »).
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

