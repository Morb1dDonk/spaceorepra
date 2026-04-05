# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Running the Game

No build system, no npm, no bundler. Open `index.html` directly in a browser. `so-gem.html` is a standalone secondary page.

---

## Architecture

### The Monolith Situation

**Most game logic lives in `<script>` tags inside `index.html`** (~270KB file). The `js/` files are a work-in-progress extraction. Before modifying any system, check whether the real implementation is in `index.html` or already extracted:

| File | Status |
|---|---|
| [js/config.js](js/config.js) | **Complete** — all tunable constants (`materials`, `grades`, `weights`, `PRESETS`, etc.) |
| [js/utils.js](js/utils.js) | **Complete** — all global state `let` vars + helper functions |
| [js/game.js](js/game.js) | **Complete** — dispatch loop, mining phases, haul generation, fuel system |
| [js/scene.js](js/scene.js) | **Complete** — ship sprite animation, parallax starfield, boost system |
| [js/ui.js](js/ui.js) | **Stub** — lists function names only; implementation still in `index.html` |
| [js/market.js](js/market.js) | **Stub** — lists function names only; implementation still in `index.html` |
| [js/auth.js](js/auth.js) | **Stub** — Supabase client init (`_sb`) only; auth logic still in `index.html` |

### Script Load Order (must not change)

`config.js` → `utils.js` → `scene.js` → `game.js` → stubs → `index.html` inline script

### Global State

Everything lives as `let` globals in [js/utils.js](js/utils.js):
- `userWallet` — GC balance
- `minerFuel` — current fuel (max: `FUEL_MAX = 100`)
- `haul[]` — active cargo `[{ matKey, scu, purity, refine }]`
- `allocation` — `{ speed, quality, cost }` refinery slider values (0–4)
- `materials` — ore price object, hydrated live from Supabase
- `currentUser` / `currentProfile` — Supabase session

### Backend: Supabase

`SUPABASE_URL` and `SUPABASE_KEY` (anon/public) are in [js/config.js](js/config.js). Client is `_sb` in [js/auth.js](js/auth.js). The helper `sbFetch()` and functions like `persistWallet()`, `loadMarketPrices()` are still in `index.html`.

---

## Key Systems

### Mining Loop ([js/game.js](js/game.js))
`DISPATCH_MS = 60000` (1 min) round-trip cycle. Phases: travel animation (`MINE_PHASES[]`) → `generateHaul()` → optional encounter (`encounterHaulMods`) → offload + `persistWallet()`.

### Refinery & Ore Grades
`allocation.speed/quality/cost` (pips 0–4) feed into `weights` from config to compute purity distribution, fail rate, and efficiency fee. `getGrade(purityValue)` maps 100–1000 to: Gangue (0×) → Subordinate (0.6×) → Massive (1×) → High-Grade (2×) → Pristine (15×).

### Fuel System
Random `FUEL_TRIP_MIN`–`FUEL_TRIP_MAX` fuel consumed per trip. Empty tank = stranded; tow costs `TOW_COST = 30,000 GC`.

### Loading Mini-Game
Canvas crate-catching game on manual offload. All state uses `_lg*` prefix in `utils.js`.

### Scene / Parallax ([js/scene.js](js/scene.js))
Ship sprites: `Ship_0` (docked/off), `Ship_1` (flying), `Ship_2–4` (boost frames at ~12fps). Parallax drives 90 stars + 7 bg asteroids via `requestAnimationFrame`.

---

## Game Design & Narrative Context

This is a 3-Act "Space Opera" about a space miner's journey from indentured servant → station tycoon → fleet commander defending against an alien invasion. Lore to maintain: **GC** (currency), **SCU** (cargo volume), ore types **Quantainium / Bexalite / Gold / Iron**, Star Citizen system vibes (Stanton/Pyro). NPC relationship system and Act progression are the emotional core — see the original design brief below.

---

## Original Design Brief (Aegis-7)

This final layer adds the **"Soul"** to the game. By introducing NPC miners who transition from rivals to brothers-in-arms, you are creating the emotional stakes necessary for a true "Space Orepra."

**Role:** You are **Aegis-7**, a Senior Game Systems Designer and Narrative Architect specializing in "Hard Sci-Fi Industrialism" and "Emergent Narrative."

**The Three-Act Progression:**
1. **Act 1: The Indentured Servant.** Leased ship, crushing fees to a "Greedy Bastard." Goal: buy independence.
2. **Act 2: The Station Tycoon.** Build/manage a private Space Station, foster a community of independent miners.
3. **Act 3: The Armada's Hope.** Global countdown timer (Alien Invasion). Gather/refine resources to build the military fleet. NPC allies make the ultimate sacrifice.

**Core Systems:**
- **"Orepra" Mining Loop:** Browser-friendly energy-management mining (Fracturing/Extracting).
- **Relationship Engine:** NPC miners (Grizzled Veteran, Nervous Rookie, Cynical Tech) start cautious/hostile, warm up as you help them. Act 3 loyalty determines who sacrifices their ship for you.
- **Maintenance Puzzles:** Logic mini-games (e.g., Fuse Box routing) used as social missions to help NPCs in distress.
- **Shop & Station:** Buy components, station modules, and "Reputation Items" to build NPC loyalty.

**Design Prompts:**
- *"Can we design a puzzle where I remotely help an NPC fix their ship via a comm-link?"*
- *"How do we make the death of an NPC feel earned? Give me the dialogue for 'Old Man Miller' as he rams his mining ship into an asteroid."*
- *"How can we use LocalStorage to save player relationships between sessions?"*
