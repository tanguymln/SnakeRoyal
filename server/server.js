import WebSocket, { WebSocketServer } from "ws";
import { createServer } from "http";
import { randomUUID } from "crypto";

const port = 3001;
const server = createServer();
const wss = new WebSocketServer({ server });

const gridSize = 1.3;
const cols = Math.floor(160 / gridSize);
const rows = Math.floor(90 / gridSize);

const players = new Map();
const appleLifetime = 150;
let apples = Array.from({ length: 20 }, () => spawnApple());

const portals = [
  { entry: { x: 10, y: 10 }, exit: { x: 50, y: 50 } },
  { entry: { x: 30, y: 20 }, exit: { x: 70, y: 60 } },
];

function spawnApple() {
  return {
    x: Math.floor(Math.random() * cols),
    y: Math.floor(Math.random() * rows),
    ttl: appleLifetime,
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
    boostCooldown: 0,
  });
}

wss.on("connection", (ws) => {
  let id = randomUUID();
  let playerInitialized = false;

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

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

  ws.on("close", () => {
    players.delete(id);
  });
});

function gameLoop() {
  const alivePlayers = Array.from(players.values()).filter((p) => p.alive);

  for (const player of players.values()) {
    if (player.boostCooldown > 0) {
      player.boostCooldown--;
    }

    if (player.speedBoost) {
      player.boostTimer--;

      if (player.snake.length > 2) {
        player.snake.pop();
        player.snake.pop();
      }

      if (player.boostTimer <= 0) {
        player.speedBoost = false;
      }
    }
  }

  for (const player of alivePlayers) {
    const speed = player.speedBoost ? 2 : 1;

    for (let step = 0; step < speed; step++) {
      const { direction, snake } = player;
      let head = {
        x: (snake[0].x + direction.x + cols) % cols,
        y: (snake[0].y + direction.y + rows) % rows,
      };

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

      if (snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
        player.alive = false;
        break;
      }

      let collided = false;
      for (const other of alivePlayers) {
        if (other.id === player.id) continue;

        const idx = other.snake.findIndex(
          (seg) => seg.x === head.x && seg.y === head.y
        );

        if (idx !== -1) {
          if (player.speedBoost) {
            const headPart = other.snake.slice(0, idx);
            const cutPart = other.snake.slice(idx);

            if (headPart.length > 0) {
              other.snake = headPart;
            } else {
              other.alive = false;
              other.snake = [];
            }

            for (const seg of cutPart) {
              apples.push({ x: seg.x, y: seg.y, ttl: appleLifetime });
            }

            collided = false;
            break;
          } else {
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
      } else if (!player.speedBoost) {
        snake.pop();
      }
    }
  }

  apples.forEach((apple) => apple.ttl--);
  apples = apples.filter((a) => a.ttl > 0);

  while (apples.length < 20) {
    apples.push(spawnApple());
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

  for (const player of players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(payload);
    }
  }
}

setInterval(gameLoop, 1000 / 15);

server.listen(port, () => {
  console.log(`✅ Server running on ws://localhost:${port}`);
});
