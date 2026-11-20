# États — liste fermée

`pilote.mjs` refuse toute autre valeur.

| Objet | Valeurs |
| :--- | :--- |
| Issue | `en_attente`, `preflight`, `en_cours`, `revue`, `recette`, `fusionnee`, `close`, `bloquee`, `en_pause` |
| Campagne | `brouillon`, `en_cours`, `en_pause`, `close` |
| Chat (registre) | `actif`, `attente_go`, `bloque`, `clos`, `archive`, `a_creer` |
| Rôle de chat | `AIDE`, `ARCHI`, `AUTO`, `SUP`, `MS`, `DEV`, `CADRE`, `PROTO`, `TEST`, `RELAIS`, `BILAN` |
| Ligne d'état (§2.3 bis) | `▶ EN COURS`, `⏳ EN ATTENTE`, `⏸ À TOI`, `⛔ BLOQUÉ`, `✅ TERMINÉ` |
| Issue, champ `poste` | `en_file`, `en_cours`, `retour` (résultat : `ok`, `echec`, `environnement`) |
| Tâche de la passerelle poste | `en_file`, `en_cours`, `rendu`, `bloque`, `retiree` |
| Issue, champ `poste_exclu` | motif du retrait : ni redéposée au poste, ni admise ; attend Paul (v2.5.1) |
| Suffixe de titre | `⏸ GO` (un des 3 motifs), `⛔ BLOQUÉ`, `✅` |

Messages normalisés émis par les scripts : `PRÉFLIGHT TECHNIQUE BLOQUÉ`,
`DÉPLOIEMENT REFUSÉ SUR CET HÔTE`, `MODÈLE INDISPONIBLE`, `MODÈLE RÉSERVÉ À PAUL`,
`CIRCUIT-BREAKER`, `CONTRAT NON VALIDÉ`, `COMPTE INDISPONIBLE`, `VAULT BLOQUÉ`.
Ajouts v2.4 : `CHAT ARCHI SUR LE POSTE`, `SUJET ABSENT`. Ajout v2.4.1 : `LIVRAISON LOCALE INDISPONIBLE`. Ajout v2.4.3 : `TEXTE ABSENT`. Ajouts v2.5 : `PASSERELLE SUR LE POSTE`, `FICHE ABSENTE`, `TÂCHE DÉJÀ EN FILE`, `TÂCHE INCONNUE`, `RÉSULTAT INCONNU`, `ATELIER INJOIGNABLE`, `TÂCHE NON INSTALLÉE`, `ÉTAT INCONNU`. Ajouts v2.5.1 : `MOTIF ABSENT`, `TÂCHE AMBIGUË`, `TÂCHE EN COURS`, `TÂCHE NON RETIRABLE`, `POSTE EXCLU`.
Un outil de supervision peut les lire tels quels.

