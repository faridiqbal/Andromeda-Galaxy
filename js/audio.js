/* Synthesized sound effects via Web Audio (no audio files needed).
   Routing: sfx bus + music bus -> master -> compressor -> speakers. */
const Sfx = (() => {
  let ctx = null, master, sfxBus, musicBus;
  let sfxMuted = false;

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ctx.createGain(); master.gain.value = 0.9;
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1;
      musicBus = ctx.createGain(); musicBus.gain.value = 0.55;
      sfxBus.connect(master); musicBus.connect(master);
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = "sine", vol = 0.12, to = null, delay = 0, attack = 0.015 } = {}) {
    const c = ac(); if (!c || sfxMuted) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  let noiseBuf = null;
  function noise(dur, { vol = 0.2, freq = 1800, to = null, q = 1, delay = 0, type = "bandpass", attack = 0.005 } = {}) {
    const c = ac(); if (!c || sfxMuted) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.05);
  }

  return {
    unlock: ac,
    context: () => ac(),
    musicBus: () => (ac(), musicBus),
    get muted() { return sfxMuted; },
    toggle() { sfxMuted = !sfxMuted; return sfxMuted; },

    // UI
    click() { tone(1200, 0.05, { vol: 0.05 }); tone(1800, 0.04, { vol: 0.03, delay: 0.02 }); },
    select() { tone(880, 0.07, { vol: 0.07 }); tone(1320, 0.09, { vol: 0.05, delay: 0.05 }); },
    turn() { tone(659, 0.25, { type: "triangle", vol: 0.07 }); tone(988, 0.35, { type: "triangle", vol: 0.06, delay: 0.1 }); },
    zoom(dir = 1) { noise(0.45, { vol: 0.07, freq: dir > 0 ? 400 : 2400, to: dir > 0 ? 2400 : 400, q: 0.8, attack: 0.15 }); },
    error() { tone(160, 0.15, { type: "square", vol: 0.05 }); },

    // dice & movement
    whoosh() { noise(0.4, { vol: 0.14, freq: 500, to: 2600, q: 0.7, attack: 0.08 }); },
    clack(strength = 1) {
      noise(0.06, { vol: 0.35 * strength, freq: 2600, q: 2 });
      tone(180 + Math.random() * 60, 0.07, { type: "triangle", vol: 0.1 * strength });
    },
    step(i = 0) {
      const f = 392 * Math.pow(2, ([0, 2, 4, 7, 9, 12, 14][i % 7]) / 12);
      tone(f, 0.12, { type: "triangle", vol: 0.08 });
      noise(0.05, { vol: 0.06, freq: 900, q: 1, type: "lowpass" });
    },
    bounce() { tone(300, 0.15, { type: "square", vol: 0.05, to: 600 }); tone(600, 0.2, { type: "square", vol: 0.05, to: 300, delay: 0.15 }); },

    // board elements
    rocket() {
      noise(1.4, { vol: 0.25, freq: 300, to: 3500, q: 0.8, attack: 0.1 });
      tone(110, 1.3, { type: "sawtooth", vol: 0.05, to: 880 });
      noise(0.5, { vol: 0.2, freq: 120, q: 0.5, type: "lowpass" });
    },
    serpent() {
      tone(820, 1.1, { type: "triangle", vol: 0.1, to: 110 });
      tone(860, 1.1, { type: "sine", vol: 0.05, to: 120, delay: 0.05 });
      noise(0.9, { vol: 0.08, freq: 5000, to: 900, q: 3, type: "highpass" });
    },
    ufo() { for (let i = 0; i < 6; i++) tone(600 + (i % 2) * 250, 0.3, { type: "sine", vol: 0.07, to: 900 + (i % 2) * 300, delay: i * 0.28 }); },
    wormhole() { tone(120, 0.7, { type: "sine", vol: 0.12, to: 1800 }); tone(1800, 0.8, { type: "triangle", vol: 0.06, to: 200, delay: 0.7 }); },
    comet() { noise(1.3, { vol: 0.12, freq: 6000, to: 2000, q: 1, type: "highpass" }); [1318, 1568, 2093].forEach((f, i) => tone(f, 0.25, { vol: 0.05, delay: 0.2 + i * 0.25 })); },
    blackhole() { tone(260, 1.4, { type: "sawtooth", vol: 0.06, to: 35 }); noise(1.4, { vol: 0.15, freq: 900, to: 60, q: 0.5, type: "lowpass" }); },
    asteroid() { noise(0.9, { vol: 0.5, freq: 900, to: 50, q: 0.4, type: "lowpass" }); tone(110, 0.6, { type: "square", vol: 0.08, to: 35 }); },
    flare() { noise(1.3, { vol: 0.2, freq: 3000, to: 400, q: 0.6 }); tone(500, 1.2, { type: "sawtooth", vol: 0.04, to: 120 }); },
    bump() { noise(0.25, { vol: 0.45, freq: 500, q: 0.6, type: "lowpass" }); tone(140, 0.25, { type: "square", vol: 0.08, to: 60 }); },
    pop() { tone(500, 0.12, { vol: 0.08, to: 1100 }); },
    event() { [196, 247, 294, 392].forEach((f, i) => tone(f, 0.9, { type: "sine", vol: 0.08, delay: i * 0.12 })); noise(1.2, { vol: 0.08, freq: 200, to: 3000, q: 1, attack: 0.4 }); },
    afterburner() { noise(0.8, { vol: 0.25, freq: 200, to: 2000, q: 0.7 }); [523, 659, 784].forEach((f, i) => tone(f, 0.2, { type: "square", vol: 0.04, delay: i * 0.08 })); },
    win() {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
        tone(f, 0.35, { type: "triangle", vol: 0.12, delay: i * 0.12 }));
      noise(2, { vol: 0.1, freq: 8000, to: 3000, q: 0.5, type: "highpass", delay: 0.8 });
    },
  };
})();
