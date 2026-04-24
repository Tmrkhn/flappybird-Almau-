const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 400, H = 650;
canvas.width = W; canvas.height = H;

const bgImage = new Image();
bgImage.src = './almau_flappybird.png';

const playerImage = new Image();
playerImage.src = './player.png';

const GRAVITY = 0.45;
const JUMP = -9.5;
const PIPE_SPEED = 3;
const PIPE_GAP = 155;
const PIPE_INTERVAL = 1800;

// --- State ---
let gameState = 'start';
let score = 0, bestScore = 0, frame = 0;
let lastPipe = 0, animFrame;
let doubleJumpUsed = false, lastTap = 0;
let isPaused = false, isMuted = false;

// Parallax
let buildingScroll = 0, groundScroll = 0;

// Shield
let shield = null;
let playerHasShield = false;
let shieldGlow = 0;
let pipesSpawned = 0;
let nextShieldPipe = 10 + Math.floor(Math.random() * 3);

// Death
let deathFlash = 0;

// Audio
let audioCtx = null;

// --- Messages ---
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

// --- Player ---
const player = {
  x: 80, y: H/2, vy: 0, w: 38, h: 38,
  angle: 0, alive: true, wingFrame: 0,
};

let pipes = [], particles = [], floatingTexts = [];
let bgStars = [];

for (let i = 0; i < 60; i++) {
  bgStars.push({
    x: Math.random() * W,
    y: Math.random() * H * 0.6,
    r: Math.random() * 1.5 + 0.3,
    speed: Math.random() * 0.3 + 0.1,
    alpha: Math.random() * 0.6 + 0.2
  });
}

// ===== AUDIO =====
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSweep(f1, f2, dur, type, gain) {
  if (isMuted) return;
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine';
    osc.connect(g); g.connect(ac.destination);
    osc.frequency.setValueAtTime(f1, ac.currentTime);
    osc.frequency.linearRampToValueAtTime(f2, ac.currentTime + dur);
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(); osc.stop(ac.currentTime + dur + 0.05);
  } catch(e) {}
}

function playTone(freq, dur, gain) {
  if (isMuted) return;
  try {
    const ac = getAudio();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.start(); osc.stop(ac.currentTime + dur + 0.05);
  } catch(e) {}
}

function playSound(type) {
  switch(type) {
    case 'jump':        playSweep(200, 400, 0.1, 'sine', 0.2); break;
    case 'score':       playTone(880, 0.15, 0.2); break;
    case 'shieldPick':
      [0, 80, 160].forEach((delay, i) => {
        setTimeout(() => playTone([523, 659, 784][i], 0.25, 0.15), delay);
      }); break;
    case 'shieldBreak': playSweep(300, 100, 0.3, 'sawtooth', 0.2); break;
    case 'death':       playSweep(400, 150, 0.5, 'sine', 0.25); break;
  }
}

function toggleMute() {
  isMuted = !isMuted;
  document.getElementById('muteBtn').textContent = isMuted ? '🔇' : '🔊';
}

// ===== PAUSE =====
function togglePause() {
  if (gameState !== 'playing') return;
  isPaused = !isPaused;
  document.getElementById('pauseScreen').style.display = isPaused ? 'flex' : 'none';
}

// ===== BACKGROUND =====
function drawBackground() {
  const moving = (gameState === 'playing' || gameState === 'dead') && !isPaused;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#07091f');
  sky.addColorStop(0.5, '#0d1535');
  sky.addColorStop(1, '#111d3a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars — parallax layer 1 (slowest)
  bgStars.forEach(s => {
    if (moving) s.x -= s.speed;
    if (s.x < 0) s.x = W;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.fill();
  });

  // Building — parallax layer 2 (~4-5x slower than pipes)
  if (moving) buildingScroll += 0.7;
  drawBuildingImage();

  // Ground — parallax layer 3 (fast)
  if (moving) groundScroll += PIPE_SPEED + score * 0.04;

  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, H-60, W, 60);

  ctx.fillStyle = '#2a2a3f';
  ctx.fillRect(0, H-62, W, 2);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const gx = -(groundScroll % 40);
  for (let i = 0; i < W + 40; i += 40) {
    ctx.beginPath();
    ctx.moveTo(gx + i, H-58);
    ctx.lineTo(gx + i, H);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0, 150, 255, 0.15)';
  ctx.font = 'bold 11px Nunito';
  ctx.textAlign = 'center';
  ctx.fillText('АЛМАТЫ МЕНЕДЖМЕНТ УНИВЕРСИТЕТ', W/2, H-20);
}

function drawBuildingImage() {
  if (!bgImage.complete || !bgImage.naturalWidth) return;

  const ox = -(buildingScroll % W);

  ctx.drawImage(bgImage, ox,     0, W, H);
  ctx.drawImage(bgImage, ox + W, 0, W, H);

  ctx.fillStyle = 'rgba(0, 0, 20, 0.4)';
  ctx.fillRect(0, 0, W, H);
}

// ===== PIPES =====
function drawPipe(pipe) {
  drawDocumentStack(pipe.x, 0, pipe.w, pipe.topH, true);
  const botY = pipe.topH + PIPE_GAP;
  drawDocumentStack(pipe.x, botY, pipe.w, H - botY - 60, false);

  const gapMid = pipe.topH + PIPE_GAP/2;
  const grd = ctx.createRadialGradient(pipe.x + pipe.w/2, gapMid, 0, pipe.x + pipe.w/2, gapMid, 80);
  grd.addColorStop(0, pipe.moving ? 'rgba(255,180,0,0.07)' : 'rgba(0,200,100,0.08)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(pipe.x - 20, pipe.topH, pipe.w + 40, PIPE_GAP);

  if (pipe.moving) {
    ctx.fillStyle = 'rgba(255,180,50,0.45)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('↕', pipe.x + pipe.w/2, gapMid + 4);
  }
}

function drawDocumentStack(x, y, w, h, isTop) {
  if (h <= 0) return;
  const layers = Math.max(1, Math.floor(h / 18));
  const layerH = h / layers;

  for (let i = 0; i < layers; i++) {
    const ly = y + i * layerH;
    const offset = (i % 2 === 0) ? 0 : 2;
    const shade = 220 + (i % 3) * 12;
    ctx.fillStyle = `rgb(${shade},${shade-10},${shade-20})`;
    ctx.fillRect(x + offset, ly + 1, w - offset*2, layerH - 2);

    ctx.fillStyle = 'rgba(100,100,150,0.3)';
    for (let l = 0; l < 3; l++) {
      ctx.fillRect(x + offset + 6, ly + 5 + l*4, w - offset*2 - 12, 1);
    }

    if (i % 5 === 0) {
      ctx.fillStyle = 'rgba(0,80,200,0.4)';
      ctx.font = 'bold 6px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText('AlmaU', x + w/2, ly + 10);
    }
  }

  const eg1 = ctx.createLinearGradient(x, 0, x+8, 0);
  eg1.addColorStop(0, 'rgba(0,0,0,0.4)'); eg1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = eg1; ctx.fillRect(x, y, 10, h);

  const eg2 = ctx.createLinearGradient(x+w-8, 0, x+w, 0);
  eg2.addColorStop(0, 'rgba(0,0,0,0)'); eg2.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = eg2; ctx.fillRect(x+w-10, y, 10, h);
}

// ===== SHIELD =====
function drawShield() {
  if (!shield) return;

  if (gameState === 'playing' && !isPaused) {
    shield.x -= PIPE_SPEED + score * 0.04;
    shield.phase += 0.08;
  }

  if (shield.x < -30) { shield = null; return; }

  const pulse = 0.25 + Math.sin(shield.phase) * 0.12;
  const glow = ctx.createRadialGradient(shield.x, shield.y, 0, shield.x, shield.y, 34);
  glow.addColorStop(0, `rgba(0,160,255,${pulse})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(shield.x, shield.y, 34, 0, Math.PI*2);
  ctx.fill();

  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🛡️', shield.x, shield.y + 9);

  if (gameState === 'playing' && !isPaused) {
    const dx = shield.x - (player.x + player.w/2);
    const dy = shield.y - (player.y + player.h/2);
    if (Math.sqrt(dx*dx + dy*dy) < 22) {
      playerHasShield = true;
      shield = null;
      playSound('shieldPick');
      floatingTexts.push({
        x: player.x + 20, y: player.y - 15,
        text: '🛡️ ЩИТ!', color: '#00ccff', size: 14,
        life: 55, maxLife: 55
      });
    }
  }
}

// ===== PLAYER =====
function drawPlayer() {
  ctx.save();
  const cx = player.x + player.w/2;
  const cy = player.y + player.h/2;
  ctx.translate(cx, cy);

  const targetAngle = Math.max(-0.5, Math.min(0.8, player.vy * 0.06));
  player.angle += (targetAngle - player.angle) * 0.15;
  ctx.rotate(player.angle);

  // Shield / break aura
  if (playerHasShield || shieldGlow > 0) {
    if (shieldGlow > 0) shieldGlow--;
    const t = playerHasShield ? (0.5 + Math.sin(frame * 0.15) * 0.2) : (shieldGlow / 40) * 0.7;
    const auraColor = shieldGlow > 0 ? `rgba(255,120,0,${t})` : `rgba(0,160,255,${t})`;
    const auraGrd = ctx.createRadialGradient(0, 0, 12, 0, 0, 30);
    auraGrd.addColorStop(0, shieldGlow > 0 ? `rgba(255,120,0,${t*0.5})` : `rgba(0,160,255,${t*0.5})`);
    auraGrd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrd;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI*2);
    ctx.strokeStyle = auraColor; ctx.lineWidth = 2.5; ctx.stroke();
  }

  ctx.drawImage(playerImage, -player.w/2, -player.h/2, player.w, player.h);

  ctx.restore();
}

// ===== PARTICLES =====
function drawParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.2; p.life--;
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.font = p.size + 'px sans-serif';
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
  const emojis = ['📄','📋','📝','✏️','📚','🗂️','📃','📑'];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 / 16) * i + (Math.random() - 0.5) * 0.5;
    const speed = 2.5 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      text: emojis[Math.floor(Math.random() * emojis.length)],
      size: 14 + Math.random() * 10,
      color: '#fff',
      life: 60, maxLife: 60
    });
  }
}

// ===== HUD =====
function addScorePopup(x, y) {
  const msgs = ['+1 место!','Молодец!','Дальше!','Вперёд!','Да!'];
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
  document.getElementById('queueStatus').textContent = `📋 Ты продвинулся на ${score} мест в очереди`;

  if (playerHasShield) {
    ctx.fillStyle = 'rgba(0,200,255,0.7)';
    ctx.font = 'bold 10px Nunito';
    ctx.textAlign = 'left';
    ctx.fillText('🛡️ Щит активен', 12, H-75);
  }
}

function drawReadyHint() {
  const alpha = 0.4 + Math.sin(frame * 0.08) * 0.4;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px "Press Start 2P", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ТАП ДЛЯ СТАРТА', W/2, H/2 + 80);
  ctx.globalAlpha = 1;
}

// ===== GAME LOGIC =====
function spawnPipe() {
  const minTop = 80, maxTop = H - PIPE_GAP - 120;
  const topH = Math.floor(Math.random() * (maxTop - minTop) + minTop);
  const isMoving = (pipesSpawned % 9 === 8);
  pipes.push({
    x: W + 10, topH, baseTopH: topH, w: 52, passed: false,
    moving: isMoving, movePhase: Math.random() * Math.PI * 2
  });

  pipesSpawned++;

  if (pipesSpawned >= nextShieldPipe && !shield && !playerHasShield) {
    shield = {
      x: W + 36,
      y: topH + PIPE_GAP/2 + (Math.random() - 0.5) * (PIPE_GAP * 0.4),
      phase: 0
    };
    nextShieldPipe = pipesSpawned + 10 + Math.floor(Math.random() * 3);
  }
}

function updatePipes() {
  const now = Date.now();
  if (now - lastPipe > PIPE_INTERVAL) {
    spawnPipe();
    lastPipe = now;
  }

  const speed = PIPE_SPEED + score * 0.04;
  pipes.forEach(p => {
    p.x -= speed;
    if (p.moving) {
      p.movePhase += 0.02;
      p.topH = p.baseTopH + Math.sin(p.movePhase) * 35;
    }
  });
  pipes = pipes.filter(p => p.x > -p.w - 10);

  pipes.forEach(p => {
    if (!p.passed && p.x + p.w < player.x) {
      p.passed = true;
      score++;
      if (score > bestScore) bestScore = score;
      playSound('score');
      addScorePopup(player.x + 30, player.y);

      if (score % 10 === 0) {
        floatingTexts.push({
          x: W/2, y: H/2 - 40,
          text: score === 10 ? '🎉 10 мест — отлично!' :
                score === 20 ? '🔥 Ты стремительно идёшь!' :
                score === 30 ? '⭐ Почти у эдвайзера!' : `🏆 ${score} мест пройдено!`,
          color: '#ffdd00', size: 16, life: 80, maxLife: 80
        });
      }
    }

    const px = player.x + 4, py = player.y + 4;
    const pw = player.w - 8, ph = player.h - 8;
    if (px < p.x + p.w && px + pw > p.x) {
      if (py < p.topH || py + ph > p.topH + PIPE_GAP) {
        if (playerHasShield) {
          playerHasShield = false;
          shieldGlow = 40;
          p.x = -999; // удаляем столб с которым столкнулись
          playSound('shieldBreak');
          particles.push({
            x: player.x + player.w/2, y: player.y + player.h/2,
            vx: 0, vy: 0, text: '💥', size: 36, color: '#fff',
            life: 20, maxLife: 20
          });
          floatingTexts.push({
            x: player.x + 20, y: player.y - 15,
            text: '💥 ЩИТ СЛОМАН!', color: '#ffaa00', size: 12,
            life: 55, maxLife: 55
          });
        } else {
          die();
        }
      }
    }
  });

  if (player.y + player.h >= H - 60 || player.y <= 0) die();
}

function die() {
  if (!player.alive) return;

  player.alive = false;
  gameState = 'dead';
  deathFlash = 12;
  playSound('death');
  addParticles(player.x + player.w/2, player.y + player.h/2);
  setTimeout(() => showGameOver(), 800);
}

function showGameOver() {
  document.getElementById('score').style.display = 'none';
  document.getElementById('queueStatus').style.display = 'none';
  document.getElementById('topControls').style.display = 'none';

  const msg = deathMessages[Math.floor(Math.random() * deathMessages.length)];
  const medal = score >= 30 ? '🏆' : score >= 20 ? '🥇' : score >= 10 ? '🥈' : score >= 5 ? '🥉' : '😔';

  document.getElementById('medal').textContent = medal;
  document.getElementById('goMessage').textContent = msg;
  document.getElementById('finalScore').textContent = score;
  document.getElementById('bestScoreDisplay').textContent = bestScore;

  const title = score >= 30 ? 'КРАСНЫЙ ДИПЛОМ! 🎓' :
                score >= 20 ? 'ХОРОШИСТ! 👍' :
                score >= 10 ? 'ТРОЕЧНИК 😅' : 'ПЕРЕСДАЧА!';
  document.getElementById('goTitle').textContent = title;
  document.getElementById('goTitle').style.color =
    score >= 30 ? '#ffdd00' : score >= 20 ? '#00ff88' : '#ff4444';

  document.getElementById('gameOverScreen').style.display = 'flex';
}

function startGame() {
  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('gameOverScreen').style.display = 'none';
  document.getElementById('score').style.display = 'none';
  document.getElementById('queueStatus').style.display = 'none';
  document.getElementById('pauseScreen').style.display = 'none';
  document.getElementById('topControls').style.display = 'none';

  pipes = []; particles = []; floatingTexts = [];
  shield = null; playerHasShield = false; shieldGlow = 0; deathFlash = 0;
  score = 0; frame = 0;
  doubleJumpUsed = false; isPaused = false;
  pipesSpawned = 0;
  nextShieldPipe = 10 + Math.floor(Math.random() * 3);

  player.y = H/2 - 20;
  player.vy = 0; player.angle = 0; player.alive = true;

  gameState = 'ready';
}

function goToMainMenu() {
  document.getElementById('gameOverScreen').style.display = 'none';
  document.getElementById('pauseScreen').style.display = 'none';
  document.getElementById('startScreen').style.display = 'flex';
  document.getElementById('score').style.display = 'none';
  document.getElementById('queueStatus').style.display = 'none';
  document.getElementById('topControls').style.display = 'none';

  pipes = []; particles = []; floatingTexts = [];
  shield = null; playerHasShield = false; shieldGlow = 0; deathFlash = 0;
  score = 0; frame = 0; isPaused = false;
  player.y = H/2; player.vy = 0; player.angle = 0; player.alive = true;
  gameState = 'start';
}

// ===== JUMP =====
function jump() {
  if (gameState === 'start') { startGame(); return; }
  if (gameState === 'dead' || isPaused) return;
  if (!player.alive) return;

  if (gameState === 'ready') {
    gameState = 'playing';
    lastPipe = Date.now() + 1000;
    player.vy = JUMP;
    doubleJumpUsed = false;
    document.getElementById('topControls').style.display = 'flex';
    playSound('jump');
    return;
  }

  playSound('jump');
  if (player.vy < 3 || !doubleJumpUsed === false) {
    player.vy = JUMP;
    doubleJumpUsed = false;
  } else if (!doubleJumpUsed) {
    player.vy = JUMP * 0.85;
    doubleJumpUsed = true;
  }
}

// ===== GAME LOOP =====
function gameLoop() {
  ctx.clearRect(0, 0, W, H);
  if (!isPaused) frame++;

  drawBackground();

  if (gameState === 'playing' || gameState === 'dead') {
    pipes.forEach(p => drawPipe(p));
    drawShield();

    if (gameState === 'playing' && !isPaused) {
      player.vy += GRAVITY;
      player.y += player.vy;
      if (player.vy > 0) doubleJumpUsed = false;
      updatePipes();
    }

    if (player.alive) drawPlayer();
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
    const previewY = H/2 - 50 + Math.sin(frame * 0.05) * 20;
    ctx.save();
    ctx.translate(80, previewY);
    ctx.font = '38px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎒', 0, 0);
    ctx.restore();
  }

  if (deathFlash > 0) {
    deathFlash--;
    ctx.fillStyle = `rgba(255,80,80,${(deathFlash / 12) * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }

  animFrame = requestAnimationFrame(gameLoop);
}

// ===== EVENTS =====
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault();
    jump();
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    togglePause();
  }
});

canvas.addEventListener('click', () => { if (!isPaused) jump(); });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (isPaused) return;
  const now = Date.now();
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

document.querySelectorAll('.btn, .ctrl-btn, #homeBtn, .btn-outline').forEach(btn => {
  btn.addEventListener('touchstart', e => e.stopPropagation());
});

bgImage.onload = () => gameLoop();
bgImage.onerror = () => gameLoop(); // fallback если файл недоступен
