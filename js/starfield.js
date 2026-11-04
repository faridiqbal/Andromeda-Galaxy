/* Animated twinkling starfield with occasional shooting stars. */
(() => {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, dpr, stars = [], shooters = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.floor((w * h) / 2600);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.3 + 0.2,
      a: Math.random() * Math.PI * 2,
      s: 0.5 + Math.random() * 2,
      hue: Math.random() < 0.15 ? 200 + Math.random() * 60 : 0,
      drift: Math.random() * 0.06 + 0.01,
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(s.a + t * 0.001 * s.s);
      ctx.globalAlpha = tw;
      ctx.fillStyle = s.hue ? `hsl(${s.hue},80%,85%)` : "#fff";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      if (!reduce) { s.x -= s.drift; if (s.x < -2) s.x = w + 2; }
    }
    if (!reduce && Math.random() < 0.004 && shooters.length < 2) {
      shooters.push({ x: Math.random() * w, y: Math.random() * h * 0.5, vx: -(6 + Math.random() * 4), vy: 2 + Math.random() * 2, life: 1 });
    }
    shooters = shooters.filter(s => s.life > 0);
    for (const s of shooters) {
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 12, s.y - s.vy * 12);
      g.addColorStop(0, `rgba(255,255,255,${s.life})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 12, s.y - s.vy * 12); ctx.stroke();
      s.x += s.vx; s.y += s.vy; s.life -= 0.012;
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
