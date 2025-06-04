const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const startScreen = document.getElementById("startScreen") as HTMLDivElement;
const startButton = document.getElementById("startButton") as HTMLButtonElement;
const pseudoInput = document.getElementById("pseudoInput") as HTMLInputElement;

const worldCols = 160 / 1.3;
const worldRows = 90 / 1.3;

let gridSize = 60;
let offsetX = 0;
let offsetY = 0;

let playerId = "";
let playerPseudo = "";

let snakes: Record<string, { x: number; y: number }[]> = {};
let apples: { x: number; y: number }[] = [];
let aliveMap: Record<string, boolean> = {};
let scoreMap: Record<string, number> = {};
let boostMap: Record<string, boolean> = {};
let pseudoMap: Record<string, string> = {};
let portals: {
  entry: { x: number; y: number };
  exit: { x: number; y: number };
}[] = [];
let leaderboard: { pseudo: string; score: number }[] = [];

let direction = { x: 1, y: 0 };
let lastDirection = { x: 1, y: 0 };
let gameOver = false;

let ws: WebSocket | null = null;

const colorMap: Record<string, string> = {};

// Pour animation pulsation pommes & portails
let frameCount = 0;

// Particules quand on mange une pomme
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
};
const particles: Particle[] = [];

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

// Ecran de lancement
startButton.onclick = () => {
  const pseudo = pseudoInput.value.trim() || "Joueur";
  playerPseudo = pseudo;
  startGame(pseudo);
  startScreen.style.display = "none";
  canvas.style.display = "block";
};

function startGame(pseudo: string) {
  ws = new WebSocket("wss://ws.snake.createdbytanguy.fr");
  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: "init", pseudo }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "init_ack") {
      playerId = data.id;
      playerPseudo = data.pseudo;
    }

    if (data.type === "state") {
      // Avant update serpents, on détecte les pommes mangées
      // pour déclencher les particules
      if (apples.length > 0 && data.apples.length < apples.length) {
        // On a perdu une pomme, crée des particules à cet endroit
        // Chercher la pomme manquante
        const missingApple = apples.find(
          (a) =>
            !data.apples.some(
              (newA: { x: number; y: number }) =>
                newA.x === a.x && newA.y === a.y
            )
        );
        if (missingApple) {
          createParticles(missingApple.x, missingApple.y);
        }
      }

      snakes = data.snakes;
      apples = data.apples;
      aliveMap = data.alive;
      scoreMap = data.scores;
      boostMap = data.boosts;
      pseudoMap = data.pseudos;
      portals = data.portals;
      leaderboard = data.leaderboard;

      gameOver = !aliveMap[playerId];
    }
  };

  ws.onclose = () => {
    gameOver = true;
  };
}

document.addEventListener("keydown", (e) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

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

// Fonction création particules sur pomme mangée
function createParticles(gridX: number, gridY: number) {
  const baseX = offsetX + (gridX + 0.5) * gridSize;
  const baseY = offsetY + (gridY + 0.5) * gridSize;
  for (let i = 0; i < 15; i++) {
    particles.push({
      x: baseX,
      y: baseY,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      alpha: 1,
      size: Math.random() * 3 + 2,
      color: "rgba(255, 0, 0, 1)",
    });
  }
}

// Nettoyer les particules périmées et les dessiner
function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.03;
    p.size *= 0.95;

    if (p.alpha <= 0 || p.size <= 0.1) {
      particles.splice(i, 1);
      continue;
    }

    ctx.fillStyle = `rgba(255,0,0,${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// Dessin leaderboard
function drawLeaderboard() {
  if (leaderboard.length === 0) return;

  const padding = 20;
  const lineHeight = 24;
  const headerHeight = 30;
  const boxWidth = 240;

  const totalHeight = headerHeight + leaderboard.length * lineHeight;

  const x = canvas.width - boxWidth - padding;
  const y = padding;

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, totalHeight + 20, 10);
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.font = "bold 16px Arial";
  ctx.fillText("🏆 Leaderboard", x + 100, y + 30);

  ctx.font = "14px Arial";
  leaderboard.forEach((entry, i) => {
    const yPos = y + headerHeight + i * lineHeight;
    const text = `${i + 1}. ${entry.pseudo.substring(0, 25)} — ${entry.score}`;
    ctx.fillText(text, x + 100, yPos + 20);
  });
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Pommes avec animation pulsation (scale sinusoïdal)
  const pulse = 1 + 0.15 * Math.sin(frameCount * 0.15);
  ctx.fillStyle = "red";
  for (const apple of apples) {
    ctx.save();
    ctx.translate(
      offsetX + (apple.x + 0.5) * gridSize,
      offsetY + (apple.y + 0.5) * gridSize
    );
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.arc(0, 0, gridSize / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // 2. Portails avec pulsation bleu plus lente et légère rotation
  const portalPulse = 1 + 0.1 * Math.sin(frameCount * 0.07);
  for (const portal of portals) {
    // Entrée
    ctx.save();
    ctx.translate(
      offsetX + (portal.entry.x + 0.5) * gridSize,
      offsetY + (portal.entry.y + 0.5) * gridSize
    );
    ctx.rotate(frameCount * 0.02);
    ctx.scale(portalPulse, portalPulse);
    ctx.fillStyle = "blue";
    ctx.beginPath();
    ctx.arc(0, 0, gridSize / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();

    // Sortie
    ctx.save();
    ctx.translate(
      offsetX + (portal.exit.x + 0.5) * gridSize,
      offsetY + (portal.exit.y + 0.5) * gridSize
    );
    ctx.rotate(-frameCount * 0.02);
    ctx.scale(portalPulse, portalPulse);
    ctx.fillStyle = "blue";
    ctx.beginPath();
    ctx.arc(0, 0, gridSize / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // 3. Serpents avec boost animation aura + tête légèrement animée
  for (const id in snakes) {
    const snake = snakes[id];
    const isBoosted = boostMap[id];
    const baseColor = getColor(id);

    for (let i = 0; i < snake.length; i++) {
      const part = snake[i];
      const x = offsetX + part.x * gridSize;
      const y = offsetY + part.y * gridSize;

      ctx.save();
      ctx.translate(x, y);

      if (id === playerId) {
        // Si boosté, dessiner une aura pulsante
        if (isBoosted) {
          const auraAlpha = 0.5 + 0.5 * Math.sin(frameCount * 0.25);
          ctx.fillStyle = `rgba(0,255,0,${auraAlpha})`;
          ctx.beginPath();
          ctx.arc(gridSize / 2, gridSize / 2, gridSize * 0.7, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Dessin serpent (différencier tête et corps)
        if (i === 0) {
          // Tête légèrement oscillante
          const headOffset = 3 * Math.sin(frameCount * 0.5);
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          ctx.ellipse(
            gridSize / 2 + headOffset,
            gridSize / 2,
            gridSize / 2,
            gridSize / 1.6,
            0,
            0,
            2 * Math.PI
          );
          ctx.fill();

          ctx.fillStyle = "white";
          ctx.beginPath();
          ctx.arc(
            gridSize / 2 + headOffset + 6,
            gridSize / 2 - 8,
            5,
            0,
            2 * Math.PI
          );
          ctx.fill();
          ctx.fillStyle = "black";
          ctx.beginPath();
          ctx.arc(
            gridSize / 2 + headOffset + 6,
            gridSize / 2 - 8,
            2,
            0,
            2 * Math.PI
          );
          ctx.fill();
        } else {
          ctx.fillStyle = baseColor;
          ctx.fillRect(0, 0, gridSize, gridSize);
        }
      } else {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, gridSize, gridSize);
      }

      ctx.restore();
    }
  }

  drawParticles();
  drawLeaderboard();

  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "bold 64px Arial";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2);
    ctx.font = "28px Arial";
    ctx.fillText(
      "Appuyez sur Entrée pour recommencer",
      canvas.width / 2,
      canvas.height / 2 + 50
    );
  }

  frameCount++;
  requestAnimationFrame(draw);
}

draw();
