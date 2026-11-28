// mroczna muzyka generowana w locie przez Web Audio API (bez plikow audio i bibliotek)
// warstwy: niski dron z falujacym filtrem, wycie wiatru w korytarzach, rzadkie dzwony w skali frygijskiej
// (male sekundy daja niepokoj), trytonowy pomruk w glebszych sektorach i bicie serca przy Arch-Golemie
const Music = (() => {
  const PREF_KEY = 'mineCrawl.music';
  const ROOT = 55;   // A1
  // skala frygijska od A: A Bb C D E F G (mala sekunda A-Bb buduje groze)
  const SCALE = [1, 16 / 15, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5];

  let ctx = null;
  let master = null;
  let engine = null;
  let timer = null;
  let enabled = loadPref();
  let mood = { depth: 0, boss: false, awake: false, title: true };

  function loadPref() {
    try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch (e) { return true; }
  }
  function savePref() {
    try { localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch (e) { /* bez zapisu */ }
  }

  // pogloss jaskini: losowy szum gasnacy wykladniczo przez ok. 4 s
  function makeReverb(ac) {
    const len = Math.floor(ac.sampleRate * 4);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ac.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function noiseBuffer(ac, seconds) {
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {   // brazowy szum: ciemniejszy niz bialy
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  function lfo(ac, rate, depth, target, t0) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start(t0);
    return o;
  }

  // silnik muzyki: dziala zarowno na zywo (AudioContext), jak i offline (OfflineAudioContext do podgladu)
  function createEngine(ac, out) {
    const t0 = ac.currentTime;
    const dry = ac.createGain();
    const wet = ac.createGain();
    const reverb = makeReverb(ac);
    dry.gain.value = 0.8;
    wet.gain.value = 0.9;
    dry.connect(out);
    wet.connect(reverb).connect(out);

    // dron: dwie rozstrojone pily i kwinta, przez niski filtr z wolnym oddechem
    const droneFilter = ac.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    droneFilter.Q.value = 6;
    const droneGain = ac.createGain();
    droneGain.gain.value = 0.0;
    droneFilter.connect(droneGain);
    droneGain.connect(dry);
    droneGain.connect(wet);
    [[ROOT, 'sawtooth', -6], [ROOT, 'sawtooth', 7], [ROOT * 1.5, 'triangle', 0], [ROOT / 2, 'sine', 0]].forEach(([f, type, cents]) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(droneFilter);
      o.start(t0);
    });
    lfo(ac, 0.045, 140, droneFilter.frequency, t0);

    // trytonowy pomruk (Eb) narasta z glebokoscia
    const tritoneGain = ac.createGain();
    tritoneGain.gain.value = 0;
    const tri = ac.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = ROOT * Math.SQRT2;
    const triFilter = ac.createBiquadFilter();
    triFilter.type = 'lowpass';
    triFilter.frequency.value = 300;
    tri.connect(triFilter).connect(tritoneGain);
    tritoneGain.connect(wet);
    tritoneGain.connect(dry);
    tri.start(t0);
    lfo(ac, 0.11, 0.6, tri.detune, t0);

    // wiatr w korytarzach: szum przez waski filtr pasmowy, ktory powoli "zawodzi"
    const wind = ac.createBufferSource();
    wind.buffer = noiseBuffer(ac, 6);
    wind.loop = true;
    const windFilter = ac.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 480;
    windFilter.Q.value = 9;
    const windGain = ac.createGain();
    windGain.gain.value = 0.0;
    wind.connect(windFilter).connect(windGain);
    windGain.connect(wet);
    lfo(ac, 0.06, 260, windFilter.frequency, t0);
    lfo(ac, 0.13, 0.015, windGain.gain, t0);
    wind.start(t0);

    let nextBell = t0 + 2.5;
    let nextBeat = t0 + 1;
    let state = { depth: 0, boss: false, awake: false, title: true };

    // dzwon FM: metaliczny, dlugo wybrzmiewajacy ton gleboko w poglosie
    function bell(t, freq, vol) {
      const car = ac.createOscillator();
      const mod = ac.createOscillator();
      const modGain = ac.createGain();
      const env = ac.createGain();
      car.frequency.value = freq;
      mod.frequency.value = freq * 2.76;
      modGain.gain.setValueAtTime(freq * 1.8, t);
      modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 3);
      mod.connect(modGain).connect(car.frequency);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
      car.connect(env);
      env.connect(wet);
      const d = ac.createGain();
      d.gain.value = 0.25;
      env.connect(d).connect(dry);
      car.start(t); mod.start(t);
      car.stop(t + 6); mod.stop(t + 6);
    }

    // bicie serca: dwa gluche uderzenia ze spadajaca wysokoscia
    function thump(t, vol) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(62, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.22);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(dry);
      o.start(t);
      o.stop(t + 0.4);
    }

    // planuje zdarzenia (dzwony, serce) w oknie czasu [from, to]
    function schedule(from, to) {
      while (nextBell < to) {
        const t = Math.max(nextBell, from);
        const deg = Math.floor(Math.random() * SCALE.length);
        const oct = Math.random() < 0.35 ? 8 : 4;
        const vol = state.title ? 0.05 : 0.035 + state.depth * 0.015;
        bell(t, ROOT * oct * SCALE[deg], vol);
        // glebiej czasem druga nuta o mala sekunde wyzej: zgrzyt
        if (Math.random() < 0.15 + state.depth * 0.35) bell(t + 0.04, ROOT * oct * SCALE[deg] * (16 / 15), vol * 0.7);
        const gap = state.awake ? 2.2 : (state.title ? 4.5 : 7 - state.depth * 3);
        nextBell = t + gap * (0.6 + Math.random() * 0.8);
      }
      if (state.boss) {
        const period = state.awake ? 0.72 : 1.35;
        while (nextBeat < to) {
          const t = Math.max(nextBeat, from);
          const vol = state.awake ? 0.55 : 0.32;
          thump(t, vol);
          thump(t + 0.24, vol * 0.7);
          nextBeat = t + period;
        }
      } else {
        nextBeat = to;
      }
    }

    // nastroj: glebokosc sektora, boss, przebudzenie, ekran tytulowy
    function setMood(m, when) {
      const t = when !== undefined ? when : ac.currentTime;
      state = Object.assign({}, state, m);
      const d = state.title ? 0.15 : state.depth;
      droneGain.gain.setTargetAtTime(state.title ? 0.05 : 0.06 + d * 0.035, t, 1.5);
      droneFilter.frequency.setTargetAtTime(state.awake ? 420 : 240 - d * 90, t, 2);
      tritoneGain.gain.setTargetAtTime(state.boss ? 0.07 : d * 0.045, t, 2);
      windGain.gain.setTargetAtTime(0.03 + d * 0.03, t, 2);
    }

    // akcent smierci: opadajacy, przesterowany jek
    function sting(t) {
      const o = ac.createOscillator();
      const f = ac.createBiquadFilter();
      const g = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(ROOT * 2, t);
      o.frequency.exponentialRampToValueAtTime(ROOT / 2, t + 2.5);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 2.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      o.connect(f).connect(g);
      g.connect(dry);
      g.connect(wet);
      o.start(t);
      o.stop(t + 3.1);
    }

    setMood(state, t0);
    return { schedule, setMood, sting };
  }

  // uruchomienie po pierwszej interakcji gracza (przegladarki blokuja dzwiek bez gestu)
  function start() {
    if (ctx || !enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    engine = createEngine(ctx, master);
    engine.setMood(mood);
    master.gain.setTargetAtTime(0.6, ctx.currentTime, 1.5);   // powolne wejscie z ciszy
    timer = setInterval(() => engine.schedule(ctx.currentTime, ctx.currentTime + 1.5), 250);
  }

  function setMood(m) {
    mood = Object.assign({}, mood, m);
    if (engine) engine.setMood(mood);
  }

  function sting() {
    if (engine && enabled) engine.sting(ctx.currentTime + 0.05);
  }

  function toggle() {
    enabled = !enabled;
    savePref();
    if (enabled && !ctx) start();
    if (ctx) {
      if (enabled) ctx.resume();
      master.gain.setTargetAtTime(enabled ? 0.6 : 0, ctx.currentTime, 0.3);
    }
    updateButtons();
    return enabled;
  }

  function updateButtons() {
    document.querySelectorAll('.music-btn').forEach(b => {
      b.classList.toggle('off', !enabled);
      b.title = enabled ? 'Wycisz muzykę' : 'Włącz muzykę';
    });
  }

  // pierwszy gest gracza odpala muzyke
  const kick = () => {
    start();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
  document.addEventListener('DOMContentLoaded', updateButtons);
  updateButtons();

  return { setMood, sting, toggle, isOn: () => enabled, createEngine };
})();

window.Music = Music;
