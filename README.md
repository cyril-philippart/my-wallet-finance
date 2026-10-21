# My Wallet Finance

Application privée de suivi de patrimoine. Le développement commence par le moteur financier et les garanties de stockage avant l'interface.

## État actuel

- spécifications originales conservées dans `docs/` ;
- décisions V1 consignées dans `docs/decisions-v1.md` ;
- projection chronologique des achats et ventes au PRU moyen mobile ;
- coût historique et gains réalisés en devise native et en EUR ;
- migration PostgreSQL initiale révisée ;
- migration validée sur PostgreSQL 16 avec 15 tables créées ;
- tests unitaires avec Vitest.

## Commandes locales

```powershell
npm.cmd install
npm.cmd test
npm.cmd run typecheck
```

Pour tester la migration dans PostgreSQL, renseigner au minimum `POSTGRES_PASSWORD` puis lancer Docker Compose. La base n'est publiée sur aucun port hôte.

```powershell
$env:POSTGRES_PASSWORD = "un-secret-local"
docker compose up -d db
docker compose exec db psql -U my_wallet_finance -d my_wallet_finance -c "\dt"
```

La date de départ de l'indice de rendement base 100 reste à renseigner avant l'activation des snapshots.

## Création du compte privé

Il n'existe aucune inscription publique et l'écran ne demande pas d'identifiant. Le compte interne unique est `Cyril`. Sur une base vide, définir temporairement `ADMIN_PASSWORD` dans le terminal puis exécuter `npm.cmd run admin:create`. Le mot de passe ne peut pas être vide et n'est jamais écrit dans le dépôt.
