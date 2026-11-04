/* Andromeda Quest — turn-based dice game engine with cinematic camera, particles and music. */
(() => {
  // ------------------------------------------------------------------
  //  CONFIG
  // ------------------------------------------------------------------
  const AVATARS = [
    { e: "🚀", n: "Rocket" }, { e: "🛸", n: "UFO" }, { e: "👩‍🚀", n: "Astronaut" }, { e: "🛰️", n: "Satellite" },
    { e: "🪐", n: "Ringed planet" }, { e: "☄️", n: "Comet" }, { e: "🌙", n: "Moon" }, { e: "⭐", n: "Star" },
    { e: "👽", n: "Alien" }, { e: "🤖", n: "Robot" },
  ];
  const COLORS = ["#ff5d73", "#36d1ff", "#ffd166", "#3ee08f", "#b388ff"];
  const DEFAULT_NAMES = ["Nova", "Orion", "Vega", "Luna", "Atlas"];
  const MAX = 5;
  const GOAL = 100;
  const EVENT_EVERY = 3;     // cosmic event every N rounds
  const BUMP_BACK = 2;       // squares a rival is knocked back on collision
  const FINAL_STRETCH = 75;  // music intensifies once someone passes this

  const EVENTS = [
    { id: "wind",    icon: "🌬️", title: "Solar Wind",     text: "Every ship is pushed 2 squares forward" },
    { id: "gravity", icon: "🌑", title: "Gravity Wave",   text: "Every ship is pulled 2 squares back" },
    { id: "swap",    icon: "🔀", title: "Warp Rift",      text: "The leader and the last ship swap places" },
    { id: "meteor",  icon: "🌠", title: "Meteor Shower",  text: "One unlucky ship is knocked back 3 squares" },
    { id: "shift",   icon: "✨", title: "Galactic Shift", text: "Every boost and hazard warps to a new position" },
  ];

  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const params = new URLSearchParams(location.search);

  // ------------------------------------------------------------------
  //  STATE
  // ------------------------------------------------------------------
  let count = 2;
  let renderedRows = 0;
  let testMode = params.has("test");
  const crew = Array.from({ length: MAX }, (_, i) => ({ name: "", avatar: i, color: COLORS[i], cpu: false }));

  let players = [];
  let current = 0;
  let phase = "idle";          // idle | roll | moving | over
  let round = 1;
  let extraRoll = false;
  let forcedRoll = null;
  let turnToken = 0;           // guards delayed callbacks from older turns

  const cur = () => players[current];
  const active = () => players.filter(p => !p.finished);
  const newStats = () => ({ rolls: 0, sixes: 0, pips: 0, boosts: 0, boostGain: 0, hazards: 0, hazardLoss: 0, biggestBoost: 0, longestFall: 0, rams: 0, bumped: 0, bounces: 0 });
  const chip = p => p.el.querySelector(".chip");
  const cell = n => Board.cellXY(n);

  // ==================================================================
  //  SETUP SCREEN
  // ==================================================================
  function renderCountPicker() {
    const box = $("#count-picker");
    box.innerHTML = "";
    for (let n = 1; n <= MAX; n++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = n;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(n === count));
      b.setAttribute("aria-label", `${n} player${n > 1 ? "s" : ""}`);
      b.onclick = () => { count = n; Sfx.select(); fixAvatarClashes(); renderCountPicker(); renderRoster(); };
      box.appendChild(b);
    }
  }

  function fixAvatarClashes() {
    const used = new Set();
    for (let i = 0; i < count; i++) {
      if (used.has(crew[i].avatar)) crew[i].avatar = AVATARS.findIndex((_, k) => !used.has(k));
      used.add(crew[i].avatar);
    }
  }

  function renderRoster() {
    const roster = $("#roster");
    roster.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const c = crew[i];
      const row = document.createElement("div");
      row.className = "crew-row";
      row.style.setProperty("--pc", c.color);
      if (i < renderedRows) row.style.animation = "none";
      else row.style.animationDelay = `${(i - renderedRows) * 0.05}s`;

      const badge = document.createElement("div");
      badge.className = "crew-badge";
      badge.textContent = AVATARS[c.avatar].e;

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 16;
      input.placeholder = `Commander ${DEFAULT_NAMES[i]}`;
      input.value = c.name;
      input.setAttribute("aria-label", `Player ${i + 1} name`);
      input.oninput = () => { c.name = input.value; };
      input.onkeydown = e => { if (e.key === "Enter") startGame(); };

      const cpu = document.createElement("button");
      cpu.type = "button";
      cpu.className = "cpu-toggle" + (c.cpu ? " on" : "");
      cpu.innerHTML = c.cpu ? "🤖 CPU" : "👤 Human";
      cpu.title = "Toggle human / computer pilot";
      cpu.setAttribute("aria-pressed", String(c.cpu));
      cpu.onclick = () => { c.cpu = !c.cpu; Sfx.select(); renderRoster(); };

      const grid = document.createElement("div");
      grid.className = "avatar-grid";
      grid.setAttribute("role", "group");
      grid.setAttribute("aria-label", `Player ${i + 1} emblem`);
      AVATARS.forEach((a, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "avatar-opt";
        b.textContent = a.e;
        b.title = a.n;
        b.setAttribute("aria-label", a.n);
        b.setAttribute("aria-pressed", String(c.avatar === k));
        const takenBy = crew.slice(0, count).findIndex((o, j) => j !== i && o.avatar === k);
        if (takenBy >= 0) { b.disabled = true; b.title = `${a.n}: taken by player ${takenBy + 1}`; }
        b.onclick = () => { c.avatar = k; Sfx.select(); renderRoster(); };
        grid.appendChild(b);
      });

      row.append(badge, input, cpu, grid);
      roster.appendChild(row);
    }
    renderedRows = count;
  }

  // ==================================================================
  //  GAME START / RESET
  // ==================================================================
  function startGame() {
    Sfx.unlock();
    Music.start();
    Music.setIntensity(1);
    players = crew.slice(0, count).map((c, i) => ({
      id: i,
      name: (c.name || "").trim() || `Commander ${DEFAULT_NAMES[i]}`,
      emoji: AVATARS[c.avatar].e,
      color: c.color,
      cpu: c.cpu,
      pos: 1,
      finished: false, place: null, finishRound: null,
      stats: newStats(),
      el: null, x: 0, y: 0, ox: 0, oy: 0,
    }));
    current = 0;
    round = 1;
    forcedRoll = null;
    extraRoll = false;

    $("#win-modal").classList.remove("open");
    $("#results-modal").classList.remove("open");
    $("#setup").classList.remove("active");
    $("#game").classList.add("active");
    window.scrollTo(0, 0); // the setup screen may have been scrolled; start with the board in view
    $("#log").innerHTML = "";
    $("#dice-result").textContent = "–";
    $("#test-panel").hidden = !testMode;

    Board.randomize();       // a fresh random layout every game
    setupAmbientParticles();
    createTokens();
    Camera.reset();
    requestAnimationFrame(() => Dice3D.resize());
    log(`Mission start! All crews launch from Earth. ${players[0].name} goes first.`);
    setStatus("LINK ESTABLISHED · ALL CREWS ON THE LAUNCH PAD", `${players.length} ship${players.length > 1 ? "s" : ""} ready for launch`);
    // launch fanfare: particles off Earth
    const e = cell(1);
    Particles.ring(e.x, e.y, "#36d1ff", 120, 0.9);
    Particles.emit(e.x, e.y, { ...Particles.FX.ice, count: 30, speed: [60, 160] });
    beginTurn();
  }

  function backToSetup() {
    phase = "idle";
    turnToken++;
    Music.setIntensity(0);
    $("#win-modal").classList.remove("open");
    $("#results-modal").classList.remove("open");
    $("#game").classList.remove("active");
    $("#setup").classList.add("active");
    renderedRows = 0;
    renderCountPicker();
    renderRoster();
  }

  // ==================================================================
  //  TOKENS
  // ==================================================================
  function createTokens() {
    const layer = $("#tokens");
    layer.innerHTML = "";
    for (const p of players) {
      const t = document.createElement("div");
      t.className = "token";
      t.style.setProperty("--pc", p.color);
      t.innerHTML = `<div class="boost-flame"></div><div class="chip">${p.emoji}</div>`;
      t.setAttribute("aria-label", p.name);
      layer.appendChild(t);
      p.el = t;
      const { x, y } = cell(p.pos);
      p.x = x; p.y = y;
    }
    layoutTokens(true);
  }

  const clamp = v => Math.min(964, Math.max(36, v));
  function place(p) {
    p.el.style.left = clamp(p.x + p.ox) / 10 + "%";
    p.el.style.top = clamp(p.y + p.oy) / 10 + "%";
  }

  function layoutTokens(instant = false) {
    const groups = {};
    for (const p of players) (groups[p.pos] ||= []).push(p);
    for (const pos in groups) {
      const g = groups[pos];
      g.forEach((p, i) => {
        let ox = 0, oy = 0;
        if (g.length > 1) {
          const ang = (i / g.length) * Math.PI * 2 - Math.PI / 2;
          const r = g.length > 3 ? 24 : 20;
          ox = Math.cos(ang) * r; oy = Math.sin(ang) * r;
        }
        const { x, y } = cell(p.pos);
        if (instant) { p.x = x; p.y = y; p.ox = ox; p.oy = oy; place(p); }
        else gsap.to(p, { x, y, ox, oy, duration: 0.3, ease: "power2.out", onUpdate: () => place(p) });
      });
    }
    players.forEach((p, i) => p.el.classList.toggle("current", i === current && phase !== "over"));
  }

  function hopTo(p, n, i, dir = 1) {
    const { x, y } = cell(n);
    const from = { x: p.x, y: p.y };
    const s = { t: 0 };
    return new Promise(res => {
      gsap.to(s, {
        t: 1, duration: 0.3, ease: "power1.inOut",
        onUpdate: () => {
          p.x = from.x + (x - from.x) * s.t;
          p.y = from.y + (y - from.y) * s.t - Math.sin(Math.PI * s.t) * 45;
          chip(p).style.transform = `scale(${1 + Math.sin(Math.PI * s.t) * 0.25})`;
          place(p);
        },
        onComplete: () => {
          chip(p).style.transform = "";
          Sfx.step(dir > 0 ? i : 6 - (i % 7));
          Particles.FX.dust(x, y);
          res();
        },
      });
    });
  }

  // ==================================================================
  //  AMBIENT PARTICLES ON EVERY BOARD ELEMENT
  // ==================================================================
  function setupAmbientParticles() {
    const F = Particles.FX;
    Particles.clearEmitters();
    for (const [fromS, j] of Object.entries(Board.JUMPS)) {
      const from = +fromS;
      const a = cell(from), b = cell(j.to);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      switch (j.kind) {
        case "rocket": {
          Particles.addEmitter(a.x, a.y, 1.8, F.smoke);
          // little exhaust flicker under the parked rocket (kept inside its square)
          const rx = b.x - Math.cos(ang) * 30, ry = b.y - Math.sin(ang) * 30;
          Particles.addEmitter(rx, ry, 12, { ...F.fire, angle: ang + Math.PI, spread: 0.6, speed: [10, 35], size: [2, 4], life: [0.15, 0.3] });
          break;
        }
        case "ufo":
          Particles.addEmitter(a.x, a.y, 5, { ...F.green, angle: ang, spread: 0.3, speed: [40, 80], life: [1.2, 2.2], jitter: 20 });
          break;
        case "wormhole":
          for (const p of [a, b]) Particles.addEmitter(p.x, p.y, 7, { ...F.purple, jitter: 48, speed: [0, 10], attract: { x: p.x, y: p.y, k: 70 }, swirl: 160, life: [0.8, 1.4] });
          break;
        case "comet": {
          const back = Math.atan2(a.y - b.y, a.x - b.x);
          Particles.addEmitter(b.x, b.y, 12, { ...F.ice, angle: back, spread: 0.8, speed: [20, 70], jitter: 8 });
          break;
        }
        case "storm":
          Particles.addEmitter(a.x, a.y + 4, 7, { colors: ["#ffffff", "#cfe6ff", "#7fb8ff"], shape: "streak", speed: [80, 180], life: [0.12, 0.28], size: [2, 3], jitter: 26, drag: 0.9 });
          Particles.addEmitter(a.x, a.y - 4, 2, { colors: ["#463a85", "#8b7fd4"], speed: [3, 10], life: [1.2, 2], size: [8, 12], grow: 1.8, alpha: 0.5, jitter: 20 });
          break;
        case "blackhole":
          Particles.addEmitter(a.x, a.y, 14, { ...F.dark, colors: ["#ffb347", "#ff7b54", "#c77dff"], jitter: 75, speed: [0, 10], attract: { x: a.x, y: a.y, k: 150 }, swirl: 240, life: [0.8, 1.6], size: [2, 4] });
          break;
        case "asteroid":
          // flames licking around the fireball, staying inside its square
          Particles.addEmitter(a.x, a.y, 22, { ...F.fire, angle: -Math.PI / 2, spread: 1.4, speed: [10, 35], size: [3, 7], life: [0.25, 0.5], jitter: 14 });
          Particles.addEmitter(a.x, a.y, 4, { ...F.ember, angle: -Math.PI / 2, spread: 1.2, speed: [15, 40], life: [0.4, 0.8] });
          break;
        case "flare":
          Particles.addEmitter(a.x, a.y, 9, { ...F.ember, jitter: 18, speed: [20, 60] });
          break;
      }
    }
    const g = cell(GOAL);
    Particles.addEmitter(g.x, g.y, 6, { ...Particles.FX.gold, jitter: 45 });
  }

  // ==================================================================
  //  JUMP ANIMATIONS (one per element kind) with particle trails
  // ==================================================================
  function tween(dur, ease, onT) {
    const s = { t: 0 };
    return new Promise(res => gsap.to(s, { t: 1, duration: dur, ease, onUpdate: () => onT(s.t), onComplete: res }));
  }
  function follow(p, from, dur, ease, extra) {
    return tween(dur, ease, t => {
      const pt = Board.pathPoint(from, t);
      p.x = pt.x; p.y = pt.y;
      extra && extra(t);
      place(p);
    });
  }
  const at = p => () => ({ x: p.x, y: p.y });
  function shake(power = 8) {
    gsap.fromTo("#board", { x: -power, y: power / 2 }, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1.2,0.25)" });
  }

  const F = () => Particles.FX;
  const ANIM = {
    async rocket(p, from, to) {
      const a = cell(from), b = cell(to);
      Particles.emit(a.x, a.y, { ...F().smoke, count: 18, speed: [20, 80], spread: Math.PI * 2 });
      Particles.ring(a.x, a.y, "#ffd166", 90);
      p.el.classList.add("boosting");
      p.el.style.transform = `translate(-50%,-50%) rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90}deg)`;
      Sfx.rocket();
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI;
      const stop = Particles.trail(at(p), { ...F().fire, angle: ang, spread: 0.5, speed: [60, 140] }, 90);
      const stop2 = Particles.trail(at(p), { ...F().smoke, life: [0.8, 1.4] }, 12);
      await follow(p, from, 0.9 + Math.hypot(b.x - a.x, b.y - a.y) / 900, "power2.in",
        t => { chip(p).style.transform = `scale(${1 + Math.sin(Math.PI * t) * 0.45})`; });
      stop(); stop2();
      p.el.classList.remove("boosting");
      p.el.style.transform = "translate(-50%,-50%)";
      Particles.emit(b.x, b.y, { ...F().fire, count: 40, speed: [80, 220] });
      Particles.ring(b.x, b.y, "#ffd166", 110);
    },
    async ufo(p, from, to) {
      Sfx.ufo();
      const a = cell(from);
      Particles.emit(a.x, a.y, { ...F().green, count: 30, speed: [40, 120] });
      const stop = Particles.trail(at(p), { ...F().green, speed: [10, 40], jitter: 25 }, 40);
      await follow(p, from, 1.8, "power1.inOut", t => {
        p.x += Math.sin(t * Math.PI * 6) * 8;
        chip(p).style.transform = `scale(${1 - Math.sin(Math.PI * t) * 0.35})`;
        chip(p).style.opacity = String(1 - Math.sin(Math.PI * t) * 0.4);
      });
      stop();
      chip(p).style.opacity = "";
      const b = cell(to);
      Particles.emit(b.x, b.y, { ...F().green, count: 30, speed: [60, 160] });
      Particles.ring(b.x, b.y, "#3ee08f", 90);
    },
    async wormhole(p, from, to) {
      Sfx.wormhole();
      const a = cell(from), b = cell(to);
      Particles.emit(a.x, a.y, { ...F().purple, count: 40, jitter: 70, speed: [0, 20], attract: { x: a.x, y: a.y, k: 260 }, swirl: 300 });
      await tween(0.6, "power2.in", t => { chip(p).style.transform = `rotate(${t * 540}deg) scale(${1 - t})`; });
      Particles.ring(a.x, a.y, "#c77dff", 100, 0.5);
      const stop = Particles.trail(at(p), { ...F().purple, speed: [5, 30] }, 70);
      await follow(p, from, 0.55, "power1.inOut");
      stop();
      Particles.emit(b.x, b.y, { ...F().purple, count: 50, speed: [80, 220] });
      Particles.ring(b.x, b.y, "#e0c3ff", 120, 0.7);
      await tween(0.6, "back.out(2)", t => { chip(p).style.transform = `rotate(${(1 - t) * -540}deg) scale(${t})`; });
    },
    async comet(p, from, to) {
      Sfx.comet();
      p.el.classList.add("comet-ride");
      const stop = Particles.trail(at(p), { ...F().ice, speed: [10, 50], life: [0.6, 1.2] }, 80);
      await follow(p, from, 1.4, "power2.inOut", t => { chip(p).style.transform = `scale(${1 + Math.sin(Math.PI * t) * 0.3})`; });
      stop();
      p.el.classList.remove("comet-ride");
      const b = cell(to);
      Particles.emit(b.x, b.y, { ...F().ice, count: 45, speed: [60, 200] });
      Particles.ring(b.x, b.y, "#bdf3ff", 100);
    },
    async storm(p, from, to) {
      const a = cell(from), b = cell(to);
      const spark = { colors: ["#ffffff", "#cfe6ff", "#7fb8ff"], shape: "streak", life: [0.15, 0.4], size: [2, 4], drag: 0.9 };
      Sfx.zap();
      const board = $("#board");
      board.classList.remove("zap-flash"); void board.offsetWidth; board.classList.add("zap-flash");
      shake(9);
      Particles.emit(a.x, a.y, { ...spark, count: 60, speed: [150, 400] });
      Particles.ring(a.x, a.y, "#cfe6ff", 110, 0.4);
      p.el.classList.add("electrified");
      await sleep(250);
      const stop = Particles.trail(at(p), { ...spark, speed: [60, 200] }, 140);
      await follow(p, from, 0.75, "none", t => { chip(p).style.transform = `translate(${(Math.random() - 0.5) * 10}px, ${(Math.random() - 0.5) * 10}px)`; });
      stop();
      Sfx.zap(0.6);
      Particles.emit(b.x, b.y, { ...spark, count: 50, speed: [120, 320] });
      Particles.ring(b.x, b.y, "#7fb8ff", 100, 0.5);
      await sleep(300);
      p.el.classList.remove("electrified");
      chip(p).style.transform = "";
    },
    async blackhole(p, from, to) {
      Sfx.blackhole();
      const a = cell(from);
      Particles.emit(a.x, a.y, { ...F().dark, colors: ["#ffb347", "#ff7b54", "#c77dff"], count: 70, jitter: 110, speed: [0, 10], attract: { x: a.x, y: a.y, k: 320 }, swirl: 380, life: [0.6, 1.2] });
      await tween(1.1, "power2.in", t => {
        const ang = t * Math.PI * 5, r = 40 * (1 - t);
        p.x = a.x + Math.cos(ang) * r; p.y = a.y + Math.sin(ang) * r;
        chip(p).style.transform = `rotate(${t * 900}deg) scale(${1 - t * 0.95})`;
        place(p);
      });
      shake(5);
      chip(p).style.opacity = "0";
      await follow(p, from, 0.5, "power1.inOut");
      chip(p).style.opacity = "";
      const b = cell(to);
      Particles.ring(b.x, b.y, "#ff7b54", 110);
      Particles.emit(b.x, b.y, { ...F().dark, count: 40, speed: [80, 200] });
      await tween(0.5, "back.out(2.5)", t => { chip(p).style.transform = `scale(${0.05 + t * 0.95})`; });
    },
    async asteroid(p, from, to) {
      Sfx.asteroid();
      shake(12);
      const a = cell(from), b = cell(to);
      // the fireball slams in: a column of flame and a fiery shockwave
      Particles.emit(a.x, a.y, { ...F().fire, count: 90, speed: [100, 340], size: [5, 12] });
      Particles.emit(a.x, a.y, { ...F().fire, count: 40, angle: -Math.PI / 2, spread: 0.8, speed: [150, 320], size: [6, 12], life: [0.5, 0.9] });
      Particles.emit(a.x, a.y, { ...F().ember, count: 40, speed: [120, 300] });
      Particles.ring(a.x, a.y, "#ff6b35", 140);
      Particles.ring(a.x, a.y, "#ffd166", 90, 0.4);
      p.el.classList.add("ablaze");
      const stop = Particles.trail(at(p), { ...F().fire, speed: [20, 80], size: [6, 12], life: [0.35, 0.7] }, 150);
      const stop2 = Particles.trail(at(p), { ...F().ember, speed: [40, 120] }, 30);
      const stop3 = Particles.trail(at(p), { ...F().smoke, life: [0.8, 1.5] }, 14);
      await follow(p, from, 1.25, "power1.in", t => { chip(p).style.transform = `rotate(${t * 720}deg)`; });
      stop(); stop2(); stop3();
      shake(8);
      Sfx.asteroid(0.6);
      Particles.emit(b.x, b.y, { ...F().fire, count: 70, speed: [80, 260], size: [5, 11] });
      Particles.emit(b.x, b.y, { ...F().ember, count: 30, speed: [100, 260] });
      Particles.emit(b.x, b.y, { ...F().smoke, count: 12, speed: [20, 60], spread: Math.PI * 2 });
      Particles.ring(b.x, b.y, "#ff9e00", 110);
      await sleep(350);
      p.el.classList.remove("ablaze");
    },
    async flare(p, from, to) {
      Sfx.flare();
      const a = cell(from);
      Particles.emit(a.x, a.y, { ...F().ember, count: 60, speed: [80, 240] });
      Particles.ring(a.x, a.y, "#ffd166", 120);
      p.el.classList.add("scorched");
      const stop = Particles.trail(at(p), { ...F().ember, speed: [20, 70] }, 70);
      await follow(p, from, 1.4, "sine.inOut", t => { chip(p).style.transform = `scale(${1 + Math.sin(t * Math.PI * 8) * 0.08})`; });
      stop();
      p.el.classList.remove("scorched");
      const b = cell(to);
      Particles.emit(b.x, b.y, { ...F().ember, count: 30, speed: [40, 140] });
    },
  };

  // ==================================================================
  //  TURN FLOW
  // ==================================================================
  async function beginTurn() {
    const token = ++turnToken;
    phase = "roll";
    const p = cur();
    layoutTokens();
    updatePanel();
    if (!extraRoll) Sfx.turn();
    setMeta();
    setStatus(`${extraRoll ? "AFTERBURNER: " : ""}${p.name.toUpperCase()} · ${p.cpu ? "CPU PILOT PREPARING THROW" : "AWAITING THROW"}`,
      `${p.emoji} Square ${p.pos} · ${GOAL - p.pos} to Andromeda${p.cpu ? "" : " · hold the button or Space to throw"}`);
    Particles.ring(p.x, p.y, p.color, 70, 0.8);
    // cinematic swoop: zoom in on whose turn it is, then pull back for the dice
    Camera.focus(p.x, p.y, 2.1);
    await sleep(950);
    if (token !== turnToken || phase !== "roll") return;
    Camera.overview();
    if (p.cpu) {
      await sleep(600);
      if (token === turnToken && phase === "roll") onRoll(0.3 + Math.random() * 0.7);
    } else {
      $("#roll-btn").focus({ preventScroll: true });
    }
  }

  // ---------- hold to throw: charge a power meter, release to throw ----------
  const CHARGE_MS = 1100;
  let charge = null;
  const chargePower = () => Math.min(1, 0.15 + ((performance.now() - charge.t0) / CHARGE_MS) * 0.85);
  function startCharge() {
    if (phase !== "roll" || !players.length || cur().cpu || charge) return;
    Sfx.unlock();
    charge = { t0: performance.now(), step: -1, raf: 0 };
    setStatus("CHARGING THROW…", "Release to throw. Longer hold = harder throw");
    const rb = $("#roll-btn");
    rb.classList.add("charging");
    const loop = () => {
      if (!charge) return;
      const pw = chargePower();
      rb.style.setProperty("--pow", pw.toFixed(3));
      const step = Math.floor(pw * 10);
      if (step !== charge.step) { charge.step = step; Sfx.charge(pw); }
      charge.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  function endCharge(throwIt = true) {
    if (!charge) return;
    const pw = chargePower();
    cancelAnimationFrame(charge.raf);
    charge = null;
    const rb = $("#roll-btn");
    rb.classList.remove("charging");
    rb.style.setProperty("--pow", 0);
    if (throwIt) onRoll(pw);
  }

  async function onRoll(power = 0.5) {
    if (phase !== "roll") return;
    phase = "moving";
    turnToken++;
    Sfx.unlock();
    Music.start();
    refreshControls();
    Camera.overview();
    // on phones the panel sits below the board: bring the board back into view
    if (window.innerWidth < 900) {
      const r = $("#board-wrap").getBoundingClientRect();
      if (r.top < -40 || r.bottom > window.innerHeight + 40) $("#board-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const p = cur();
    let value = 1 + Math.floor(Math.random() * 6);
    if (forcedRoll) { value = forcedRoll; forcedRoll = null; renderTestDice(); }
    const res = $("#dice-result");
    res.textContent = "…";
    Sfx.whoosh(power);
    setStatus(`DICE IN FLIGHT · POWER ${Math.round(power * 100)}%`, `${p.emoji} ${escapeHtml(p.name)}`);
    p.stats.rolls++;
    p.stats.pips += value;
    if (value === 6) p.stats.sixes++;
    if (power > 0.85) toast("💪 Power throw!", `${p.emoji} ${escapeHtml(p.name)} hurls the dice`, "up", { hold: 1.2 });
    await Dice3D.roll(value, { power, onBounce: s => Sfx.clack(s * (0.6 + power * 0.6)) });
    res.textContent = value;
    gsap.fromTo(res, { scale: 1.6, color: "#ffd166" }, { scale: 1, color: "#e8ecff", duration: 0.5, ease: "back.out(3)" });
    if (value === 6) Particles.emit(500, 500, { ...Particles.FX.gold, count: 30, speed: [80, 200] });
    await sleep(350);
    Dice3D.hide();
    await move(p, value);
  }

  /** Steps along the board, bouncing back off square 100. */
  function computePath(pos, steps) {
    const path = [];
    let dir = 1, bounced = false;
    for (let i = 0; i < steps; i++) {
      if (pos === GOAL) { dir = -1; bounced = true; }
      pos += dir;
      path.push(pos);
    }
    return { path, final: pos, bounced };
  }

  function showGhost(n, kind) {
    const g = $("#ghost");
    const { x, y } = cell(n);
    g.className = `ghost show ${kind}`;
    g.style.left = x / 10 + "%";
    g.style.top = y / 10 + "%";
  }
  const hideGhost = () => { $("#ghost").className = "ghost"; };

  async function move(p, value) {
    const start = p.pos;
    const { path, final, bounced } = computePath(p.pos, value);

    // preview where we're heading
    const j = Board.JUMPS[final];
    showGhost(final, final === GOAL ? "win" : j ? (Board.KINDS[j.kind].up ? "up" : "down") : "plain");
    setStatus(`${p.name.toUpperCase()} ROLLED ${value} · COURSE SET FOR SQUARE ${final}`,
      final === GOAL ? "Andromeda Galaxy in range!" : j ? `${Board.KINDS[j.kind].icon} ${Board.KINDS[j.kind].name} detected at the destination` : "Clear space ahead");
    Camera.follow(at(p), 2);

    p.el.classList.add("moving");
    gsap.to(p, { ox: 0, oy: 0, duration: 0.15, onUpdate: () => place(p) });
    let dir = 1;
    for (let i = 0; i < path.length; i++) {
      if (i > 0 && path[i] < path[i - 1]) dir = -1;
      await hopTo(p, path[i], i, dir);
      if (path[i] === GOAL && i < path.length - 1) {
        const left = path.length - 1 - i;
        p.stats.bounces++;
        Sfx.alert("bounce");
        Sfx.bounce();
        toast("🪃 Gravity slingshot!", `${p.emoji} ${escapeHtml(p.name)} overshot Andromeda and bounces back ${left} square${left > 1 ? "s" : ""}`, "bounce");
        await windUp(p.x, p.y, "#36d1ff", p);
      }
    }
    hideGhost();
    p.pos = final;

    log(`${p.name} rolled ${value}: ${start} → ${final}${bounced ? " (bounced)" : ""}`, p.color);

    await resolveLanding(p, true);
    p.el.classList.remove("moving");
    layoutTokens();
    updatePanel();
    updateIntensity();

    if (p.pos === GOAL) {
      const r = await finish(p);
      if (r === "ended") return;
      extraRoll = false;
      return nextPlayer();
    }

    if (value === 6) {
      Camera.focus(p.x, p.y, 2.1);
      Sfx.alert("up");
      toast("🔥 Afterburner!", `${p.emoji} ${escapeHtml(p.name)} rolled a 6 and rolls again!`, "up");
      await windUp(p.x, p.y, "#ff9e00", p);
      Sfx.afterburner();
      Particles.emit(p.x, p.y, { ...Particles.FX.fire, count: 60, speed: [60, 200] });
      await sleep(900);
      log(`🔥 ${p.name} fires the afterburner for another roll.`, p.color);
      extraRoll = true;
      return beginTurn();
    }
    extraRoll = false;
    nextPlayer();
  }

  async function resolveLanding(p, isMover) {
    // Collisions: the mover knocks rivals on the same square back
    if (isMover && p.pos !== GOAL) {
      const rivals = players.filter(o => o !== p && !o.finished && o.pos === p.pos);
      for (const r of rivals) {
        Camera.focus(r.x, r.y, 2.3);
        const back = Math.max(1, r.pos - BUMP_BACK);
        Sfx.alert("down");
        toast("💥 Collision!", `${p.emoji} ${escapeHtml(p.name)} rams ${r.emoji} ${escapeHtml(r.name)}: ${delta(r.pos, back)}`, "down");
        await windUp(r.x, r.y, "#ffffff", r);
        Sfx.bump();
        shake(9);
        Particles.emit(r.x, r.y, { colors: [p.color, r.color, "#ffffff"], count: 45, speed: [80, 260], size: [2, 5], shape: "streak" });
        Particles.ring(r.x, r.y, "#ffffff", 90, 0.5);
        log(`💥 ${p.name} rammed ${r.name} back ${BUMP_BACK} squares.`, p.color);
        p.stats.rams++;
        r.stats.bumped++;
        r.el.classList.add("moving");
        Camera.follow(at(r), 2.1);
        for (let n = r.pos - 1, i = 0; n >= back; n--, i++) await hopTo(r, n, i, -1);
        r.pos = back;
        await resolveJump(r);
        r.el.classList.remove("moving");
      }
    }
    await resolveJump(p);
  }

  async function resolveJump(p) {
    const j = Board.JUMPS[p.pos];
    if (!j) return;
    const k = Board.KINDS[j.kind];
    const grp = Board.jumpEls(p.pos);
    const from = p.pos;
    Camera.fit(cell(from), cell(j.to), 200);
    grp.forEach(e => e.classList.add("active"));
    Sfx.alert(k.up ? "up" : "down");
    toast(`${k.icon} ${k.title}`, `${p.emoji} ${escapeHtml(p.name)}: ${delta(from, j.to)}`, k.up ? "up" : "down");
    await windUp(p.x, p.y, KIND_COLOR[j.kind], p);
    await ANIM[j.kind](p, from, j.to);
    grp.forEach(e => e.classList.remove("active"));
    p.pos = j.to;
    chip(p).style.transform = "";
    log(`${k.icon} ${p.name} ${k.verb} ${j.to}.`, p.color);
    const d = Math.abs(j.to - from);
    if (k.up) { p.stats.boosts++; p.stats.boostGain += d; p.stats.biggestBoost = Math.max(p.stats.biggestBoost, d); }
    else { p.stats.hazards++; p.stats.hazardLoss += d; p.stats.longestFall = Math.max(p.stats.longestFall, d); }
    Camera.focus(p.x, p.y, 2.1);
    await sleep(350);
  }

  const EFFECT_LEAD = 800; // build-up before any effect plays, so players see what's coming
  const KIND_COLOR = {
    rocket: "#ffd166", ufo: "#3ee08f", wormhole: "#c77dff", comet: "#7fe7ff",
    storm: "#7fb8ff", blackhole: "#ff7b54", asteroid: "#ff6b35", flare: "#ffd166",
  };

  /** 800 ms anticipation: pulsing rings, gathering particles and a trembling piece. */
  async function windUp(x, y, color, p) {
    if (p) { p.el.style.setProperty("--cc", color); p.el.classList.add("charging"); }
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const px = p ? p.x : x, py = p ? p.y : y;
        Particles.ring(px, py, color, 55 + i * 18, 0.45);
        Particles.emit(px, py, { colors: [color, "#ffffff"], count: 12, jitter: 80, speed: [0, 10], attract: { x: px, y: py, k: 260 }, life: [0.35, 0.6], size: [2, 4] });
      }, i * 200);
    }
    await sleep(EFFECT_LEAD);
    if (p) p.el.classList.remove("charging");
  }

  /** "17 → 7 (−10)" with the change coloured up/down. */
  function delta(from, to) {
    const d = to - from;
    return `${from} → ${to} <b class="${d >= 0 ? "d-up" : "d-down"}">(${d >= 0 ? "+" : "−"}${Math.abs(d)})</b>`;
  }

  const TURN_GAP = 500; // pause after a turn finishes before the next player starts

  async function nextPlayer() {
    phase = "moving";
    refreshControls();
    await sleep(TURN_GAP);
    if (advance()) {
      round++;
      if ((round - 1) % EVENT_EVERY === 0) {
        await cosmicEvent();
        if ((await settleFinishers()) === "ended") return;
        if (cur().finished) advance();
      }
    }
    beginTurn();
  }

  /** Move to the next ship still racing. Returns true if we wrapped past the first seat (new round). */
  function advance() {
    let wrapped = false;
    do {
      current = (current + 1) % players.length;
      if (current === 0) wrapped = true;
    } while (players[current].finished);
    return wrapped;
  }

  /** Ships pushed onto 100 by an event finish too. */
  async function settleFinishers() {
    for (const w of players.filter(p => !p.finished && p.pos === GOAL)) {
      if ((await finish(w)) === "ended") return "ended";
    }
    return "ok";
  }

  function updateIntensity() {
    Music.setIntensity(active().some(p => p.pos >= FINAL_STRETCH) ? 2 : 1);
  }

  // ==================================================================
  //  COSMIC EVENTS (move players, then resolve what they land on)
  // ==================================================================
  async function cosmicEvent(forcedId = null) {
    let pool = EVENTS;
    const racing = active();
    const spread = new Set(racing.map(p => p.pos)).size > 1;
    if (!spread) pool = EVENTS.filter(e => e.id !== "swap");
    const ev = EVENTS.find(e => e.id === forcedId) || pool[Math.floor(Math.random() * pool.length)];
    phase = "moving";
    refreshControls();
    Camera.overview();
    Sfx.alert("event");
    Sfx.event();
    $("#board").classList.add("event-flash");
    setTimeout(() => $("#board").classList.remove("event-flash"), 1200);
    // starfall across the whole board
    for (let i = 0; i < 40; i++) {
      Particles.emit(Math.random() * 1000, -20, { colors: ["#e0c3ff", "#ffffff", "#7fe7ff"], count: 1, angle: Math.PI * 0.62, spread: 0.1, speed: [500, 800], life: [1.2, 1.8], shape: "streak", size: [3, 5], drag: 1 });
    }
    log(`🌌 Cosmic event: ${ev.title}! ${ev.text}.`);
    setStatus(`COSMIC EVENT: ${ev.title.toUpperCase()}`, ev.text);
    toast(`🌌 Cosmic event: ${ev.icon} ${ev.title}`, ev.text, "event", { hold: 3 });
    await windUp(500, 500, "#c77dff");
    await sleep(700);

    const moveBy = async (p, delta) => {
      if (!delta) return;
      p.el.classList.add("moving");
      if (delta > 0) {
        const { path, final } = computePath(p.pos, delta);
        for (let i = 0; i < path.length; i++) await hopTo(p, path[i], i);
        p.pos = final;
      } else {
        const back = Math.max(1, p.pos + delta);
        for (let n = p.pos - 1, i = 0; n >= back; n--, i++) await hopTo(p, n, i, -1);
        p.pos = back;
      }
      await resolveJump(p);
      p.el.classList.remove("moving");
      Camera.overview();
    };

    if (ev.id === "wind") {
      for (const p of racing) Particles.emit(p.x - 60, p.y, { ...Particles.FX.ice, count: 20, angle: 0, spread: 0.4, speed: [150, 300] });
      for (const p of racing) await moveBy(p, 2);
    } else if (ev.id === "gravity") {
      for (const p of racing) Particles.ring(p.x, p.y, "#7b2ff7", 70, 0.7);
      for (const p of racing) await moveBy(p, -2);
    } else if (ev.id === "meteor") {
      const v = racing[Math.floor(Math.random() * racing.length)];
      Camera.focus(v.x, v.y, 2.2);
      for (let i = 0; i < 12; i++) {
        setTimeout(() => Particles.emit(v.x + 200, v.y - 260, { ...Particles.FX.fire, count: 3, angle: Math.atan2(260, -200), spread: 0.15, speed: [500, 600], life: [0.45, 0.5], shape: "streak", size: [4, 7], drag: 1 }), i * 60);
      }
      await sleep(700);
      Sfx.asteroid();
      shake(10);
      Particles.emit(v.x, v.y, { ...Particles.FX.fire, count: 50, speed: [100, 260] });
      log(`🌠 ${v.name} was hit by the meteor shower.`, v.color);
      await moveBy(v, -3);
    } else if (ev.id === "shift") {
      await galacticShift();
    } else if (ev.id === "swap") {
      const sorted = [...racing].sort((a, b) => b.pos - a.pos);
      const lead = sorted[0], last = sorted[sorted.length - 1];
      Sfx.wormhole();
      for (const p of [lead, last]) Particles.emit(p.x, p.y, { ...Particles.FX.purple, count: 40, jitter: 60, attract: { x: p.x, y: p.y, k: 250 }, swirl: 300, speed: [0, 10] });
      await Promise.all([lead, last].map(p => tween(0.5, "power2.in", t => { chip(p).style.transform = `rotate(${t * 360}deg) scale(${1 - t})`; })));
      [lead.pos, last.pos] = [last.pos, lead.pos];
      layoutTokens(true);
      for (const p of [lead, last]) { Particles.emit(p.x, p.y, { ...Particles.FX.purple, count: 40, speed: [80, 200] }); Particles.ring(p.x, p.y, "#c77dff", 90); }
      await Promise.all([lead, last].map(p => tween(0.5, "back.out(2)", t => { chip(p).style.transform = `scale(${t})`; })));
      log(`🔀 ${lead.name} and ${last.name} swapped places.`);
      for (const p of [lead, last]) { chip(p).style.transform = ""; await resolveJump(p); }
    }
    layoutTokens();
    updatePanel();
    updateIntensity();
    Camera.overview();
    await sleep(400);
  }

  /** Every element dissolves and re-forms in a new random spot (never under a piece). */
  async function galacticShift() {
    const svg = Board.svg();
    const burst = (jumps, color) => {
      for (const [f, j] of Object.entries(jumps)) {
        for (const n of [+f, j.to]) {
          const c = cell(n);
          Particles.emit(c.x, c.y, { ...Particles.FX.purple, colors: [color, "#ffffff", "#7fe7ff"], count: 14, speed: [40, 150] });
        }
        const a = cell(+f);
        Particles.ring(a.x, a.y, color, 70, 0.6);
      }
    };
    Sfx.shift();
    burst(Board.JUMPS, "#c77dff");
    await new Promise(r => gsap.to(svg, { opacity: 0, scale: 0.92, rotation: -4, transformOrigin: "50% 50%", filter: "blur(8px)", duration: 0.8, ease: "power2.in", onComplete: r }));
    Particles.clearEmitters();
    Board.randomize(players.map(p => p.pos));
    setupAmbientParticles();
    burst(Board.JUMPS, "#7fe7ff");
    await new Promise(r => gsap.fromTo(svg, { opacity: 0, scale: 1.08, rotation: 4, filter: "blur(8px)" },
      { opacity: 1, scale: 1, rotation: 0, filter: "blur(0px)", duration: 0.9, ease: "power2.out", onComplete: r }));
    gsap.set(svg, { clearProps: "transform,filter" });
    log("✨ The board shifted: every boost and hazard is in a new position.");
    await sleep(600);
  }

  // ==================================================================
  //  FINISHING, CONTINUE RACE, RESULTS
  // ==================================================================
  const MEDALS = ["🥇", "🥈", "🥉"];
  const ordinal = n => { const sfx = ["th", "st", "nd", "rd"], v = n % 100; return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]); };

  /** A ship reached Andromeda. Returns "continue" or "ended". */
  async function finish(p) {
    p.finished = true;
    p.place = players.filter(o => o.place).length + 1;
    p.finishRound = round;
    phase = "moving";
    turnToken++;
    layoutTokens();
    refreshControls();
    updatePanel();
    log(`${MEDALS[p.place - 1] || "🏁"} ${p.name} reached the Andromeda Galaxy in ${ordinal(p.place)} place (round ${round})!`, p.color);
    setStatus(`${p.name.toUpperCase()} HAS REACHED ANDROMEDA · ${ordinal(p.place).toUpperCase()} PLACE`, `${MEDALS[p.place - 1] || "🏁"} Round ${round}`);
    const g = cell(GOAL);
    Camera.focus(g.x, g.y, 3);
    Music.duck(4);
    Sfx.win();
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        Particles.ring(g.x, g.y, ["#ffd166", "#c77dff", "#36d1ff"][i % 3], 140 + i * 40, 0.9);
        Particles.emit(g.x, g.y, { ...Particles.FX.gold, count: 50, speed: [100, 320] });
      }, i * 280);
    }
    celebrate(p.color);
    await sleep(2000);
    Camera.overview();

    const racing = active();
    if (racing.length <= 1) { endRace(); return "ended"; }
    return askContinue(p, racing);
  }

  /** "Nova finished 1st! Continue racing for the other places?" */
  function askContinue(p, racing) {
    return new Promise(resolve => {
      const av = $("#win-avatar");
      av.textContent = p.emoji;
      av.style.setProperty("--pc", p.color);
      $("#win-title").textContent = `${MEDALS[p.place - 1] || "🏁"} ${ordinal(p.place)} place!`;
      $("#win-text").innerHTML = `<strong>${escapeHtml(p.name)}</strong> warped all the way to the <strong>Andromeda Galaxy</strong> in round ${round}!<br>
        ${racing.length} commanders are still racing for ${ordinal(p.place + 1)} place.`;
      const acts = $("#win-actions");
      acts.innerHTML = `
        <button class="btn btn-primary" id="continue-btn">Continue race 🚀</button>
        <button class="btn btn-ghost" id="end-btn">End & see results</button>`;
      $("#win-modal").classList.add("open");
      $("#continue-btn").focus();
      $("#continue-btn").onclick = () => {
        $("#win-modal").classList.remove("open");
        log(`🏁 The race continues for ${ordinal(p.place + 1)} place.`);
        updateIntensity();
        resolve("continue");
      };
      $("#end-btn").onclick = () => {
        $("#win-modal").classList.remove("open");
        endRace();
        resolve("ended");
      };
    });
  }

  /** Rank everyone still racing by position, then show the results screen. */
  function endRace() {
    let place = players.filter(o => o.place).length;
    for (const r of active().sort((a, b) => b.pos - a.pos)) r.place = ++place;
    phase = "over";
    turnToken++;
    layoutTokens();
    updatePanel();
    Music.setIntensity(0);
    setMeta();
    setStatus("MISSION COMPLETE · ALL SHIPS ACCOUNTED FOR", "Results transmitted");
    showResults();
  }

  function showResults() {
    const ranked = [...players].sort((a, b) => a.place - b.place);
    $("#podium").innerHTML = ranked.map(p => `
      <li class="podium-row place-${p.place}" style="--pc:${p.color}">
        <span class="pr-medal">${MEDALS[p.place - 1] || ordinal(p.place)}</span>
        <span class="crew-badge" style="--pc:${p.color}">${p.emoji}</span>
        <span class="pr-name">${escapeHtml(p.name)}${p.cpu ? ' <span class="tag">CPU</span>' : ""}</span>
        <span class="pr-detail">${p.finishRound ? `Reached Andromeda · round ${p.finishRound}` : `Square ${p.pos}`}</span>
      </li>`).join("");

    // awards: who stood out (only shown when someone actually earned it)
    const best = (key, label, icon, fmt) => {
      const top = Math.max(...players.map(p => p.stats[key]));
      if (top <= 0) return "";
      const who = players.filter(p => p.stats[key] === top);
      return `<div class="award"><div class="aw-icon">${icon}</div><div class="aw-label">${label}</div>
        <div class="aw-who">${who.map(p => `${p.emoji} ${escapeHtml(p.name)}`).join(", ")}</div><div class="aw-val">${fmt(top)}</div></div>`;
    };
    $("#awards").innerHTML = [
      best("boostGain", "Luckiest pilot", "🍀", v => `+${v} squares from boosts`),
      best("hazardLoss", "Unluckiest pilot", "💀", v => `−${v} squares to hazards`),
      best("biggestBoost", "Biggest boost", "🚀", v => `+${v} in one go`),
      best("longestFall", "Longest fall", "📉", v => `−${v} in one go`),
      best("rams", "Space bully", "💥", v => `${v} collision${v > 1 ? "s" : ""}`),
      best("sixes", "Hot dice", "🎲", v => `${v} six${v > 1 ? "es" : ""}`),
    ].join("") || `<p class="muted">A quiet flight: no boosts, hazards or collisions!</p>`;

    $("#stats-table").innerHTML = `
      <thead><tr><th>Commander</th><th>Rolls</th><th>Avg</th><th>6s</th><th>Boosts</th><th>Hazards</th><th>Net</th><th>Rams</th><th>Rammed</th></tr></thead>
      <tbody>${ranked.map(p => {
        const s = p.stats, net = s.boostGain - s.hazardLoss;
        return `<tr><td><span class="st-name" style="--pc:${p.color}">${p.emoji} ${escapeHtml(p.name)}</span></td>
          <td>${s.rolls}</td><td>${s.rolls ? (s.pips / s.rolls).toFixed(1) : "–"}</td><td>${s.sixes}</td>
          <td class="up">${s.boosts} <small>(+${s.boostGain})</small></td><td class="down">${s.hazards} <small>(−${s.hazardLoss})</small></td>
          <td class="${net >= 0 ? "up" : "down"}">${net >= 0 ? "+" : "−"}${Math.abs(net)}</td><td>${s.rams}</td><td>${s.bumped}</td></tr>`;
      }).join("")}</tbody>`;
    $("#results-sub").textContent = `Mission lasted ${round} round${round > 1 ? "s" : ""}.`;
    $("#results-modal").classList.add("open");
    $("#again-btn").focus();
  }

  function celebrate(color) {
    if (typeof confetti !== "function") return;
    const colors = [color, "#ffd166", "#36d1ff", "#b388ff", "#ffffff"];
    const end = Date.now() + 2200;
    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, shapes: ["star", "circle"] });
      confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, shapes: ["star", "circle"] });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    confetti({ particleCount: 160, spread: 120, startVelocity: 45, origin: { y: 0.45 }, colors, shapes: ["star"] });
  }

  // ==================================================================
  //  PANEL / UI
  // ==================================================================
  function refreshControls() {
    const p = cur();
    const rb = $("#roll-btn");
    rb.innerHTML = `<span>${extraRoll && phase === "roll" ? "Hold to roll again 🔥" : p && p.cpu && phase === "roll" ? "CPU is rolling…" : "Hold to throw 🎲"}</span><kbd>Space</kbd>`;
    rb.disabled = !p || p.cpu || phase !== "roll";
  }

  function updatePanel() {
    if (!players.length) return;
    const p = cur();
    const tp = $("#turn-player");
    tp.style.setProperty("--pc", p.color);
    const status = phase === "over" ? "Race over" : `Square ${p.pos} · ${GOAL - p.pos} to go`;
    tp.innerHTML = `
      <div class="crew-badge" style="--pc:${p.color}">${p.emoji}</div>
      <div style="min-width:0">
        <div class="tp-name">${escapeHtml(p.name)} ${p.cpu ? '<span class="tag">CPU</span>' : ""}</div>
        <div class="tp-sub">${status}</div>
      </div>`;

    const nextEvent = EVENT_EVERY - ((round - 1) % EVENT_EVERY);
    $("#round-info").innerHTML = `Round <b>${round}</b> · cosmic event in ${nextEvent} round${nextEvent > 1 ? "s" : ""}`;

    const list = $("#player-list");
    list.innerHTML = "";
    const ranked = [...players].sort((a, b) => (a.place || 99) - (b.place || 99) || b.pos - a.pos);
    players.forEach((pl, i) => {
      const li = document.createElement("li");
      li.style.setProperty("--pc", pl.color);
      if (i === current && phase !== "over") li.classList.add("current");
      li.innerHTML = `
        <div class="crew-badge" style="--pc:${pl.color}">${pl.emoji}</div>
        <div style="min-width:0">
          <div class="pl-name">${escapeHtml(pl.name)} ${pl.cpu ? '<span class="tag">CPU</span>' : ""}</div>
          <div class="pl-bar"><span style="width:${pl.pos}%"></span></div>
        </div>
        <div class="pl-pos">${pl.finished ? `<small>${ordinal(pl.place)}</small>${MEDALS[pl.place - 1] || "🏁"}` : `<small>#${ranked.indexOf(pl) + 1}</small>${pl.pos}`}</div>`;
      if (pl.finished) li.classList.add("finished");
      list.appendChild(li);
    });
    refreshControls();
  }

  function log(text, color) {
    const li = document.createElement("li");
    li.textContent = text;
    if (color) li.style.setProperty("--pc", color);
    const ol = $("#log");
    ol.prepend(li);
    while (ol.children.length > 60) ol.lastChild.remove();
  }

  let toastId = 0;

  // ---------- terminal status line (typed out, with a blinking cursor) ----------
  let statusTimer = 0;
  function setStatus(main, sub = "") {
    const el = $("#term-status");
    clearInterval(statusTimer);
    el.innerHTML = `<div class="ts-main"><span class="ts-prompt">&gt;</span><span class="ts-text"></span><span class="term-cursor"></span></div>${sub ? `<div class="ts-sub">${sub}</div>` : ""}`;
    const out = el.querySelector(".ts-text");
    const chars = [...main];
    let i = 0;
    statusTimer = setInterval(() => {
      out.textContent = chars.slice(0, ++i).join("");
      if (i >= chars.length) clearInterval(statusTimer);
    }, 16);
  }
  function setMeta() {
    if (!players.length) return;
    const nextEvent = EVENT_EVERY - ((round - 1) % EVENT_EVERY);
    const racing = active().length;
    $("#term-meta").textContent = `RND ${String(round).padStart(2, "0")} · EVENT T-${nextEvent} · ${racing} SHIP${racing > 1 ? "S" : ""}`;
  }

  /** Event notification, shown in the Mission Control terminal. Stays ~2.6 s so it can be read. */
  function toast(title, sub, kind, { hold = 2.6 } = {}) {
    const t = $("#toast");
    t.className = `toast ${kind || ""}`;
    t.innerHTML = `<div class="toast-title">${title}</div>${sub ? `<div class="toast-sub">${sub}</div>` : ""}`;
    gsap.killTweensOf(t);
    const term = $("#terminal");
    term.classList.add("alert");
    const id = ++toastId;
    return new Promise(res => {
      gsap.timeline({ onComplete: () => { if (id === toastId) term.classList.remove("alert"); res(); } })
        .fromTo(t, { opacity: 0, scale: 0.9, y: -14 },
          { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: "back.out(2)" })
        .to(t, { opacity: 0, y: -10, duration: 0.35, delay: hold });
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderLegend() {
    const ups = [], downs = [];
    for (const k of Object.values(Board.KINDS)) (k.up ? ups : downs).push(`<li><span>${k.icon}</span>${k.name}</li>`);
    $("#legend").innerHTML = `
      <div><h4 class="up">Boosts ▲</h4><ul>${ups.join("")}</ul></div>
      <div><h4 class="down">Hazards ▼</h4><ul>${downs.join("")}</ul></div>`;
  }

  function toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      return;
    }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const fail = () => {
      Sfx.error();
      if ($("#game").classList.contains("active")) toast("⛶ Full screen blocked", "This page can't go full screen here. Open it in its own browser tab and try again.", "bounce", { hold: 3 });
      else alert("Full screen isn't allowed in this view. Open the game in its own browser tab and try again.");
    };
    if (!req) return fail();
    try {
      const r = req.call(el);
      if (r && r.catch) r.catch(fail);
    } catch { fail(); }
  }

  // ==================================================================
  //  ELEMENT PREVIEW (hover with a mouse, tap on touch screens)
  // ==================================================================
  function setupPreview() {
    const board = $("#board"), tip = $("#tip");
    let hovered = null, tapTimer = 0, down = null;
    const hide = () => {
      if (hovered !== null) Board.jumpEls(hovered).forEach(e => e.classList.remove("hover"));
      hovered = null;
      Board.svg().classList.remove("has-hover");
      tip.className = "tip";
    };
    const show = (px, py) => {
      const u = Camera.unproject(px, py);
      const n = Board.cellAt(u.x, u.y);
      const j = n && Board.jumpAt(n);
      if (!j) return hide();
      if (hovered !== j.from) {
        hide();
        hovered = j.from;
        Board.jumpEls(j.from).forEach(e => e.classList.add("hover"));
        Board.svg().classList.add("has-hover");
      }
      const k = Board.KINDS[j.kind];
      tip.innerHTML = `<b>${k.icon} ${k.name}</b><span>${delta(j.from, j.to)}</span><em>${n === j.from ? (k.up ? "Land here to boost up" : "Land here and you fall") : "Destination square"}</em>`;
      tip.className = `tip show ${k.up ? "up" : "down"}`;
      const W = board.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.max(6, Math.min(W - tw - 6, px - tw / 2)) + "px";
      tip.style.top = (py - th - 16 < 6 ? py + 22 : py - th - 16) + "px";
    };
    board.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      if (board.classList.contains("dragging")) return hide();
      const r = board.getBoundingClientRect();
      show(e.clientX - r.left, e.clientY - r.top);
    });
    board.addEventListener("pointerleave", hide);
    board.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    board.addEventListener("pointerup", e => {
      if (e.pointerType === "mouse" || !down) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && Date.now() - down.t < 450) {
        const r = board.getBoundingClientRect();
        show(e.clientX - r.left, e.clientY - r.top);
        clearTimeout(tapTimer);
        tapTimer = setTimeout(hide, 2800);
      }
      down = null;
    });
  }

  // ==================================================================
  //  TEST MODE
  // ==================================================================
  function renderTestDice() {
    const box = $("#test-dice");
    box.innerHTML = "";
    for (let v = 1; v <= 6; v++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = v;
      b.className = forcedRoll === v ? "on" : "";
      b.onclick = () => { forcedRoll = forcedRoll === v ? null : v; Sfx.click(); renderTestDice(); };
      box.appendChild(b);
    }
  }

  function testTeleport() {
    const n = parseInt($("#test-square").value, 10);
    if (!(n >= 1 && n <= 99) || phase !== "roll") return Sfx.error();
    const p = cur();
    p.pos = n;
    layoutTokens();
    updatePanel();
    updateIntensity();
    Particles.ring(cell(n).x, cell(n).y, "#ffd166", 80);
    log(`🧪 Test: ${p.name} teleported to ${n}.`, p.color);
  }

  // ==================================================================
  //  WIRING
  // ==================================================================
  function init() {
    Board.build($("#grid"), $("#paths"));
    Board.randomize();
    Dice3D.init($("#dice-stage"));
    Camera.init($("#camera"), $("#board"));
    Particles.init($("#particles"));
    setupAmbientParticles();
    renderCountPicker();
    renderRoster();
    renderLegend();
    renderTestDice();
    setupPreview();

    const tt = $("#test-toggle");
    tt.checked = testMode;
    tt.onchange = () => { testMode = tt.checked; Sfx.click(); };

    // browsers only allow audio after a user gesture
    const kick = () => { Sfx.unlock(); Music.start(); };
    document.addEventListener("pointerdown", kick, { once: true });
    document.addEventListener("keydown", kick, { once: true });

    // button click sounds
    document.addEventListener("click", e => { if (e.target.closest(".btn, .icon-btn, .cpu-toggle, .count-picker button")) Sfx.click(); });

    $("#launch-btn").onclick = startGame;
    const rb = $("#roll-btn");
    rb.addEventListener("pointerdown", e => { if (e.button === 0 || e.pointerType !== "mouse") { e.preventDefault(); startCharge(); } });
    rb.addEventListener("pointerup", () => endCharge(true));
    rb.addEventListener("pointerleave", () => endCharge(true));
    rb.addEventListener("pointercancel", () => endCharge(false));
    rb.addEventListener("contextmenu", e => e.preventDefault());
    $("#again-btn").onclick = startGame;
    $("#newcrew-btn").onclick = backToSetup;
    $("#restart-btn").onclick = () => {
      if (phase === "over" || confirm("Abort this mission and return to crew setup?")) backToSetup();
    };
    $("#mute-btn").onclick = e => { e.currentTarget.textContent = Sfx.toggle() ? "🔇" : "🔊"; e.currentTarget.classList.toggle("off", Sfx.muted); };
    $("#music-btn").onclick = e => { const on = Music.toggle(); e.currentTarget.classList.toggle("off", !on); e.currentTarget.title = on ? "Music on" : "Music off"; };
    $("#test-go").onclick = testTeleport;
    $("#test-event").innerHTML = EVENTS.map(e => `<option value="${e.id}">${e.icon} ${e.title}</option>`).join("");
    $("#test-event-go").onclick = async () => {
      if (phase !== "roll") return Sfx.error();
      turnToken++;
        await cosmicEvent($("#test-event").value);
      if ((await settleFinishers()) === "ended") return;
      if (cur().finished) advance();
      beginTurn();
    };
    document.querySelectorAll(".fs-toggle").forEach(b => (b.onclick = toggleFullscreen));
    const fsSync = () => {
      const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      document.querySelectorAll(".fs-toggle").forEach(b => { b.classList.toggle("on", on); b.title = on ? "Exit full screen (F)" : "Full screen (F)"; });
      setTimeout(() => Dice3D.resize(), 150);
    };
    document.addEventListener("fullscreenchange", fsSync);
    document.addEventListener("webkitfullscreenchange", fsSync);
    $("#zoom-in").onclick = () => Camera.zoomAt(1.4);
    $("#zoom-out").onclick = () => Camera.zoomAt(1 / 1.4);
    $("#zoom-reset").onclick = () => Camera.reset();
    $("#cam-auto").onclick = e => {
      const on = !Camera.auto;
      Camera.setAuto(on);
      if (!on) Camera.reset();
      e.currentTarget.classList.toggle("off", !on);
      e.currentTarget.title = on ? "Cinematic camera: on" : "Cinematic camera: off";
    };

    document.addEventListener("keydown", e => {
      if (!$("#game").classList.contains("active") || $(".modal.open")) return;
      if (e.target.matches("input, textarea, select")) return;
      if (e.code === "Space" || e.key === "Enter") {
        const ae = document.activeElement;
        if (ae && ae.tagName === "BUTTON" && ae !== $("#roll-btn")) return;
        e.preventDefault();
        if (!players.length || cur().cpu) return;
        if (e.code === "Space") { if (!e.repeat) startCharge(); }
        else onRoll(0.5); // Enter: quick throw
      } else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "+" || e.key === "=") Camera.zoomAt(1.3);
      else if (e.key === "-") Camera.zoomAt(1 / 1.3);
      else if (e.key === "0") Camera.reset();
    });

    document.addEventListener("keyup", e => { if (e.code === "Space") { e.preventDefault(); endCharge(true); } });

    // tiny hook for automated tests
    window.__aq = { get state() { return { phase, current, round, players: players.map(p => ({ pos: p.pos, finished: p.finished, place: p.place, stats: p.stats })) }; } };
  }

  init();
})();
