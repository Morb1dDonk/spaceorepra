// ═══════════════════════════════════════════
// CONFIG - Game constants and configuration
// ═══════════════════════════════════════════

const SLIDER_MIN = 1, SLIDER_MAX = 5;
const AXES = ['speed','quality','cost'];
const MS_TOTAL_SLOW = 120000, MS_TOTAL_FAST = 12000;

// Axis labels shown in UI
const AXIS_LABELS = { speed:'Speed', quality:'Purity', cost:'Yield' };
const AXIS_DESC   = {
  speed:   ['Glacial','Slow','Standard','Fast','Rapid'],
  quality: ['Raw','Low-Grade','Refined','High-Purity','Pristine'],
  cost:    ['Minimal','Low','Standard','High','Maximum'],
};

let materials = {
  gold:  { name:'Gold',         baseVal:650,  rawMult:0.15, color:'#e88d2d', rarity:60 },
  quant: { name:'Quantainium',  baseVal:1800, rawMult:0.10, color:'#4aaef2', rarity:8  },
  bex:   { name:'Bexalite',     baseVal:950,  rawMult:0.20, color:'#a855f7', rarity:18 },
  iron:  { name:'Iron',         baseVal:120,  rawMult:0.30, color:'#94a3b8', rarity:75 },
};

let grades = [
  { min:100, max:199, key:'gangue',     label:'Gangue',     color:'#5a6068', multiplier:0.0  },
  { min:200, max:449, key:'subordinate',label:'Subordinate',color:'#b5a642', multiplier:0.6  },
  { min:450, max:699, key:'massive',    label:'Massive',    color:'#facc15', multiplier:1.0  },
  { min:700, max:899, key:'highgrade',  label:'High-Grade', color:'#e88d2d', multiplier:2.0  },
  { min:900, max:1000,key:'pristine',   label:'Pristine',   color:'#a855f7', multiplier:15.0 },
];

let weights = {
  speedFail:               { min:0.5,  max:20   },
  efficiencyFee:           { min:0.3,  max:2.2  },
  pristineProb:            { min:0.005,max:0.06 },
  efficiencyQualityPenalty:{ min:0,    max:80   },
};

let PURITY_RANGES = [
  [200, 400],
  [200, 500],
  [250, 500],
  [300, 700],
  [300, 800],
];

let LOGISTICS = { loadingPerSCU:100, packagingPerSCU:85, conveniencePerSCU:40 };
let playerOwnsShip = false;
let BASE_FEE_PER_UNIT = 25;

const PRESETS = {
  rush:      { speed:5, quality:1, cost:2, name:'Rush',      desc:'<span style="color:var(--orange)">Rush:</span> Maximum speed, minimum care. Fast runs, high failure rate, low purity.' },
  bulk:      { speed:4, quality:2, cost:5, name:'Bulk',      desc:'<span style="color:var(--orange)">Bulk:</span> Fast throughput with high yield output. Expensive but moves volume quickly.' },
  artisan:   { speed:2, quality:4, cost:3, name:'Artisan',   desc:'<span style="color:var(--orange)">Artisan:</span> Slow and careful. High purity, moderate yield, low failure rate.' },
  precision: { speed:1, quality:5, cost:2, name:'Precision', desc:'<span style="color:var(--orange)">Precision:</span> Maximum purity ceiling. Extremely slow, costly, but pristine results.' },
};

// Dispatch phases
const DISPATCH_MS = 60000;
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

const MAX_HAUL_SCU = 48;

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

// Fuel system
const FUEL_MAX           = 100;
const FUEL_TRIP_MIN      = 15;
const FUEL_TRIP_MAX      = 35;

// Offload
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

// Tow-back
const TOW_COST = 30000;

// Asteroid system
const ASTEROID_PREFIXES = ['KL','VX','OB','TR','NX','QZ','YM','WR','ΔP','ΩK','ΣN','ΛR'];
const ASTEROID_SUFFIXES = ['7','11','44','9B','22','03','77','X1','Δ4','Ψ9','88','15'];
const GLITCH_CHARS = '░▒▓█▄▀■□▪▫◆◇●○ΞΨΩΛΔΣΦ?#@!~%&*<>';
const PURITY_BIAS_NAMES = {
  gangue:     { label:'INERT',      color:'rgba(90,96,104,.8)'  },
  subordinate:{ label:'LOW GRADE',  color:'rgba(181,166,66,.8)' },
  massive:    { label:'STANDARD',   color:'rgba(250,204,21,.8)' },
  highgrade:  { label:'HIGH GRADE', color:'rgba(232,141,45,.9)' },
  pristine:   { label:'PRISTINE',   color:'rgba(168,85,247,.9)' },
};

// Barrel colours
const ROCK_COLOURS = [
  '#6b5a48','#7a6a58','#5a4a3a','#8a7060','#4e3e30',
  '#706050','#9a8878','#584840','#3e3028','#6a5848',
];

const SEG_FILL_EMPTY  = 'rgba(255,255,255,0.04)';
const SEG_FILL_ACTIVE = 'rgba(60,45,30,0.75)';
const SEG_FILL_FULL   = 'rgba(85,65,42,0.92)';
const SEG_BORDER_EMPTY  = 'rgba(255,255,255,0.09)';
const SEG_BORDER_ACTIVE = 'rgba(160,115,65,0.3)';
const SEG_BORDER_FULL   = 'rgba(180,130,75,0.5)';

// Loading mini-game
const LG_GRAVITY       = 0.12;
const LG_BOUNCE        = -7;
const LG_CRATE_SIZE    = 20;
const LG_TRUCK_W       = 110;
const LG_TRUCK_H       = 34;

// Crew reports
const CREW_REPORTS = [
  'Crew successfully intercepted {scu} SCU of {mat} from the prospector chute. Handoff was smooth — all containers secured and transferred to station storage.',
  '{mat} shipment ({scu} SCU) collected by our recovery team. Quick work by the crew — transfer logged and payment processed.',
  'Manual loading operation for {scu} SCU {mat} ore. Crew handled the cargo carefully; minimal drift observed during transfer.',
];

let CREW_DELAY_MS = 8000;

// Supabase config
const SUPABASE_URL = 'https://gfwrhqjicixelcaxqpvv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdmd3JocWppY2l4ZWxjYXhxcHZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzAyOTEsImV4cCI6MjA5MDE0NjI5MX0.r2mNRSWC4inIIc2B8Bs7uWH302R4gZgofAvk8FKVDBM';

let SHIP_PIPS = 3;
