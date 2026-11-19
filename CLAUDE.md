# T900D — contexte du projet

Application personnelle qui pilote un tapis de course **Domyos T900D** en Bluetooth depuis un téléphone Android : programmes d'entraînement, séances créées sur un graphe, suivi cardio, historique. Usage familial, une installation par téléphone, aucune donnée en ligne.

L'utilisateur n'est pas développeur : il teste sur son téléphone et son tapis, puis décrit le résultat ou envoie des captures. Il veut des réponses en français, courtes et directes.

## Où en est le projet

- Version courante : **v4**. L'utilisateur veut que les évolutions continuent dans la v4, sans créer de nouvelle version tant qu'il ne le demande pas.
- Contenu de la v4 : 32 programmes par catégorie et niveau, éditeur graphique de séances (étapes en durée ou en distance), plan guidé avec objectif de course, intensité réglable, affichage géant, reprise d'une séance interrompue, zones cardiaques et alerte vocale, historique, écrans Progression et Analyse, sauvegarde automatique, envoi vers Health Connect, affichage de la glycémie et de l'IOB d'AAPS.
- Notices : une par version dans `docs/`, la v4 est à jour à la date de ce fichier.
- L'appli est installée sur plusieurs téléphones de la famille ; un seul reçoit les données d'AAPS.
- **Règle de travail** : quand l'utilisateur demande de chercher la cause d'un problème, analyser et proposer, sans modifier l'appli tant qu'il ne l'a pas demandé explicitement.

## Travail en cours (à reprendre en priorité)

**L'envoi automatique vers Health Connect en fin de séance ne semble pas fonctionner.** L'envoi par bouton et le rattrapage au lancement de l'appli marchent.

Constaté le 18/11 :
- Réglages affichait « Dernier envoi réussi le 18/11 19:28 : Reprise 1 (4 éléments) », sans « Dernier échec » ni « séances en attente ». La sauvegarde automatique datait de 19:25:40, sans doute l'heure de fin de séance.
- Samsung Health n'affichait aucun exercice le 18 (capture à 19:32).

Questions posées à l'utilisateur, sans réponse au moment de cette mise à jour :
1. A-t-il touché un bouton d'envoi vers 19:28 ? Si oui, l'envoi automatique de 19:25 n'est probablement pas parti.
2. La séance du 18 figure-t-elle dans Santé Connect → Données et accès → Activité → Exercice, avec T900D comme source ? Si oui, le problème est côté Samsung Health (import), pas T900D.
3. Que disent les lignes « Health Connect : … » du Journal Bluetooth (perdues si l'appli a été fermée) ?

Analyse du code (`src/app.js` : `healthSave`, `healthSync`, `healthPending`, et l'appel dans `finishRun`) : la fin de séance appelle le même code que le bouton, aucun bug évident. Faiblesses repérées, **non corrigées** en attendant le feu vert de l'utilisateur :
- `healthSync` est protégé par `hcBusy` : si un appel natif ne répond jamais, `hcBusy` reste vrai et tous les envois automatiques suivants sont ignorés sans message jusqu'au redémarrage. Le bouton contourne ce verrou. Hypothèse compatible avec « le bouton marche, l'automatique non », non prouvée.
- La ligne d'état ne dit pas si l'envoi était automatique ou manuel, ni la date de la séance envoyée.
- Les tentatives automatiques ne sont tracées que dans le Journal, qui disparaît à la fermeture.

Corrections proposées : délai maximal sur l'appel natif qui libère le verrou, origine et date de la séance dans la ligne d'état, historique persistant des envois. À faire seulement quand l'utilisateur le demande.

## Architecture

Une appli web sans framework ni bundler (modules ES natifs), emballée dans un APK par Capacitor.

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Tous les écrans (une `<main>` par écran), thème sombre, portrait et paysage |
| `src/app.js` | Interface et navigation ; le seul fichier qui touche au DOM |
| `src/ftms.js` | Protocole FTMS : décodage, commandes, `TreadmillBase` (file d'écriture, reconnexion) et transport Web Bluetooth |
| `native/index.js` | Transport Bluetooth natif et fonctions Android (voix, anti-veille, partage, sauvegarde). Chargé uniquement dans l'APK, bundlé par esbuild en `www/native.bundle.js` |
| `src/demo.js` | Tapis simulé, activé par `?demo=1` |
| `src/workout.js` | Mini-langage des séances, `WorkoutRunner` (moteur d'exécution), étapes en durée ou en distance, intensité |
| `src/programs.js` | Les programmes intégrés, vitesses en % de la VMA |
| `src/plan.js` | Plan guidé (séance du jour) et objectif de course |
| `src/recorder.js` | Enregistrement d'une séance (une mesure par seconde, un point de courbe toutes les 5 s) |
| `src/hr.js`, `src/progress.js` | Zones cardiaques, indice cardio, statistiques de progression |
| `src/analysis.js` | Écran Analyse : FC selon la vitesse par périodes de 4 semaines, récupération cardiaque, zones par semaine |
| `src/glucose.js` | Mise en forme de la glycémie et de l'IOB reçues d'AAPS |
| `src/chart.js` | Tous les graphes, en SVG |
| `src/store.js`, `src/db.js` | Stockage : réglages et séances créées dans localStorage, séances réalisées dans IndexedDB |
| `android/` | Projet Capacitor (permissions, signature, icônes) |
| `test/run.mjs` | Tests de la logique pure |

Règle de conception : toute la logique testable vit dans des modules purs (pas de DOM, horloge injectable) ; `app.js` ne fait que brancher.

## Ce qui est établi sur le vrai tapis

- Le tapis s'annonce sous un nom qui commence par `Domyos` et parle **FTMS standard** (service 0x1826). Les commandes démarrer, arrêter, vitesse et pente fonctionnent.
- La **fréquence cardiaque** arrive par le tapis (ceinture pectorale analogique captée par la console), dans le champ FC des trames FTMS.
- Le **compteur de distance du tapis n'avance que par pas de 100 m** : l'appli intègre la vitesse à la place.
- Limites retenues : vitesse 1 à 18 km/h (pas de 0,5), pente 0 à 10 % (pas de 1 %).
- L'APK s'affiche bord à bord : les marges des barres système passent par `--safe-area-inset-*` (voir le haut de `style.css`).
- Les téléphones Samsung bloquent l'installation tant que le « Bloqueur automatique » est actif.

- La sauvegarde automatique dans `Documents/T900D` fonctionne, et la réception de la glycémie et de l'IOB d'AAPS aussi.

Non vérifié sur l'appareil : la caractéristique FTMS « Statut » (le départ depuis la console est aussi détecté par le passage de la vitesse de 0 à plus de 0), la reconnexion après une vraie coupure.

## Glycémie et IOB (AAPS)

Depuis la v4, l'écran de course peut afficher la glycémie et l'insuline active fournies par l'appli AAPS installée sur le même téléphone. Les deux compteurs n'apparaissent que si des données sont reçues.

- AAPS diffuse son état par l'intent `info.nightscout.androidaps.status` (plugin « Samsung Tizen », `TizenPlugin.kt` dans AAPS), à chaque cycle de boucle. Extras utilisés : `glucoseMgdl`, `glucoseTimeStamp`, `units`, `slopeArrow`, `deltaMgdl`, `iob`, `low`, `high`.
- AAPS n'envoie qu'aux **récepteurs déclarés dans le manifeste** (il les cherche avec `queryBroadcastReceivers`) : `AapsReceiver.java` doit rester déclaré dans `AndroidManifest.xml`. `AapsPlugin.java` expose la dernière valeur à la page ; `src/glucose.js` la met en forme.
- Une mesure de plus de 11 minutes est grisée et datée, jamais présentée comme actuelle. Ne pas affaiblir cette règle.
- C'est un affichage d'information : l'appli ne déclenche aucune alerte de glycémie et ne doit jamais envoyer quoi que ce soit à AAPS.
- Test en simulation : `?demo=1&aaps=1`. La réception réelle ne peut être vérifiée que sur le téléphone.
- Ne rien écrire dans ce dépôt public sur la santé de l'utilisateur.

## Health Connect

Depuis la v4, un réglage permet d'enregistrer chaque séance terminée dans Health Connect, d'où Samsung Health peut la récupérer.

- Écriture seule, avec l'**API intégrée à Android 14+** (`android.health.connect`, utilisable en Java) : pas de dépendance Jetpack ni de Kotlin. `HealthWriter.java` n'est chargé qu'à partir de l'API 34 ; `HealthPlugin.java` fait le pont. Avant Android 14, le réglage n'est pas affiché.
- Sur Android 14+, les permissions santé se demandent comme des permissions ordinaires (annotation `@Permission` de Capacitor). Le manifeste doit garder les quatre `android.permission.health.WRITE_*` **et** l'`activity-alias` `VIEW_PERMISSION_USAGE` / `HEALTH_PERMISSIONS`, sans lequel la permission ne peut pas être accordée.
- Chaque enregistrement porte un identifiant client (`t900d-<début>-<type>`) : renvoyer une séance la remplace au lieu de la dupliquer.
- L'envoi est une **file d'attente** : une séance réussie est marquée `hcSent` dans IndexedDB ; après chaque séance et 4 s après l'ouverture de l'appli, `healthSync()` renvoie toutes les séances non marquées des 14 derniers jours. Le dernier échec est gardé à part (`healthErr`) et affiché dans Réglages et dans le Journal.
- **Point ouvert** (voir « Travail en cours ») : l'envoi automatique en fin de séance a semblé échouer le 16/11 puis le 18/11. Le 16, le message d'erreur a été écrasé par un envoi manuel. Mesure prise depuis, sans preuve qu'elle visait la bonne cause : les points de FC situés exactement sur l'instant de fin sont écartés (`healthPayload` dans `src/recorder.js`).
- Samsung Health fusionne une séance T900D avec un autre enregistrement qui la chevauche (autre appli ou objet connecté) : elle apparaît alors sous « Course » avec un badge « +1 », et non sous « Tapis de course ».
- Pour un autre téléphone de la famille, tout est à refaire sur place : cocher la case dans T900D, vérifier dans Santé Connect les 4 autorisations d'écriture de T900D et la lecture de l'exercice par Samsung Health, puis « Envoyer tout l'historique ».
- Vérification locale possible de `HealthWriter.java` seul : `javac` contre `org.robolectric:android-all` (API 34) de Maven Central. Le reste ne se compile que sur GitHub Actions.
- Vérifié sur le téléphone de l'utilisateur : la permission est accordée et l'écriture réussit (4 éléments pour une séance avec FC). Samsung Health importe la séance comme « Tapis de course » avec durée, distance, calories, FC moyenne et maximale, et la courbe de FC (il calcule ses propres zones).

## Contraintes techniques à ne pas redécouvrir

- La **WebView Android n'a ni Web Bluetooth, ni synthèse vocale, ni Wake Lock, ni téléchargement de fichier**. D'où `native/index.js` ; `app.js` teste `native` avant chaque usage. La version web (GitHub Pages, Chrome) reste fonctionnelle avec les API du navigateur.
- Le conteneur de développement ne peut pas télécharger le SDK Android : **l'APK ne se construit que sur GitHub Actions**.
- Les séances réalisées portent un champ `user` hérité d'un essai de profils multiples (abandonné). `LEGACY_USER` dans `store.js` gère les données d'avant.
- Un changement de vitesse en cours de séance est écrasé à l'étape suivante : c'est voulu.

## Versions et publication

- `version.json` contient la version courante (`version`), les versions à reconstruire (`previous` : nom + commit) et les versions figées (`archived` : noms des fichiers déjà publiés à conserver).
- Chaque push sur la branche déclenche `.github/workflows/apk.yml`, qui construit la version courante **et reconstruit chaque version précédente depuis son commit**, puis publie `t900d-<version>.apk` dans la release `apk`. Toutes reçoivent le même `versionCode` (numéro de build) : Android refuse d'installer un numéro plus petit, et c'est ce qui permet de revenir à une ancienne version sans désinstaller.
- Depuis la v4, l'utilisateur veut que **seule la version courante soit reconstruite** : `previous` reste vide, et les anciennes versions sont dans `archived`. Leurs fichiers restent téléchargeables mais gardent leur ancien numéro de build : y revenir depuis une version plus récente impose de désinstaller. Les fichiers absents de `version.json` sont supprimés de la release : ne retire rien de `archived` sans qu'il le demande.
- La publication passe par `gh release upload`. Une action tierce (`softprops/action-gh-release`) échouait par intermittence sur la mise à jour du titre et bloquait l'envoi ; ne pas y revenir.
- La clé de signature `android/app/t900d.keystore` est **versionnée dans un dépôt public**, pour que chaque build soit signé à l'identique. L'utilisateur est informé du risque et n'a pas demandé à la déplacer. La changer imposerait une désinstallation sur chaque téléphone.
- `docs/**`, `README.md` et `CLAUDE.md` ne déclenchent pas de build.

### Créer une nouvelle version

1. Dans `version.json`, ajouter le nom de la version actuelle à `archived`, puis passer `version` à la suivante. (Pour pouvoir revenir à l'ancienne version sans désinstaller, la mettre plutôt dans `previous` avec son commit : elle sera alors reconstruite à chaque build.)
2. Développer, tester, pousser.
3. Vérifier le build avec les outils GitHub Actions, puis donner le lien `…/releases/latest/download/t900d-<version>.apk`.
4. Mettre à jour la notice si l'utilisateur la demande.

## Tester

- `npm test` : logique pure. À compléter pour toute nouvelle règle (parseur, moteur, plan, statistiques).
- Interface : servir le dossier (`python3 -m http.server`) et ouvrir `?demo=1` avec Playwright, en portrait (390 × 760) et en paysage (800 × 360). Vérifier qu'aucun écran de course ne déborde verticalement en paysage : le téléphone est posé sur le tapis.
- `dispatchEvent(new CustomEvent('demo-console', { detail: 'start' }))` simule le bouton Start de la console (`'stop'` pour Stop).
- Rien de ce qui touche au Bluetooth réel, à la voix native ou au stockage Android ne peut être testé ici. **Le dire explicitement** dans le compte rendu, et demander à l'utilisateur le contenu de Réglages → Journal Bluetooth en cas de souci.

## Notice d'utilisation

- Un PDF par version : `docs/notice-t900d-<version>.pdf`. Les anciennes notices ne sont pas modifiées.
- Source de la notice courante : `docs/notice/notice.html`. Captures : `node docs/notice/shots.cjs`. PDF : `node docs/notice/build.cjs v4`.
- `shots.cjs` tourne en mode démo avec un historique fictif. Les lignes de Réglages propres à l'APK (Health Connect, AAPS, sauvegarde) y sont affichées artificiellement, et la capture avec glycémie utilise `?aaps=1` : aucune donnée réelle de l'utilisateur n'entre dans la notice.
- La notice est publique (dépôt public) : y décrire la fonction AAPS de façon générale, sans rien dire de l'utilisateur.
- Pour une nouvelle version : refaire les captures, adapter le texte (numéro de version, noms des fichiers APK, renvois entre chapitres), régénérer, puis **relire le texte complet et contrôler la mise en page page par page**.
- Ton : tutoiement, phrases courtes, noms des boutons tels qu'affichés.

## Sécurité de l'utilisateur

L'appli commande un tapis sur lequel quelqu'un court.

- Ne jamais envoyer de vitesse hors des limites, ni de commande pendant que la séance est en pause.
- Après une reprise ou une reconnexion, ne renvoyer les consignes que si le tapis tourne déjà ; sinon rester en pause.
- Toute fonction qui change la vitesse d'elle-même (par exemple un pilotage par la fréquence cardiaque) doit avoir des variations lentes et bornées, et être annoncée comme non testée tant que l'utilisateur ne l'a pas essayée.
- Rappeler que si la liaison ou l'appli tombe, le tapis continue de tourner : seule la console l'arrête.

## Idées non réalisées

Pilotage de la vitesse par la zone cardiaque, estimation automatique de la VMA, export Strava ou Garmin (TCX/FIT), parcours GPX avec dénivelé réel, objectifs hebdomadaires, dérive cardiaque sur les footings, charge d'entraînement hebdomadaire, comparaison d'une même séance dans le temps.

Écartées par l'utilisateur : la synchronisation entre téléphones (demanderait un service en ligne), les profils multiples sur un même téléphone, l'enregistrement de la glycémie dans les séances.
