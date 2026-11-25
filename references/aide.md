# Aide — `$dev aide [--recreer]`

Une seule commande donne toujours accès au chat d'aiguillage `❓ AIDE · workflow` : elle
l'ouvre s'il existe et le recrée s'il manque, a été archivé ou n'est plus à jour.

## Registre

`.pilote/aide.json` (dossier `etat` de `poste.local.json`) : `chat_id`, `titre`, `dossier`,
`modele`, `cree_le`, `skill_hash` (empreinte du `SKILL.md` à la création ou au dernier
avis de mise à jour).

## Déroulé (agent qui reçoit `$dev aide`)

1. Lister les chats de l'hôte local, actifs **et** archivés (`list_threads`, puis
   `list_threads` en mode `history` avec `archived: true`), et garder ceux dont le titre est
   exactement `❓ AIDE · workflow` : `[{ id, titre, archive, maj }]`.
2. `node <pilote> aide --chats-fichier <fichier.json> [--recreer] [--indisponible gpt-6-luna]`.
   Le script décide, sans rien toucher :

| Situation | `action` | Ce que fait l'agent |
| :--- | :--- | :--- |
| Chat enregistré, actif, `skill_hash` à jour | `ouvrir` | Ouvre le chat, ne poste rien |
| Chat enregistré, `SKILL.md` modifié depuis | `maj` | Poste la ligne `message` (« ℹ SKILL.md mis à jour le <date> : relis-le avant de répondre »), puis `pilote.mjs aide enregistrer <id>`, puis ouvre |
| Aucun chat actif (absent, supprimé, archivé) | `creer` | Crée le chat (bloc `creation`), le range, l'enregistre, l'ouvre. Un ancien chat archivé reste archivé |
| Chat actif non enregistré (créé hors `$dev aide`) | `creer` | Archive l'ancien dans `99 Archives`, puis crée |
| `--recreer` | `creer` | Archive le chat actuel dans `99 Archives`, puis crée un chat neuf (contexte vierge) |
| Plusieurs chats actifs de ce titre | selon le cas | Garde le plus récent, archive les autres (`archiver`) et le signale |

3. Si un chat à archiver est en plein tour, attendre la fin du tour avant de l'archiver.
4. Rendre compte en 3 lignes au plus : action, chat, signalements (doublons, modèle de secours).

**Idempotence** : deux appels successifs ne créent jamais deux chats ; le second répond `ouvrir`.

## Création

- **Dossier** : `00 Accueil`, créé s'il manque et placé avant `01 Campagnes` ; le chat est mis
  en tête du dossier. L'application ne permet pas qu'un chat soit à la fois épinglé et rangé
  dans un dossier : le chat AIDE est rangé dans `00 Accueil`, en tête, et n'est pas épinglé.
- **Titre exact** : `❓ AIDE · workflow`, sans suffixe d'état.
- **Modèle** : `modeles.aide` de `poste.local.json` (`gpt-6-luna`), hors routeur. Si Luna est
  indisponible : `--indisponible gpt-6-luna` donne `claude-haiku-5-5`, signalé dans la réponse.
  Jamais le modèle de la session courante.
- **Hôte** : le poste local (chat sans projet).
- **Premier message** : le bloc `creation.premier_message`, tel quel.
- Puis : `node <pilote> aide enregistrer <chat_id> --modele <modèle>`.

## Sans outil de pilotage des chats

Si l'agent ne peut pas créer, ranger, archiver ou ouvrir un chat par programme, il affiche la
marche à suivre à la main : dossier, titre exact, modèle et premier message à coller. Il
enregistre ensuite l'identifiant que l’utilisateur lui donne (`aide enregistrer`), pour que le
registre reste à jour.

## Protections

- `$dev nettoyeur` n'archive jamais ce chat (`pilote.mjs nettoyeur candidats` l'exclut par
  titre et par `chat_id`).
- Le chat AIDE est en lecture seule : sauf `$dev point` (v2.6, ci-dessous), il ne lance aucune commande `$dev`, ne modifie aucun
  fichier et n'écrit pas dans Linear.

## Porte d’entrée (v2.3)

Le chat AIDE est aussi lanceur : une commande `$dev` tapée dans AIDE est déléguée par `node <pilote> lancer … --depuis-modele gpt-6-luna --fiche-stdin` (`lanceur.md`), sans qu’AIDE fasse le travail lui-même. Son premier message le dit ; après toute modification de ce message, `$dev aide --recreer`. Le chat AIDE est inscrit au registre des chats (rôle `AIDE`) et n’est jamais archivé par `$dev menage`.

## Où en sont mes chats ? (v2.5)

AIDE lit le dernier message des chats locaux (`read_thread`) et passe `[{ id, titre, dernier_message }]`
sur l'entrée standard de `node <pilote> etat chats --chats-stdin`, sans écrire de fichier : une ligne
par chat, avec sa dernière ligne d'état (les chats d'atelier sont lus par le réveil). Il recopie le
tableau tel quel. AIDE termine lui aussi chaque réponse par sa ligne d'état. Après la mise à jour de
son premier message (v2.5) : `$dev aide --recreer`.

## Discuter d’un projet (v2.18)

Une envie de parler d’un projet sans rien cadrer (« où en est-on sur ce projet, qu’en penses-tu ? ») part dans un chat dédié :
AIDE lance `$dev discuter <projet> [sujet]` par le lanceur, qui crée chaque fois un nouveau chat `💬 PROJET` sur atelier (`discuter.md`).

## Évolutions du workflow (v2.4)

AIDE répond aux questions d'usage. Une question sur la conception du workflow, ou une demande
de le faire évoluer, est orientée vers `🏛 ARCHI · workflow` : AIDE lance
`$dev evolution <sujet>` (ou `$dev archi`) par le lanceur. Celui-ci rend le chat ARCHI
enregistré et le message à y poster (`poster`), qu'AIDE poste avec l'outil de l'application
avant de répondre « → ouvert : 🏛 ARCHI · workflow ». S'il rend `a_creer`, AIDE affiche le
bloc à coller. Jamais de second chat ARCHI.

## Point des campagnes (v2.6)

`$dev point [campagne…]`, ou une question comme « où en sont les campagnes, qu'est-ce qui bloque, combien
de temps reste-t-il ? » : AIDE exécute lui-même `node <pilote> point [campagne…] --texte` et recopie la sortie
telle quelle. C'est la seule commande qu'il n'envoie pas au lanceur, car elle n'écrit rien (`point.md`).
Après la mise à jour de son premier message (v2.6) : `$dev aide --recreer`.
