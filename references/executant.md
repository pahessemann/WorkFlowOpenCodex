# Exécutant de l'hôte

Le pilote peut déposer une demande pour un exécutant séparé, installé et configuré par l'utilisateur. Cet exécutant privilégié ne figure pas dans ce dépôt : ses droits, ses mandats, ses cibles et ses accès réseau dépendent de son installation. Ne pas supposer qu'il est présent.

`node <pilote> executant demander <campagne> <type> --issue <ID> …` enregistre une demande dans `<etat>/executant/demandes/` et au journal de campagne. `node <pilote> executant etat <campagne>` lit les résultats dans `<etat>/executant/resultats/` et les signale à l'orchestrateur. Les types reconnus par `scripts/pilote.mjs` sont `livraison`, `serveur-cli`, `root-atelier` et `construction-ano`. Le pilote vérifie notamment les arguments et, selon le type, le plan et son empreinte, le fichier source ou la liste des commandes autorisées.

Le traitement effectif, les contrôles de mandat et les éventuelles actions privilégiées relèvent de l'exécutant externe. Une demande déposée ne garantit ni son exécution ni l'existence d'un mandat. Les cibles, journaux et éventuels transferts propres à cet exécutant doivent être examinés dans son installation avant activation.
