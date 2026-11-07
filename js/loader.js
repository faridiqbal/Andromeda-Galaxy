/* On-demand script loading. The big libraries are fetched only when a feature needs them:
     engine   – 3D dice (Three.js + dice.js) and animation (GSAP): when a mission launches
     peer     – PeerJS: when an online room is created or joined
     confetti – the finish celebration: quietly in the background once a game starts
   Over http(s) files are streamed with fetch so real progress can be shown; when that
   isn't possible (e.g. opened straight from disk) it falls back to plain <script> tags. */
const Loader = (() => {
  const LIBS = {
    gsap:     { src: "js/lib/gsap-3.12.5.min.js",          size: 72214,  ready: () => !!window.gsap },
    three:    { src: "js/lib/three-r128.min.js",         size: 603445, ready: () => !!window.THREE },
    dice:     { src: "js/dice.js",                  size: 9000,   ready: () => typeof Dice3D !== "undefined", after: ["three"] },
    peer:     { src: "js/lib/peerjs-1.5.4.min.js",        size: 92865,  ready: () => typeof window.Peer === "function" },
    confetti: { src: "js/lib/confetti-1.9.3.browser.js",  size: 24906,  ready: () => typeof window.confetti === "function" },
  };
  const got = {};      // bytes received per library
  const pending = {};  // in-flight promises

  function tag(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Couldn't load " + src));
      document.head.appendChild(s);
    });
  }

  async function fetchRun(name) {
    const lib = LIBS[name];
    const res = await fetch(lib.src);
    if (!res.ok || !res.body) throw new Error("fetch failed");
    const reader = res.body.getReader();
    const chunks = [];
    got[name] = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got[name] += value.length;
    }
    const s = document.createElement("script");
    s.text = await new Blob(chunks).text();
    document.head.appendChild(s);
    s.remove(); // the code has run; drop the (large) source text from the DOM
    if (!lib.ready()) throw new Error("inline script blocked");
  }

  function one(name) {
    const lib = LIBS[name];
    if (lib.ready()) { got[name] = lib.size; return Promise.resolve(); }
    if (pending[name]) return pending[name];
    pending[name] = (async () => {
      for (const dep of lib.after || []) await one(dep);
      try { await fetchRun(name); }
      catch { await tag(lib.src); }
      got[name] = lib.size;
    })().finally(() => { delete pending[name]; });
    return pending[name];
  }

  /** Load libraries; onProgress(0..1) is called while bytes arrive. */
  async function load(names, onProgress) {
    const all = [...new Set(names.flatMap(n => [...(LIBS[n].after || []), n]))];
    const todo = all.filter(n => !LIBS[n].ready());
    if (!todo.length) { onProgress && onProgress(1); return; }
    const total = todo.reduce((t, n) => t + LIBS[n].size, 0);
    let timer = 0;
    if (onProgress) {
      const tick = () => onProgress(Math.min(1, todo.reduce((t, n) => t + Math.min(got[n] || 0, LIBS[n].size), 0) / total));
      timer = setInterval(tick, 60);
      tick();
    }
    try { await Promise.all(todo.map(one)); }
    finally { clearInterval(timer); onProgress && onProgress(1); }
  }

  const ready = name => LIBS[name].ready();
  return { load, ready };
})();
