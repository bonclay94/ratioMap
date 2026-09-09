# Review — RatioMap v2

## Livraison

Branche `codex/refonte-v2`, issue de `preview/city-add-button` (`0312086`). Refonte locale, sans push ni déploiement. Les améliorations locales préexistantes sur les départements et leur ajout sont reprises. Aucun changement sur main/master.

## Changements à examiner

- Client réécrit en React et TypeScript : recherche, filtres, liste/carte, fiches, partage, états d’erreur, mobile et thème système. Composants et styles séparés par responsabilité.
- Serveur découpé en domaine, fournisseur Google, stockage et application HTTP injectable. Contrats validés et partagés ; délais, concurrence et annulation explicites.
- Corrections fonctionnelles : départements et Corse, notes décimales, navigation historique, marqueurs stables, partage de la recherche exécutée, horaires inconnus, textes externes échappés.
- Conservation des paramètres URL, anciens liens courts, formule du ratio et clés Places Legacy. Les filtres locaux ne relancent pas Google ; l’enrichissement exige une action explicite.
- Build Vite/Node, adaptateur Netlify moderne, tests et CI, documentation de démarrage et décisions.

**Changement d’exploitation :** `npm start` exige désormais `npm run build`. Node 22.12 minimum. Sur Netlify, le dossier publié devient `dist/client` via la configuration fournie.

## Validation effectuée le 9 septembre 2026

- `npm run check` : formatage conforme, **78 tests réussis dans 6 fichiers**, TypeScript strict et compilation client/serveur réussis.
- Tests couvrant domaine, orchestration Google, pagination/annulation, API, ancien et nouveau format Netlify, recherche React, partage, fiches et synchronisation des marqueurs avec un SDK simulé.
- Compilation séparée du point d’entrée Netlify avec esbuild réussie.
- Démarrage du serveur de production et vérification HTTP : accueil, santé API, pages légales et ressources compilées répondent 200 ; ressources avec cache immutable.
- Vérification du contenu public compilé : clé Google serveur absente.
- Audit npm après mise à jour du verrouillage : aucune vulnérabilité connue signalée.

Bundle principal : 311,44 kB brut / 96,52 kB gzip ; CSS : 24,26 kB brut / 5,43 kB gzip. Carte et dialogues en modules séparés. Ces mesures excluent le SDK Google chargé à l’exécution.

## Limites de validation

La suite Playwright desktop/mobile est préparée, mais n’a pas été exécutée : l’autorisation spécifique de tests navigateur demandée n’a pas été reçue. Aucun contrôle visuel réel ni mesure Lighthouse n’est revendiqué. Les tests React utilisent jsdom et des réponses simulées.

Aucun appel Google payant, aucun déploiement Netlify et aucune écriture dans le stockage de production n’ont été effectués. Les clés, restrictions de domaines, droits Blobs et éventuelle publicité doivent être validés dans l’environnement cible avant mise en ligne. Les coordonnées de l’éditeur dans les mentions légales restent à renseigner.

## Parcours de review conseillé

1. Lire `docs/DECISIONS.md`, puis lancer `npm ci` et `npm run check`.
2. Lancer `npm run dev` avec les clés existantes et vérifier une recherche par rayon, puis par département ; comparer liste, carte et fiche.
3. Vérifier les filtres locaux, le bouton Appliquer, le partage et le retour navigateur ; parcourir l’interface sur mobile et au clavier.
4. Exécuter la suite Playwright documentée dans le README, puis valider l’intégration réelle sur un environnement Netlify de prévisualisation avant publication.

## Révision graphique après retour utilisateur

Direction « atlas de comparaison » appliquée : palette papier/encre, liste continue à la place des cartes arrondies, chiffres tabulaires, commandes compactes et suppression des slogans/décorations. Voir la décision 9. Les 78 tests, le contrôle TypeScript et le build passent après ces changements. Bundle principal actualisé : 311,03 kB / 96,33 kB gzip ; CSS : 23,78 kB / 5,33 kB gzip. La réserve sur la validation visuelle reste applicable.

## Disposition 02 intégrée — 10 septembre 2026

Carte plein écran, recherche en bas et panneau de résultats escamotable intégrés sur la branche de refonte. Orange `#FF6200`, Tahoma/Arial, angles adoucis. La recherche par zone, les filtres, détails et partage restent disponibles. Le test d’intégration vérifie désormais également la fermeture/réouverture des résultats, la conservation de l’adresse et l’absence de nouvelle requête de recherche lors de cette manipulation. Le scénario Playwright mobile est adapté au nouveau panneau.

Validation : 78 tests réussis, TypeScript et build réussis ; serveur de développement vérifié par HTTP sur `http://127.0.0.1:3000/`. Bundle principal : 310,86 kB / 96,16 kB gzip ; CSS : 28,53 kB / 6,17 kB gzip. Aperçu ouvert pour essai par l’utilisateur. Aucune validation visuelle navigateur par l’agent à ce stade, l’autorisation demandée restant sans réponse ; aucune requête Google payante effectuée pour les tests.
