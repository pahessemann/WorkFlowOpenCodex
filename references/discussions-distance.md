# Discussions et recette à distance

À charger seulement quand les outils de l'app manquent sur la machine (agent lancé sur
atelier sans l'app) ou pour une recette sur appareil.

- **Ouvrir un chat** : `pilote.mjs` lance le tour via l'app-server de l'hôte, avec le
  modèle explicite et le réglage d'exécution de `poste.local.json` appliqué à **chaque**
  tour (`sandboxPolicy`). Le titre vient de `pilote.mjs titre`.
- **Aperçu web** : servir en `127.0.0.1` sur l'hôte ; sur atelier, ouvrir le port au
  navigateur des agents par le dispositif (`recette-atelier.md`). Jamais d'écoute sur
  une interface publique.
- **Recette sur appareil Android** : émulateur d'atelier selon le `PROJECT.md` du
  projet ; un appareil physique reste une recette réservée à Paul.
- **iOS** : exploration seulement si le contrat le demande.

