/* Galaxy Defender — Mission A, neon vector ship, glow particles, scaling difficulty.
   Pointer-edge bug fix: convert pointer client coords to canvas internal coords using rect->canvas scale factor.
*/

// ---------------------- CONFIG -----------------------
const KILL_GOAL = 50; // required enemies to win
const BOSS_INTERVAL = 10; // boss every 10 kills
const CANVAS = document.getElementById('game');
const ctx = CANVAS.getContext('2d');
let W = CANVAS.width, H = CANVAS.height;

// UI refs
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const killsEl = document.getElementById('kills');
const goalEl = document.getElementById('goal');
const waveEl = document.getElementById('wave');
const weaponEl = document.getElementById('weapon');
const powerEl = document.getElementById('power');
let powerTimerEl = null;
if (!document.getElementById('powerTimer')) {
  powerEl.insertAdjacentHTML('afterend', '<span id="powerTimer" style="margin-left:8px;font-size:15px;color:#ffd580"></span>');
}
powerTimerEl = document.getElementById('powerTimer');
const goalText = document.getElementById('goalText');
goalEl.textContent = KILL_GOAL;
goalText.textContent = KILL_GOAL;
document.getElementById('goalLabel').textContent = KILL_GOAL;

// controls
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayRestart = document.getElementById('overlayRestart');
const overlayClose = document.getElementById('overlayClose');

// ---------------------- GAME STATE -----------------------
let running = false;
let lastTime = 0;
let score = 0, lives = 3, kills = 0, wave = 1;
let spawnInterval = 1100; 
let spawnTimer = 0;
let bullets = [], enemies = [], powerups = [], particles = [];
let boss = null, bossActive = false;
let mouseX = W/2, mouseDown = false;
let mouseHoldAutoFire = true;

let gameOver = false; 

let powerupActive = null; 

// ---------------------- PLAYER (arrow-shaped pointer) --------------
const player = {
  x: W/2 - 20,
  yLine: H - 84,
  w: 44,
  h: 46,
  reload: 0,
  reloadMax: 220,
  weapon: 'single',
  shield: false,
  power: null
};

CANVAS.style.cursor = 'none';

// ---------------------- STARS (parallax) -------------------------
let stars = [];
for(let i=0;i<160;i++) stars.push({x:Math.random()*W, y:Math.random()*H, r:Math.random()*1.6+0.2, s: 8+Math.random()*40});
let stars2 = [];
for(let i=0;i<70;i++) stars2.push({x:Math.random()*W, y:Math.random()*H, r:Math.random()*0.6+0.08, s: 24+Math.random()*80});

// ---------------------- UTILS -------------------------
function rand(a,b){return Math.random()*(b-a)+a;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

function clientToCanvasX(clientX){
  const rect = CANVAS.getBoundingClientRect();
  const scaleX = CANVAS.width / rect.width;
  return (clientX - rect.left) * scaleX;
}
CANVAS.addEventListener('mousemove', (e) => {
  mouseX = clientToCanvasX(e.clientX);
});
CANVAS.addEventListener('touchmove', (e) => {
  if(!e.touches || e.touches.length === 0) return;
  mouseX = clientToCanvasX(e.touches[0].clientX);
  e.preventDefault();
},{passive:false});
CANVAS.addEventListener('mousedown', ()=>{ mouseDown = true; });
window.addEventListener('mouseup', ()=>{ mouseDown = false; });
CANVAS.addEventListener('touchstart', (e)=>{ mouseDown = true; e.preventDefault(); },{passive:false});
CANVAS.addEventListener('touchend', ()=>{ mouseDown = false; });

// ---------------------- SOUND (simple WebAudio FX) -----------------
const audioCtx = (typeof AudioContext !== 'undefined') ? new AudioContext() : null;
function beep(freq, duration=0.06, type='sine', vol=0.04){
  if(!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); setTimeout(()=>{ o.stop(); }, duration*1000);
}
function laserFX(){ beep(1200,0.03,'square',0.02); }
function explodeFX(){ beep(200,0.12,'sawtooth',0.04); }
function beepPower(){ if(audioCtx) beep(700, 0.06, 'triangle', 0.04); }

function victoryFX(){
  beep(700,0.12,'triangle',0.09);
  setTimeout(()=>beep(900,0.12,'triangle',0.10), 100);
  setTimeout(()=>beep(1200,0.14,'sine',0.12), 220);
  setTimeout(()=>beep(1500,0.16,'square',0.13), 340);
  setTimeout(()=>beep(1800,0.18,'triangle',0.14), 480);
}
function defeatFX(){ beep(120,0.32,'sawtooth',0.12); setTimeout(()=>beep(60,0.22,'square',0.09), 180); }
function lifeLostFX(){ beep(400,0.12,'square',0.08); setTimeout(()=>beep(180,0.10,'triangle',0.06), 80); }

// ---------------------- SPAWN / ENTITIES -------------------------
function spawnEnemy(){
  // enemy strength scales with wave
  const r = Math.random();
  const x = rand(40, W - 80);
  // scale factor for speed/hp based on wave (scaling difficulty)
  const difficultyFactor = 1 + (wave - 1) * 0.09 + kills * 0.005;
  if(r < 0.55){
    enemies.push({x, y:-40, w:34, h:34, vx:rand(-24,24) * difficultyFactor, vy:rand(60,110) * difficultyFactor, hp:1, type:'scout', col:'#ff6b6b'});
  } else if(r < 0.9){
    enemies.push({x, y:-60, w:46, h:46, vx:rand(-36,36) * difficultyFactor, vy:rand(45,85) * difficultyFactor, hp:2 + Math.floor(wave/6), type:'fighter', col:'#ffb84d'});
  } else {
    enemies.push({x, y:-80, w:56, h:56, vx:0, vy:rand(90,150) * difficultyFactor, hp:3 + Math.floor(wave/4), type:'kamikaze', col:'#ff8a8a'});
  }
}

function spawnBoss(mega=false){
  boss = {
    x: W/2 - (mega ? 210/2 : 160/2),
    y: - (mega ? 220 : 180),
    w: mega ? 210 : 160,
    h: mega ? 140 : 110,
    hp: mega ? 120 + wave*10 : 40 + wave*5,
    tx: W/2 - (mega ? 210/2 : 160/2),
    mega
  };
  bossActive = true;
  wave += 1;
  waveEl.textContent = wave;
}

// powerups: rapid, shield, double
function spawnPower(x,y){
  const types = ['rapid','shield','double'];
  const t = types[Math.floor(Math.random()*types.length)];
  powerups.push({x, y, w:28, h:28, vy:70, type:t});
}

// bullets: straight up lasers (neon)
// Player shoots bullets based on current weapon type
function shoot(){
  const cx = player.x + player.w/2;
  const by = player.yLine - player.h/2 - 6;
  if(player.weapon === 'single'){
    // Single shot
    bullets.push({x:cx, y:by, vx:0, vy:-720, w:6, h:12, owner:'player'});
  } else if(player.weapon === 'double'){
    // Double shot
    bullets.push({x:cx-10, y:by, vx:0, vy:-720, w:5, h:12, owner:'player'});
    bullets.push({x:cx+10, y:by, vx:0, vy:-720, w:5, h:12, owner:'player'});
  } else if(player.weapon === 'rapid'){
    // Rapid shot
    bullets.push({x:cx, y:by, vx:0, vy:-1100, w:4, h:10, owner:'player'});
  }
  laserFX();
}

// ---------------------- PARTICLES -------------------------
function spawnParticles(x,y,c=10,col='#fff', spread=220, upward=true){
  for(let i=0;i<c;i++){
    particles.push({
      x, y,
      vx: rand(-spread, spread) * 0.01,
      vy: (upward ? rand(-spread*1.4, -40) : rand(-80,80)) * 0.01,
      life: rand(300,1200),
      t: 0, r: rand(1.2,3.6),
      col,
      glow: Math.random() < 0.65
    });
  }
}

// ---------------------- COLLISIONS -------------------------
function aabb(a,b){
  return !(a.x + (a.w||0) < b.x || a.x > b.x + (b.w||0) || a.y + (a.h||0) < b.y || a.y > b.y + (b.h||0));
}

// ---------------------- GAME RESET / WIN / LOSE -------------------------
function resetGame(){
  score = 0; lives = 3; kills = 0; wave = 1;
  bullets = []; enemies = []; powerups = []; particles = []; boss = null; bossActive = false;
  spawnInterval = 1100;
  player.weapon = 'single'; player.reloadMax = 220; player.shield = false; player.power = null;
  updateHUD();
  hideOverlay();
  gameOver = false;
  powerupActive = null;
  if (powerTimerEl) powerTimerEl.textContent = '';
}

function showOverlay(title, text){
  overlay.style.display = 'flex';
  overlayTitle.textContent = title;
  overlayText.textContent = text;
}
function hideOverlay(){ overlay.style.display = 'none'; }

function winGame(){
  if (gameOver) return;
  running = false;
  victoryFX();
  showOverlay('VICTORY', `You destroyed ${KILL_GOAL} enemies and saved the sector! Score: ${score}`);
  gameOver = true;
}
function loseGame(){
  if (gameOver) return;
  running = false;
  defeatFX();
  showOverlay('GAME OVER', `You were defeated. Score: ${score}`);
  gameOver = true;
}

// ---------------------- HUD update -------------------------
function updateHUD(){
  scoreEl.textContent = Math.floor(score);
  livesEl.textContent = lives;
  killsEl.textContent = kills;
  waveEl.textContent = wave;
  weaponEl.textContent = (player.weapon === 'single') ? 'Single' : (player.weapon === 'double' ? 'Double' : 'Rapid');
  let icon = '';
  if (powerupActive) {
    if (powerupActive.type === 'rapid') icon = '⚡';
    else if (powerupActive.type === 'double') icon = '2️⃣';
    else if (powerupActive.type === 'shield') icon = '🛡️';
  }
  powerEl.textContent = (player.shield ? 'Shield' : (player.power || 'None')) + (icon ? ' ' + icon : '');
  if (powerupActive && powerTimerEl) {
    const secs = Math.max(0, Math.ceil((powerupActive.expires - performance.now())/1000));
    powerTimerEl.textContent = secs > 0 ? `⏳ ${secs}s` : '';
  } else if (powerTimerEl) {
    powerTimerEl.textContent = '';
  }
}

// ---------------------- UPDATE -------------------------
let lastSpawnKillCheckpoint = 0;
function update(dt){
  // progressive difficulty: slowly reduce spawn interval down to a minimum
  const spawnDecay = Math.max(650, 1100 - kills * 6 - (wave - 1) * 20);
  spawnInterval = clamp(spawnDecay, 600, 1400);

  // stars parallax
  stars.forEach(s => { s.y += (s.s*0.0015)*dt*1000 * 0.3; if(s.y > H) s.y = 0; });
  stars2.forEach(s => { s.y += (s.s*0.0015)*dt*1000 * 0.75; if(s.y > H) s.y = 0; });

  // move player horizontally (smooth ease)
  const targetX = clamp(mouseX - player.w/2, 12, W - player.w - 12);
  player.x += (targetX - player.x) * clamp(20*dt, 0, 1);
  // player visual Y
  player.y = player.yLine - player.h/2;

  // shooting auto-hold
  player.reload -= dt*1000;
  if(mouseDown && player.reload <= 0){
    player.reload = player.reloadMax;
    shoot();
  }

  // bullets update
  for(let i = bullets.length -1; i >= 0; i--){
    const b = bullets[i];
    b.x += (b.vx||0) * dt;
    b.y += (b.vy||0) * dt;
    if(b.y < -40 || b.y > H + 80) bullets.splice(i,1);
  }

  // spawn enemies gradually (unless bossActive)
  spawnTimer += dt*1000;
  if(!bossActive && spawnTimer > spawnInterval){
    spawnTimer = 0;
    spawnEnemy();
    if(Math.random() < 0.08) spawnPower(rand(60, W-60), -20);
  }

  // enemies update & collisions
  for(let i = enemies.length -1; i >= 0; i--){
    const e = enemies[i];
    e.y += e.vy * dt;
    e.x += (e.vx||0) * dt;
    if(e.x < 8 || e.x + e.w > W - 8) e.vx *= -1;

    // enemy hits player
    if(aabb(e, player)){
      enemies.splice(i,1);
        lives -= 1;
        spawnParticles(player.x + player.w/2, player.y + player.h/2, 22, '#ff6b6b');
        explodeFX();
        lifeLostFX();
        if(lives <= 0){ loseGame(); }
        updateHUD();
        continue;
    }

    // bullets hit enemy
    let hit = false;
    for(let j = bullets.length -1; j >= 0; j--){
      const b = bullets[j];
      if(b.owner === 'player' && aabb(b, e)){
        bullets.splice(j,1);
        e.hp -= 1;
        spawnParticles(e.x + e.w/2, e.y + e.h/2, 10, e.col);
        if(e.hp <= 0){
          enemies.splice(i,1);
          score += (e.type === 'scout' ? 25 : e.type === 'fighter' ? 45 : 75);
          kills += 1;
          lastSpawnKillCheckpoint = kills;
          // drop powerup sometimes
          if(Math.random() < 0.18) spawnPower(e.x + e.w/2, e.y + e.h/2);
          explodeFX();
        }
        hit = true;
        break;
      }
    }
    if(hit) continue;
    // remove off screen
    if(e.y > H + 80) enemies.splice(i,1);
  }

  // powerups update
  for(let i = powerups.length -1; i >= 0; i--){
    const p = powerups[i];
    p.y += p.vy * dt;
    if(aabb(p, player)){
      // apply power
        let expires = performance.now() + 10000;
        powerupActive = { type: p.type, expires };
        if(p.type === 'rapid'){
          player.weapon = 'rapid'; player.reloadMax = 90; player.power = 'Rapid';
        } else if(p.type === 'double'){
          player.weapon = 'double'; player.reloadMax = 260; player.power = 'Double';
        } else if(p.type === 'shield'){
          player.shield = true; player.power = 'Shield';
        }
        powerups.splice(i,1);
        spawnParticles(player.x + player.w/2, player.y + player.h/2, 18, '#7fffd4');
        beepPower();
    }
    if(p.y > H + 40) powerups.splice(i,1);
  }

    // Power-up timer expiration
    if (powerupActive && performance.now() > powerupActive.expires) {
      if (powerupActive.type === 'rapid' || powerupActive.type === 'double') {
        player.weapon = 'single'; player.reloadMax = 220; player.power = null;
      } else if (powerupActive.type === 'shield') {
        player.shield = false; player.power = null;
      }
      powerupActive = null;
      updateHUD();
    }

  // boss spawn checks
  if(kills > 0 && kills % BOSS_INTERVAL === 0 && kills !== lastSpawnKillCheckpoint && !bossActive){
    spawnBoss(false);
    lastSpawnKillCheckpoint = kills;
  }
  if(kills >= KILL_GOAL && !bossActive && !boss){
    spawnBoss(true);
  }

  if(boss){
    boss.y += (boss.y < 24 ? 80 * dt : 0);
    boss.x += (boss.tx - boss.x) * 0.03;
    if(Math.random() < 0.01) boss.tx = rand(40, W - boss.w - 40);
    // boss fires occasionally
    if(Math.random() < 0.02) {
      bullets.push({x: boss.x + boss.w/2, y: boss.y + boss.h - 6, vx: rand(-160,160), vy: 260, w:8, h:12, owner:'enemy'});
    }
    // bullets from player hit boss
    for(let j = bullets.length -1; j >= 0; j--){
      const b = bullets[j];
      if(b.owner === 'player' && aabb(b, boss)){
        bullets.splice(j,1);
        boss.hp -= 1;
        spawnParticles(b.x, b.y, 8, '#ffd580');
        if(boss.hp <= 0){
          spawnParticles(boss.x + boss.w/2, boss.y + boss.h/2, boss.mega ? 160 : 80, '#8a6bff', 420, false);
          score += boss.mega ? 1500 : 400;
          boss = null; bossActive = false;
          if(kills >= KILL_GOAL) { winGame(); }
          else {
            wave += 1;
            waveEl.textContent = wave;
          }
        }
      }
    }
  }

  // enemy bullets hitting player
  for(let i = bullets.length -1; i >= 0; i--){
    const b = bullets[i];
    if(b.owner === 'enemy' && aabb(b, player)){
      bullets.splice(i,1);
      if(!player.shield){
          lives -= 1;
          spawnParticles(player.x + player.w/2, player.y + player.h/2, 18, '#ff8a8a');
          explodeFX();
          lifeLostFX();
          if(lives <= 0) loseGame();
      } else {
        // shield absorbs
        spawnParticles(player.x + player.w/2, player.y + player.h/2, 8, '#7fffd4', 120, false);
      }
    }
  }

  // particles update (glow)
  for(let i = particles.length -1; i >= 0; i--){
    const p = particles[i];
    p.t += dt*1000;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 900 * dt; // gravity
    if(p.t > p.life) particles.splice(i,1);
  }

  // update HUD
  updateHUD();
}

// ---------------------- DRAW -------------------------
function draw(){

  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#021028'); g.addColorStop(1,'#02162a');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  stars.forEach(s => ctx.fillRect(s.x, s.y, s.r, s.r));
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  stars2.forEach(s => ctx.fillRect(s.x, s.y, s.r, s.r));

  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(8, player.yLine); ctx.lineTo(W - 8, player.yLine); ctx.stroke();

  for(const p of powerups){
    ctx.save();
    ctx.translate(p.x, p.y);
    if(p.type === 'rapid'){
      ctx.fillStyle = 'rgba(127,255,214,0.12)'; ctx.beginPath(); ctx.ellipse(0,0,20,20,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#7fffd4'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚡', 0, 0);
    } else if(p.type === 'shield'){
      ctx.fillStyle = 'rgba(106,187,255,0.12)'; ctx.beginPath(); ctx.ellipse(0,0,20,20,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#6bb0ff'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', 0, 0);
    } else if(p.type === 'double'){
      ctx.fillStyle = 'rgba(255,215,128,0.12)'; ctx.beginPath(); ctx.ellipse(0,0,20,20,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffd580'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('2️⃣', 0, 0); 
    }
    ctx.restore();
  }

  for(const e of enemies){
    ctx.save();
    ctx.translate(e.x + e.w/2, e.y + e.h/2);
    ctx.shadowColor = e.col;
    ctx.shadowBlur = 12;
    ctx.fillStyle = e.col;
    ctx.beginPath();
    ctx.moveTo(0, -e.h/2);
    ctx.lineTo(e.w/2, e.h/4);
    ctx.lineTo(0, e.h/6);
    ctx.lineTo(-e.w/2, e.h/4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w/4, e.h/5, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  if(boss){
    ctx.save();
    ctx.shadowColor = '#8a6bff';
    ctx.shadowBlur = boss.mega ? 28 : 18;
    ctx.fillStyle = boss.mega ? 'rgba(138,107,255,0.9)' : 'rgba(138,107,255,0.8)';
    const bx = boss.x, by = boss.y, bw = boss.w, bh = boss.h;
    ctx.beginPath();
    ctx.moveTo(bx + bw*0.12, by + bh*0.2);
    ctx.lineTo(bx + bw*0.88, by + bh*0.2);
    ctx.lineTo(bx + bw*0.88, by + bh*0.8);
    ctx.lineTo(bx + bw*0.12, by + bh*0.8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(bx+8,by+bh-18,bw-16,12);
    ctx.fillStyle = '#ffef7f'; const hpW = clamp((boss.hp / (boss.mega? (120 + wave*10) : (40 + wave*5)))*(bw-16),0,bw-16);
    ctx.fillRect(bx+8,by+bh-18,hpW,12);
    ctx.restore();
  }

  // draw bullets
  for(const b of bullets){
    if(b.owner === 'player'){
      ctx.save();
      ctx.shadowColor = '#7fffd4';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#baf7e6';
      ctx.fillRect(b.x - b.w/2, b.y, b.w, b.h);
      ctx.restore();
      ctx.fillStyle = 'rgba(127,255,214,0.06)'; ctx.fillRect(b.x - b.w, b.y-6, b.w*2, b.h+12);
    } else {
      ctx.fillStyle = '#ffb3b3'; ctx.fillRect(b.x - (b.w||6)/2, b.y, (b.w||6), (b.h||12));
    }
  }

  for(const p of particles){
    const lifeRatio = 1 - (p.t / p.life);
    if(lifeRatio <= 0) continue;
    ctx.globalAlpha = lifeRatio;
    if(p.glow){
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.col;
    } else ctx.shadowBlur = 0;
    ctx.fillStyle = p.col;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r * 1.4, p.r * 1.4, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  ctx.save();
  const cx = player.x + player.w/2, cy = player.y + player.h/2;
  const tilt = clamp((mouseX - cx) * 0.002, -0.6, 0.6);
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.fillStyle = 'rgba(111,255,230,0.06)'; ctx.beginPath(); ctx.ellipse(0,12,44,22,0,0,Math.PI*2); ctx.fill();
  ctx.shadowColor = '#dff6f0'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#dff6f0';
  ctx.beginPath();
  ctx.moveTo(0,-18);
  ctx.lineTo(14,12);
  ctx.lineTo(6,6);
  ctx.lineTo(-6,6);
  ctx.lineTo(-14,12);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#083'; ctx.beginPath(); ctx.arc(0,-4,4,0,Math.PI*2); ctx.fill();
  if(player.shield){
    ctx.strokeStyle = 'rgba(111,255,214,0.28)';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0,0,34,30,0,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(10, 10, 220, 34);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '12px sans-serif';
  ctx.fillText(`Score: ${Math.floor(score)}   Lives: ${lives}   Kills: ${kills}/${KILL_GOAL}`, 16, 32);
}

// ---------------------- MAIN LOOP -------------------------
function loop(ts){
  if(!lastTime) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;
  if(running) update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ---------------------- START / PAUSE / RESTART / OVERLAY -------------------------
startBtn.addEventListener('click', ()=>{ if(!running){ running = true; lastTime = 0; } });
pauseBtn.addEventListener('click', ()=>{ running = !running; pauseBtn.textContent = running ? 'Pause' : 'Resume'; if(running) lastTime = 0; });
restartBtn.addEventListener('click', ()=>{ resetGame(); running = true; lastTime = 0; hideOverlay(); });

overlayRestart.addEventListener('click', ()=>{ resetGame(); running = true; hideOverlay(); lastTime = 0; });

// initial reset
resetGame();
requestAnimationFrame(loop);

// Expose functions and variables for testing
window.spawnEnemy = spawnEnemy;
window.spawnBoss = spawnBoss;
window.spawnPower = spawnPower;
window.aabb = aabb;
window.showOverlay = showOverlay;
window.hideOverlay = hideOverlay;
window.updateHUD = updateHUD;
window.resetGame = resetGame;
window.winGame = winGame;
window.loseGame = loseGame;
window.laserFX = laserFX;
window.explodeFX = explodeFX;
window.victoryFX = victoryFX;
window.defeatFX = defeatFX;
window.lifeLostFX = lifeLostFX;
window.beep = beep;
window.player = player;
window.bullets = bullets;
window.enemies = enemies;
window.powerups = powerups;
window.particles = particles;
window.boss = boss;
window.bossActive = bossActive;
window.mouseX = mouseX;
window.mouseDown = mouseDown;
window.gameOver = gameOver;
window.powerupActive = powerupActive;
window.score = score;
window.lives = lives;
window.kills = kills;
window.wave = wave;

// ====== EXPORT FOR TESTING ======
if (typeof window !== "undefined") {
  window.spawnEnemy = typeof spawnEnemy === "function" ? spawnEnemy : () => {};
  window.spawnPower = typeof spawnPower === "function" ? spawnPower : () => {};
  window.aabb = typeof aabb === "function" ? aabb : () => false;
  window.resetGame = typeof resetGame === "function" ? resetGame : () => {};

  window.clientToCanvasX = typeof clientToCanvasX === "function" ? clientToCanvasX : (x) => x;
  window.clientToCanvasY = typeof clientToCanvasY === "function" ? clientToCanvasY : (y) => y;

  window.fireBullet = typeof fireBullet === "function" ? fireBullet : () => {};
  window.spawnBoss = typeof spawnBoss === "function" ? spawnBoss : () => {};
  window.takeDamage = typeof takeDamage === "function" ? takeDamage : () => {};
  window.applyPowerUp = typeof applyPowerUp === "function" ? applyPowerUp : () => {};

  window.pauseGame = typeof pauseGame === "function" ? pauseGame : () => {};
  window.resumeGame = typeof resumeGame === "function" ? resumeGame : () => {};
  window.levelUpWave = typeof levelUpWave === "function" ? levelUpWave : () => {};
  window.updateHUD = typeof updateHUD === "function" ? updateHUD : () => {};
}

