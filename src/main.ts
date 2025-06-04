const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const worldCols = 160 / 1.3;
const worldRows = 90 / 1.3;

let gridSize = 60;
let offsetX = 0;
let offsetY = 0;

let playerId = "";
let snakes: Record<string, { x: number; y: number }[]> = {};
let apples: { x: number; y: number }[] = [];
let aliveMap: Record<string, boolean> = {};
let scoreMap: Record<string, number> = {};

let direction = { x: 1, y: 0 };
let lastDirection = { x: 1, y: 0 };
let gameOver = false;

const colorMap: Record<string, string> = {};

function getColor(id: string): string {
  if (!colorMap[id]) {
    colorMap[id] = id === playerId ? "#00ff00" : getRandomColor();
  }
  return colorMap[id];
}

function getRandomColor(): string {
  return (
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const cellW = canvas.width / worldCols;
  const cellH = canvas.height / worldRows;
  gridSize = Math.floor(Math.min(cellW, cellH));
  offsetX = (canvas.width - worldCols * gridSize) / 2;
  offsetY = (canvas.height - worldRows * gridSize) / 2;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const ws = new WebSocket("ws://10.71.133.133:3001");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "init") {
    playerId = data.id;
  }

  if (data.type === "state") {
    snakes = data.snakes;
    apples = data.apples;
    aliveMap = data.alive;
    scoreMap = data.scores;
    gameOver = !aliveMap[playerId];
  }
};

document.addEventListener("keydown", (e) => {
  if (gameOver && e.key === "Enter") {
    ws.send(JSON.stringify({ type: "restart" }));
    gameOver = false;
    return;
  }

  if (!gameOver) {
    if (e.key === " ") {
      ws.send(JSON.stringify({ type: "boost" }));
      e.preventDefault();
      return;
    }

    let newDir = direction;

    switch (e.key) {
      case "ArrowUp":
        if (lastDirection.y !== 1) newDir = { x: 0, y: -1 };
        break;
      case "ArrowDown":
        if (lastDirection.y !== -1) newDir = { x: 0, y: 1 };
        break;
      case "ArrowLeft":
        if (lastDirection.x !== 1) newDir = { x: -1, y: 0 };
        break;
      case "ArrowRight":
        if (lastDirection.x !== -1) newDir = { x: 1, y: 0 };
        break;
    }

    const me = snakes[playerId];
    if (me && me.length === 1) {
      switch (e.key) {
        case "ArrowUp":
          newDir = { x: 0, y: -1 };
          break;
        case "ArrowDown":
          newDir = { x: 0, y: 1 };
          break;
        case "ArrowLeft":
          newDir = { x: -1, y: 0 };
          break;
        case "ArrowRight":
          newDir = { x: 1, y: 0 };
          break;
      }
    }

    if (newDir.x !== direction.x || newDir.y !== direction.y) {
      direction = newDir;
      lastDirection = newDir;
      ws.send(JSON.stringify({ type: "direction", direction }));
    }
  }
});

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "red";
  for (const apple of apples) {
    ctx.fillRect(
      offsetX + apple.x * gridSize,
      offsetY + apple.y * gridSize,
      gridSize,
      gridSize
    );
  }

  for (const [id, snake] of Object.entries(snakes)) {
    if (!aliveMap[id]) continue; // ne dessine pas les serpents morts

    ctx.fillStyle = getColor(id);
    for (const segment of snake) {
      ctx.fillRect(
        offsetX + segment.x * gridSize,
        offsetY + segment.y * gridSize,
        gridSize,
        gridSize
      );
    }

    if (id === playerId && snake.length >= 2) {
      const [head, neck] = snake;
      lastDirection = { x: head.x - neck.x, y: head.y - neck.y };
    }
  }

  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 30);
    ctx.font = "32px Arial";
    ctx.fillText(
      `Score: ${scoreMap[playerId] || 0}`,
      canvas.width / 2,
      canvas.height / 2 + 10
    );
    ctx.font = "24px Arial";
    ctx.fillText(
      "Appuie sur Entrée pour recommencer",
      canvas.width / 2,
      canvas.height / 2 + 50
    );
  }
}

function gameLoop() {
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
