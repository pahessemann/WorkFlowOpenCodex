# Principes du workflow `$dev`

Décisions de conception du socle. Elles ne se remettent en cause que sur décision du responsable
du workflow, par une évolution (`$dev evolution`, `references/archi.md`).

| # | Principe |
| :-- | :-- |
| P1 | Le responsable cadre une fois (contrat de campagne, GO unique), les agents exécutent seuls. Interruption pour 3 motifs seulement : action irréversible, hors mandat, circuit-breaker (3 échecs). Le reste va au digest. |
| P2 | Socle de modèles : un modèle fort pour le cadrage et le développement, un modèle de contrôle pour la recette de Milestone, un modèle léger pour la logistique et la pré-lecture ; un modèle visuel pour les choix visuels ; un autre fournisseur en secours (429) et en second regard. |
| P3 | Proportionnalité, pas de budget : une tâche triviale va toujours au modèle léger ; on ne monte de modèle que sur échec réel. |
| P4 | Une issue ne nomme jamais de modèle : elle donne la tâche et la criticité, le routeur choisit. |
| P5 | Linear est la source de vérité ; seuls `cadrage` et `cadrage-court` écrivent le contenu d'une issue. |
| P6 | Le bilan d'une issue n'entre dans le vault Obsidian qu'après la fusion vers `main`. |
| P7 | Chats : titre normalisé, carte d'identité, badge ; un chat par campagne, des sous-agents par issue ; seuls les scripts créent les chats de travail. |
| P8 | Livraison depuis le poste seulement, après GO : plan figé par empreinte, répétition à blanc, arrêt à la première erreur, jamais de retour arrière automatique. |
| P9 | `❓ AIDE` est la porte d'entrée et le lanceur ; `$dev menage` range les chats, `$dev nettoyeur` reste technique. |
| P10 | `🏛 ARCHI` conçoit et tient le workflow cohérent ; toute évolution passe par une fiche et un GO. |
| P11 | Les limites d'admission sont lues dans la configuration de l'hôte et rappelées en clair à chaque reprise ; une règle commune modifiée est inscrite au journal de chaque campagne en cours. |
| P12 | Les tests qui exigent Windows passent par la passerelle poste ; une issue au poste sort du quota ; un échec d'environnement ne compte pas comme essai. |
| P13 | Chaque réponse finale d'un chat se termine par une ligne d'état lisible au premier regard. |
