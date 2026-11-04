/* Andromeda Quest — game engine: setup, turn phases, abilities, energy, events, CPU, animations. */
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
  const MAX_ENERGY = 5;
  const START_ENERGY = 2;
  const CRYSTAL_COUNT = 6;
  const EVENT_EVERY = 3;          // a cosmic event every N rounds
  const BUMP_BACK = 2;            // squares a rival is knocked back
  const MAX_THRUST = 2;           // max |adjustment| to a roll
  const COST = { shield: 2, thrust: 1, reroll: 2 };

  const EVENTS = [
    { id: "wind",  icon: "🌬️", title: "Solar Wind",   text: "Every commander gains +1 ⚡" },
    { id: "rain",  icon: "💎", title: "Crystal Rain", text: "Extra energy crystals scatter across the board" },
    { id: "ion",   icon: "⚡", title: "Ion Storm",    text: "All abilities are FREE this round" },
    { id: "drain", icon: "🌫️", title: "Nebula Drain", text: "Every commander loses 1 ⚡" },
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
  let phase = "idle";          // idle | roll | rolling | decide | moving | over
  let turn = null;             // { roll, adjust, paid:[], rerolled }
  let round = 1;
  let ionStorm = false;
  let forcedRoll = null;       // test mode
  const crystals = new Map();  // cell -> element

  const cur = () => players[current];
  const chip = p => p.el.querySelector(".chip");
  const cost = k => (ionStorm ? 0 : COST[k]);

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
    players = crew.slice(0, count).map((c, i) => ({
      id: i,
      name: (c.name || "").trim() || `Commander ${DEFAULT_NAMES[i]}`,
      emoji: AVATARS[c.avatar].e,
      color: c.color,
      cpu: c.cpu,
      pos: 1,
      energy: START_ENERGY,
      shield: false,
      el: null, x: 0, y: 0, ox: 0, oy: 0,
    }));
    current = 0;
    round = 1;
    ionStorm = false;
    forcedRoll = null;

    $("#win-modal").classList.remove("open");
    $("#setup").classList.remove("active");
    $("#game").classList.add("active");
    $("#log").innerHTML = "";
    $("#dice-result").textContent = "–";
    $("#test-panel").hidden = !testMode;

    createTokens();
    clearCrystals();
    for (let i = 0; i < CRYSTAL_COUNT; i++) spawnCrystal(true);
    requestAnimationFrame(() => Dice3D.resize());
    log(`Mission start! All crews launch from Earth. ${players[0].name} goes first.`);
    beginTurn();
  }

  function backToSetup() {
    phase = "idle";
    $("#win-modal").classList.remove("open");
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
    layer.querySelectorAll(".token").forEach(t => t.remove());
    for (const p of players) {
      const t = document.createElement("div");
      t.className = "token";
      t.style.setProperty("--pc", p.color);
      t.innerHTML = `<div class="boost-flame"></div><div class="shield-bubble"></div><div class="chip">${p.emoji}</div>`;
      t.setAttribute("aria-label", p.name);
      layer.appendChild(t);
      p.el = t;
      const { x, y } = Board.cellXY(p.pos);
      p.x = x; p.y = y;
    }
    layoutTokens(true);
  }

  const clamp = v => Math.min(964, Math.max(36, v));
  function place(p) {
    p.el.style.left = clamp(p.x + p.ox) / 10 + "%";
    p.el.style.top = clamp(p.y + p.oy) / 10 + "%";
  }

  /** Spread out tokens sharing a square; sync token state classes. */
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
        const { x, y } = Board.cellXY(p.pos);
        if (instant) { p.x = x; p.y = y; p.ox = ox; p.oy = oy; place(p); }
        else gsap.to(p, { x, y, ox, oy, duration: 0.3, ease: "power2.out", onUpdate: () => place(p) });
      });
    }
    players.forEach((p, i) => {
      p.el.classList.toggle("current", i === current && phase !== "over");
      p.el.classList.toggle("shielded", p.shield);
    });
  }

  function hopTo(p, cell, i) {
    const { x, y } = Board.cellXY(cell);
    const from = { x: p.x, y: p.y };
    const s = { t: 0 };
    return new Promise(res => {
      gsap.to(s, {
        t: 1, duration: 0.28, ease: "power1.inOut",
        onUpdate: () => {
          p.x = from.x + (x - from.x) * s.t;
          p.y = from.y + (y - from.y) * s.t - Math.sin(Math.PI * s.t) * 45;
          chip(p).style.transform = `scale(${1 + Math.sin(Math.PI * s.t) * 0.25})`;
          place(p);
        },
        onComplete: () => { chip(p).style.transform = ""; Sfx.step(i); res(); },
      });
    });
  }

  // ==================================================================
  //  JUMP ANIMATIONS (one per element kind)
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
  function shake(power = 8) {
    gsap.fromTo("#board", { x: -power, y: power / 2 }, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1.2,0.25)" });
  }
  function burst(x, y, color, n = 14) {
    const layer = $("#fx");
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div");
      d.className = "spark";
      d.style.background = color;
      d.style.left = x / 10 + "%"; d.style.top = y / 10 + "%";
      layer.appendChild(d);
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 50;
      gsap.to(d, {
        x: Math.cos(a) * r * (layer.clientWidth / 1000), y: Math.sin(a) * r * (layer.clientWidth / 1000),
        opacity: 0, scale: 0.3, duration: 0.6 + Math.random() * 0.4, ease: "power2.out", onComplete: () => d.remove(),
      });
    }
  }

  const ANIM = {
    async rocket(p, from, to) {
      const a = Board.cellXY(from), b = Board.cellXY(to);
      p.el.classList.add("boosting");
      p.el.style.transform = `translate(-50%,-50%) rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90}deg)`;
      Sfx.rocket();
      await follow(p, from, 0.9 + Math.hypot(b.x - a.x, b.y - a.y) / 900, "power2.in",
        t => { chip(p).style.transform = `scale(${1 + Math.sin(Math.PI * t) * 0.45})`; });
      p.el.classList.remove("boosting");
      p.el.style.transform = "translate(-50%,-50%)";
      burst(b.x, b.y, "#ffd166");
    },
    async ufo(p, from) {
      Sfx.ufo();
      await follow(p, from, 1.8, "power1.inOut", t => {
        p.x += Math.sin(t * Math.PI * 6) * 8;
        chip(p).style.transform = `scale(${1 - Math.sin(Math.PI * t) * 0.35})`;
        chip(p).style.opacity = String(1 - Math.sin(Math.PI * t) * 0.4);
      });
      chip(p).style.opacity = "";
      burst(p.x, p.y, "#3ee08f");
    },
    async wormhole(p, from, to) {
      Sfx.wormhole();
      await tween(0.6, "power2.in", t => { chip(p).style.transform = `rotate(${t * 540}deg) scale(${1 - t})`; });
      await follow(p, from, 0.5, "power1.inOut");
      await tween(0.6, "back.out(2)", t => { chip(p).style.transform = `rotate(${(1 - t) * -540}deg) scale(${t})`; });
      const b = Board.cellXY(to);
      burst(b.x, b.y, "#c77dff", 18);
    },
    async comet(p, from) {
      Sfx.comet();
      p.el.classList.add("comet-ride");
      await follow(p, from, 1.4, "power2.inOut", t => { chip(p).style.transform = `scale(${1 + Math.sin(Math.PI * t) * 0.3})`; });
      p.el.classList.remove("comet-ride");
      burst(p.x, p.y, "#7fe7ff");
    },
    async serpent(p, from) {
      Sfx.serpent();
      await follow(p, from, 1.5, "power1.inOut",
        t => { chip(p).style.transform = `rotate(${t * 720}deg) scale(${1 - Math.sin(Math.PI * t) * 0.3})`; });
    },
    async blackhole(p, from, to) {
      Sfx.blackhole();
      const a = Board.cellXY(from);
      await tween(1.1, "power2.in", t => {
        const ang = t * Math.PI * 5, r = 40 * (1 - t);
        p.x = a.x + Math.cos(ang) * r; p.y = a.y + Math.sin(ang) * r;
        chip(p).style.transform = `rotate(${t * 900}deg) scale(${1 - t * 0.95})`;
        place(p);
      });
      chip(p).style.opacity = "0";
      await follow(p, from, 0.5, "power1.inOut");
      chip(p).style.opacity = "";
      await tween(0.5, "back.out(2.5)", t => { chip(p).style.transform = `scale(${0.05 + t * 0.95})`; });
      const b = Board.cellXY(to);
      burst(b.x, b.y, "#ff7b54");
    },
    async asteroid(p, from, to) {
      Sfx.asteroid();
      shake(12);
      burst(p.x, p.y, "#ff9e00", 20);
      await follow(p, from, 1.2, "power1.in", t => { chip(p).style.transform = `rotate(${t * 1080}deg)`; });
      shake(6);
      const b = Board.cellXY(to);
      burst(b.x, b.y, "#a7927e");
    },
    async flare(p, from) {
      Sfx.flare();
      p.el.classList.add("scorched");
      await follow(p, from, 1.4, "sine.inOut", t => { chip(p).style.transform = `scale(${1 + Math.sin(t * Math.PI * 8) * 0.08})`; });
      p.el.classList.remove("scorched");
    },
  };

  // ==================================================================
  //  ENERGY & CRYSTALS
  // ==================================================================
  function floatText(x, y, text, color = "#ffd166") {
    const d = document.createElement("div");
    d.className = "float-text";
    d.textContent = text;
    d.style.color = color;
    d.style.left = x / 10 + "%"; d.style.top = y / 10 + "%";
    $("#fx").appendChild(d);
    gsap.fromTo(d, { yPercent: -50, xPercent: -50, y: 0, opacity: 1, scale: 0.6 },
      { y: -50, opacity: 0, scale: 1.1, duration: 1.3, ease: "power2.out", onComplete: () => d.remove() });
  }

  function gainEnergy(p, n, why) {
    const before = p.energy;
    p.energy = Math.max(0, Math.min(MAX_ENERGY, p.energy + n));
    const delta = p.energy - before;
    if (n > 0) floatText(p.x, p.y - 40, delta > 0 ? `+${delta}⚡` : "⚡ MAX", "#ffd166");
    else if (delta < 0) floatText(p.x, p.y - 40, `${delta}⚡`, "#ff5d8f");
    updatePanel();
    return delta;
  }

  function clearCrystals() {
    crystals.forEach(el => el.remove());
    crystals.clear();
  }

  function spawnCrystal(instant = false) {
    const free = [];
    for (let n = 2; n < GOAL; n++) {
      if (crystals.has(n) || Board.JUMPS[n] || players.some(p => p.pos === n)) continue;
      free.push(n);
    }
    if (!free.length) return;
    const n = free[Math.floor(Math.random() * free.length)];
    const { x, y } = Board.cellXY(n);
    const d = document.createElement("div");
    d.className = "crystal";
    d.style.left = (x + 26) / 10 + "%";
    d.style.top = (y + 22) / 10 + "%";
    d.innerHTML = "<span></span>";
    $("#tokens").prepend(d);
    crystals.set(n, d);
    if (!instant) gsap.from(d, { scale: 0, rotation: 180, duration: 0.6, ease: "back.out(2)" });
  }

  function collectCrystal(p, n) {
    const d = crystals.get(n);
    if (!d) return false;
    crystals.delete(n);
    Sfx.crystal();
    gsap.to(d, { scale: 2, opacity: 0, duration: 0.4, onComplete: () => d.remove() });
    const { x, y } = Board.cellXY(n);
    burst(x + 26, y + 22, "#7fe7ff", 8);
    gainEnergy(p, 1);
    setTimeout(() => spawnCrystal(), 900);
    return true;
  }

  // ==================================================================
  //  TURN FLOW
  // ==================================================================
  function beginTurn(extra = false) {
    turn = { roll: 0, adjust: 0, paid: [], rerolled: false, extra };
    phase = "roll";
    layoutTokens();
    updatePanel();
    const p = cur();
    if (p.cpu) setTimeout(cpuPreRoll, 750);
    else if (!extra) $("#roll-btn").focus({ preventScroll: true });
  }

  async function throwDice() {
    phase = "rolling";
    refreshControls();
    hideGhost();
    let v = 1 + Math.floor(Math.random() * 6);
    if (forcedRoll) { v = forcedRoll; forcedRoll = null; renderTestDice(); }
    const res = $("#dice-result");
    res.textContent = "…";
    Sfx.whoosh();
    await Dice3D.roll(v, { onBounce: s => Sfx.clack(s) });
    res.textContent = v;
    gsap.fromTo(res, { scale: 1.6, color: "#ffd166" }, { scale: 1, color: "#e8ecff", duration: 0.5, ease: "back.out(3)" });
    return v;
  }

  async function onRoll() {
    if (phase !== "roll") return;
    Sfx.unlock();
    turn.roll = await throwDice();
    turn.adjust = 0;
    turn.paid = [];
    enterDecide();
  }

  function enterDecide() {
    phase = "decide";
    showPreview();
    refreshControls();
    const p = cur();
    if (p.cpu) { setTimeout(cpuDecide, 900); return; }
    // nothing to decide? launch automatically
    if (p.energy < cost("thrust") && (turn.rerolled || p.energy < cost("reroll"))) {
      $("#preview").insertAdjacentHTML("beforeend", `<div class="pv-note">No fuel for thrusters, launching…</div>`);
      setTimeout(() => { if (phase === "decide" && cur() === p) go(); }, 1100);
    }
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

  // ---------- abilities ----------
  function thrust(dir) {
    if (phase !== "decide") return;
    const p = cur();
    const next = turn.adjust + dir;
    if (Math.abs(next) > MAX_THRUST || turn.roll + next < 1) return Sfx.error();
    if (Math.abs(next) > Math.abs(turn.adjust)) {          // spending
      const c = cost("thrust");
      if (p.energy < c) return Sfx.error();
      p.energy -= c;
      turn.paid.push(c);
    } else {                                                // undoing: refund
      p.energy += turn.paid.pop() || 0;
    }
    turn.adjust = next;
    Sfx.thrust(dir);
    gsap.fromTo(chip(p), { y: dir * -6 }, { y: 0, duration: 0.3, ease: "back.out(3)" });
    showPreview();
    updatePanel();
  }

  function activateShield() {
    const p = cur();
    if (phase !== "roll" || p.shield || p.energy < cost("shield")) return Sfx.error();
    p.energy -= cost("shield");
    p.shield = true;
    Sfx.shield();
    log(`${p.name} raised a 🛡️ shield.`, p.color);
    layoutTokens();
    updatePanel();
  }

  async function reroll() {
    const p = cur();
    if (phase !== "decide" || turn.rerolled || p.energy + refundable() < cost("reroll")) return Sfx.error();
    p.energy += refundable();       // cancel any thrust first
    turn.paid = []; turn.adjust = 0;
    p.energy -= cost("reroll");
    turn.rerolled = true;
    updatePanel();
    log(`${p.name} spent fuel to reroll.`, p.color);
    turn.roll = await throwDice();
    enterDecide();
  }
  const refundable = () => turn.paid.reduce((a, b) => a + b, 0);

  // ---------- movement & resolution ----------
  async function go() {
    if (phase !== "decide") return;
    phase = "moving";
    hideGhost();
    refreshControls();
    Dice3D.hide();

    const p = cur();
    const steps = turn.roll + turn.adjust;
    const start = p.pos;
    const { path, final, bounced } = computePath(p.pos, steps);

    p.el.classList.add("moving");
    gsap.to(p, { ox: 0, oy: 0, duration: 0.15, onUpdate: () => place(p) });
    for (let i = 0; i < path.length; i++) {
      await hopTo(p, path[i], i);
      collectCrystal(p, path[i]);
    }
    p.pos = final;

    let msg = `${p.name} rolled ${turn.roll}`;
    if (turn.adjust) msg += ` (thrust ${turn.adjust > 0 ? "+" : ""}${turn.adjust})`;
    msg += `: ${start} → ${final}`;
    if (bounced) {
      Sfx.bounce();
      await toast("🪃 Gravity slingshot!", `Overshot Andromeda, bounced back to ${final}`, "bounce");
      msg += " (bounced)";
    }
    log(msg, p.color);

    await resolveLanding(p, true);
    p.el.classList.remove("moving");
    layoutTokens();
    updatePanel();

    if (p.pos === GOAL) return win(p);

    if (turn.roll === 6) {
      await toast("🔥 Afterburner!", `${p.name} rolled a 6: roll again!`, "up");
      log(`🔥 ${p.name} fires the afterburner for another roll.`, p.color);
      return beginTurn(true);
    }
    nextPlayer();
  }

  async function resolveLanding(p, isMover) {
    // 1) Collisions: the mover knocks rivals on the same square back
    if (isMover && p.pos !== GOAL) {
      const rivals = players.filter(o => o !== p && o.pos === p.pos);
      for (const r of rivals) {
        if (r.shield) {
          r.shield = false;
          Sfx.shield();
          layoutTokens();
          await toast("🛡️ Shield held!", `${r.name} deflected the collision`, "shield");
          log(`${r.name}'s shield absorbed a collision.`, r.color);
          continue;
        }
        Sfx.bump();
        shake(8);
        burst(r.x, r.y, p.color, 16);
        toast("💥 Collision!", `${p.name} knocks ${r.name} back ${BUMP_BACK}`, "down");
        log(`💥 ${p.name} rammed ${r.name} back ${BUMP_BACK} squares.`, p.color);
        r.el.classList.add("moving");
        const back = Math.max(1, r.pos - BUMP_BACK);
        for (let n = r.pos - 1, i = 0; n >= back; n--, i++) await hopTo(r, n, i);
        r.pos = back;
        collectCrystal(r, back);
        await resolveLanding(r, false);
        r.el.classList.remove("moving");
      }
    }

    // 2) Boosts & hazards
    const j = Board.JUMPS[p.pos];
    if (!j) return;
    const k = Board.KINDS[j.kind];
    const grp = document.getElementById(`jump-${p.pos}`);

    if (!k.up && p.shield) {
      p.shield = false;
      Sfx.shield();
      layoutTokens();
      burst(p.x, p.y, "#7fe7ff", 18);
      await toast("🛡️ Shield held!", `${p.name} deflected the ${k.name.toLowerCase()}`, "shield");
      log(`🛡️ ${p.name}'s shield blocked a ${k.name.toLowerCase()} at ${p.pos}.`, p.color);
      return;
    }

    grp && grp.classList.add("active");
    toast(`${k.icon} ${k.title}`, `${p.pos} → ${j.to}`, k.up ? "up" : "down");
    const from = p.pos;
    await ANIM[j.kind](p, from, j.to);
    grp && grp.classList.remove("active");
    p.pos = j.to;
    chip(p).style.transform = "";
    log(`${k.icon} ${p.name} ${k.verb} ${j.to}.`, p.color);
    if (!k.up) gainEnergy(p, 1);            // salvage fuel from the wreck
    collectCrystal(p, p.pos);
  }

  async function nextPlayer() {
    current = (current + 1) % players.length;
    if (current === 0) {
      round++;
      ionStorm = false;
      if ((round - 1) % EVENT_EVERY === 0) await cosmicEvent();
    }
    beginTurn();
  }

  async function cosmicEvent() {
    const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    phase = "moving";
    refreshControls();
    Sfx.event();
    $("#board").classList.add("event-flash");
    setTimeout(() => $("#board").classList.remove("event-flash"), 1200);
    log(`🌌 Cosmic event: ${ev.title}! ${ev.text}.`);
    await toast(`${ev.icon} ${ev.title}`, ev.text, "event", 1.6);
    if (ev.id === "wind") players.forEach(p => gainEnergy(p, 1));
    if (ev.id === "drain") players.forEach(p => gainEnergy(p, -1));
    if (ev.id === "rain") for (let i = 0; i < 4; i++) setTimeout(() => spawnCrystal(), i * 150);
    if (ev.id === "ion") ionStorm = true;
    await sleep(500);
  }

  // ==================================================================
  //  LANDING PREVIEW
  // ==================================================================
  function describeLanding(p, steps) {
    const { final, path, bounced } = computePath(p.pos, steps);
    const crystalsOnPath = path.filter(n => crystals.has(n)).length;
    const rivals = players.filter(o => o !== p && o.pos === final && final !== GOAL);
    const j = Board.JUMPS[final];
    let kind = "plain", text = `Lands on <b>${final}</b>`, end = final;
    if (final === GOAL) { kind = "win"; text = `🌌 <b>ANDROMEDA!</b> Mission complete`; }
    else if (j) {
      const k = Board.KINDS[j.kind];
      if (!k.up && p.shield) { kind = "shield"; text = `${k.icon} ${k.name} at <b>${final}</b>, 🛡️ shield will block it`; }
      else { kind = k.up ? "up" : "down"; end = j.to; text = `${k.icon} ${k.name}: <b>${final} → ${j.to}</b>`; }
    }
    const extras = [];
    if (bounced) extras.push("🪃 bounces off 100");
    if (crystalsOnPath) extras.push(`💎 +${crystalsOnPath}⚡`);
    if (rivals.length) extras.push(`💥 rams ${rivals.map(r => r.name).join(", ")}`);
    if (turn.roll === 6) extras.push("🔥 extra roll");
    return { final, end, kind, text, extras, crystalsOnPath, rivals };
  }

  function showPreview() {
    const p = cur();
    const steps = turn.roll + turn.adjust;
    const d = describeLanding(p, steps);
    const g = $("#ghost");
    const { x, y } = Board.cellXY(d.final);
    g.className = `ghost show ${d.kind}`;
    g.style.left = x / 10 + "%";
    g.style.top = y / 10 + "%";
    const adj = turn.adjust ? ` <span class="pv-adj">${turn.roll} ${turn.adjust > 0 ? "+" : "−"} ${Math.abs(turn.adjust)} = ${steps}</span>` : "";
    $("#preview").className = `preview ${d.kind}`;
    $("#preview").innerHTML = `<div class="pv-main">${d.text}${adj}</div>${d.extras.length ? `<div class="pv-extras">${d.extras.join(" · ")}</div>` : ""}`;
  }

  function hideGhost() {
    $("#ghost").className = "ghost";
    $("#preview").className = "preview";
    $("#preview").innerHTML = "";
  }

  // ==================================================================
  //  CPU PILOT
  // ==================================================================
  function cpuPreRoll() {
    if (phase !== "roll" || !cur().cpu) return;
    const p = cur();
    const wantShield = !p.shield && p.energy >= cost("shield") &&
      (p.energy >= 4 || (p.pos > 40 && p.energy >= cost("shield") + 1 && Math.random() < 0.5) || ionStorm);
    if (wantShield) { activateShield(); setTimeout(onRoll, 700); }
    else onRoll();
  }

  function scoreOption(p, steps) {
    const d = describeLanding(p, steps);
    let s = d.end;
    if (d.kind === "win") s += 1000;
    s += d.crystalsOnPath * 1.5 + d.rivals.length * 2;
    return s;
  }

  async function cpuDecide() {
    if (phase !== "decide" || !cur().cpu) return;
    const p = cur();
    const c = cost("thrust");
    let best = { adj: 0, score: scoreOption(p, turn.roll) };
    for (let adj = -MAX_THRUST; adj <= MAX_THRUST; adj++) {
      if (!adj || turn.roll + adj < 1 || Math.abs(adj) * c > p.energy) continue;
      const sc = scoreOption(p, turn.roll + adj) - Math.abs(adj) * c * 1.5;
      if (sc > best.score) best = { adj, score: sc };
    }
    // stuck with a bad landing? spend fuel on a reroll
    const baseline = p.pos + 3.5;
    if (best.score < baseline - 8 && !turn.rerolled && p.energy >= cost("reroll")) {
      await sleep(400);
      return reroll();
    }
    for (let i = 0; i < Math.abs(best.adj); i++) {
      await sleep(450);
      thrust(Math.sign(best.adj));
    }
    await sleep(650);
    go();
  }

  // ==================================================================
  //  WIN
  // ==================================================================
  function win(p) {
    phase = "over";
    layoutTokens();
    refreshControls();
    log(`🏆 ${p.name} reached the Andromeda Galaxy in round ${round}!`, p.color);
    Sfx.win();
    celebrate(p.color);
    setTimeout(() => {
      const av = $("#win-avatar");
      av.textContent = p.emoji;
      av.style.setProperty("--pc", p.color);
      $("#win-text").innerHTML = `<strong>${escapeHtml(p.name)}</strong> warped all the way to the <strong>Andromeda Galaxy</strong>, 2.5 million light-years from home, in round ${round}!`;
      $("#win-modal").classList.add("open");
      $("#again-btn").focus();
    }, 900);
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
  function energyPips(n) {
    let s = "";
    for (let i = 0; i < MAX_ENERGY; i++) s += `<i class="${i < n ? "on" : ""}"></i>`;
    return `<span class="pips" aria-label="${n} energy">${s}</span>`;
  }

  function refreshControls() {
    const p = cur();
    const human = p && !p.cpu;
    const rb = $("#roll-btn");
    if (phase === "decide") {
      const d = describeLanding(p, turn.roll + turn.adjust);
      rb.innerHTML = `<span>Launch → ${d.final}</span><kbd>Space</kbd>`;
      rb.classList.add("go");
    } else {
      rb.innerHTML = `<span>${turn && turn.extra ? "Roll again 🔥" : "Roll the dice"}</span><kbd>Space</kbd>`;
      rb.classList.remove("go");
    }
    rb.disabled = !human || !(phase === "roll" || phase === "decide");

    const set = (id, ok, c) => {
      const b = $(id);
      b.disabled = !human || !ok;
      const tag = b.querySelector(".ac");
      if (tag) tag.textContent = c === 0 ? "FREE" : `${c}⚡`;
    };
    set("#shield-btn", phase === "roll" && p && !p.shield && p.energy >= cost("shield"), cost("shield"));
    const canThrust = dir => {
      if (phase !== "decide") return false;
      const next = turn.adjust + dir;
      if (Math.abs(next) > MAX_THRUST || turn.roll + next < 1) return false;
      return Math.abs(next) < Math.abs(turn.adjust) || p.energy >= cost("thrust");
    };
    set("#minus-btn", canThrust(-1), cost("thrust"));
    set("#plus-btn", canThrust(1), cost("thrust"));
    set("#reroll-btn", phase === "decide" && !turn.rerolled && p.energy + refundable() >= cost("reroll"), cost("reroll"));
    $("#actions").classList.toggle("ion", ionStorm);
  }

  function updatePanel() {
    if (!players.length) return;
    const p = cur();
    const tp = $("#turn-player");
    tp.style.setProperty("--pc", p.color);
    const status = phase === "over" ? "Winner!" :
      p.cpu ? "🤖 CPU pilot is thinking…" : `Square ${p.pos} · ${GOAL - p.pos} to go`;
    tp.innerHTML = `
      <div class="crew-badge" style="--pc:${p.color}">${p.emoji}</div>
      <div style="min-width:0">
        <div class="tp-name">${escapeHtml(p.name)} ${p.shield ? "🛡️" : ""}</div>
        <div class="tp-sub">${status}</div>
      </div>
      <div class="tp-energy">${energyPips(p.energy)}</div>`;

    const nextEvent = EVENT_EVERY - ((round - 1) % EVENT_EVERY);
    $("#round-info").innerHTML = `Round <b>${round}</b> · ${ionStorm ? `<span class="ion-tag">⚡ ION STORM: abilities free</span>` : `cosmic event in ${nextEvent} round${nextEvent > 1 ? "s" : ""}`}`;

    const list = $("#player-list");
    list.innerHTML = "";
    const ranked = [...players].sort((a, b) => b.pos - a.pos);
    players.forEach((pl, i) => {
      const li = document.createElement("li");
      li.style.setProperty("--pc", pl.color);
      if (i === current && phase !== "over") li.classList.add("current");
      const rank = ranked.indexOf(pl) + 1;
      li.innerHTML = `
        <div class="crew-badge" style="--pc:${pl.color}">${pl.emoji}</div>
        <div style="min-width:0">
          <div class="pl-name">${escapeHtml(pl.name)} ${pl.cpu ? '<span class="tag">CPU</span>' : ""} ${pl.shield ? "🛡️" : ""}</div>
          <div class="pl-meta">${energyPips(pl.energy)}<div class="pl-bar"><span style="width:${pl.pos}%"></span></div></div>
        </div>
        <div class="pl-pos"><small>#${rank}</small>${pl.pos}</div>`;
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

  function toast(title, sub, kind, hold = 0.9) {
    const t = $("#toast");
    t.className = `toast ${kind || ""}`;
    t.innerHTML = `${title}<small>${sub || ""}</small>`;
    gsap.killTweensOf(t);
    return new Promise(res => {
      gsap.timeline({ onComplete: res })
        .fromTo(t, { opacity: 0, scale: 0.6, xPercent: -50, yPercent: -50 },
          { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" })
        .to(t, { opacity: 0, scale: 0.9, duration: 0.3, delay: hold });
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderLegend() {
    const ups = [], downs = [];
    for (const [id, k] of Object.entries(Board.KINDS)) (k.up ? ups : downs).push(`<li><span>${k.icon}</span>${k.name}</li>`);
    $("#legend").innerHTML = `
      <div><h4 class="up">Boosts ▲</h4><ul>${ups.join("")}</ul></div>
      <div><h4 class="down">Hazards ▼</h4><ul>${downs.join("")}</ul></div>`;
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
      b.onclick = () => { forcedRoll = forcedRoll === v ? null : v; renderTestDice(); };
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
    log(`🧪 Test: ${p.name} teleported to ${n}.`, p.color);
  }

  // ==================================================================
  //  WIRING
  // ==================================================================
  function init() {
    Board.build($("#grid"), $("#paths"));
    Dice3D.init($("#dice-stage"));
    renderCountPicker();
    renderRoster();
    renderLegend();
    renderTestDice();

    const tt = $("#test-toggle");
    tt.checked = testMode;
    tt.onchange = () => { testMode = tt.checked; };

    $("#launch-btn").onclick = startGame;
    $("#roll-btn").onclick = () => (phase === "decide" ? go() : onRoll());
    $("#shield-btn").onclick = activateShield;
    $("#minus-btn").onclick = () => thrust(-1);
    $("#plus-btn").onclick = () => thrust(1);
    $("#reroll-btn").onclick = reroll;
    $("#again-btn").onclick = startGame;
    $("#newcrew-btn").onclick = backToSetup;
    $("#restart-btn").onclick = () => {
      if (phase === "over" || confirm("Abort this mission and return to crew setup?")) backToSetup();
    };
    $("#mute-btn").onclick = e => { e.currentTarget.textContent = Sfx.toggle() ? "🔇" : "🔊"; };
    $("#test-go").onclick = testTeleport;
    $("#test-energy").onclick = () => { if (players.length) gainEnergy(cur(), 1); };

    document.addEventListener("keydown", e => {
      if (!$("#game").classList.contains("active") || $("#win-modal").classList.contains("open")) return;
      if (e.target.matches("input, textarea")) return;
      if (!players.length || cur().cpu) return;
      const k = e.key.toLowerCase();
      if (e.code === "Space" || e.key === "Enter") {
        const ae = document.activeElement;
        if (ae && ae.tagName === "BUTTON" && ae !== $("#roll-btn")) return;
        e.preventDefault();
        phase === "decide" ? go() : onRoll();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); thrust(-1); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); thrust(1); }
      else if (k === "s") activateShield();
      else if (k === "r") reroll();
    });

    // expose a tiny hook for automated tests
    window.__aq = { get state() { return { phase, current, round, players: players.map(p => ({ pos: p.pos, energy: p.energy, shield: p.shield })) }; } };
  }

  init();
})();
