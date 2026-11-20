# UI — contrôler le résultat livré

À lire uniquement lorsque le cadreur doit examiner un résultat UI ou
un écart. Ne déclenche ni surveillance du développeur ni nouvelle revue après merge.

Comparer le résultat et les preuves fournies aux critères de l’issue et aux
décisions validées. Si nécessaire, consulter le raccordement UI de `PROJECT.md`
et seulement la référence de bibliothèque utile. Ne pas inspecter le code,
concevoir un correctif, refaire les tests ou charger le catalogue entier.

L’orchestrateur de campagne réalise toutefois sa recette d’usage
avant merge selon `execution.md` ; il ne rejoue pas les tests techniques.

Le compte rendu existant doit permettre de reconnaître la surface livrée, le
thème/paquet/version, les principaux composants, les critères satisfaits,
non satisfaits ou non vérifiés, les vérifications effectuées et les écarts.
Une migration doit démontrer la préservation des comportements convenus.

Accepter un résultat conforme au contrat déjà validé ; demander un complément
si une preuve indispensable manque, ou une correction si un critère échoue.
Une incertitude technique revient au développeur ou à l’expert compétent.
L’utilisateur arbitre les nouveaux choix visuels ou produit et les changements
de périmètre, ainsi que les exceptions au Design System.
L’acceptation ne vaut ni autorisation de merge
ni autorisation de déploiement.

Exception : dans son mandat explicite, l’orchestrateur peut autoriser le développeur
à fusionner la PR et le SHA qu’il a validés, sans autoriser de déploiement.

À l’ingestion après merge, réutiliser le bilan validé : capitaliser seulement
les décisions durables et les versions adoptées, selon les autorisations Obsidian
existantes. Distinguer version adoptée dans le dépôt et version déployée, cette
dernière restant inconnue sans preuve de déploiement. Ne pas rouvrir une recette.
