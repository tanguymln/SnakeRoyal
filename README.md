# 🐍 Snake Royale

**Snake Royale** est un jeu multijoueur en ligne en temps réel inspiré du jeu Snake, avec des mécaniques avancées comme le boost de vitesse, les portails de téléportation, un système de leaderboard et de la compétition entre serpents. Ce jeu repose sur une architecture client/serveur WebSocket écrite en TypeScript/JavaScript.

---

## 🚀 Stack Technique

| Composant     | Technologie                            |
| ------------- | -------------------------------------- |
| Client        | TypeScript, HTML5 Canvas               |
| Serveur       | Node.js, `ws` (WebSocket), `http`      |
| Communication | WebSocket (temps réel, bidirectionnel) |
| Hébergement   | Serveur WebSocket hébergé              |

---

## 📦 Structure des fichiers

```
/public
  └── index.html      → Interface du jeu
/src
  └── main.ts         → Code du jeu côté client
/server
  └── server.js       → Logique du jeu, moteur temps réel WebSocket
```

---

## ⚙️ Fonctionnement global

Le client se connecte à un serveur WebSocket. Chaque joueur contrôle un serpent dans une grille partagée avec d'autres. Le serveur centralise l'état du monde (position des serpents, pommes, portails...) et émet une mise à jour toutes les `~66ms` (15 FPS).

Le gameplay comprend :

- Une carte composée de cellules (grille 2D),
- Des serpents multijoueurs avec détection de collision,
- Un système de boost temporaire,
- Des portails de téléportation,
- Une durée de vie limitée des pommes.

---

## 🌐 Serveur WebSocket

Le fichier `server.js` est le moteur du jeu. Il utilise un `WebSocketServer` (via le module `ws`) pour maintenir une connexion persistante avec chaque client.

### 📡 Initialisation du serveur

```js
const port = 3001;
const server = createServer();
const wss = new WebSocketServer({ server });
```

Ici on instancie un serveur HTTP minimal, auquel on attache un serveur WebSocket. Tous les clients WebSocket partageront ce canal de communication centralisé.

### 📏 Paramètres du monde

```js
const gridSize = 1.3;
const cols = Math.floor(160 / gridSize);
const rows = Math.floor(90 / gridSize);
```

Cela définit une **grille 2D virtuelle** sur laquelle les serpents vont évoluer. Chaque cellule de la grille représente une unité de déplacement pour les entités (serpents, pommes...).

### 👤 Gestion des joueurs

Chaque joueur est représenté par une `Map` contenant son état :

```js
{
  id, ws, pseudo,
  direction: { x, y },
  snake: [{ x, y }],
  alive: true,
  score: 0,
  ...
}
```

### 🍏 Spawning de pommes

Les pommes ont une durée de vie limitée (`ttl`) :

```js
function spawnApple() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
    ttl: appleLifetime,
  };
}
```

Les pommes apparaissent aléatoirement et disparaissent si elles ne sont pas mangées après `ttl` ticks.

### 🌀 Portails

Des paires de coordonnées permettent aux serpents de se téléporter :

```js
const portals = [
  { entry: { x: 10, y: 10 }, exit: { x: 50, y: 50 } },
  ...
];
```

Dans la boucle du jeu, un check est effectué pour savoir si un serpent entre dans un portail :

```js
if (head.x === portal.entry.x && head.y === portal.entry.y) {
  head = { x: portal.exit.x, y: portal.exit.y };
}
```

---

### 🔄 Boucle de jeu (`gameLoop()`)

Le cœur du serveur est une boucle exécutée toutes les `1/15s` :

```js
setInterval(gameLoop, 1000 / 15);
```

Chaque tick effectue :

1. Mise à jour des boosts (vitesse, cooldowns)
2. Mouvement des serpents
3. Vérification des collisions (self, autres serpents, murs)
4. Collecte de pommes
5. Téléportation via portails
6. Réinitialisation si le joueur est mort
7. Génération de l’état complet du jeu (`payload`)
8. Diffusion de cet état à **tous** les clients connectés.

### ⚔️ Collision et combat

Un joueur meurt s’il :

- Se mord lui-même (`snake.some(...)`)
- Touche un autre serpent (sauf en boost, auquel cas il "mord" l’autre)

```js
if (idx !== -1) {
  if (player.speedBoost) {
    // coupe le serpent adverse
  } else {
    // meurt
  }
}
```

---

## 🧠 Client TypeScript (Canvas)

Le fichier `main.ts` gère le rendu et les entrées clavier côté navigateur.

### 🎮 Entrée joueur (contrôle du serpent)

Les flèches modifient la direction, envoyée ensuite via WebSocket :

```ts
document.addEventListener("keydown", (e) => {
  ...
  ws.send(JSON.stringify({ type: "direction", direction }));
});
```

Le boost est déclenché avec la barre d’espace :

```ts
if (e.key === " ") {
  ws.send(JSON.stringify({ type: "boost" }));
}
```

### 📺 Rendu HTML5 Canvas

Le jeu est affiché sur un `<canvas>` en 2D. Le client interprète les positions envoyées par le serveur :

```ts
ctx.fillRect(x, y, gridSize, gridSize);
```

Pour chaque serpent :

- Il est dessiné avec une couleur unique (`getColor`)
- Si boost activé → effet d’aura dynamique (`ctx.shadowBlur`)
- Le pseudo est affiché au-dessus de la tête
- Le joueur mort voit un écran "Game Over"

### 🏆 Leaderboard

Un classement est affiché en haut à droite :

```ts
leaderboard.forEach((entry, i) => {
  const text = `${i + 1}. ${entry.pseudo} — ${entry.score}`;
  ctx.fillText(text, x + 100, yPos + 25);
});
```

---

## ⚡ Boost mécanique

Un boost est possible si le serpent a au moins 5 segments :

```js
if (player.snake.length >= 5 && player.boostCooldown <= 0) {
  player.speedBoost = true;
  player.boostTimer = 20; // durée boost
  player.boostCooldown = 75; // cooldown
}
```

Pendant un boost :

- Le serpent avance deux fois plus vite
- Il perd deux segments à chaque tick (compensation)
- Il peut couper d'autres serpents (agressif)

---

## 📊 Payload envoyé par le serveur

Voici un exemple du **state** envoyé à chaque client :

```json
{
  "type": "state",
  "snakes": { "id1": [...], "id2": [...] },
  "apples": [{ "x": 1, "y": 2 }, ...],
  "alive": { "id1": true, "id2": false },
  "scores": { "id1": 5, "id2": 2 },
  "boosts": { "id1": true },
  "boostCooldowns": { "id1": 20 },
  "pseudos": { "id1": "Tanguy", "id2": "Player2" },
  "portals": [...],
  "leaderboard": [...]
}
```

Ce format permet au client de **tout reconstituer visuellement** à chaque frame.

---

## 📥 Lancer le jeu en local

### 1. Lancer le serveur WebSocket

```bash
cd server
node server.js
```

### 2. Lancer un serveur web local via Vite (client)

```bash
npm run dev
```

Puis accéder à : `http://localhost:3000`

> Assure-toi que le WebSocket est sur `ws://localhost:3001` si tu développes localement.

---

## 📚 À améliorer

- Persistance des scores
- Spectateur (view-only)
- Matchmaking par room
- Design mobile

---

## 📝 License

Ce projet est sous la licence MIT.
