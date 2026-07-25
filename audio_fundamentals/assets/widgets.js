/* Audio crash course — interactive widgets. Plain JS / Canvas / Web Audio. No deps.
 *   1. wave-lab    additive synthesis: harmonics -> timbre, waveform + spectrum, audible
 *   2. alias-lab   sampling above Nyquist folds frequency back down; sweep to hear it
 *   3. stft-lab    window length trades time resolution against frequency resolution
 *   4. phase-lab   same magnitude spectrum, different sound; and why waveform MSE lies
 *   5. vowel-lab   source-filter: buzz + two formants = a vowel
 */

/* ---------- theme toggle ---------- */
(function () {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const saved = localStorage.getItem('vb-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  const setLabel = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    toggle.textContent = dark ? '☀' : '☾';
  };
  setLabel();
  toggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('vb-theme', 'light'); }
    else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('vb-theme', 'dark'); }
    setLabel();
  });
})();

/* ---------- canvas helpers ---------- */
function devicePx(canvas, cssW, cssH) {
  canvas.width = cssW * 2; canvas.height = cssH * 2;
  const ctx = canvas.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); return ctx;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function canvasXY(canvas, e, W, H) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  const cy = (e.touches ? e.touches[0].clientY : e.clientY);
  return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H];
}

/* ---------- shared audio engine ---------- */
const AudioLab = (function () {
  let ctx = null;
  let current = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* Play a Float32Array. `sr` is the rate the data was synthesized at;
     the browser resamples if it differs from the output device rate. */
  function play(data, sr, onEnd) {
    const c = getCtx();
    if (!c) return null;
    stop();
    const buf = c.createBuffer(1, data.length, sr || c.sampleRate);
    buf.copyToChannel(data, 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = 0.85;
    src.connect(gain).connect(c.destination);
    src.onended = () => { if (current === src) current = null; if (onEnd) onEnd(); };
    src.start();
    current = src;
    return src;
  }

  function stop() {
    if (current) { try { current.stop(); } catch (e) { /* already stopped */ } current = null; }
  }

  function rate() { const c = getCtx(); return c ? c.sampleRate : 44100; }

  /* Fade in/out to avoid clicks at buffer boundaries. */
  function envelope(data, sr, ms) {
    const n = Math.min(Math.floor((ms || 12) * sr / 1000), Math.floor(data.length / 2));
    for (let i = 0; i < n; i++) {
      const g = i / n;
      data[i] *= g;
      data[data.length - 1 - i] *= g;
    }
    return data;
  }

  function normalize(data, peak) {
    let m = 0;
    for (let i = 0; i < data.length; i++) m = Math.max(m, Math.abs(data[i]));
    if (m < 1e-9) return data;
    const g = (peak || 0.9) / m;
    for (let i = 0; i < data.length; i++) data[i] *= g;
    return data;
  }

  return { play, stop, rate, envelope, normalize };
})();

/* ---------- iterative radix-2 FFT (in place, complex) ---------- */
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/* =====================================================================
 * Widget 1: wave-lab — additive synthesis, timbre from harmonics
 * ===================================================================== */
(function waveLab() {
  const host = document.getElementById('wave-lab');
  if (!host) return;

  const NH = 8;
  const PRESETS = {
    sine:     [1, 0, 0, 0, 0, 0, 0, 0],
    saw:      [1, 0.5, 0.333, 0.25, 0.2, 0.167, 0.143, 0.125],
    square:   [1, 0, 0.333, 0, 0.2, 0, 0.143, 0],
    clarinet: [1, 0.05, 0.7, 0.06, 0.45, 0.08, 0.28, 0.05],
    vocalish: [0.6, 1, 0.85, 0.4, 0.55, 0.3, 0.15, 0.1],
  };
  let amps = PRESETS.saw.slice();

  let sliderHTML = '';
  for (let i = 0; i < NH; i++) {
    sliderHTML += `<div class="hrow">
        <span class="hlab">${i === 0 ? 'f₀' : (i + 1) + 'f₀'}</span>
        <input type="range" min="0" max="100" value="${Math.round(amps[i] * 100)}" data-h="${i}"/>
        <span class="hval" data-hv="${i}">${amps[i].toFixed(2)}</span>
      </div>`;
  }

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="left">
        <div class="canvas-pair">
          <div>
            <canvas id="wlWave"></canvas>
            <p class="lbl">waveform — three periods</p>
          </div>
          <div>
            <canvas id="wlSpec"></canvas>
            <p class="lbl">spectrum — harmonic amplitudes</p>
          </div>
        </div>
        <div class="toggle-row">
          <button class="btn" id="wlPlay">▶ play (220 Hz)</button>
          <button class="btn" data-p="sine">sine</button>
          <button class="btn active" data-p="saw">sawtooth</button>
          <button class="btn" data-p="square">square</button>
          <button class="btn" data-p="clarinet">clarinet</button>
          <button class="btn" data-p="vocalish">vowel-ish</button>
        </div>
      </div>
      <div class="controls">${sliderHTML}
        <div class="readout" id="wlReadout"></div>
      </div>
    </div>`);

  const WW = 300, WH = 170, SW = 300, SH = 170;
  const waveCv = host.querySelector('#wlWave');
  const specCv = host.querySelector('#wlSpec');
  const wctx = devicePx(waveCv, WW, WH);
  const sctx = devicePx(specCv, SW, SH);
  const readout = host.querySelector('#wlReadout');

  function sample(t) {
    let v = 0;
    for (let i = 0; i < NH; i++) v += amps[i] * Math.sin(2 * Math.PI * (i + 1) * t);
    return v;
  }

  function draw() {
    const accent = cssVar('--accent') || '#c2410c';
    const rule = cssVar('--rule') || '#ddd';
    const mute = cssVar('--fg-mute') || '#888';

    /* --- waveform --- */
    wctx.clearRect(0, 0, WW, WH);
    wctx.strokeStyle = rule; wctx.lineWidth = 1;
    wctx.beginPath(); wctx.moveTo(0, WH / 2); wctx.lineTo(WW, WH / 2); wctx.stroke();

    let peak = 0;
    for (let i = 0; i < NH; i++) peak += amps[i];
    peak = Math.max(peak, 0.001);

    wctx.strokeStyle = accent; wctx.lineWidth = 2;
    wctx.beginPath();
    for (let px = 0; px <= WW; px++) {
      const t = (px / WW) * 3;
      const y = WH / 2 - (sample(t) / peak) * (WH / 2 - 12);
      if (px === 0) wctx.moveTo(px, y); else wctx.lineTo(px, y);
    }
    wctx.stroke();

    /* --- spectrum --- */
    sctx.clearRect(0, 0, SW, SH);
    const base = SH - 22;
    sctx.strokeStyle = rule; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(0, base); sctx.lineTo(SW, base); sctx.stroke();
    const bw = SW / (NH + 1);
    for (let i = 0; i < NH; i++) {
      const h = amps[i] * (base - 16);
      const x = (i + 0.5) * bw + bw * 0.25;
      sctx.fillStyle = accent;
      sctx.globalAlpha = 0.35 + 0.65 * amps[i];
      sctx.fillRect(x, base - h, bw * 0.5, h);
      sctx.globalAlpha = 1;
      sctx.fillStyle = mute;
      sctx.font = '10px ui-monospace, monospace';
      sctx.textAlign = 'center';
      sctx.fillText((i + 1) === 1 ? 'f₀' : (i + 1) + 'f₀', x + bw * 0.25, base + 14);
    }

    /* --- readout --- */
    let energy = 0, weighted = 0;
    for (let i = 0; i < NH; i++) { energy += amps[i] * amps[i]; weighted += amps[i] * amps[i] * (i + 1); }
    const centroid = energy > 1e-9 ? (weighted / energy) * 220 : 0;
    const odd = amps.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b * b, 0);
    readout.innerHTML =
      `spectral centroid <strong>${centroid.toFixed(0)} Hz</strong><br/>` +
      `odd-harmonic share <strong>${energy > 1e-9 ? (100 * odd / energy).toFixed(0) : 0}%</strong><br/>` +
      `<span class="hint">centroid tracks "brightness"; a hollow, clarinet-like sound is odd-harmonic heavy</span>`;
  }

  function synth() {
    const sr = AudioLab.rate();
    const dur = 1.6, f0 = 220;
    const data = new Float32Array(Math.floor(sr * dur));
    for (let n = 0; n < data.length; n++) {
      const t = n / sr;
      let v = 0;
      for (let i = 0; i < NH; i++) {
        if (amps[i] < 1e-4) continue;
        v += amps[i] * Math.sin(2 * Math.PI * f0 * (i + 1) * t);
      }
      data[n] = v;
    }
    AudioLab.normalize(data, 0.8);
    AudioLab.envelope(data, sr, 40);
    return { data, sr };
  }

  host.querySelectorAll('input[type=range]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.h;
      amps[i] = inp.value / 100;
      host.querySelector(`[data-hv="${i}"]`).textContent = amps[i].toFixed(2);
      host.querySelectorAll('[data-p]').forEach(b => b.classList.remove('active'));
      draw();
    });
  });

  host.querySelectorAll('[data-p]').forEach(btn => {
    btn.addEventListener('click', () => {
      amps = PRESETS[btn.dataset.p].slice();
      host.querySelectorAll('[data-p]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      host.querySelectorAll('input[type=range]').forEach(inp => {
        const i = +inp.dataset.h;
        inp.value = Math.round(amps[i] * 100);
        host.querySelector(`[data-hv="${i}"]`).textContent = amps[i].toFixed(2);
      });
      draw();
      const { data, sr } = synth();
      AudioLab.play(data, sr);
    });
  });

  host.querySelector('#wlPlay').addEventListener('click', () => {
    const { data, sr } = synth();
    AudioLab.play(data, sr);
  });

  draw();
})();

/* =====================================================================
 * Widget 2: alias-lab — frequencies above Nyquist fold back down
 * ===================================================================== */
(function aliasLab() {
  const host = document.getElementById('alias-lab');
  if (!host) return;

  const FS = 4000;              /* the (deliberately low) sample rate */
  const NYQ = FS / 2;           /* 2000 Hz */
  let fTrue = 700;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="left">
        <canvas id="alCanvas"></canvas>
        <div class="slider-row">
          <label>true frequency <strong id="alF">700 Hz</strong></label>
          <input type="range" id="alSlider" min="100" max="7000" value="700" step="10"/>
        </div>
        <div class="toggle-row">
          <button class="btn" id="alPlayA">▶ hear what you get</button>
          <button class="btn" id="alPlayT">▶ hear the truth</button>
          <button class="btn" id="alSweep">▶ sweep 100 → 7000 Hz</button>
        </div>
      </div>
      <div class="controls">
        <div class="readout" id="alReadout"></div>
      </div>
    </div>`);

  const W = 460, H = 210;
  const cv = host.querySelector('#alCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#alSlider');
  const fLab = host.querySelector('#alF');
  const readout = host.querySelector('#alReadout');
  let sweeping = false;

  function alias(f) {
    let r = f % FS;
    if (r > NYQ) r = FS - r;
    return r;
  }

  function draw() {
    const accent = cssVar('--accent') || '#c2410c';
    const rule = cssVar('--rule') || '#ddd';
    const mute = cssVar('--fg-mute') || '#888';
    const fa = alias(fTrue);
    const span = 0.006;         /* 6 ms shown */

    ctx.clearRect(0, 0, W, H);
    const mid = H / 2 - 6, amp = H / 2 - 34;

    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

    /* true continuous wave, faint */
    ctx.strokeStyle = mute; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
      const t = (px / W) * span;
      const y = mid - Math.sin(2 * Math.PI * fTrue * t) * amp;
      if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* what the samples actually reconstruct */
    ctx.strokeStyle = accent; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let px = 0; px <= W; px++) {
      const t = (px / W) * span;
      const y = mid - Math.sin(2 * Math.PI * fa * t) * amp;
      if (px === 0) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }
    ctx.stroke();

    /* the sample instants */
    const nS = Math.floor(span * FS);
    ctx.fillStyle = accent;
    for (let k = 0; k <= nS; k++) {
      const t = k / FS;
      const px = (t / span) * W;
      const y = mid - Math.sin(2 * Math.PI * fTrue * t) * amp;
      ctx.beginPath(); ctx.moveTo(px, mid); ctx.lineTo(px, y);
      ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.globalAlpha = 0.45; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(px, y, 3.2, 0, 2 * Math.PI); ctx.fill();
    }

    ctx.fillStyle = mute;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('grey = true · dots = samples · orange = what you get', 6, H - 6);

    const aliased = fTrue > NYQ;
    readout.innerHTML =
      `sample rate <strong>${FS} Hz</strong><br/>` +
      `Nyquist limit <strong>${NYQ} Hz</strong><br/>` +
      `true tone <strong>${fTrue.toFixed(0)} Hz</strong><br/>` +
      `you hear <strong style="color:${aliased ? 'var(--accent)' : 'inherit'}">${fa.toFixed(0)} Hz</strong><br/>` +
      `<span class="verdict ${aliased ? 'bad' : 'ok'}">${aliased ? '✗ aliased — information lost forever' : '✓ below Nyquist — perfectly recoverable'}</span>` +
      `<span class="hint">Above ${NYQ} Hz the orange curve stops following the grey one. Push past ${FS} Hz and it folds a second time.</span>`;
  }

  function synth(freqFn, dur) {
    const sr = AudioLab.rate();
    const n = Math.floor(sr * dur);
    const data = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = freqFn(i / sr, dur);
      phase += 2 * Math.PI * f / sr;
      data[i] = 0.7 * Math.sin(phase);
    }
    AudioLab.envelope(data, sr, 25);
    return { data, sr };
  }

  slider.addEventListener('input', () => {
    if (sweeping) return;
    fTrue = +slider.value;
    fLab.textContent = fTrue + ' Hz';
    draw();
  });

  host.querySelector('#alPlayA').addEventListener('click', () => {
    const { data, sr } = synth(() => alias(fTrue), 1.3);
    AudioLab.play(data, sr);
  });
  host.querySelector('#alPlayT').addEventListener('click', () => {
    const { data, sr } = synth(() => fTrue, 1.3);
    AudioLab.play(data, sr);
  });

  host.querySelector('#alSweep').addEventListener('click', () => {
    const DUR = 6.0;
    const f0 = 100, f1 = 7000;
    const { data, sr } = synth((t) => alias(f0 + (f1 - f0) * (t / DUR)), DUR);
    sweeping = true;
    const start = performance.now();
    AudioLab.play(data, sr, () => { sweeping = false; });
    (function tick() {
      if (!sweeping) { fTrue = +slider.value; draw(); return; }
      const el = (performance.now() - start) / 1000;
      if (el > DUR) { sweeping = false; return; }
      fTrue = f0 + (f1 - f0) * (el / DUR);
      slider.value = Math.round(fTrue);
      fLab.textContent = fTrue.toFixed(0) + ' Hz';
      draw();
      requestAnimationFrame(tick);
    })();
  });

  draw();
})();

/* =====================================================================
 * Widget 3: stft-lab — the time/frequency resolution tradeoff
 * ===================================================================== */
(function stftLab() {
  const host = document.getElementById('stft-lab');
  if (!host) return;

  const SR = 8000;
  const DUR = 2.4;
  const N_SAMP = Math.floor(SR * DUR);
  const WINDOWS = [32, 64, 128, 256, 512, 1024];
  let wIdx = 3;

  /* Build the test signal: a rising chirp, two tones a semitone apart, three clicks. */
  const sig = new Float32Array(N_SAMP);
  (function build() {
    /* chirp: 300 -> 1600 Hz across the whole clip */
    let ph = 0;
    for (let i = 0; i < N_SAMP; i++) {
      const t = i / SR;
      const f = 300 + (1600 - 300) * (t / DUR);
      ph += 2 * Math.PI * f / SR;
      sig[i] += 0.5 * Math.sin(ph);
    }
    /* two steady tones a semitone apart (2200 and 2331 Hz), middle of the clip */
    for (let i = 0; i < N_SAMP; i++) {
      const t = i / SR;
      if (t < 0.4 || t > 2.0) continue;
      const e = Math.min(1, (t - 0.4) / 0.15) * Math.min(1, (2.0 - t) / 0.15);
      sig[i] += 0.34 * e * (Math.sin(2 * Math.PI * 2200 * t) + Math.sin(2 * Math.PI * 2331 * t));
    }
    /* three sharp clicks */
    [0.55, 1.20, 1.85].forEach(tc => {
      const c = Math.floor(tc * SR);
      for (let k = 0; k < 240; k++) {
        if (c + k >= N_SAMP) break;
        sig[c + k] += 0.95 * Math.exp(-k / 30) * (Math.random() * 2 - 1);
      }
    });
    AudioLab.normalize(sig, 0.85);
  })();

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="left">
        <canvas id="stCanvas"></canvas>
        <div class="slider-row">
          <label>window length <strong id="stW">256 samples</strong></label>
          <input type="range" id="stSlider" min="0" max="5" value="3" step="1"/>
        </div>
        <div class="toggle-row">
          <button class="btn" id="stPlay">▶ hear the test signal</button>
        </div>
      </div>
      <div class="controls">
        <div class="readout" id="stReadout"></div>
      </div>
    </div>`);

  const W = 460, H = 250;
  const cv = host.querySelector('#stCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#stSlider');
  const wLab = host.querySelector('#stW');
  const readout = host.querySelector('#stReadout');

  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');

  const COLS = 260;

  function computeSpec(N) {
    const nBins = N / 2;
    const hop = Math.max(1, Math.floor((N_SAMP - N) / (COLS - 1)));
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); /* Hann */

    const mag = new Float32Array(COLS * nBins);
    const re = new Float64Array(N), im = new Float64Array(N);
    let maxV = 1e-9;
    for (let c = 0; c < COLS; c++) {
      const start = c * hop;
      for (let i = 0; i < N; i++) {
        const s = start + i;
        re[i] = (s < N_SAMP ? sig[s] : 0) * win[i];
        im[i] = 0;
      }
      fft(re, im, false);
      for (let k = 0; k < nBins; k++) {
        const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        mag[c * nBins + k] = m;
        if (m > maxV) maxV = m;
      }
    }
    return { mag, nBins, maxV, hop };
  }

  function draw() {
    const N = WINDOWS[wIdx];
    const { mag, nBins, maxV } = computeSpec(N);

    /* Render into an offscreen image, then scale up. */
    off.width = COLS; off.height = nBins;
    const img = offCtx.createImageData(COLS, nBins);
    const accent = cssVar('--accent') || '#c2410c';
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(accent.replace('#', '#'));
    const ar = m ? parseInt(m[1], 16) : 194, ag = m ? parseInt(m[2], 16) : 65, ab = m ? parseInt(m[3], 16) : 12;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const br = dark ? 14 : 255, bg = dark ? 15 : 253, bb = dark ? 18 : 250;

    for (let c = 0; c < COLS; c++) {
      for (let k = 0; k < nBins; k++) {
        const v = mag[c * nBins + k] / maxV;
        const db = 20 * Math.log10(Math.max(v, 1e-6));
        let e = (db + 70) / 70;                 /* 70 dB dynamic range */
        e = Math.max(0, Math.min(1, e));
        e = Math.pow(e, 1.35);
        const row = nBins - 1 - k;              /* low frequency at the bottom */
        const o = (row * COLS + c) * 4;
        img.data[o] = br + (ar - br) * e;
        img.data[o + 1] = bg + (ag - bg) * e;
        img.data[o + 2] = bb + (ab - bb) * e;
        img.data[o + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);

    ctx.clearRect(0, 0, W, H);
    const PL = 42, PB = 24, PT = 6, PR = 6;
    const pw = W - PL - PR, ph = H - PT - PB;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, PL, PT, pw, ph);

    /* axes */
    const mute = cssVar('--fg-mute') || '#888';
    ctx.fillStyle = mute;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    for (let f = 0; f <= 4000; f += 1000) {
      const y = PT + ph * (1 - f / 4000);
      ctx.fillText((f / 1000) + 'k', PL - 5, y + 3);
    }
    ctx.textAlign = 'center';
    for (let t = 0; t <= 2; t += 1) {
      const x = PL + pw * (t / DUR);
      ctx.fillText(t + 's', x, H - 8);
    }
    ctx.textAlign = 'left';
    ctx.fillText('Hz', 4, H - 8);

    const dt = 1000 * N / SR;
    const df = SR / N;
    wLab.textContent = N + ' samples';
    readout.innerHTML =
      `window <strong>${N} samples = ${dt.toFixed(1)} ms</strong><br/>` +
      `Δf = f<sub>s</sub>/N = <strong>${df.toFixed(1)} Hz</strong><br/>` +
      `Δt = N/f<sub>s</sub> = <strong>${dt.toFixed(1)} ms</strong><br/>` +
      `Δt · Δf = <strong>1.00</strong> — always<br/>` +
      `<span class="verdict ${N <= 64 ? 'ok' : (N >= 512 ? 'bad' : '')}">${
        N <= 64 ? 'clicks sharp · the two tones merge'
        : N >= 512 ? 'two tones split · clicks smeared'
        : 'a compromise — neither fully resolved'}</span>` +
      `<span class="hint">The two steady tones are 131 Hz apart. You can only separate them once Δf drops below that.</span>`;
  }

  slider.addEventListener('input', () => { wIdx = +slider.value; draw(); });
  host.querySelector('#stPlay').addEventListener('click', () => {
    const d = new Float32Array(sig);
    AudioLab.envelope(d, SR, 20);
    AudioLab.play(d, SR);
  });

  draw();
})();

/* =====================================================================
 * Widget 4: phase-lab — same magnitude spectrum, different sound
 * ===================================================================== */
(function phaseLab() {
  const host = document.getElementById('phase-lab');
  if (!host) return;

  const SR = 16000;
  const NFFT = 32768;           /* 2.048 s */
  let mode = 'orig';

  /* Source: a harmonic tone with a clear attack — plainly "musical". */
  const orig = new Float32Array(NFFT);
  (function build() {
    const f0 = 180;
    const harm = [1, 0.6, 0.45, 0.3, 0.22, 0.15, 0.1];
    for (let i = 0; i < NFFT; i++) {
      const t = i / SR;
      const env = Math.exp(-t * 1.4) * Math.min(1, t / 0.01);
      let v = 0;
      for (let h = 0; h < harm.length; h++) v += harm[h] * Math.sin(2 * Math.PI * f0 * (h + 1) * t);
      orig[i] = env * v;
    }
    AudioLab.normalize(orig, 0.8);
  })();

  /* Phase randomization: keep every |X[k]| exactly, replace every angle,
     preserving conjugate symmetry so the result stays real. */
  const scrambled = (function () {
    const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
    for (let i = 0; i < NFFT; i++) { re[i] = orig[i]; im[i] = 0; }
    fft(re, im, false);
    const half = NFFT / 2;
    const nr = new Float64Array(NFFT), ni = new Float64Array(NFFT);
    nr[0] = re[0]; ni[0] = 0;
    nr[half] = re[half]; ni[half] = 0;
    for (let k = 1; k < half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const th = Math.random() * 2 * Math.PI;
      nr[k] = mag * Math.cos(th); ni[k] = mag * Math.sin(th);
      nr[NFFT - k] = nr[k]; ni[NFFT - k] = -ni[k];
    }
    fft(nr, ni, true);
    const out = new Float32Array(NFFT);
    for (let i = 0; i < NFFT; i++) out[i] = nr[i];
    /* Deliberately NOT re-normalized: any rescaling here would change every
       magnitude bin, and the whole point is that they are bit-identical.
       Parseval guarantees the energy — and so the loudness — already matches. */
    return out;
  })();

  /* A 2.5 ms shift: perceptually identical, numerically as far away as noise. */
  const SHIFT = 40;
  const shifted = (function () {
    const out = new Float32Array(NFFT);
    for (let i = 0; i < NFFT; i++) out[i] = orig[(i - SHIFT + NFFT) % NFFT];
    return out;
  })();

  function magSpec(x) {
    const re = new Float64Array(NFFT), im = new Float64Array(NFFT);
    for (let i = 0; i < NFFT; i++) { re[i] = x[i]; im[i] = 0; }
    fft(re, im, false);
    const half = NFFT / 2;
    const out = new Float64Array(half);
    for (let k = 0; k < half; k++) out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    return out;
  }
  const specO = magSpec(orig), specS = magSpec(scrambled), specH = magSpec(shifted);

  function relErr(a, b) {
    let num = 0, den = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; num += d * d; den += a[i] * a[i]; }
    return den > 0 ? Math.sqrt(num / den) : 0;
  }
  const STATS = {
    orig:   { wav: 0, spec: 0 },
    scram:  { wav: relErr(orig, scrambled), spec: relErr(specO, specS) },
    shift:  { wav: relErr(orig, shifted),   spec: relErr(specO, specH) },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="left">
        <div class="canvas-pair">
          <div>
            <canvas id="phWave"></canvas>
            <p class="lbl">waveform — 40 ms</p>
          </div>
          <div>
            <canvas id="phSpec"></canvas>
            <p class="lbl">magnitude spectrum — 0–2 kHz</p>
          </div>
        </div>
        <div class="toggle-row">
          <button class="btn active" data-m="orig">original</button>
          <button class="btn" data-m="scram">phase randomized</button>
          <button class="btn" data-m="shift">shifted 2.5 ms</button>
          <button class="btn" id="phPlay">▶ play this one</button>
        </div>
      </div>
      <div class="controls">
        <div class="readout" id="phReadout"></div>
      </div>
    </div>`);

  const WW = 300, WH = 160;
  const waveCv = host.querySelector('#phWave');
  const specCv = host.querySelector('#phSpec');
  const wctx = devicePx(waveCv, WW, WH);
  const sctx = devicePx(specCv, WW, WH);
  const readout = host.querySelector('#phReadout');

  function currentSignal() {
    return mode === 'orig' ? orig : (mode === 'scram' ? scrambled : shifted);
  }
  function currentSpec() {
    return mode === 'orig' ? specO : (mode === 'scram' ? specS : specH);
  }

  function draw() {
    const accent = cssVar('--accent') || '#c2410c';
    const rule = cssVar('--rule') || '#ddd';
    const mute = cssVar('--fg-mute') || '#888';
    const x = currentSignal();

    /* waveform, 40 ms starting 20 ms in */
    wctx.clearRect(0, 0, WW, WH);
    wctx.strokeStyle = rule; wctx.lineWidth = 1;
    wctx.beginPath(); wctx.moveTo(0, WH / 2); wctx.lineTo(WW, WH / 2); wctx.stroke();
    const s0 = Math.floor(0.02 * SR), sN = Math.floor(0.04 * SR);
    wctx.strokeStyle = accent; wctx.lineWidth = 1.6;
    wctx.beginPath();
    for (let px = 0; px <= WW; px++) {
      const i = s0 + Math.floor((px / WW) * sN);
      const y = WH / 2 - x[i] * (WH / 2 - 10) / 0.85;
      if (px === 0) wctx.moveTo(px, y); else wctx.lineTo(px, y);
    }
    wctx.stroke();

    /* magnitude spectrum, 0-2 kHz */
    const sp = currentSpec();
    const kMax = Math.floor(2000 * NFFT / SR);
    let mx = 1e-9;
    for (let k = 0; k < kMax; k++) mx = Math.max(mx, sp[k]);
    sctx.clearRect(0, 0, WW, WH);
    const base = WH - 18;
    sctx.strokeStyle = rule; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(0, base); sctx.lineTo(WW, base); sctx.stroke();
    sctx.strokeStyle = accent; sctx.lineWidth = 1.2;
    sctx.beginPath();
    for (let px = 0; px <= WW; px++) {
      const k = Math.floor((px / WW) * kMax);
      const y = base - (sp[k] / mx) * (base - 12);
      if (px === 0) sctx.moveTo(px, y); else sctx.lineTo(px, y);
    }
    sctx.stroke();
    sctx.fillStyle = mute;
    sctx.font = '10px ui-monospace, monospace';
    sctx.textAlign = 'center';
    sctx.fillText('0', 6, WH - 5);
    sctx.fillText('1 kHz', WW / 2, WH - 5);
    sctx.fillText('2 kHz', WW - 18, WH - 5);

    const st = STATS[mode === 'orig' ? 'orig' : mode];
    const verdicts = {
      orig:  ['', 'the reference'],
      scram: ['bad', 'sounds like a whoosh — the harmonics are gone from your ear, not from the spectrum'],
      shift: ['ok', 'sounds absolutely identical — and MSE says it is wildly wrong'],
    };
    readout.innerHTML =
      `waveform error vs original<br/><strong>${(st.wav * 100).toFixed(1)}%</strong> relative RMS<br/><br/>` +
      `magnitude-spectrum error<br/><strong>${(st.spec * 100).toFixed(2)}%</strong> relative RMS<br/>` +
      `<span class="verdict ${verdicts[mode][0]}">${verdicts[mode][1]}</span>` +
      `<span class="hint">Both alternatives have an essentially <em>identical</em> magnitude spectrum and a huge waveform error. One is inaudible, one is unrecognizable. No function of the waveform samples alone can tell you which is which.</span>`;
  }

  host.querySelectorAll('[data-m]').forEach(btn => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.m;
      host.querySelectorAll('[data-m]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      draw();
      AudioLab.play(AudioLab.envelope(new Float32Array(currentSignal()), SR, 20), SR);
    });
  });
  host.querySelector('#phPlay').addEventListener('click', () => {
    AudioLab.play(AudioLab.envelope(new Float32Array(currentSignal()), SR, 20), SR);
  });

  draw();
})();

/* =====================================================================
 * Widget 5: vowel-lab — source-filter synthesis of a vowel
 * ===================================================================== */
(function vowelLab() {
  const host = document.getElementById('vowel-lab');
  if (!host) return;

  /* Reference formants (adult male, Peterson & Barney style). */
  const VOWELS = [
    { s: 'i',  w: '"ee" as in heed', f1: 270, f2: 2290 },
    { s: 'ɪ',  w: '"i" as in hid',   f1: 390, f2: 1990 },
    { s: 'ɛ',  w: '"e" as in head',  f1: 530, f2: 1840 },
    { s: 'æ',  w: '"a" as in had',   f1: 660, f2: 1720 },
    { s: 'ɑ',  w: '"ah" as in hod',  f1: 730, f2: 1090 },
    { s: 'ɔ',  w: '"aw" as in hawed',f1: 570, f2: 840  },
    { s: 'ʊ',  w: '"oo" as in hood', f1: 440, f2: 1020 },
    { s: 'u',  w: '"oo" as in who\'d', f1: 300, f2: 870 },
  ];
  const F1_MIN = 200, F1_MAX = 900, F2_MIN = 600, F2_MAX = 2600;

  let f0 = 120, f1 = 660, f2 = 1720;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="left">
        <canvas id="vwChart"></canvas>
        <div class="slider-row">
          <label>pitch F₀ <strong id="vwF0">120 Hz</strong></label>
          <input type="range" id="vwSlider" min="70" max="300" value="120" step="1"/>
        </div>
        <div class="toggle-row">
          <button class="btn" id="vwPlay">▶ say it</button>
          <button class="btn" id="vwSweep">▶ glide through all vowels</button>
        </div>
      </div>
      <div class="controls">
        <canvas id="vwSpec"></canvas>
        <div class="readout" id="vwReadout"></div>
      </div>
    </div>`);

  const CW = 330, CH = 260, SW = 210, SH = 110;
  const chartCv = host.querySelector('#vwChart');
  const specCv = host.querySelector('#vwSpec');
  const cctx = devicePx(chartCv, CW, CH);
  const sctx = devicePx(specCv, SW, SH);
  const readout = host.querySelector('#vwReadout');
  const slider = host.querySelector('#vwSlider');
  const f0Lab = host.querySelector('#vwF0');
  const PAD_L = 36, PAD_R = 12, PAD_T = 12, PAD_B = 28;

  /* Standard vowel-chart orientation: F2 decreases left→right, F1 increases top→bottom. */
  function toXY(a, b) {
    const x = PAD_L + (CW - PAD_L - PAD_R) * (1 - (b - F2_MIN) / (F2_MAX - F2_MIN));
    const y = PAD_T + (CH - PAD_T - PAD_B) * ((a - F1_MIN) / (F1_MAX - F1_MIN));
    return [x, y];
  }
  function fromXY(x, y) {
    const b = F2_MIN + (F2_MAX - F2_MIN) * (1 - (x - PAD_L) / (CW - PAD_L - PAD_R));
    const a = F1_MIN + (F1_MAX - F1_MIN) * ((y - PAD_T) / (CH - PAD_T - PAD_B));
    return [
      Math.max(F1_MIN, Math.min(F1_MAX, a)),
      Math.max(F2_MIN, Math.min(F2_MAX, b)),
    ];
  }

  /* Two-pole resonator applied in series for F1, F2, F3. */
  function resonate(x, sr, freq, bw) {
    const r = Math.exp(-Math.PI * bw / sr);
    const th = 2 * Math.PI * freq / sr;
    const a1 = 2 * r * Math.cos(th), a2 = -r * r;
    const g = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * th) + r * r);
    let y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const y = g * x[i] + a1 * y1 + a2 * y2;
      y2 = y1; y1 = y;
      x[i] = y;
    }
    return x;
  }

  function synth(dur, pathFn) {
    const sr = AudioLab.rate();
    const n = Math.floor(sr * dur);
    /* glottal source: band-limited pulse train with a natural -12 dB/oct tilt */
    const src = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t);
      phase += f0 * vib / sr;
      if (phase >= 1) phase -= 1;
      /* Rosenberg-ish glottal pulse shape */
      const p = phase;
      let g;
      if (p < 0.4) g = 0.5 * (1 - Math.cos(Math.PI * p / 0.4));
      else if (p < 0.56) g = Math.cos(Math.PI * (p - 0.4) / (2 * 0.16));
      else g = 0;
      src[i] = g - 0.35;
    }
    if (!pathFn) {
      resonate(src, sr, f1, 70);
      resonate(src, sr, f2, 95);
      resonate(src, sr, 2750, 140);
    } else {
      /* piecewise: re-filter in short blocks so the formants can glide */
      const BLK = Math.floor(sr * 0.02);
      const out = new Float32Array(n);
      let st1 = [0, 0], st2 = [0, 0], st3 = [0, 0];
      for (let b = 0; b * BLK < n; b++) {
        const s = b * BLK, e = Math.min(n, s + BLK);
        const [ff1, ff2] = pathFn((s / sr) / dur);
        const seg = src.slice(s, e);
        st1 = filtBlock(seg, sr, ff1, 70, st1);
        st2 = filtBlock(seg, sr, ff2, 95, st2);
        st3 = filtBlock(seg, sr, 2750, 140, st3);
        out.set(seg, s);
      }
      src.set(out);
    }
    AudioLab.normalize(src, 0.75);
    AudioLab.envelope(src, sr, 35);
    return { data: src, sr };
  }

  function filtBlock(x, sr, freq, bw, st) {
    const r = Math.exp(-Math.PI * bw / sr);
    const th = 2 * Math.PI * freq / sr;
    const a1 = 2 * r * Math.cos(th), a2 = -r * r;
    const g = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * th) + r * r);
    let y1 = st[0], y2 = st[1];
    for (let i = 0; i < x.length; i++) {
      const y = g * x[i] + a1 * y1 + a2 * y2;
      y2 = y1; y1 = y;
      x[i] = y;
    }
    return [y1, y2];
  }

  function nearestVowel() {
    let best = null, bd = Infinity;
    for (const v of VOWELS) {
      /* distance in log-frequency, which is what perception uses */
      const d = Math.pow(Math.log(f1 / v.f1), 2) + Math.pow(Math.log(f2 / v.f2), 2);
      if (d < bd) { bd = d; best = v; }
    }
    return { v: best, d: Math.sqrt(bd) };
  }

  function draw() {
    const accent = cssVar('--accent') || '#c2410c';
    const rule = cssVar('--rule') || '#ddd';
    const mute = cssVar('--fg-mute') || '#888';
    const fg = cssVar('--fg') || '#222';

    /* --- vowel chart --- */
    cctx.clearRect(0, 0, CW, CH);
    cctx.strokeStyle = rule; cctx.lineWidth = 1;
    cctx.strokeRect(PAD_L, PAD_T, CW - PAD_L - PAD_R, CH - PAD_T - PAD_B);

    cctx.font = '11px ui-monospace, monospace';
    cctx.fillStyle = mute;
    cctx.textAlign = 'center';
    cctx.fillText('F₂ high (front) ←→ F₂ low (back)', CW / 2, CH - 8);
    cctx.save();
    cctx.translate(11, CH / 2); cctx.rotate(-Math.PI / 2);
    cctx.fillText('F₁ low (close) ←→ F₁ high (open)', 0, 0);
    cctx.restore();

    const near = nearestVowel();
    for (const v of VOWELS) {
      const [x, y] = toXY(v.f1, v.f2);
      const isNear = v === near.v && near.d < 0.30;
      cctx.beginPath(); cctx.arc(x, y, isNear ? 16 : 13, 0, 2 * Math.PI);
      cctx.fillStyle = isNear ? accent : (cssVar('--bg-card') || '#f2f2f2');
      cctx.globalAlpha = isNear ? 0.22 : 1;
      cctx.fill();
      cctx.globalAlpha = 1;
      cctx.strokeStyle = isNear ? accent : rule;
      cctx.lineWidth = isNear ? 1.6 : 1;
      cctx.stroke();
      cctx.fillStyle = isNear ? accent : mute;
      cctx.font = isNear ? 'bold 14px serif' : '13px serif';
      cctx.textAlign = 'center';
      cctx.fillText(v.s, x, y + 5);
    }

    /* the draggable point */
    const [px, py] = toXY(f1, f2);
    cctx.beginPath(); cctx.arc(px, py, 9, 0, 2 * Math.PI);
    cctx.strokeStyle = cssVar('--bg-elev') || '#fff'; cctx.lineWidth = 3.5; cctx.stroke();
    cctx.beginPath(); cctx.arc(px, py, 9, 0, 2 * Math.PI);
    cctx.strokeStyle = accent; cctx.lineWidth = 2.2; cctx.stroke();
    cctx.beginPath(); cctx.arc(px, py, 2.2, 0, 2 * Math.PI);
    cctx.fillStyle = accent; cctx.fill();

    /* --- spectrum with formant envelope --- */
    sctx.clearRect(0, 0, SW, SH);
    const base = SH - 16, fMax = 3400;
    sctx.strokeStyle = rule; sctx.lineWidth = 1;
    sctx.beginPath(); sctx.moveTo(0, base); sctx.lineTo(SW, base); sctx.stroke();

    function envAt(f) {
      let m = 1;
      [[f1, 70], [f2, 95], [2750, 140]].forEach(([fc, bw]) => {
        m *= 1 / Math.sqrt(Math.pow(1 - (f / fc) * (f / fc), 2) + Math.pow((f * bw) / (fc * fc), 2) * 4);
      });
      return m / Math.pow(1 + f / 400, 0.9);
    }
    let emax = 1e-9;
    for (let f = 20; f < fMax; f += 10) emax = Math.max(emax, envAt(f));

    /* harmonics of F0 under the envelope */
    for (let h = 1; h * f0 < fMax; h++) {
      const f = h * f0;
      const x = (f / fMax) * SW;
      const y = base - Math.pow(envAt(f) / emax, 0.55) * (base - 10);
      sctx.strokeStyle = accent; sctx.lineWidth = 1.4; sctx.globalAlpha = 0.55;
      sctx.beginPath(); sctx.moveTo(x, base); sctx.lineTo(x, y); sctx.stroke();
      sctx.globalAlpha = 1;
    }
    /* the envelope itself */
    sctx.strokeStyle = fg; sctx.lineWidth = 1.4; sctx.globalAlpha = 0.7;
    sctx.beginPath();
    for (let px2 = 0; px2 <= SW; px2++) {
      const f = (px2 / SW) * fMax;
      const y = base - Math.pow(Math.max(envAt(f), 1e-9) / emax, 0.55) * (base - 10);
      if (px2 === 0) sctx.moveTo(px2, y); else sctx.lineTo(px2, y);
    }
    sctx.stroke();
    sctx.globalAlpha = 1;
    sctx.fillStyle = mute;
    sctx.font = '9px ui-monospace, monospace';
    sctx.textAlign = 'center';
    [1000, 2000, 3000].forEach(f => sctx.fillText((f / 1000) + 'k', (f / fMax) * SW, SH - 4));
    sctx.textAlign = 'left';
    sctx.fillText('bars = F₀ harmonics · line = tract', 3, 10);

    readout.innerHTML =
      `F₀ <strong>${f0} Hz</strong> · F₁ <strong>${f1.toFixed(0)} Hz</strong> · F₂ <strong>${f2.toFixed(0)} Hz</strong><br/>` +
      `nearest vowel <strong style="font-size:15px">/${near.v.s}/</strong> — ${near.v.w}` +
      `<span class="hint">The bars move when you change F₀; the line moves when you drag the point. Only the line changes which vowel you hear — that is source–filter separation, and it is why you understand speech at any pitch.</span>`;
  }

  /* dragging */
  let dragging = false;
  function pick(e) {
    const [x, y] = canvasXY(chartCv, e, CW, CH);
    [f1, f2] = fromXY(x, y);
    draw();
  }
  chartCv.addEventListener('mousedown', e => { dragging = true; pick(e); });
  window.addEventListener('mousemove', e => { if (dragging) pick(e); });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    const { data, sr } = synth(0.9, null);
    AudioLab.play(data, sr);
  });
  chartCv.addEventListener('touchstart', e => { dragging = true; pick(e); e.preventDefault(); }, { passive: false });
  chartCv.addEventListener('touchmove', e => { if (dragging) { pick(e); e.preventDefault(); } }, { passive: false });
  chartCv.addEventListener('touchend', () => {
    dragging = false;
    const { data, sr } = synth(0.9, null);
    AudioLab.play(data, sr);
  });

  slider.addEventListener('input', () => { f0 = +slider.value; f0Lab.textContent = f0 + ' Hz'; draw(); });
  slider.addEventListener('change', () => { const { data, sr } = synth(0.9, null); AudioLab.play(data, sr); });

  host.querySelector('#vwPlay').addEventListener('click', () => {
    const { data, sr } = synth(1.1, null);
    AudioLab.play(data, sr);
  });

  host.querySelector('#vwSweep').addEventListener('click', () => {
    const order = ['i', 'ɪ', 'ɛ', 'æ', 'ɑ', 'ɔ', 'ʊ', 'u'].map(s => VOWELS.find(v => v.s === s));
    const DUR = 4.4;
    const path = (u) => {
      const p = Math.max(0, Math.min(0.9999, u)) * (order.length - 1);
      const i = Math.floor(p), fr = p - i;
      const a = order[i], b = order[Math.min(order.length - 1, i + 1)];
      return [a.f1 + (b.f1 - a.f1) * fr, a.f2 + (b.f2 - a.f2) * fr];
    };
    const { data, sr } = synth(DUR, path);
    const start = performance.now();
    let running = true;
    AudioLab.play(data, sr, () => { running = false; });
    (function tick() {
      if (!running) return;
      const el = (performance.now() - start) / 1000;
      if (el > DUR) return;
      [f1, f2] = path(el / DUR);
      draw();
      requestAnimationFrame(tick);
    })();
  });

  draw();
})();
