# UI — cadrer et planifier

À lire seulement lorsqu’un besoin UI doit être préparé. Complément ciblé du
contrat actif, sans charger les autres phases ni déclencher un développement.

Consulter la section UI du `PROJECT.md` de l’application : thème, paquet,
version adoptée, documentation de cette version, Storybook et destination
le Design System. Lire seulement les composants ou règles nécessaires. Si
le raccordement manque ou si la plateforme n’est pas couverte, faire préciser
ce prérequis ; ne pas supposer qu’un paquet React web convient à Vue ou au mobile.

Identifier le parcours : composition d’une nouvelle page, migration d’une page
existante, ou montée de version de la bibliothèque. Définir le résultat métier,
les états utiles, les surfaces concernées et les comportements à préserver.
Le cadreur découpe et fixe les critères observables ; le développeur
choisit et vérifie l’assemblage technique dans la bibliothèque déclarée.

Proposer une maquette de composition seulement si l’agencement ou la complexité
le justifie, ou si l’utilisateur la demande. Elle montre des zones nommées, les composants
envisagés et les manques, sans nouveau visuel ni logique métier. Pour un prototype interactif accepté par l’utilisateur, charger uniquement
[ui-prototype.md](ui-prototype.md). Une issue dédiée
est utile si sa validation conditionne la suite. L’utilisateur valide l’agencement avant
l’implémentation qui en dépend ; une page simple peut passer directement au développement.

Si un composant semble manquer, ne pas rechercher soi-même dans la bibliothèque
ni choisir la solution : cette recherche appartient au développeur du Design
System. Avec l’utilisateur, cadrer la demande par [cadrage-court.md](cadrage-court.md)
dans le projet Linear de « destination des demandes » du `PROJECT.md`, selon
`ISSUE-composant.md`. Lier par « bloque » seulement les issues qui ne peuvent
pas avancer sans le composant, ou découper une issue d’intégration. Aucun
message à un autre cadrage : Linear porte le lien. Ne pas contourner le
manque par une copie ou une recréation visuelle ; un composant propre à
l’application exige l’accord explicite de l’utilisateur.

À la reprise d’une issue dépendante, lire le bilan de l’issue Design System
(composant existant ou version publiée), puis planifier la montée de version du
paquet et l’intégration.

Dans l’issue existante, ajouter uniquement le delta UI nécessaire : référence
au contrat projet, parcours, agencement à valider si retenu, critères observables,
comportements à préserver et preuves attendues. Ne pas recopier le catalogue.
Une montée de version explicite la version cible, les consommateurs concernés,
les incompatibilités connues et la validation attendue. Aucune mise à jour
silencieuse des applications ni migration générale implicite.

Une application n’utilise que des versions officielles publiées du paquet ;
aucune dépendance locale ou provisoire vers la bibliothèque.

Une issue de composant est lancée par un utilisateur qui dispose du Design
System, depuis le cadrage court (`$dev cadrage-court`) du projet Design System, dans le workflow normal.
