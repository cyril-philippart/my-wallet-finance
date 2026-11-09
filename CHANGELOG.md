# Changelog

Toutes les évolutions notables de My Wallet Finance sont documentées ici.

## À venir

### Ajouté

- Affichage compact des liens Vinted dans les ventes Pokémon avec ouverture dans un nouvel onglet.
- Choix du canal de vente Pokémon entre Vinted et vente physique, modifiable après enregistrement et visible dans l’historique.
- Gestion des séries Pokémon séparément du nom des produits dans l’activité d’achat-revente.
- Mémorisation et autocomplétion des séries et des produits lors de l’ajout ou de la modification d’un achat.
- Distinction du stock et des ventes par série et par produit.
- Tableau de gestion enrichi pour l’achat-revente Pokémon : capital engagé, chiffre d’affaires, bénéfice, marge et capital récupéré.
- Statistiques opérationnelles et graphique mensuel des achats, ventes et bénéfices.
- Répartition du stock selon les quantités restantes, sans valorisation en euros.
- Migration PostgreSQL des séries Pokémon avec classement automatique des anciens achats dans « Non classée ».

### Modifié

- Refonte des sections Achats et Ventes avec des tableaux compacts, triables et alignés.
- Simplification de la section Achats : date, série, produit, quantité, coût unitaire et total acheté.
- Affichage des actions directement sur les achats uniques ; accordéon conservé uniquement pour les produits achetés plusieurs fois.
- Harmonisation des boutons de modification et de suppression entre Achats et Ventes.
- Suppression du bloc redondant « Stock disponible » au profit de la répartition du stock.
- Séparation des performances en pourcentage et en euros dans les tableaux Actions, ETF, Crypto et Milàn pour permettre leur tri indépendant.
- Remplacement de l’ouverture automatique du formulaire BTC hebdomadaire par un rappel explicite avec les actions « Saisir mes BTC » et « Plus tard ».

### Technique

- Actualisation des cours en arrière-plan toutes les 5 minutes, même lorsque l’application n’est pas ouverte.
- Affichage de la dernière synchronisation réellement enregistrée par le serveur.
- Alignement de l’historique quotidien sur la performance globale réellement calculée.
- Ajout d’un point provisoire pour la journée en cours dans la courbe du dashboard.
- Rafraîchissement automatique du dashboard toutes les 5 minutes et au retour sur l’onglet, sans nouvel appel inutile à Google Sheets.
