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
let apples = Array.from({ length: 300 }, () => spawnApple());

// 1. Définition des portails (paires d'entrée/sortie)
const portals = [
  { entry: { x: 10, y: 10 }, exit: { x: 50, y: 50 } },
  { entry: { x: 30, y: 20 }, exit: { x: 70, y: 60 } },
  // Ajoutez autant de portails que vous le souhaitez
];

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
        // Limitation : boost uniquement si taille >= 5 et pas déjà en boost
        if (player.alive && !player.speedBoost && player.snake.length >= 5) {
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

  // Mise à jour du boost et consommation de taille en boost
  for (const player of players.values()) {
    if (player.speedBoost) {
      player.boostTimer--;

      // Retirer 2 segments par tick de boost si possible
      if (player.snake.length > 2) {
        player.snake.pop();
        player.snake.pop();
      }

      if (player.boostTimer <= 0) {
        player.speedBoost = false;
      }
    }
  }

  // Boucle de mise à jour des serpents
  for (const player of alivePlayers) {
    const speed = player.speedBoost ? 2 : 1; // double vitesse en boost

    for (let step = 0; step < speed; step++) {
      const { direction, snake } = player;
      let head = {
        x: (snake[0].x + direction.x + cols) % cols,
        y: (snake[0].y + direction.y + rows) % rows,
      };

      // Gestion des portails
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

      // Collision avec soi-même
      if (
        snake.some((segment) => segment.x === head.x && segment.y === head.y)
      ) {
        player.alive = false;
        break;
      }

      // Collision avec un autre serpent
      let collided = false;
      for (const other of alivePlayers) {
        if (other.id === player.id) continue;

        const idx = other.snake.findIndex(
          (seg) => seg.x === head.x && seg.y === head.y
        );

        if (idx !== -1) {
          if (player.speedBoost) {
            // En boost : traverser + couper l'autre serpent
            // Partie avant la collision reste
            const headPart = other.snake.slice(0, idx);
            // Partie coupée (après la collision) devient des pommes
            const cutPart = other.snake.slice(idx);

            // Remplace le serpent coupé par la partie avant
            if (headPart.length > 0) {
              other.snake = headPart;
            } else {
              // Si tout coupé, mort
              other.alive = false;
              other.snake = [];
            }

            // Transformer la partie coupée en pommes
            for (const segment of cutPart) {
              apples.push({ x: segment.x, y: segment.y });
            }

            // Le joueur boosté continue (ne meurt pas)
            collided = false; // ne tue pas le joueur boosté
            break;
          } else {
            // Pas en boost : mort classique
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

      const appleIndex = apples.findIndex(
        (a) => a.x === head.x && a.y === head.y
      );
      if (appleIndex !== -1) {
        apples.splice(appleIndex, 1);
        apples.push(spawnApple());
        player.pendingGrowth += 3;
      }

      if (player.pendingGrowth > 0) {
        player.pendingGrowth--;
      } else {
        // Ne pas retirer le dernier segment si en boost (déjà géré)
        if (!player.speedBoost) {
          snake.pop();
        }
      }
    }
  }

  for (const player of players.values()) {
    if (!player.alive) {
      player.snake = [];
    }
  }

  const leaderboard = Array.from(players.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((p) => ({ pseudo: p.pseudo, score: p.score }));

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
    portals,
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
