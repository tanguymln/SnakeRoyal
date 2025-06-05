/** Canvas HTML pour le rendu du jeu */
const canvas = document.getElementById("game") as HTMLCanvasElement;

/** Contexte 2D pour dessiner dans le canvas */
const ctx = canvas.getContext("2d")!;

/** Élément HTML pour l'écran de démarrage */
const startScreen = document.getElementById("startScreen") as HTMLDivElement;

/** Bouton pour lancer la partie */
const startButton = document.getElementById("startButton") as HTMLButtonElement;

/** Input pour le pseudo du joueur */
const pseudoInput = document.getElementById("pseudoInput") as HTMLInputElement;

/** Nombre de colonnes dans le monde, ajusté */
const worldCols = 160 / 1.3;

/** Nombre de lignes dans le monde, ajusté */
const worldRows = 90 / 1.3;

/** Taille d'une case en pixels, calculée dynamiquement */
let gridSize = 60;

/** Décalage horizontal pour centrer la grille */
let offsetX = 0;

/** Décalage vertical pour centrer la grille */
let offsetY = 0;

/** Identifiant unique du joueur */
let playerId = "";

/** Pseudo du joueur */
let playerPseudo = "";

/** Compteur de temps pour les animations */
let time = 0;

/** Map des serpents, clé = playerId, valeur = tableau de positions (x,y) */
let snakes: Record<string, { x: number; y: number }[]> = {};

/** Tableau des pommes présentes dans le monde */
let apples: { x: number; y: number }[] = [];

/** Map indiquant si un joueur est vivant */
let aliveMap: Record<string, boolean> = {};

/** Map des scores des joueurs */
let scoreMap: Record<string, number> = {};

/** Map indiquant si un joueur est en boost */
let boostMap: Record<string, boolean> = {};

/** Map des cooldowns de boost des joueurs */
let boostCooldownMap: Record<string, number> = {};

/** Map des pseudos des joueurs */
let pseudoMap: Record<string, string> = {};

/** Liste des portails dans le jeu */
let portals: {
  entry: { x: number; y: number };
  exit: { x: number; y: number };
}[] = [];

/** Liste du classement des joueurs */
let leaderboard: { pseudo: string; score: number }[] = [];

/** Direction actuelle du joueur */
let direction = { x: 1, y: 0 };

/** Dernière direction utilisée */
let lastDirection = { x: 1, y: 0 };

/** Booléen indiquant si le jeu est terminé */
let gameOver = false;

/** WebSocket pour la communication avec le serveur */
let ws: WebSocket | null = null;

/** Map de couleurs attribuées aux joueurs */
const colorMap: Record<string, string> = {};

/**
 * Retourne la couleur associée à un joueur.
 * Si aucune couleur n'est encore attribuée, en génère une.
 * @param {string} id Identifiant du joueur
 * @returns {string} Couleur en hexadécimal
 */
function getColor(id: string): string {
  if (!colorMap[id]) {
    colorMap[id] = id === playerId ? "#00ff00" : getRandomColor();
  }
  return colorMap[id];
}

/**
 * Génère une couleur hexadécimale aléatoire.
 * @returns {string} Couleur au format #RRGGBB
 */
function getRandomColor(): string {
  return (
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );
}

/**
 * Redimensionne le canvas et calcule la taille des cases et offsets pour centrer la grille.
 * @returns {void}
 */
function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const cellW = canvas.width / worldCols;
  const cellH = canvas.height / worldRows;
  gridSize = Math.floor(Math.min(cellW, cellH));
  offsetX = (canvas.width - worldCols * gridSize) / 2;
  offsetY = (canvas.height - worldRows * gridSize) / 2;
}

/** Initialise la taille du canvas au chargement */
resizeCanvas();

/** Recalcule la taille du canvas lors d'un redimensionnement de la fenêtre */
window.addEventListener("resize", resizeCanvas);

/**
 * Gère le clic sur le bouton de démarrage.
 * Récupère le pseudo et lance la partie.
 */
startButton.onclick = () => {
  const pseudo = pseudoInput.value.trim() || "Joueur";
  playerPseudo = pseudo;
  startGame(pseudo);
  startScreen.style.display = "none";
  canvas.style.display = "block";
};

/**
 * Initialise la connexion WebSocket et configure les callbacks.
 * Gère la réception des données et met à jour l'état du jeu.
 * @param {string} pseudo Pseudo du joueur
 */
function startGame(pseudo: string): void {
  ws = new WebSocket("ws://localhost:3001");

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
      snakes = data.snakes;
      apples = data.apples;
      aliveMap = data.alive;
      scoreMap = data.scores;
      boostMap = data.boosts;
      boostCooldownMap = data.boostCooldowns;
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

/**
 * Gère la détection des touches pressées pour la direction ou les actions.
 * Envoie les commandes appropriées au serveur via WebSocket.
 * @param {KeyboardEvent} e L'événement clavier
 */
document.addEventListener("keydown", (e: KeyboardEvent) => {
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

    // Cas où serpent ne fait qu'une case (départ)
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

    // Si direction modifiée, envoie au serveur
    if (newDir.x !== direction.x || newDir.y !== direction.y) {
      direction = newDir;
      lastDirection = newDir;
      ws.send(JSON.stringify({ type: "direction", direction }));
    }
  }
});

/**
 * Dessine le classement des joueurs dans un cadre à droite.
 * @returns {void}
 */
function drawLeaderboard(): void {
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
    const text = `${i + 1}. ${entry.pseudo} — ${entry.score}`;
    ctx.fillText(text, x + 100, yPos + 25);
  });
}

/**
 * Affiche le cooldown du boost du joueur.
 * @returns {void}
 */
function drawBoostCooldown(): void {
  const padding = 20;

  const x = canvas.width - padding;
  const y = padding;

  if (playerId && boostCooldownMap[playerId] !== undefined) {
    const cooldownTicks = boostCooldownMap[playerId];
    const cooldownSeconds = (cooldownTicks / 15).toFixed(1);

    ctx.fillStyle = "#000";
    ctx.font = "20px Arial";
    ctx.fillText(
      cooldownTicks === 0
        ? "Boost prêt (Espace)"
        : `Boost dispo dans ${cooldownSeconds}s`,
      x - 100,
      canvas.height - padding
    );
  }
}

/**
 * Fonction principale de dessin appelée à chaque frame.
 * Dessine le terrain, les pommes, portails, serpents, pseudos, cooldowns et leaderboard.
 * Affiche aussi l'écran de fin si le joueur est mort.
 * @returns {void}
 */
function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Pommes
  ctx.fillStyle = "red";

  for (const apple of apples) {
    ctx.beginPath();
    ctx.arc(
      offsetX + (apple.x + 0.5) * gridSize,
      offsetY + (apple.y + 0.5) * gridSize,
      gridSize / 2,
      0,
      2 * Math.PI
    );
    ctx.fill();
  }

  // Portails
  ctx.fillStyle = "blue";
  for (const portal of portals) {
    ctx.beginPath();
    ctx.arc(
      offsetX + (portal.entry.x + 0.5) * gridSize,
      offsetY + (portal.entry.y + 0.5) * gridSize,
      gridSize / 2,
      0,
      2 * Math.PI
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      offsetX + (portal.exit.x + 0.5) * gridSize,
      offsetY + (portal.exit.y + 0.5) * gridSize,
      gridSize / 2,
      0,
      2 * Math.PI
    );
    ctx.fill();
  }

  // Serpents
  for (const [id, snake] of Object.entries(snakes)) {
    if (!aliveMap[id]) continue;

    const color = getColor(id);

    if (boostMap[id]) {
      const maxBlur = 15; // flou max sur la tête

      for (let i = 0; i < snake.length; i++) {
        const segment = snake[i];
        const x = offsetX + segment.x * gridSize;
        const y = offsetY + segment.y * gridSize;

        // Flou qui diminue vers la queue
        const blur = maxBlur * (1 - i / snake.length);

        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, gridSize, gridSize);
      }

      // Reset shadowBlur après dessin du serpent
      ctx.shadowBlur = 0;
    } else {
      // Pas de boost, dessin sans aura
      for (const segment of snake) {
        const x = offsetX + segment.x * gridSize;
        const y = offsetY + segment.y * gridSize;

        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, gridSize, gridSize);
      }
    }

    // Pseudo au-dessus de la tête
    const head = snake[0];
    const pseudo = pseudoMap[id] || "???";
    ctx.font = "bold 13px Arial";
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.fillText(
      pseudo,
      offsetX + (head.x + 0.5) * gridSize,
      offsetY + head.y * gridSize - 6
    );

    // Mise à jour de la dernière direction selon la tête et le cou
    if (id === playerId && snake.length >= 2) {
      const [, neck] = snake;
      lastDirection = { x: head.x - neck.x, y: head.y - neck.y };
    }

    drawBoostCooldown();

    time++;
  }

  drawLeaderboard();

  // Affiche écran de fin si mort
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

/**
 * Boucle principale du jeu, appelée à chaque frame par requestAnimationFrame.
 * @returns {void}
 */
function gameLoop(): void {
  draw();
  requestAnimationFrame(gameLoop);
}

/** Démarrage de la boucle de jeu */
gameLoop();
