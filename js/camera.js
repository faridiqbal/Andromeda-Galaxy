/* Smooth 2D camera over the board: zoom, follow, fit, manual wheel/drag control.
   Works in board units (0..1000). The camera element is scaled with a CSS transform. */
const Camera = (() => {
  let el, host;
  const cur = { x: 500, y: 500, s: 1 };
  const target = { x: 500, y: 500, s: 1 };
  let followFn = null;
  let auto = true;
  let last = performance.now();
  const MIN = 1, MAX = 3.2;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function clampTarget() {
    target.s = clamp(target.s, MIN, MAX);
    const half = 500 / target.s;
    target.x = clamp(target.x, half, 1000 - half);
    target.y = clamp(target.y, half, 1000 - half);
  }

  function apply() {
    const left = cur.x - 500 / cur.s;
    const top = cur.y - 500 / cur.s;
    el.style.transform = `translate(${(-left * cur.s) / 10}%, ${(-top * cur.s) / 10}%) scale(${cur.s})`;
    host.classList.toggle("zoomed", cur.s > 1.05);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (host.offsetParent === null) { requestAnimationFrame(frame); return; } // game screen hidden: idle
    if (followFn) {
      const p = followFn();
      target.x = p.x; target.y = p.y;
    }
    clampTarget();
    const k = 1 - Math.pow(1 - 0.085, dt * 60);
    // zoom eases a little slower than panning for a cinematic feel
    const ks = 1 - Math.pow(1 - 0.06, dt * 60);
    cur.s += (target.s - cur.s) * ks;
    const half = 500 / cur.s;
    cur.x = clamp(cur.x + (target.x - cur.x) * k, half, 1000 - half);
    cur.y = clamp(cur.y + (target.y - cur.y) * k, half, 1000 - half);
    apply();
    requestAnimationFrame(frame);
  }

  function whoosh(newS) {
    if (Math.abs(newS - target.s) > 0.35 && typeof Sfx !== "undefined") Sfx.zoom(newS > target.s ? 1 : -1);
  }

  // ---------- public API (auto moves are ignored when auto camera is off) ----------
  function focus(x, y, s = 2) {
    if (!auto) return;
    followFn = null;
    whoosh(s);
    Object.assign(target, { x, y, s });
  }
  function follow(fn, s = 1.9) {
    if (!auto) return;
    whoosh(s);
    followFn = fn;
    target.s = s;
  }
  function fit(a, b, pad = 170) {
    if (!auto) return;
    followFn = null;
    const w = Math.abs(a.x - b.x) + pad * 2, h = Math.abs(a.y - b.y) + pad * 2;
    const s = clamp(1000 / Math.max(w, h), 1, 2.2);
    whoosh(s);
    Object.assign(target, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, s });
  }
  function overview() {
    if (!auto) return;
    followFn = null;
    whoosh(1);
    Object.assign(target, { x: 500, y: 500, s: 1 });
  }

  // manual control (always allowed)
  function zoomAt(factor, ux, uy) {
    followFn = null;
    if (ux === undefined) { ux = target.x; uy = target.y; }
    const ns = clamp(target.s * factor, MIN, MAX);
    // keep the point under the cursor fixed
    target.x = ux - (ux - target.x) * (target.s / ns);
    target.y = uy - (uy - target.y) * (target.s / ns);
    target.s = ns;
  }
  function panBy(dx, dy) {
    followFn = null;
    target.x -= dx / target.s;
    target.y -= dy / target.s;
  }

  /** Screen point (px inside host) -> board units. */
  function unproject(px, py) {
    const W = host.clientWidth || 1;
    const left = cur.x - 500 / cur.s, top = cur.y - 500 / cur.s;
    return { x: left + (px / W) * 1000 / cur.s, y: top + (py / W) * 1000 / cur.s };
  }
  /** Board units -> px inside host (for the particle canvas). */
  function project(x, y) {
    const W = host.clientWidth || 1;
    const left = cur.x - 500 / cur.s, top = cur.y - 500 / cur.s;
    const k = (W / 1000) * cur.s;
    return { x: (x - left) * k, y: (y - top) * k, k };
  }

  function init(cameraEl, hostEl) {
    el = cameraEl; host = hostEl;
    apply();
    requestAnimationFrame(frame);

    host.addEventListener("wheel", e => {
      e.preventDefault();
      const r = host.getBoundingClientRect();
      const p = unproject(e.clientX - r.left, e.clientY - r.top);
      zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, p.x, p.y);
    }, { passive: false });

    // drag to pan (mouse / single finger), pinch to zoom
    const pts = new Map();
    let pinch = null;
    host.addEventListener("pointerdown", e => {
      if (e.target.closest("button")) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      host.setPointerCapture(e.pointerId);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: target.s };
      }
    });
    host.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      const now = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, now);
      const W = host.clientWidth || 1;
      if (pts.size === 1 && cur.s > 1.02) {
        host.classList.add("dragging");
        panBy(((now.x - prev.x) / W) * 1000, ((now.y - prev.y) / W) * 1000);
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = host.getBoundingClientRect();
        const c = unproject((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        zoomAt((pinch.s * (d / pinch.d)) / target.s, c.x, c.y);
      }
    });
    const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) host.classList.remove("dragging"); };
    host.addEventListener("pointerup", end);
    host.addEventListener("pointercancel", end);
    host.addEventListener("dblclick", () => { followFn = null; Object.assign(target, { x: 500, y: 500, s: 1 }); });
  }

  return {
    init, focus, follow, fit, overview, zoomAt, panBy, project, unproject,
    get scale() { return cur.s; },
    get auto() { return auto; },
    setAuto(v) { auto = v; if (!v) followFn = null; },
    reset() { followFn = null; Object.assign(target, { x: 500, y: 500, s: 1 }); },
  };
})();
