# Cotations Google Sheets

1. Créer un Google Sheet vide.
2. Ouvrir **Extensions → Apps Script** et remplacer le contenu par `Code.gs`.
3. Dans **Paramètres du projet → Propriétés du script**, ajouter `SYNC_SECRET` avec une valeur aléatoire longue.
4. Exécuter une fois `setupQuotesSheet` et autoriser le script.
5. Déployer comme **Application Web**, exécuter en tant que propriétaire et autoriser l'accès à toute personne disposant du lien.
6. Copier l'URL `/exec` et renseigner `GOOGLE_SHEETS_QUOTES_URL` ainsi que le même secret dans `.env.local`.

Les lignes fournies par `setupQuotesSheet` comprennent aussi les cinq comparateurs du dashboard : CAC 40, Nasdaq Composite, S&P 500, Bitcoin et Ethereum. Sur une feuille déjà configurée, ajoutez simplement ces cinq lignes sous vos actifs en recopiant les formules des colonnes C à F. Les symboles crypto attendus dans la réponse sont `BTCEUR` et `ETHEUR`.

## Fonds Boursorama (OPCVM)

Pour un OPCVM absent de Google Finance, utilisez le code `OPCVM:` suivi de l'identifiant présent dans l'URL Boursorama. Exemple : `OPCVM:MP-829569` pour Allianz Valeurs Durables RC. Le script récupère la dernière valeur liquidative, la valeur précédente et la dernière valeur antérieure au début du mois depuis la page historique Boursorama. Après modification du script, exécutez `upgradePerformanceColumns` une fois pour installer les formules sur les lignes existantes.

Pour activer les performances journalières, mensuelles et annuelles sur une feuille existante, remplacez le script par la version courante, redéployez l'application Web puis exécutez une fois `upgradePerformanceColumns`. Cette fonction ajoute les colonnes H à M et leurs formules historiques sans effacer les lignes existantes.

L'accès public au déploiement ne révèle rien sans le secret. La feuille ne contient que des tickers et cotations, jamais les transactions ou mots de passe.

## Ajout automatique des actifs

La fonction `doPost` ajoute automatiquement dans la feuille les nouveaux actifs enregistrés dans l'application, sans créer de doublon, puis installe leurs formules de cours et d'historique. Après toute modification de `Code.gs`, créer une **nouvelle version** du déploiement de l'application Web ; modifier seulement le fichier sans redéployer ne met pas à jour l'URL `/exec` déjà utilisée par l'application.
