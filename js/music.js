/* Generative space-ambient soundtrack (Web Audio, no files).
   Intensity 0 = calm pads (menu), 1 = in-game groove, 2 = final-stretch tension. */
const Music = (() => {
  const BPM = 88;
  const STEP = 60 / BPM / 4;            // 16th note
  const LOOKAHEAD = 0.15;
  // Am9 – Fmaj7 – Cmaj7 – G6, two bars each
  const CHORDS = [
    { root: 45, pad: [57, 60, 64, 67, 71] },
    { root: 41, pad: [53, 57, 60, 64] },
    { root: 48, pad: [55, 59, 60, 64] },
    { root: 43, pad: [55, 59, 62, 64] },
  ];
  const ARP = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 4, 2, 3, 1];

  let ctx, out, delay, timer = null;
  let playing = false, enabled = true, intensity = 0;
  let step = 0, nextTime = 0;

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function setup() {
    ctx = Sfx.context();
    if (!ctx || out) return;
    out = ctx.createGain();
    out.gain.value = 0;
    out.connect(Sfx.musicBus());
    // spacey feedback delay
    delay = ctx.createDelay(1.5);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(out);
  }

  function voice(freq, t, dur, { type = "sine", vol = 0.05, attack = 0.01, release = null, cutoff = null, send = 0, detune = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - (release || dur * 0.5)));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = cutoff; f.Q.value = 0.7;
      o.connect(f); node = f;
    }
    node.connect(g);
    g.connect(out);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(delay); }
    o.start(t); o.stop(t + dur + 0.1);
  }

  let hatBuf = null; // built once, reused for every hi-hat
  function hat(t, vol) {
    if (!hatBuf) {
      hatBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
      const d = hatBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    }
    const src = ctx.createBufferSource(); src.buffer = hatBuf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.35);
  }

  function schedule(s, t) {
    const bar = Math.floor(s / 16);
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    const inBar = s % 16;

    // Pads: lush detuned saws every 2 bars
    if (inBar === 0 && bar % 2 === 0) {
      const dur = STEP * 32 + 0.6;
      chord.pad.forEach(n => {
        voice(mtof(n), t, dur, { type: "sawtooth", vol: 0.012, attack: 1.4, release: 1.2, cutoff: 900, detune: -7 });
        voice(mtof(n), t, dur, { type: "sawtooth", vol: 0.012, attack: 1.4, release: 1.2, cutoff: 900, detune: 7 });
      });
      voice(mtof(chord.root - 12), t, dur, { type: "sine", vol: 0.05, attack: 1, release: 1 });
    }

    // Sparkle bells, all intensities
    if (Math.random() < (intensity === 0 ? 0.06 : 0.04)) {
      const n = chord.pad[Math.floor(Math.random() * chord.pad.length)] + 24;
      voice(mtof(n), t, 1.2, { type: "sine", vol: 0.025, attack: 0.005, release: 1.1, send: 0.6 });
    }

    if (intensity >= 1) {
      // Bass pulse
      if (inBar % 4 === 0 || inBar === 6 || inBar === 14) {
        voice(mtof(chord.root), t, STEP * 2.5, { type: "triangle", vol: 0.09, attack: 0.01, release: STEP * 2, cutoff: 600 });
      }
      // Arpeggio
      const arpEvery = intensity >= 2 ? 1 : 2;
      if (inBar % arpEvery === 0) {
        const n = chord.pad[ARP[inBar] % chord.pad.length] + 12;
        voice(mtof(n), t, STEP * 1.8, { type: "triangle", vol: 0.028, attack: 0.005, release: STEP * 1.5, send: 0.45 });
      }
      // Hats on the off-beats
      if (inBar % 4 === 2) hat(t, 0.05);
      if (intensity >= 2 && inBar % 2 === 1) hat(t, 0.025);
    }
    if (intensity >= 2 && inBar % 4 === 0) kick(t);
  }

  function tick() {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      schedule(step, nextTime);
      step++;
      nextTime += STEP;
    }
  }

  function start() {
    if (!enabled) return;
    setup();
    if (!ctx || playing) return;
    playing = true;
    nextTime = ctx.currentTime + 0.1;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    timer = setInterval(tick, 25);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    clearInterval(timer);
  }

  return {
    start,
    stop,
    setIntensity(n) { intensity = n; },
    get intensity() { return intensity; },
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; enabled ? start() : stop(); return enabled; },
    /** Duck the music briefly (e.g. for the win fanfare). */
    duck(sec = 2) {
      if (!out || !playing) return;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.25, t, 0.1);
      out.gain.setTargetAtTime(1, t + sec, 0.8);
    },
  };
})();
