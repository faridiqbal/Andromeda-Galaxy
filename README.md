# Andromeda Quest 🚀🌌

A space-themed take on snakes & ladders for 1–5 players, built with plain HTML/CSS/JavaScript.

Square 100 is the **Andromeda Galaxy**. Land on it exactly to win. Overshoot it and you bounce back for the remaining pips (97 + 6 → 98, 99, 100, 99, 98, **97**).

## Board elements
Every game deals a **random board of 14 elements: 7 boosts and 7 hazards**. Every kind appears at least once and the extra 3 boosts and 3 hazards are picked at random, so the mix changes from game to game (and on a Galactic Shift). Each third of the board (2–33, 34–66, 67–99) gets at least 2 boosts and 2 hazards, there is always a hazard starting on squares 95–99, and no board row holds more than 3 element squares (starts and destinations counted together). The layout always follows the rules: boosts go up and hazards go down, nothing starts or ends on 1 or 100, no square holds more than one start or end (so elements never chain), and each element moves you at least one row.

| Boosts ▲ | Hazards ▼ |
|---|---|
| 🚀 Rocket: blast straight up | ⚡ Ion storm: zapped down a lightning bolt |
| 🛸 UFO tractor beam: get beamed up | 🕳️ Black hole: spiral in, get spat out lower |
| 🌀 Wormhole: warp between portals | 🔥 Flaming asteroid: set ablaze and blasted down the board |
| ☄️ Comet ride: hitch a ride on its tail | ☀️ Solar flare: blasted down a plasma arc |

## Gameplay
- **Turn-based dice:** players take turns throwing the 3D dice and hop square by square.
- **💥 Collisions:** landing on a rival knocks them back 2 squares.
- **🔥 Afterburner:** rolling a 6 gives another roll.
- **🌌 Cosmic events** every 3 rounds: Solar Wind (+2 for everyone), Gravity Wave (−2 for everyone), Warp Rift (leader and last place swap), Meteor Shower (one ship −3), Galactic Shift (every element moves to a new random position, never under a piece).
- **🎲 Hold to throw:** hold the roll button (or `Space`, or a finger) to charge a power meter. A harder throw spins and bounces the 3D dice more; the result stays random. `Enter` does a quick throw.
- **🏁 Finishing order:** when a ship reaches Andromeda, choose **Continue race** to keep playing for 2nd, 3rd and the rest (finished ships sit out), or **End & see results**. The race ends automatically when only one ship is left.
- **🏆 Results & stats:** final placings, awards (luckiest and unluckiest pilot, biggest boost, longest fall, space bully, hot dice) and a per-player stats table (rolls, average roll, sixes, boosts, hazards, net squares, collisions).
- **🔍 Element preview:** hover over (or tap) any boost or hazard to highlight its path and see where it leads.
- **🤖 CPU pilots:** any seat can be a computer player.

## Presentation
- **🎥 Cinematic camera:** zooms in on whose turn it is, pulls back for the dice throw, follows the piece as it hops, and frames the whole path when a boost or hazard fires. You can also zoom with the mouse wheel, pinch, `+`/`−` or the on-board buttons, drag to look around, and double-click (or press `0`) to reset. The 🎥 button turns the auto camera off.
- **✨ Particles:** every element has ambient particles (rocket smoke and exhaust, rising UFO motes, swirling wormholes, black-hole accretion, comet ice, storm sparks, fireball flames, solar embers, Andromeda glitter). Each interaction adds its own burst, trail and shockwave.
- **🎵 Music & sound:** a generated space-ambient soundtrack that builds from calm pads to a driving groove in the final stretch, plus synthesized sound effects for every action. Music and sound effects can be toggled separately.
- **🧪 Test mode** (setup screen toggle, or `index.html?test`): choose the next dice value and teleport the current player.

Keys: `Space` roll · `+` `−` zoom · `0` reset view.

Built with **Three.js** (3D dice), **GSAP** (animation), **canvas-confetti**, a custom canvas particle engine, and Web Audio (music and sound).

## Run
Open `index.html` in a browser, or serve the folder (`python3 -m http.server 8080`) and visit http://localhost:8080. No build step is needed. The libraries are bundled in `js/lib/`, so the game works offline (only the Google Fonts need a connection, and it falls back to system fonts).

## Structure
```
index.html        markup & screens
css/style.css     styling
js/board.js       grid & board elements (SVG)
js/dice.js        Three.js 3D dice
js/camera.js      cinematic zoom / follow camera
js/particles.js   canvas particle engine
js/music.js       generative soundtrack
js/audio.js       sound effects
js/game.js        setup, turns, movement, events, win
js/starfield.js   animated background
js/lib/           three.js r128, gsap 3.12.5, canvas-confetti 1.9.3
```
