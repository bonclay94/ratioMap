# Refonte RatioMap v2 — décisions

## Point de départ

Branche : `codex/refonte-v2`, créée depuis `preview/city-add-button` (commit `0312086`). Aucun changement sur main/master. Les modifications locales préexistantes (suggestions des départements, navigation clavier, bouton d’ajout) font partie du périmètre conservé. Une copie avant intervention et leur diff ont été placés dans `/private/tmp/ratiomap-before-v2`.

Audit de tous les fichiers suivis : serveur Express de 555 lignes, contrôleur navigateur de 1 318 lignes, styles de 1 268 lignes, page principale, deux pages légales, adaptateur Netlify et configuration npm. Pas de tests, de build ni de documentation. Le manifeste décrivait encore un moteur réservé aux dentistes.

Risques observés : interpolation HTML des noms/avis/tags ; recherches concurrentes sans annulation ; marqueurs liés aux indices plutôt qu’aux identifiants ; appels de détails non bornés ; valeurs API non validées ; erreurs Google brutes ; stockage des liens retombant silencieusement en mémoire en production ; restauration URL dépendant du script Maps ; notes décimales tronquées ; noms de départements non résolus et Corse mal filtrée ; filtres déclenchant des appels payants à chaque changement ; navigation précédente non restaurée.

## 1. React, TypeScript strict et Vite

La complexité est principalement interactive (formulaire, filtres, liste, carte, fiche, historique). React rend ces états explicites et échappe les textes externes ; TypeScript partage les contrats du serveur et du client. Vite produit des fichiers statiques avec empreintes de contenu. Pas de SSR, de routeur applicatif ou de gestionnaire d’état global : une seule surface de travail ne les justifie pas. Pas de bibliothèque de composants complète ; HTML sémantique, contrôles natifs et icônes Lucide.

Référence : [documentation Vite](https://vite.dev/guide/). Le projet cible Node 22.12 minimum et Node 22 sur Netlify/CI.

## 2. Conserver Express, npm et Netlify

Ces choix conviennent au produit et évitent une migration d’hébergement sans bénéfice fonctionnel. Le serveur est découpé en application HTTP injectable, validation, domaine, fournisseur Google et stockage des liens. Un même code sert le développement, la production Node et Netlify Functions. `server.js` reste le point d’entrée de compatibilité après compilation. Pas de base de données nouvelle.

## 3. Garder Places Legacy derrière une interface

Les clés existantes et les champs disponibles doivent continuer à fonctionner. Basculer immédiatement vers Places New peut changer les API à activer, les permissions et la facturation. Ce changement est donc isolé pour une migration ultérieure. Le score reste `(note × avis + 3,9 × 10) / (avis + 10)`, avec davantage d’explications, sans prétendre garantir la qualité d’un établissement.

La pagination Legacy est limitée à trois pages par zone et exige un délai d’activation du jeton : [Text Search Legacy](https://developers.google.com/maps/documentation/places/web-service/legacy/search-text). La liste n’est jamais présentée comme exhaustive. Les mots-clés portent uniquement sur les avis que Google fournit, pas sur tous les avis d’un lieu.

Les marqueurs avancés sont utilisés si un Map ID est configuré. Sans Map ID, l’adaptateur conserve les marqueurs classiques pour la compatibilité : [migration Google](https://developers.google.com/maps/documentation/javascript/advanced-markers/migration). Le widget d’autocomplétion existant est conservé en amélioration progressive, avec des champs utilisables quand Google ne se charge pas.

## 4. Contrôler le travail externe

Annulation de la chaîne géocodage/recherche lorsqu’elle devient obsolète ; délai maximum ; limite de concurrence par instance pour Google ; nombre borné de zones, mots-clés et pages. Les filtres purement locaux (note, avis, statut, tri) ne sollicitent pas Google. Mots-clés et horaires sont appliqués par un bouton explicite. Aucun cache persistant de contenu Google ; les données restent dans la recherche ouverte et la mémoire de la fiche affichée. Les contours géographiques publics ont un cache distinct et borné.

Une limite par instance ne constitue pas un quota distribué entre fonctions Netlify. Les limites financières du projet Google doivent rester configurées dans Google Cloud.

## 5. Recherche visible, données réelles

Palette orange du produit, texte encre, surfaces sobres, typographie système, contraste et espaces plus généreux. Pas de photos décoratives ni de résultats fictifs. La carte enrichit la recherche sans la conditionner. Les états initial, vide, chargement, erreur et service indisponible sont distincts. Les résultats et les marqueurs communiquent par `placeId`.

Les champs édités sont séparés de la dernière recherche exécutée : le partage décrit les résultats réellement obtenus, pas un formulaire encore non soumis. Le format des paramètres historiques est conservé et les retours navigateur sont pris en charge.

## 6. Préserver les fonctionnalités et rendre leurs limites explicites

Recherche libre, adresse/géolocalisation, rayon strict, jusqu’à trois villes/départements/codes postaux, arrondissements parisiens, contours disponibles, tris, bornes de notes/avis, statut, horaires hebdomadaires, cinq mots-clés, détails et avis, liens courts, affichage clair/sombre, pages légales et AdSense facultatif. Le filtre hebdomadaire ne promet pas de prendre en compte les ouvertures exceptionnelles.

Les liens courts restent dans `short-links` sur Netlify, sans modifier les anciens identifiants. En local, les liens sont temporaires et bornés ; si le stockage distant échoue, l’API signale l’échec et le client utilise l’URL complète. Aucun lien éphémère n’est annoncé comme durable en production.

## Validation

Tests de domaine et d’API sans appel Google réel, tests des interactions React et vérification TypeScript/build. Les tests navigateur, lorsqu’autorisés, utilisent des réponses déterministes clairement réservées aux tests pour éviter les coûts et la dépendance aux résultats Google. Le compte rendu final est dans `docs/REVIEW.md`.

## 7. Runtime Netlify et dépendances

Le point d’entrée utilise le runtime moderne avec l’adaptateur officiel `withLambda`, afin de conserver Express tout en disposant du contexte Netlify Blobs. L’annulation de la requête Web est transmise au serveur. La compatibilité est testée au niveau Request/Response, mais un déploiement réel reste nécessaire pour valider les droits du stockage distant. Référence : [adaptateur officiel Netlify](https://docs.netlify.com/build/functions/api/#withlambda).

Le verrouillage npm a été actualisé. L’override `qs >= 6.16.0` corrige la dépendance transitive encore épinglée par Express ; il pourra être retiré lorsque la version d’Express retenue inclura cette correction. L’audit npm du verrouillage ne signale aucune vulnérabilité connue lors de la validation.

## 8. Compromis de poids client

React et la validation partagée augmentent le JavaScript par rapport au client vanilla initial. Le bundle principal représente 96,52 kB gzip ; la carte et les dialogues sont chargés séparément. Cette refonte ne revendique donc pas une diminution générale du poids ou un gain mesuré de rendu. Les améliorations de performance vérifiées concernent surtout les appels externes bornés, l’annulation, les filtres locaux, la réutilisation des marqueurs et le cache HTTP des ressources compilées. Le chargement du SDK Google reste un coût externe distinct.
