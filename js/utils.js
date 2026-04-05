// ═══════════════════════════════════════════
// UTILS - Helper functions
// ═══════════════════════════════════════════

function getGrade(v) { return grades.find(g => v >= g.min && v <= g.max) || grades[0]; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function gauss(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function getWeightVal(cat, pips) { const w=weights[cat]; const level=pips+1; return w.min+(w.max-w.min)*((level-1)/(SLIDER_MAX-1)); }
function getSpeedNorm(){ return allocation.speed/(SLIDER_MAX-1); }
function getTotalMs(){ return Math.round(MS_TOTAL_SLOW+getSpeedNorm()*(MS_TOTAL_FAST-MS_TOTAL_SLOW)); }
function getFailRate(){ return getWeightVal('speedFail', allocation.speed)/100; }
function fmtTime(ms){ const s=Math.ceil(ms/1000),m=Math.floor(s/60); return String(m).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); }
function updateWallet(){ document.getElementById('userWallet').textContent=userWallet.toLocaleString()+' GC'; }

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r,g,b];
}

function gradeBlockStyle(matColor, gradeKey, isPristine) {
  const [r,g,b] = hexToRgb(matColor);
  const vibrance = {
    gangue:      { bg: 0.06, opacity: 0.5,  glow: 0    },
    subordinate: { bg: 0.18, opacity: 0.75, glow: 0    },
    massive:     { bg: 0.38, opacity: 0.9,  glow: 0.15 },
    highgrade:   { bg: 0.65, opacity: 1.0,  glow: 0.4  },
    pristine:    { bg: 1.0,  opacity: 1.0,  glow: 0.9  },
  };
  const v = vibrance[gradeKey] || vibrance.massive;
  const bgR = Math.round(r * v.bg);
  const bgG = Math.round(g * v.bg);
  const bgB = Math.round(b * v.bg);
  const bg  = `rgb(${bgR},${bgG},${bgB})`;
  const glowA = v.glow;
  const glow  = glowA > 0 ? `0 0 ${Math.round(4 + glowA * 10)}px rgba(${r},${g},${b},${glowA})` : 'none';
  const borderA = Math.round(v.opacity * 0.25 * 100) / 100;
  const border  = `rgba(${r},${g},${b},${borderA})`;
  return { bg, glow, border };
}

// STATE VARIABLES
let rawScu = 12, orePurity = 650;
let allocation = { speed:0, quality:0, cost:0 };
let activePreset = null;
let sessionLog = [];
let userWallet = 50000;
let pendingRevenue = 0, currentWorkOrderFee = 0, liveAccumulatedValue = 0;
let refineryUnits = [], refineryIdx = 0, refineryRunning = false, refineryAborted = false;
let currentTimeout = null, timerInterval = null;
let refineryTotalMs = 0, refineryStartTime = 0;
let haul = [];
let dispatchInterval = null;
let fuelDrainInterval = null;
let minerFuel = 100;

// Parallax system
let _parallaxEls  = [];
let _starSpeed    = 0;
let _starDir      = -1;
let _parallaxRaf  = null;

// Boost system
let _boostActive    = false;
let _boostCount     = 0;
let _boostFuelMult  = 1;
let _boostTimeoutId = null;

// Asteroid system
let asteroidDisplayName = '';
let asteroidGlitchInterval = null;
let asteroidPurityBias = null;

// Encounter system
let encounterPool      = [];
let activeEncounter    = null;
let encounterResumeFn  = null;
let encounterHaulMods  = { orePctLoss:0, oreBonus:0, qualityBoost:false, shipDamage:0, fuelLoss:0, lostAll:false };

// Loading mini-game
let _lgCredits = 0, _lgMatKey = '', _lgHaul = [];
let _lgSaved = 0, _lgLost = 0, _lgTotal = 0, _lgValuePerCrate = 0;
let _lgActive = false, _lgAnimId = null;
let _lgCrates = [], _lgParticles = [], _lgStacked = [];
let _lgTruckX = 0, _lgSpawnTimer = 0, _lgSpawned = 0, _lgSpawnInterval = 180;

// Scene zoom
let _sceneScale    = 1;
let _sceneTargetSc = 1;
let _sceneZoomRaf  = null;
let _sceneZoomTimer = null;
let _sceneZoomActive = false;
let _sceneTargetScale = 1;
let _sceneCurrentScale = 1;
let _sceneCurrentOriginX = 50;
let _sceneLocked = false;
let _sceneLockedOriginX = 50;

// Barrel state
const _barrelPrevPct = [0, 0, 0, 0];

// Auth
let currentUser    = null;
let currentProfile = null;

// News
let newsArchive = [];

// Shop
let shopItems        = [];
let playerInventory  = [];
let _shopPendingItem = null;
