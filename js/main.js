// ═══════════════════════════════════════════
// MAIN - Initialization and Parallax System
// ═══════════════════════════════════════════

// ── PARALLAX STAR / BG ASTEROID ENGINE ──
let _parallaxEls  = [];
let _starSpeed    = 0;       // 0 = stopped, ~0.8 = cruise, ~6 = boost
let _starDir      = -1;      // -1 = outbound (stars move left), 1 = return
let _parallaxRaf  = null;

// Seed starfield once
function seedStars() {
  const sf = document.getElementById('starField');
  if (!sf) return;
  sf.innerHTML = '';
  _parallaxEls = [];
  for (let i = 0; i < 90; i++) {
    const s   = document.createElement('div');
    const sz  = Math.random() < 0.15 ? 2 : 1;
    const x   = Math.random() * 100, y = Math.random() * 100;
    const spd = 0.4 + Math.random() * 1.0;
    s.className = 'star';
    s.style.cssText = `width:${sz}px;height:${sz}px;top:${y}%;left:${x}%;opacity:${0.15+Math.random()*0.55};`;
    sf.appendChild(s);
    _parallaxEls.push({ el: s, x, y, spd, type: 'star' });
  }
  seedBgAsteroids();
  if (!_parallaxRaf) _parallaxLoop();
}

function seedBgAsteroids() {
  const af = document.getElementById('asteroidField');
  if (!af) return;
  af.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const img = document.createElement('img');
    const sz  = 16 + Math.random() * 36;
    const x   = Math.random() * 100, y = Math.random() * 100;
    const spd = 0.15 + Math.random() * 0.35;
    const rot = Math.random() * 360, rotSpd = (Math.random() - 0.5) * 0.4;
    img.className = 'bg-asteroid';
    img.src = 'img/asteroid_mini.png';
    img.style.cssText = `width:${sz}px;top:${y}%;left:${x}%;transform:rotate(${rot}deg);`;
    af.appendChild(img);
    _parallaxEls.push({ el: img, x, y, spd, rot, rotSpd, type: 'asteroid' });
  }
}

function _parallaxLoop() {
  if (_starSpeed > 0) {
    const effective = _boostActive ? _starSpeed * 7 : _starSpeed;
    _parallaxEls.forEach(p => {
      p.x += effective * p.spd * _starDir;
      if (_starDir === -1 && p.x < -15) p.x = 115;
      if (_starDir ===  1 && p.x > 115) p.x = -15;
      if (p.type === 'asteroid') {
        p.rot += p.rotSpd;
        p.el.style.transform = `rotate(${p.rot}deg)`;
      }
      p.el.style.left = `${p.x}%`;
    });
  }
  _parallaxRaf = requestAnimationFrame(_parallaxLoop);
}

function setStarSpeed(target, rampMs) {
  if (rampMs <= 0) { _starSpeed = target; return; }
  const start   = _starSpeed;
  const diff    = target - start;
  const startT  = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startT) / rampMs);
    _starSpeed = start + diff * t;
    if (t < 1) requestAnimationFrame(step);
    else _starSpeed = target;
  }
  requestAnimationFrame(step);
}

// ── INITIALIZATION ──
document.addEventListener('DOMContentLoaded', function() {
  console.log('[main.js] Initializing Space Ore Mining Simulator...');

  // Initialize parallax system
  seedStars();

  // Initialize other systems (stubs for now)
  console.log('[main.js] Initialization complete');
});
// - Loading mini-game
// - Scene zoom/animation

// ═══════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  seedStars();
  updateWallet();
  updateFuelUI();
  updateAll();
  
  // Try restore existing Supabase session
  const restored = await tryRestoreSession();
  if (!restored) {
    // Force auth modal if no session
    document.getElementById('gameLock').style.display = 'block';
    document.getElementById('authModal').style.display = 'flex';
  } else {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('gameLock').style.display = 'none';
    document.getElementById('authUserBox').style.display = 'flex';
  }

  // Load initial market prices
  await loadMarketPrices();
  
  // Load encounters
  loadEncounters().catch(err => console.error('Failed to load encounters:', err));

  // Load shop
  loadShop();

  // Schedule first news event
  setTimeout(fireNextNewsEvent, 5000);
});
