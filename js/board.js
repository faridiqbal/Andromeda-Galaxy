/* Board construction: grid cells, rockets (ladders), space serpents (snakes). */
const Board = (() => {
  // start -> end
  const ROCKETS = { 4: 14, 9: 31, 21: 42, 28: 76, 36: 44, 51: 67, 71: 91, 80: 99 };
  const SERPENTS = { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79 };

  const SERPENT_COLORS = [
    ["#ff4f9a", "#7b2ff7"], ["#00e5a8", "#006d77"], ["#ffb703", "#d00000"], ["#9b5de5", "#00bbf9"],
    ["#f15bb5", "#fee440"], ["#4cc9f0", "#3a0ca3"], ["#80ffdb", "#5390d9"], ["#ff8500", "#7209b7"],
  ];
  const ROCKET_COLORS = ["#ff4d6d", "#4cc9f0", "#ffd166", "#06d6a0", "#b388ff", "#ff9e00", "#00f5d4", "#f72585"];

  const NS = "http://www.w3.org/2000/svg";
  const centrelines = {}; // serpent head -> SVGPathElement

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
    svgEl.innerHTML = "";
    buildCells(gridEl);
    buildSvg(svgEl);
  }

  function buildCells(gridEl) {
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

      if (ROCKETS[n]) cell.classList.add("r-start");
      if (SERPENTS[n]) cell.classList.add("s-head");

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

    const rocketLayer = el("g", { class: "rocket-layer" }, svg);
    const serpentLayer = el("g", { class: "serpent-layer" }, svg);

    Object.entries(ROCKETS).forEach(([s, e], i) => drawRocket(rocketLayer, defs, +s, e, i));
    Object.entries(SERPENTS).forEach(([h, t], i) => drawSerpent(serpentLayer, defs, +h, t, i));
  }

  function drawRocket(layer, defs, from, to, i) {
    const a = cellXY(from), b = cellXY(to);
    const color = ROCKET_COLORS[i % ROCKET_COLORS.length];
    const g = el("g", { class: "rocket-group", id: `rocket-${from}` }, layer);

    const gid = `rg${from}`;
    const grad = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, defs);
    el("stop", { offset: "0", "stop-color": "#ff6b35", "stop-opacity": "0.05" }, grad);
    el("stop", { offset: "0.6", "stop-color": "#ffb347", "stop-opacity": "0.55" }, grad);
    el("stop", { offset: "1", "stop-color": "#fff3c4", "stop-opacity": "0.95" }, grad);

    // launch pad ring
    el("circle", { cx: a.x, cy: a.y, r: 26, fill: "none", stroke: color, "stroke-width": 3, "stroke-dasharray": "6 5", opacity: 0.8 }, g);
    el("circle", { cx: a.x, cy: a.y, r: 8, fill: color, opacity: 0.6 }, g);

    // exhaust trail
    el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: `url(#${gid})`, "stroke-width": 16, "stroke-linecap": "round", filter: "url(#glow)" }, g);
    el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round", class: "rocket-trail-dash", opacity: 0.7 }, g);

    // the rocket itself, near the destination, pointing along the trail
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    const t = 0.86;
    const rx = a.x + (b.x - a.x) * t, ry = a.y + (b.y - a.y) * t;
    const rocket = el("g", { class: "rocket", transform: `translate(${rx.toFixed(1)},${ry.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(1.25)` }, g);
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

  function drawSerpent(layer, defs, head, tail, i) {
    const a = cellXY(head), b = cellXY(tail);
    const [c1, c2] = SERPENT_COLORS[i % SERPENT_COLORS.length];
    const g = el("g", { class: "serpent-group", id: `serpent-${head}` }, layer);

    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const waves = Math.max(1, Math.round(len / 230));
    const amp = Math.min(55, 18 + len * 0.07);
    const N = 40;
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const env = Math.sin(Math.PI * Math.min(1, t * 1.1));
      const off = Math.sin(t * Math.PI * 2 * waves + (i % 2 ? Math.PI : 0)) * amp * env;
      pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
    }

    // Tapered body polygon (thick at head, thin at tail)
    const left = [], right = [];
    for (let k = 0; k <= N; k++) {
      const p = pts[k];
      const q0 = pts[Math.max(0, k - 1)], q1 = pts[Math.min(N, k + 1)];
      let tx = q1.x - q0.x, ty = q1.y - q0.y;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = 15 * (1 - k / N) + 2.5;
      left.push({ x: p.x - ty * w, y: p.y + tx * w });
      right.push({ x: p.x + ty * w, y: p.y - tx * w });
    }
    const bodyPts = [...left, ...right.reverse()];

    const gid = `sg${head}`;
    const grad = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: a.x, y1: a.y, x2: b.x, y2: b.y }, defs);
    el("stop", { offset: "0", "stop-color": c1 }, grad);
    el("stop", { offset: "1", "stop-color": c2 }, grad);

    const centre = smoothPath(pts);
    // soft glow under body
    el("path", { d: centre, fill: "none", stroke: c1, "stroke-width": 26, "stroke-linecap": "round", opacity: 0.18, filter: "url(#glow)" }, g);
    el("path", { d: smoothPath(bodyPts, true), fill: `url(#${gid})`, stroke: "rgba(0,0,0,0.35)", "stroke-width": 1.5 }, g);
    // starry scale pattern along the spine
    el("path", { d: centre, fill: "none", stroke: "rgba(255,255,255,0.55)", "stroke-width": 4, "stroke-dasharray": "2 14", "stroke-linecap": "round" }, g);
    // centreline used to animate tokens sliding down
    centrelines[head] = el("path", { d: centre, fill: "none", stroke: "none" }, g);

    // Head
    const hx = pts[0].x, hy = pts[0].y;
    const ang = (Math.atan2(pts[0].y - pts[2].y, pts[0].x - pts[2].x) * 180) / Math.PI;
    const h = el("g", { transform: `translate(${hx.toFixed(1)},${hy.toFixed(1)}) rotate(${ang.toFixed(1)})` }, g);
    el("path", { d: "M18,0 L32,-5 M18,0 L32,5", stroke: "#ff3366", "stroke-width": 2.5, "stroke-linecap": "round" }, h);
    el("ellipse", { cx: 2, cy: 0, rx: 22, ry: 17, fill: c1, stroke: "rgba(0,0,0,0.4)", "stroke-width": 1.5 }, h);
    el("ellipse", { cx: -2, cy: 0, rx: 14, ry: 10, fill: "rgba(255,255,255,0.15)" }, h);
    for (const sy of [-8, 8]) {
      el("circle", { cx: 8, cy: sy, r: 5.5, fill: "#fff" }, h);
      el("ellipse", { class: "serpent-eye", cx: 9.5, cy: sy, rx: 2, ry: 4, fill: "#111" }, h);
      el("circle", { cx: 10, cy: sy - 1.5, r: 1.2, fill: "#fff" }, h);
    }
  }

  /** Point along a serpent's body; t in 0..1 from head to tail. */
  function serpentPoint(head, t) {
    const p = centrelines[head];
    const pt = p.getPointAtLength(p.getTotalLength() * t);
    return { x: pt.x, y: pt.y };
  }

  return { ROCKETS, SERPENTS, cellXY, build, serpentPoint };
})();
