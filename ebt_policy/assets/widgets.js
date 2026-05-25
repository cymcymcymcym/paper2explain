/* EBT-Policy blog interactive widgets. Plain JS / Canvas. No deps.
 * Widgets, in reading order:
 *   1. score-energy    — two views of the same landscape (∇log p = −∇E)
 *   2. energy-descent  — Langevin gradient descent with adaptive stopping
 *   3. steps-compare   — success vs inference-step budget, DP vs EBT
 *   4. retry-sim       — emergent retry: re-descend from OOD vs diffusion divergence
 */

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
    document.dispatchEvent(new Event('themechange'));
  });
})();

/* ---------- canvas + math helpers ---------- */
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
function randn() {
  const u = 1 - Math.random(), v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function hexA(hex, a) {
  hex = (hex || '#888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function lerpColor(hex1, hex2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex1), b = p(hex2);
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)}, ${Math.round(a[1]+(b[1]-a[1])*t)}, ${Math.round(a[2]+(b[2]-a[2])*t)})`;
}
function drawArrow(ctx, x1, y1, x2, y2, color, width = 2) {
  if (Math.hypot(x2 - x1, y2 - y1) < 1.5) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.translate(x2, y2); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -3.5); ctx.lineTo(-7, 3.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Semantic colors shared with the manim animation.
const BLUE = '#5fa9ff';   // the energy landscape
const RED = '#ff5d5d';    // failure / high energy
const GREEN = '#5fd08a';  // converged / low energy

/* =====================================================================
 * Widget 1: SCORE vs ENERGY
 * The same multimodal landscape. EBT outputs the height E(a); diffusion
 * outputs the slope −E'(a). Toggle which one you "see."
 * ===================================================================== */
(function scoreEnergy() {
  const host = document.getElementById('score-energy');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="seCanvas" width="460" height="300"></canvas>
      <div class="controls">
        <div class="toggle-row">
          <button class="btn active" id="seModeE">EBT sees: energy E</button>
          <button class="btn" id="seModeS">Diffusion sees: score −E′</button>
        </div>
        <div>
          <label>probe position&nbsp;&nbsp;a</label>
          <input type="range" id="seProbe" min="-1" max="1" step="0.01" value="-0.5"/>
        </div>
        <div class="readout" id="seReadout"></div>
        <p class="hint">Same landscape, two outputs. An EBT returns the <b>height</b> — one number you can compare. Diffusion returns the <b>slope</b> — a direction to step. They satisfy ∇log p = −∇E.</p>
      </div>
    </div>`);

  const cv = host.querySelector('#seCanvas');
  const ctx = devicePx(cv, 460, 300);
  const W = 460, H = 300;
  const probe = host.querySelector('#seProbe');
  const readout = host.querySelector('#seReadout');
  const mE = host.querySelector('#seModeE'), mS = host.querySelector('#seModeS');
  let mode = 'E';
  mE.onclick = () => { mode = 'E'; mE.classList.add('active'); mS.classList.remove('active'); draw(); };
  mS.onclick = () => { mode = 'S'; mS.classList.add('active'); mE.classList.remove('active'); draw(); };

  const A_LO = -1, A_HI = 1;
  const Efn = (a) => 1.25 - Math.exp(-(((a + 0.5) / 0.22) ** 2)) - 0.85 * Math.exp(-(((a - 0.55) / 0.27) ** 2));
  const dE = (a) => { const h = 1e-3; return (Efn(a + h) - Efn(a - h)) / (2 * h); };

  const M = { l: 40, r: 16, t: 20, b: 38 };
  let emin = Infinity, emax = -Infinity;
  for (let a = A_LO; a <= A_HI; a += 0.005) { const e = Efn(a); if (e < emin) emin = e; if (e > emax) emax = e; }
  const erng = emax - emin;
  const px = (a) => M.l + (a - A_LO) / (A_HI - A_LO) * (W - M.l - M.r);
  const py = (e) => M.t + (emax - e) / erng * (H - M.t - M.b);

  function draw() {
    const a = parseFloat(probe.value);
    const acc = cssVar('--accent') || '#ff9b6a';
    const mute = cssVar('--fg-mute') || '#999';
    ctx.clearRect(0, 0, W, H);

    // baseline (action axis)
    const baseY = H - M.b;
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(M.l, baseY); ctx.lineTo(W - M.r, baseY); ctx.stroke();

    if (mode === 'E') {
      // fill under curve
      ctx.fillStyle = hexA(BLUE, 0.10);
      ctx.beginPath(); ctx.moveTo(px(A_LO), baseY);
      for (let a2 = A_LO; a2 <= A_HI + 1e-9; a2 += 0.01) ctx.lineTo(px(a2), py(Efn(a2)));
      ctx.lineTo(px(A_HI), baseY); ctx.closePath(); ctx.fill();
    }
    // curve
    ctx.strokeStyle = BLUE; ctx.lineWidth = mode === 'E' ? 3 : 1.5;
    ctx.globalAlpha = mode === 'E' ? 1 : 0.45;
    ctx.beginPath(); let first = true;
    for (let a2 = A_LO; a2 <= A_HI + 1e-9; a2 += 0.004) {
      const X = px(a2), Y = py(Efn(a2));
      if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
    }
    ctx.stroke(); ctx.globalAlpha = 1;

    if (mode === 'E') {
      const X = px(a), Y = py(Efn(a));
      ctx.strokeStyle = mute; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(X, baseY); ctx.lineTo(X, Y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(M.l, Y); ctx.lineTo(X, Y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, 7); ctx.fill();
      ctx.font = '600 12px sans-serif'; ctx.fillStyle = acc; ctx.textAlign = 'left';
      ctx.fillText('E = ' + Efn(a).toFixed(2), X + 9, Y - 7);
    } else {
      // score field: arrows along baseline pointing −E′ (downhill in probability)
      for (let a2 = A_LO + 0.07; a2 < A_HI; a2 += 0.13) {
        const s = -dE(a2);
        const len = Math.max(-44, Math.min(44, s * 15));
        drawArrow(ctx, px(a2), baseY, px(a2) + len, baseY, hexA(acc, 0.5), 2);
      }
      // probe: big arrow + dot on curve
      const X = px(a), Y = py(Efn(a)), s = -dE(a);
      const big = Math.max(-58, Math.min(58, s * 15));
      drawArrow(ctx, X, baseY, X + big, baseY, acc, 3.5);
      ctx.strokeStyle = mute; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X, baseY); ctx.lineTo(X, Y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(X, Y, 5, 0, 7); ctx.fill();
    }

    ctx.fillStyle = mute; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('action  a', (M.l + W - M.r) / 2, H - 8);
    ctx.textAlign = 'left'; ctx.fillText(mode === 'E' ? 'energy E' : 'score field −E′', M.l, 13);

    const e = Efn(a), s = -dE(a);
    readout.innerHTML = `
      <div>probe a = <b>${a.toFixed(2)}</b></div>
      <div style="color:var(--accent)">EBT output · E(a) = <b>${e.toFixed(2)}</b> <span style="color:var(--fg-mute)">scalar</span></div>
      <div style="color:#5fa9ff">Diffusion · −E′(a) = <b>${s >= 0 ? '+' : ''}${s.toFixed(2)}</b> <span style="color:var(--fg-mute)">direction</span></div>`;
  }
  probe.addEventListener('input', draw);
  document.addEventListener('themechange', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: ENERGY-DESCENT PLAYGROUND
 * Click to drop a noise init; Langevin gradient descent rolls it downhill.
 * Stops itself when ‖∇E‖ < τ (adaptive / dynamic inference).
 * ===================================================================== */
(function energyDescent() {
  const host = document.getElementById('energy-descent');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="edCanvas" width="460" height="320"></canvas>
      <div class="controls">
        <div><label>step size&nbsp;&nbsp;η</label><input type="range" id="edEta" min="0.025" max="0.16" step="0.005" value="0.08"/></div>
        <div><label>Langevin noise&nbsp;&nbsp;σ</label><input type="range" id="edSigma" min="0" max="0.18" step="0.005" value="0.06"/></div>
        <div class="toggle-row">
          <button class="btn active" id="edAnneal">cosine-anneal σ</button>
          <button class="btn" id="edReseed">↻ new init</button>
        </div>
        <div class="toggle-row">
          <button class="btn" id="edRun">▶ descend</button>
        </div>
        <div class="readout" id="edReadout"></div>
        <p class="hint">Click the canvas to drop a noise init. More σ escapes shallow minima but jitters; bigger η is faster but overshoots. The run stops when ‖∇E‖ &lt; τ — that's §5's dynamic inference.</p>
      </div>
    </div>`);

  const cv = host.querySelector('#edCanvas');
  const ctx = devicePx(cv, 460, 320);
  const W = 460, H = 320;
  const etaS = host.querySelector('#edEta');
  const sigS = host.querySelector('#edSigma');
  const annealBtn = host.querySelector('#edAnneal');
  const reseedBtn = host.querySelector('#edReseed');
  const runBtn = host.querySelector('#edRun');
  const readout = host.querySelector('#edReadout');

  const X_LO = -4, X_HI = 4, TAU = 0.07, MAXS = 40;
  const g = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
  const Efn = (x) => 1.5 - 1.7 * g(x, 1.1, 0.55) - 0.7 * g(x, -1.9, 0.55) - 0.5 * g(x, -0.4, 0.35) + 0.05 * x * x;
  const dE = (x) => { const h = 1e-3; return (Efn(x + h) - Efn(x - h)) / (2 * h); };

  const M = { l: 30, r: 16, t: 18, b: 34 };
  let emin = Infinity, emax = -Infinity;
  for (let x = X_LO; x <= X_HI; x += 0.01) { const e = Efn(x); if (e < emin) emin = e; if (e > emax) emax = e; }
  const px = (x) => M.l + (x - X_LO) / (X_HI - X_LO) * (W - M.l - M.r);
  const py = (e) => M.t + (emax - e) / (emax - emin) * (H - M.t - M.b);

  let anneal = true;
  annealBtn.onclick = () => { anneal = !anneal; annealBtn.classList.toggle('active', anneal); };

  let x0 = -3.2, trail = [], cur = null, vel = 0, step = 0, gnorm = Infinity, timer = null, status = 'ready';

  function reset(keepX0) {
    if (timer) { clearInterval(timer); timer = null; }
    if (!keepX0) x0 = X_LO + 0.4 + Math.random() * (X_HI - X_LO - 0.8);
    cur = x0; vel = 0; step = 0; gnorm = Math.abs(dE(cur)); trail = [cur]; status = 'ready';
    runBtn.textContent = '▶ descend'; runBtn.disabled = false;
    draw();
  }
  reseedBtn.onclick = () => reset(false);

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const X = (e.clientX - r.left) * (W / r.width);
    let xv = X_LO + (X - M.l) / (W - M.l - M.r) * (X_HI - X_LO);
    xv = Math.max(X_LO + 0.1, Math.min(X_HI - 0.1, xv));
    x0 = xv; reset(true);
  });

  function run() {
    if (timer) return;
    reset(true);
    const eta = parseFloat(etaS.value), sig = parseFloat(sigS.value), beta = 0.9;
    status = 'descending'; runBtn.textContent = '…'; runBtn.disabled = true;
    timer = setInterval(() => {
      const look = cur + beta * vel;
      const grad = dE(look);
      vel = beta * vel - eta * grad;
      const st = anneal ? sig * 0.5 * (1 + Math.cos(Math.PI * step / MAXS)) : sig;
      cur = cur + vel + randn() * st;
      cur = Math.max(X_LO, Math.min(X_HI, cur));
      step++;
      gnorm = Math.abs(dE(cur));
      trail.push(cur);
      draw();
      if ((gnorm < TAU && step > 2) || step >= MAXS) {
        clearInterval(timer); timer = null;
        status = step >= MAXS ? `stopped at max ${MAXS}` : `converged in ${step} steps`;
        runBtn.textContent = '▶ descend'; runBtn.disabled = false;
        draw();
      }
    }, 70);
  }
  runBtn.onclick = run;

  function draw() {
    const acc = cssVar('--accent') || '#ff9b6a';
    const mute = cssVar('--fg-mute') || '#999';
    ctx.clearRect(0, 0, W, H);
    // curve
    ctx.strokeStyle = BLUE; ctx.lineWidth = 3;
    ctx.beginPath(); let first = true;
    for (let x = X_LO; x <= X_HI + 1e-9; x += 0.01) {
      const X = px(x), Y = py(Efn(x));
      if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    // trail
    if (trail.length > 1) {
      ctx.strokeStyle = hexA(acc, 0.55); ctx.lineWidth = 2;
      ctx.beginPath();
      trail.forEach((x, i) => { const X = px(x), Y = py(Efn(x)); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.stroke();
      ctx.fillStyle = hexA(acc, 0.5);
      trail.forEach((x) => { ctx.beginPath(); ctx.arc(px(x), py(Efn(x)), 2.2, 0, 7); ctx.fill(); });
    }
    // init marker
    ctx.strokeStyle = mute; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(px(x0), M.t); ctx.lineTo(px(x0), H - M.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = mute; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('init', px(x0), M.t - 4);
    // current ball
    if (cur != null) {
      const converged = status.startsWith('converged');
      ctx.fillStyle = converged ? GREEN : acc;
      ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(px(cur), py(Efn(cur)), 6.5, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = mute; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('E', M.l - 4, M.t + 4); ctx.textAlign = 'right';
    ctx.fillText('action-trajectory space  z', W - M.r, H - 8);

    const conv = status.startsWith('converged');
    readout.innerHTML = `
      <div>step <b>${step}</b> / ${MAXS}</div>
      <div>E = <b>${(cur != null ? Efn(cur) : Efn(x0)).toFixed(3)}</b></div>
      <div>‖∇E‖ = <b style="color:${gnorm < TAU ? 'var(--accent)' : 'inherit'}">${gnorm.toFixed(3)}</b> <span style="color:var(--fg-mute)">(τ = ${TAU})</span></div>
      <div style="margin-top:4px;color:${conv ? GREEN : 'var(--fg-mute)'}">${status}</div>`;
  }
  document.addEventListener('themechange', draw);
  reset(true);
})();

/* =====================================================================
 * Widget 3: STEPS-COMPARE
 * Sweep the inference-step budget; watch per-task success for DP vs EBT.
 * Anchored to the paper's numbers (Table 4): DP needs ~100 steps; EBT ~2.
 * ===================================================================== */
(function stepsCompare() {
  const host = document.getElementById('steps-compare');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="stCanvas" width="480" height="300"></canvas>
      <div class="controls">
        <div><label>inference steps&nbsp;&nbsp;n = <b id="stN">2</b></label>
          <input type="range" id="stSlider" min="1" max="100" step="1" value="2"/></div>
        <p class="legend">
          <span class="swatch" style="background:#8a8f9a;"></span>Diffusion Policy
          <span class="swatch" style="background:var(--accent);"></span>EBT-Policy
        </p>
        <div class="readout" id="stReadout"></div>
        <p class="hint">Diffusion Policy collapses to 0% below ~20 steps and needs ~100 to peak. EBT-Policy is already near its ceiling at n = 2 — that gap is the 50× story.</p>
      </div>
    </div>`);

  const cv = host.querySelector('#stCanvas');
  const ctx = devicePx(cv, 480, 300);
  const W = 480, H = 300;
  const slider = host.querySelector('#stSlider');
  const nLbl = host.querySelector('#stN');
  const readout = host.querySelector('#stReadout');

  const tasks = ['Lift', 'Can', 'Square', 'Tool Hang'];
  const dpMax = [100, 100, 92, 44];
  const ebtMax = [100, 100, 98, 68];
  const dp = (n, i) => dpMax[i] / (1 + Math.exp(-(n - 50) / 9));
  const ebt = (n, i) => ebtMax[i] * (1 - Math.exp(-n / 0.8));

  const M = { l: 34, r: 12, t: 16, b: 42 };
  const plotH = H - M.t - M.b, plotW = W - M.l - M.r;
  const y0 = H - M.b;

  function draw() {
    const n = parseInt(slider.value);
    nLbl.textContent = n;
    const acc = cssVar('--accent') || '#ff9b6a';
    const mute = cssVar('--fg-mute') || '#999';
    const dpc = '#8a8f9a';
    ctx.clearRect(0, 0, W, H);

    // gridlines + axis
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1; ctx.fillStyle = mute;
    ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let v = 0; v <= 100; v += 25) {
      const Y = y0 - v / 100 * plotH;
      ctx.beginPath(); ctx.moveTo(M.l, Y); ctx.lineTo(W - M.r, Y); ctx.stroke();
      ctx.fillText(v + '%', M.l - 4, Y + 3);
    }

    const groupW = plotW / tasks.length;
    const bw = groupW * 0.3;
    tasks.forEach((t, i) => {
      const gx = M.l + groupW * (i + 0.5);
      const dpv = dp(n, i), ebv = ebt(n, i);
      // DP bar
      ctx.fillStyle = dpc;
      ctx.fillRect(gx - bw - 3, y0 - dpv / 100 * plotH, bw, dpv / 100 * plotH);
      // EBT bar
      ctx.fillStyle = acc;
      ctx.fillRect(gx + 3, y0 - ebv / 100 * plotH, bw, ebv / 100 * plotH);
      // task label
      ctx.fillStyle = mute; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(t, gx, H - M.b + 16);
      // value labels
      ctx.font = '9px sans-serif';
      if (dpv > 4) { ctx.fillStyle = mute; ctx.fillText(Math.round(dpv), gx - bw / 2 - 3, y0 - dpv / 100 * plotH - 3); }
      if (ebv > 4) { ctx.fillStyle = acc; ctx.fillText(Math.round(ebv), gx + bw / 2 + 3, y0 - ebv / 100 * plotH - 3); }
    });

    ctx.fillStyle = mute; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`success rate at n = ${n} inference steps`, (M.l + W - M.r) / 2, 11);

    const avgDp = dpMax.map((_, i) => dp(n, i)).reduce((a, b) => a + b, 0) / 4;
    const avgEb = ebtMax.map((_, i) => ebt(n, i)).reduce((a, b) => a + b, 0) / 4;
    readout.innerHTML = `
      <div>avg success</div>
      <div style="color:#8a8f9a">Diffusion · <b>${avgDp.toFixed(0)}%</b></div>
      <div style="color:var(--accent)">EBT-Policy · <b>${avgEb.toFixed(0)}%</b></div>
      ${n <= 2 ? `<div style="margin-top:5px;color:${GREEN}">at n = ${n}: EBT works, DP is dead.</div>` : ''}`;
  }
  slider.addEventListener('input', draw);
  document.addEventListener('themechange', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: RETRY-SIM
 * Knock the agent out-of-distribution. EBT re-descends energy (retry);
 * a diffusion policy keeps following its schedule and diverges.
 * Timeline strip below shows per-step energy as a green→red color bar.
 * ===================================================================== */
(function retrySim() {
  const host = document.getElementById('retry-sim');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="picker">
      <button class="btn active" data-mode="ebt">EBT-Policy</button>
      <button class="btn" data-mode="dp">Diffusion Policy</button>
    </div>
    <canvas id="rsCanvas" width="600" height="360"></canvas>
    <div class="controls">
      <button class="btn" id="rsKnock">⚡ knock OOD</button>
      <button class="btn" id="rsReset">↻ reset</button>
      <div class="readout" id="rsReadout" style="flex:1; min-width:160px;"></div>
    </div>`);

  const cv = host.querySelector('#rsCanvas');
  const ctx = devicePx(cv, 600, 360);
  const W = 600, H = 360;
  const knockBtn = host.querySelector('#rsKnock');
  const resetBtn = host.querySelector('#rsReset');
  const readout = host.querySelector('#rsReadout');

  const X_LO = -4, X_HI = 4;
  const g = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));
  const Efn = (x) => 1.5 - 1.7 * g(x, 1.1, 0.55) - 0.7 * g(x, -1.9, 0.55) - 0.5 * g(x, -0.4, 0.35) + 0.05 * x * x;
  const dE = (x) => { const h = 1e-3; return (Efn(x + h) - Efn(x - h)) / (2 * h); };

  // landscape region (top) + timeline strip (bottom)
  const M = { l: 28, r: 14, t: 28, b: 90 };
  let emin = Infinity, emax = -Infinity;
  for (let x = X_LO; x <= X_HI; x += 0.01) { const e = Efn(x); if (e < emin) emin = e; if (e > emax) emax = e; }
  const erng = emax - emin;
  const px = (x) => M.l + (x - X_LO) / (X_HI - X_LO) * (W - M.l - M.r);
  const py = (e) => M.t + (emax - e) / erng * (H - M.t - M.b);
  const stripY = H - M.b + 22, stripH = 26;

  let mode = 'ebt';
  let cur = 1.1, vel = 0, hist = [], timer = null, status = 'in distribution', phase = 'idle';

  function reset() {
    if (timer) { clearInterval(timer); timer = null; }
    cur = 1.1; vel = 0; phase = 'idle'; status = 'in distribution · executing';
    hist = [Efn(cur), Efn(cur), Efn(cur), Efn(cur)];
    knockBtn.disabled = false;
    draw();
  }
  resetBtn.onclick = reset;

  host.querySelectorAll('.picker .btn').forEach(b => {
    b.onclick = () => {
      host.querySelectorAll('.picker .btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); mode = b.dataset.mode; reset();
    };
  });

  function knock() {
    if (timer) return;
    cur = 2.9; vel = 0; hist.push(Efn(cur));
    phase = 'recover'; knockBtn.disabled = true;
    status = mode === 'ebt' ? 'OOD! re-descending…' : 'OOD! following schedule…';
    let step = 0;
    const MAXS = 26;
    timer = setInterval(() => {
      if (mode === 'ebt') {
        // descend energy from anywhere → equilibrium dynamics pull it back
        const beta = 0.88, eta = 0.075;
        const grad = dE(cur + beta * vel);
        vel = beta * vel - eta * grad;
        cur = Math.max(X_LO, Math.min(X_HI, cur + vel));
      } else {
        // diffusion: no verifier; keep applying the nominal in-distribution delta,
        // which is wrong now → drift further OOD.
        cur = Math.min(X_HI, cur + 0.085 + 0.03 * Math.sin(step));
      }
      step++; hist.push(Efn(cur));
      if (hist.length > 60) hist.shift();
      draw();
      const settled = mode === 'ebt' && Math.abs(dE(cur)) < 0.07 && step > 3;
      if (settled || step >= MAXS) {
        clearInterval(timer); timer = null; phase = 'done';
        status = mode === 'ebt' ? 'recovered ✓ — retried, never trained to' : 'diverged ✗ — compounding error';
        knockBtn.disabled = false; draw();
      }
    }, 75);
  }
  knockBtn.onclick = knock;

  function draw() {
    const acc = cssVar('--accent') || '#ff9b6a';
    const mute = cssVar('--fg-mute') || '#999';
    ctx.clearRect(0, 0, W, H);

    // landscape
    ctx.strokeStyle = BLUE; ctx.lineWidth = 3;
    ctx.beginPath(); let first = true;
    for (let x = X_LO; x <= X_HI + 1e-9; x += 0.01) {
      const X = px(x), Y = py(Efn(x));
      if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    // basin marker
    ctx.fillStyle = hexA(GREEN, 0.7); ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('valid-action basin', px(1.1), py(Efn(1.1)) + 22);

    // agent
    const ood = cur > 1.9;
    ctx.fillStyle = phase === 'done' ? (mode === 'ebt' ? GREEN : RED) : (ood ? RED : acc);
    ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px(cur), py(Efn(cur)), 8, 0, 7); ctx.fill(); ctx.stroke();

    ctx.fillStyle = mute; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('energy E', M.l - 6, M.t - 10);
    ctx.textAlign = 'right'; ctx.fillText('action-trajectory space  z', W - M.r, M.t - 10);

    // energy timeline strip
    ctx.fillStyle = mute; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('per-step energy  (green = low / certain, red = high / failed)', M.l, stripY - 8);
    const n = hist.length, cellW = (W - M.l - M.r) / Math.max(n, 30);
    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(1, (hist[i] - emin) / erng));
      ctx.fillStyle = lerpColor('#5fd08a', '#ff5d5d', t);
      ctx.fillRect(M.l + i * cellW, stripY, Math.ceil(cellW) - 0.5, stripH);
    }
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1;
    ctx.strokeRect(M.l, stripY, n * cellW, stripH);

    const done = phase === 'done';
    const col = done ? (mode === 'ebt' ? GREEN : RED) : mute;
    readout.innerHTML = `<div style="color:${col}"><b>${status}</b></div>
      <div style="color:var(--fg-mute)">E = ${Efn(cur).toFixed(2)} &middot; ‖∇E‖ = ${Math.abs(dE(cur)).toFixed(2)}</div>`;
  }
  document.addEventListener('themechange', draw);
  reset();
})();
