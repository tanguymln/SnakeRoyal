import { WebSocketServer } from "ws";
import { createServer } from "http";
import { randomUUID } from "crypto";

const port = 3001;
const server = createServer();
const wss = new WebSocketServer({
  server,
});

const gridSize = 1.3;
const cols = Math.floor(160 / gridSize);
const rows = Math.floor(90 / gridSize);

const players = new Map();
let apples = Array.from({ length: 500 }, () => spawnApple());

// 1. Définition des portails (paires d'entrée/sortie)
const portals = [
  { entry: { x: 10, y: 10 }, exit: { x: 50, y: 50 } },
  { entry: { x: 30, y: 20 }, exit: { x: 70, y: 60 } },
  // Ajoutez autant de portails que vous le souhaitez
];
s
function spawnApple() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
  };
}

function spawnPlayer(id, ws, pseudo) {
  const x = Math.floor(Math.random() * cols);
  const y = Math.floor(Math.random() * rows);
  players.set(id, {
    id,
    ws,
    pseudo: pseudo || `Player${id.slice(0, 4)}`,
    direction: { x: 1, y: 0 },
    snake: [{ x, y }],
    alive: true,
    score: 0,
    pendingGrowth: 0,
    speedBoost: false,
    boostTimer: 0,
  });
}

wss.on("connection", (ws) => {
  let id = randomUUID();
  let playerInitialized = false;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Premier message : initialisation avec le pseudo
      if (!playerInitialized && msg.type === "init") {
        spawnPlayer(id, ws, msg.pseudo);
        ws.send(JSON.stringify({ type: "init_ack", id, pseudo: msg.pseudo }));
        playerInitialized = true;
        return;
      }

      const player = players.get(id);
      if (!player) return;

      if (msg.type === "direction") {
        player.direction = msg.direction;
      }

      if (msg.type === "restart") {
        spawnPlayer(id, ws, player.pseudo);
      }

      if (msg.type === "boost") {
        if (player.alive && !player.speedBoost) {
          player.speedBoost = true;
          player.boostTimer = 20; // boost dure 20 ticks (~1.3s)
        }
      }
    } catch (e) {
      console.error("Invalid message", e);
    }
  });

  ws.on("close", () => {
    players.delete(id);
  });
});

function gameLoop() {
  const alivePlayers = Array.from(players.values()).filter((p) => p.alive);

  // 2. Mise à jour du boost pour chaque joueur
  for (const player of players.values()) {
    if (player.speedBoost) {
      player.boostTimer--;
      if (player.boostTimer <= 0) {
        player.speedBoost = false;
      }
    }
  }

  // 3. Boucle de mise à jour des serpents
  for (const player of alivePlayers) {
    const speed = player.speedBoost ? 2 : 1; // double vitesse en boost

    for (let step = 0; step < speed; step++) {
      const { direction, snake } = player;
      // Calculer la nouvelle tête
      let head = {
        x: (snake[0].x + direction.x + cols) % cols,
        y: (snake[0].y + direction.y + rows) % rows,
      };

      // 3.1. Vérifier si la tête entre dans un portail
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

      // 3.2. Collision avec soi-même
      if (
        snake.some((segment) => segment.x === head.x && segment.y === head.y)
      ) {
        player.alive = false;
        break;
      }

      // 3.3. Collision avec un autre serpent
      for (const other of alivePlayers) {
        if (other.id === player.id) continue;
        if (other.snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
          player.alive = false;
          other.score += 1;
          other.pendingGrowth += player.snake.length;
          break;
        }
      }

      if (!player.alive) break;

      // 3.4. Ajouter la nouvelle tête
      snake.unshift(head);

      // 3.5. Manger une pomme
      const appleIndex = apples.findIndex(
        (a) => a.x === head.x && a.y === head.y
      );
      if (appleIndex !== -1) {
        apples.splice(appleIndex, 1);
        apples.push(spawnApple());
        player.pendingGrowth += 3;
      }

      // 3.6. Gestion de la croissance
      if (player.pendingGrowth > 0) {
        player.pendingGrowth--;
      } else {
        snake.pop();
      }
    }
  }

  // 4. Faire disparaître physiquement les serpents morts (snake = [])
  for (const player of players.values()) {
    if (!player.alive) {
      player.snake = [];
    }
  }

  // 5. Calcul du leaderboard (top 10 par score)
  const leaderboard = Array.from(players.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p) => ({ pseudo: p.pseudo, score: p.score }));

  // 6. Préparer le payload à envoyer
  const payload = JSON.stringify({
    type: "state",
    snakes: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.snake])
    ),
    apples,
    alive: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.alive])
    ),
    scores: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.score])
    ),
    boosts: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.speedBoost])
    ),
    pseudos: Object.fromEntries(
      Array.from(players.entries()).map(([id, p]) => [id, p.pseudo])
    ),
    portals, // <-- envoi des portails au client
    leaderboard,
  });

  for (const player of players.values()) {
    if (player.ws.readyState === player.ws.OPEN) {
      player.ws.send(payload);
    }
  }
}

setInterval(gameLoop, 1000 / 15);

server.listen(port, () => {
  console.log(`✅ Server running on ws://localhost:${port}`);
});
