# Ménage des chats — `$dev menage` et `$dev menage appliquer`

Le ménage ne s'occupe que des chats. Worktrees, branches, processus et caches relèvent de `$dev nettoyeur`.

## Analyse (lecture seule) : `node <pilote> menage --chats-fichier <f> [--linear-fichier <f>]`

Modèle : routeur `pilotage leger`. L'agent fournit la liste des chats des deux hôtes, sous la forme `[{ id, titre, hote, archive, maj, dossier }]` lue avec `list_threads`, en incluant les dossiers de la barre latérale. Il peut fournir en option l'état Linear des issues liées. `pilote.mjs` confronte ces chats au registre des deux hôtes, aux campagnes et à la taille des sessions.

| Catégorie | Critère | Action | Sûre |
| :--- | :--- | :--- | :---: |
| `a_cloturer` | objet clos (issue close, campagne close), titre sans ✅ | bilan posté, puis titre en ✅ | oui |
| `a_archiver` | ✅ depuis plus de `chats.archive_apres_heures` (1 h ; le réveil d'atelier l'archive déjà de lui-même, v2.6.2) | déplacer dans `99 Archives` et archiver | oui |
| `mal_nomme` | titre non conforme au §2.1 ou mauvais dossier | renommer, ranger | oui |
| `hors_registre` | chat inconnu du registre | rattacher (sûr) ; rôle illisible : archivage proposé | oui / non |
| `doublon` | même rôle et même objet | garder le plus récent, archiver l'autre | non |
| `dormant` | aucune activité depuis `chats.dormant_jours` (14), objet non clos | demander : reprendre, mettre en pause ou archiver | non |
| `sans_ligne` | dernier message sans ligne d'état (relevé par le réveil, v2.5) | rappeler la règle au chat | non |
| `trop_lourd` | contexte estimé au-delà de `chats.seuil_contexte` | fiche de reprise, recréation, archivage de l'ancien | non |

En tête du rapport viennent les rappels : `⏸ GO` en attente depuis plus de 24 h, et `⛔` depuis plus de 48 h. Viennent ensuite une ligne par chat (numéro, titre, catégorie, action, sûre ou non), puis les totaux et la commande pour appliquer. Le rapport fait 40 lignes au plus. Au-delà, il donne un résumé par catégorie, et le détail va dans `.pilote/menage/<date>.md`. L'analyse est gardée dans `.pilote/menage/derniere.json`.

## Application : `node <pilote> menage appliquer surs | <numéros> | tout`

- `surs` : seulement les actions sûres. `<numéros>` : les lignes choisies, sûres ou non. `tout` : tout, sauf les chats dormants.
- Sur atelier, `pilote.mjs` applique lui-même : renommer, ranger, archiver et poster, par l'app-server. Pour les chats du poste, il rend `operations_outil`, que l'agent applique avec les outils de l'application (`set_thread_title`, `move_thread_to_sidebar_section`, `set_thread_archived`).
- **Garde-fous** : archiver ne supprime jamais rien. Les chats `❓ AIDE`, `🏛 ARCHI` et les chats de campagne en cours ne sont jamais archivés. Chaque action est inscrite au registre avec sa date (`historique`).
- **`🏛 ARCHI`** : jamais archivé, clos ni recréé par le ménage, même avec `appliquer tout`. Il peut être rattaché au registre et signalé `trop_lourd` (action à décider, sans opération automatique) : ARCHI écrit alors sa fiche de reprise et Paul le recrée à la main (`archi.md`).

## Passage hebdomadaire

`menage.hebdo` (lundi 08:00) : une automatisation du poste lance l'analyse et applique `surs`, puis poste dans `❓ AIDE` un rapport de 10 lignes au plus (ce qui a été fait, ce qui attend une décision). Le digest de chaque campagne affiche « Ménage : N actions en attente de décision » quand N > 0.
