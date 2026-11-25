# Recette développeur demandée par l’issue

Charger ce complément lorsque la section `Recette développeur` de l’issue
déclare `Statut : REQUISE`.
Pour une ancienne issue dépourvue de cette section, le charger uniquement si
ses critères d’acceptation exigent explicitement un parcours utilisateur, une
validation d’interface ou une recette authentifiée. Un statut `SANS OBJET`
l’exclut. La seule présence d’une interface, d’identifiants ou d’un
environnement de recette ne suffit pas à l’activer.

## Contrat de recette

L’issue reste l’autorité. Elle précise les parcours à effectuer,
l’environnement, les profils ou rôles sans secret, les actions, le résultat
attendu, les régressions bornées et la preuve à produire. Le développeur teste
toutes les actions de ces scénarios, sans étendre la recette au-delà de
l’issue.

Cette recette est une validation développeur avant la pull request prête : elle
cherche les défauts fonctionnels, visuels, interactifs ou d’expérience
utilisateur demandés par l’issue. Elle précède la recette de l’utilisateur ou la recette
d’usage indépendante de l’orchestrateur de campagne ; elle ne remplace ni l’une ni l’autre.
Ses preuves peuvent être examinées et citées par le recetteur indépendant conformément à `test.md` : SHA, scénario, commande, résultat et environnement doivent correspondre ; tout manque est rejoué.

## Authentification autorisée

Avant d'utiliser réellement un compte réservé, appliquer
[`comptes-session.md`](comptes-session.md) : acquérir l'usage, puis céder ou
libérer après déconnexion. Une demande réciproque entre intervenants mandatés
se règle directement, sans solliciter l'utilisateur ni tester l'accès occupé.

Après validation du préflight, si `PROJECT.md` déclare l’environnement et les
accès déjà provisionnés, leur utilisation non destructive est autorisée pour
ces scénarios et leurs reprises jusqu’à la clôture. Le développeur utilise en
priorité le navigateur intégré de Codex. Il lit les identifiants uniquement dans
le `.env.local` du worktree, où `pilote.mjs ouvrir` place le compte réservé pour l’issue,
sans les afficher, les saisit dans le navigateur, peut se reconnecter une fois après une
déconnexion ou un redémarrage, changer de profil prévu ou ouvrir un nouveau contexte sans
redemander de confirmation. Une session navigateur absente n’est pas un
blocage.

## Outils exclus sans demande explicite

Sans demande explicite de l’utilisateur, n’utiliser ni lecteur d’écran
(VoiceOver ou autre), ni autre navigateur que le navigateur intégré de Codex,
ni réglage système du poste. Une preuve impossible à obtenir sans ces outils
est signalée comme non vérifiée dans le bilan ; elle ne bloque ni la recette
ni l’objectif.

Ne jamais afficher, journaliser, copier dans une preuve, versionner ou conserver
un secret. Limiter les connexions au strict nécessaire et se déconnecter à la
fin : un compte de recette peut être partagé avec d’autres environnements.
Demander à l’utilisateur uniquement si l’accès manque ou reste invalide après
une reconnexion (une session coupée de l’extérieur signale souvent un compte
utilisé ailleurs), si
une MFA ou une action réellement humaine est indispensable, si la cible diffère
du contrat, ou si l’action devient destructive ou élargit le périmètre. Une
action qui touche la production exige en plus l’accord du responsable du projet.
