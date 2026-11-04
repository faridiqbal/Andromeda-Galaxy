# Andromeda Quest 🚀🌌

A space-themed take on snakes & ladders for 1–5 players, built with plain HTML/CSS/JavaScript.

- **Rockets** are the ladders: land on a launch pad and blast up the board.
- **Space serpents** are the snakes: land on a serpent's head and slide down its body.
- **Square 100 is the Andromeda Galaxy.** Land on it exactly to win. If your roll overshoots it, you bounce back for the remaining pips (e.g. 97 + 6 → 98, 99, 100, 99, 98, **97**).

## Features
- Up to 5 players, each with a custom name and one of 10 emblems (no two players can share one).
- 3D dice rendered with **Three.js**, thrown across the board with spin, bounces and shadows.
- Token hops, rocket flights and serpent slides animated with **GSAP**.
- Confetti celebration (**canvas-confetti**), animated starfield, synthesized sound effects (Web Audio) with a mute toggle.
- Responsive layout for desktop and mobile. Press **Space** to roll.

## Run
Open `index.html` in a browser. No build step is needed. The libraries are bundled in `js/lib/`, so the game works offline (only the Google Fonts need a connection, and it falls back to system fonts).

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
