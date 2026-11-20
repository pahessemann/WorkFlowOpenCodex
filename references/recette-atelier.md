# Dispositif de recette d'atelier

Service système d'atelier, indépendant de tout workflow. Les agents restent `utilisateur`.

- **Échange** : `/srv/recette/echange/app-recette/{demandes,resultats}` et
  `.../ui8-recette/`. Une demande = un fichier JSON `{"id","action",...}` avec un `id`
  neuf (minuscules et tirets) ; le résultat apparaît dans `resultats/<id>.json`.
- **Actions Paie** : `preparer`, `construire` (`sha` exact présent dans le clone
  atelier d'mon-api), `semer`, `demarrer`, `arreter`, `retirer`, `etat`.
- **Navigateur des agents** : `{"action":"navigateur","port":<p>}` ouvre au navigateur
  MCP (espace réseau à boucle locale) un port local : 5100–5299, seconde application 5410–5499 et
  53980–54079, ou port API de recette ; `"ouvrir":false` le referme.
- **Admission** : seules les issues non closes d'une campagne v2.2 `en_cours`
  (`/home/utilisateur/.pilote/campagnes/*.json`) sont admises (adaptateur
  `/srv/recette/registre.mjs`).
- **Santé** : `/srv/recette/echange/app-recette/sante.json`, toutes les 30 minutes.
- Outil de recette frontend statique (serveur loopback seccomp) :
  `/srv/recette/outils/recette-statique-loopback.py`.

