/* Board construction: grid cells and the space hazards / boosts that move players. */
const Board = (() => {
  // Every square that moves you: start -> { to, kind }
  //   UP:   rocket, ufo (tractor beam), wormhole, comet
  //   DOWN: storm (ion storm lightning), blackhole, asteroid (flaming fireball), flare (solar flare)
  const JUMPS = {
    4: { to: 14, kind: "rocket" },
    9: { to: 31, kind: "ufo" },
    12: { to: 33, kind: "comet" },
    21: { to: 42, kind: "wormhole" },
    28: { to: 76, kind: "rocket" },
    36: { to: 57, kind: "comet" },
    51: { to: 67, kind: "ufo" },
    71: { to: 91, kind: "rocket" },

    17: { to: 7, kind: "storm" },
    48: { to: 26, kind: "flare" },
    54: { to: 34, kind: "asteroid" },
    62: { to: 19, kind: "blackhole" },
    64: { to: 45, kind: "flare" },
    87: { to: 24, kind: "storm" },
    93: { to: 73, kind: "blackhole" },
    95: { to: 75, kind: "asteroid" },
    98: { to: 79, kind: "storm" },
  };

  // How many of each element a board has (the layout itself is randomised every game)
  // How many of each element the current board has. Re-picked at random for every layout:
  // 7 boosts and 7 hazards, every kind at least once, the 3 extra of each side random.
  const PER_SIDE = 7;
  let COUNTS = {};

  // How far each kind moves you, in squares [min, max]
  const REACH = {
    rocket: [18, 45], ufo: [12, 30], wormhole: [15, 40], comet: [12, 30],
    storm: [15, 45], blackhole: [18, 45], asteroid: [12, 30], flare: [10, 26],
  };

  const KINDS = {
    rocket:    { up: true,  icon: "🚀", name: "Rocket",       title: "Rocket boost!",   verb: "rocket-boosted to" },
    ufo:       { up: true,  icon: "🛸", name: "UFO beam",     title: "Tractor beam!",   verb: "was beamed up by a friendly UFO to" },
    wormhole:  { up: true,  icon: "🌀", name: "Wormhole",     title: "Wormhole warp!",  verb: "warped through a wormhole to" },
    comet:     { up: true,  icon: "☄️", name: "Comet ride",   title: "Comet ride!",     verb: "hitched a ride on a comet to" },
    storm:     { up: false, icon: "⚡", name: "Ion storm",    title: "Lightning strike!", verb: "was zapped by an ion storm down to" },
    blackhole: { up: false, icon: "🕳️", name: "Black hole",   title: "Black hole!",     verb: "fell into a black hole and came out at" },
    asteroid:  { up: false, icon: "🔥", name: "Fireball asteroid", title: "Fireball strike!", verb: "was blasted by a flaming asteroid down to" },
    flare:     { up: false, icon: "☀️", name: "Solar flare",  title: "Solar flare!",    verb: "got blasted by a solar flare down to" },
  };

  const ROCKET_COLORS = ["#ff4d6d", "#4cc9f0", "#ffd166", "#06d6a0", "#b388ff", "#ff9e00", "#00f5d4", "#f72585"];

  const NS = "http://www.w3.org/2000/svg";
  const guides = {}; // start square -> invisible SVG path used to animate tokens
  let cells = {};    // square -> cell element
  const BEACONS = []; // squares holding a cosmic beacon (landing there triggers a cosmic event)
  const BEACON_COUNT = 2;
  let svgRoot = null;

  /** Cell number (1..100) -> centre in board units (0..1000). */
  function cellXY(n) {
    const i = n - 1;
    const row = Math.floor(i / 10);              // 0 = bottom row
    const c = i % 10;
    const col = row % 2 === 0 ? c : 9 - c;        // boustrophedon
    return { x: col * 100 + 50, y: (9 - row) * 100 + 50, row, col };
  }

  // Deterministic pseudo-random so the board looks the same every game
  function prng(seed) {
    let s = seed * 9301 + 49297;
    return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  }

  function build(gridEl, svgEl) {
    gridEl.innerHTML = "";
    svgRoot = svgEl;
    buildCells(gridEl);
    applyLayout();
  }

  const rowOf = n => Math.floor((n - 1) / 10);

  /**
   * Random layout with the same number of each element. Rules kept:
   *  - boosts always go up, hazards always go down, and never to/from squares 1 or 100
   *  - no square is used twice (so no element starts where another starts or ends: no chains)
   *  - every element moves you to a different row, and starts aren't packed side by side
   *  - `avoid` squares (e.g. where pieces stand) never get an element start
   */
  function pickCounts() {
    const counts = {};
    for (const up of [true, false]) {
      const kinds = Object.keys(KINDS).filter(k => KINDS[k].up === up);
      kinds.forEach(k => (counts[k] = 1));
      for (let i = kinds.length; i < PER_SIDE; i++) counts[kinds[Math.floor(Math.random() * kinds.length)]]++;
    }
    return counts;
  }

  function generateLayout(avoid = [], COUNTS = pickCounts()) {
    const kinds = Object.keys(COUNTS).sort((a, b) => REACH[b][1] - REACH[a][1]);
    for (let attempt = 0; attempt < 3000; attempt++) {
      const used = new Set([1, 100]);
      const starts = new Set();
      const out = {};
      const left = { ...COUNTS };
      const perRow = Array(10).fill(0); // element squares (starts AND destinations) in each row, max MAX_PER_ROW
      let ok = true;

      // Guard the finish line: one hazard always starts on a square from 95 to 99
      const guardSquares = FINAL_GUARD.filter(n => !avoid.includes(n));
      if (!guardSquares.length) return null;
      const hazardPool = kinds.filter(k => !KINDS[k].up).flatMap(k => Array(COUNTS[k]).fill(k));
      const gk = hazardPool[Math.floor(Math.random() * hazardPool.length)];
      const gFrom = guardSquares[Math.floor(Math.random() * guardSquares.length)];
      const [glo, ghi] = REACH[gk];
      const gTo = gFrom - (glo + Math.floor(Math.random() * (ghi - glo + 1)));
      out[gFrom] = { to: gTo, kind: gk };
      used.add(gFrom); used.add(gTo); starts.add(gFrom);
      perRow[rowOf(gFrom)]++; perRow[rowOf(gTo)]++;
      left[gk]--;

      for (const kind of kinds) {
        for (let c = 0; c < left[kind] && ok; c++) {
          let placed = false;
          for (let t = 0; t < 300 && !placed; t++) {
            const [lo, hi] = REACH[kind];
            const dist = lo + Math.floor(Math.random() * (hi - lo + 1));
            const up = KINDS[kind].up;
            const from = up ? 2 + Math.floor(Math.random() * (99 - dist - 1)) : dist + 2 + Math.floor(Math.random() * (98 - dist - 1));
            const to = up ? from + dist : from - dist;
            if (from < 2 || from > 99 || to < 2 || to > 99) continue;
            if (used.has(from) || used.has(to) || avoid.includes(from)) continue;
            if (starts.has(from - 1) || starts.has(from + 1)) continue;
            if (rowOf(from) === rowOf(to)) continue;
            if (perRow[rowOf(from)] >= MAX_PER_ROW || perRow[rowOf(to)] >= MAX_PER_ROW) continue;
            // prefer quieter rows so the limit is easy to meet
            const load = perRow[rowOf(from)] + perRow[rowOf(to)];
            if (load > 3 && Math.random() < 0.6) continue;
            out[from] = { to, kind };
            used.add(from); used.add(to); starts.add(from);
            perRow[rowOf(from)]++; perRow[rowOf(to)]++;
            placed = true;
          }
          if (!placed) ok = false;
        }
        if (!ok) break;
      }
      if (ok && isBalanced(out)) return out;
    }
    return null;
  }

  /**
   * Fairness: each third of the board (2–33, 34–66, 67–99) gets at least 2 boosts and
   * 2 hazards (with 7 of each, one third gets a third boost / hazard).
   * There is also always at least one hazard starting on squares 95–99, and no board row
   * holds more than 3 element squares (starts and destinations together).
   */
  const BANDS = [[2, 33], [34, 66], [67, 99]];
  const FINAL_GUARD = [95, 96, 97, 98, 99];
  const MAX_PER_ROW = 3; // element squares per row, counting starts and destinations
  function isBalanced(layout) {
    const guarded = FINAL_GUARD.some(n => layout[n] && !KINDS[layout[n].kind].up);
    const perRow = Array(10).fill(0);
    for (const [f, j] of Object.entries(layout)) { perRow[rowOf(+f)]++; perRow[rowOf(j.to)]++; }
    if (perRow.some(c => c > MAX_PER_ROW)) return false;
    return guarded && BANDS.every(([lo, hi]) => {
      let up = 0, down = 0;
      for (const [f, j] of Object.entries(layout)) {
        if (+f < lo || +f > hi) continue;
        KINDS[j.kind].up ? up++ : down++;
      }
      return up >= 2 && down >= 2;
    });
  }

  /** Square under a point in board units (0..1000), or null. */
  function cellAt(x, y) {
    if (x < 0 || y < 0 || x >= 1000 || y >= 1000) return null;
    const col = Math.floor(x / 100), row = 9 - Math.floor(y / 100);
    return row * 10 + (row % 2 === 0 ? col : 9 - col) + 1;
  }

  /** Jump that starts or ends on square n: { from, to, kind } or null. */
  function jumpAt(n) {
    if (JUMPS[n]) return { from: n, ...JUMPS[n] };
    for (const [f, j] of Object.entries(JUMPS)) if (j.to === n) return { from: +f, ...j };
    return null;
  }

  /** Replace the layout with a fresh random one (same counts), and redraw. */
  function randomize(avoid = []) {
    // try a few random mixes in case one is awkward to place
    let next = null, counts = null;
    for (let i = 0; i < 6 && !next; i++) { counts = pickCounts(); next = generateLayout(avoid, counts); }
    if (!next) return false;
    COUNTS = counts;
    for (const k of Object.keys(JUMPS)) delete JUMPS[k];
    Object.assign(JUMPS, next);
    placeBeacons(avoid);
    applyLayout();
    return true;
  }

  /**
   * Put each beacon in the middle of the biggest empty stretch between element squares
   * (starts and destinations, plus squares 1 and 100), one after the other.
   */
  function placeBeacons(avoid = []) {
    BEACONS.length = 0;
    const taken = new Set([1, 100]);
    for (const [f, j] of Object.entries(JUMPS)) { taken.add(+f); taken.add(j.to); }
    for (let b = 0; b < BEACON_COUNT; b++) {
      const sorted = [...taken].sort((x, y) => x - y);
      let best = null;
      for (let i = 0; i < sorted.length - 1; i++) {
        const lo = sorted[i], hi = sorted[i + 1], gap = hi - lo - 1;
        if (gap < 1) continue;
        // middle of the gap, nudged off any square a piece is standing on
        const mid = Math.floor((lo + hi) / 2);
        const spot = [0, 1, -1, 2, -2, 3, -3].map(d => mid + d).find(n => n > lo && n < hi && !avoid.includes(n));
        if (spot && (!best || gap > best.gap)) best = { gap, spot };
      }
      if (!best) break;
      BEACONS.push(best.spot);
      taken.add(best.spot);
    }
  }

  /** Redraw elements and start-square markers for the current layout. */
  function applyLayout() {
    for (const k of Object.keys(guides)) delete guides[k];
    for (const [n, c] of Object.entries(cells)) {
      c.classList.remove("up-start", "down-start", "beacon-start");
      const j = JUMPS[n];
      if (j) c.classList.add(KINDS[j.kind].up ? "up-start" : "down-start");
      if (BEACONS.includes(+n)) c.classList.add("beacon-start");
    }
    svgRoot.innerHTML = "";
    buildSvg(svgRoot);
  }

  function buildCells(gridEl) {
    cells = {};
    const hues = [232, 250, 268, 218, 285];
    for (let n = 1; n <= 100; n++) {
      const { row, col } = cellXY(n);
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.style.gridRow = String(10 - row);
      cell.style.gridColumn = String(col + 1);
      const r = prng(n);
      const hue = hues[(row + col) % hues.length] + Math.floor(r() * 12);
      const light = (row + col) % 2 === 0 ? 14 : 19;
      cell.style.setProperty("--cell-bg",
        `radial-gradient(circle at ${20 + r() * 60}% ${20 + r() * 60}%, hsla(${hue + 30},70%,40%,0.25), transparent 70%),
         linear-gradient(145deg, hsl(${hue},45%,${light}%), hsl(${hue + 15},50%,${light - 6}%))`);


      const num = document.createElement("span");
      num.className = "num";
      num.textContent = n;
      cell.appendChild(num);

      if (n === 1) {
        cell.classList.add("earth");
        cell.insertAdjacentHTML("beforeend", `<div class="earth-ball"></div><div class="label">EARTH</div>`);
      } else if (n === 100) {
        cell.classList.add("goal");
        const tilt = document.createElement("div");
        tilt.className = "galaxy-tilt";
        const cv = document.createElement("canvas");
        cv.className = "galaxy-spin";
        drawGalaxy(cv);
        tilt.appendChild(cv);
        cell.appendChild(tilt);
        cell.insertAdjacentHTML("beforeend", `<div class="label">ANDROMEDA</div>`);
      } else if (r() < 0.22) {
        // Decorative mini planet
        const p = document.createElement("div");
        p.className = "mini-planet" + (r() < 0.35 ? " ringed" : "");
        const size = 10 + r() * 12;
        const ph = Math.floor(r() * 360);
        Object.assign(p.style, {
          width: size + "%", height: size + "%",
          right: 8 + r() * 30 + "%", bottom: 8 + r() * 30 + "%",
          background: `radial-gradient(circle at 35% 30%, hsl(${ph},80%,75%), hsl(${ph},60%,40%) 60%, hsl(${ph},50%,18%))`,
        });
        cell.appendChild(p);
      }
      cells[n] = cell;
      gridEl.appendChild(cell);
    }
  }

  /** Paint a little spiral galaxy for square 100. */
  function drawGalaxy(cv) {
    const S = 320;
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    const cx = S / 2, cy = S / 2;
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, S * 0.48);
    glow.addColorStop(0, "rgba(255,240,210,1)");
    glow.addColorStop(0.12, "rgba(255,200,140,0.8)");
    glow.addColorStop(0.35, "rgba(170,120,255,0.25)");
    glow.addColorStop(1, "rgba(60,40,140,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, S, S);
    const rnd = prng(100);
    for (let i = 0; i < 3200; i++) {
      const arm = i % 2;
      const r = Math.pow(rnd(), 0.65) * S * 0.46;
      const theta = r * 0.038 + arm * Math.PI + (rnd() - 0.5) * (0.9 - r / (S * 0.7));
      const jitter = (rnd() - 0.5) * 10;
      const x = cx + Math.cos(theta) * r + jitter;
      const y = cy + Math.sin(theta) * r + jitter;
      const k = r / (S * 0.46);
      const col = k < 0.3 ? [255, 225, 180] : k < 0.6 ? [210, 190, 255] : [140, 190, 255];
      g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.25 + rnd() * 0.6 * (1 - k * 0.6)})`;
      const sz = rnd() < 0.04 ? 2.4 : 1.1;
      g.fillRect(x, y, sz, sz);
    }
  }

  // ---------- SVG helpers ----------
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /** Catmull-Rom spline through points -> SVG path data. */
  function smoothPath(pts, closed = false) {
    const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
    let d = `M${p[1].x.toFixed(1)},${p[1].y.toFixed(1)}`;
    for (let i = 1; i < p.length - 2; i++) {
      const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function buildSvg(svg) {
    const defs = el("defs", {}, svg);
    const glow = el("filter", { id: "glow", x: "-50%", y: "-50%", width: "200%", height: "200%" }, defs);
    el("feGaussianBlur", { stdDeviation: "4", result: "b" }, glow);
    const merge = el("feMerge", {}, glow);
    el("feMergeNode", { in: "b" }, merge);
    el("feMergeNode", { in: "SourceGraphic" }, merge);

    const DRAW = {
      rocket: drawRocket, ufo: drawUfo, wormhole: drawWormhole, comet: drawComet,
      storm: drawStorm, blackhole: drawBlackhole, asteroid: drawAsteroid, flare: drawFlare,
    };
    // draw order: things that sit "under" first
    const order = ["comet", "flare", "wormhole", "ufo", "rocket", "storm", "asteroid", "blackhole"];
    const count = {};
    // every path line sits behind every element graphic, so lines never cover an element
    linesRoot = el("g", { class: "lines-layer" }, svg);
    objectsRoot = el("g", { class: "objects-layer" }, svg);
    for (const kind of order) {
      const layer = null;
      for (const [from, j] of Object.entries(JUMPS)) {
        if (j.kind !== kind) continue;
        const i = (count[kind] = (count[kind] || 0) + 1) - 1;
        DRAW[kind](layer, defs, +from, j.to, i);
      }
    }
    BEACONS.forEach((n, i) => drawBeacon(defs, n, i));
  }

  // ---------- Cosmic beacon (triggers a cosmic event) ----------
  function drawBeacon(defs, n, i) {
    const c = cellXY(n);
    const g = el("g", { class: "beacon", "data-beacon": n, transform: `translate(${c.x},${c.y + 4})` }, objectsRoot);
    const rg = el("radialGradient", { id: `bc${n}` }, defs);
    el("stop", { offset: "0", "stop-color": "#e0c3ff", "stop-opacity": 0.65 }, rg);
    el("stop", { offset: "0.6", "stop-color": "#7b2ff7", "stop-opacity": 0.3 }, rg);
    el("stop", { offset: "1", "stop-color": "#7b2ff7", "stop-opacity": 0 }, rg);
    el("circle", { r: 36, fill: `url(#bc${n})` }, g);
    // signal waves
    for (let k = 0; k < 2; k++) el("circle", { r: 16, fill: "none", stroke: "#c77dff", "stroke-width": 2.5, class: "beacon-wave", style: `animation-delay:${k * 0.9 + i * 0.4}s` }, g);
    // pad
    el("ellipse", { cx: 0, cy: 18, rx: 20, ry: 6, fill: "#2a1d5c", stroke: "#c77dff", "stroke-width": 1.5 }, g);
    // mast and dish
    el("path", { d: "M-6,18 L0,0 L6,18", fill: "none", stroke: "#d9ccff", "stroke-width": 3, "stroke-linejoin": "round" }, g);
    el("path", { d: "M-17,-4 Q0,14 17,-4 Z", fill: "#eee6ff", stroke: "#9b7cf0", "stroke-width": 1.5, transform: "rotate(-20)" }, g);
    el("line", { x1: 0, y1: 2, x2: 7, y2: -16, stroke: "#d9ccff", "stroke-width": 2 }, g);
    el("circle", { cx: 7, cy: -18, r: 4.5, fill: "#ffffff", class: "beacon-orb" }, g);
  }

  // ---------- shared geometry ----------
  /** Quadratic arc from a to b, bulging sideways by `bend` (fraction of length). */
  function arcD(a, b, bend) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const cx = (a.x + b.x) / 2 + (-dy / len) * len * bend;
    const cy = (a.y + b.y) / 2 + (dx / len) * len * bend;
    return `M${a.x},${a.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x},${b.y}`;
  }
  function guide(g, from, d) { guides[from] = el("path", { d, fill: "none", stroke: "none" }, g); }
  let linesRoot = null, objectsRoot = null;
  /** Element group (front layer); its path lines go in g.lines (back layer). */
  function group(layer, kind, from) {
    const g = el("g", { class: `jump jump-${kind}`, id: `jump-${from}`, "data-jump": from }, objectsRoot);
    g.lines = el("g", { class: `jump jump-${kind} jump-lines`, "data-jump": from }, linesRoot);
    return g;
  }
  /** Both layers of the element starting at `from` (for highlighting). */
  function jumpEls(from) { return document.querySelectorAll(`[data-jump="${from}"]`); }
  function grad(defs, id, a, b, stops) {
    const gr = el("linearGradient", { id, gradientUnits: "userSpaceOnUse", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, defs);
    stops.forEach(([o, c, op = 1]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": op }, gr));
    return `url(#${id})`;
  }
  function startRing(g, a, color) {
    el("circle", { cx: a.x, cy: a.y, r: 26, fill: "none", stroke: color, "stroke-width": 3, "stroke-dasharray": "6 5", opacity: 0.8, class: "pad-ring" }, g);
  }

  // ---------- UFO tractor beam (up) ----------
  function drawUfo(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const g = group(layer, "ufo", from);
    const ux = b.x, uy = b.y - 6;
    const dx = a.x - ux, dy = a.y - uy, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const beam = [
      [ux + nx * 14, uy + ny * 14], [ux - nx * 14, uy - ny * 14],
      [a.x - nx * 40, a.y - ny * 40], [a.x + nx * 40, a.y + ny * 40],
    ].map(q => q.map(v => v.toFixed(1)).join(",")).join(" ");
    const cid = `ufo-clip-${from}`;
    const clip = el("clipPath", { id: cid }, defs);
    el("polygon", { points: beam }, clip);
    el("polygon", { points: beam, fill: grad(defs, `ub${from}`, { x: ux, y: uy }, a, [["0", "#9dffb0", 0.6], ["1", "#3ee08f", 0.08]]) }, g.lines);
    // light bands travelling up the beam
    el("line", { x1: a.x, y1: a.y, x2: ux, y2: uy, stroke: "#c8ffd6", "stroke-width": 90, "stroke-dasharray": "4 26", class: "beam-bands", "clip-path": `url(#${cid})`, opacity: 0.45 }, g.lines);
    guide(g.lines, from, `M${a.x},${a.y} L${ux},${uy}`);
    startRing(g, a, "#3ee08f");
    el("circle", { cx: a.x, cy: a.y, r: 30, fill: "#3ee08f", opacity: 0.15, class: "beam-spot" }, g);

    // saucer
    const s = el("g", { transform: `translate(${ux},${uy})`, class: "ufo" }, g);
    const body = el("g", { class: "ufo-bob" }, s);
    el("ellipse", { cx: 0, cy: -8, rx: 15, ry: 13, fill: "rgba(150,240,255,0.55)", stroke: "#d9fbff", "stroke-width": 1.5 }, body);
    el("ellipse", { cx: -4, cy: -13, rx: 4, ry: 3, fill: "#fff", opacity: 0.7 }, body);
    el("ellipse", { cx: 0, cy: 2, rx: 36, ry: 11, fill: grad(defs, `us${from}`, { x: ux, y: uy - 10 }, { x: ux, y: uy + 12 }, [["0", "#eef2ff"], ["0.55", "#9aa5d1"], ["1", "#4b557f"]]), stroke: "#2a3157", "stroke-width": 1.5 }, body);
    [-24, -8, 8, 24].forEach((x, k) => el("circle", { cx: x, cy: 4, r: 3, fill: k % 2 ? "#ffd166" : "#3ee08f", class: "ufo-light", style: `animation-delay:${k * 0.2}s` }, body));
  }

  // ---------- Wormhole (up) ----------
  function portal(g, p, c1, c2, id, defs, reverse) {
    const rg = el("radialGradient", { id }, defs);
    el("stop", { offset: "0", "stop-color": "#000" }, rg);
    el("stop", { offset: "0.45", "stop-color": c2 }, rg);
    el("stop", { offset: "0.8", "stop-color": c1, "stop-opacity": 0.8 }, rg);
    el("stop", { offset: "1", "stop-color": c1, "stop-opacity": 0 }, rg);
    const outer = el("g", { transform: `translate(${p.x},${p.y})` }, g);
    el("circle", { r: 40, fill: `url(#${id})` }, outer);
    const spin = el("g", { class: reverse ? "spin-rev" : "spin" }, outer);
    for (let arm = 0; arm < 3; arm++) {
      let d = "";
      for (let k = 0; k <= 26; k++) {
        const r = 3 + k * 1.25, th = k * 0.32 + (arm * Math.PI * 2) / 3;
        d += (k ? " L" : "M") + (Math.cos(th) * r).toFixed(1) + "," + (Math.sin(th) * r).toFixed(1);
      }
      el("path", { d, fill: "none", stroke: "#fff", "stroke-width": 2.2, "stroke-linecap": "round", opacity: 0.75 }, spin);
    }
  }
  function drawWormhole(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const g = group(layer, "wormhole", from);
    const d = arcD(a, b, i % 2 ? 0.28 : -0.28);
    el("path", { d, fill: "none", stroke: "#c77dff", "stroke-width": 6, opacity: 0.25, filter: "url(#glow)" }, g.lines);
    el("path", { d, fill: "none", stroke: "#e0c3ff", "stroke-width": 2.5, "stroke-dasharray": "2 12", "stroke-linecap": "round", class: "flow", opacity: 0.8 }, g.lines);
    guide(g.lines, from, d);
    portal(g, a, "#36d1ff", "#3a0ca3", `wa${from}`, defs, false);
    portal(g, b, "#c77dff", "#7209b7", `wb${from}`, defs, true);
  }

  // ---------- Comet ride (up) ----------
  function drawComet(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const g = group(layer, "comet", from);
    const d = arcD(a, b, i % 2 ? -0.22 : 0.22);
    const tail = grad(defs, `ct${from}`, a, b, [["0", "#36d1ff", 0], ["0.6", "#7fe7ff", 0.5], ["1", "#ffffff", 1]]);
    el("path", { d, fill: "none", stroke: "#36d1ff", "stroke-width": 26, "stroke-linecap": "round", opacity: 0.16, filter: "url(#glow)" }, g.lines);
    el("path", { d, fill: "none", stroke: tail, "stroke-width": 11, "stroke-linecap": "round" }, g.lines);
    el("path", { d, fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-dasharray": "1 16", "stroke-linecap": "round", class: "flow", opacity: 0.9 }, g.lines);
    guide(g.lines, from, d);
    startRing(g, a, "#7fe7ff");
    // sparkles along the tail
    const gp = guides[from], L = gp.getTotalLength();
    for (let k = 1; k <= 5; k++) {
      const pt = gp.getPointAtLength(L * (k / 7));
      el("circle", { cx: pt.x + ((k * 13) % 17) - 8, cy: pt.y + ((k * 7) % 15) - 7, r: 2, fill: "#fff", class: "twinkle", style: `animation-delay:${k * 0.3}s` }, g.lines);
    }
    // icy head at destination
    const hg = el("radialGradient", { id: `ch${from}` }, defs);
    el("stop", { offset: "0", "stop-color": "#fff" }, hg);
    el("stop", { offset: "0.5", "stop-color": "#bdf3ff" }, hg);
    el("stop", { offset: "1", "stop-color": "#36d1ff", "stop-opacity": 0 }, hg);
    el("circle", { cx: b.x, cy: b.y, r: 30, fill: `url(#ch${from})`, class: "comet-head" }, g);
    el("circle", { cx: b.x, cy: b.y, r: 9, fill: "#fff" }, g);
  }

  // ---------- Black hole (down) ----------
  function drawBlackhole(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const g = group(layer, "blackhole", from);
    const d = arcD(a, b, i % 2 ? 0.2 : -0.2);
    el("path", { d, fill: "none", stroke: "#ff7b54", "stroke-width": 2.5, "stroke-dasharray": "3 10", "stroke-linecap": "round", opacity: 0.55, class: "flow" }, g.lines);
    guide(g.lines, from, d);
    // exit (where you get spat out)
    el("circle", { cx: b.x, cy: b.y, r: 22, fill: "none", stroke: "#ff7b54", "stroke-width": 2.5, "stroke-dasharray": "4 6", opacity: 0.8, class: "pad-ring" }, g);
    el("circle", { cx: b.x, cy: b.y, r: 5, fill: "#ff7b54", opacity: 0.7 }, g);
    // the black hole itself
    const o = el("g", { transform: `translate(${a.x},${a.y})` }, g);
    const glowG = el("radialGradient", { id: `bg${from}` }, defs);
    el("stop", { offset: "0.35", "stop-color": "#ffb347", "stop-opacity": 0.9 }, glowG);
    el("stop", { offset: "0.6", "stop-color": "#ff4f00", "stop-opacity": 0.35 }, glowG);
    el("stop", { offset: "1", "stop-color": "#ff4f00", "stop-opacity": 0 }, glowG);
    el("circle", { r: 46, fill: `url(#bg${from})` }, o);
    const disk = el("g", { transform: "rotate(-18) scale(1,0.34)" }, o);
    const spin = el("g", { class: "spin-fast" }, disk);
    el("circle", { r: 40, fill: "none", stroke: "#ffd08a", "stroke-width": 9, "stroke-dasharray": "30 8 12 6", opacity: 0.9 }, spin);
    el("circle", { r: 30, fill: "none", stroke: "#ff7b54", "stroke-width": 5, "stroke-dasharray": "18 6", opacity: 0.8 }, spin);
    el("circle", { r: 19, fill: "#000", stroke: "#ffe2b0", "stroke-width": 2 }, o);
  }

  // ---------- Flaming asteroid (down) ----------
  function drawAsteroid(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const g = group(layer, "asteroid", from);
    // burning trail: up and over, then down to the crater
    const cx = (a.x + b.x) / 2 + (i % 2 ? 60 : -60), cy = Math.max(10, Math.min(a.y, b.y) - 90);
    const d = `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`;
    const fire = grad(defs, `at${from}`, a, b, [["0", "#fff3c4"], ["0.25", "#ffb347"], ["0.65", "#ff4f00", 0.8], ["1", "#b5179e", 0.35]]);
    el("path", { d, fill: "none", stroke: "#ff4f00", "stroke-width": 24, "stroke-linecap": "round", opacity: 0.22, filter: "url(#glow)", class: "fire-trail" }, g.lines);
    el("path", { d, fill: "none", stroke: fire, "stroke-width": 8, "stroke-linecap": "round", class: "fire-trail" }, g.lines);
    el("path", { d, fill: "none", stroke: "#fff6c9", "stroke-width": 2.5, "stroke-dasharray": "2 12", "stroke-linecap": "round", class: "flow", opacity: 0.85 }, g.lines);
    guide(g.lines, from, d);
    // scorched crater at landing square
    el("ellipse", { cx: b.x, cy: b.y + 8, rx: 26, ry: 10, fill: "rgba(20,5,0,0.55)", stroke: "#ff6b35", "stroke-width": 2.5, class: "fire-trail" }, g);

    // the fireball: a glowing, red-hot rock that stays inside its own square
    const o = el("g", { transform: `translate(${a.x},${a.y})`, class: "asteroid" }, g);
    const halo = el("radialGradient", { id: `ah${from}` }, defs);
    el("stop", { offset: "0", "stop-color": "#ffd166", "stop-opacity": 0.9 }, halo);
    el("stop", { offset: "0.5", "stop-color": "#ff4f00", "stop-opacity": 0.45 }, halo);
    el("stop", { offset: "1", "stop-color": "#ff4f00", "stop-opacity": 0 }, halo);
    el("circle", { r: 34, fill: `url(#ah${from})`, class: "sun-pulse" }, o);
    const r = prng(from * 7);
    const pts = [];
    for (let k = 0; k < 10; k++) {
      const th = (k / 10) * Math.PI * 2, rr = 14 + r() * 6;
      pts.push(`${(Math.cos(th) * rr).toFixed(1)},${(Math.sin(th) * rr).toFixed(1)}`);
    }
    const rg = el("radialGradient", { id: `ar${from}`, cx: "65%", cy: "35%" }, defs);
    el("stop", { offset: "0", "stop-color": "#ffe1a8" }, rg);
    el("stop", { offset: "0.35", "stop-color": "#ff7b2e" }, rg);
    el("stop", { offset: "1", "stop-color": "#4a1c10" }, rg);
    el("polygon", { points: pts.join(" "), fill: `url(#ar${from})`, stroke: "#ffb347", "stroke-width": 1.5 }, o);
    el("circle", { cx: -5, cy: 3, r: 3.5, fill: "#5a2412", opacity: 0.8 }, o);
    el("circle", { cx: -1, cy: -6, r: 2, fill: "#5a2412", opacity: 0.7 }, o);
  }

  // ---------- Ion storm lightning (down) ----------
  function drawStorm(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const g = group(layer, "storm", from);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const r = prng(from * 13);
    const N = Math.max(6, Math.round(len / 55));
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const off = k === 0 || k === N ? 0 : (k % 2 ? 1 : -1) * (12 + r() * 20);
      pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
    }
    const d = "M" + pts.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" L");
    const bolt = el("g", { class: "bolt-flicker", style: `animation-delay:${-i * 0.9}s` }, g.lines);
    el("path", { d, fill: "none", stroke: "#7fb8ff", "stroke-width": 18, "stroke-linejoin": "round", opacity: 0.3, filter: "url(#glow)" }, bolt);
    el("path", { d, fill: "none", stroke: "#cfe6ff", "stroke-width": 6, "stroke-linejoin": "round", "stroke-linecap": "round" }, bolt);
    el("path", { d, fill: "none", stroke: "#ffffff", "stroke-width": 2, "stroke-linejoin": "round" }, bolt);
    // forks branching off the main bolt
    for (const k of [Math.floor(N / 3), Math.floor((2 * N) / 3)]) {
      const p0 = pts[k], side = k % 2 ? 1 : -1;
      const f1 = { x: p0.x + nx * side * 30 + dx / N * 0.4, y: p0.y + ny * side * 30 + dy / N * 0.4 };
      const f2 = { x: f1.x + nx * side * 12 + dx / N * 0.5, y: f1.y + ny * side * 12 + dy / N * 0.5 };
      el("path", { d: `M${p0.x.toFixed(1)},${p0.y.toFixed(1)} L${f1.x.toFixed(1)},${f1.y.toFixed(1)} L${f2.x.toFixed(1)},${f2.y.toFixed(1)}`, fill: "none", stroke: "#cfe6ff", "stroke-width": 2.5, "stroke-linejoin": "round", opacity: 0.85 }, bolt);
    }
    guide(g.lines, from, d);
    // strike mark where you land
    el("circle", { cx: b.x, cy: b.y, r: 20, fill: "none", stroke: "#7fb8ff", "stroke-width": 2.5, "stroke-dasharray": "3 5", opacity: 0.85, class: "pad-ring" }, g);
    el("circle", { cx: b.x, cy: b.y, r: 5, fill: "#cfe6ff", opacity: 0.8 }, g);

    // the storm cloud
    const o = el("g", { transform: `translate(${a.x},${a.y - 6})`, class: "storm-cloud", style: `animation-delay:${-i * 0.9}s` }, g);
    const cg = el("linearGradient", { id: `sc${from}`, x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    el("stop", { offset: "0", "stop-color": "#8b7fd4" }, cg);
    el("stop", { offset: "0.55", "stop-color": "#463a85" }, cg);
    el("stop", { offset: "1", "stop-color": "#1d1640" }, cg);
    const fill = `url(#sc${from})`;
    el("ellipse", { cx: 0, cy: 8, rx: 36, ry: 13, fill }, o);
    [[-20, 2, 14], [0, -8, 19], [19, 1, 15], [-8, 6, 13], [10, 7, 13]].forEach(([x, y, rr]) =>
      el("circle", { cx: x, cy: y, r: rr, fill }, o));
    el("ellipse", { cx: -4, cy: -14, rx: 12, ry: 5, fill: "#c9c1ff", opacity: 0.35 }, o);
    el("path", { d: "M-4,14 L4,14 L-2,24 L6,24 L-6,40 L-1,27 L-8,27 Z", fill: "#fff6a8", stroke: "#ffd166", "stroke-width": 1 }, o);
  }

  // ---------- Solar flare (down) ----------
  function drawFlare(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const g = group(layer, "flare", from);
    const d = arcD(a, b, i % 2 ? 0.35 : -0.35);
    const plasma = grad(defs, `fp${from}`, a, b, [["0", "#fff3c4"], ["0.3", "#ffb347"], ["1", "#ff2e63", 0.5]]);
    el("path", { d, fill: "none", stroke: "#ff6b35", "stroke-width": 22, opacity: 0.2, filter: "url(#glow)", "stroke-linecap": "round" }, g.lines);
    el("path", { d, fill: "none", stroke: plasma, "stroke-width": 9, "stroke-linecap": "round", class: "flare-plasma" }, g.lines);
    el("path", { d, fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-dasharray": "3 14", "stroke-linecap": "round", class: "flow", opacity: 0.7 }, g.lines);
    guide(g.lines, from, d);
    el("circle", { cx: b.x, cy: b.y, r: 18, fill: "none", stroke: "#ff2e63", "stroke-width": 2.5, "stroke-dasharray": "4 5", opacity: 0.8 }, g);
    // the little sun
    const o = el("g", { transform: `translate(${a.x},${a.y})` }, g);
    const rays = el("g", { class: "spin" }, o);
    for (let k = 0; k < 12; k++) {
      const th = (k / 12) * Math.PI * 2;
      el("line", { x1: Math.cos(th) * 24, y1: Math.sin(th) * 24, x2: Math.cos(th) * (k % 2 ? 33 : 38), y2: Math.sin(th) * (k % 2 ? 33 : 38), stroke: "#ffd166", "stroke-width": 3, "stroke-linecap": "round" }, rays);
    }
    const sg = el("radialGradient", { id: `fs${from}`, cx: "40%", cy: "35%" }, defs);
    el("stop", { offset: "0", "stop-color": "#fffbe0" }, sg);
    el("stop", { offset: "0.5", "stop-color": "#ffc23d" }, sg);
    el("stop", { offset: "1", "stop-color": "#ff6b35" }, sg);
    el("circle", { r: 21, fill: `url(#fs${from})`, filter: "url(#glow)", class: "sun-pulse" }, o);
  }

  function drawRocket(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const color = ROCKET_COLORS[i % ROCKET_COLORS.length];
    const g = group(layer, "rocket", from);

    const gid = `rg${from}`;
    const grad = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, defs);
    el("stop", { offset: "0", "stop-color": "#ff6b35", "stop-opacity": "0.05" }, grad);
    el("stop", { offset: "0.6", "stop-color": "#ffb347", "stop-opacity": "0.55" }, grad);
    el("stop", { offset: "1", "stop-color": "#fff3c4", "stop-opacity": "0.95" }, grad);

    // launch pad ring
    el("circle", { cx: a.x, cy: a.y, r: 26, fill: "none", stroke: color, "stroke-width": 3, "stroke-dasharray": "6 5", opacity: 0.8 }, g);
    el("circle", { cx: a.x, cy: a.y, r: 8, fill: color, opacity: 0.6 }, g);

    guide(g.lines, from, `M${a.x},${a.y} L${b.x},${b.y}`);
    // exhaust trail
    el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: `url(#${gid})`, "stroke-width": 16, "stroke-linecap": "round", filter: "url(#glow)" }, g.lines);
    el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", class: "rocket-trail-dash", opacity: 0.7 }, g.lines);

    // the rocket itself, parked inside its destination square, pointing along the trail
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    const rocket = el("g", { class: "rocket", transform: `translate(${b.x},${b.y}) rotate(${ang.toFixed(1)}) translate(0,-6) scale(0.95)` }, g);
    el("path", { class: "flame", d: "M-7,22 Q0,52 7,22 Z", fill: "#ffb347" }, rocket);
    el("path", { class: "flame", d: "M-4,22 Q0,40 4,22 Z", fill: "#fff6c9" }, rocket);
    el("path", { d: "M-9,6 L-19,27 L-8,22 Z", fill: color }, rocket);
    el("path", { d: "M9,6 L19,27 L8,22 Z", fill: color }, rocket);
    el("path", { d: "M0,-32 C13,-19 12,8 9,22 L-9,22 C-12,8 -13,-19 0,-32 Z", fill: "#eef2ff", stroke: "#9aa5d1", "stroke-width": 1.2 }, rocket);
    el("path", { d: "M0,-32 C6,-26 9,-21 10.5,-15 L-10.5,-15 C-9,-21 -6,-26 0,-32 Z", fill: color }, rocket);
    el("circle", { cx: 0, cy: -4, r: 5.5, fill: "#4fc3f7", stroke: "#1b2a4a", "stroke-width": 2 }, rocket);
    el("circle", { cx: -1.8, cy: -5.8, r: 1.6, fill: "#fff", opacity: 0.8 }, rocket);
    el("rect", { x: -1.5, y: 8, width: 3, height: 13, rx: 1.5, fill: color }, rocket);
  }

  /** Point along the path of the jump starting at `from`; t in 0..1. */
  function pathPoint(from, t) {
    const p = guides[from];
    const pt = p.getPointAtLength(p.getTotalLength() * t);
    return { x: pt.x, y: pt.y };
  }

  return { get COUNTS() { return COUNTS; }, BEACONS, jumpEls, JUMPS, KINDS, BANDS, cellXY, cellAt, jumpAt, isBalanced, build, pathPoint, randomize, svg: () => svgRoot };
})();
