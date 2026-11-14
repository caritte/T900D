# T900D

PWA Web Bluetooth pour tapis Domyos T900D (FTMS). Chrome Android, HTTPS requis (GitHub Pages) ou `localhost`.

- `src/ftms.js` : BLE FTMS (connexion, commandes, décodage)
- `src/workout.js` : parseur de séances + moteur
- `src/app.js` : UI (accueil, éditeur graphique, course) ; `src/chart.js` graphe SVG ; `src/demo.js` tapis simulé (`?demo=1`)
- Tests : `node test/run.mjs`
