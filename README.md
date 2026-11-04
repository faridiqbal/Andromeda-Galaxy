# Andromeda Quest 🚀🌌

A space-themed take on snakes & ladders for 1–5 players, built with plain HTML/CSS/JavaScript.

Square 100 is the **Andromeda Galaxy**. Land on it exactly to win. Overshoot it and you bounce back for the remaining pips (97 + 6 → 98, 99, 100, 99, 98, **97**).

## Board elements
| Boosts ▲ | Hazards ▼ |
|---|---|
| 🚀 Rocket: blast straight up | 🐍 Space serpent: slide down its body |
| 🛸 UFO tractor beam: get beamed up | 🕳️ Black hole: spiral in, get spat out lower |
| 🌀 Wormhole: warp between portals | 🪨 Asteroid strike: knocked flying down the board |
| ☄️ Comet ride: hitch a ride on its tail | ☀️ Solar flare: blasted down a plasma arc |

## Mechanics
- **⚡ Energy** (max 5): start with 2, collect 💎 crystals by flying over them, and salvage +1⚡ whenever a hazard hits you.
- **🛡️ Shield (2⚡)**: raised before rolling. It blocks the next hazard or collision.
- **🔺🔻 Thrusters (1⚡ each)**: after rolling, adjust your move by up to ±2. A live landing preview shows where you'll end up and what's there.
- **🎲 Reroll (2⚡)**: once per turn.
- **💥 Collisions**: landing on a rival knocks them back 2 squares.
- **🔥 Afterburner**: rolling a 6 gives another roll.
- **🌌 Cosmic events** every 3 rounds: Solar Wind (+1⚡ all), Crystal Rain, Ion Storm (free abilities), Nebula Drain (−1⚡ all).
- **🤖 CPU pilots**: any seat can be set to a computer player that uses abilities strategically.
- **🧪 Test mode** (toggle on the setup screen, or open `index.html?test`): choose the next dice value, teleport the current player, and add energy.

Keys: `Space` roll / launch · `←` `→` thrusters · `S` shield · `R` reroll.

Built with **Three.js** (3D dice), **GSAP** (animations), **canvas-confetti**, Web Audio (synthesized sound), and SVG artwork for the board.

## Run
Open `index.html` in a browser, or serve the folder (`python3 -m http.server 8080`) and visit http://localhost:8080. No build step is needed. The libraries are bundled in `js/lib/`, so the game works offline (only the Google Fonts need a connection, and it falls back to system fonts).

## Structure
```
index.html        markup & screens
css/style.css     styling
js/board.js       grid, rockets & serpents (SVG)
js/dice.js        Three.js 3D dice
js/game.js        setup, turns, movement, win
js/audio.js       sound effects
js/starfield.js   animated background
js/lib/           three.js r128, gsap 3.12.5, canvas-confetti 1.9.3
```
