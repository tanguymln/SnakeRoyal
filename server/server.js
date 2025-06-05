import WebSocket, { WebSocketServer } from "ws";
import { createServer } from "http";
import { randomUUID } from "crypto";

/** @const {number} port - Le port sur lequel tourne le serveur */
const port = 3001;

/** @const {http.Server} server - Serveur HTTP de base */
const server = createServer();

/** @const {WebSocketServer} wss - Serveur WebSocket écoutant sur le serveur HTTP */
const wss = new WebSocketServer({ server });

/** @const {number} gridSize - Taille d'une case sur la grille */
const gridSize = 1.3;

/** @const {number} cols - Nombre de colonnes calculées selon la largeur totale (160) */
const cols = Math.floor(160 / gridSize);

/** @const {number} rows - Nombre de lignes calculées selon la hauteur totale (90) */
const rows = Math.floor(90 / gridSize);

/** @type {Map<string, Player>} players - Liste des joueurs connectés (id → player) */
const players = new Map();

/** @const {number} appleLifetime - Temps de vie d'une pomme avant disparition automatique */
const appleLifetime = 150;

/** @type {Array<Apple>} apples - Tableau contenant les pommes actives */
let apples = Array.from({ length: 20 }, () => spawnApple());

/** @type {Array<{entry: Coord, exit: Coord}>} portals - Liste de portails (entrée → sortie) */
const portals = [
  { entry: { x: 10, y: 10 }, exit: { x: 50, y: 50 } },
  { entry: { x: 30, y: 20 }, exit: { x: 70, y: 60 } },
];

/**
 * Génère une nouvelle pomme avec une position aléatoire et une durée de vie par défaut.
 * @returns {Apple} - Une nouvelle pomme avec position (x, y) et durée de vie (ttl)
 */
function spawnApple() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
    ttl: appleLifetime,
  };
}

/**
 * Initialise un nouveau joueur dans la partie.
 * @param {string} id - ID unique du joueur
 * @param {WebSocket} ws - Connexion WebSocket du joueur
 * @param {string} pseudo - Pseudo du joueur
 */
function spawnPlayer(id, ws, pseudo) {
  const x = Math.floor(Math.random() * cols);
  const y = Math.floor(Math.random() * rows);
  players.set(id, {
    id,
    ws,
    pseudo: pseudo || `Player${id.slice(0, 4)}`,
    direction: { x: 1, y: 0 }, // Direction initiale
    snake: [{ x, y }], // Position initiale du serpent
    alive: true,
    score: 0,
    pendingGrowth: 0,
    speedBoost: false,
    boostTimer: 0,
    boostCooldown: 0,
  });
}

/**
 * Événement déclenché lorsqu'un client WebSocket se connecte.
 * Initialise un nouvel identifiant et gère les messages entrants du client.
 */
wss.on("connection", (ws) => {
  /** @type {string} id - Identifiant unique du joueur */
  let id = randomUUID();

  /** @type {boolean} playerInitialized - Indique si le joueur a été initialisé via 'init' */
  let playerInitialized = false;

  /**
   * Événement de réception d'un message WebSocket.
   * Gère l'initialisation, la direction, le redémarrage, et l'activation de boost.
   */
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Initialisation du joueur
      if (!playerInitialized && msg.type === "init") {
        spawnPlayer(id, ws, msg.pseudo);
        ws.send(JSON.stringify({ type: "init_ack", id, pseudo: msg.pseudo }));
        playerInitialized = true;
        return;
      }

      const player = players.get(id);
      if (!player) return;

      // Changement de direction
      if (msg.type === "direction") {
        player.direction = msg.direction;
      }

      // Redémarrage du jeu
      if (msg.type === "restart") {
        spawnPlayer(id, ws, player.pseudo);
      }

      // Activation du boost
      if (msg.type === "boost") {
        if (
          player.alive &&
          !player.speedBoost &&
          player.snake.length >= 5 &&
          player.boostCooldown <= 0
        ) {
          player.speedBoost = true;
          player.boostTimer = 20;
          player.boostCooldown = 75;
        }
      }
    } catch (e) {
      console.error("Invalid message", e);
    }
  });

  /**
   * Événement déclenché lorsque le client se déconnecte.
   * Supprime le joueur de la map.
   */
  ws.on("close", () => {
    players.delete(id);
  });
});

/**
 * Boucle principale du jeu exécutée à un taux fixe (~15 FPS).
 * Met à jour les états des joueurs, des serpents, des pommes et envoie l'état global à tous les clients.
 */
function gameLoop() {
  /** @type {Array<Player>} alivePlayers - Liste des joueurs encore en vie */
  const alivePlayers = Array.from(players.values()).filter((p) => p.alive);

  // Gestion des timers de boost
  for (const player of players.values()) {
    if (player.boostCooldown > 0) player.boostCooldown--;
    if (player.speedBoost) {
      player.boostTimer--;

      // Réduction de la taille du serpent sous boost
      if (player.snake.length > 2) {
        player.snake.pop();
        player.snake.pop();
      }

      if (player.boostTimer <= 0) {
        player.speedBoost = false;
      }
    }
  }

  // Mouvements des serpents
  for (const player of alivePlayers) {
    const speed = player.speedBoost ? 2 : 1;

    for (let step = 0; step < speed; step++) {
      const { direction, snake } = player;

      /** @type {Coord} head - Nouvelle tête du serpent */
      let head = {
        x: (snake[0].x + direction.x + cols) % cols,
        y: (snake[0].y + direction.y + rows) % rows,
      };

      // Téléportation via portails
      for (const portal of portals) {
        if (head.x === portal.entry.x && head.y === portal.entry.y) {
          head = { x: portal.exit.x, y: portal.exit.y };
          break;
        }
        if (head.x === portal.exit.x && head.y === portal.exit.y) {
          head = { x: portal.entry.x, y: portal.entry.y };
          break;
        }
      }

      // Auto-collision
      if (snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
        player.alive = false;
        break;
      }

      /** @type {boolean} collided - Collision avec un autre joueur */
      let collided = false;

      for (const other of alivePlayers) {
        if (other.id === player.id) continue;

        const idx = other.snake.findIndex(
          (seg) => seg.x === head.x && seg.y === head.y
        );

        if (idx !== -1) {
          if (player.speedBoost) {
            // Le joueur coupe le serpent adverse
            const headPart = other.snake.slice(0, idx);
            const cutPart = other.snake.slice(idx);

            if (headPart.length > 0) {
              other.snake = headPart;
            } else {
              other.alive = false;
              other.snake = [];
            }

            // Transforme les segments coupés en pommes
            for (const seg of cutPart) {
              apples.push({ x: seg.x, y: seg.y, ttl: appleLifetime });
            }

            collided = false;
            break;
          } else {
            // Collision perdante
            player.alive = false;
            other.score += 1;
            other.pendingGrowth += player.snake.length;
            collided = true;
            break;
          }
        }
      }

      if (collided || !player.alive) break;

      snake.unshift(head);

      // Vérifie si la tête touche une pomme
      const appleIndex = apples.findIndex(
        (a) => a.x === head.x && a.y === head.y
      );

      if (appleIndex !== -1) {
        apples.splice(appleIndex, 1);
        apples.push(spawnApple());
        player.pendingGrowth += 3;
      }

      // Gestion de la croissance
      if (player.pendingGrowth > 0) {
        player.pendingGrowth--;
      } else if (!player.speedBoost) {
        snake.pop();
      }
    }
  }

  // Décrémente la durée de vie des pommes
  apples.forEach((apple) => apple.ttl--);
  apples = apples.filter((a) => a.ttl > 0);

  // Génère de nouvelles pommes si nécessaire
  while (apples.length < 20) {
    apples.push(spawnApple());
  }

  // Nettoie les serpents morts
  for (const player of players.values()) {
    if (!player.alive) {
      player.snake = [];
    }
  }

  // Calcule le leaderboard
  const leaderboard = Array.from(players.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p) => ({ pseudo: p.pseudo, score: p.score }));

  /** @type {Object} payload - Données de jeu envoyées à tous les clients */
  const payload = JSON.stringify({
    type: "state",
    snakes: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.snake])
    ),
    apples: apples.map(({ x, y }) => ({ x, y })),
    alive: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.alive])
    ),
    scores: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.score])
    ),
    boosts: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.speedBoost])
    ),
    boostCooldowns: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.boostCooldown])
    ),
    pseudos: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.pseudo])
    ),
    portals,
    leaderboard,
  });

  // Envoie l'état à tous les joueurs connectés
  for (const player of players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(payload);
    }
  }
}

// Démarre la boucle du jeu à une fréquence de 15 FPS
setInterval(gameLoop, 1000 / 15);

// Démarre le serveur HTTP + WebSocket
server.listen(port, () => {
  console.log(`✅ Server running on ws://localhost:${port}`);
});
