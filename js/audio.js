/* Tiny synthesized sound effects via Web Audio (no audio files needed). */
const Sfx = (() => {
  let ctx = null;
  let muted = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = "sine", vol = 0.12, to = null, delay = 0 } = {}) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, { vol = 0.2, freq = 1800, to = null, q = 1, delay = 0, type = "bandpass" } = {}) {
    const c = ac(); if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  return {
    unlock: ac,
    get muted() { return muted; },
    toggle() { muted = !muted; return muted; },
    whoosh() { noise(0.35, { vol: 0.12, freq: 600, to: 2400, q: 0.7 }); },
    clack(strength = 1) {
      noise(0.06, { vol: 0.35 * strength, freq: 2600, q: 2 });
      tone(180 + Math.random() * 60, 0.07, { type: "triangle", vol: 0.1 * strength });
    },
    step(i = 0) { tone(480 + i * 40, 0.09, { type: "sine", vol: 0.08 }); },
    rocket() {
      noise(1.3, { vol: 0.22, freq: 300, to: 3500, q: 0.8 });
      tone(160, 1.2, { type: "sawtooth", vol: 0.04, to: 900 });
    },
    serpent() {
      tone(820, 1.1, { type: "triangle", vol: 0.1, to: 110 });
      tone(860, 1.1, { type: "sine", vol: 0.05, to: 120, delay: 0.05 });
      noise(0.9, { vol: 0.08, freq: 5000, to: 900, q: 3, type: "highpass" });
    },
    bounce() { tone(300, 0.15, { type: "square", vol: 0.05, to: 600 }); tone(600, 0.2, { type: "square", vol: 0.05, to: 300, delay: 0.15 }); },
    win() {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
        tone(f, 0.35, { type: "triangle", vol: 0.12, delay: i * 0.12 }));
    },
    select() { tone(880, 0.06, { type: "sine", vol: 0.06 }); },
  };
})();
