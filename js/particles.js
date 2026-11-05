/* Canvas particle engine. Particles live in board units (0..1000) and are projected
   through the Camera each frame, so they stay crisp at any zoom level. */
const Particles = (() => {
  let canvas, ctx, W = 1, H = 1, dpr = 1;
  const list = [];
  const emitters = [];
  const MAX_PARTICLES = 1500;
  const sprites = new Map();
  let last = performance.now();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = v => (Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v);
  const range = v => (Array.isArray(v) ? rnd(v[0], v[1]) : v);

  /** Pre-rendered soft glow dot per colour. */
  function sprite(color) {
    if (sprites.has(color)) return sprites.get(color);
    const s = 64, c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, "#ffffff");
    gr.addColorStop(0.18, color);
    gr.addColorStop(0.45, color + "88");
    gr.addColorStop(1, color + "00");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    sprites.set(color, c);
    return c;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }

  /**
   * Emit a burst.
   * opts: count, colors, speed[min,max], angle (rad), spread (rad), life[min,max], size[min,max],
   *       grow (end size multiplier), gravity, drag, shape(dot|star|ring|streak|smoke), alpha,
   *       jitter (spawn radius), attract {x,y,k}, swirl (tangential accel around attract point)
   */
  function emit(x, y, o = {}) {
    if (reduce) o = { ...o, count: Math.ceil((o.count || 10) / 4) };
    const n = o.count ?? 10;
    for (let i = 0; i < n && list.length < MAX_PARTICLES; i++) {
      const ang = o.angle !== undefined ? o.angle + rnd(-(o.spread ?? Math.PI * 2) / 2, (o.spread ?? Math.PI * 2) / 2) : rnd(0, Math.PI * 2);
      const sp = range(o.speed ?? [40, 120]);
      const j = o.jitter || 0;
      const ja = rnd(0, Math.PI * 2), jr = Math.sqrt(Math.random()) * j;
      const life = range(o.life ?? [0.5, 1]);
      list.push({
        x: x + Math.cos(ja) * jr, y: y + Math.sin(ja) * jr,
        vx: Math.cos(ang) * sp + (o.vx || 0), vy: Math.sin(ang) * sp + (o.vy || 0),
        life, age: 0,
        size: range(o.size ?? [3, 6]), grow: o.grow ?? 0.3,
        color: pick(o.colors ?? "#ffffff"),
        gravity: o.gravity ?? 0, drag: o.drag ?? 0.97,
        shape: o.shape || "dot", alpha: o.alpha ?? 1,
        attract: o.attract || null, swirl: o.swirl || 0,
        rot: rnd(0, Math.PI), vr: rnd(-4, 4),
      });
    }
  }

  /** Expanding shockwave ring. */
  function ring(x, y, color = "#ffffff", radius = 80, life = 0.6) {
    list.push({ x, y, vx: 0, vy: 0, life, age: 0, size: 4, grow: radius / 4, color, gravity: 0, drag: 1, shape: "ring", alpha: 0.9, rot: 0, vr: 0 });
  }

  /** Continuous ambient emitter; returns a handle you can remove. */
  function addEmitter(x, y, rate, opts) {
    const e = { x, y, rate, opts, acc: Math.random() };
    emitters.push(e);
    return e;
  }
  function clearEmitters() { emitters.length = 0; }

  /** Emit along a moving source every frame until stop() is called. */
  function trail(getPos, opts, rate = 60) {
    const e = { get x() { return getPos().x; }, get y() { return getPos().y; }, rate, opts, acc: 0 };
    emitters.push(e);
    return () => { const i = emitters.indexOf(e); if (i >= 0) emitters.splice(i, 1); };
  }

  function update(dt) {
    for (const e of emitters) {
      e.acc += e.rate * dt;
      while (e.acc >= 1) { e.acc -= 1; emit(e.x, e.y, { ...e.opts, count: 1 }); }
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) { list.splice(i, 1); continue; }
      if (p.attract) {
        const dx = p.attract.x - p.x, dy = p.attract.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.vx += (dx / d) * p.attract.k * dt;
        p.vy += (dy / d) * p.attract.k * dt;
        if (p.swirl) { p.vx += (-dy / d) * p.swirl * dt; p.vy += (dx / d) * p.swirl * dt; }
        if (d < 6) { p.age = p.life; }
      }
      p.vy += p.gravity * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const p of list) {
      const t = p.age / p.life;
      const pr = Camera.project(p.x, p.y);
      if (pr.x < -50 || pr.y < -50 || pr.x > W + 50 || pr.y > H + 50) continue;
      const size = p.size * (1 + (p.grow - 1) * t) * pr.k;
      const a = p.alpha * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      ctx.globalAlpha = Math.max(0, a);
      ctx.globalCompositeOperation = p.shape === "smoke" ? "source-over" : "lighter";
      switch (p.shape) {
        case "star": {
          ctx.save();
          ctx.translate(pr.x, pr.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const r = k % 2 ? size * 0.25 : size;
            const an = (k / 8) * Math.PI * 2;
            ctx[k ? "lineTo" : "moveTo"](Math.cos(an) * r, Math.sin(an) * r);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case "ring":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, 3 * pr.k * (1 - t));
          ctx.beginPath(); ctx.arc(pr.x, pr.y, size, 0, Math.PI * 2); ctx.stroke();
          break;
        case "streak": {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const len = Math.min(40, sp * 0.06) * pr.k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, size * 0.4);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(pr.x, pr.y);
          ctx.lineTo(pr.x - (p.vx / sp) * len, pr.y - (p.vy / sp) * len);
          ctx.stroke();
          break;
        }
        case "smoke":
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(pr.x, pr.y, size, 0, Math.PI * 2); ctx.fill();
          break;
        default: {
          const img = sprite(p.color);
          const r = size * 1.9; // glow halo extends beyond the core
          ctx.drawImage(img, pr.x - r, pr.y - r, r * 2, r * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (canvas.offsetParent === null) { requestAnimationFrame(loop); return; } // game screen hidden: idle
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    resize();
    requestAnimationFrame(loop);
  }

  // ---------- ready-made effects ----------
  const FX = {
    dust: (x, y) => emit(x, y + 20, { count: 8, colors: ["#c9d4ff", "#9aa5d1"], speed: [30, 80], angle: -Math.PI / 2, spread: Math.PI * 1.2, life: [0.3, 0.6], size: [2, 4], gravity: 120 }),
    fire: { colors: ["#fff3c4", "#ffd166", "#ff9e00", "#ff4f00"], speed: [20, 70], life: [0.3, 0.7], size: [4, 9], grow: 0.2, drag: 0.92 },
    smoke: { colors: ["rgba(180,190,230,0.25)", "rgba(140,150,200,0.2)"], speed: [5, 20], angle: -Math.PI / 2, spread: 1, life: [1, 2], size: [5, 9], grow: 2.6, shape: "smoke", drag: 0.98, vy: -15 },
    ice: { colors: ["#ffffff", "#bdf3ff", "#7fe7ff"], speed: [10, 50], life: [0.5, 1.1], size: [2, 5], shape: "star", drag: 0.95 },
    green: { colors: ["#c8ffd6", "#3ee08f", "#9dffb0"], speed: [10, 30], life: [0.8, 1.4], size: [2, 4], drag: 0.97 },
    purple: { colors: ["#e0c3ff", "#c77dff", "#7b2ff7", "#ffffff"], speed: [10, 40], life: [0.6, 1.2], size: [2, 5], shape: "star" },
    ember: { colors: ["#ffd166", "#ff6b35", "#ff2e63"], speed: [20, 70], life: [0.6, 1.3], size: [2, 4], shape: "streak", drag: 0.96 },
    gold: { colors: ["#ffe9a8", "#ffd166", "#ffffff"], speed: [5, 25], life: [1, 2], size: [2, 4], shape: "star", drag: 0.98 },
    dark: { colors: ["#7b2ff7", "#ff7b54", "#3a0ca3"], speed: [10, 30], life: [0.4, 0.9], size: [3, 6] },
  };

  return { init, emit, ring, addEmitter, clearEmitters, trail, FX, get count() { return list.length; } };
})();
