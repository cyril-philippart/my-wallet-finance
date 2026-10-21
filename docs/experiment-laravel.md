# Expérience Laravel — transactions antidatées

## Objectif

Cette API reprend un sous-domaine de My Wallet Finance : l'enregistrement d'achats et de ventes. Elle empêche une vente de rendre la position négative, y compris lorsqu'une opération est ajoutée dans le passé.

Le code Laravel se trouve dans `laravel-api/`. Il est volontairement séparé de l'application Next.js : il s'agit d'un exercice ciblé, pas d'une réécriture de l'application.

## Scénario qui révélait le problème

1. Achat de 10 unités le 1er janvier.
2. Vente de 10 unités le 1er mars.
3. Ajout ultérieur d'une vente de 5 unités datée du 1er février.

La troisième opération paraît valide si l'on regarde uniquement la position au 1er février. Pourtant, après rejeu de tout l'historique, la position du 1er mars devient `-5`. L'API refuse donc l'opération et ne l'enregistre pas.

## API

```http
POST /api/v1/portfolios/{portfolio}/transactions
Content-Type: application/json
```

```json
{
  "asset_id": 1,
  "kind": "SELL",
  "quantity": "5",
  "occurred_at": "2026-02-01"
}
```

En cas de position négative, la réponse utilise le statut HTTP `422` :

```json
{
  "error": {
    "code": "INSUFFICIENT_POSITION",
    "message": "Cette vente rendrait la position négative à partir du 2026-03-01 00:00:00."
  }
}
```

## Choix d'architecture

- Le contrôleur ne contient que l'adaptation HTTP.
- `StoreTransactionRequest` valide les entrées.
- `RecordTransactionService` porte le cas d'usage et la règle métier.
- La vérification et l'insertion ont lieu dans la même transaction SQL.
- Le portefeuille est verrouillé pendant l'opération afin de sérialiser deux ventes concurrentes.
- Les quantités utilisent `DECIMAL` en base et BCMath en PHP, jamais des nombres flottants.
- `InsufficientPositionException` fournit une réponse API stable et écrit un log structuré.

Pour chaque écriture, le service charge les opérations du portefeuille et de l'actif, ajoute virtuellement la nouvelle transaction, trie l'ensemble par date et numéro de séquence, puis recalcule le solde. La transaction n'est créée que si le solde reste positif ou nul à chaque étape.

## Tests couverts

- achat puis vente valide ;
- vente immédiatement supérieure à la position ;
- vente antidatée qui casse une vente future ;
- vente antidatée qui laisse tout l'historique valide.

Les tests utilisent une base SQLite en mémoire. Pour les lancer sur ce poste, où PHP ne charge pas de `php.ini` global :

```powershell
cd laravel-api
& 'C:\Program Files\php\php.exe' `
  -d 'extension_dir=C:\Program Files\php\ext' `
  -d 'extension=mbstring' `
  -d 'extension=pdo_sqlite' `
  -d 'extension=sqlite3' `
  vendor\phpunit\phpunit\phpunit
```

## Limites assumées

Cette expérimentation ne gère que les achats et ventes, dans un contexte mono-utilisateur simplifié. L'authentification, les prix, les frais, les devises et l'intégration à la base PostgreSQL existante restent hors périmètre. Un test de concurrence réel sous PostgreSQL serait nécessaire avant une utilisation en production, SQLite ne reproduisant pas précisément les verrous de lignes de PostgreSQL.

## Présentation honnête en entretien

Il ne faut pas présenter ce cas comme un incident de production. Il s'agit d'un défaut potentiel identifié dans un projet personnel, puis reproduit et corrigé dans une API Laravel pour se remettre à niveau. L'intérêt de l'exercice réside dans la démarche : comprendre l'invariant métier, reproduire le cas limite, isoler la règle dans un service, protéger l'écriture et automatiser la validation.
