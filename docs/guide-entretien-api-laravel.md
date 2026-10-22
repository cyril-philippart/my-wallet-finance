# Guide d'entretien — API Laravel de transactions antidatées

Ce document sert à comprendre et expliquer l'API Laravel ajoutée à My Wallet Finance. Il ne faut pas le réciter mot pour mot. L'objectif est de pouvoir raconter le raisonnement avec ses propres mots, répondre aux questions de détail et reconnaître honnêtement les limites de l'implémentation.

## 1. La présentation en 30 secondes

> My Wallet Finance est mon application personnelle de suivi de patrimoine, développée avec Next.js, React, TypeScript et PostgreSQL. Comme je voulais retravailler concrètement avec Laravel, j'ai repris une petite partie du domaine : l'enregistrement des achats et des ventes. Je me suis concentré sur un cas limite, celui d'une vente ajoutée avec une date passée. Une vente peut sembler valide à sa propre date, mais rendre une vente future impossible. L'API Laravel rejoue donc tout l'historique de l'actif dans l'ordre chronologique et refuse l'écriture si la position devient négative à un moment quelconque.

## 2. Le contexte exact et la règle métier

Une transaction représente ici uniquement :

- un achat (`BUY`) ;
- ou une vente (`SELL`) ;
- pour un actif donné ;
- dans un portefeuille donné ;
- avec une quantité et une date.

La règle métier est la suivante :

> Après insertion d'une transaction, la quantité détenue ne doit jamais devenir négative, quelle que soit la date à laquelle on examine l'historique.

Il ne suffit donc pas de contrôler la position à la date de la nouvelle vente. Il faut vérifier toutes les opérations qui viennent après.

### Exemple refusé

| Date | Opération | Calcul | Position |
|---|---:|---:|---:|
| 1er janvier | Achat de 10 | 0 + 10 | 10 |
| 1er février | Nouvelle vente antidatée de 5 | 10 - 5 | 5 |
| 1er mars | Vente déjà enregistrée de 10 | 5 - 10 | **-5** |

La nouvelle vente de février semble possible si on regarde uniquement février. Elle doit pourtant être refusée, car elle rend l'historique incohérent en mars.

### Exemple accepté

| Date | Opération | Calcul | Position |
|---|---:|---:|---:|
| 1er janvier | Achat de 10 | 0 + 10 | 10 |
| 1er février | Nouvelle vente de 5 | 10 - 5 | 5 |
| 1er mars | Vente existante de 4 | 5 - 4 | 1 |

La position ne passe jamais sous zéro. La nouvelle vente peut être enregistrée.

## 3. Ce qui a réellement été construit

Une application Laravel 13 autonome a été ajoutée dans `laravel-api/`. Elle utilise PHP 8.5 et contient :

- une route API versionnée ;
- trois modèles Eloquent : `Portfolio`, `Asset` et `Transaction` ;
- une migration pour leurs tables ;
- un `FormRequest` pour valider l'entrée ;
- un contrôleur HTTP léger ;
- une ressource JSON pour contrôler la réponse ;
- un service qui porte le cas d'usage et la règle métier ;
- une exception métier qui produit un log et une réponse `422` ;
- des factories, un seeder et des tests Feature PHPUnit.

Cette API est volontairement indépendante de l'application Next.js. Elle ne remplace pas l'application et n'utilise pas encore son schéma PostgreSQL complet.

## 4. Le parcours complet d'une requête

```text
POST /api/v1/portfolios/1/transactions
                    │
                    ▼
        Route + model binding du Portfolio
                    │
                    ▼
        StoreTransactionRequest
        validation du JSON entrant
                    │
                    ▼
        TransactionController::store()
        adaptation HTTP, sans règle métier
                    │
                    ▼
        RecordTransactionService::record()
        transaction DB + verrou + rejeu chronologique
             │                         │
             │ valide                  │ position négative
             ▼                         ▼
        INSERT Transaction       InsufficientPositionException
             │                         │
             ▼                         ├── log warning
        TransactionResource            └── JSON 422
             │
             ▼
        JSON 201 Created
```

### Exemple de requête

```http
POST /api/v1/portfolios/1/transactions
Content-Type: application/json
Accept: application/json
```

```json
{
  "asset_id": 1,
  "kind": "SELL",
  "quantity": "5",
  "occurred_at": "2026-02-01"
}
```

### Exemple de succès

```json
{
  "data": {
    "id": 3,
    "portfolio_id": 1,
    "asset_id": 1,
    "kind": "SELL",
    "quantity": "5.00000000",
    "occurred_at": "2026-02-01T00:00:00.000000Z"
  }
}
```

Le statut est `201 Created`, car une nouvelle ressource a été créée.

### Exemple de refus métier

```json
{
  "error": {
    "code": "INSUFFICIENT_POSITION",
    "message": "Cette vente rendrait la position négative à partir du 2026-03-01 00:00:00."
  }
}
```

Le statut est `422 Unprocessable Content`. La requête JSON est syntaxiquement correcte, mais elle ne respecte pas la règle métier.

## 5. Le rôle de chaque fichier

### `routes/api.php`

La route exposée est :

```text
POST /api/v1/portfolios/{portfolio}/transactions
```

Le préfixe `v1` permet de faire évoluer ultérieurement le contrat de l'API sans casser immédiatement les consommateurs existants.

Le paramètre `{portfolio}` utilise le route model binding de Laravel. Laravel cherche automatiquement le `Portfolio` correspondant. S'il n'existe pas, il renvoie une erreur `404` avant d'appeler le contrôleur.

La route est nommée `api.v1.portfolios.transactions.store`, ce qui évite de dépendre partout d'une URL écrite en dur.

### `StoreTransactionRequest`

Ce `FormRequest` valide la frontière HTTP :

| Champ | Règles | Raison |
|---|---|---|
| `asset_id` | requis, entier, actif existant | empêcher une référence invalide |
| `kind` | `BUY` ou `SELL` | limiter les opérations au périmètre choisi |
| `quantity` | numérique, strictement positive, 8 décimales maximum | refuser zéro, les valeurs négatives et une précision excessive |
| `occurred_at` | date valide | pouvoir ordonner les opérations |

Le contrôleur utilise uniquement `$request->validated()`. Il ne transmet pas aveuglément tout le JSON reçu au modèle.

`authorize()` retourne actuellement `true`. C'est acceptable uniquement parce que cette API est une démonstration locale sans authentification. En production, il faudrait authentifier l'utilisateur et vérifier qu'il possède le portefeuille.

### `TransactionController`

Le contrôleur fait trois choses :

1. il reçoit les données déjà validées ;
2. il appelle le service métier ;
3. il transforme le résultat en réponse HTTP `201`.

Il ne calcule aucune position et ne fait aucune requête métier. Cela évite un contrôleur difficile à tester et à réutiliser.

Le service est injecté par le conteneur Laravel. Comme il n'a pas de dépendance spéciale ni d'interface à configurer, Laravel sait l'instancier automatiquement.

### `TransactionResource`

La ressource définit explicitement les champs exposés dans le JSON. Elle évite de sérialiser directement tout le modèle Eloquent et de révéler plus tard, par accident, un nouveau champ interne.

Elle normalise aussi la date au format ISO 8601.

### Les modèles Eloquent

`Portfolio` possède plusieurs transactions avec une relation `hasMany`.

`Transaction` appartient à un portefeuille et à un actif avec deux relations `belongsTo`.

Les attributs autorisés pour l'assignation en masse sont déclarés dans `$fillable`. Cela empêche un champ inattendu de la requête de modifier arbitrairement une colonne non prévue.

Dans `Transaction`, les casts transforment :

- `quantity` en décimal à huit chiffres après la virgule lors de la sérialisation ;
- `occurred_at` en objet Carbon utilisable comme une date.

### La migration

La migration crée :

- `portfolios` avec un nom ;
- `assets` avec un nom et un symbole unique ;
- `transactions` avec ses deux clés étrangères, son type, sa quantité, sa date et son numéro de séquence.

La quantité est stockée avec `decimal(20, 8)`. Un type décimal est utilisé plutôt qu'un nombre flottant, car les arrondis binaires sont dangereux pour des quantités financières.

L'index `(portfolio_id, asset_id, occurred_at)` correspond à la lecture principale : retrouver l'historique d'un actif dans un portefeuille.

La contrainte unique `(portfolio_id, sequence_number)` garantit qu'un numéro de séquence ne peut pas être utilisé deux fois dans un portefeuille.

Les suppressions sont en cascade dans cette version réduite : supprimer un portefeuille ou un actif supprime ses transactions. Pour une application financière de production, une suppression logique et un historique d'audit seraient probablement préférables.

### `RecordTransactionService`

Le service contient le cœur du comportement.

#### 1. Ouverture d'une transaction de base de données

Tout le traitement est exécuté dans `DB::transaction()`. Si une exception se produit, Laravel effectue un rollback. La nouvelle transaction financière n'est donc jamais partiellement enregistrée.

#### 2. Verrouillage du portefeuille

Le service recharge le portefeuille avec `lockForUpdate()`.

L'intention est de sérialiser les écritures d'un même portefeuille : pendant qu'une requête calcule puis enregistre une vente, une seconde requête ne doit pas calculer son résultat sur le même ancien solde.

Ce verrou doit être pris dans la même transaction SQL que la lecture et l'écriture. Un verrou pris hors transaction serait libéré trop tôt.

Limite importante : l'application locale utilise SQLite, qui ne reproduit pas le verrouillage de lignes de PostgreSQL. Le code exprime l'intention, mais un test réel de concurrence sur PostgreSQL reste nécessaire.

#### 3. Attribution d'un numéro de séquence

Le service prend le plus grand `sequence_number` du portefeuille et ajoute un. Ce numéro permet d'obtenir un ordre déterministe lorsque deux opérations ont exactement la même date.

Le verrou du portefeuille est censé protéger le calcul du prochain numéro contre deux écritures simultanées. La contrainte unique en base constitue une protection supplémentaire contre un doublon.

#### 4. Normalisation de la date

La date reçue est transformée avec `CarbonImmutable`, convertie en UTC puis stockée dans un format uniforme.

L'utilisation d'un objet immutable évite de modifier accidentellement la date d'origine pendant une transformation.

#### 5. Chargement de l'historique

Le service récupère toutes les transactions du même portefeuille et du même actif. Il ajoute la nouvelle opération en mémoire sans l'enregistrer immédiatement.

Il trie ensuite l'ensemble par :

1. date d'opération ;
2. numéro de séquence.

Cette insertion virtuelle est importante : elle permet de vérifier l'effet de la nouvelle transaction avant toute écriture définitive.

#### 6. Rejeu chronologique

La position commence à zéro :

- un achat ajoute sa quantité ;
- une vente retire sa quantité.

BCMath effectue les additions et comparaisons avec des chaînes décimales. Aucun `float` PHP n'est utilisé pour la règle financière.

Dès que la position devient négative, le service lève `InsufficientPositionException`. Le `create()` Eloquent situé après la boucle n'est jamais exécuté.

#### 7. Écriture finale

Si toute la chronologie reste valide, la transaction est créée avec Eloquent. La transaction SQL est ensuite validée par Laravel.

### `InsufficientPositionException`

Cette exception représente un échec métier connu, pas une panne imprévue.

Elle transporte :

- le portefeuille concerné ;
- l'actif concerné ;
- la première date à laquelle la position devient négative.

Sa méthode `report()` écrit un warning structuré :

```json
{
  "reason": "insufficient_position",
  "portfolio_id": 1,
  "asset_id": 1,
  "first_negative_position_at": "2026-03-01 00:00:00"
}
```

Sa méthode `render()` transforme l'exception en réponse JSON stable avec un code fonctionnel `INSUFFICIENT_POSITION` et un statut HTTP `422`.

Le code fonctionnel est utile pour un client : il est plus stable et plus facile à traiter qu'un texte français susceptible d'évoluer.

### `bootstrap/app.php`

Le fichier enregistre les routes API et force le rendu JSON pour les URL `api/*` ou les requêtes qui déclarent attendre du JSON. Cela évite de renvoyer une page HTML d'erreur à Insomnia ou à un frontend.

La route `/up` est une route de santé. Elle prouve que le processus Laravel répond, mais pas que la base fonctionne. Nous l'avons constaté lorsque `/up` répondait alors que le pilote SQLite n'était pas chargé.

## 6. Pourquoi Eloquent ici ?

Eloquent est utilisé pour :

- le route model binding ;
- les relations simples ;
- les casts ;
- la création contrôlée par `$fillable` ;
- des requêtes lisibles sur trois modèles simples.

Le choix n'est pas « Eloquent partout par principe ». Pour une agrégation financière complexe, une projection massive ou une requête dont le plan doit être maîtrisé précisément, le Query Builder ou du SQL paramétré pourraient être plus adaptés.

Ici, le volume réduit et la simplicité du modèle rendent Eloquent lisible sans masquer une requête compliquée.

## 7. Pourquoi un service ?

La règle n'est pas une préoccupation HTTP. Elle pourrait être appelée depuis :

- l'API ;
- une commande d'import ;
- un job ;
- une interface d'administration.

La placer dans un service évite de la dupliquer et garde le contrôleur centré sur le protocole HTTP.

Le service n'a pas été extrait uniquement pour « respecter SOLID ». Il porte un vrai cas d'usage transactionnel avec plusieurs étapes et un invariant métier.

## 8. Les tests et ce qu'ils prouvent

Les tests sont des tests Feature. Ils appellent réellement la route HTTP et utilisent une base SQLite en mémoire. Ils traversent donc validation, route model binding, contrôleur, service, Eloquent, exception et réponse JSON.

### Scénarios couverts

1. Un achat de 10 puis une vente de 4 sont acceptés.
2. Une vente immédiate de 11 après un achat de 10 est refusée.
3. Une vente antidatée de 5 est refusée si une vente future de 10 existe déjà.
4. Une vente antidatée de 5 est acceptée si la vente future n'est que de 4.
5. Un payload vide produit des erreurs de validation et aucune écriture.

Les tests de refus vérifient aussi le nombre de lignes en base. Ils prouvent donc que l'opération invalide n'a pas été enregistrée.

### Ce qu'ils ne prouvent pas

- le fonctionnement réel de `lockForUpdate()` sous PostgreSQL ;
- le comportement de deux requêtes véritablement simultanées ;
- l'autorisation d'accès au portefeuille ;
- les performances avec des centaines de milliers de transactions ;
- l'intégration avec le schéma PostgreSQL complet de My Wallet Finance.

Dire clairement ce que les tests ne prouvent pas est aussi important que de présenter les tests verts.

## 9. Le problème SQLite rencontré

La base locale SQLite et les migrations étaient correctes, mais le serveur PHP lancé par `artisan serve` démarrait un processus enfant qui ne chargeait pas le pilote `pdo_sqlite` dans cet environnement Windows.

Les symptômes étaient trompeurs :

- `/up` répondait en `200`, car cette route n'accédait pas à la base ;
- `/` échouait lors de la lecture des sessions stockées en base ;
- l'API échouait lors du route model binding du portefeuille.

La stack trace contenait `could not find driver`, ce qui orientait vers PHP/PDO plutôt que vers Laravel ou le code métier.

La correction locale a consisté à charger explicitement `pdo_sqlite` et `sqlite3`, puis à lancer le serveur PHP avec cette configuration. Une vraie correction d'environnement consisterait à installer et configurer proprement PHP/Composer avec un `php.ini` global adapté.

Cette difficulté illustre une règle de diagnostic : une route de santé minimale ne garantit pas que toutes les dépendances de l'application sont opérationnelles.

## 10. La décision d'architecture regrettée

Le choix initial a été d'isoler rapidement l'API Laravel avec SQLite. Il permettait de créer les modèles, migrations et tests sans toucher à PostgreSQL ni au projet Next.js.

La limite est apparue ensuite : la fonctionnalité dépend précisément d'une transaction et d'un verrouillage. SQLite n'a pas le même modèle de concurrence ni les mêmes verrous de lignes que PostgreSQL. Les tests valident donc le calcul métier, mais pas complètement la stratégie de concurrence.

Aujourd'hui, l'approche serait :

1. conserver l'API Laravel isolée pour limiter le périmètre ;
2. utiliser PostgreSQL sous Docker dès le départ ;
3. exécuter les tests d'intégration de transaction et de concurrence sur PostgreSQL ;
4. éventuellement garder une suite rapide séparée pour la logique pure ;
5. mesurer le comportement de deux ventes réellement concurrentes.

## 11. Les limites assumées de la version actuelle

Il faut être capable de les citer sans présenter le code comme prêt pour la production.

- Il n'y a pas d'authentification ni d'autorisation.
- `authorize()` retourne toujours `true`.
- L'appartenance du portefeuille à un utilisateur n'est pas modélisée.
- L'actif doit exister, mais son rattachement préalable au portefeuille n'est pas contrôlé.
- Seuls `BUY` et `SELL` sont gérés.
- Les prix, frais, devises, dividendes et mouvements de cash ne sont pas repris.
- Tout l'historique de l'actif est chargé en mémoire à chaque écriture.
- La stratégie de verrouillage n'a pas été testée sur PostgreSQL.
- Il n'y a pas de clé d'idempotence contre un double envoi HTTP.
- La contrainte `BUY`/`SELL` est validée par Laravel, mais pas doublée par une contrainte `CHECK` en base.
- Il n'y a pas d'audit des corrections ou suppressions.
- Les suppressions en cascade seraient discutables pour des données financières.
- Le message d'erreur et les dates pourraient être mieux localisés pour l'utilisateur.

## 12. Ce qui serait ajouté avant une production réelle

Ordre de priorité raisonnable :

1. PostgreSQL comme moteur réel et dans les tests d'intégration critiques.
2. Authentification et policy d'autorisation sur le portefeuille.
3. Vérification de l'appartenance de l'actif au portefeuille.
4. Test de concurrence avec deux connexions réelles.
5. Clé d'idempotence pour empêcher les doubles soumissions.
6. Contraintes supplémentaires en base.
7. Audit des modifications et suppressions logiques.
8. Optimisation du rejeu si l'historique devient volumineux.
9. Observabilité : identifiant de corrélation, métriques et alertes sur les erreurs.
10. Documentation OpenAPI et tests du contrat.

## 13. Questions probables et réponses courtes

Les réponses suivantes sont volontairement courtes. Elles servent de base à une conversation, pas de texte à réciter.

### Compréhension générale

#### Quel problème résout l'API ?

Elle empêche d'enregistrer une vente qui rendrait la position négative, immédiatement ou plus tard dans l'historique à cause d'une date passée.

#### Pourquoi une vente de février peut-elle casser mars ?

Parce qu'elle consomme une partie des titres qui étaient jusque-là disponibles pour la vente déjà enregistrée en mars.

#### Pourquoi ne pas seulement vérifier le solde actuel ?

Le solde actuel ne montre pas à quel moment l'historique est devenu invalide. Une opération antidatée oblige à rejouer toute la chronologie concernée.

#### Est-ce un bug de production ?

Non. C'est un cas métier concret identifié dans mon projet personnel et implémenté récemment en Laravel. Mon expérience Laravel en production remonte à SaasOffice.

#### Pourquoi avoir choisi cette fonctionnalité ?

Elle est petite, mais elle contient une vraie règle métier, une écriture transactionnelle, de la concurrence, des erreurs API, des logs et des tests.

### Route et HTTP

#### Pourquoi utiliser `POST` ?

Parce que l'endpoint crée une nouvelle transaction financière.

#### Pourquoi le statut `201` ?

Il indique qu'une ressource a bien été créée.

#### Pourquoi `422` et pas `400` ?

Le JSON est valide et compréhensible, mais il viole une règle métier. `422` décrit mieux ce cas.

#### Pourquoi pas `409 Conflict` ?

`409` serait également défendable pour un conflit avec l'état courant. J'ai choisi `422` pour représenter une commande métier impossible. L'essentiel est d'avoir un contrat cohérent et documenté.

#### Pourquoi versionner avec `/v1` ?

Pour pouvoir faire évoluer le contrat plus tard sans casser immédiatement les clients existants.

#### À quoi sert `Accept: application/json` ?

Il indique que le client attend du JSON. L'application force aussi le rendu JSON sur les routes `api/*`.

#### Que se passe-t-il si le portefeuille n'existe pas ?

Le route model binding échoue avant le contrôleur et Laravel renvoie une `404`.

#### Pourquoi nommer la route ?

Pour pouvoir la référencer sans recopier son URL et faciliter une future modification du chemin.

### Validation

#### Pourquoi un `FormRequest` ?

Il sépare la validation et l'autorisation de la logique du contrôleur, et garde la frontière HTTP lisible.

#### Quelle différence entre validation et règle métier ?

La validation vérifie la forme de l'entrée : type, présence, format. La règle métier vérifie si l'opération est possible compte tenu de l'historique.

#### Pourquoi `quantity` doit-elle être positive ?

Le sens est porté par `BUY` ou `SELL`. Autoriser une quantité négative créerait deux façons de représenter la même chose et davantage d'erreurs.

#### Pourquoi limiter à huit décimales ?

C'est une précision suffisante pour le périmètre choisi et elle correspond à la colonne `DECIMAL(20,8)`.

#### Pourquoi utiliser uniquement les données validées ?

Pour qu'un champ inattendu envoyé par le client ne soit pas transmis au service ou au modèle.

#### `authorize()` à `true`, est-ce sécurisé ?

Non pour une production multi-utilisateur. C'est une limite assumée de cette API locale. Il faudrait une policy vérifiant le propriétaire du portefeuille.

### Contrôleur, service et ressource

#### Pourquoi le contrôleur est-il si court ?

Il adapte HTTP au cas d'usage. La règle métier reste dans un service réutilisable et testable.

#### Pourquoi ne pas mettre la logique dans le modèle Eloquent ?

La règle coordonne plusieurs lectures, un verrou, une transaction et une insertion. Elle représente un cas d'usage, pas seulement le comportement d'une ligne `Transaction`.

#### Pourquoi ne pas tout laisser dans le contrôleur ?

Cela mélangerait protocole HTTP, persistance et règle métier, et rendrait une future utilisation depuis un import ou un job plus difficile.

#### Pourquoi une `TransactionResource` ?

Elle stabilise le contrat JSON et empêche d'exposer automatiquement toutes les colonnes du modèle.

#### Pourquoi injecter le service ?

Le conteneur Laravel gère sa création et le contrôleur déclare clairement sa dépendance.

#### Fallait-il une interface pour le service ?

Pas encore. Il n'existe qu'une implémentation et aucune dépendance externe à substituer. Ajouter une interface maintenant serait surtout du bruit.

### Eloquent et base de données

#### Pourquoi Eloquent plutôt que le Query Builder ?

Le modèle est simple et Eloquent apporte relations, casts, route binding et factories. Pour une projection financière complexe ou massive, je pourrais préférer le Query Builder ou du SQL explicite.

#### Pourquoi ne pas utiliser un repository ?

Eloquent fournit déjà une abstraction de persistance suffisante ici. Un repository sans besoin de substitution ou requêtes complexes ajouterait une couche peu utile.

#### À quoi sert `$fillable` ?

Il limite les attributs modifiables par assignation de masse et réduit le risque qu'un champ inattendu soit écrit.

#### Pourquoi `DECIMAL` et pas `FLOAT` ?

Les flottants binaires peuvent produire des erreurs d'arrondi. Une quantité financière doit conserver une représentation décimale maîtrisée.

#### Pourquoi BCMath dans le service ?

Pour additionner, soustraire et comparer les quantités décimales sans les convertir en `float` PHP.

#### Pourquoi stocker une date en UTC ?

Pour avoir une référence uniforme en base. L'affichage peut ensuite reconvertir la date dans le fuseau de l'utilisateur.

#### À quoi sert `sequence_number` ?

Il départage deux opérations qui ont la même date et rend l'ordre de rejeu déterministe.

#### Pourquoi le numéro de séquence est-il unique par portefeuille ?

Pour garantir un ordre non ambigu et détecter un éventuel conflit d'écriture.

#### Pourquoi cet index composite ?

La requête principale filtre par portefeuille et actif, puis travaille sur la chronologie. L'index correspond à ce chemin d'accès.

#### Une contrainte en base serait-elle utile sur `kind` ?

Oui. La validation applicative protège l'API, mais une contrainte `CHECK` protégerait aussi les imports, scripts ou écritures directes.

### Transactions et concurrence

#### Pourquoi utiliser `DB::transaction()` ?

Le contrôle et l'écriture doivent former une seule unité atomique. En cas d'erreur, rien ne doit être enregistré.

#### Une transaction SQL suffit-elle contre la concurrence ?

Non. Deux transactions peuvent lire le même ancien état. Il faut aussi un verrou ou une autre stratégie de sérialisation.

#### Pourquoi verrouiller le portefeuille plutôt que chaque transaction ?

Le portefeuille fournit une ligne stable à verrouiller, même lorsqu'il n'existe encore aucune transaction pour l'actif.

#### Le verrou est-il trop large ?

Potentiellement. Il sérialise toutes les écritures du portefeuille, même sur deux actifs différents. Une version plus avancée pourrait verrouiller une ligne de position par couple portefeuille-actif.

#### `lockForUpdate()` fonctionne-t-il avec SQLite ?

Pas comme avec PostgreSQL. C'est précisément une limite du setup actuel. La stratégie doit être validée sur PostgreSQL.

#### Que se passe-t-il si deux ventes arrivent exactement ensemble ?

L'intention est que la première verrouille le portefeuille, valide et écrive ; la seconde attend puis recalcule sur le nouvel état. Il faut encore le prouver avec un test de concurrence PostgreSQL.

#### Et si le processus tombe au milieu ?

La transaction non validée est rollbackée par la base lors de la fermeture de la connexion.

#### Pourquoi ne pas maintenir directement un champ `current_quantity` ?

Ce serait plus rapide, mais une opération antidatée oblige quand même à vérifier la cohérence historique. Un solde courant seul ne suffit pas pour expliquer ou détecter la première date invalide.

#### Pourrait-on combiner projection et solde matérialisé ?

Oui. On peut conserver un solde optimisé tout en gardant l'historique comme source de vérité et reconstruire les projections après une correction passée.

### Algorithme et performance

#### Quelle est la complexité actuelle ?

Le service charge `n` opérations puis les trie en mémoire, donc environ `O(n log n)` en temps et `O(n)` en mémoire.

#### Pourquoi ne pas trier directement en SQL ?

Ce serait plus efficace et préférable. Ici, la nouvelle opération n'est pas encore persistée, donc elle est ajoutée en mémoire. On pourrait charger l'historique déjà ordonné par SQL puis insérer virtuellement la nouvelle opération au bon endroit.

#### Que feriez-vous avec un très gros historique ?

Je mesurerais d'abord. Ensuite, je pourrais utiliser une position matérialisée, des snapshots, un rejeu à partir du dernier snapshot antérieur et une requête ordonnée en streaming.

#### Pourquoi ne pas calculer seulement à partir de la date ajoutée ?

On peut calculer la position juste avant cette date, puis rejouer seulement la suite. Ce serait une optimisation raisonnable après mesure.

#### Pourquoi ne pas faire le contrôle entièrement en SQL ?

Une somme cumulée avec une fonction fenêtre pourrait détecter un solde négatif. Ce serait performant, mais plus dépendant du moteur. Pour cette première version, le code PHP rend la règle très lisible.

### Exceptions et logs

#### Pourquoi une exception dédiée ?

Le manque de position est un résultat métier attendu qui mérite un code, un message et un traitement différents d'une erreur technique.

#### Pourquoi loguer un refus attendu ?

Le warning aide à diagnostiquer des saisies répétées ou un problème d'interface. En production, il faudrait surveiller le volume pour éviter trop de bruit.

#### Pourquoi ne pas loguer tout le payload ?

Pour limiter les données sensibles et éviter des logs volumineux. On journalise seulement le contexte utile au diagnostic.

#### Quelle différence entre le code d'erreur et le message ?

Le client peut programmer son comportement sur `INSUFFICIENT_POSITION`. Le message est destiné à l'humain et peut être traduit ou reformulé.

#### Où sont les logs ?

Localement, dans `laravel-api/storage/logs/laravel.log`, selon la configuration de logging Laravel.

#### Pourquoi un warning et pas une error ?

L'application fonctionne correctement : elle refuse une commande métier invalide. Ce n'est pas une panne interne.

### Tests

#### Pourquoi des tests Feature plutôt que seulement unitaires ?

Le comportement traverse la validation, HTTP, Eloquent, la transaction et l'exception. Un test Feature vérifie que toutes ces couches sont bien connectées.

#### Pourquoi une base en mémoire ?

Elle rend les tests rapides et isolés. Sa limite est de ne pas reproduire exactement PostgreSQL, surtout pour les verrous.

#### À quoi sert `LazilyRefreshDatabase` ?

Il prépare et réinitialise la base de test uniquement lorsque le test en a besoin, afin de garder les tests isolés sans travail inutile.

#### Pourquoi utiliser des factories ?

Elles créent des données de test cohérentes et rendent l'intention plus lisible que des insertions répétées à la main.

#### Comment savez-vous que la vente refusée n'est pas enregistrée ?

Le test vérifie le statut et le code JSON, puis affirme que le nombre de transactions en base n'a pas augmenté.

#### Les tests verts prouvent-ils que tout est correct ?

Non. Ils prouvent seulement les scénarios couverts dans l'environnement utilisé. Ils ne valident pas encore la concurrence PostgreSQL ni l'autorisation.

#### Quel test ajouteriez-vous en premier ?

Un test d'intégration PostgreSQL lançant deux ventes concurrentes sur la même position, puis vérifiant qu'une seule peut être validée.

#### Pourquoi avoir aussi testé manuellement avec Insomnia ?

Pour vérifier le contrat vu par un vrai client HTTP : URL, headers, JSON, statuts et message d'erreur, indépendamment de la manière dont le test PHPUnit appelle l'application.

### Sécurité et production

#### Comment ajouteriez-vous l'authentification ?

Avec un mécanisme adapté au client, par exemple Sanctum, puis un middleware `auth` sur les routes API.

#### Comment empêcher l'accès au portefeuille d'un autre utilisateur ?

J'ajouterais `user_id` au portefeuille et une policy. Une ressource étrangère devrait idéalement répondre `404` pour ne pas révéler son existence.

#### Le `exists:assets,id` suffit-il ?

Non. Il prouve seulement que l'actif existe. Il faut aussi vérifier qu'il est autorisé ou rattaché au portefeuille concerné.

#### Comment éviter un double clic qui crée deux achats ?

Avec une clé d'idempotence fournie par le client, stockée avec une contrainte unique, puis en retournant le résultat de la première requête en cas de répétition.

#### Peut-on supprimer librement une transaction financière ?

En production, je préférerais une correction auditée ou une écriture compensatoire plutôt qu'une suppression sans trace.

#### Que faut-il surveiller en production ?

Les erreurs techniques, le taux de refus métier, les temps de réponse, les deadlocks, les conflits d'idempotence et la profondeur éventuelle des jobs.

### SQLite, PostgreSQL et décision regrettée

#### Pourquoi avoir commencé avec SQLite ?

Pour isoler rapidement la fonctionnalité et disposer de migrations et tests simples sans modifier l'infrastructure principale.

#### Pourquoi regretter ce choix ?

Parce que la fonctionnalité dépend justement des transactions et des verrous, dont le comportement diffère de PostgreSQL. J'ai aussi rencontré un problème de pilote PHP local.

#### SQLite était-il totalement inutile ?

Non. Il a permis de valider rapidement les règles et le contrat HTTP. Il était insuffisant pour valider la concurrence.

#### Que feriez-vous différemment ?

Je partirais directement sur PostgreSQL dans Docker pour les tests d'intégration critiques, tout en gardant éventuellement des tests plus légers pour la logique pure.

### Utilisation de l'IA

#### Quelle part l'IA a-t-elle réalisée ?

Une grande partie de l'exécution : exploration, proposition du cas, génération des fichiers, commandes, tests et documentation. Je ne prétends pas avoir écrit manuellement chaque ligne.

#### Quel a été votre rôle ?

J'ai cadré le besoin, accepté ou refusé les actions, demandé des explications, fait la manipulation dans Insomnia et vérifié que je pouvais comprendre et présenter le résultat.

#### Pourquoi garder l'approbation des commandes ?

Pour contrôler les installations, modifications, commandes Git, accès réseau et opérations potentiellement destructrices avant leur exécution.

#### Sur quoi ne faites-vous pas confiance à l'IA ?

Les secrets, les données clients, les opérations destructrices, les migrations réelles et les mises en production ne doivent pas être délégués sans contrôle explicite.

#### Les tests générés par la même IA sont-ils suffisants ?

Non. L'IA peut écrire un test qui confirme sa propre mauvaise compréhension. C'est pour cela que j'ai reproduit le scénario indépendamment avec Insomnia et identifié les limites de SQLite.

#### Que répondez-vous si on vous demande si vous comprenez le code ?

Je peux expliquer le chemin complet de la requête, la règle métier, la transaction, le verrou, les réponses HTTP, les tests et les limites. Les points que je ne maîtrise pas encore totalement, comme la concurrence PostgreSQL réelle, je les présente comme des travaux à valider.

## 14. Questions plus difficiles ou pièges

### Le service accepte un `array`. Ne serait-il pas préférable d'utiliser un DTO ?

Oui, un DTO typé rendrait le contrat interne plus explicite et éviterait les clés de tableau implicites. Pour quatre champs dans une première version, le tableau validé reste simple. J'introduirais un DTO si le cas d'usage grandit ou est appelé depuis plusieurs entrées.

### Pourquoi l'exception connaît-elle HTTP avec sa méthode `render()` ?

C'est pratique mais cela couple partiellement le domaine à Laravel HTTP. Une séparation plus stricte laisserait l'exception pure et configurerait son rendu dans le gestionnaire d'exceptions.

### Pourquoi le log est-il dans l'exception ?

Laravel sait automatiquement appeler `report()`, ce qui centralise le contexte du refus. Si plusieurs canaux ou politiques de journalisation apparaissaient, je déplacerais cette responsabilité vers un listener ou la configuration des exceptions.

### Une position peut-elle devenir négative après un achat ?

Un achat positif ne la fait pas baisser. Le même service traite les deux types pour rejouer un historique uniforme, mais le cas de refus est provoqué par une vente.

### Et deux opérations à la même seconde ?

Le `sequence_number` les départage. La règle exacte de priorité doit être documentée : ici, la nouvelle transaction reçoit la prochaine séquence et vient après les opérations existantes ayant exactement le même timestamp.

### Le tri sur une chaîne de date est-il fiable ?

Oui ici parce que toutes les dates sont normalisées au même format `Y-m-d H:i:s`, dont l'ordre lexical correspond à l'ordre chronologique. Trier des formats hétérogènes serait dangereux.

### Pourquoi `CarbonImmutable` puis un cast Eloquent mutable par défaut ?

`CarbonImmutable` sécurise la normalisation locale. Pour être totalement cohérent, le modèle pourrait utiliser le cast `immutable_datetime`.

### Pourquoi charger l'historique sans `orderBy()` puis trier en collection ?

La nouvelle opération doit être insérée virtuellement avant l'écriture. Pour cette version, tout est trié au même endroit. Une optimisation serait de faire ordonner l'historique existant par SQL et d'insérer la nouvelle opération à sa place.

### Pourquoi ne pas enregistrer puis contrôler et rollbacker ?

Ce serait possible dans la même transaction. L'insertion virtuelle évite cependant de déclencher inutilement des événements Eloquent ou effets liés à une création qui sera annulée.

### Que se passe-t-il avec un historique déjà invalide ?

Toute nouvelle opération provoque le rejeu et sera refusée dès la première position négative. En production, il faudrait aussi un outil d'audit pour détecter et corriger les données historiques avant l'utilisation.

### Que se passe-t-il si le même actif existe dans deux portefeuilles ?

Les calculs sont séparés, car la requête filtre à la fois `portfolio_id` et `asset_id`.

### Pourquoi verrouiller tout le portefeuille alors que le calcul filtre un actif ?

C'est une stratégie simple et sûre pour la première version. Elle réduit la concurrence. Une table de positions avec une ligne par couple portefeuille-actif permettrait un verrou plus fin.

### Une contrainte SQL peut-elle empêcher directement une position négative ?

Pas avec un simple `CHECK`, car la règle dépend de plusieurs lignes ordonnées dans le temps. Il faut une logique transactionnelle, une projection matérialisée ou un mécanisme plus avancé en base.

### Pourquoi ne pas utiliser un événement ou un observer Eloquent ?

Cette règle doit être explicite dans le cas d'usage et s'exécuter avant l'écriture. La cacher dans un observer rendrait le flux plus difficile à suivre et à contrôler transactionnellement.

### Pourquoi pas une queue ?

La validation doit être synchrone : le client doit savoir immédiatement si la vente est acceptée. Des traitements secondaires, comme recalculer des graphiques ou synchroniser des cotations, pourraient partir dans un job après commit.

### Si un job doit partir, comment éviter qu'il parte avant le commit ?

Je le dispatcherais après validation de la transaction, avec le mécanisme Laravel `afterCommit`, afin qu'il ne voie pas une donnée finalement rollbackée.

### Comment gérer une correction d'une transaction ancienne ?

Il faudrait auditer l'ancienne valeur, appliquer la modification dans une transaction, rejouer la chronologie, rollbacker si elle devient invalide et invalider les projections calculées à partir de cette date.

### Comment expliquer le compromis principal en une phrase ?

J'ai privilégié une règle métier lisible et vérifiable sur un petit périmètre, au prix d'un chargement complet de l'historique et d'un environnement SQLite qui devra être remplacé par PostgreSQL pour valider la concurrence.

## 15. Démonstration conseillée pendant l'entretien

Si le recruteur demande une démonstration, rester sur quatre requêtes :

1. achat de 10 au 1er janvier → `201` ;
2. vente de 10 au 1er mars → `201` ;
3. vente de 5 au 1er février → `422` ;
4. consultation du log indiquant le 1er mars comme première date négative.

Puis montrer rapidement :

- la route ;
- le `FormRequest` ;
- le contrôleur court ;
- le service et sa boucle de rejeu ;
- le test du cas antidaté.

Éviter de parcourir tous les fichiers ou le squelette Laravel. Le fil conducteur doit rester la règle métier.

## 16. Formulations honnêtes à retenir

> Ce n'est pas un incident de production. C'est une fonctionnalité concrète de mon projet personnel que j'ai récemment reprise en Laravel afin de pouvoir parler d'un code que je comprends et que j'ai manipulé.

> L'implémentation valide la règle métier, mais je ne prétends pas qu'elle est prête pour la production : l'authentification et le test réel du verrouillage PostgreSQL restent à faire.

> L'IA a réalisé une grande partie de l'exécution. Mon objectif est de comprendre le résultat, contrôler les actions sensibles et être capable d'expliquer les choix et leurs limites.

> Je ne défends pas SQLite comme le meilleur choix final. Il m'a permis de démarrer vite, puis ses limites m'ont justement donné un retour d'architecture concret.

> Je préfère dire qu'un point reste à valider plutôt que d'inventer une garantie que les tests actuels ne donnent pas.

## 17. Mémo très court avant l'appel

- Problème : une vente passée peut casser une vente future.
- Solution : insertion virtuelle, tri chronologique, rejeu complet, refus au premier solde négatif.
- Laravel : route, FormRequest, contrôleur, service, Eloquent, Resource, exception.
- Fiabilité : transaction SQL, verrou intentionnel, décimaux BCMath, tests Feature.
- Réponse : `201` si créé, `422` si règle métier violée.
- Logs : warning structuré avec portefeuille, actif et première date négative.
- Limites : pas d'auth, SQLite, verrou PostgreSQL non testé, historique en mémoire.
- Amélioration prioritaire : PostgreSQL Docker + test de concurrence + policy.
- IA : exécution largement déléguée, actions sensibles soumises à approbation, validation manuelle avec Insomnia.
