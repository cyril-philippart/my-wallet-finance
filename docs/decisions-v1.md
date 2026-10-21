# Décisions métier V1

Date de validation : 14 octobre 2026.

- Périmètre initial : actions, ETF, cryptomonnaies, SCPI et assurances-vie en fonds euros.
- Les objets Pokémon sont reportés à une version ultérieure et seront alimentés depuis un site tiers.
- Milàn est un regroupement fonctionnel présenté comme un ensemble unique dans l'interface, composé de deux portefeuilles techniques : `Milàn — ETF` et `Milàn — Fonds euros`.
- Inès et Cyril sont deux contrats d'assurance-vie distincts, uniquement en fonds euros.
- Coinbase et Binance sont deux portefeuilles crypto distincts.
- Les produits de toutes les ventes historiques sortent du portefeuille. Ils ne créditent pas la réserve technique.
- Tous les indicateurs consolidés et gains réalisés sont exprimés en EUR.
- Le gain réalisé EUR est le produit net converti au FX de vente moins le coût historique EUR des unités vendues.
- Les dividendes connus uniquement au mois utilisent une date conventionnelle de fin de mois et restent marqués `date_estimated`.
- `total_invested_eur` désigne le coût historique EUR, frais inclus, des positions encore ouvertes.
- `market_value_eur` désigne leur valeur actuelle. La réserve technique reste supportée par le moteur, mais sera normalement nulle avec la convention de retrait des ventes.
- L'historique d'investissement commence en mai 2023. La date exacte reste inconnue et ne doit pas être inventée.
- Le suivi de performance base 100 commence le jour de validation de l'import initial et de la première valorisation complète.

## Décisions encore attendues

- Seuils de fraîcheur par type de prix et de taux FX.
- Présence éventuelle de transferts Coinbase/Binance et de frais réglés en crypto dans les données historiques.
