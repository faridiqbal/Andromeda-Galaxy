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
    /** Warning / fanfare sting that announces an effect before it plays. */
    alert(kind = "up") {
      if (kind === "up") {
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: "triangle", vol: 0.09, delay: i * 0.09 }));
        noise(0.8, { vol: 0.08, freq: 600, to: 4000, q: 0.8, attack: 0.3 });
      } else if (kind === "down") {
        [0, 0.28].forEach(d => { tone(880, 0.22, { type: "square", vol: 0.05, to: 440, delay: d }); });
        tone(220, 0.8, { type: "sawtooth", vol: 0.04, to: 110, delay: 0.1 });
      } else if (kind === "bounce") {
        tone(392, 0.25, { type: "triangle", vol: 0.09, to: 784 });
        tone(784, 0.35, { type: "triangle", vol: 0.08, to: 392, delay: 0.3 });
      } else { // cosmic event
        [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 1.1, { type: "sine", vol: 0.07, delay: i * 0.1 }));
        tone(131, 1.5, { type: "triangle", vol: 0.08 });
      }
    },

    // dice & movement
    whoosh(power = 0.5) { noise(0.3 + power * 0.3, { vol: 0.08 + power * 0.14, freq: 400, to: 1800 + power * 2400, q: 0.7, attack: 0.08 }); },
    charge(p) { tone(260 + p * 900, 0.07, { type: "square", vol: 0.025 + p * 0.03 }); },
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
    zap(power = 1) {
      noise(0.5 * power, { vol: 0.45 * power, freq: 4000, to: 800, q: 0.6, type: "highpass" });
      for (let i = 0; i < 5; i++) noise(0.05, { vol: 0.3 * power, freq: 2000 + Math.random() * 3000, q: 2, delay: i * 0.06 + Math.random() * 0.03 });
      tone(1400, 0.35 * power, { type: "square", vol: 0.05 * power, to: 90 });
      noise(1.2 * power, { vol: 0.25 * power, freq: 160, to: 50, q: 0.4, type: "lowpass", delay: 0.12 });
    },
    ufo() { for (let i = 0; i < 6; i++) tone(600 + (i % 2) * 250, 0.3, { type: "sine", vol: 0.07, to: 900 + (i % 2) * 300, delay: i * 0.28 }); },
    wormhole() { tone(120, 0.7, { type: "sine", vol: 0.12, to: 1800 }); tone(1800, 0.8, { type: "triangle", vol: 0.06, to: 200, delay: 0.7 }); },
    comet() { noise(1.3, { vol: 0.12, freq: 6000, to: 2000, q: 1, type: "highpass" }); [1318, 1568, 2093].forEach((f, i) => tone(f, 0.25, { vol: 0.05, delay: 0.2 + i * 0.25 })); },
    blackhole() { tone(260, 1.4, { type: "sawtooth", vol: 0.06, to: 35 }); noise(1.4, { vol: 0.15, freq: 900, to: 60, q: 0.5, type: "lowpass" }); },
    asteroid(power = 1) {
      noise(1.1 * power, { vol: 0.3 * power, freq: 500, to: 2500, q: 0.5, attack: 0.08 });   // roaring flames
      noise(0.9 * power, { vol: 0.5 * power, freq: 900, to: 50, q: 0.4, type: "lowpass", delay: 0.05 }); // impact boom
      tone(110, 0.6 * power, { type: "square", vol: 0.07 * power, to: 35 });
      for (let i = 0; i < 6; i++) noise(0.04, { vol: 0.12 * power, freq: 3000 + Math.random() * 3000, q: 3, delay: 0.2 + Math.random() * 0.8 }); // crackle
    },
    flare() { noise(1.3, { vol: 0.2, freq: 3000, to: 400, q: 0.6 }); tone(500, 1.2, { type: "sawtooth", vol: 0.04, to: 120 }); },
    bump() { noise(0.25, { vol: 0.45, freq: 500, q: 0.6, type: "lowpass" }); tone(140, 0.25, { type: "square", vol: 0.08, to: 60 }); },
    pop() { tone(500, 0.12, { vol: 0.08, to: 1100 }); },
    shift() {
      noise(1.6, { vol: 0.14, freq: 300, to: 6000, q: 1.2, attack: 0.5 });
      [392, 494, 587, 740, 880, 1175].forEach((f, i) => tone(f, 0.7, { type: "sine", vol: 0.06, delay: i * 0.12 }));
      [1175, 880, 740, 587].forEach((f, i) => tone(f, 0.6, { type: "triangle", vol: 0.05, delay: 1 + i * 0.1 }));
    },
    event() { [196, 247, 294, 392].forEach((f, i) => tone(f, 0.9, { type: "sine", vol: 0.08, delay: i * 0.12 })); noise(1.2, { vol: 0.08, freq: 200, to: 3000, q: 1, attack: 0.4 }); },
    afterburner() { noise(0.8, { vol: 0.25, freq: 200, to: 2000, q: 0.7 }); [523, 659, 784].forEach((f, i) => tone(f, 0.2, { type: "square", vol: 0.04, delay: i * 0.08 })); },
    win() {
      [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
        tone(f, 0.35, { type: "triangle", vol: 0.12, delay: i * 0.12 }));
      noise(2, { vol: 0.1, freq: 8000, to: 3000, q: 0.5, type: "highpass", delay: 0.8 });
    },
  };
})();
