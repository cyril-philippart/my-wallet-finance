# Analyse de l'import du 14 octobre 2026

Source : `Suivi de portefeuille.xlsx` (lecture seule, aucune formule recalculée).

## Inventaire

| Feuille | Lignes datées candidates |
|---|---:|
| Actions | 38 |
| ETF | 29 |
| Crypto | 9 |
| Milàn | 15 |
| SCPI | 6 |
| Assurance Vie | 0 |
| Dividendes | montants mensuels, sans date exacte |
| **Total opérations datées candidates** | **97** |

Le classeur contient 15 feuilles. `Train de vie`, `graphiques`, `Historique`, `Calcul`, `Portefeuille`, `Achats  Reventes` et `Historiques  Comparaison` ne sont pas des sources transactionnelles V1.

## Constatations fiables

- Les blocs datés suivent généralement : date, quantité, prix unitaire, frais, total et PRU.
- Les positions Actions, ETF, Crypto et SCPI possèdent des totaux permettant un rapprochement après import.
- Les résultats de formules contiennent notamment `#VALUE!`, `#DIV/0!`, `#N/A` et une erreur de récupération distante. Ils ne seront jamais importés comme source de vérité.
- L'assurance-vie ne possède pas de dates d'opérations exploitables : seulement 750 EUR pour Inès et 500 EUR pour Cyril, avec des agrégats annuels incomplets.
- Les dividendes sont structurés par mois et année et devront conserver une date estimée.

## Ambiguïtés bloquées pour validation

1. L'historique commence le 10 juillet 2022 avec un achat Ethereum, et non en mai 2023.
2. Une date de WisdomTree Bitcoin ETN est illisible (`+020265-04`).
3. Deux lignes Milàn sont datées du 7 novembre 2026, après la date du fichier.
4. Une ligne Microsoft du 11 septembre 2026 contient une quantité `-1`, un cours `427`, des frais `2` et un total `-323`, qui ne se réconcilient pas.
5. Trois lignes Airbus ne contiennent qu'une date et une quantité, sans prix/frais/total exploitables dans le même bloc.
6. La feuille Crypto mélange Ethereum, Bitcoin, Shiba INU et un bloc nommé `ETF BTC`. Elle n'indique pas Coinbase ou Binance par opération.
7. Certaines opérations futures peuvent provenir d'une inversion jour/mois, mais aucune date ne sera corrigée automatiquement.

## Politique de prévisualisation

- Une ligne complète et cohérente sera proposée comme `ACCEPTED`.
- Une ligne incomplète, future, illisible ou non réconciliable sera `AMBIGUOUS`.
- Une formule ou un agrégat sera `IGNORED`.
- Un doublon d'empreinte métier sera `DUPLICATE`.
- L'import PostgreSQL restera désactivé tant que la prévisualisation n'aura pas été validée.
