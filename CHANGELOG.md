# Changelog du socle public

## 2.6 — 20/11/2026

`$dev point` : le point des campagnes en un rendu fixe, en lecture seule (avancement, blocages et qui les débloque, actions de l’humain dédoublonnées et triées, ressources de l’hôte, temps restant en heures de travail des agents). Les orchestrateurs disent qui débloque chaque issue arrêtée (`statut --attend --quoi`, `arret`). Tests indépendants de la charge réelle de l’hôte. 91 évaluations, 49 tests.

## 2.5.4 — 20/11/2026

Passerelle poste : imprimante PDF basculée et restaurée automatiquement, plafond des échecs d’environnement, rendu d’un résultat produit à la main. Garde CPU à l’admission. ARCHI délègue toujours au lanceur. 86 évaluations, 46 tests.

## 2.5.3 — 20/11/2026

Plus de développements en parallèle par campagne ; plafond des charges lourdes de l’hôte inchangé, car c’est lui qui protège le CPU.

## 2.5.2 — 20/11/2026

Limites d’admission du VPS ajustées sur mesure : plus de développements en parallèle par campagne (la mémoire a de la marge), moins de charges lourdes simultanées sur l’hôte (le CPU est le facteur limitant).

## 2.5.1 — 20/11/2026

Première publication du socle commun, issu du workflow `$dev` v2.5.1 :

- contrat de campagne, GO unique, 3 motifs d'interruption, campagnes `AUTO` et `SUP` ;
- routeur de modèles proportionné et escalade en 3 essais ;
- chats identifiables (titre, carte d'identité, badge), registre, lanceur, `❓ AIDE`, `🏛 ARCHI`, ménage ;
- ligne d'état en fin de chaque réponse, calculée pour les campagnes, lue par le réveil ;
- passerelle poste Windows : file sur le VPS, relève automatique, retrait (`poste retirer`) ;
- livraison depuis le poste, plan figé, répétition à blanc ;
- limites d'admission lisibles et rappelées à chaque reprise ;
- 82 évaluations et 42 tests.
