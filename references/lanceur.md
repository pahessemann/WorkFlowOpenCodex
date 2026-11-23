# Lanceur — n'importe quel chat peut lancer une commande `$dev`

**Règle de délégation.** Le chat courant n'exécute une commande `$dev` que si son modèle est celui que le routeur désigne pour cette commande. Sinon, il délègue :

- à un **chat dédié** si la commande a un type de chat (`CADRE`, `PROTO`, `DEV`, `TEST`, `MS`, `BILAN`, `RELAIS`, `PROJET`) ; `discuter` crée toujours un nouveau chat, sans recherche de doublon (v2.18), et un chat `💬 PROJET` délègue toujours (`--depuis-role PROJET`) ;
- à un **sous-agent** si elle s'exécute inline (`cadrage-court`, `finaliser`, `projet`, `menage`) : le résultat revient en 5 lignes dans le chat courant ;
- les commandes déterministes (`digest`, `etat`, `point`, `modele`, `fournisseur`, `abonnement`, `aide`, `livrer`, `campagne`, `pause`, `reprendre`, `poste`) s'exécutent sur place, sans modèle ; v2.19.2 : le lanceur les exécute lui-même (sauf `poste`, `campagne` et `livrer`) et rend `resultat`, que le chat recopie.
- `archi` et `evolution` visent le chat fixe `🏛 ARCHI · workflow` (v2.4, `archi.md`) : pas de routeur. Le chat ARCHI enregistré (y compris en `a_creer`) est toujours rouvert, jamais doublé ; pour `evolution`, la réponse porte le message à y poster (`poster` : fiche de lancement, puis la commande). Sans chat ARCHI : bloc à coller et entrée `a_creer` sur le poste, refus `CHAT ARCHI SUR LE POSTE` sur atelier.

Le chat lanceur ne fait que lancer : il ne cadre pas et ne code pas. **ARCHI** lance toujours avec `--depuis-role ARCHI` : jamais `executer_ici`, même si son modèle est celui du routeur (v2.5.4).

## `node <pilote> lancer <commande> [arguments] --depuis-modele <modèle du chat> --fiche-stdin [--projet <p>] [--criticite <c>] [--garder <chat> | --nouveau]`

1. **Routage** : le routeur donne le modèle de la commande (ex. `cadrage standard`, soit Opus 5.5). S'il est identique au modèle du chat courant, la réponse est `executer_ici`.
2. **Doublon** : les registres des deux hôtes sont consultés. Un chat vivant (`actif`, `attente_go`, `bloque`, `a_creer`) de même rôle et même objet est rouvert (`action: ouvrir`). Pour un sujet proche (même vocabulaire à 50 % ou plus), une seule question : `--garder <chat>` ou `--nouveau`.
3. **Fiche de lancement** : 15 lignes au plus, rédigées par le modèle du lanceur. Elle contient la demande mot pour mot, l'essentiel de ce qui a été dit avant, et les issues, fichiers et liens cités. C'est le seul contexte transmis, jamais l'historique brut.
4. **Création** par `chat-travail` (app-server de l'hôte d'exécution, accès de l'hôte) : titre `pilote.mjs titre`, dossier selon le rôle (rangement automatique sur atelier), modèle du routeur, inscription au registre.
5. **Premier message** : carte d'identité, règle d'accès, fiche de lancement et commande à exécuter. Le chat démarre aussitôt.
6. **Réponse au lanceur**, en une ligne : `→ ouvert : 🟣 CADRE · deployeur · <objet> (Opus 5.5, 03 Cadrage & prototypes)`.

**Repli** : si aucun chat ne peut être créé par programme, `lancer` rend un bloc prêt à coller (dossier, titre exact, modèle, premier message). Il inscrit quand même le chat au registre avec le statut `a_creer`, et `$dev menage` le rattache ensuite.

v2.19.1 : `node <pilote> discuter|cadrage|prototype|issue|… --depuis-modele … --fiche-stdin` sans le mot `lancer` est accepté comme `lancer <commande> …` : ces commandes n’existent que par le lanceur.
