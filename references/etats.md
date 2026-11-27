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
| Issue, champs `poste_env_echecs` et `poste_env_cause` | échecs d'environnement au poste ; au plafond (2), redépôt refusé jusqu'à l'action de Paul (v2.5.4) |
| Issue, champ `poste_exclu` | motif du retrait : ni redéposée au poste, ni admise ; attend Paul (v2.5.1) |
| Suffixe de titre | `⏸ GO` (un des 3 motifs), `⛔ BLOQUÉ`, `✅` |

Messages normalisés émis par les scripts : `PRÉFLIGHT TECHNIQUE BLOQUÉ`,
`DÉPLOIEMENT REFUSÉ SUR CET HÔTE`, `MODÈLE INDISPONIBLE`, `MODÈLE RÉSERVÉ À PAUL`,
`CIRCUIT-BREAKER`, `CONTRAT NON VALIDÉ`, `COMPTE INDISPONIBLE`, `VAULT BLOQUÉ`.
Ajouts v2.4 : `CHAT ARCHI SUR LE POSTE`, `SUJET ABSENT`. Ajout v2.4.1 : `LIVRAISON LOCALE INDISPONIBLE`. Ajout v2.4.3 : `TEXTE ABSENT`. Ajouts v2.5 : `PASSERELLE SUR LE POSTE`, `FICHE ABSENTE`, `TÂCHE DÉJÀ EN FILE`, `TÂCHE INCONNUE`, `RÉSULTAT INCONNU`, `ATELIER INJOIGNABLE`, `TÂCHE NON INSTALLÉE`, `ÉTAT INCONNU`. Ajouts v2.5.1 : `MOTIF ABSENT`, `TÂCHE AMBIGUË`, `TÂCHE EN COURS`, `TÂCHE NON RETIRABLE`, `POSTE EXCLU`. Ajouts v2.5.4 : `POSTE À DÉBLOQUER`, `ISSUE ABSENTE`, `PREUVES ABSENTES` ; `ADMISSION DIFFÉRÉE` couvre aussi la garde CPU.
Ajouts 3.3.0-test (tableau de bord) : `TABLEAU INACTIF`, `TABLEAU NON ARRÊTÉ`, `TABLEAU SANS PID` ; réponses HTTP du serveur : `HÔTE REFUSÉ` (403), `MÉTHODE REFUSÉE` (405), `INCONNU` (404). Ajouts 3.4.0-test (actions) : `JETON ABSENT`, `JETON INVALIDE`, `ORIGINE REFUSÉE` (403), `ACTION INCONNUE`, `PARAMÈTRE INVALIDE` (400), `EMPREINTE DIFFÉRENTE` (409), `PLAN ABSENT`, `DÉLAI DÉPASSÉ` ; un refus du pilote est relayé avec son titre.
Un outil de supervision peut les lire tels quels.

