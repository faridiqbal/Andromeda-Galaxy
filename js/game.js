/* Andromeda Quest — game flow, setup screen, tokens & turn logic. */
(() => {
  const AVATARS = [
    { e: "🚀", n: "Rocket" }, { e: "🛸", n: "UFO" }, { e: "👩‍🚀", n: "Astronaut" }, { e: "🛰️", n: "Satellite" },
    { e: "🪐", n: "Ringed planet" }, { e: "☄️", n: "Comet" }, { e: "🌙", n: "Moon" }, { e: "⭐", n: "Star" },
    { e: "👽", n: "Alien" }, { e: "🤖", n: "Robot" },
  ];
  const COLORS = ["#ff5d73", "#36d1ff", "#ffd166", "#3ee08f", "#b388ff"];
  const DEFAULT_NAMES = ["Nova", "Orion", "Vega", "Luna", "Atlas"];
  const MAX = 5;
  const GOAL = 100;

  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- Setup state ----------
  let count = 2;
  let renderedRows = 0; // only animate rows that are newly added
  const crew = Array.from({ length: MAX }, (_, i) => ({ name: "", avatar: i, color: COLORS[i] }));

  // ---------- Game state ----------
  let players = [];
  let current = 0;
  let busy = false;
  let over = false;

  // =========================================================
  //  SETUP SCREEN
  // =========================================================
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
        if (takenBy >= 0) { b.disabled = true; b.title = `${a.n} — taken by player ${takenBy + 1}`; }
        b.onclick = () => { c.avatar = k; Sfx.select(); renderRoster(); };
        grid.appendChild(b);
      });

      row.append(badge, input, grid);
      roster.appendChild(row);
    }
    renderedRows = count;
  }

  // =========================================================
  //  GAME START
  // =========================================================
  function startGame() {
    Sfx.unlock();
    players = crew.slice(0, count).map((c, i) => ({
      id: i,
      name: (c.name || "").trim() || `Commander ${DEFAULT_NAMES[i]}`,
      emoji: AVATARS[c.avatar].e,
      color: c.color,
      pos: 1,
      el: null,
      x: 0, y: 0, ox: 0, oy: 0,
    }));
    current = 0;
    over = false;
    busy = false;

    $("#setup").classList.remove("active");
    $("#game").classList.add("active");
    $("#log").innerHTML = "";
    $("#dice-result").textContent = "–";

    createTokens();
    requestAnimationFrame(() => Dice3D.resize());
    updatePanel();
    log(`All crews are on the launch pad at Earth. ${players[0].name} goes first!`);
    $("#roll-btn").disabled = false;
    $("#roll-btn").focus();
  }

  function backToSetup() {
    $("#win-modal").classList.remove("open");
    $("#game").classList.remove("active");
    $("#setup").classList.add("active");
    renderedRows = 0;
    renderCountPicker();
    renderRoster();
  }

  // =========================================================
  //  TOKENS
  // =========================================================
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
      const { x, y } = Board.cellXY(p.pos);
      p.x = x; p.y = y;
    }
    layoutTokens(true);
  }

  // keep stacked tokens fully inside the board
  const clamp = v => Math.min(964, Math.max(36, v));
  function place(p) {
    p.el.style.left = clamp(p.x + p.ox) / 10 + "%";
    p.el.style.top = clamp(p.y + p.oy) / 10 + "%";
  }

  /** Spread out tokens that share a square so they're all visible. */
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
        if (instant) { p.ox = ox; p.oy = oy; place(p); }
        else gsap.to(p, { ox, oy, duration: 0.3, ease: "power2.out", onUpdate: () => place(p) });
      });
    }
    players.forEach((p, i) => p.el.classList.toggle("current", i === current && !over));
  }

  function hopTo(p, cell, i) {
    const { x, y } = Board.cellXY(cell);
    const from = { x: p.x, y: p.y };
    const s = { t: 0 };
    return new Promise(res => {
      gsap.to(s, {
        t: 1, duration: 0.3, ease: "power1.inOut",
        onUpdate: () => {
          p.x = from.x + (x - from.x) * s.t;
          p.y = from.y + (y - from.y) * s.t - Math.sin(Math.PI * s.t) * 45;
          const sc = 1 + Math.sin(Math.PI * s.t) * 0.25;
          p.el.firstElementChild.nextElementSibling.style.transform = `scale(${sc})`;
          place(p);
        },
        onComplete: () => { Sfx.step(i); res(); },
      });
    });
  }

  function flyRocket(p, from, to) {
    const a = Board.cellXY(from), b = Board.cellXY(to);
    const grp = document.getElementById(`rocket-${from}`);
    grp && grp.classList.add("active");
    p.el.classList.add("boosting");
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 90;
    p.el.style.transform = `translate(-50%,-50%) rotate(${ang}deg)`;
    Sfx.rocket();
    const s = { t: 0 };
    const dur = 0.9 + Math.hypot(b.x - a.x, b.y - a.y) / 900;
    return new Promise(res => {
      gsap.to(s, {
        t: 1, duration: dur, ease: "power2.in",
        onUpdate: () => {
          p.x = a.x + (b.x - a.x) * s.t;
          p.y = a.y + (b.y - a.y) * s.t;
          p.el.lastElementChild.style.transform = `scale(${1 + Math.sin(Math.PI * s.t) * 0.45})`;
          place(p);
        },
        onComplete: () => {
          p.el.classList.remove("boosting");
          p.el.lastElementChild.style.transform = "";
          p.el.style.transform = "translate(-50%,-50%)";
          grp && grp.classList.remove("active");
          res();
        },
      });
    });
  }

  function slideSerpent(p, head) {
    const grp = document.getElementById(`serpent-${head}`);
    grp && grp.classList.add("active");
    Sfx.serpent();
    const s = { t: 0 };
    return new Promise(res => {
      gsap.to(s, {
        t: 1, duration: 1.5, ease: "power1.inOut",
        onUpdate: () => {
          const pt = Board.serpentPoint(+head, s.t);
          p.x = pt.x; p.y = pt.y;
          p.el.lastElementChild.style.transform = `rotate(${s.t * 720}deg) scale(${1 - Math.sin(Math.PI * s.t) * 0.3})`;
          place(p);
        },
        onComplete: () => {
          p.el.lastElementChild.style.transform = "";
          grp && grp.classList.remove("active");
          res();
        },
      });
    });
  }

  // =========================================================
  //  TURN
  // =========================================================
  async function takeTurn() {
    if (busy || over || !players.length) return;
    busy = true;
    $("#roll-btn").disabled = true;
    Sfx.unlock();

    const p = players[current];
    const value = 1 + Math.floor(Math.random() * 6);
    const res = $("#dice-result");
    res.textContent = "…";

    Sfx.whoosh();
    await Dice3D.roll(value, { onBounce: s => Sfx.clack(s) });
    res.textContent = value;
    gsap.fromTo(res, { scale: 1.6, color: "#ffd166" }, { scale: 1, color: "#e8ecff", duration: 0.5, ease: "back.out(3)" });
    await sleep(450);
    Dice3D.hide();

    // Build the step path: forward to 100, then bounce back with the remaining pips
    const path = [];
    let pos = p.pos, dir = 1, bounced = false;
    for (let i = 0; i < value; i++) {
      if (pos === GOAL) { dir = -1; bounced = true; }
      pos += dir;
      path.push(pos);
    }

    const start = p.pos;
    p.el.classList.add("moving");
    // lift the token out of any stack while moving
    gsap.to(p, { ox: 0, oy: 0, duration: 0.15, onUpdate: () => place(p) });
    for (let i = 0; i < path.length; i++) await hopTo(p, path[i], i);
    p.el.firstElementChild.nextElementSibling.style.transform = "";
    p.pos = pos;

    let msg = `${p.name} rolled a ${value}: ${start} → ${pos}`;
    if (bounced) {
      Sfx.bounce();
      await toast("Gravity slingshot!", `Overshot Andromeda, bounced back to ${pos}`, "bounce");
      msg += " (bounced back)";
    }

    if (Board.ROCKETS[pos]) {
      const to = Board.ROCKETS[pos];
      toast("🚀 Rocket boost!", `${pos} → ${to}`, "rocket");
      await flyRocket(p, pos, to);
      msg += `, then rocket-boosted to ${to}`;
      p.pos = to;
    } else if (Board.SERPENTS[pos]) {
      const to = Board.SERPENTS[pos];
      toast("🐍 Space serpent!", `Swallowed at ${pos}, spat out at ${to}`, "serpent");
      await slideSerpent(p, pos);
      msg += `, but a space serpent dragged them to ${to}`;
      p.pos = to;
    }
    p.el.classList.remove("moving");
    log(msg, p.color);

    if (p.pos === GOAL) {
      layoutTokens();
      updatePanel();
      return win(p);
    }

    current = (current + 1) % players.length;
    layoutTokens();
    updatePanel();
    busy = false;
    $("#roll-btn").disabled = false;
  }

  function win(p) {
    over = true;
    busy = false;
    layoutTokens();
    log(`🏆 ${p.name} reached the Andromeda Galaxy!`, p.color);
    Sfx.win();
    celebrate(p.color);
    setTimeout(() => {
      const m = $("#win-modal");
      const av = $("#win-avatar");
      av.textContent = p.emoji;
      av.style.setProperty("--pc", p.color);
      $("#win-text").innerHTML = `<strong>${escapeHtml(p.name)}</strong> has warped all the way to the <strong>Andromeda Galaxy</strong>, 2.5 million light-years from home!`;
      m.classList.add("open");
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

  // =========================================================
  //  PANEL / UI
  // =========================================================
  function updatePanel() {
    const p = players[current];
    const tp = $("#turn-player");
    tp.style.setProperty("--pc", p.color);
    tp.innerHTML = `
      <div class="crew-badge" style="--pc:${p.color}">${p.emoji}</div>
      <div>
        <div class="tp-name">${escapeHtml(p.name)}</div>
        <div class="tp-sub">${over ? "Winner!" : `On square ${p.pos} · ${GOAL - p.pos} to go`}</div>
      </div>`;

    const list = $("#player-list");
    list.innerHTML = "";
    players.forEach((pl, i) => {
      const li = document.createElement("li");
      li.style.setProperty("--pc", pl.color);
      if (i === current && !over) li.classList.add("current");
      li.innerHTML = `
        <div class="crew-badge" style="--pc:${pl.color}">${pl.emoji}</div>
        <div style="min-width:0">
          <div class="pl-name">${escapeHtml(pl.name)}</div>
          <div class="pl-bar"><span style="width:${pl.pos}%"></span></div>
        </div>
        <div class="pl-pos">${pl.pos}</div>`;
      list.appendChild(li);
    });
  }

  function log(text, color) {
    const li = document.createElement("li");
    li.textContent = text;
    if (color) li.style.setProperty("--pc", color);
    const ol = $("#log");
    ol.prepend(li);
    while (ol.children.length > 40) ol.lastChild.remove();
  }

  function toast(title, sub, kind) {
    const t = $("#toast");
    t.className = `toast ${kind || ""}`;
    t.innerHTML = `${title}<small>${sub || ""}</small>`;
    gsap.killTweensOf(t);
    return new Promise(res => {
      gsap.timeline({ onComplete: res })
        .fromTo(t, { opacity: 0, scale: 0.6, xPercent: -50, yPercent: -50 },
          { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" })
        .to(t, { opacity: 0, scale: 0.9, duration: 0.3, delay: 0.9 });
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // =========================================================
  //  WIRING
  // =========================================================
  function init() {
    Board.build($("#grid"), $("#paths"));
    Dice3D.init($("#dice-stage"));
    renderCountPicker();
    renderRoster();

    $("#launch-btn").onclick = startGame;
    $("#roll-btn").onclick = takeTurn;
    $("#again-btn").onclick = () => {
      $("#win-modal").classList.remove("open");
      // same crew, fresh positions
      startGame();
    };
    $("#newcrew-btn").onclick = backToSetup;
    $("#restart-btn").onclick = () => {
      if (busy) return;
      if (over || confirm("Abort this mission and return to crew setup?")) backToSetup();
    };
    $("#mute-btn").onclick = e => { e.currentTarget.textContent = Sfx.toggle() ? "🔇" : "🔊"; };

    document.addEventListener("keydown", e => {
      if (!$("#game").classList.contains("active")) return;
      if (e.target.matches("input, textarea")) return;
      if (e.code === "Space" || e.key === "Enter") {
        if (document.activeElement && document.activeElement.tagName === "BUTTON" && document.activeElement !== $("#roll-btn")) return;
        e.preventDefault();
        takeTurn();
      }
    });
  }

  init();
})();
