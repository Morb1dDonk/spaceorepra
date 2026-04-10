// ═══════════════════════════════════════════
// SCENE — Parallax starfield, bg asteroids, boost system
// ═══════════════════════════════════════════

// ── PLAYER SHIP SPRITE SHEET ──
// img/sprite_sheet.png — 3 rows × 30 frames, 200×150px each frame, 6000×450px total
// Row 0 (top):    inbound flight  — looping, returning to station
// Row 1 (middle): outbound flight — looping, flying to asteroid
// Row 2 (bottom): turnaround      — one-shot, plays when leaving asteroid to head home
const SHIP_SHEET_URL    = 'img/sprite_sheet.png';
const SHIP_FRAME_W      = 200;
const SHIP_FRAME_H      = 150;
const SHIP_COLS         = 30;
const SHIP_ROW_INBOUND  = 0;
const SHIP_ROW_OUTBOUND = 1;
const SHIP_ROW_TURN     = 2;
const SHIP_DISP_W       = 80;
const SHIP_DISP_H       = Math.round(SHIP_DISP_W * SHIP_FRAME_H / SHIP_FRAME_W); // 60
const SHIP_BG_W         = SHIP_COLS * SHIP_DISP_W;  // 2400
const SHIP_BG_H         = 3 * SHIP_DISP_H;          // 180

let _shipRow    = SHIP_ROW_OUTBOUND;
let _shipRaf    = null;
let _shipCol    = 0;
let _shipFPS    = 15;
let _shipLoop   = true;
let _shipLastMs = 0;
let _shipDoneCb = null;

function _applyShipFrame(row, col) {
  const el = document.getElementById('minerShip');
  if (!el) return;
  el.style.backgroundImage    = `url('${SHIP_SHEET_URL}')`;
  el.style.backgroundSize     = `${SHIP_BG_W}px ${SHIP_BG_H}px`;
  el.style.backgroundRepeat   = 'no-repeat';
  el.style.backgroundPosition = `-${col * SHIP_DISP_W}px -${row * SHIP_DISP_H}px`;
}

function _shipAnimTick(now) {
  if (!_shipRaf) return;
  if (now - _shipLastMs >= 1000 / _shipFPS) {
    _shipLastMs = now;
    _shipCol++;
    if (_shipCol >= SHIP_COLS) {
      if (_shipLoop) {
        _shipCol = 0;
      } else {
        // One-shot complete — freeze on last frame and fire callback
        _applyShipFrame(_shipRow, SHIP_COLS - 1);
        cancelAnimationFrame(_shipRaf);
        _shipRaf = null;
        if (_shipDoneCb) { const cb = _shipDoneCb; _shipDoneCb = null; cb(); }
        return;
      }
    }
    _applyShipFrame(_shipRow, _shipCol);
  }
  _shipRaf = requestAnimationFrame(_shipAnimTick);
}

function _startShipAnim(row, fps, loop, onDone) {
  cancelAnimationFrame(_shipRaf);
  _shipRow    = row;
  _shipCol    = 0;
  _shipFPS    = fps || 15;
  _shipLoop   = loop !== false;
  _shipDoneCb = onDone || null;
  _shipLastMs = 0;
  _applyShipFrame(row, 0);
  _shipRaf = requestAnimationFrame(_shipAnimTick);
}

function _stopShipAnim() {
  cancelAnimationFrame(_shipRaf);
  _shipRaf = null;
}

// ── Public ship sprite API ──

// Set facing direction without changing animation state
function shipSetOutbound() { _shipRow = SHIP_ROW_OUTBOUND; }
function shipSetInbound()  { _shipRow = SHIP_ROW_INBOUND;  }

// Engines off: freeze on frame 0 of current direction row
function shipEnginesOff() {
  _stopShipAnim();
  _applyShipFrame(_shipRow, 0);
}

// Engines on: loop current direction row at normal speed
function shipEnginesOn() {
  _startShipAnim(_shipRow, 15, true);
}

// Play one-shot turnaround animation, then loop inbound
function shipTurnaroundThenInbound() {
  _shipRow = SHIP_ROW_INBOUND;
  _startShipAnim(SHIP_ROW_TURN, 15, false, () => {
    _startShipAnim(SHIP_ROW_INBOUND, 15, true);
  });
}

// Boost: speed up animation frames
function startBoostSprite() {
  _startShipAnim(_shipRow, 30, true);
}

function stopBoostSprite() {
  if (_shipRaf) _startShipAnim(_shipRow, 15, true);
}

// Backward-compat: called from index.html to start outbound flight animation
function startShipCSprite() {
  shipSetOutbound();
  shipEnginesOn();
}

// Backward-compat: called from index.html to stop flight animation
function stopShipCSprite() {
  shipEnginesOff();
}

// ── PARALLAX STATE ──
let _parallaxEls  = [];
let _starSpeed    = 0;       // 0 = stopped, ~0.8 = cruise, ~6 = boost
let _starDir      = -1;      // -1 = outbound (stars move left), 1 = return
let _parallaxRaf  = null;

// Nebula blobs: [cx%, cy%, rx%, ry%, color, alpha]
const _NEBULA_BLOBS = [
  [0.18, 0.35, 0.38, 0.55, '60,20,140',   0.13],  // deep violet — upper left
  [0.55, 0.20, 0.42, 0.40, '0,80,200',    0.10],  // cold blue — top centre
  [0.78, 0.60, 0.35, 0.50, '160,30,80',   0.11],  // magenta — right
  [0.35, 0.75, 0.50, 0.40, '0,130,160',   0.09],  // teal — lower centre
  [0.62, 0.45, 0.30, 0.45, '120,40,180',  0.08],  // purple mid
];

function paintSceneNebula() {
  const canvas = document.getElementById('nebulaCanvas');
  if (!canvas) return;
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const W = parent.offsetWidth, H = parent.offsetHeight;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  _NEBULA_BLOBS.forEach(([cx, cy, rx, ry, rgb, alpha]) => {
    const g = ctx.createRadialGradient(cx*W, cy*H, 0, cx*W, cy*H, Math.max(rx*W, ry*H));
    g.addColorStop(0,   `rgba(${rgb},${alpha})`);
    g.addColorStop(0.5, `rgba(${rgb},${alpha * 0.4})`);
    g.addColorStop(1,   `rgba(${rgb},0)`);
    ctx.save();
    ctx.scale(1, (ry * H) / (rx * W)); // squash to ellipse
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx * W, (cy * H) / ((ry * H) / (rx * W)), rx * W, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function seedStars() {
  const sf = document.getElementById('starField');
  if (!sf) return;
  sf.innerHTML = '';
  _parallaxEls = [];
  paintSceneNebula();
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

let _phaseTimeoutId = null;
let _phaseStartMs   = 0;    // wall-clock when current timeout was set
let _phaseRemainsMs = 0;    // ETA remaining at that moment (real ms)
let _phaseCb        = null;
let _boostSpeedMult = 1;    // 1 = normal, >1 = mid-boost (for ETA display interpolation)

function schedulePhase(cb, ms) {
  clearTimeout(_phaseTimeoutId);
  _phaseStartMs   = performance.now();
  _phaseRemainsMs = ms;
  _phaseCb        = cb;
  _phaseTimeoutId = setTimeout(() => { _phaseTimeoutId = null; _phaseCb = null; cb(); }, ms);
}

// Returns estimated ETA remaining in ms
function phaseEtaMs() {
  if (!_phaseTimeoutId) return 0;
  const elapsed = performance.now() - _phaseStartMs;
  return Math.max(0, _phaseRemainsMs - elapsed * _boostSpeedMult);
}

function clearScheduledPhase() {
  clearTimeout(_phaseTimeoutId);
  _phaseTimeoutId = null;
  _phaseCb        = null;
  _boostSpeedMult = 1;
}

// Halve the remaining transit time and reschedule the phase arrival
function boostCutPhase() {
  if (!_phaseTimeoutId || !_phaseCb) return;
  const remaining = phaseEtaMs();
  if (remaining <= 800) return; // too close, skip
  const newDelay  = Math.max(500, remaining / 2);
  clearTimeout(_phaseTimeoutId);
  const cb        = _phaseCb;
  _phaseStartMs   = performance.now();
  _phaseRemainsMs = newDelay;
  _boostSpeedMult = 1;
  _phaseTimeoutId = setTimeout(() => { _phaseTimeoutId = null; _phaseCb = null; cb(); }, newDelay);
}

// ── BOOST STATE ──
let _boostActive    = false;
let _boostCount     = 0;
let _boostTimeoutId = null;
let _inFlightPhase  = false; // true only during the boostable FLIGHT_MS transit windows

function toggleBoost() {
  if (_boostCount <= 0) {
    showShopPurchaseToast('No boost charges — buy one from the shop!', 'var(--red)');
    return;
  }
  if (!_inFlightPhase) {
    const msg = !dispatchInterval
      ? 'Boost only works while miner is in transit.'
      : 'Boost unavailable during docking, approach, or extraction.';
    showShopPurchaseToast(msg, 'var(--text-dim)');
    return;
  }

  // Complete the current flight phase right when the boost animation ends
  const BOOST_ANIM_MS = 1500;
  if (_phaseTimeoutId && _phaseCb) {
    clearTimeout(_phaseTimeoutId);
    const cb = _phaseCb;
    _phaseStartMs   = performance.now();
    _phaseRemainsMs = BOOST_ANIM_MS;
    _boostSpeedMult = 1;
    _phaseTimeoutId = setTimeout(() => { _phaseTimeoutId = null; _phaseCb = null; cb(); }, BOOST_ANIM_MS);
  }
  const timeSaved = BOOST_ANIM_MS;

  _boostActive = true;
  _boostCount--;

  // Remove one boost charge from the persistent inventory
  if (typeof shopItems !== 'undefined' && typeof playerInventory !== 'undefined') {
    const boostItem = shopItems.find(i => i.effect_key === 'boost' || i.item_type === 'boost');
    if (boostItem) {
      const idx = playerInventory.indexOf(boostItem.id);
      if (idx !== -1) { playerInventory.splice(idx, 1); }
    }
  }
  if (typeof persistProgress === 'function') persistProgress();

  const canvas  = document.getElementById('spaceCanvas');
  const overlay = document.getElementById('mineStatusOverlay');
  const btn     = document.getElementById('boostEngineBtn');
  const ship    = document.getElementById('minerShip');

  // ── Warp flash — white vignette that punches in then fades ──
  _boostWarpFlash();

  canvas.classList.add('scene-boosting');
  setStarSpeed(4.0, 300);  // fast ramp up
  startBoostSprite();

  // Engine glow behind ship
  _boostShowGlow(true);

  if (ship) ship.style.transitionDuration = '0s';
  if (overlay) { overlay.style.color = '#fff'; overlay.textContent = '◈ BOOST ACTIVE'; }
  if (btn) {
    btn.textContent       = '◈ BOOST ACTIVE';
    btn.style.borderColor = '#fff';
    btn.style.color       = '#fff';
    btn.style.background  = 'rgba(255,255,255,.12)';
  }
  updateBoostBtn();

  // Visuals last for the time saved (feels proportional), min 1.5s
  clearTimeout(_boostTimeoutId);
  _boostTimeoutId = setTimeout(() => deactivateBoost(), timeSaved);
}

function deactivateBoost() {
  if (!_boostActive) return;
  _boostActive = false;
  clearTimeout(_boostTimeoutId);

  const canvas = document.getElementById('spaceCanvas');
  canvas.classList.remove('scene-boosting');
  stopBoostSprite();
  _boostShowGlow(false);
  if (dispatchInterval) shipEnginesOn(); else shipEnginesOff();

  // Ramp stars back to cruise
  if (dispatchInterval) setStarSpeed(0.8, 1200);

  const overlay = document.getElementById('mineStatusOverlay');
  if (overlay) { overlay.style.color = 'var(--orange)'; overlay.textContent = '◈ Boost complete'; }

  updateBoostBtn();
}

// White vignette flash on warp activation
function _boostWarpFlash() {
  let flash = document.getElementById('_boostFlash');
  if (!flash) {
    flash = document.createElement('div');
    flash.id = '_boostFlash';
    flash.style.cssText = 'position:absolute;inset:0;z-index:80;pointer-events:none;background:radial-gradient(ellipse at center,rgba(180,220,255,.55) 0%,rgba(0,100,255,.15) 50%,transparent 75%);opacity:0;transition:opacity 0s;';
    const canvas = document.getElementById('spaceCanvas');
    if (canvas) canvas.appendChild(flash);
  }
  flash.style.transition = 'opacity 0s';
  flash.style.opacity    = '1';
  setTimeout(() => { flash.style.transition = 'opacity 1.2s ease'; flash.style.opacity = '0'; }, 60);
}

// Cyan engine glow orb that trails the ship
function _boostShowGlow(visible) {
  let glow = document.getElementById('_boostGlow');
  if (!glow) {
    glow = document.createElement('div');
    glow.id = '_boostGlow';
    glow.style.cssText = 'position:absolute;top:50%;z-index:9;pointer-events:none;width:60px;height:60px;border-radius:50%;transform:translateY(-50%);background:radial-gradient(circle,rgba(0,212,255,.55) 0%,rgba(0,150,255,.2) 40%,transparent 70%);opacity:0;transition:opacity 0.4s ease;';
    const inner = document.getElementById('sceneInner');
    if (inner) inner.appendChild(glow);
  }
  // Position: just behind the ship (ship is at left:50%, glow trails ~30px behind)
  const ship = document.getElementById('minerShip');
  if (ship) {
    const shipLeft  = parseFloat(ship.style.left) || 50;
    const trailDir  = _starDir === -1 ? 1 : -1; // trail opposite to travel direction
    glow.style.left = `calc(${shipLeft}% + ${trailDir * 18}px)`;
  }
  glow.style.opacity = visible ? '1' : '0';
}

function updateBoostBtn() {
  const btn = document.getElementById('boostEngineBtn');
  if (!btn) return;

  if (_boostActive) {
    // Mid-boost — already set by toggleBoost, leave it alone
    return;
  }

  if (!_inFlightPhase) {
    btn.textContent       = '⬡ BOOST DEACTIVATED';
    btn.disabled          = true;
    btn.style.borderColor = 'rgba(255,255,255,.1)';
    btn.style.color       = 'var(--text-dim)';
    btn.style.background  = 'transparent';
    btn.style.opacity     = '0.45';
    return;
  }

  // In flight phase — show charge state
  btn.disabled = false;
  btn.style.opacity = '1';
  if (_boostCount > 0) {
    btn.textContent       = `⚡ BOOST ACTIVE (${_boostCount} charge)`;
    btn.style.borderColor = 'rgba(255,255,255,.5)';
    btn.style.color       = 'var(--text-bright)';
    btn.style.background  = 'transparent';
  } else {
    btn.textContent       = '⬡ BOOST ACTIVE (0 charges)';
    btn.style.borderColor = 'rgba(255,255,255,.2)';
    btn.style.color       = 'var(--text-dim)';
    btn.style.background  = 'transparent';
  }
}

function addBoostCharge(n = 1) {
  _boostCount += n;
  updateBoostBtn();
}
