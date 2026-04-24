const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 400, H = 650;
canvas.width = W; canvas.height = H;

const GRAVITY = 0.45;
const JUMP = -9.5;
const PIPE_SPEED = 3;
const PIPE_GAP = 155;
const PIPE_INTERVAL = 1800;

let gameState = 'start';
let score = 0, bestScore = 0, frame = 0;
let lastPipe = 0, animFrame;
let doubleJumpUsed = false;
let lastTap = 0;

const deathMessages = [
  "Эдвайзер ушёл на обед 😔",
  "Документы не приняты! Нужна печать.",
  "Вы записаны на следующий семестр.",
  "Пересдача! Академический должник.",
  "Неприёмный день, приходите завтра.",
  "Очередь обнулилась. Попробуйте снова.",
  "Ваш номер истёк. Возьмите новый талон.",
  "Деканат закрыт на учёт.",
  "GPA слишком низкий для прохода 📉",
  "Вы опоздали! Запись закрыта.",
];

const player = {
  x: 80, y: H/2, vy: 0, w: 38, h: 38,
  angle: 0, alive: true,
  wingFrame: 0,
};

let pipes = [];
let particles = [];
let bgStars = [];
let floatingTexts = [];

for (let i = 0; i < 60; i++) {
  bgStars.push({
    x: Math.random() * W,
    y: Math.random() * H * 0.6,
    r: Math.random() * 1.5 + 0.3,
    speed: Math.random() * 0.3 + 0.1,
    alpha: Math.random() * 0.6 + 0.2
  });
}

function drawBackground() {
  let sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#07091f');
  sky.addColorStop(0.5, '#0b1540');
  sky.addColorStop(1, '#1a2a0a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  bgStars.forEach(s => {
    if (gameState === 'playing') s.x -= s.speed;
    if (s.x < 0) s.x = W;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.fill();
  });

  drawBuilding();

  let groundGrad = ctx.createLinearGradient(0, H-60, 0, H);
  groundGrad.addColorStop(0, '#0d2a0d');
  groundGrad.addColorStop(1, '#050f05');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, H-60, W, 60);

  ctx.fillStyle = '#1a4a1a';
  ctx.fillRect(0, H-62, W, 4);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i - (frame % 40), H-58);
    ctx.lineTo(i - (frame % 40), H);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0, 150, 255, 0.15)';
  ctx.font = 'bold 11px Nunito';
  ctx.textAlign = 'center';
  ctx.fillText('АЛМАТЫ МЕНЕДЖМЕНТ УНИВЕРСИТЕТ', W/2, H-20);
}

function drawBuilding() {
  ctx.fillStyle = 'rgba(20, 40, 80, 0.6)';
  ctx.fillRect(60, H-200, 120, 140);
  ctx.fillRect(220, H-170, 90, 110);
  ctx.fillRect(50, H-240, 60, 50);

  const winRows = [H-190, H-170, H-150, H-130, H-110];
  winRows.forEach(row => {
    [70,90,110,130,150].forEach(col => {
      if (Math.random() > 0.3 || frame === 0) {
        ctx.fillStyle = Math.random() > 0.7 ? 'rgba(255,220,100,0.25)' : 'rgba(0,100,200,0.1)';
      }
      ctx.fillRect(col, row, 12, 10);
    });
  });

  [230,250,270,290].forEach(col => {
    [H-160, H-140, H-120, H-100].forEach(row => {
      ctx.fillStyle = 'rgba(255,220,100,0.12)';
      ctx.fillRect(col, row, 10, 8);
    });
  });

  ctx.fillStyle = 'rgba(150, 150, 150, 0.4)';
  ctx.fillRect(108, H-270, 3, 50);
  ctx.fillStyle = 'rgba(0, 100, 255, 0.5)';
  ctx.fillRect(111, H-270, 22, 14);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = 'bold 7px Nunito';
  ctx.textAlign = 'left';
  ctx.fillText('AU', 113, H-260);
}

function drawPipe(pipe) {
  drawDocumentStack(pipe.x, 0, pipe.w, pipe.topH, true);

  let botY = pipe.topH + PIPE_GAP;
  drawDocumentStack(pipe.x, botY, pipe.w, H - botY - 60, false);

  let gapMid = pipe.topH + PIPE_GAP/2;
  let grd = ctx.createRadialGradient(pipe.x + pipe.w/2, gapMid, 0, pipe.x + pipe.w/2, gapMid, 80);
  grd.addColorStop(0, 'rgba(0, 200, 100, 0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(pipe.x - 20, pipe.topH, pipe.w + 40, PIPE_GAP);
}

function drawDocumentStack(x, y, w, h, isTop) {
  if (h <= 0) return;
  let layers = Math.max(1, Math.floor(h / 18));
  let layerH = h / layers;

  for (let i = 0; i < layers; i++) {
    let ly = y + i * layerH;
    let offset = (i % 2 === 0) ? 0 : 2;

    let shade = 220 + (i % 3) * 12;
    ctx.fillStyle = `rgb(${shade}, ${shade-10}, ${shade-20})`;
    ctx.fillRect(x + offset, ly + 1, w - offset*2, layerH - 2);

    ctx.fillStyle = 'rgba(100, 100, 150, 0.3)';
    for (let l = 0; l < 3; l++) {
      ctx.fillRect(x + offset + 6, ly + 5 + l*4, w - offset*2 - 12, 1);
    }

    if (i % 5 === 0) {
      ctx.fillStyle = 'rgba(0, 80, 200, 0.4)';
      ctx.font = 'bold 6px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText('AlmaU', x + w/2, ly + 10);
    }
  }

  let edgeGrd = ctx.createLinearGradient(x, 0, x + 8, 0);
  edgeGrd.addColorStop(0, 'rgba(0,0,0,0.4)');
  edgeGrd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edgeGrd;
  ctx.fillRect(x, y, 10, h);

  let edgeGrd2 = ctx.createLinearGradient(x+w-8, 0, x+w, 0);
  edgeGrd2.addColorStop(0, 'rgba(0,0,0,0)');
  edgeGrd2.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = edgeGrd2;
  ctx.fillRect(x+w-10, y, 10, h);
}

function drawPlayer() {
  ctx.save();
  let cx = player.x + player.w/2;
  let cy = player.y + player.h/2;
  ctx.translate(cx, cy);

  let targetAngle = Math.max(-0.5, Math.min(0.8, player.vy * 0.06));
  player.angle += (targetAngle - player.angle) * 0.15;
  ctx.rotate(player.angle);

  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(2, player.h/2 - 2, 12, 5, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = '#1a4a8a';
  ctx.beginPath();
  ctx.roundRect(-8, -4, 14, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#0d2a5a';
  ctx.fillRect(-6, 2, 10, 1);
  ctx.fillRect(-6, 5, 10, 1);

  ctx.fillStyle = '#003580';
  ctx.beginPath();
  ctx.roundRect(-10, -6, 20, 18, 4);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = 'bold 5px Nunito';
  ctx.textAlign = 'center';
  ctx.fillText('AU', 0, 3);

  ctx.fillStyle = '#f0c080';
  ctx.beginPath();
  ctx.arc(0, -12, 10, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = '#3a2010';
  ctx.beginPath();
  ctx.arc(0, -18, 8, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(-3, -13, 1.5, 0, Math.PI*2);
  ctx.arc(3, -13, 1.5, 0, Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, -11, 3, 0, Math.PI);
  ctx.stroke();

  player.wingFrame += 0.15;
  let armSwing = Math.sin(player.wingFrame) * 4;
  ctx.strokeStyle = '#003580';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(-16, 4 + armSwing);
  ctx.moveTo(10, 0);
  ctx.lineTo(16, 4 - armSwing);
  ctx.stroke();

  let legSwing = Math.sin(player.wingFrame) * 3;
  ctx.strokeStyle = '#1a3a6a';
  ctx.beginPath();
  ctx.moveTo(-4, 12);
  ctx.lineTo(-6, 20 + legSwing);
  ctx.moveTo(4, 12);
  ctx.lineTo(6, 20 - legSwing);
  ctx.stroke();

  if (player.vy < -6) {
    ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc((Math.random()-0.5)*20, 15 + i*5, 3, 0, Math.PI*2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.15; p.life--;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.font = p.size + 'px Nunito';
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  });
}

function drawFloatingTexts() {
  floatingTexts = floatingTexts.filter(t => t.life > 0);
  floatingTexts.forEach(t => {
    t.y -= 0.5; t.life--;
    ctx.globalAlpha = t.life / t.maxLife;
    ctx.fillStyle = t.color || '#ffdd00';
    ctx.font = `bold ${t.size || 14}px Nunito`;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
    ctx.globalAlpha = 1;
  });
}

function addParticles(x, y) {
  let emojis = ['📄','📋','📝','✏️','📚'];
  for (let i = 0; i < 8; i++) {
    particles.push({
      x, y,
      vx: (Math.random()-0.5) * 6,
      vy: (Math.random()-0.5) * 6 - 2,
      text: emojis[Math.floor(Math.random()*emojis.length)],
      size: 14 + Math.random()*8,
      color: '#fff',
      life: 40, maxLife: 40
    });
  }
}

function drawReadyHint() {
  let alpha = 0.4 + Math.sin(frame * 0.08) * 0.4;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ТАП ДЛЯ СТАРТА', W/2, H/2 + 80);
  ctx.globalAlpha = 1;
}

function addScorePopup(x, y) {
  let msgs = ['+1 место!', 'Молодец!', 'Дальше!', 'Вперёд!', 'Да!'];
  floatingTexts.push({
    x, y,
    text: msgs[Math.floor(Math.random()*msgs.length)],
    color: score % 5 === 0 ? '#ffdd00' : '#aaffaa',
    size: score % 5 === 0 ? 16 : 13,
    life: 50, maxLife: 50
  });
}

function drawHUD() {
  if (gameState !== 'playing') return;

  document.getElementById('score').style.display = 'block';
  document.getElementById('score').textContent = score;
  document.getElementById('queueStatus').style.display = 'block';
  document.getElementById('queueStatus').textContent =
    `📋 Ты продвинулся на ${score} мест в очереди`;

  if (!doubleJumpUsed) {
    ctx.fillStyle = 'rgba(0, 200, 255, 0.6)';
    ctx.font = 'bold 10px Nunito';
    ctx.textAlign = 'right';
    ctx.fillText('🚀 2x прыжок готов', W-12, H-75);
  }
}

function spawnPipe() {
  let minTop = 80, maxTop = H - PIPE_GAP - 120;
  let topH = Math.floor(Math.random() * (maxTop - minTop) + minTop);
  pipes.push({ x: W + 10, topH, w: 52, passed: false });
}

function updatePipes() {
  let now = Date.now();
  if (now - lastPipe > PIPE_INTERVAL) {
    spawnPipe();
    lastPipe = now;
  }
  pipes.forEach(p => { p.x -= PIPE_SPEED + score * 0.04; });
  pipes = pipes.filter(p => p.x > -p.w - 10);

  pipes.forEach(p => {
    if (!p.passed && p.x + p.w < player.x) {
      p.passed = true;
      score++;
      if (score > bestScore) bestScore = score;
      addScorePopup(player.x + 30, player.y);

      if (score % 10 === 0) {
        floatingTexts.push({
          x: W/2, y: H/2 - 40,
          text: score === 10 ? '🎉 10 мест — отлично!' :
                score === 20 ? '🔥 Ты стремительно идёшь!' :
                score === 30 ? '⭐ Почти у эдвайзера!' : `🏆 ${score} мест пройдено!`,
          color: '#ffdd00', size: 16,
          life: 80, maxLife: 80
        });
      }
    }

    let px = player.x + 4, py = player.y + 4;
    let pw = player.w - 8, ph = player.h - 8;
    if (px < p.x + p.w && px + pw > p.x) {
      if (py < p.topH || py + ph > p.topH + PIPE_GAP) {
        die();
      }
    }
  });

  if (player.y + player.h >= H - 60 || player.y <= 0) die();
}

function die() {
  if (!player.alive) return;
  player.alive = false;
  gameState = 'dead';
  addParticles(player.x + player.w/2, player.y + player.h/2);

  setTimeout(() => showGameOver(), 700);
}

function showGameOver() {
  document.getElementById('score').style.display = 'none';
  document.getElementById('queueStatus').style.display = 'none';

  let msg = deathMessages[Math.floor(Math.random() * deathMessages.length)];
  let medal = score >= 30 ? '🏆' : score >= 20 ? '🥇' : score >= 10 ? '🥈' : score >= 5 ? '🥉' : '😔';

  document.getElementById('medal').textContent = medal;
  document.getElementById('goMessage').textContent = msg;
  document.getElementById('finalScore').textContent = score;
  document.getElementById('bestScoreDisplay').textContent = bestScore;

  let title = score >= 30 ? 'КРАСНЫЙ ДИПЛОМ! 🎓' :
              score >= 20 ? 'ХОРОШИСТ! 👍' :
              score >= 10 ? 'ТРОЕЧНИК 😅' : 'ПЕРЕСДАЧА!';
  document.getElementById('goTitle').textContent = title;
  document.getElementById('goTitle').style.color = score >= 30 ? '#ffdd00' : score >= 20 ? '#00ff88' : '#ff4444';

  document.getElementById('gameOverScreen').style.display = 'flex';
}

function startGame() {
  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('gameOverScreen').style.display = 'none';
  document.getElementById('score').style.display = 'none';
  document.getElementById('queueStatus').style.display = 'none';

  pipes = []; particles = []; floatingTexts = [];
  score = 0; frame = 0;
  doubleJumpUsed = false;

  player.y = H/2 - 20;
  player.vy = 0;
  player.angle = 0;
  player.alive = true;

  gameState = 'ready';
}

function goToMainMenu() {
  document.getElementById('gameOverScreen').style.display = 'none';
  document.getElementById('startScreen').style.display = 'flex';
  document.getElementById('score').style.display = 'none';
  document.getElementById('queueStatus').style.display = 'none';

  pipes = []; particles = []; floatingTexts = [];
  score = 0; frame = 0;
  player.y = H/2; player.vy = 0; player.angle = 0; player.alive = true;
  gameState = 'start';
}

function jump() {
  if (gameState === 'start') { startGame(); return; }
  if (gameState === 'dead') return;
  if (!player.alive) return;

  if (gameState === 'ready') {
    gameState = 'playing';
    lastPipe = Date.now() + 1000;
    player.vy = JUMP;
    doubleJumpUsed = false;
    return;
  }

  if (player.vy < 3 || !doubleJumpUsed === false) {
    player.vy = JUMP;
    doubleJumpUsed = false;
  } else if (!doubleJumpUsed) {
    player.vy = JUMP * 0.85;
    doubleJumpUsed = true;
    floatingTexts.push({
      x: player.x + 20, y: player.y - 10,
      text: '🚀 ДВОЙНОЙ!', color: '#00aaff', size: 13,
      life: 40, maxLife: 40
    });
  }
}

function gameLoop() {
  ctx.clearRect(0, 0, W, H);
  frame++;

  drawBackground();

  if (gameState === 'playing' || gameState === 'dead') {
    pipes.forEach(p => drawPipe(p));

    if (gameState === 'playing') {
      player.vy += GRAVITY;
      player.y += player.vy;
      if (player.vy > 0) doubleJumpUsed = false;
      updatePipes();
    }

    drawPlayer();
    drawParticles();
    drawFloatingTexts();
    drawHUD();
  }

  if (gameState === 'ready') {
    player.y = H/2 - 20 + Math.sin(frame * 0.05) * 8;
    player.vy = 0;
    drawPlayer();
    drawReadyHint();
  }

  if (gameState === 'start') {
    let previewY = H/2 - 50 + Math.sin(frame * 0.05) * 20;
    ctx.save();
    ctx.translate(80, previewY);
    ctx.font = '38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎒', 0, 0);
    ctx.restore();
  }

  animFrame = requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    jump();
  }
});

canvas.addEventListener('click', () => jump());
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  let now = Date.now();
  if (now - lastTap < 300) {
    if (!doubleJumpUsed && gameState === 'playing') {
      player.vy = JUMP * 0.85;
      doubleJumpUsed = true;
    }
  } else {
    jump();
  }
  lastTap = now;
}, { passive: false });

document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('touchstart', e => e.stopPropagation());
});

gameLoop();
