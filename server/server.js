import { WebSocketServer } from "ws";
import { createServer } from "http";
import { randomUUID } from "crypto";

const port = 3001;
const server = createServer();
const wss = new WebSocketServer({ host: "10.71.133.133", server });

const gridSize = 1.3;
const cols = Math.floor(160 / gridSize);
const rows = Math.floor(90 / gridSize);

const players = new Map();
let apples = Array.from({ length: 500 }, () => spawnApple());

function spawnApple() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
  };
}

function spawnPlayer(id, ws) {
  const x = Math.floor(Math.random() * cols);
  const y = Math.floor(Math.random() * rows);
  players.set(id, {
    id,
    ws,
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
  const id = randomUUID();
  spawnPlayer(id, ws);
  ws.send(JSON.stringify({ type: "init", id }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const player = players.get(id);
      if (!player) return;

      if (msg.type === "direction") {
        player.direction = msg.direction;
      }

      if (msg.type === "restart") {
        spawnPlayer(id, ws);
      }

      if (msg.type === "boost") {
        // Active le boost seulement si le joueur est vivant et pas déjà boosté
        if (player.alive && !player.speedBoost) {
          player.speedBoost = true;
          player.boostTimer = 20; // dure environ 20 ticks (~1.3 sec)
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

  for (const player of players.values()) {
    // Gestion boost speed
    if (player.speedBoost) {
      player.boostTimer--;
      if (player.boostTimer <= 0) {
        player.speedBoost = false;
      }
    }
  }

  for (const player of alivePlayers) {
    const speed = player.speedBoost ? 2 : 1; // x2 vitesse boost

    for (let step = 0; step < speed; step++) {
      const { direction, snake } = player;
      const head = {
        x: (snake[0].x + direction.x + cols) % cols,
        y: (snake[0].y + direction.y + rows) % rows,
      };

      // Collision avec soi-même
      if (
        snake.some((segment) => segment.x === head.x && segment.y === head.y)
      ) {
        player.alive = false;
        break;
      }

      // Collision avec un autre joueur
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

      snake.unshift(head);

      // Collision avec pomme
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
        snake.pop();
      }
    }
  }

  // Supprime les serpents morts (pour ne plus afficher)
  for (const player of players.values()) {
    if (!player.alive) {
      player.snake = [];
    }
  }

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
