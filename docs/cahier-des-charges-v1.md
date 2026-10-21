# Mon Patrimoine — cahier des charges technique V1

Version : 0.2 — 14 octobre 2026. Destination : Claude Code / Cursor. **Spécification proposée, pas logiciel développé.**

## Objectif
Construire une application web privée, responsive, mono-utilisateur, hébergeable sur VPS, pour suivre les investissements sans interface de tableur. Le stockage métier n'utilise pas Google Sheets ; celui-ci reste une source auxiliaire de cotations via `GOOGLEFINANCE()` pour les instruments compatibles. Coût des API de prix recherché : zéro. Les cotations ne sont pas garanties en direct.

## Périmètre d'après le classeur fourni
Onglets : Dashboard, Actions, ETF, Crypto, Milàn, SCPI, Assurance Vie, Dividendes, graphiques, Portefeuille, Train de vie, Historique, Calcul, Achats  Reventes, Historiques  Comparaison.
- **Dans la V1** : Actions, ETF, Crypto, SCPI, Assurance Vie ; **Milàn** comme portefeuille distinct (catégorie de ses positions à déterminer lors de l’import) ; import des dividendes et transactions disponibles.
- **Hors périmètre investissement V1** : Train de vie (budget/revenus/dépenses du foyer), graphiques historiques antérieurs au lancement. Conserver le fichier source sans le modifier.
- Certaines cellules contiennent `#VALUE!` et `#NAME?` dans l'export : ne pas importer les résultats des formules en tant que source de vérité.
- Le classeur contient des positions et transactions présentées en blocs horizontaux ; certaines sources historiques devront être rapprochées et vérifiées manuellement. L'onglet dividendes comprend des montants mensuels nets sans date exacte.

## Décisions produit validées
1. Plusieurs portefeuilles indépendants et une vue consolidée ; **une catégorie d'actifs par portefeuille**.
2. Catégories initiales : actions, ETF, cryptos, SCPI, assurance-vie, autres au besoin.
3. Vue synthétique par défaut, statistiques avancées consultables.
4. Affichage positions **tableau ou cartes** ; préférence mémorisée.
5. Fenêtre modale `+ Transaction` accessible depuis tous les écrans : achats, ventes, frais, dividendes nets effectivement reçus.
6. Import de toutes les transactions historiques du classeur, mais **graphiques démarrant à la date de mise en service**.
7. Valorisation consolidée en EUR ; conserver devises et taux d'origine.
8. Gains réalisés / latents / dividendes séparés ; graphique de valeur et graphique de rendement neutralisant les mouvements de capital.
9. Recherche par nom, ticker ou ISIN, avec création manuelle de fiche d'actif. Sans fournisseur de catalogue, la recherche porte d'abord sur les actifs locaux ; ne pas promettre une recherche universelle.
10. Synchronisation automatique des cours et bouton manuel ; valeur en cache, date de récupération, indicateur de fraîcheur.
11. Pas d'affichage ni de gestion de solde espèces. Cela **ne supprime pas les flux de référence internes nécessaires au calcul du rendement**.
12. Un compte utilisateur privé ; aucune inscription publique.

## Pages et parcours
- **Connexion** : identifiant, mot de passe, sessions sécurisées, déconnexion ; prévoir possibilité TOTP.
- **Dashboard** : valorisation consolidée, capital encore investi, gain total (réalisé + latent + revenus), dividendes, TWR depuis mise en service, graphique valeur/rendement, répartitions et cartes portefeuilles.
- **Portefeuilles** : création, renommage, archivage, catégorie immuable après premières transactions ou migration explicite ; chaque portefeuille peut contenir plusieurs actifs de sa catégorie.
- **Portefeuille détaillé** : liste tableau/cartes, tri (nom, poids, valorisation, gain), recherche, dates de cours et devises, statistiques et historique depuis lancement.
- **Fiche actif** : ticker / ISIN / marché / devise, position, PRU, performance et transactions, dividendes.
- **Transactions** : liste filtrable ; fenêtre rapide achat/vente/dividende, édition contrôlée et recalcul ; vendre plus que la quantité disponible = refus.
- **Paramètres** : mapping cotations, prix manuels SCPI/assurance-vie, état sync, import, sauvegardes, préférences.

## Architecture proposée
- Next.js (App Router) + TypeScript + Tailwind ; routes serveur et couche de services métier séparée de l'interface.
- PostgreSQL 16+, migrations SQL versionnées, requêtes typées/ORM au choix ; environnement Docker Compose, reverse proxy Caddy + HTTPS.
- Un conteneur de synchronisation périodique (worker séparé recommandé pour le déploiement) ; tâches idempotentes avec verrou, journal de résultat et retraitement des erreurs.
- Bibliothèque arithmétique décimale pour les monnaies/quantités, jamais les float JS pour l'argent.
- Auth via solution maintenue, Argon2id pour le secret ; cookies `HttpOnly`, `Secure`, `SameSite`, protection CSRF adaptée, rate limiting, secrets en variables d'environnement ; sauvegardes chiffrées hors VPS et tests de restauration.
- Aucun accès direct public à PostgreSQL, ni token Google Sheets dans le navigateur.

## Schéma
Voir `schema_patrimoine_v1.sql`. Les tables proposées sont : `app_users`, `portfolios`, `assets`, `portfolio_assets`, `transactions`, `cash_movements`, `market_prices`, `fx_rates`, `valuation_snapshots`, `sync_runs`, `import_batches`, `app_preferences`. `cash_movements` est un journal interne auditable, dérivé des décisions de destination/source des fonds ; il ne correspond pas à un compte bancaire.

### Modèle spécifique par actif
- Actions / ETF : instrument négociable, quantité, prix, frais, monnaie de cotation ; source Google Finance si disponible.
- Crypto : quantité jusqu'à 18 décimales, cours via fournisseur crypto à sélectionner et tester, frais en fiat V1 ; si les frais sont en crypto, importer sous forme de mouvement explicite après validation du modèle.
- SCPI : fraction de part possible, valeur de part saisie manuellement, dates de valorisation et distribution de revenus ; ne pas appliquer la logique d'un flux « live ».
- Assurance-vie fonds euros : **traitement spécifique** par opérations de versement/retrait et ajustements de valorisation, non par achat d'actions fictives. La nature des lignes Inès / Cyril doit être validée comme portefeuilles distincts ou sous-comptes avant import.
- Milàn : ne pas attribuer de catégorie automatiquement ; le fichier a un onglet dédié, la classification doit être décidée à l'import.

## Règles financières, indispensables
- Achat : coût = quantité × cours + frais ; PRU moyen pondéré des lots ouverts, dans la **devise de transaction**, puis suivi parallèle du coût historique EUR selon le FX à la date.
- Vente : produit net = quantité × cours − frais ; coût de revient des unités vendues selon PRU moyen mobile ; plus-value réalisée calculée en devise d'origine ET en EUR au taux historique pertinent.
- Dividende : montant **net réellement perçu** dans la devise indiquée, éventuellement brut et retenues si renseignés ; ne pas ajouter aux positions encore détenues.
- Les flux d'achat/vente ne sont pas forcément les flux externes du portefeuille. **Avec une application sans cash, un TWR exact au niveau portefeuille peut être impossible** si le produit d'une vente est conservé hors positions suivies. V1 : choisir et documenter une convention de « capital investi virtuel » ou demander le flux externe lors de l'opération ; marquer un rendement `estimated` plutôt que prétendre à une mesure exacte lorsque l'information manque. Conserver montants de flux, horodatage et méthode calcul dans les snapshots.
- Démarrage performance : valorisation initiale et indice de rendement de base 100 à la date d'activation ; aucune courbe antérieure. Les gains réalisés historiques restent calculables.
- Valorisation : quantité détenue × cours dans devise native × taux EUR ; marquer les cours anciens et interdire une valorisation présentée comme actuelle si prix ou FX manquant.
- Assurance-vie : suivre valeur constatée et apports/retraits ; ses rendements ne sont pas ceux d'une cotation de marché quotidienne.
- Les sommes issues des ventes sortent par défaut ; toute exception est choisie explicitement. Les dividendes sont saisis à réception et leur destination est conservée. Les ajustements d’assurance-vie (intérêts) sont des revenus internes au contrat et non des apports externes.

## Sources des cours
- **Google Sheets** : feuille dédiée avec ID actif, ticker Google Finance, prix, devise, statut, heure de lecture et si possible heure de cotation. Apps Script lit les valeurs disponibles et les pousse au backend ou les expose via un endpoint authentifié ; le backend vérifie le secret, contrôle les valeurs, dédoublonne et met en cache.
- Synchro toutes les 15 min comme **hypothèse à tester**, pas SLA ; bouton manuel seulement pour déclencher une nouvelle lecture, sans promettre de forcer Google Finance.
- Historique : enregistrer des snapshots dès mise en service ; ne pas supposer que l'API Sheets transmet des données `GOOGLEFINANCE` historiques.
- Forex : collecter les paires nécessaires, horodater, ne pas utiliser un taux courant pour recalculer le coût historique d'une transaction.
- Cryptos : source gratuite à confirmer ; prévoir interface `PriceProvider` substituable.
- SCPI/assurance-vie : valorisation manuelle, avec date d'effet et source explicitement affichées.

## Import Excel
1. Parser le classeur sans exécuter ses formules et associer les blocs de positions aux actifs.
2. Extraire dates, quantités, coûts unitaires, frais, devises ; identifier les opérations négatives qui représentent des ventes.
3. Créer un rapport de prévisualisation (acceptées / rejetées / ambiguës / doublons) et mapping des champs.
4. NE PAS inventer de dates de dividendes : conserver période connue et demander validation ou attribuer date de référence **explicitement signalée comme estimée**.
5. Confronter quantités finales et PRU avec les positions du classeur ; signaler les écarts sans corriger silencieusement.
6. Effectuer l'import en transaction DB atomique et idempotente ; ne pas réimporter sans contrôle.
7. Permettre un export CSV/JSON complet de toutes les opérations et prix.

## Tests d'acceptation prioritaires
1. Deux achats du même titre + frais -> PRU moyen juste.
2. Vente partielle -> quantité restante et PRU correct ; gain réalisé net juste.
3. Dividende reçu -> gain total augmente ; valorisation des positions inchangée.
4. Achat USD, vente USD, variation EUR/USD -> gain EUR correct selon FX historique.
5. Prix non actualisé ou absent -> afficher timestamp/état, jamais 0 par défaut.
6. Relancer le même import -> aucun doublon.
7. Historique graphique démarre le jour de mise en service ; l'historique transactionnel complet est conservé.
8. Recherche nom/ticker/ISIN locaux, et création manuelle d'actif.
9. Une action ne peut pas être insérée dans un portefeuille SCPI.
10. Deux vues tableau/cartes, bascule instantanée, préférence mémorisée.
11. Aucun accès anonyme aux endpoints ; tests de déconnexion / session expirée.
12. Recalcul de tous les résultats après édition d'une transaction passée.
13. Revenus SCPI et ajustements assurance-vie ne sont pas traités comme des plus-values d'actions.
14. Vente avec retrait par défaut : chute de la valeur détenue, **sans** chute artificielle du TWR.
15. Vente avec conservation : valeur détenue diminue, trésorerie technique augmente, valeur économique stable.
16. Achat financé par trésorerie technique : consommation de cette trésorerie sans nouvel apport externe ; complément éventuel enregistré comme apport.
17. Dividende distribué ou conservé : même revenu net total, **une seule** contribution au rendement.
18. Calcul TWR quotidien signalé estimé lorsque les valorisations intrajournalières manquent ; tests sur flux en EUR et USD.
19. Intérêts d’assurance-vie fonds euros : capitalisation de la valeur du contrat, sans double compte dans les dividendes.

## Décisions à valider avant codage final
- **Milàn** : type de compte, classe d'actifs et propriétaire ; **Assurance Vie** : Inès / Cyril séparés ?
- **Dividendes historiques** : dates de paiement exactes ou approximation signalée.
- **Flux au démarrage** : identifier lors de l’import les ventes anciennement conservées sur le courtier et les acquisitions financées par celles-ci ; défaut : sortie à la vente et apport à l’achat. Signaler que cette hypothèse peut modifier les rendements historiques, mais les courbes ne débutent qu’à la mise en service.
- **Frais crypto en unités de crypto** et opérations swap, si présentes dans les données.
- **API Google Sheets** : preuve de fonctionnement sur EPA:AI, EPA:AIR, NASDAQ:MSFT et un ETF, incluant FX.

## Instruction de démarrage pour Claude Code
« Lis `cahier_des_charges_patrimoine_V1.md` et `schema_patrimoine_v1.sql`. N'implémente aucune hypothèse non validée sur le TWR, Milàn et l'assurance-vie. Commence par (1) examiner la base et créer migrations, (2) construire la logique financière et ses tests unitaires, (3) créer un prototype Next.js responsive utilisant des données d'exemple, (4) développer l'import en prévisualisation sans écriture par défaut, (5) réaliser un spike Google Sheets → backend. Sépare clairement les prix simulés, manuels et synchronisés. Ne déploie pas publiquement avant validation de l'authentification et des sauvegardes. »


## Annexe V1 — contrat métier des flux (validé le 14 octobre 2026)

| Événement | Comportement par défaut | Flux externe (convention) | Trésorerie technique | Effet sur revenus/gains |
|---|---|---|---|---|
| Achat pour 100 € net de frais | Argent neuf | +100 € | 0 € | PRU + coût frais inclus |
| Vente nette 120 €, option sortie | Fonds quittent le portefeuille | −120 € | 0 € | PV réalisée selon PRU |
| Vente nette 120 €, option conserver | Fonds pour futur achat | 0 € | +120 € | PV réalisée selon PRU |
| Achat 100 € depuis réserve | Source « réserve interne » | 0 € | −100 € | PRU + coût frais inclus |
| Achat 150 € avec réserve 100 € | 100 € réservés + 50 € nouveaux | +50 € | −100 € | PRU + coût frais inclus |
| Dividende net 10 €, distribué | Revenus versés hors portefeuille | Retrait technique 10 € distinct du revenu | 0 € | +10 € de revenu, une seule fois |
| Dividende net 10 €, conservé | Revenus dans la réserve interne | 0 € | +10 € | +10 € de revenu, une seule fois |
| Intérêts fonds euros 20 € | Capitalisés dans le contrat | 0 € | 0 € | +20 € de produit, variation de valeur cohérente |

**Terminologie obligatoire :** `market_value_eur` = valeur des positions ; `technical_cash_eur` = réserve interne non affichée ; `economic_value_eur` = somme des deux pour le calcul du rendement. Le montant total « patrimoine investi » sur le dashboard doit préciser s'il exclut la réserve interne (par défaut oui). Ne jamais additionner automatiquement les produits de ventes passées à la valeur détenue.

**Intégrité transactionnelle :** un achat/une vente, ses frais, ses mouvements de cash et ses flux de performance sont écrits dans **une seule transaction SQL**. Toute correction d'une transaction historique invalide les PRU, soldes internes et snapshots des dates suivantes. Les montants en différentes devises ne peuvent être additionnés qu'après conversion par un FX horodaté ; pas de taux historique inventé.

**TWR :** pour chaque sous-période, calculer la variation de la valeur économique *avant* le flux externe de fin de sous-période, puis chaîner les facteurs `(1 + rendement)` ; les dividendes sortis du portefeuille doivent être traités comme revenus de performance, et leur sortie doit être neutralisée à cette fin. Cette règle se teste par bilan de conservation : l'achat/vente interne seul ne change pas le rendement, seul le mouvement du marché, les frais, les revenus et les variations de change le font.

**Priorité de développement :** les flux/PRU sont calculés par service métier testé, pas par des triggers SQL opaques. Les contraintes SQL protègent le stockage ; le moteur de calcul contrôle l'ordre chronologique, les quantités et les réserves.
