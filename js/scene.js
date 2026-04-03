// ═══════════════════════════════════════════
// SCENE — Parallax starfield, bg asteroids, boost system
// ═══════════════════════════════════════════

// ── SHIP IMAGE ──
const SHIP_OFF   = 'img/Ship_0.png';   // engine off — docked, mining, stranded
const SHIP_ON    = 'img/Ship_1.png';   // engine on  — flying
const SHIP_BOOST = ['img/Ship_2.png', 'img/Ship_3.png', 'img/Ship_4.png']; // boost frames

let _boostFrameTimer = null;
let _boostFrameIdx   = 0;

function setShipImage(src) {
  const ship = document.getElementById('minerShip');
  if (ship) ship.src = src;
}

function startBoostSprite() {
  _boostFrameIdx = 0;
  setShipImage(SHIP_BOOST[0]);
  clearInterval(_boostFrameTimer);
  _boostFrameTimer = setInterval(() => {
    _boostFrameIdx = (_boostFrameIdx + 1) % SHIP_BOOST.length;
    setShipImage(SHIP_BOOST[_boostFrameIdx]);
  }, 80); // ~12 fps
}

function stopBoostSprite() {
  clearInterval(_boostFrameTimer);
  _boostFrameTimer = null;
}

// ── PARALLAX STATE ──
let _parallaxEls  = [];
let _starSpeed    = 0;       // 0 = stopped, ~0.8 = cruise, ~6 = boost
let _starDir      = -1;      // -1 = outbound (stars move left), 1 = return
let _parallaxRaf  = null;

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
    img.src = 'https://morb1ddonk.github.io/spaceorepra/img/asteroid_mini.png';
    img.style.cssText = `width:${sz}px;top:${y}%;left:${x}%;transform:rotate(${rot}deg);`;
    af.appendChild(img);
    _parallaxEls.push({ el: img, x, y, spd, rot, rotSpd, type: 'asteroid' });
  }
}

function _parallaxLoop() {
  if (_starSpeed > 0) {
    _parallaxEls.forEach(p => {
      // Asteroids move at a fixed slow fraction of star speed so they never race
      const effective = p.type === 'asteroid' ? Math.min(_starSpeed * 0.12, 0.18) : _starSpeed;
      p.x += effective * p.spd * _starDir;
      // Wrap
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
  const start  = _starSpeed;
  const diff   = target - start;
  const startT = performance.now();
  function step(now) {
    const t = Math.min(1, (now - startT) / rampMs);
    _starSpeed = start + diff * t;
    if (t < 1) requestAnimationFrame(step);
    else _starSpeed = target;
  }
  requestAnimationFrame(step);
}

// ── PHASE SCHEDULER ──
// Tracks a single active transit leg. Exposes phaseEtaMs() for the timer display.
// Boost adds a 1.5× speed multiplier for 3 seconds, consuming ETA faster,
// then auto-deactivates.

let _phaseTimeoutId  = null;
let _phaseStartMs    = 0;    // wall-clock when current timeout was set
let _phaseRemainsMs  = 0;    // ETA remaining at that moment (real ms)
let _phaseCb         = null;
let _boostSpeedMult  = 1;    // 1 = normal, 1.5 = boosted
let _boostAccelTimer = null; // auto-deactivate after 3 real seconds

function schedulePhase(cb, ms) {
  clearTimeout(_phaseTimeoutId);
  _phaseStartMs   = performance.now();
  _phaseRemainsMs = ms;
  _phaseCb        = cb;
  _phaseTimeoutId = setTimeout(() => { _phaseTimeoutId = null; _phaseCb = null; cb(); }, ms);
}

// Returns estimated ETA remaining in ms, accounting for boost speed
function phaseEtaMs() {
  if (!_phaseTimeoutId) return 0;
  const wallElapsed = performance.now() - _phaseStartMs;
  const etaConsumed = wallElapsed * _boostSpeedMult;
  return Math.max(0, _phaseRemainsMs - etaConsumed);
}

function clearScheduledPhase() {
  clearTimeout(_phaseTimeoutId);
  clearTimeout(_boostAccelTimer);
  _phaseTimeoutId = null;
  _phaseCb        = null;
  _boostSpeedMult = 1;
}

// Activate 1.5× speed for 3 seconds — reschedules the phase timeout accordingly
function boostCutPhase() {
  if (!_phaseTimeoutId || !_phaseCb) return;

  // Snapshot remaining ETA right now
  const remaining = phaseEtaMs();
  if (remaining <= 800) return; // too close to arrival, skip

  _boostSpeedMult = 1.5;

  // How long does it take at 1.5× to burn 3 real seconds of boost?
  // In 3 wall-seconds, we consume 4.5 ETA-seconds worth. Then revert to 1×.
  const BOOST_WALL_MS  = 3000;
  const etaBurned      = BOOST_WALL_MS * _boostSpeedMult; // 4500 ETA-ms consumed
  const afterBoostEta  = Math.max(800, remaining - etaBurned);

  // Reschedule: phase fires after boost window + remaining post-boost time
  clearTimeout(_phaseTimeoutId);
  const cb = _phaseCb;
  _phaseStartMs   = performance.now();
  _phaseRemainsMs = remaining;

  // After 3 wall-seconds revert multiplier; phase timer = boost window + post-boost at 1×
  _boostAccelTimer = setTimeout(() => {
    _boostSpeedMult = 1;
    // Reschedule phase for the remaining post-boost ETA (real ms = eta remaining at 1×)
    const nowRemaining = phaseEtaMs(); // recalc at revert moment
    clearTimeout(_phaseTimeoutId);
    _phaseStartMs   = performance.now();
    _phaseRemainsMs = nowRemaining;
    _phaseTimeoutId = setTimeout(() => { _phaseTimeoutId = null; _phaseCb = null; cb(); },
      nowRemaining);
  }, BOOST_WALL_MS);

  // Set a timeout for the full journey (boost window + post-boost) so it fires correctly
  // even if the accel timer fires slightly late
  _phaseTimeoutId = setTimeout(() => {
    clearTimeout(_boostAccelTimer);
    _boostSpeedMult = 1;
    _phaseTimeoutId = null;
    _phaseCb        = null;
    cb();
  }, BOOST_WALL_MS + afterBoostEta);
}

// ── BOOST STATE ──
let _boostActive    = false;
let _boostCount     = 0;       // consumable charges (from shop)
let _boostTimeoutId = null;

function toggleBoost() {
  if (_boostCount <= 0) {
    showShopPurchaseToast('No boost charges — buy one from the shop!', 'var(--red)');
    return;
  }
  if (!dispatchInterval) {
    showShopPurchaseToast('Boost only works while miner is in transit.', 'var(--text-dim)');
    return;
  }
  // Only allow during outbound or return (not mining)
  const status = document.getElementById('dispatchStatus')?.textContent;
  if (status === 'Mining') {
    showShopPurchaseToast('Boost unavailable during extraction.', 'var(--text-dim)');
    return;
  }

  _boostActive = true;
  _boostCount--;

  const canvas  = document.getElementById('spaceCanvas');
  const overlay = document.getElementById('mineStatusOverlay');
  const btn     = document.getElementById('boostEngineBtn');

  canvas.classList.add('scene-boosting');
  setStarSpeed(3.0, 600); // smooth ramp to warp speed
  startBoostSprite();
  boostCutPhase(); // 1.5× ETA speed for 3 seconds

  // Shorten ship CSS transition to reflect higher speed visually
  const ship = document.getElementById('minerShip');
  if (ship) ship.style.transitionDuration = '0s';

  if (overlay) { overlay.style.color = '#fff'; overlay.textContent = '◈ BOOST ACTIVE — BURNING HOT'; }
  if (btn) {
    btn.textContent       = `◈ BOOST ACTIVE`;
    btn.style.borderColor = '#fff';
    btn.style.color       = '#fff';
    btn.style.background  = 'rgba(255,255,255,.12)';
  }

  updateBoostBtn();

  // Auto-deactivate visuals after 3 seconds (phase timer handles arrival)
  clearTimeout(_boostTimeoutId);
  _boostTimeoutId = setTimeout(() => deactivateBoost(), 3000);
}

function deactivateBoost() {
  if (!_boostActive) return;
  _boostActive = false;
  clearTimeout(_boostTimeoutId);

  const canvas = document.getElementById('spaceCanvas');
  canvas.classList.remove('scene-boosting');
  stopBoostSprite();
  // Return to engine-on image if still flying, otherwise engine-off
  setShipImage(dispatchInterval ? SHIP_ON : SHIP_OFF);

  // Return star speed to cruise if still in transit
  if (dispatchInterval) setStarSpeed(0.8, 800);

  const overlay = document.getElementById('mineStatusOverlay');
  if (overlay) { overlay.style.color = 'var(--orange)'; overlay.textContent = '◈ Boost expired'; }

  updateBoostBtn();
}

function updateBoostBtn() {
  const btn = document.getElementById('boostEngineBtn');
  if (!btn) return;
  if (_boostActive) return; // already styled by toggleBoost
  btn.textContent       = _boostCount > 0 ? `⚡ Boost Engines (${_boostCount} charge)` : '⬡ Boost Engines (0 left)';
  btn.style.borderColor = _boostCount > 0 ? 'rgba(255,255,255,.5)' : '';
  btn.style.color       = _boostCount > 0 ? 'var(--text-bright)' : '';
  btn.style.background  = 'transparent';
}

function addBoostCharge(n = 1) {
  _boostCount += n;
  updateBoostBtn();
}
