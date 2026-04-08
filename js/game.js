// ═══════════════════════════════════════════
// GAME LOGIC - Dispatch, Mining, Haul Generation
// ═══════════════════════════════════════════

// ── CONSTANTS ──
const DISPATCH_MS = 60000; // 1 minute (could be made configurable)
const MINE_PHASES = [
  'Undocking from Refinery Station...',
  'Plotting course to asteroid field...',
  'Engaging thrusters...',
  'Approaching target zone...',
  'Scanning asteroid signatures...',
  'Target acquired — locking approach...',
  'Decelerating for docking...',
  'Drill assembly deploying...',
  'Extraction in progress...',
  'Securing ore — returning home...',
];

const MINING_LABELS = [
  'Drilling into asteroid surface...',
  'Core sample extraction...',
  'Ore vein located — expanding drill...',
  'Loading ore into cargo hold...',
  'Secondary deposit detected...',
  'Hold capacity approaching...',
  'Securing cargo containers...',
  'Extraction complete — sealing hold...',
];

const MAX_HAUL_SCU = 48;
const FUEL_MAX = 100;
const FUEL_TRIP_MIN = 15;   // lightest possible one-way leg
const FUEL_TRIP_MAX = 35;   // heaviest possible one-way leg
const TOW_COST = 5000;

// ── STATE ──
let haul = []; // [{ matKey, scu, purity, refine:true }]
let dispatchInterval = null;
let fuelDrainInterval = null;
let encounterResumeFn = null;
let activeEncounter = null;
let encounterPool = [];
let seenEncounters = new Set(JSON.parse(localStorage.getItem('seenEncounters') || '[]'));
let encounterHaulMods = { orePctLoss:0, oreBonus:0, qualityBoost:false, shipDamage:0, fuelLoss:0, lostAll:false };

// ── FUEL SYSTEM ──
let minerFuel = 100;

// Roll random fuel cost for this trip (called at dispatch time)
function rollTripFuel() {
  return Math.round(FUEL_TRIP_MIN + Math.random() * (FUEL_TRIP_MAX - FUEL_TRIP_MIN));
}

// Live fuel price per unit — reads from materials object (updated from Supabase)
function getFuelPrice() {
  return materials.fuel?.currentVal || materials.fuel?.baseVal || 45;
}

function getFuelRefuelCost() {
  return Math.round((FUEL_MAX - minerFuel) * getFuelPrice());
}

function updateFuelUI() {
  const pct        = (minerFuel / FUEL_MAX) * 100;
  const isFull     = minerFuel >= FUEL_MAX;
  const refuelCost = getFuelRefuelCost();
  const canAfford  = userWallet >= refuelCost || refuelCost === 0;
  const minTrip    = FUEL_TRIP_MIN;
  const maxTrip    = FUEL_TRIP_MAX;
  const fuelRatio  = Math.min(1, minerFuel / maxTrip);
  const isPartial  = minerFuel > 0 && minerFuel < minTrip;
  const pricePerUnit = getFuelPrice();
  const tripCostMin = Math.round(minTrip * pricePerUnit);
  const tripCostMax = Math.round(maxTrip * pricePerUnit);

  document.getElementById('fuelBar').style.width = pct + '%';
  document.getElementById('fuelBar').style.background =
    pct > 50 ? 'linear-gradient(90deg,#166534,#22c55e)'
    : pct > 20 ? 'linear-gradient(90deg,#854d0e,#d97706)'
    : 'linear-gradient(90deg,#7f1d1d,#dc2626)';

  document.getElementById('fuelCurrent').textContent = Math.round(minerFuel);
  document.getElementById('fuelRefuelCost').textContent =
    isFull ? 'Tank full' : refuelCost.toLocaleString() + ' GC';
  document.getElementById('fuelTripCost').textContent =
    `${minTrip}–${maxTrip} units · ${tripCostMin.toLocaleString()}–${tripCostMax.toLocaleString()} GC`;

  // Refuel button
  const refuelBtn = document.getElementById('refuelBtn');
  const neededUnits = FUEL_MAX - Math.round(minerFuel);
  const isFlight = !!dispatchInterval || !!fuelDrainInterval;
  refuelBtn.disabled = isFull || !canAfford || isFlight;
  refuelBtn.style.opacity = (isFull || !canAfford || isFlight) ? '0.35' : '1';
  refuelBtn.textContent = isFull
    ? 'Tank Full'
    : `Refuel +${neededUnits} units — ${refuelCost.toLocaleString()} GC`;

  // Status text in header
  const statusEl = document.getElementById('dispatchStatus');
  const isFueling = false; // set externally via setRefuelingStatus()
  if (!isFlight) {
    if (minerFuel <= 0) {
      statusEl.textContent = 'No Fuel';
      statusEl.style.color = 'var(--red)';
    } else if (isPartial) {
      statusEl.textContent = `Low Fuel — ${Math.round(minerFuel)} units`;
      statusEl.style.color = 'var(--orange)';
    } else {
      statusEl.textContent = 'Ready';
      statusEl.style.color = 'var(--orange)';
    }
  }

  // Warning
  const warn = document.getElementById('fuelWarning');
  if (minerFuel <= 0) {
    warn.style.display = 'block'; warn.style.color = 'var(--red)';
    warn.textContent = '⚠ No fuel — miner cannot depart';
  } else if (isPartial) {
    warn.style.display = 'block'; warn.style.color = 'var(--orange)';
    warn.textContent = `⚠ Low fuel — partial haul (~${Math.round(fuelRatio * 100)}% capacity)`;
  } else {
    warn.style.display = 'none';
  }

  document.getElementById('dispatchBtn').disabled = minerFuel <= 0;

  const statusColor = minerFuel <= 0 ? 'var(--red)' : isPartial ? 'var(--orange)' : 'var(--cyan)';
  const statusLabel = minerFuel <= 0 ? 'Empty' : isPartial ? 'Low — partial trip' : 'Ready';
  document.getElementById('dispatchFuelBlock').innerHTML =
    `<span style="color:var(--text-dim)">Trip cost:</span> <span style="color:var(--orange)">${minTrip}–${maxTrip} units</span><br>` +
    `<span style="color:var(--text-dim)">Status:</span> <span style="color:${statusColor}">${statusLabel}</span>`;
}

function refuelMiner() {
  if (minerFuel >= FUEL_MAX) return;
  const cost = getFuelRefuelCost();
  const pricePerUnit = getFuelPrice();
  if (userWallet < pricePerUnit) {
    document.getElementById('fuelWarning').style.display = 'block';
    document.getElementById('fuelWarning').style.color   = 'var(--red)';
    document.getElementById('fuelWarning').textContent   =
      '⚠ Insufficient GC — fuel costs ' + pricePerUnit.toLocaleString() + ' GC/unit';
    return;
  }

  // Show refueling status in header
  const statusEl = document.getElementById('dispatchStatus');
  statusEl.textContent = 'Refueling...';
  statusEl.style.color = '#22c55e';

  if (userWallet < cost) {
    const canBuy = Math.floor(userWallet / pricePerUnit);
    userWallet -= canBuy * pricePerUnit;
    minerFuel   = Math.min(FUEL_MAX, minerFuel + canBuy);
  } else {
    userWallet -= cost;
    minerFuel   = FUEL_MAX;
  }

  updateWallet();
  updateFuelUI();

  // Clear refueling status after brief delay
  setTimeout(() => {
    if (document.getElementById('dispatchStatus').textContent === 'Refueling...') {
      document.getElementById('dispatchStatus').textContent = 'Ready';
      document.getElementById('dispatchStatus').style.color = 'var(--orange)';
    }
  }, 1500);
}

// ── BOOST SYSTEM ──
let _boostActive    = false;
let _boostCount     = 0;       // consumable charges (from shop)
let _boostFuelMult  = 1;       // multiplier applied to fuel drain tick
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
  _boostFuelMult = 1.25; // 25% faster fuel burn while boosting
  _sfx('boost', 'audio/413312__tieswijnen__afterburner.mp3', { volume: 0.7 });

  const canvas  = document.getElementById('spaceCanvas');
  const overlay = document.getElementById('mineStatusOverlay');
  const btn     = document.getElementById('boostEngineBtn');

  canvas.classList.add('scene-boosting');
  setStarSpeed(5.5, 300); // warp speed stars

  // Shorten ship CSS transition to reflect higher speed visually
  const ship = document.getElementById('minerShip');
  if (ship) ship.style.transitionDuration = '0s'; // let the existing left animation compress

  if (overlay) { overlay.style.color = '#fff'; overlay.textContent = '◈ BOOST ACTIVE — BURNING HOT'; }
  if (btn) {
    btn.textContent    = `◈ BOOST ACTIVE`;
    btn.style.borderColor = '#fff';
    btn.style.color    = '#fff';
    btn.style.background  = 'rgba(255,255,255,.12)';
  }

  updateBoostBtn();

  // Auto-deactivate after 8s
  clearTimeout(_boostTimeoutId);
  _boostTimeoutId = setTimeout(() => deactivateBoost(), 8000);
}

function deactivateBoost() {
  if (!_boostActive) return;
  _boostActive   = false;
  _boostFuelMult = 1;
  clearTimeout(_boostTimeoutId);

  const canvas = document.getElementById('spaceCanvas');
  canvas.classList.remove('scene-boosting');

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
  btn.textContent      = _boostCount > 0 ? `⚡ Boost Engines (${_boostCount} charge)` : '⬡ Boost Engines (0 left)';
  btn.style.borderColor = _boostCount > 0 ? 'rgba(255,255,255,.5)' : '';
  btn.style.color       = _boostCount > 0 ? 'var(--text-bright)' : '';
  btn.style.background  = 'transparent';
}

function addBoostCharge(n = 1) {
  _boostCount += n;
  updateBoostBtn();
}

// ── PURITY UPDATE ──
function updatePurity(v) {
  orePurity = parseInt(v);
  const g = getGrade(orePurity);
  document.getElementById('purityVal').textContent = orePurity;
  const chip = document.getElementById('purityChip');
  chip.textContent = g.label;
  chip.style.background = g.color+'33';
  chip.style.color = g.color;
  document.getElementById('puritySlider').style.accentColor = g.color;
}

// ── MINER DISPATCH ──
function dispatchMiner() {
  if (dispatchInterval) return;
  if (minerFuel <= 0) return;

  const tripFuelOneWay = rollTripFuel();  // random 15–35 units per leg
  const fuelRatio  = Math.min(1, minerFuel / tripFuelOneWay);
  const isPartial  = fuelRatio < 1;
  const fuelToUse  = Math.min(minerFuel, tripFuelOneWay);
  const fuelStart  = minerFuel;

  // Fixed 60-second trip: 25s out, 5-10s mining, 25-30s back
  const miningMs   = 5000 + Math.random() * 5000;   // 5–10s
  const transitMs  = (60000 - miningMs) / 2;         // split remainder evenly
  const totalMs    = transitMs + miningMs + transitMs; // always ~60s

  const btn       = document.getElementById('dispatchBtn');
  const refuelBtn = document.getElementById('refuelBtn');
  btn.disabled = true;
  refuelBtn.disabled = true;
  refuelBtn.style.opacity = '0.35';
  const shopBtn = document.getElementById('shopHeaderBtn');
  if (shopBtn) { shopBtn.disabled = true; shopBtn.style.opacity = '0.35'; }

  document.getElementById('dispatchStatus').textContent = isPartial ? `Partial Trip · ${Math.round(fuelToUse)} units` : `In Transit · ${Math.round(fuelToUse)} units`;
  document.getElementById('dispatchStatus').style.color = '';
  document.getElementById('dispatchCountdownWrap').style.display = 'flex';
  document.getElementById('miningBarLabel').textContent = '';
  document.getElementById('miningBarPct').textContent = '0%';
  resetBarrels();
  document.getElementById('dispatchProgress').style.width = '0%';
  document.getElementById('dispatchIdleText').style.display = 'none';
  // Fade out the idle objective overlay
  const idleOverlay = document.getElementById('sceneIdleOverlay');
  if (idleOverlay) { idleOverlay.style.opacity = '0'; idleOverlay.style.pointerEvents = 'none'; }
  sceneZoomOut(); // ensure we start at normal view
  startAsteroidGlitch();

  document.getElementById('manifestCard').style.opacity = '.4';
  document.getElementById('manifestCard').style.pointerEvents = 'none';

  const ship        = document.getElementById('minerShip');
  const asteroid    = document.getElementById('asteroidImg');
  const asteroidObj = document.getElementById('asteroidObj');
  const stationObj  = document.getElementById('stationObj');
  const stationLbl  = document.getElementById('stationLabel');
  const canvas      = document.getElementById('spaceCanvas');

  // Reset scene to docked state instantly
  const si = document.getElementById('sceneInner');
  if (si) { si.style.transition = 'none'; si.style.transform = 'scale(1)'; }

  ship.style.transition = 'none';
  ship.style.transform  = 'translate(-50%,-50%) scaleX(1)';
  ship.style.setProperty('--sx', '1');
  ship.style.opacity    = '1';

  // Station docked at left, asteroid hidden off-screen right
  if (stationObj) { stationObj.style.transition = 'none'; stationObj.style.left = '0px'; }
  if (asteroidObj){ asteroidObj.style.transition = 'none'; asteroidObj.style.right = '-260px'; asteroid.style.opacity = '0.7'; asteroid.style.filter = ''; }
  if (stationLbl) stationLbl.style.opacity = '1';

  canvas.classList.add('scene-flying');

  // Stars fly left (outbound)
  _starDir = -1;
  setStarSpeed(0.8, 1200);

  // Start slow zoom — sceneInner scales to 1.5× over the whole outbound leg
  startSceneZoomIn();

  const overlay = document.getElementById('mineStatusOverlay');
  overlay.style.opacity = '1';
  overlay.textContent   = MINE_PHASES[0];

  // ── PHASE 1: Station slides off left as ship departs ──
  // Ease station out over first 40% of transit
  setTimeout(() => {
    if (stationObj) {
      stationObj.style.transition = `left ${transitMs * 0.5}ms cubic-bezier(0.4,0,1,1)`;
      stationObj.style.left = '-200px';
    }
    if (stationLbl) { stationLbl.style.transition = 'opacity 1s'; stationLbl.style.opacity = '0'; }
    // Asteroid begins drifting into view from right partway through
    setTimeout(() => {
      if (asteroidObj) {
        asteroidObj.style.transition = `right ${transitMs * 0.7}ms cubic-bezier(0.2,0,0.4,1)`;
        asteroidObj.style.right = 'calc(50% - 130px)'; // centre-right next to ship
      }
    }, transitMs * 0.25);
  }, 200);

  // ── Single master countdown ──
  const tripStart = Date.now();
  dispatchInterval = setInterval(() => {
    const elapsed = Date.now() - tripStart;
    const rem     = Math.max(0, totalMs - elapsed);
    const m       = Math.floor(rem / 60000);
    const s       = Math.floor((rem % 60000) / 1000);
    document.getElementById('dispatchCountdown').textContent =
      String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    document.getElementById('dispatchProgress').style.width =
      Math.min(100, (elapsed / totalMs) * 100) + '%';
  }, 200);

  // ── Real-time fuel drain — outbound and return legs ──
  // Total fuel cost = 2× one-way, spread evenly across both transit legs.
  const fuelPerTick = (tripFuelOneWay / (transitMs / 200));
  fuelDrainInterval = setInterval(() => {
    if (encounterResumeFn) return;
    const status = document.getElementById('dispatchStatus').textContent;
    if (status === 'Mining') return;
    minerFuel = Math.max(0, minerFuel - fuelPerTick * _boostFuelMult);
    document.getElementById('fuelBar').style.width = (minerFuel / FUEL_MAX * 100) + '%';
    document.getElementById('fuelCurrent').textContent = Math.round(minerFuel);
    if (minerFuel <= 0 && dispatchInterval) {
      clearInterval(dispatchInterval);
      clearInterval(fuelDrainInterval);
      dispatchInterval  = null;
      fuelDrainInterval = null;
      const _towStatus = document.getElementById('dispatchStatus').textContent;
      window._towContext = {
        fuelRatio,
        isPartial,
        miningComplete: _towStatus === 'Returning'
      };
      triggerTowBack(btn, refuelBtn);
    }
  }, 200);

  let phaseIdx = 0;
  const msgTimer = setInterval(() => {
    phaseIdx = Math.min(phaseIdx + 1, MINE_PHASES.length - 1);
    overlay.textContent = MINE_PHASES[phaseIdx];
  }, transitMs / MINE_PHASES.length);

  // ── PHASE 2: Arrive at asteroid → encounter → mine ──
  setTimeout(() => {
    clearInterval(msgTimer);

    maybeFireEncounter('outbound', () => {
      // Stars stop — ship is stationary at asteroid
      setStarSpeed(0, 800);
      lockSceneOnMidpoint(); // no-op stub, zoom stays at 1.5×
      if (asteroid) {
        asteroid.style.opacity = '1';
        asteroid.style.filter  = 'brightness(1.4) drop-shadow(0 0 6px rgba(232,141,45,.8))';
      }
      document.getElementById('dispatchStatus').textContent = 'Mining';
      revealAsteroidName();
      overlay.textContent = MINING_LABELS[0];
      if (isPartial) {
        document.getElementById('miningBarLabel').textContent =
          `Partial haul (~${Math.round(fuelRatio * 100)}% capacity)`;
      }

      const miningStart = Date.now();
      let labelIdx = 0;
      const labelStep = miningMs / MINING_LABELS.length;
      resetBarrels();

      const miningInterval = setInterval(() => {
        const el  = Date.now() - miningStart;
        const pct = Math.min(100, (el / miningMs) * 100);
        updateBarrels(pct);
        document.getElementById('miningBarPct').textContent = Math.round(pct) + '%';
        const li = Math.floor(el / labelStep);
        if (li !== labelIdx && li < MINING_LABELS.length) {
          labelIdx = li;
          overlay.textContent = MINING_LABELS[li];
          document.getElementById('miningBarLabel').textContent = MINING_LABELS[li];
        }

        if (el >= miningMs) {
          clearInterval(miningInterval);
          updateBarrels(100);
          document.getElementById('miningBarPct').textContent  = '100%';
          document.getElementById('miningBarLabel').textContent = '✓ Hold secured';
          if (asteroid) { asteroid.style.opacity = '0.5'; asteroid.style.filter = ''; }

          // ── PHASE 3: Return — asteroid slides right off, station comes back, zoom out ──
          document.getElementById('dispatchStatus').textContent = 'Returning';
          overlay.textContent = 'Hold secured — returning to station...';
          _starDir = 1;
          ship.style.setProperty('--sx', '-1');
          ship.style.transform = 'translate(-50%,-50%) scaleX(-1)';
          setStarSpeed(0.8, 1000);
          sceneZoomOut();

          // Asteroid slides back off-screen right
          if (asteroidObj) {
            asteroidObj.style.transition = `right ${transitMs * 0.5}ms cubic-bezier(0.6,0,1,1)`;
            asteroidObj.style.right = '-260px';
          }
          // Station slides back in from left
          setTimeout(() => {
            if (stationObj) {
              stationObj.style.transition = `left ${transitMs * 0.6}ms cubic-bezier(0,0,0.3,1)`;
              stationObj.style.left = '0px';
            }
            if (stationLbl) { stationLbl.style.transition = 'opacity 1.5s 0.5s'; stationLbl.style.opacity = '1'; }
          }, transitMs * 0.35);

          // Wait for ship to actually arrive, THEN fire return encounter + complete
          setTimeout(() => {
            // Wrap in try/catch so a broken encounter never leaves the
            // dispatch and fuel-drain intervals running indefinitely.
            try {
              maybeFireEncounter('return', () => {
                // ── ARRIVAL — start offload sequence ──
                clearInterval(dispatchInterval);
                clearInterval(fuelDrainInterval);
                dispatchInterval  = null;
                fuelDrainInterval = null;

                minerFuel = Math.max(0, fuelStart - fuelToUse);
                updateFuelUI();

                // Generate haul now so it's ready
                let rawHaul = generateHaul(fuelRatio);
                rawHaul     = applyHaulMods(rawHaul);
                rawHaul     = applyAsteroidBiasToHaul(rawHaul);
                haul        = rawHaul;
                stopAsteroidGlitch();

                // Stop parallax, clean up animation classes
                setStarSpeed(0, 600);
                deactivateBoost();
                document.getElementById('spaceCanvas').classList.remove('scene-flying', 'scene-boosting', 'scene-drifting');
                // Reset foreground objects
                const _so = document.getElementById('stationObj');
                const _ao = document.getElementById('asteroidObj');
                if (_so) { _so.style.transition = 'none'; _so.style.left = '0px'; }
                if (_ao) { _ao.style.transition = 'none'; _ao.style.right = '-260px'; }

                // Hide ship, hide countdown
                ship.style.opacity = '0';
                document.getElementById('dispatchCountdownWrap').style.display = 'none';
                document.getElementById('dispatchIdleText').style.display = 'none';

                // Start offload visual
                startOffloadSequence(haul, () => {
                  // ── OFFLOAD COMPLETE — now unlock ──
                  renderManifest();
                  overlay.textContent = '✓ Manifest ready';
                  overlay.style.opacity = '1';
                  document.getElementById('dispatchStatus').textContent = 'Docked';
                  document.getElementById('dispatchStatus').style.color = 'var(--cyan)';
                  document.getElementById('dispatchIdleText').style.display = 'none';
                  const _io = document.getElementById('sceneIdleOverlay'); if (_io) { _io.style.opacity = '1'; }

                  btn.disabled          = false;
                  btn.textContent       = '⬡ Send Again';
                  refuelBtn.disabled    = false;
                  refuelBtn.style.opacity = '1';
                  const _sb2 = document.getElementById('shopHeaderBtn'); if (_sb2) { _sb2.disabled = false; _sb2.style.opacity = '1'; }
                  updateFuelUI();
                });
              });
            } catch (e) {
              // Ensure intervals are always cleared even if the encounter throws
              console.error('[dispatch] return encounter error:', e);
              clearInterval(dispatchInterval);
              clearInterval(fuelDrainInterval);
              dispatchInterval  = null;
              fuelDrainInterval = null;
              btn.disabled          = false;
              btn.textContent       = '⬡ Send Again';
              refuelBtn.disabled    = false;
              refuelBtn.style.opacity = '1';
              const _sb3 = document.getElementById('shopHeaderBtn'); if (_sb3) { _sb3.disabled = false; _sb3.style.opacity = '1'; }
              document.getElementById('dispatchCountdownWrap').style.display = 'none';
              document.getElementById('dispatchIdleText').style.display = 'none';
                  const _io = document.getElementById('sceneIdleOverlay'); if (_io) { _io.style.opacity = '1'; }
              stopAsteroidGlitch();
            }
          }, transitMs); // wait the full return leg before triggering arrival
        }
      }, 80);
    });
  }, transitMs); // fire after outbound leg completes
}

// ── OFFLOAD SEQUENCE ──
const OFFLOAD_LABELS = [
  'Docking clamps engaged...',
  'Opening cargo bay doors...',
  'Transferring ore containers...',
  'Conveyor systems active...',
  'Scanning manifest...',
  'Logging haul to registry...',
  'Sealing transfer lock...',
  '✓ Offload complete',
];

function startOffloadSequence(haulData, onComplete) {
  const totalScu    = haulData.reduce((s, h) => s + h.scu, 0);
  const OFFLOAD_MS  = Math.max(4000, Math.min(10000, totalScu * 180)); // 4–10s based on haul size
  const overlay     = document.getElementById('offloadOverlay');
  const bar         = document.getElementById('offloadBar');
  const label       = document.getElementById('offloadLabel');
  const dots        = document.getElementById('cargoDots');
  const statusEl    = document.getElementById('dispatchStatus');
  const dispatchBtn = document.getElementById('dispatchBtn');

  // Update header status
  statusEl.textContent = 'Offloading';
  statusEl.style.color = 'var(--cyan)';

  // Disable dispatch button during offload
  if (dispatchBtn) {
    dispatchBtn.disabled    = true;
    dispatchBtn.textContent = '⬡ Offloading...';
    dispatchBtn.style.opacity = '0.5';
  }

  // Build animated cargo dots — one per SCU type, coloured by material
  dots.innerHTML = '';
  haulData.forEach((h, i) => {
    const mat   = materials[h.matKey];
    const count = Math.min(8, Math.ceil(h.scu / 4));
    for (let d = 0; d < count; d++) {
      const dot = document.createElement('div');
      const delay = (i * 600 + d * 220) % (OFFLOAD_MS * 0.8);
      dot.style.cssText = `
        width:10px;height:10px;border-radius:2px;flex-shrink:0;
        background:${mat?.color || 'var(--cyan)'};
        box-shadow:0 0 6px ${mat?.color || 'var(--cyan)'};
        animation:cargoPulse ${1.4 + Math.random() * 0.6}s ${delay}ms infinite linear;
      `;
      dots.appendChild(dot);
    }
  });

  // Show overlay
  overlay.style.display = 'flex';
  bar.style.width = '0%';
  label.textContent = OFFLOAD_LABELS[0];

  const start   = Date.now();
  let labelIdx  = 0;
  const labelStep = OFFLOAD_MS / OFFLOAD_LABELS.length;

  const offloadInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    const pct     = Math.min(100, (elapsed / OFFLOAD_MS) * 100);
    bar.style.width = pct + '%';

    // Cycle status labels
    const li = Math.floor(elapsed / labelStep);
    if (li !== labelIdx && li < OFFLOAD_LABELS.length) {
      labelIdx = li;
      label.textContent = OFFLOAD_LABELS[li];
    }

    if (elapsed >= OFFLOAD_MS) {
      clearInterval(offloadInterval);
      bar.style.width = '100%';
      label.textContent = '✓ Offload complete';

      // Brief pause on complete state, then hide and unlock
      setTimeout(() => {
        overlay.style.display = 'none';
        dots.innerHTML = '';
        if (onComplete) onComplete();
      }, 800);
    }
  }, 80);
}

// ── GENERATE RANDOM HAUL ──
function generateHaul(fuelRatio = 1) {
  const matKeys = Object.keys(materials).filter(k => k !== 'fuel');
  const maxScu  = Math.max(1, Math.round(MAX_HAUL_SCU * fuelRatio));

  // Weighted random selection — higher rarity = more likely to appear
  // Uses a pool draw: roll each ore independently against its rarity %
  // Then pick 1–4 of the winners (guaranteeing at least 1)
  const BASE_APPEAR_CHANCE = 0.55; // base chance any ore appears at all
  let candidates = matKeys.filter(k => {
    const r = (materials[k].rarity || 50) / 100;
    // Rarity drives both appearance chance and SCU share
    return Math.random() < (BASE_APPEAR_CHANCE * r + 0.05);
  });

  // Always at least one ore
  if (candidates.length === 0) {
    // Pick the ore with highest rarity as guaranteed fallback
    candidates = [matKeys.reduce((a, b) =>
      (materials[a].rarity || 50) >= (materials[b].rarity || 50) ? a : b
    )];
  }

  // Cap at 4 types
  candidates = candidates
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(4, candidates.length));

  // Distribute SCU weighted by rarity (rarer = less SCU per deposit)
  const totalWeight = candidates.reduce((s, k) => s + (materials[k].rarity || 50), 0);
  const chosen = [];
  let remaining = maxScu;

  candidates.forEach((key, i) => {
    const isLast   = i === candidates.length - 1;
    const weight   = (materials[key].rarity || 50) / totalWeight;
    // Rarer ores get proportionally less volume
    const share    = isLast ? remaining : Math.round(maxScu * weight * (0.6 + Math.random() * 0.8));
    const scu      = Math.max(1, Math.min(remaining, share));
    const purity   = Math.round((200 + Math.random() * 800) / 10) * 10;
    chosen.push({ matKey: key, scu, purity, refine: true });
    remaining -= scu;
    if (remaining <= 0) return;
  });

  return chosen;
}

// ── BARREL GAUGES ──
const ROCK_COLOURS = [
  '#6b5a48','#7a6a58','#5a4a3a','#8a7060','#584840',
  '#706050','#9a8878','#584840','#3e3028','#6a5848',
];

// Ore fill colours per fill level — dark at base, lighter when packed
const SEG_FILL_EMPTY  = 'rgba(255,255,255,0.04)';
const SEG_FILL_ACTIVE = 'rgba(60,45,30,0.75)';
const SEG_FILL_FULL   = 'rgba(85,65,42,0.92)';
const SEG_BORDER_EMPTY  = 'rgba(255,255,255,0.09)';
const SEG_BORDER_ACTIVE = 'rgba(160,115,65,0.3)';
const SEG_BORDER_FULL   = 'rgba(180,130,75,0.5)';

const _barrelPrevPct = [0, 0, 0, 0];

function updateBarrels(pct) {
  for (let b = 0; b < 4; b++) {
    const barrelFill = Math.min(1, Math.max(0, (pct - b * 25) / 25));
    const lblEl = document.getElementById('barrelLabel' + b);

    for (let s = 0; s < 4; s++) {
      const segThreshold = s / 4;
      const segFill = Math.min(1, Math.max(0, (barrelFill - segThreshold) / 0.25));
      const segEl   = document.getElementById('bseg' + b + '-' + s);
      const fillEl  = document.getElementById('bfill' + b + '-' + s);
      if (!segEl || !fillEl) continue;

      fillEl.style.height     = Math.round(segFill * 100) + '%';
      fillEl.style.background = segFill >= 1
        ? SEG_FILL_FULL
        : segFill > 0
          ? `linear-gradient(to top, ${SEG_FILL_ACTIVE}, rgba(75,58,38,0.85))`
          : 'transparent';

      segEl.style.borderColor = segFill >= 1
        ? SEG_BORDER_FULL
        : segFill > 0
          ? SEG_BORDER_ACTIVE
          : SEG_BORDER_EMPTY;
    }

    // Spawn rocks while this barrel is actively filling
    const prevFill = _barrelPrevPct[b];
    if (barrelFill > 0 && barrelFill < 1 && barrelFill > prevFill) {
      if (Math.random() < 0.6) spawnRockParticles(b);
    }
    _barrelPrevPct[b] = barrelFill;

    if (lblEl) {
      if (barrelFill >= 1)     { lblEl.textContent = 'Full'; lblEl.style.color = 'rgba(180,140,90,0.9)'; }
      else if (barrelFill > 0) { lblEl.textContent = Math.round(barrelFill*100)+'%'; lblEl.style.color = 'var(--orange)'; }
      else                     { lblEl.textContent = '—'; lblEl.style.color = 'var(--text-dim)'; }
    }
  }
}

function resetBarrels() {
  for (let b = 0; b < 4; b++) {
    _barrelPrevPct[b] = 0;
    for (let s = 0; s < 4; s++) {
      const segEl  = document.getElementById('bseg' + b + '-' + s);
      const fillEl = document.getElementById('bfill' + b + '-' + s);
      if (segEl)  { segEl.style.background = 'rgba(255,255,255,0.04)'; segEl.style.borderColor = 'rgba(255,255,255,0.08)'; }
      if (fillEl) { fillEl.style.height = '0%'; }
    }
    const lbl = document.getElementById('barrelLabel' + b);
    const ptc = document.getElementById('barrelParticles' + b);
    if (lbl) { lbl.textContent = '—'; lbl.style.color = 'var(--text-dim)'; }
    if (ptc) { ptc.innerHTML = ''; }
  }
}

function spawnRockParticles(barrelIdx) {
  const container = document.getElementById('barrelParticles' + barrelIdx);
  if (!container) return;
  const gaugeW  = 44;
  const count   = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const rock = document.createElement('div');
      const w    = 3 + Math.floor(Math.random() * 5);
      const h    = 2 + Math.floor(Math.random() * 4);
      const x    = 2 + Math.random() * (gaugeW - w - 4);
      const r0   = Math.round(Math.random() * 180);
      const r1   = r0 + Math.round((Math.random() - 0.5) * 90);
      const dy   = 30 + Math.random() * 55;
      const dur  = 0.35 + Math.random() * 0.45;
      const col  = ROCK_COLOURS[Math.floor(Math.random() * ROCK_COLOURS.length)];
      // Randomise border-radius for irregular rock shape
      const br   = `${30+Math.random()*30}% ${40+Math.random()*30}% ${35+Math.random()*30}% ${40+Math.random()*25}% / ${35+Math.random()*30}% ${30+Math.random()*35}% ${40+Math.random()*25}% ${35+Math.random()*30}%`;
      rock.className = 'rock-particle';
      rock.style.cssText = `
        width:${w}px;height:${h}px;
        left:${x}px;top:0;
        background:${col};
        border-radius:${br};
        --r0:${r0}deg;--r1:${r1}deg;--dy:${dy}px;
        animation-duration:${dur}s;
      `;
      container.appendChild(rock);
      setTimeout(() => rock.remove(), dur * 1000 + 150);
    }, i * 70);
  }
}

// ── SCENE ZOOM ──
// Ship stays centered. sceneInner (background + foreground objects) scales up 50%.
// HUD layer is outside sceneInner — never affected by zoom.
let _sceneScale    = 1;
let _sceneTargetSc = 1;
let _sceneZoomRaf  = null;
// Legacy stubs so old call sites don't crash
let _sceneZoomTimer = null;
let _sceneZoomActive = false;
let _sceneTargetScale = 1;
let _sceneCurrentScale = 1;
let _sceneCurrentOriginX = 50;
let _sceneLocked = false;
let _sceneLockedOriginX = 50;

function startSceneZoomIn() {
  _sceneTargetSc = 1.5;
  if (!_sceneZoomRaf) _sceneZoomLoop();
}

function _sceneZoomLoop() {
  const el = document.getElementById('sceneInner');
  if (!el) { _sceneZoomRaf = null; return; }
  _sceneScale += (_sceneTargetSc - _sceneScale) * 0.010;
  el.style.transform = `scale(${_sceneScale.toFixed(4)})`;
  if (Math.abs(_sceneTargetSc - _sceneScale) > 0.001) {
    _sceneZoomRaf = requestAnimationFrame(_sceneZoomLoop);
  } else {
    _sceneScale = _sceneTargetSc;
    el.style.transform = `scale(${_sceneScale})`;
    _sceneZoomRaf = null;
  }
}

function sceneZoomOut() {
  _sceneTargetSc = 1;
  cancelAnimationFrame(_sceneZoomRaf);
  _sceneZoomRaf = null;
  const el = document.getElementById('sceneInner');
  if (!el) return;
  el.style.transition = 'transform 2s cubic-bezier(0.4,0,0.2,1)';
  el.style.transform  = 'scale(1)';
  _sceneScale = 1;
  setTimeout(() => {
    if (el) { el.style.transition = 'none'; }
  }, 2100);
}

// Legacy stubs
function startSceneTracking()  { startSceneZoomIn(); }
function lockSceneOnMidpoint() {}

// ── ASTEROID SYSTEM ──
function rollAsteroidName() {
  const prefixes = ['Astro', 'Nebula', 'Cosmic', 'Stellar', 'Void', 'Quantum', 'Nova', 'Eclipse', 'Meteor', 'Comet'];
  const suffixes = ['Prime', 'Major', 'Minor', 'Delta', 'Sigma', 'Omega', 'Alpha', 'Beta', 'Gamma', 'Zeta'];
  return prefixes[Math.floor(Math.random() * prefixes.length)] + ' ' + suffixes[Math.floor(Math.random() * suffixes.length)];
}

function startAsteroidGlitch() {
  const asteroid = document.getElementById('asteroidImg');
  if (!asteroid) return;
  asteroid.style.animation = 'asteroidGlitch 0.1s infinite';
}

function revealAsteroidName() {
  const name = rollAsteroidName();
  document.getElementById('asteroidName').textContent = name;
  document.getElementById('asteroidName').style.opacity = '1';
}

function stopAsteroidGlitch() {
  const asteroid = document.getElementById('asteroidImg');
  if (asteroid) asteroid.style.animation = '';
  document.getElementById('asteroidName').style.opacity = '0';
}

function applyAsteroidBiasToHaul(haulArr) {
  // Asteroid type influences haul composition
  // For now, just return as-is (could add asteroid-specific modifiers later)
  return haulArr;
}

// ── CALLI RESCUE ANIMATION ──
function triggerCalliRescue(onComplete) {
  const scene = document.getElementById('spaceCanvas');
  if (!scene) { onComplete?.(); return; }

  // Remove any existing rescue elements
  document.getElementById('calliRescueShip')?.remove();
  document.getElementById('calliRescueBubble')?.remove();

  // Calli's ship
  const ship = document.createElement('img');
  ship.id  = 'calliRescueShip';
  ship.src = 'img/calli_ship.webp';
  scene.appendChild(ship);

  // After fly-in completes, switch to hover and show dialogue
  setTimeout(() => {
    ship.classList.add('hovering');
    ship.style.transform = ''; // let CSS animation handle it

    const bubble = document.createElement('div');
    bubble.id = 'calliRescueBubble';
    bubble.innerHTML = `
      <img src="img/actor_calli_empathy.webp" alt="Calli">
      <div>
        <div class="calli-name">Calli — Rescue Pilot</div>
        <div class="calli-text">Hey, I've got you. Tow line locked — we'll get you back to the station. Gonna cost you though.</div>
      </div>`;
    scene.appendChild(bubble);
    requestAnimationFrame(() => bubble.classList.add('visible'));

    // Give player time to read, then hand off to tow overlay
    setTimeout(() => { onComplete?.(); }, 2800);
  }, 2500);
}

function clearCalliRescue() {
  const ship   = document.getElementById('calliRescueShip');
  const bubble = document.getElementById('calliRescueBubble');
  if (bubble) { bubble.classList.remove('visible'); setTimeout(() => bubble.remove(), 500); }
  if (ship)   { ship.style.opacity = '0'; setTimeout(() => ship.remove(), 500); }
}

// ── TOW-BACK — fires when miner runs out of fuel mid-flight ──
function triggerTowBack(btn, refuelBtn) {
  const ship    = document.getElementById('minerShip');
  const overlay = document.getElementById('mineStatusOverlay');

  // Stop ship animation
  if (ship) {
    ship.style.transition = 'none';
    ship.style.opacity    = '0.4';
    ship.style.filter     = 'grayscale(1) opacity(0.4)';
  }

  // Update status
  document.getElementById('dispatchStatus').textContent = 'Stranded';
  document.getElementById('dispatchStatus').style.color = 'var(--red)';
  if (overlay) {
    overlay.textContent   = '⚠ Out of fuel — requesting tow...';
    overlay.style.color   = 'var(--red)';
    overlay.style.opacity = '1';
  }

  // Calli flies in, then show tow modal
  setTimeout(() => {
    stopAsteroidGlitch();
    clearInterval(dispatchInterval);
    clearInterval(fuelDrainInterval);
    dispatchInterval  = null;
    fuelDrainInterval = null;

    triggerCalliRescue(() => {
      clearCalliRescue();
      _showTowOverlay(btn, refuelBtn);
    });
  }, 800);
}

function _showTowOverlay(btn, refuelBtn) {
    // Show tow notification — compact floating card centered in the scene
    const scene = document.getElementById('spaceCanvas');
    const towDiv = document.createElement('div');
    towDiv.id = 'towOverlay';
    towDiv.style.cssText = `
      position:absolute;top:50%;right:18px;transform:translateY(-50%);
      background:rgba(8,10,18,.92);border:1px solid rgba(255,64,96,.5);
      border-radius:12px;padding:22px 28px;display:flex;flex-direction:column;
      align-items:center;gap:12px;z-index:50;width:220px;
      box-shadow:0 0 40px rgba(255,64,96,.15);
    `;
    towDiv.innerHTML = `
      <div style="font-size:28px;">🚨</div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:500;color:var(--red);text-transform:uppercase;letter-spacing:.1em;text-shadow:0 0 10px rgba(255,64,96,.7);">Miner Stranded</div>
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text-dim);text-align:center;line-height:1.7;">Fuel reserves depleted mid-flight.<br>Calli has you on tow cable.</div>
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--red);padding:7px 14px;border:1px solid rgba(255,64,96,.4);background:rgba(255,64,96,.08);border-radius:6px;width:100%;text-align:center;">
        Tow cost: <strong style="color:var(--text-bright);">${TOW_COST.toLocaleString()} GC</strong>
      </div>
      <button onclick="payTowBack()"
        style="width:100%;padding:10px;background:transparent;border:1px solid var(--orange);color:var(--orange);
          font-family:'DM Mono',monospace;font-size:11px;font-weight:700;text-transform:uppercase;
          letter-spacing:.1em;cursor:pointer;border-radius:8px;transition:all .2s;"
        onmouseover="this.style.background='rgba(232,141,45,.1)'" onmouseout="this.style.background='transparent'">
        Pay Tow — ${TOW_COST.toLocaleString()} GC
      </button>
      ${userWallet < TOW_COST ? `<div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--red);text-align:center;">⚠ Insufficient funds — ${userWallet.toLocaleString()} GC available</div>` : ''}
    `;
    if (scene) scene.appendChild(towDiv);

    // Store refs for payTowBack
    window._towBtn      = btn;
    window._towRefuel   = refuelBtn;
}

function payTowBack() {
  const towDiv = document.getElementById('towOverlay');
  if (towDiv) towDiv.remove();

  const cost = Math.min(TOW_COST, userWallet); // take what they have if broke
  userWallet = Math.max(0, userWallet - cost);
  updateWallet();

  const ship    = document.getElementById('minerShip');
  const overlay = document.getElementById('mineStatusOverlay');

  if (ship) {
    ship.style.transition = 'none';
    ship.style.opacity    = '0';
    ship.style.filter     = '';
  }
  if (overlay) { overlay.textContent = '✓ Miner towed back'; overlay.style.color = 'var(--orange)'; }
  setStarSpeed(0, 600);
  deactivateBoost();
  document.getElementById('spaceCanvas').classList.remove('scene-flying','scene-boosting','scene-drifting');
  const _tso = document.getElementById('stationObj');
  const _tao = document.getElementById('asteroidObj');
  if (_tso) { _tso.style.transition = 'left 2s ease-out'; _tso.style.left = '0px'; }
  if (_tao) { _tao.style.transition = 'right 1.5s ease-out'; _tao.style.right = '-260px'; }
  cancelAnimationFrame(_sceneZoomTimer);
  sceneZoomOut();

  document.getElementById('dispatchStatus').textContent  = 'Towed Back';
  document.getElementById('dispatchStatus').style.color  = 'var(--orange)';
  document.getElementById('dispatchCountdownWrap').style.display = 'none';
  document.getElementById('dispatchIdleText').style.display = 'none';
  document.getElementById('miningBarLabel').textContent = '';
  const _towIo = document.getElementById('sceneIdleOverlay');
  if (_towIo) _towIo.style.opacity = '1';

  // Haul is lost — empty manifest
  haul = [];
  minerFuel = 0;
  updateFuelUI();

  if (window._towBtn)    { window._towBtn.disabled   = false; window._towBtn.textContent = '⬡ Send Again'; }
  if (window._towRefuel) { window._towRefuel.disabled = false; window._towRefuel.style.opacity = '1'; }
  const _sb4 = document.getElementById('shopHeaderBtn'); if (_sb4) { _sb4.disabled = false; _sb4.style.opacity = '1'; }

  showContractToast(`Tow cost: −${cost.toLocaleString()} GC. Refuel before next dispatch.`, 'var(--red)');
}

// ── ENCOUNTER SYSTEM ──
async function loadEncounters() {
  const rows = await sbFetch('encounters?active=eq.true&select=*');
  if (rows && rows.length) {
    encounterPool = rows;
    console.log(`[Encounters] Loaded ${rows.length} encounters:`, rows.map(e => `"${e.title}" (${e.trigger_phase})`));
  } else {
    console.warn('[Encounters] No encounters loaded — check table name, RLS, and active=true rows exist.');
  }
}

// Roll for encounter on a given phase leg
async function maybeFireEncounter(phase, resumeFn) {
  const ENCOUNTER_CHANCE = 0.35; // 35% chance per leg
  if (Math.random() > ENCOUNTER_CHANCE) { resumeFn(); return; }
  if (!encounterPool.length) {
    console.warn('[Encounters] Pool empty — check Supabase encounters table has active=true rows.');
    resumeFn(); return;
  }

  const eligible = encounterPool.filter(e => {
    if (seenEncounters.has(e.id ?? e.title)) return false;
    if (e.title.toLowerCase().includes('claim jumper') && userWallet < 50000) return false;
    return e.trigger_phase === 'either' ||
      e.trigger_phase === phase ||
      (e.trigger_phase === 'mining' && phase === 'outbound');
  });
  if (!eligible.length) { resumeFn(); return; }

  activeEncounter   = eligible[Math.floor(Math.random() * eligible.length)];
  encounterResumeFn = resumeFn;
  encounterHaulMods = { orePctLoss:0, oreBonus:0, qualityBoost:false, shipDamage:0, fuelLoss:0, lostAll:false };

  const seenKey = activeEncounter.id ?? activeEncounter.title;
  seenEncounters.add(seenKey);
  localStorage.setItem('seenEncounters', JSON.stringify([...seenEncounters]));

  showEncounterModal(activeEncounter);
}

function showEncounterModal(enc) {
  const titleLower = enc.title.toLowerCase();
  const isPirate   = titleLower.includes('pirate') || titleLower.includes('nine tail') || titleLower.includes('intercept') || titleLower.includes('standoff');
  const isVolatile = titleLower.includes('volatile') || titleLower.includes('unstable') || titleLower.includes('flare') || titleLower.includes('solar');
  const isSalvage  = titleLower.includes('salvage') || titleLower.includes('derelict') || titleLower.includes('lucky') || titleLower.includes('strike');
  const isDistress = titleLower.includes('distress');
  const isDamage   = titleLower.includes('impact') || titleLower.includes('breach') || titleLower.includes('malfunction') || titleLower.includes('hull') || titleLower.includes('fuel leak');

  const colors = { pirate:'#ff4060', volatile:'#f97316', salvage:'#22c55e', distress:'#4aa9ef', damage:'#ff4060', default:'#e88d2d' };
  const icons  = { pirate:'☠', volatile:'⚠', salvage:'💰', distress:'🆘', damage:'💥', default:'⚡' };
  const typeKey = isPirate?'pirate':isVolatile?'volatile':isSalvage?'salvage':isDistress?'distress':isDamage?'damage':'default';
  const color   = colors[typeKey];
  const icon    = icons[typeKey];

  // Store pirate flag on active encounter for resolveEncounter
  activeEncounter._isPirate = isPirate;

  document.getElementById('encounterIcon').textContent   = icon;
  document.getElementById('encounterTag').textContent    = '// ' + typeKey.toUpperCase() + ' ENCOUNTER';
  document.getElementById('encounterTag').style.color    = color;
  document.getElementById('encounterTag').style.borderColor = color;
  document.getElementById('encounterTitle').textContent  = enc.title;
  document.getElementById('encounterTitle').style.color  = color;
  document.getElementById('encounterDesc').textContent   = enc.description;
  document.getElementById('encounterDesc').style.borderLeftColor = color;

  // Buttons
  document.getElementById('encounterBtnA').textContent = enc.choice_a_text;
  document.getElementById('encounterBtnB').textContent = enc.choice_b_text;

  document.getElementById('encounterChoices').style.display    = 'flex';
  document.getElementById('encounterResolution').style.display = 'none';
  document.getElementById('encounterContinueBtn').style.display = 'none';

  document.getElementById('encounterModal').style.display = 'flex';
}

function resolveEncounter(choice) {
  const enc     = activeEncounter;
  const outcome = choice === 'A' ? enc.choice_a_outcome : enc.choice_b_outcome;
  const flavor  = choice === 'A' ? enc.choice_a_flavor  : enc.choice_b_flavor;
  const winRoll = Math.random() < parseFloat(enc.win_chance);
  const isPirate = enc._isPirate;

  let effectText  = '';
  let effectColor = 'var(--cyan)';
  let effectLines = [];

  const resolveOutcome = (o) => {
    const r = applyOutcome(o);
    return r.text;
  };

  if (outcome === 'no_effect') {
    if (isPirate) {
      // Running from pirates always costs hull damage — random amount
      const damage = Math.round((800 + Math.random() * 1400) / 100) * 100;
      userWallet = Math.max(0, userWallet - damage);
      updateWallet();
      effectLines.push(`✗ They opened fire as you ran. Hull damage sustained.`);
      effectLines.push(`Repair cost: −${damage.toLocaleString()} GC deducted.`);
      effectColor = 'var(--red)';
    } else {
      effectLines.push(`✓ No complications encountered.`);
      effectColor = 'var(--green)';
    }
  } else if (outcome.startsWith('fight:')) {
    const parts   = outcome.replace('fight:','').split('|');
    const losePart = parts[1]?.replace('lose=','') || 'no_effect';
    if (winRoll) {
      effectLines.push(`✓ Combat successful!`);
      effectColor = 'var(--green)';
      if (parts[0]) resolveOutcome(parts[0]);
    } else {
      effectLines.push(`✗ Combat failed.`);
      effectColor = 'var(--red)';
      resolveOutcome(losePart);
    }
  } else {
    const result = resolveOutcome(outcome);
    effectLines.push(result);
    effectColor = result.includes('✗') ? 'var(--red)' : result.includes('✓') ? 'var(--green)' : 'var(--cyan)';
  }

  // Show resolution
  document.getElementById('encounterChoices').style.display    = 'none';
  document.getElementById('encounterResolution').style.display = 'block';
  document.getElementById('encounterResolution').innerHTML     = `
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:24px;margin-bottom:8px;">${effectLines[0]}</div>
      ${effectLines.slice(1).map(line => `<div style="color:${effectColor};font-size:14px;margin:4px 0;">${line}</div>`).join('')}
    </div>
    <div style="text-align:center;color:var(--text-dim);font-size:12px;margin-bottom:16px;">
      ${flavor}
    </div>
  `;

  document.getElementById('encounterContinueBtn').style.display = 'block';
}

function applyOutcome(outcome) {
  let text = '';
  if (outcome === 'no_effect') {
    text = '✓ No effect.';
  } else if (outcome.startsWith('lose_ore_pct:')) {
    const pct = parseInt(outcome.split(':')[1]);
    encounterHaulMods.orePctLoss = pct;
    text = `✗ Lost ${pct}% of cargo to scavengers.`;
  } else if (outcome === 'lose_all_ore') {
    encounterHaulMods.lostAll = true;
    text = `✗ Entire cargo seized by pirates.`;
  } else if (outcome.startsWith('ore_bonus:')) {
    const pct = parseInt(outcome.split(':')[1]);
    encounterHaulMods.oreBonus = pct;
    text = `✓ Found bonus salvage! +${pct}% cargo value.`;
  } else if (outcome.startsWith('ship_damage:')) {
    const amt = parseInt(outcome.split(':')[1]);
    encounterHaulMods.shipDamage = amt;
    userWallet = Math.max(0, userWallet - amt);
    updateWallet();
    text = `✗ Hull damage sustained. Repair cost: −${amt.toLocaleString()} GC.`;
  } else if (outcome.startsWith('lose_fuel:')) {
    const u = parseInt(outcome.split(':')[1]);
    encounterHaulMods.fuelLoss = u;
    minerFuel = Math.max(0, minerFuel - u);
    updateFuelUI();
    text = `✗ Fuel leak detected. Lost ${u} fuel units.`;
  } else if (outcome === 'lose_time') {
    text = `✗ Minor delay encountered.`;
  } else if (outcome === 'quality_boost') {
    encounterHaulMods.qualityBoost = true;
    text = `✓ High-quality ore discovered!`;
  } else {
    text = `? Unknown outcome: ${outcome}`;
  }
  return { text };
}

function applyHaulMods(haulArr) {
  if (encounterHaulMods.lostAll) return [];
  if (encounterHaulMods.orePctLoss > 0) {
    haulArr.forEach(h => {
      h.scu = Math.max(1, Math.round(h.scu * (1 - encounterHaulMods.orePctLoss / 100)));
    });
  }
  if (encounterHaulMods.oreBonus > 0) {
    haulArr.forEach(h => {
      h.scu = Math.round(h.scu * (1 + encounterHaulMods.oreBonus / 100));
    });
  }
  if (encounterHaulMods.qualityBoost) {
    haulArr.forEach(h => {
      h.purity = Math.min(1000, h.purity + Math.round((1000 - h.purity) * 0.3));
    });
  }
  return haulArr;
}

// ── TEMPORARY STUBS (will be moved to appropriate modules) ──
// These functions are called by game.js but defined elsewhere
// They should be implemented in their respective modules and removed from here

function setStarSpeed(target, rampMs) {
  // TODO: Move to main.js (parallax system)
  console.log(`[game.js] setStarSpeed(${target}, ${rampMs}) - stub`);
}

function renderManifest() {
  // TODO: Move to ui.js
  console.log('[game.js] renderManifest() - stub');
}

function showContractToast(message, color) {
  // TODO: Move to ui.js
  console.log(`[game.js] showContractToast("${message}", "${color}") - stub`);
}

function showShopPurchaseToast(message, color) {
  // TODO: Move to ui.js
  console.log(`[game.js] showShopPurchaseToast("${message}", "${color}") - stub`);
}

async function sbFetch(endpoint) {
  // TODO: Move to auth.js
  console.log(`[game.js] sbFetch("${endpoint}") - stub`);
  return [];
}

console.log('[game.js] Game logic module loaded - core functions extracted');
