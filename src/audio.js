// Sleigh bells: procedural Web Audio, created lazily on the first tap of the Bells button (autoplay policy).
// Wind bed (filtered noise, louder with speed), bells jingled in a gallop rhythm while flying, a soft whoosh when
// the sleigh settles onto the rooftops, a tiny chime per new stop. No samples, no network. window.SantaAudio.
window.SantaAudio = (() => {
  const api = { enabled: false };
  let ctx = null, master = null, lp = null, wind = null, windGain = null, windFilter = null;
  let bellsPlayed = 0, chimes = 0, whooshes = 0, timer = 0, beat = 0;
  let state = { flying: false, delivering: false, speedKmh: 0, snow: false, stopKey: '' };
  let wasDelivering = false, lastStopKey = '';
  const now = () => ctx.currentTime;

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.25;
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.5;
    master.connect(lp); lp.connect(ctx.destination);
    // wind: looping pink-ish noise through a wandering bandpass
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 420; windFilter.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); wind.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lfoGain = ctx.createGain(); lfoGain.gain.value = 160; lfo.connect(lfoGain); lfoGain.connect(windFilter.frequency); lfo.start();
    return true;
  }

  // one bell: a few detuned partials with a fast decay (brass sleigh bell, not a church bell)
  function bell(t, base, vol) {
    const partials = [1, 2.71, 4.07, 5.4];
    partials.forEach((p, i) => {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = base * p * (1 + (Math.random() - 0.5) * 0.012);
      const g = ctx.createGain(); const a = vol * (i === 0 ? 1 : 0.45 / (i + 1));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.22 + 0.08 * (i === 0 ? 1 : 0));
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
    });
    bellsPlayed++;
  }
  function jingle(t, strength) { // a handful of bells of slightly different pitch within a few ms, like a strap
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) bell(t + i * 0.012 + Math.random() * 0.008, 1900 + Math.random() * 900, strength * (0.12 + Math.random() * 0.08));
  }
  function whoosh(t) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(260, t + 0.6); o.frequency.exponentialRampToValueAtTime(70, t + 1.4);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 0.6); f.frequency.linearRampToValueAtTime(200, t + 1.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.5); g.gain.linearRampToValueAtTime(0, t + 1.5);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 1.6); whooshes++;
  }
  function chime(t) { bell(t, 2637, 0.22); bell(t + 0.09, 3520, 0.16); chimes++; }

  function tick() {
    if (!ctx || !api.enabled) return;
    const t = now();
    const flying = state.flying;
    // gallop rhythm ~2.2 Hz while flying: strong-weak-medium-weak; parked: a lazy shake every ~1.6 s
    const period = flying ? 1 / 2.2 : 1.6;
    const strength = flying ? [1, 0.45, 0.7, 0.4][beat % 4] : 0.35;
    if (flying || beat % 2 === 0) jingle(t + 0.02, strength * (state.delivering ? 0.7 : 1));
    beat++;
    timer = setTimeout(tick, period * 1000 * (0.97 + Math.random() * 0.06));
  }

  function applyState() {
    if (!ctx || !api.enabled) return;
    const sp = Math.min(1, (state.speedKmh || 0) / 40000);
    const target = state.flying ? 0.25 + 0.75 * sp : 0.08;
    windGain.gain.setTargetAtTime(target * (state.delivering ? 0.5 : 1), now(), 0.6);
    windFilter.frequency.setTargetAtTime(380 + 900 * sp, now(), 0.8);
    if (state.delivering && !wasDelivering) whoosh(now());
    if (state.stopKey && state.stopKey !== lastStopKey && lastStopKey) chime(now() + 0.05);
    wasDelivering = state.delivering; lastStopKey = state.stopKey || lastStopKey;
  }

  api.setState = s => { state = Object.assign(state, s); if (ctx && api.enabled) applyState(); };
  api.toggle = () => { // must be called from a user gesture the first time
    if (!ctx && !build()) return false;
    api.enabled = !api.enabled;
    if (api.enabled) { if (ctx.state === 'suspended') ctx.resume(); wasDelivering = state.delivering; lastStopKey = state.stopKey || ''; applyState(); clearTimeout(timer); tick(); }
    else { clearTimeout(timer); windGain.gain.setTargetAtTime(0, now(), 0.3); if (ctx.state === 'running') setTimeout(() => { if (!api.enabled && ctx) ctx.suspend(); }, 800); }
    try { localStorage.setItem('santa_bells', api.enabled ? 'on' : 'off'); } catch { /* ignore */ }
    return api.enabled;
  };
  api.debug = () => ({ ctxState: ctx ? ctx.state : 'none', nodes: ctx ? ['master', 'lowpass', 'wind', 'windFilter', 'windGain'] : [], bellsPlayed, chimes, whooshes, windGain: windGain ? +windGain.gain.value.toFixed(3) : 0, enabled: api.enabled });
  document.addEventListener('visibilitychange', () => { if (!ctx || !api.enabled) return; if (document.hidden) { clearTimeout(timer); ctx.suspend(); } else { ctx.resume(); clearTimeout(timer); tick(); } });
  return api;
})();
