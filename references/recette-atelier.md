# Dispositif de recette d'atelier (contrat attendu)

Un service système du VPS, indépendant du workflow, prépare et lance les environnements de recette à
la demande des agents, qui n'ont pas les droits système. Le socle n'en fournit pas l'implémentation :
chaque installation écrit la sienne et la déclare dans le `poste.local.json` du VPS
(`recette.dispositif`). Voici le contrat que les agents attendent.

- **Échange** : `<dispositif>/echange/<application>/{demandes,resultats}`. Une demande est un fichier
  JSON `{"id","action",...}` avec un `id` neuf (minuscules et tirets) ; le résultat apparaît dans
  `resultats/<id>.json`.
- **Actions d'une application** : `preparer`, `construire` (SHA exact présent dans le clone du VPS),
  `semer` (données synthétiques uniquement), `demarrer`, `arreter`, `retirer`, `etat`.
- **Navigateur des agents** : `{"action":"navigateur","port":<p>}` ouvre au navigateur MCP (boucle
  locale) un port d'une plage déclarée par application ; `"ouvrir":false` le referme.
- **Admission** : seules les issues non closes d'une campagne `en_cours` (lues dans
  `.pilote/campagnes/`) sont servies.
- **Santé** : `<dispositif>/echange/<application>/sante.json`, mis à jour périodiquement.
- **Frontend statique** : un serveur de boucle locale, confiné, pour les recettes sans backend.
