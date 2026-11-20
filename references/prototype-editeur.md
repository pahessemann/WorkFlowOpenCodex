# Prototype UI — proposition, revue, consignes

À charger seulement pour `$dev prototype` ou l’accord explicite de produire un
prototype pendant le cadrage. Aucune installation globale du workflow, migration
applicative, création de composant ou publication externe implicite.

## Sources et périmètre

Partir du cadrage existant ; demander seulement les informations bloquantes.
Lire le contrat UI de PROJECT.md, le manifeste et la version résolue du verrouillage
de l’application. Priorité au paquet effectivement installé, pas au dernier
Storybook. Si bibliothèque, thème ou version manquent ou divergent, présenter les
choix vérifiés dans le Design System et demander à l’utilisateur de trancher.
Lire seulement les exports, types, conventions et stories utiles de cette version.
Conserver leurs références avec les options dans la spec ; les réutiliser aux
itérations suivantes, sauf changement de version ou nouveau besoin. Aucun inventaire
complet de Storybook. Annoncer si les interactions sont simplifiées ou reproduisent
le parcours existant, sans ajouter une validation obligatoire.
Ne pas supposer qu’un paquet React convient à une autre plateforme.

Pour un besoin non couvert, rechercher ensuite dans le Storybook et les versions
plus récentes ; vérifier l’export et la publication réelle. Proposer une montée
de version sans l’effectuer silencieusement. En l’absence de composant adapté,
indiquer besoin, candidats examinés et limite. Ne rien inventer ni copier pour
imiter un composant manquant. La demande au Design System suit
`ui-cadrage.md` (cadrage court dans le projet Design System), selon les
règles de décision du contrat de campagne. Le prototype n’utilise que des versions officielles publiées.
Poursuivre les zones indépendantes.

## Espace et initialisation

Le socle maintenu est `assets/prototype/` dans ce skill. La version initiale est
0.2.0. L’espace local est donné par PROTOTYPES_ROOT ou par l’option `--root` du
script ; ne jamais inscrire le chemin personnel dans les fichiers partagés.
Le lanceur local `socle/prototype.mjs` lit `socle/config.local.json` ; la commande
`node socle/prototype.mjs index` actualise le catalogue après la revue.
Organisation : `projets/<projet>/<page>/`, sources, spec.json, lockfile et
`revisions/<identifiant>/`. Un index.html central est régénérable par le script.

Préparer un JSON selon le contrat ci-dessous puis exécuter :
`node scripts/prototype.mjs init --root <racine> --spec <json>`.
Le script refuse un dossier existant et n’installe rien. Dans le dossier créé,
installer les dépendances avec les accès déjà provisionnés, conserver le lockfile,
puis `pnpm dev`. Pas de secret dans les sources, aucun accès à 1Password.
`pnpm build` vérifie l’assemblage ; le serveur de revue est local uniquement.
Les réouvertures emploient le lockfile et le cache du gestionnaire de paquets.

Le cadreur reste responsable du cadrage et de la validation fonctionnelle,
ni auteur du code applicatif ni relecteur. La composition du prototype est un
artefact de cadrage isolé ; elle ne modifie pas le dépôt consommateur. Si son rôle
interdit aussi cet artefact, faire réaliser la composition dans une tâche de
prototypage explicitement autorisée, sans élargir ses permissions.

## Reprise et vérification économique

Depuis le skill : `node scripts/prototype.mjs resume --dir <prototype> --owner <id-discussion>`.
Le fichier `prototype.local.json` conserve dossier relatif, commande de lancement,
version du socle et discussion responsable ; sans `--owner`, la commande le lit.
Une seule discussion écrit dans un prototype. Si le responsable diffère, coordonner
un transfert explicite avant de changer le fichier ; ce repère n’est pas un verrou
système. Ne pas recopier le socle pendant une revue active : sauvegarder, coordonner
la mise à jour, puis rouvrir. Ne pas explorer les dossiers à nouveau à chaque reprise.

Avant livraison : `node scripts/prototype.mjs check --dir <prototype>`.
Ce contrôle sans installation vérifie spec, version déclarée, références littérales
et génération des consignes en mémoire. Il signale références dynamiques et export
incomplet ; il ne certifie ni couverture visuelle ni version réellement installée.
Faire le build au premier rendu et après changement de code ; au navigateur, vérifier
le premier rendu puis seulement les interactions affectées. Un commentaire seul
ne justifie pas une nouvelle recette complète. Vérifier une fois la chaîne choix,
sauvegarde, réouverture et export, puis seulement après modification de ce mécanisme.

## Composition et revue

Remplacer le fichier `src/composition.jsx` du gabarit par des imports réels du
paquet choisi, CSS compris. Aucun composant visuel métier dans le socle d’outil :
son panneau de revue est extérieur au rendu de l’application. Réutiliser sidebar
et topbar du cadre existant. Ne pas les réinventer. Placer `Zone` autour de chaque
zone de revue sans perturber la mise en page ; nom cliquable au survol ET au focus ouvrant la modale de choix, identifiant
stable. Chaque composant utilisé doit être accessible dans la revue avec ses choix
vérifiés conservés dans la spec. Pour un sous-composant sans API de configuration
indépendante, donner accès au parent propriétaire et expliquer la limite ; ne pas
inventer des variantes. La composition reçoit la spec courante ; paramètres, ordre et variante
proviennent de celle-ci, pas de valeurs dupliquées. Fournir uniquement des
alternatives vérifiées équivalentes ; un changement fonctionnel exige arbitrage.

Conserver les ressources de rendu sous `src/` pour les inclure dans les révisions.
Le code d’adaptation relie explicitement les identifiants aux composants importés,
et utilise des données fictives sans appel métier. Toute option présentée doit
avoir un rendu fonctionnel. Adapter l’agencement par édition du code/spec, sans
construire un éditeur libre. Choisir les états et formats pertinents (vide, erreur,
chargement, clavier, mobile). Ne pas prétendre qu’un état est couvert sans preuve.

La modale présente alternatives et variantes vérifiées sous forme de cartes.
Afficher chaque section seulement si elle propose au moins deux choix ; sinon
masquer les cartes et indiquer explicitement l’absence d’alternative ou de variante
dans un encart informatif compact avec icône, distinct du texte courant.
Code visuel constant de l’outil : alternatives en bleu, variantes en violet,
via les variables CSS `--proto-alternative-*` et `--proto-variant-*`. Réutiliser
ces couleurs pour titres, cartes sélectionnées, focus et messages d’absence ;
conserver les libellés explicites, la couleur ne suffit pas à identifier le type.
Conserver les noms au survol sans recouvrir les contrôles. Le clic droit (ou
Maj+F10 au clavier) ouvre un menu permettant d’éditer la zone et ses parents,
notamment le tableau depuis une cellule ; conserver aussi le clic sur l’étiquette.
Les choix sont prévisualisés puis sauvegardés sur disque à chaque fermeture
(bouton, croix, Échap ou clic sur le fond). En cas d’échec, garder la modale ouverte
et montrer l’erreur. Ne pas annoncer le choix enregistré avant succès serveur.
Pour les aperçus visuels, exporter `OptionPreview({zoneId, option})` depuis
composition.jsx : utiliser les vrais composants importés, jamais une imitation.
Retourner null si aucun aperçu n’est disponible : son encart est alors masqué.
`option.props` contient les props effectives. Même règle pour le rendu principal :
le socle fournit déjà les variantes résolues dans `spec`.
Regrouper les variantes par famille via `family` et afficher leur libellé court
via `choiceLabel`. Les libellés existants « Famille · Choix » sont également
regroupés. Exemple : Multi-univers et Liste simple, chacune avec/sans descriptions.
Conserver la sélection exacte et les props, le regroupement est uniquement visuel.
Les variantes sont des configurations déclarées du composant existant, par exemple
KpiCard contextual/compact/default ou Sidebar avec/sans univers, groupes et descriptions
si pris en charge par cette version. Ne pas inventer un prop générique « variant »
si l’API utilise des données de configuration. Les props de variante remplacent
les clés de premier niveau, sans fusion profonde implicite. Conserver les choix
précédents par alternative ; changer de variante invalide la validation ; le commentaire libre reste éditable.

Aucun panneau de revue permanent : le menu contextuel propose l’enregistrement
et la préparation de l’issue, via une modale de validation explicite. Un seul champ
Commentaire figure dans la modale de chaque composant ; aucun formulaire de
décisions ni case d’arbitrage. Le texte est sauvegardé à la fermeture et exporté.
La sauvegarde conserve sur disque les choix et commentaires ; un
brouillon non sauvegardé est signalé. Les modifications invalident la validation.
Un manque déclaré bloque l’export validé. La validation globale couvre les choix
et commentaires ; aucun blocage caché lié aux anciennes cases d’arbitrage.

## Validation et issue

Après contrôle du rendu, de l’absence de composant fictif et de la cohérence entre
composition et spec, renseigner les preuves de vérification dans spec.json.
L’utilisateur valide explicitement la révision par le bouton dédié. Celui-ci
sauvegarde une copie immuable des sources/spec/verrouillage avec empreinte SHA-256
et génère issue.md. Il ne publie pas dans Linear et ne lance pas le développement.

Transmettre le paquet de fichiers reproductible, pas seulement un chemin local ou
une URL localhost. Créer ou compléter l’issue de réalisation via le processus de
cadrage et ses autorisations de publication existantes ; ne pas dupliquer une issue.
Si la publication n’est pas autorisée, livrer le brouillon complet prêt à publier.
L’issue porte : besoin/périmètre, révision validée, paquet/thème/version, cadre,
composants/imports/props, interactions/états/données réelles à raccorder, arbitrages,
dépendances, critères et preuves attendues. Le développement reste lancé séparément.
Une modification ultérieure donne une nouvelle révision ; conserver la précédente.

## Contrat spec.json (version 1)

- `schemaVersion: 1`, `project`, `page` : identifiants minuscules avec tirets.
- `title`, `objective`, `scope` : titre, besoin, périmètre/hors périmètre.
- `library: { package, version, theme, source, storybook }` : version exacte,
  provenance vérifiée du paquet et lien vers les stories concernées.
- `shell: { sidebar, topbar }` : exports/imports réels du cadre.
- `zones: [{ id, purpose, selected, options: [{ id, component, import,
  props, rationale, selectedVariant?,
  variants?: [{ id, label, description?, props }] }], comments: [{ text, resolved, decision }] }]`.
- `behaviors`, `states`, `dataBindings`, `acceptance`, `checks` : listes de textes
  explicites ; checks contient les preuves réelles de contrôle.
- `blockers` : liste de manques/questions bloquants ; vide avant validation.
- `zones[].comment` : texte libre courant ; les anciens `comments` restent lisibles
  en repli pour préserver les notes existantes.
- `revision` : compteur géré par le serveur pour éviter les écrasements concurrents.

Les détails de props complexes et callbacks sont décrits dans la spec et reliés
par composition.jsx ; ne pas sérialiser du code exécutable ni employer eval.
Le gabarit est volontairement vide : ne jamais exporter sa composition non réalisée.
