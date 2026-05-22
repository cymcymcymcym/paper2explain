/* diffusion_dont_memorize blog interactive widgets. Plain JS / Canvas. No deps. */

/* ---------- theme toggle ---------- */
(function () {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const saved = localStorage.getItem('vb-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  const setLabel = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    toggle.textContent = dark ? '☀' : '☾';
  };
  setLabel();
  toggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('vb-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('vb-theme', 'dark');
    }
    setLabel();
    // Trigger redraw of any widget that listens
    window.dispatchEvent(new Event('theme-changed'));
  });
})();

function devicePx(canvas, cssW, cssH) {
  canvas.width = cssW * 2;
  canvas.height = cssH * 2;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  return ctx;
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const COLOR_QUALITY = '#5fa9ff';
const COLOR_MEM     = '#ff5d6c';
const COLOR_WINDOW  = '#39d28a';
const COLOR_POP     = '#7e8693';
const COLOR_LEARNED = '#ff9b4a';

/* =====================================================================
 * Widget 1: WINDOW-EXPLORER
 * Two sliders (n, tau). Shows FID curve, f_mem curve, generalization window.
 * ===================================================================== */
(function windowExplorer() {
  const host = document.getElementById('window-explorer');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="weCanvas"></canvas>
      <div class="controls">
        <div class="slider-row">
          <label>dataset size <span class="val" id="weNval">n = 1</span></label>
          <input type="range" id="weN" min="0.5" max="5" step="0.05" value="1"/>
        </div>
        <div class="slider-row">
          <label>training time <span class="val" id="weTval">τ = 0</span></label>
          <input type="range" id="weT" min="0" max="100" step="0.5" value="40"/>
        </div>
        <div class="readout" id="weReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#weCanvas');
  const W = 520, H = 300;
  const ctx = devicePx(cv, W, H);
  const slN = host.querySelector('#weN');
  const slT = host.querySelector('#weT');
  const labN = host.querySelector('#weNval');
  const labT = host.querySelector('#weTval');
  const readout = host.querySelector('#weReadout');

  const TAU_GEN = 1.0;
  const TAU_MAX_DISPLAY = 18.0; // x-axis upper limit in arbitrary units

  function fid(tau) { return 1.0 + 0.95 / (1 + Math.pow(tau / TAU_GEN, 2.2)); }
  function fmem(tau, tauMem) { return 0.85 / (1 + Math.exp(-(tau / tauMem - 1) * 6.5)); }

  function draw() {
    const n = parseFloat(slN.value);
    const tauUI = parseFloat(slT.value);
    const tauMem = TAU_GEN * 3.0 * n;
    // Map slT [0..100] to tau range [0, TAU_MAX_DISPLAY]
    const tau = (tauUI / 100) * TAU_MAX_DISPLAY;

    // axes
    const padL = 50, padR = 22, padT = 30, padB = 38;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const x = t => padL + (t / TAU_MAX_DISPLAY) * plotW;
    const y = v => padT + (1 - Math.max(0, Math.min(1, v))) * plotH;

    ctx.clearRect(0, 0, W, H);

    // Green window
    const xg = x(TAU_GEN), xm = x(Math.min(tauMem, TAU_MAX_DISPLAY));
    ctx.fillStyle = 'rgba(57, 210, 138, 0.16)';
    ctx.fillRect(xg, padT, xm - xg, plotH);

    // grid
    ctx.strokeStyle = cssVar('--rule') || '#e6e4dd';
    ctx.lineWidth = 1;
    for (let v = 0.25; v <= 1; v += 0.25) {
      ctx.beginPath(); ctx.moveTo(padL, y(v)); ctx.lineTo(padL + plotW, y(v)); ctx.stroke();
    }
    // axes lines
    const fg = cssVar('--fg-mute') || '#5a5a64';
    ctx.strokeStyle = fg; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // axis labels
    ctx.fillStyle = fg; ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('training time  τ  →', padL + plotW / 2, H - 10);
    ctx.save();
    ctx.translate(14, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLOR_QUALITY;
    ctx.fillText('quality (lower = better)', 0, 0);
    ctx.restore();

    // FID curve (blue)
    ctx.strokeStyle = COLOR_QUALITY; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU_MAX_DISPLAY;
      const v = fid(t);
      if (i === 0) ctx.moveTo(x(t), y(v));
      else ctx.lineTo(x(t), y(v));
    }
    ctx.stroke();

    // f_mem curve (red)
    ctx.strokeStyle = COLOR_MEM; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU_MAX_DISPLAY;
      const v = fmem(t, tauMem);
      if (i === 0) ctx.moveTo(x(t), y(v));
      else ctx.lineTo(x(t), y(v));
    }
    ctx.stroke();

    // vertical markers
    function vMark(tauVal, color, label) {
      const xx = x(tauVal);
      if (xx < padL || xx > padL + plotW) return;
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, xx, padT - 6);
    }
    vMark(TAU_GEN, COLOR_QUALITY, 'τ_gen');
    if (tauMem <= TAU_MAX_DISPLAY) vMark(tauMem, COLOR_MEM, 'τ_mem');
    else {
      // arrow to indicate tau_mem is off-screen
      ctx.fillStyle = COLOR_MEM; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('τ_mem →', padL + plotW - 4, padT - 6);
    }

    // current tau marker (orange vertical line + dot)
    const xt = x(tau);
    ctx.strokeStyle = COLOR_LEARNED; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xt, padT); ctx.lineTo(xt, padT + plotH); ctx.stroke();
    ctx.fillStyle = COLOR_LEARNED;
    const fv = fid(tau), mv = fmem(tau, tauMem);
    ctx.beginPath(); ctx.arc(xt, y(fv), 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(xt, y(mv), 4.5, 0, Math.PI * 2); ctx.fill();

    labN.textContent = `n = ${n.toFixed(2)}×`;
    labT.textContent = `τ = ${tau.toFixed(2)}`;

    // regime classification
    let regime, regimeClass;
    if (tau < TAU_GEN * 0.85) { regime = 'pre-generalization (noise)'; regimeClass = 'regime-mem'; }
    else if (tau < tauMem * 0.85) { regime = 'generalization window'; regimeClass = 'regime-dyn'; }
    else { regime = 'memorization'; regimeClass = 'regime-mem'; }

    const winWidth = Math.max(0, tauMem - TAU_GEN);
    readout.innerHTML = `
      <div>τ_gen  = <b>${TAU_GEN.toFixed(2)}</b> &nbsp; <span style="color:var(--fg-mute)">(does not depend on n)</span></div>
      <div>τ_mem  = <b>${tauMem.toFixed(2)}</b> &nbsp; <span style="color:var(--fg-mute)">(∝ n)</span></div>
      <div>window = <b style="color:${COLOR_WINDOW}">${winWidth.toFixed(2)}</b></div>
      <div style="margin-top:6px;">current: <span class="regime-badge ${regimeClass}">${regime}</span></div>
    `;
  }

  slN.addEventListener('input', draw);
  slT.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: SCORE-MORPH
 * 1D Gaussian mixture (4 modes). Show population score (gray dashed),
 * empirical score (red dashed) computed from n samples, and learned score
 * (orange) that morphs between them as a tau slider is moved.
 * ===================================================================== */
(function scoreMorph() {
  const host = document.getElementById('score-morph');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="smCanvas"></canvas>
      <div class="controls">
        <div class="slider-row">
          <label>training progress <span class="val" id="smTauval">τ — generalize</span></label>
          <input type="range" id="smTau" min="0" max="1" step="0.005" value="0.35"/>
        </div>
        <div class="slider-row">
          <label>noise level <span class="val" id="smTval">t = 0.20</span></label>
          <input type="range" id="smT" min="0.02" max="0.6" step="0.01" value="0.2"/>
        </div>
        <div class="slider-row">
          <label>training samples <span class="val" id="smNval">n = 12</span></label>
          <input type="range" id="smN" min="4" max="40" step="1" value="12"/>
        </div>
        <div class="readout" id="smReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#smCanvas');
  const W = 520, H = 300;
  const ctx = devicePx(cv, W, H);
  const slTau = host.querySelector('#smTau');
  const slT = host.querySelector('#smT');
  const slN = host.querySelector('#smN');
  const labTau = host.querySelector('#smTauval');
  const labT = host.querySelector('#smTval');
  const labN = host.querySelector('#smNval');
  const readout = host.querySelector('#smReadout');

  // Population: a mixture of 4 Gaussians
  const MODES = [
    { mu: -3.0, sigma: 0.45, w: 0.30 },
    { mu: -0.9, sigma: 0.40, w: 0.20 },
    { mu:  1.2, sigma: 0.45, w: 0.30 },
    { mu:  3.0, sigma: 0.40, w: 0.20 },
  ];

  // Deterministic sample generation seeded by n
  function makeSamples(n) {
    // simple deterministic seed
    let seed = 0x1f3a + n * 31;
    function rand() {
      seed = (seed * 1664525 + 1013904223) | 0;
      return ((seed >>> 0) % 100000) / 100000;
    }
    function randn() {
      const u = 1 - rand(), v = 1 - rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      let r = rand(), acc = 0, picked = MODES[MODES.length - 1];
      for (const m of MODES) { acc += m.w; if (r <= acc) { picked = m; break; } }
      out.push(picked.mu + randn() * picked.sigma);
    }
    return out;
  }

  // p_t(x) = (1/n) sum N(x; x_i * e^{-t}, sigma^2 + Delta_t) for empirical
  // but the data themselves are noisy already with the modes; for the
  // population p_t we convolve the GMM with N(0, Delta_t) plus shrink the means
  // by e^{-t}.
  function popDensity(x, t) {
    const et = Math.exp(-t), Dt = 1 - Math.exp(-2 * t);
    let p = 0;
    for (const m of MODES) {
      const var_ = m.sigma * m.sigma + Dt;
      const mu = m.mu * et;
      p += m.w * Math.exp(-((x - mu) ** 2) / (2 * var_)) / Math.sqrt(2 * Math.PI * var_);
    }
    return p;
  }
  function popScore(x, t) {
    const et = Math.exp(-t), Dt = 1 - Math.exp(-2 * t);
    let num = 0, denom = 0;
    for (const m of MODES) {
      const var_ = m.sigma * m.sigma + Dt;
      const mu = m.mu * et;
      const pi = m.w * Math.exp(-((x - mu) ** 2) / (2 * var_)) / Math.sqrt(2 * Math.PI * var_);
      num += pi * (mu - x) / var_;
      denom += pi;
    }
    return num / (denom + 1e-12);
  }
  function empScore(x, t, samples) {
    const et = Math.exp(-t), Dt = 1 - Math.exp(-2 * t);
    let num = 0, denom = 0;
    for (const s of samples) {
      const mu = s * et;
      const pi = Math.exp(-((x - mu) ** 2) / (2 * Dt));
      num += pi * (mu - x) / Dt;
      denom += pi;
    }
    return num / (denom + 1e-12);
  }

  function draw() {
    const tau = parseFloat(slTau.value);
    const t = parseFloat(slT.value);
    const n = parseInt(slN.value, 10);
    const samples = makeSamples(n);

    // smooth interpolation between population (tau=0) and empirical (tau=1).
    // The curve uses a sigmoid: low tau dominated by population, high tau by empirical.
    const alpha = 1 / (1 + Math.exp(-(tau - 0.5) * 9));

    const padL = 38, padR = 12, padT = 14, padB = 34;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xLo = -4.5, xHi = 4.5;
    const yLo = -6, yHi = 6;
    const xMap = x => padL + ((x - xLo) / (xHi - xLo)) * plotW;
    const yMap = y => padT + (1 - (y - yLo) / (yHi - yLo)) * plotH;

    ctx.clearRect(0, 0, W, H);

    // x axis
    ctx.strokeStyle = cssVar('--rule') || '#e6e4dd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yMap(0)); ctx.lineTo(padL + plotW, yMap(0)); ctx.stroke();

    // y axis
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.stroke();

    // Population density (subtle background fill)
    const popVals = [], empVals = [], learnedVals = [];
    const NS = 240;
    for (let i = 0; i <= NS; i++) {
      const x = xLo + (i / NS) * (xHi - xLo);
      popVals.push(popScore(x, t));
      empVals.push(empScore(x, t, samples));
    }
    for (let i = 0; i <= NS; i++) {
      learnedVals.push((1 - alpha) * popVals[i] + alpha * empVals[i]);
    }

    // density (light shaded area at bottom) for context
    ctx.fillStyle = cssVar('--bg-card') || '#f1f0eb';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    for (let i = 0; i <= NS; i++) {
      const x = xLo + (i / NS) * (xHi - xLo);
      const d = popDensity(x, t);
      // scale density so peak is small (just visual hint)
      const yv = (padT + plotH) - d * plotH * 0.6;
      ctx.lineTo(xMap(x), yv);
    }
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Population score (gray dashed)
    ctx.strokeStyle = COLOR_POP; ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i <= NS; i++) {
      const x = xLo + (i / NS) * (xHi - xLo);
      const v = Math.max(yLo, Math.min(yHi, popVals[i]));
      if (i === 0) ctx.moveTo(xMap(x), yMap(v));
      else ctx.lineTo(xMap(x), yMap(v));
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Empirical score (red dashed, semi-transparent)
    ctx.strokeStyle = COLOR_MEM; ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i <= NS; i++) {
      const x = xLo + (i / NS) * (xHi - xLo);
      const v = Math.max(yLo, Math.min(yHi, empVals[i]));
      if (i === 0) ctx.moveTo(xMap(x), yMap(v));
      else ctx.lineTo(xMap(x), yMap(v));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Learned score (orange, solid, bold)
    ctx.strokeStyle = COLOR_LEARNED; ctx.lineWidth = 2.7;
    ctx.beginPath();
    for (let i = 0; i <= NS; i++) {
      const x = xLo + (i / NS) * (xHi - xLo);
      const v = Math.max(yLo, Math.min(yHi, learnedVals[i]));
      if (i === 0) ctx.moveTo(xMap(x), yMap(v));
      else ctx.lineTo(xMap(x), yMap(v));
    }
    ctx.stroke();

    // Training samples as little ticks at the bottom
    const et = Math.exp(-t);
    ctx.fillStyle = COLOR_MEM;
    for (const s of samples) {
      const xx = xMap(s * et);
      ctx.fillRect(xx - 1, padT + plotH - 8, 2, 8);
    }

    // x axis labels
    ctx.fillStyle = cssVar('--fg-mute') || '#5a5a64';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('x', padL + plotW - 4, yMap(0) + 14);

    // Legend
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_POP; ctx.fillText('— — population score', padL + 10, padT + 14);
    ctx.fillStyle = COLOR_MEM; ctx.fillText('— — empirical score', padL + 10, padT + 28);
    ctx.fillStyle = COLOR_LEARNED; ctx.fillText('—— learned score', padL + 10, padT + 42);

    // Readout
    labTau.textContent = `α = ${alpha.toFixed(2)}`;
    labT.textContent = `t = ${t.toFixed(2)}`;
    labN.textContent = `n = ${n}`;

    let phase, phaseClass;
    if (alpha < 0.18) { phase = 'population score'; phaseClass = 'regime-dyn'; }
    else if (alpha < 0.7) { phase = 'morphing toward empirical'; phaseClass = 'regime-arch'; }
    else { phase = 'empirical (memorizing)'; phaseClass = 'regime-mem'; }

    readout.innerHTML = `
      <div>training progress: <b>${(tau * 100).toFixed(0)}%</b></div>
      <div>learned ≈ <b>${(1 - alpha).toFixed(2)}</b> · pop + <b>${alpha.toFixed(2)}</b> · emp</div>
      <div style="margin-top:6px;">score is currently: <span class="regime-badge ${phaseClass}">${phase}</span></div>
    `;
  }

  slTau.addEventListener('input', draw);
  slT.addEventListener('input', draw);
  slN.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: PHASE-EXPLORER
 * Click in (n, p) plane (log-log axes). Color by regime.
 * Slider for tau shifts the boundary between memorization and dynamical
 * regularization.
 * ===================================================================== */
(function phaseExplorer() {
  const host = document.getElementById('phase-explorer');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="peCanvas"></canvas>
      <div class="controls">
        <div class="slider-row">
          <label>training time <span class="val" id="peTauval">τ = τ_gen</span></label>
          <input type="range" id="peTau" min="1" max="40" step="0.5" value="1"/>
        </div>
        <div class="readout" id="peReadout">
          <div>click in the plane to place a point</div>
        </div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#peCanvas');
  const W = 520, H = 380;
  const ctx = devicePx(cv, W, H);
  const slTau = host.querySelector('#peTau');
  const labTau = host.querySelector('#peTauval');
  const readout = host.querySelector('#peReadout');

  // log10 axis ranges
  const log10 = Math.log10 || (x => Math.log(x) / Math.LN10);
  const N_LO = 2, N_HI = 5;          // 10^2 .. 10^5
  const P_LO = 5, P_HI = 8;          // 10^5 .. 10^8
  const padL = 60, padR = 18, padT = 18, padB = 50;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xMap = ln => padL + ((ln - N_LO) / (N_HI - N_LO)) * plotW;
  const yMap = lp => padT + (1 - (lp - P_LO) / (P_HI - P_LO)) * plotH;
  const xInv = px => N_LO + ((px - padL) / plotW) * (N_HI - N_LO);
  const yInv = py => P_LO + (1 - (py - padT) / plotH) * (P_HI - P_LO);

  let point = { ln: 3.3, lp: 6.6 }; // log10 n, log10 p

  // Boundaries:
  // Architectural threshold: n*(p) ~ p / 4  (roughly — n_star scales with p)
  //    => log n = log p - log 4
  // Memorization-vs-dynamical at training time tau: at tau = tau_gen we need
  //   n > n_gen(p)  with n_gen ~ const  (roughly 200 in CelebA)
  //   as tau grows, the boundary moves up toward n*(p)
  //   we'll interpolate: n_boundary(p, tau) = n_min + (n_star(p) - n_min) * f(tau)
  //   with f(tau) = (tau_norm - 1) / (tau_max - 1) clipped to [0, 1]
  const TAU_MAX = 40;
  function n_star_log(lp) { return lp - log10(4); }
  function n_boundary_log(lp, tau) {
    const nMinLog = log10(200);     // n at tau = tau_gen
    const nStarLog = n_star_log(lp);
    const f = Math.max(0, Math.min(1, (tau - 1) / (TAU_MAX - 1)));
    return nMinLog + (nStarLog - nMinLog) * f;
  }

  function classify(ln, lp, tau) {
    const nStar = n_star_log(lp);
    if (ln > nStar) return 'arch';
    const nB = n_boundary_log(lp, tau);
    if (ln > nB) return 'dyn';
    return 'mem';
  }

  function draw() {
    const tau = parseFloat(slTau.value);
    ctx.clearRect(0, 0, W, H);

    // Fill regimes as background — sample on grid
    const GX = 120, GY = 90;
    const dx = plotW / GX, dy = plotH / GY;
    for (let i = 0; i < GX; i++) {
      for (let j = 0; j < GY; j++) {
        const px = padL + (i + 0.5) * dx;
        const py = padT + (j + 0.5) * dy;
        const ln = xInv(px), lp = yInv(py);
        const r = classify(ln, lp, tau);
        let color;
        if (r === 'mem') color = 'rgba(255, 93, 108, 0.16)';
        else if (r === 'dyn') color = 'rgba(57, 210, 138, 0.16)';
        else color = 'rgba(95, 169, 255, 0.16)';
        ctx.fillStyle = color;
        ctx.fillRect(px - dx/2, py - dy/2, dx + 0.5, dy + 0.5);
      }
    }

    // Boundary lines
    ctx.lineWidth = 1.8;
    // architectural threshold (blue)
    ctx.strokeStyle = '#3683d6';
    ctx.beginPath();
    let first = true;
    for (let lp = P_LO; lp <= P_HI; lp += 0.05) {
      const ln = n_star_log(lp);
      if (ln < N_LO || ln > N_HI) continue;
      const x = xMap(ln), y = yMap(lp);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // dynamical boundary (green, dashed)
    ctx.strokeStyle = '#2a9866';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    first = true;
    for (let lp = P_LO; lp <= P_HI; lp += 0.05) {
      const ln = n_boundary_log(lp, tau);
      if (ln < N_LO || ln > N_HI) continue;
      const x = xMap(ln), y = yMap(lp);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // axes
    const fg = cssVar('--fg-mute') || '#5a5a64';
    ctx.strokeStyle = fg; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // ticks + labels
    ctx.fillStyle = fg; ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (let ln = N_LO; ln <= N_HI; ln++) {
      const x = xMap(ln);
      ctx.beginPath(); ctx.moveTo(x, padT + plotH); ctx.lineTo(x, padT + plotH + 4); ctx.stroke();
      ctx.fillText(`10^${ln}`, x, padT + plotH + 18);
    }
    ctx.textAlign = 'right';
    for (let lp = P_LO; lp <= P_HI; lp++) {
      const y = yMap(lp);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL - 4, y); ctx.stroke();
      ctx.fillText(`10^${lp}`, padL - 8, y + 4);
    }
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('training set size  n  →', padL + plotW / 2, H - 12);
    ctx.save();
    ctx.translate(16, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('model parameters  p  ↑', 0, 0);
    ctx.restore();

    // region labels
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d24a5c';
    ctx.fillText('MEMORIZATION', xMap(2.15), yMap(7.7));
    ctx.fillStyle = '#2a9866';
    const dynLab_x = (n_boundary_log(7.0, tau) + n_star_log(7.0)) / 2;
    ctx.fillText('DYNAMICAL REG.', xMap(Math.max(2.8, Math.min(4.0, dynLab_x))), yMap(5.5));
    ctx.fillStyle = '#3683d6';
    ctx.fillText('ARCHITECTURAL', xMap(4.4), yMap(5.4));

    // user point
    const px = xMap(point.ln), py = yMap(point.lp);
    ctx.fillStyle = COLOR_LEARNED;
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();

    // readout
    labTau.textContent = `τ = ${tau.toFixed(1)} τ_gen`;
    const r = classify(point.ln, point.lp, tau);
    const nVal = Math.pow(10, point.ln), pVal = Math.pow(10, point.lp);
    let regimeName, regimeClass, explanation;
    if (r === 'mem') {
      regimeName = 'memorization';
      regimeClass = 'regime-mem';
      explanation = 'model has enough capacity to memorize, and training time is long enough to reach the empirical score.';
    } else if (r === 'dyn') {
      regimeName = 'dynamical regularization';
      regimeClass = 'regime-dyn';
      explanation = 'model could memorize given infinite training — but early stopping at this τ puts you in the safe window.';
    } else {
      regimeName = 'architectural regularization';
      regimeClass = 'regime-arch';
      explanation = 'too much data for this model size — even at τ → ∞ the model cannot fit the empirical score.';
    }

    readout.innerHTML = `
      <div>n ≈ <b>${nVal.toFixed(0)}</b> &nbsp; p ≈ <b>${pVal.toExponential(1)}</b></div>
      <div style="margin-top:6px;">regime: <span class="regime-badge ${regimeClass}">${regimeName}</span></div>
      <div style="margin-top:6px;font-size:12px;color:var(--fg-mute);line-height:1.45;">${explanation}</div>
    `;
  }

  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    const cssX = (e.clientX - rect.left) * (W / rect.width);
    const cssY = (e.clientY - rect.top) * (H / rect.height);
    const ln = xInv(cssX), lp = yInv(cssY);
    if (ln >= N_LO && ln <= N_HI && lp >= P_LO && lp <= P_HI) {
      point = { ln, lp };
      draw();
    }
  });

  slTau.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: MEMDETECTOR
 * Draggable "generated" point in 2D among 8 training points. Compute and
 * show the nearest-neighbor distance ratio.
 * ===================================================================== */
(function memDetector() {
  const host = document.getElementById('memdetector');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="mdCanvas"></canvas>
      <div class="controls">
        <div class="readout" id="mdReadout"></div>
        <div style="font-family:var(--sans);font-size:12px;color:var(--fg-mute);line-height:1.5;">
          A generated sample is flagged as <b>memorized</b> when its distance to the nearest training point is less than <code>k = 1/3</code> of its distance to the second nearest. Drag the orange dot to see the ratio change.
        </div>
        <button class="btn" id="mdReset">⟲ recenter point</button>
      </div>
    </div>
  `);

  const cv = host.querySelector('#mdCanvas');
  const W = 520, H = 360;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#mdReadout');
  const resetBtn = host.querySelector('#mdReset');

  // 8 deterministic training points (image space, 2D pretend)
  const TRAIN = [
    [120, 80], [280, 70], [420, 110],
    [80, 200], [240, 220], [430, 230],
    [160, 320], [360, 320],
  ];
  const startGen = { x: 250, y: 165 };
  let gen = { ...startGen };
  let dragging = false;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Bg dotted grid
    ctx.fillStyle = cssVar('--rule') || '#e6e4dd';
    for (let i = 0; i < W; i += 22) {
      for (let j = 0; j < H; j += 22) {
        ctx.fillRect(i, j, 1, 1);
      }
    }

    // distances
    const dists = TRAIN.map(p => ({ p, d: Math.hypot(gen.x - p[0], gen.y - p[1]) }));
    dists.sort((a, b) => a.d - b.d);
    const d1 = dists[0].d, d2 = dists[1].d;
    const ratio = d1 / Math.max(d2, 1e-6);
    const memorized = ratio < 1/3;

    // lines to nearest and second nearest
    ctx.lineWidth = 2;
    ctx.strokeStyle = memorized ? COLOR_MEM : COLOR_QUALITY;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(gen.x, gen.y); ctx.lineTo(dists[0].p[0], dists[0].p[1]); ctx.stroke();
    ctx.strokeStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(gen.x, gen.y); ctx.lineTo(dists[1].p[0], dists[1].p[1]); ctx.stroke();
    ctx.setLineDash([]);

    // training points
    for (let i = 0; i < TRAIN.length; i++) {
      const p = TRAIN[i];
      const isNear = (p === dists[0].p);
      const isSecond = (p === dists[1].p);
      ctx.fillStyle = isNear ? (memorized ? COLOR_MEM : COLOR_QUALITY)
                    : isSecond ? '#aab'
                    : cssVar('--fg-mute') || '#5a5a64';
      ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cssVar('--bg-elev') || '#fff';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${i + 1}`, p[0], p[1]);
      ctx.textBaseline = 'alphabetic';
    }

    // generated point
    ctx.fillStyle = COLOR_LEARNED;
    ctx.beginPath(); ctx.arc(gen.x, gen.y, 10, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(gen.x, gen.y, 10, 0, Math.PI * 2); ctx.stroke();

    // labels for distances
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = memorized ? COLOR_MEM : COLOR_QUALITY;
    ctx.fillText(`d₁ = ${d1.toFixed(0)}`, gen.x + 14, gen.y - 4);
    ctx.fillStyle = '#888';
    ctx.fillText(`d₂ = ${d2.toFixed(0)}`, gen.x + 14, gen.y + 12);

    // Legend / title
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = cssVar('--fg-mute') || '#5a5a64';
    ctx.fillText('training points', W - 10, 18);
    ctx.fillStyle = COLOR_LEARNED;
    ctx.fillText('● generated sample', W - 10, 34);

    // readout
    const pillCls = memorized ? 'mem-pill bad' : 'mem-pill ok';
    const pillTxt = memorized ? 'MEMORIZED' : 'NOVEL';
    readout.innerHTML = `
      <div>d₁ / d₂ = <b style="color:${memorized ? COLOR_MEM : COLOR_QUALITY}">${ratio.toFixed(3)}</b></div>
      <div>threshold k = <b>0.333</b></div>
      <div style="margin-top:6px;">status: <span class="${pillCls}">${pillTxt}</span></div>
    `;
  }

  function pos(e) {
    const rect = cv.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  }

  cv.addEventListener('mousedown', (e) => {
    const p = pos(e);
    if (Math.hypot(p.x - gen.x, p.y - gen.y) < 18) {
      dragging = true;
      cv.classList.add('dragging');
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const p = pos(e);
    gen.x = Math.max(15, Math.min(W - 15, p.x));
    gen.y = Math.max(15, Math.min(H - 15, p.y));
    draw();
  });
  window.addEventListener('mouseup', () => {
    dragging = false; cv.classList.remove('dragging');
  });
  // touch
  cv.addEventListener('touchstart', (e) => {
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    const p = pos(t);
    if (Math.hypot(p.x - gen.x, p.y - gen.y) < 30) {
      dragging = true; cv.classList.add('dragging');
      e.preventDefault();
    }
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => {
    if (!dragging || e.touches.length === 0) return;
    const t = e.touches[0];
    const p = pos(t);
    gen.x = Math.max(15, Math.min(W - 15, p.x));
    gen.y = Math.max(15, Math.min(H - 15, p.y));
    draw();
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchend', () => {
    dragging = false; cv.classList.remove('dragging');
  });

  resetBtn.addEventListener('click', () => {
    gen = { ...startGen };
    draw();
  });

  window.addEventListener('theme-changed', draw);
  draw();
})();
