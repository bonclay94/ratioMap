# RatioMap v2

Rechercher des lieux, comparer leurs notes et leur nombre d’avis, puis les situer sur une carte Google. Interface française, sans compte, adaptée au mobile et au thème du système.

## Démarrer

Node **22.12+** et npm sont nécessaires.

```sh
npm ci
cp .env.example .env
# Renseigner les deux clés Google dans .env.
npm run dev
```

Ouvrir `http://127.0.0.1:3000` (ou le `PORT` configuré). Le serveur Express et Vite fonctionnent dans le même processus ; les modifications de l’interface sont rechargées à chaud. Ne pas écraser un `.env` déjà renseigné.

L’application démarre aussi sans clés : elle indique que la recherche est indisponible. Sans clé navigateur, les recherches restent possibles si la clé serveur est présente ; seule la carte et l’autocomplétion Google sont indisponibles.

## Production Node

```sh
npm run build
npm start
```

La compilation produit `dist/client` (fichiers publics) et `dist/server.cjs` (serveur). `server.js` reste un point d’entrée pour `npm start`, mais il exige désormais une compilation préalable. Les ressources avec empreinte de contenu sont mises en cache un an ; les documents sont revalidés et les résultats de recherche ne sont pas mis en cache HTTP.

## Variables

| Variable                               | Usage                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_MAPS_API_KEY`                  | Clé serveur pour Geocoding et Places Legacy ; jamais envoyée au navigateur.                                                                                |
| `GOOGLE_MAPS_BROWSER_KEY`              | Clé publique restreinte aux domaines autorisés, pour Maps JavaScript et l’autocomplétion.                                                                  |
| `GOOGLE_MAPS_MAP_ID`                   | Facultatif ; permet les marqueurs avancés. Les marqueurs classiques sont utilisés autrement.                                                               |
| `ANTHROPIC_API_KEY`                    | Facultatif ; clé serveur de l’assistant « Décrire ma recherche ». Sans elle, l’assistant est masqué. Plafond de dépense à fixer dans la console Anthropic. |
| `ANTHROPIC_MODEL`                      | Facultatif ; modèle de l’assistant, `claude-haiku-5-5` par défaut (famille Claude 5).                                                                      |
| `PORT`                                 | Port local/Node ; 3000 par défaut.                                                                                                                         |
| `ADSENSE_CLIENT_ID`, `ADSENSE_SLOT_ID` | Facultatifs ; aucun script publicitaire si l’un manque ou sans consentement.                                                                               |

Ne jamais préfixer une clé serveur par `VITE_`. Les clés existantes restent compatibles ; Places New n’est pas requis par cette refonte.

## Netlify

Le fichier `netlify.toml` définit le build, Node 22, le dossier public et les redirections existantes. Reporter les variables Google dans les variables d’environnement de Netlify, disponibles aux fonctions.

L’API Express est exposée via le runtime Netlify moderne et l’adaptateur officiel `@netlify/aws-lambda-compat`. Ce runtime fournit le contexte Blobs nécessaire au stockage `short-links`. Les anciens identifiants à sept caractères et les anciens paramètres de recherche sont conservés. Aucun déplacement des données n’est nécessaire.

En cas d’indisponibilité du stockage, le partage affiche l’URL complète. En Node local, le stockage des liens est temporaire (24 heures, 1 000 entrées maximum, perdu au redémarrage) ; l’interface partage donc le lien complet. Aucun déploiement n’est effectué par la commande de build.

## Validation

```sh
npm run check         # Format, tests de domaine/API/interface, TypeScript et build
npm test             # Tests sans clé Google ni réseau externe
npm run format       # Formatage des sources et de la documentation
npm audit            # État des vulnérabilités connues du verrouillage npm
```

Suite navigateur facultative, avec réponses simulées exclusivement dans les tests :

```sh
npm run build
npx playwright install chromium
npm run test:e2e
```

La suite Playwright cible desktop et mobile ; son serveur dédié utilise des clés vides et ses tests interceptent les appels API. Le workflow CI lance les vérifications à chaque push ciblé et la suite navigateur sur les pull requests.

## Organisation

```text
src/shared/       Contrats, validation, URL, filtres et référentiel des départements
src/server/       Application HTTP, domaine, Google, stockage et adaptateurs d’exécution
src/client/       État de recherche, composants, adaptateur Maps et styles
public/           Pages légales, thème partagé, favicon
netlify/functions/ Point d’entrée Netlify
tests/            Domaine, API, interactions et suite navigateur
docs/             Décisions d’architecture et compte rendu de review
```

Le fournisseur Google, le stockage et les contours sont injectables dans `createApp`. Les tests ne dépendent donc pas du réseau Google et n’engagent pas de coût API.

## Fonctionnement et limites

- Le ratio conserve la formule historique : `(note × avis + 3,9 × 10) / (avis + 10)`. C’est une note pondérée, pas une garantie de qualité.
- Recherche par rayon strict, ou jusqu’à trois villes/départements/codes postaux ; en mode zones, le rayon ne s’applique pas. `Paris 1er` devient `75001`. Les noms des départements, `2A`, `2B` et les DOM sont reconnus.
- Au maximum trois pages de résultats par zone, selon la sélection de Google. La recherche n’est pas exhaustive ; les contours de certains départements ultramarins ne sont pas disponibles dans la source existante.
- Les filtres de note/avis/ouverture et le tri restent locaux. Mots-clés et horaires se lancent avec « Appliquer » ou une nouvelle recherche. Les horaires sont hebdomadaires et locaux au lieu, sans garantie sur les jours exceptionnels. Les avis recherchés sont ceux fournis par Google, généralement jusqu’à cinq.
- Six appels Google simultanés maximum par instance, douze requêtes actives côté API et un budget de recherche de 25 secondes. Le budget client est de 35 secondes. Ces limites ne remplacent pas les quotas et budgets du projet Google Cloud ; plusieurs instances Netlify peuvent fonctionner en parallèle.
- Les résultats restent en mémoire dans la page. Les liens partagés contiennent la position et éventuellement l’adresse : le dialogue de partage l’indique avant copie.
- Les pages légales conservent le champ de contact à renseigner par l’éditeur. AdSense reste désactivé par défaut.

Voir [les décisions](docs/DECISIONS.md) et [le compte rendu de review](docs/REVIEW.md).
