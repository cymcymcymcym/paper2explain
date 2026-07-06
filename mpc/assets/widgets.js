/* mpc blog interactive widgets. Plain JS / Canvas. No deps.
 * One IIFE per widget; devicePx canvases; colors via CSS vars for theming.
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
    window.dispatchEvent(new Event('mpc-theme'));
  });
})();

/* ---------- helpers ---------- */
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
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function lerpColor(hex1, hex2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex1), b = p(hex2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
const BLUE = '#5fa9ff';
const RED = '#e05555';
const GOLD = '#e8b93c';
function onTheme(fn) { window.addEventListener('mpc-theme', fn); }

/* =====================================================================
 * Widget 1: lqr-lab — double integrator regulated by the exact LQR gain.
 * Sliders sweep Q and R; canvas shows position + control trajectories.
 * ===================================================================== */
(function lqrLab() {
  const host = document.getElementById('lqr-lab');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="lqrCanvas"></canvas>
      <div class="controls">
        <div><label>state cost $Q$: <span id="lqrQv"></span></label>
          <input type="range" id="lqrQ" min="-1" max="2" step="0.02" value="0.6"/></div>
        <div><label>control cost $R$: <span id="lqrRv"></span></label>
          <input type="range" id="lqrR" min="-2" max="1" step="0.02" value="-0.3"/></div>
        <div class="readout" id="lqrReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#lqrCanvas');
  const W = 680, H = 340;
  const ctx = devicePx(cv, W, H);
  const sQ = host.querySelector('#lqrQ'), sR = host.querySelector('#lqrR');
  const vQ = host.querySelector('#lqrQv'), vR = host.querySelector('#lqrRv');
  const readout = host.querySelector('#lqrReadout');

  const dt = 0.08;
  const A = [[1, dt], [0, 1]];
  const B = [0.5 * dt * dt, dt];
  let x0 = [1.6, 0];

  function lqrGain(q, r) {
    // iterate the discrete Riccati recursion to its fixed point
    let P = [[q, 0], [0, 0.3 * q]];
    const Q = [[q, 0], [0, 0.3 * q]];
    for (let i = 0; i < 400; i++) {
      const PA = [[P[0][0] * A[0][0] + P[0][1] * A[1][0], P[0][0] * A[0][1] + P[0][1] * A[1][1]],
                  [P[1][0] * A[0][0] + P[1][1] * A[1][0], P[1][0] * A[0][1] + P[1][1] * A[1][1]]];
      const AtPA = [[A[0][0] * PA[0][0] + A[1][0] * PA[1][0], A[0][0] * PA[0][1] + A[1][0] * PA[1][1]],
                    [A[0][1] * PA[0][0] + A[1][1] * PA[1][0], A[0][1] * PA[0][1] + A[1][1] * PA[1][1]]];
      const PB = [P[0][0] * B[0] + P[0][1] * B[1], P[1][0] * B[0] + P[1][1] * B[1]];
      const BtPB = B[0] * PB[0] + B[1] * PB[1];
      const BtPA = [B[0] * PA[0][0] + B[1] * PA[1][0], B[0] * PA[0][1] + B[1] * PA[1][1]];
      const s = 1 / (r + BtPB);
      const AtPB = [A[0][0] * PB[0] + A[1][0] * PB[1], A[0][1] * PB[0] + A[1][1] * PB[1]];
      P = [[Q[0][0] + AtPA[0][0] - s * AtPB[0] * BtPA[0], AtPA[0][1] - s * AtPB[0] * BtPA[1]],
           [AtPA[1][0] - s * AtPB[1] * BtPA[0], Q[1][1] + AtPA[1][1] - s * AtPB[1] * BtPA[1]]];
    }
    const PA = [[P[0][0] * A[0][0] + P[0][1] * A[1][0], P[0][0] * A[0][1] + P[0][1] * A[1][1]],
                [P[1][0] * A[0][0] + P[1][1] * A[1][0], P[1][0] * A[0][1] + P[1][1] * A[1][1]]];
    const PB = [P[0][0] * B[0] + P[0][1] * B[1], P[1][0] * B[0] + P[1][1] * B[1]];
    const BtPB = B[0] * PB[0] + B[1] * PB[1];
    const BtPA = [B[0] * PA[0][0] + B[1] * PA[1][0], B[0] * PA[0][1] + B[1] * PA[1][1]];
    const s = 1 / (r + BtPB);
    return [s * BtPA[0], s * BtPA[1]];
  }

  function simulate(K) {
    const N = 110;
    const pos = [], u = [];
    let x = x0.slice();
    for (let t = 0; t < N; t++) {
      const ut = -(K[0] * x[0] + K[1] * x[1]);
      pos.push(x[0]); u.push(ut);
      x = [A[0][0] * x[0] + A[0][1] * x[1] + B[0] * ut,
           A[1][0] * x[0] + A[1][1] * x[1] + B[1] * ut];
    }
    return { pos, u };
  }

  function panel(x, y, w, h, series, yr, color, label, zero) {
    const fg = cssVar('--fg-mute'), line = cssVar('--line');
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    if (zero !== undefined) {
      const zy = y + h * (1 - (0 - yr[0]) / (yr[1] - yr[0]));
      ctx.strokeStyle = line; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(x, zy); ctx.lineTo(x + w, zy); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2.2;
    ctx.beginPath();
    series.forEach((v, i) => {
      const px = x + (i / (series.length - 1)) * w;
      const py = y + h * (1 - (Math.max(yr[0], Math.min(yr[1], v)) - yr[0]) / (yr[1] - yr[0]));
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.fillStyle = fg; ctx.font = '12px sans-serif';
    ctx.fillText(label, x + 8, y + 16);
  }

  function draw() {
    const q = Math.pow(10, parseFloat(sQ.value));
    const r = Math.pow(10, parseFloat(sR.value));
    vQ.textContent = q.toFixed(q < 1 ? 2 : 1);
    vR.textContent = r.toFixed(r < 1 ? 2 : 1);
    const K = lqrGain(q, r);
    const { pos, u } = simulate(K);
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#c2571f';
    panel(46, 18, W - 76, 138, pos, [-2.2, 2.2], BLUE, 'position x(t)   — click to set a new start', 0);
    const umax = Math.max(1.2, ...u.map(Math.abs)) * 1.15;
    panel(46, 176, W - 76, 138, u, [-umax, umax], accent, 'control u(t) = −Kx(t)', 0);
    const eff = u.reduce((a, b) => a + b * b, 0) * dt;
    readout.innerHTML =
      `K = [<b>${K[0].toFixed(2)}</b>, <b>${K[1].toFixed(2)}</b>] &nbsp;·&nbsp; ` +
      `settle ≈ <b>${(pos.findIndex((p, i) => i > 4 && Math.abs(p) < 0.05 && Math.abs(u[i]) < 0.4) * dt < 0 ? 9 : Math.max(0, pos.findIndex((p, i) => i > 4 && Math.abs(p) < 0.05)) * dt).toFixed(1)}s</b>` +
      ` &nbsp;·&nbsp; control energy ∫u² = <b>${eff.toFixed(1)}</b>`;
  }

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const fy = (e.clientY - r.top) / r.height;
    x0 = [(0.5 - fy) * 4.4, 0];
    if (Math.abs(x0[0]) < 0.3) x0[0] = Math.sign(x0[0] || 1) * 0.3;
    draw();
  });
  sQ.addEventListener('input', draw);
  sR.addEventListener('input', draw);
  onTheme(draw);
  draw();
})();

/* =====================================================================
 * Shared MPPI planner for widgets 2 & 5 (and the same math as the manim).
 * Plans in 2-D displacement-control space around an obstacle.
 * ===================================================================== */
function mppiPlan(p, U, opts) {
  const { K, H, sigma, lambda, V, goal, obs, obsR } = opts;
  const eps = [];
  const paths = [];
  const costs = [];
  for (let k = 0; k < K; k++) {
    const e = [];
    let ex = 0, ey = 0;
    for (let t = 0; t < H; t++) {
      ex = 0.6 * ex + 0.9 * randn() * sigma;
      ey = 0.6 * ey + 0.9 * randn() * sigma;
      e.push([ex, ey]);
    }
    eps.push(e);
    const path = [[p[0], p[1]]];
    let cx = p[0], cy = p[1], cost = 0;
    for (let t = 0; t < H; t++) {
      let ux = U[t][0] + e[t][0], uy = U[t][1] + e[t][1];
      const m = Math.hypot(ux, uy);
      if (m > V * 1.25) { ux *= V * 1.25 / m; uy *= V * 1.25 / m; }
      cx += ux; cy += uy;
      path.push([cx, cy]);
      const dGoal = Math.hypot(cx - goal[0], cy - goal[1]);
      cost += 0.6 * dGoal;
      const dObs = Math.hypot(cx - obs[0], cy - obs[1]);
      const pen = Math.max(0, (obsR + 0.22) - dObs);
      cost += 900 * pen * pen;
      cost += 40 * Math.max(0, Math.abs(cy) - 2.9);
    }
    cost += 4 * Math.pow(Math.hypot(cx - goal[0], cy - goal[1]), 2);
    paths.push(path);
    costs.push(cost);
  }
  const cmin = Math.min(...costs);
  let wsum = 0;
  const w = costs.map(c => { const v = Math.exp(-(c - cmin) / lambda); wsum += v; return v; });
  for (let k = 0; k < K; k++) w[k] /= wsum;
  const Unew = U.map((u, t) => {
    let dx = 0, dy = 0;
    for (let k = 0; k < K; k++) { dx += w[k] * eps[k][t][0]; dy += w[k] * eps[k][t][1]; }
    let ux = u[0] + dx, uy = u[1] + dy;
    const m = Math.hypot(ux, uy);
    if (m > V) { ux *= V / m; uy *= V / m; }
    return [ux, uy];
  });
  return { Unew, paths, w };
}
function freshU(p, goal, H, V, frac) {
  const dx = goal[0] - p[0], dy = goal[1] - p[1];
  const d = Math.hypot(dx, dy) || 1e-9;
  const s = Math.min(V, d / (frac || 4));
  return Array.from({ length: H }, () => [dx / d * s, dy / d * s]);
}

/* =====================================================================
 * Widget 2: receding-horizon — open-loop vs MPC under disturbance,
 * with a horizon slider. The replanning loop made visible.
 * ===================================================================== */
(function recedingHorizon() {
  const host = document.getElementById('receding-horizon');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rhCanvas"></canvas>
      <div class="controls">
        <div class="seg">
          <button id="rhModeMPC" class="active">MPC (replan every step)</button>
          <button id="rhModeOL">open-loop (plan once)</button>
        </div>
        <div><label>horizon $H$: <span id="rhHv">16</span> steps</label>
          <input type="range" id="rhH" min="3" max="26" step="1" value="16"/></div>
        <div><label>disturbance: <span id="rhDv">0.12</span></label>
          <input type="range" id="rhD" min="0" max="0.3" step="0.01" value="0.12"/></div>
        <button id="rhRun" class="primary">run</button>
        <div class="readout" id="rhReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#rhCanvas');
  const W = 680, H_px = 340;
  const ctx = devicePx(cv, W, H_px);
  const sH = host.querySelector('#rhH'), sD = host.querySelector('#rhD');
  const vH = host.querySelector('#rhHv'), vD = host.querySelector('#rhDv');
  const btnRun = host.querySelector('#rhRun');
  const btnMPC = host.querySelector('#rhModeMPC'), btnOL = host.querySelector('#rhModeOL');
  const readout = host.querySelector('#rhReadout');

  const START = [-4.6, -1.6], GOAL = [4.6, 1.3], OBS = [0, 0.1], OBS_R = 1.05, V = 0.42;
  let mode = 'mpc';
  let timer = null;

  const w2x = (x) => (x + 5.4) / 10.8 * W;
  const w2y = (y) => H_px * 0.5 - y * (H_px / 7.2);

  function drawScene(executed, plan, crashed, atGoal, steps) {
    ctx.clearRect(0, 0, W, H_px);
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute');
    // obstacle + goal
    ctx.fillStyle = 'rgba(224,85,85,0.18)';
    ctx.strokeStyle = RED; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w2x(OBS[0]), w2y(OBS[1]), OBS_R * (W / 10.8), 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(w2x(GOAL[0]), w2y(GOAL[1]), 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mute; ctx.font = '12px sans-serif';
    ctx.fillText('goal', w2x(GOAL[0]) - 12, w2y(GOAL[1]) - 12);
    // plan tail
    if (plan) {
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      plan.forEach((p, i) => i === 0 ? ctx.moveTo(w2x(p[0]), w2y(p[1])) : ctx.lineTo(w2x(p[0]), w2y(p[1])));
      ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // executed path
    ctx.strokeStyle = BLUE; ctx.lineWidth = 3;
    ctx.beginPath();
    executed.forEach((p, i) => i === 0 ? ctx.moveTo(w2x(p[0]), w2y(p[1])) : ctx.lineTo(w2x(p[0]), w2y(p[1])));
    ctx.stroke();
    const last = executed[executed.length - 1];
    ctx.fillStyle = crashed ? RED : BLUE;
    ctx.beginPath(); ctx.arc(w2x(last[0]), w2y(last[1]), 6, 0, Math.PI * 2); ctx.fill();
    let status = `step <b>${steps}</b>`;
    if (crashed) status += ' &nbsp;·&nbsp; <b style="color:#e05555">hit the obstacle</b>';
    else if (atGoal) status += ' &nbsp;·&nbsp; <b>reached the goal</b>';
    readout.innerHTML = status;
  }

  function run() {
    if (timer) { clearInterval(timer); timer = null; }
    const Hn = parseInt(sH.value, 10);
    const dist = parseFloat(sD.value);
    const opts = { K: 60, H: Hn, sigma: 0.16, lambda: 6, V, goal: GOAL, obs: OBS, obsR: OBS_R };
    let p = START.slice();
    let U = freshU(p, GOAL, Hn, V, 4);
    const executed = [p.slice()];
    let steps = 0, crashed = false, done = false;
    // gusty crosswind: biased random walk
    let gust = 0;

    // open-loop: iterate the planner from the start state with a long horizon,
    // then execute the whole plan blind.
    let olPlan = null, olU = null;
    if (mode === 'ol') {
      const olH = 40;
      const olOpts = { ...opts, H: olH };
      olU = freshU(p, GOAL, olH, V, 1.2);
      for (let i = 0; i < 25; i++) olU = mppiPlan(p, olU, olOpts).Unew;
      olPlan = [[p[0], p[1]]];
      let cx = p[0], cy = p[1];
      olU.forEach(u => { cx += u[0]; cy += u[1]; olPlan.push([cx, cy]); });
    }

    timer = setInterval(() => {
      if (done) { clearInterval(timer); timer = null; return; }
      steps++;
      let u;
      let planViz = null;
      if (mode === 'mpc') {
        // two MPPI refinement passes on the warm-started plan, then act
        for (let i = 0; i < 2; i++) U = mppiPlan(p, U, opts).Unew;
        u = U[0];
        const tail = [[p[0], p[1]]];
        let cx = p[0], cy = p[1];
        U.forEach(uu => { cx += uu[0]; cy += uu[1]; tail.push([cx, cy]); });
        planViz = tail;
        // shift + re-anchor warm start
        U = U.slice(1).concat([U[U.length - 1]]);
        const fresh = freshU([p[0] + u[0], p[1] + u[1]], GOAL, Hn, V, 4);
        U = U.map((uu, t) => [0.55 * uu[0] + 0.45 * fresh[t][0], 0.55 * uu[1] + 0.45 * fresh[t][1]]);
      } else {
        u = steps - 1 < olU.length ? olU[steps - 1] : [0, 0];
        planViz = olPlan;
      }
      gust = 0.85 * gust + 0.5 * randn() * dist;
      p = [p[0] + u[0], p[1] + u[1] + gust + 0.3 * dist];
      executed.push(p.slice());
      if (Math.hypot(p[0] - OBS[0], p[1] - OBS[1]) < OBS_R) { crashed = true; done = true; }
      if (Math.hypot(p[0] - GOAL[0], p[1] - GOAL[1]) < 0.35) done = true;
      if (steps > 60) done = true;
      drawScene(executed, planViz, crashed, !crashed && done && steps <= 60, steps);
    }, 90);
  }

  btnMPC.addEventListener('click', () => { mode = 'mpc'; btnMPC.classList.add('active'); btnOL.classList.remove('active'); run(); });
  btnOL.addEventListener('click', () => { mode = 'ol'; btnOL.classList.add('active'); btnMPC.classList.remove('active'); run(); });
  sH.addEventListener('input', () => { vH.textContent = sH.value; });
  sD.addEventListener('input', () => { vD.textContent = parseFloat(sD.value).toFixed(2); });
  btnRun.addEventListener('click', run);
  onTheme(() => drawScene([START], null, false, false, 0));
  drawScene([START], null, false, false, 0);
})();

/* =====================================================================
 * Widget 3: landscape-race — gradient descent vs CEM on a 1-D cost.
 * Toggle smooth / cliffed / multimodal landscapes.
 * ===================================================================== */
(function landscapeRace() {
  const host = document.getElementById('landscape-race');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="lrCanvas"></canvas>
      <div class="controls">
        <div class="seg">
          <button id="lrSmooth" class="active">smooth</button>
          <button id="lrCliff">cliffed</button>
          <button id="lrMulti">multimodal</button>
        </div>
        <button id="lrRun" class="primary">run both</button>
        <div class="readout" id="lrReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#lrCanvas');
  const W = 680, H = 320;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#lrReadout');

  const FS = {
    smooth: (x) => 0.9 * Math.pow(x - 0.68, 2) * 4 + 0.05,
    cliff: (x) => {
      // plateau, then a cliff down into a narrow valley
      if (x < 0.45) return 0.62 + 0.04 * Math.sin(x * 30) * 0 + 0.0 * x;
      if (x < 0.5) return 0.62;
      return 0.12 + 3.2 * Math.pow(x - 0.7, 2);
    },
    multi: (x) => 0.55 - 0.32 * Math.exp(-Math.pow((x - 0.25) / 0.09, 2)) - 0.48 * Math.exp(-Math.pow((x - 0.72) / 0.05, 2)) + 0.25 * Math.pow(x - 0.5, 2),
  };
  let landscape = 'smooth';
  let timer = null;

  const x2px = (x) => 30 + x * (W - 60);
  const f2py = (v) => H - 40 - v * (H - 90);

  function state0() {
    return {
      gd: { x: 0.08, trail: [0.08], stuck: false },
      cem: { mu: 0.5, sigma: 0.28, iter: 0, samples: [], elites: [] },
      it: 0,
    };
  }
  let S = state0();

  function fp(x) { // numeric derivative
    const h = 1e-4;
    const f = FS[landscape];
    return (f(Math.min(1, x + h)) - f(Math.max(0, x - h))) / (2 * h);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const f = FS[landscape];
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute'), line = cssVar('--line');
    // curve
    ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const x = i / 400;
      const px = x2px(x), py = f2py(f(x));
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
    // CEM distribution band
    const { mu, sigma } = S.cem;
    ctx.fillStyle = 'rgba(95,169,255,0.14)';
    ctx.fillRect(x2px(Math.max(0, mu - 2 * sigma)), 18, x2px(Math.min(1, mu + 2 * sigma)) - x2px(Math.max(0, mu - 2 * sigma)), H - 58);
    ctx.strokeStyle = BLUE; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x2px(mu), 18); ctx.lineTo(x2px(mu), H - 40); ctx.stroke();
    ctx.setLineDash([]);
    // CEM samples + elites
    S.cem.samples.forEach(x => {
      ctx.fillStyle = 'rgba(140,140,150,0.55)';
      ctx.beginPath(); ctx.arc(x2px(x), f2py(f(x)), 3, 0, Math.PI * 2); ctx.fill();
    });
    S.cem.elites.forEach(x => {
      ctx.fillStyle = BLUE;
      ctx.beginPath(); ctx.arc(x2px(x), f2py(f(x)), 4, 0, Math.PI * 2); ctx.fill();
    });
    // GD trail + head
    ctx.strokeStyle = accent; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
    ctx.beginPath();
    S.gd.trail.forEach((x, i) => {
      const px = x2px(x), py = f2py(f(x));
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(x2px(S.gd.x), f2py(f(S.gd.x)), 6, 0, Math.PI * 2); ctx.fill();
    // legend
    ctx.font = '12.5px sans-serif';
    ctx.fillStyle = accent; ctx.fillText('● gradient descent', 40, 30);
    ctx.fillStyle = BLUE; ctx.fillText('● CEM samples + N(μ,σ) band', 40, 48);
    ctx.fillStyle = mute;
    const best = landscape === 'multi' ? 0.72 : (landscape === 'cliff' ? 0.7 : 0.68);
    ctx.fillText('global min', x2px(best) - 28, f2py(f(best)) + 22);
  }

  function step() {
    S.it++;
    // gradient descent step
    const g = fp(S.gd.x);
    if (Math.abs(g) < 1e-3 && FS[landscape](S.gd.x) > 0.2) S.gd.stuck = true;
    S.gd.x = Math.max(0.005, Math.min(0.995, S.gd.x - 0.045 * Math.sign(g) * Math.min(Math.abs(g), 3)));
    S.gd.trail.push(S.gd.x);
    // one CEM iteration
    const f = FS[landscape];
    const K = 26, M = 6;
    const samples = Array.from({ length: K }, () => Math.max(0, Math.min(1, S.cem.mu + randn() * S.cem.sigma)));
    const sorted = samples.slice().sort((a, b) => f(a) - f(b));
    const elites = sorted.slice(0, M);
    const mu = elites.reduce((a, b) => a + b, 0) / M;
    const sd = Math.sqrt(elites.reduce((a, b) => a + (b - mu) * (b - mu), 0) / M) + 0.004;
    S.cem = { mu, sigma: Math.min(sd, S.cem.sigma), iter: S.cem.iter + 1, samples, elites };
    draw();
    const gdV = f(S.gd.x), cemV = f(S.cem.mu);
    readout.innerHTML = `iter <b>${S.it}</b> &nbsp;·&nbsp; GD cost <b>${gdV.toFixed(3)}</b>${S.gd.stuck ? ' <span style="color:#e05555">(zero gradient — stuck)</span>' : ''} &nbsp;·&nbsp; CEM cost <b>${cemV.toFixed(3)}</b>`;
    if (S.it >= 30) { clearInterval(timer); timer = null; }
  }

  function run() {
    if (timer) { clearInterval(timer); timer = null; }
    S = state0();
    draw();
    timer = setInterval(step, 240);
  }

  [['lrSmooth', 'smooth'], ['lrCliff', 'cliff'], ['lrMulti', 'multi']].forEach(([id, name]) => {
    host.querySelector('#' + id).addEventListener('click', (e) => {
      landscape = name;
      host.querySelectorAll('.seg button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      run();
    });
  });
  host.querySelector('#lrRun').addEventListener('click', run);
  onTheme(draw);
  draw();
})();

/* =====================================================================
 * Widget 4: cem-lab — CEM contracting onto a 2-D multimodal landscape.
 * Sliders: population size, elite fraction. Step / auto / reset.
 * ===================================================================== */
(function cemLab() {
  const host = document.getElementById('cem-lab');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="cemCanvas"></canvas>
      <div class="controls">
        <div><label>population $K$: <span id="cemKv">40</span></label>
          <input type="range" id="cemK" min="8" max="150" step="1" value="40"/></div>
        <div><label>elite fraction: <span id="cemEv">15%</span></label>
          <input type="range" id="cemE" min="0.05" max="0.5" step="0.01" value="0.15"/></div>
        <button id="cemStep" class="primary">step</button>
        <button id="cemAuto">auto</button>
        <button id="cemReset">reset</button>
        <div class="readout" id="cemReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#cemCanvas');
  const W = 680, H = 380;
  const ctx = devicePx(cv, W, H);
  const sK = host.querySelector('#cemK'), sE = host.querySelector('#cemE');
  const vK = host.querySelector('#cemKv'), vE = host.querySelector('#cemEv');
  const readout = host.querySelector('#cemReadout');

  // cost: deep narrow global well + shallow wide local well
  const GLOB = [0.66, 0.42], LOC = [0.27, 0.68];
  function cost(x, y) {
    const g = Math.exp(-((x - GLOB[0]) ** 2 + (y - GLOB[1]) ** 2) / (2 * 0.055 ** 2));
    const l = Math.exp(-((x - LOC[0]) ** 2 + (y - LOC[1]) ** 2) / (2 * 0.13 ** 2));
    return 1 - 1.0 * g - 0.62 * l + 0.35 * ((x - 0.5) ** 2 + (y - 0.5) ** 2);
  }

  // heat map rendered once to an offscreen canvas
  const hm = document.createElement('canvas');
  const HMW = 170, HMH = 95;
  hm.width = HMW; hm.height = HMH;
  function renderHeat() {
    const hctx = hm.getContext('2d');
    const img = hctx.createImageData(HMW, HMH);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    let cmin = 1e9, cmax = -1e9;
    const vals = [];
    for (let j = 0; j < HMH; j++) for (let i = 0; i < HMW; i++) {
      const c = cost(i / (HMW - 1), j / (HMH - 1));
      vals.push(c); if (c < cmin) cmin = c; if (c > cmax) cmax = c;
    }
    for (let n = 0; n < vals.length; n++) {
      const t = 1 - (vals[n] - cmin) / (cmax - cmin);   // 1 = low cost
      const base = dark ? 22 : 246;
      const r = dark ? base + t * 200 : base - t * 60;
      const g = dark ? base + t * 110 : base - t * 130;
      const b = dark ? base + t * 40 : base - t * 190;
      img.data[n * 4] = r; img.data[n * 4 + 1] = g; img.data[n * 4 + 2] = b; img.data[n * 4 + 3] = 255;
    }
    hctx.putImageData(img, 0, 0);
  }

  let S;
  function reset() {
    S = { mu: [0.5, 0.52], sig: [0.24, 0.2], iter: 0, samples: [], elites: [] };
    draw();
    readout.innerHTML = 'iteration <b>0</b> — press step';
  }

  const px = (x) => x * W, py = (y) => y * H;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(hm, 0, 0, W, H);
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute');
    // wells
    ctx.font = '12px sans-serif'; ctx.fillStyle = mute;
    ctx.fillText('global min (narrow)', px(GLOB[0]) - 50, py(GLOB[1]) + 26);
    ctx.fillText('local min (wide)', px(LOC[0]) - 40, py(LOC[1]) + 32);
    // samples
    S.samples.forEach(s => {
      ctx.fillStyle = 'rgba(130,130,140,0.6)';
      ctx.beginPath(); ctx.arc(px(s[0]), py(s[1]), 3, 0, Math.PI * 2); ctx.fill();
    });
    S.elites.forEach(s => {
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(px(s[0]), py(s[1]), 4, 0, Math.PI * 2); ctx.fill();
    });
    // distribution ellipse (2σ)
    ctx.strokeStyle = BLUE; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px(S.mu[0]), py(S.mu[1]), 2 * S.sig[0] * W, 2 * S.sig[1] * H, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = BLUE;
    ctx.beginPath(); ctx.moveTo(px(S.mu[0]) - 7, py(S.mu[1])); ctx.lineTo(px(S.mu[0]) + 7, py(S.mu[1]));
    ctx.moveTo(px(S.mu[0]), py(S.mu[1]) - 7); ctx.lineTo(px(S.mu[0]), py(S.mu[1]) + 7);
    ctx.strokeStyle = BLUE; ctx.lineWidth = 2.4; ctx.stroke();
  }

  function step() {
    const K = parseInt(sK.value, 10);
    const eliteFrac = parseFloat(sE.value);
    const M = Math.max(2, Math.round(K * eliteFrac));
    const samples = Array.from({ length: K }, () => [
      Math.max(0.01, Math.min(0.99, S.mu[0] + randn() * S.sig[0])),
      Math.max(0.01, Math.min(0.99, S.mu[1] + randn() * S.sig[1])),
    ]);
    const sorted = samples.slice().sort((a, b) => cost(a[0], a[1]) - cost(b[0], b[1]));
    const elites = sorted.slice(0, M);
    const mu = [0, 1].map(d => elites.reduce((a, s) => a + s[d], 0) / M);
    const sig = [0, 1].map(d => Math.sqrt(elites.reduce((a, s) => a + (s[d] - mu[d]) ** 2, 0) / M) + 0.003);
    S = { mu, sig, iter: S.iter + 1, samples, elites };
    draw();
    const c = cost(mu[0], mu[1]);
    const nearGlobal = Math.hypot(mu[0] - GLOB[0], mu[1] - GLOB[1]) < 0.08;
    const nearLocal = Math.hypot(mu[0] - LOC[0], mu[1] - LOC[1]) < 0.1;
    readout.innerHTML = `iteration <b>${S.iter}</b> &nbsp;·&nbsp; μ cost <b>${c.toFixed(3)}</b> &nbsp;·&nbsp; σ ≈ <b>${((S.sig[0] + S.sig[1]) / 2).toFixed(3)}</b>` +
      (S.sig[0] < 0.02 ? (nearGlobal ? ' &nbsp;·&nbsp; <b>converged: global ✓</b>' : nearLocal ? ' &nbsp;·&nbsp; <b style="color:#e05555">collapsed onto the local min ✗</b>' : '') : '');
  }

  let auto = null;
  host.querySelector('#cemStep').addEventListener('click', step);
  host.querySelector('#cemAuto').addEventListener('click', (e) => {
    if (auto) { clearInterval(auto); auto = null; e.target.textContent = 'auto'; return; }
    e.target.textContent = 'stop';
    auto = setInterval(() => { step(); if (S.sig[0] < 0.015 || S.iter > 25) { clearInterval(auto); auto = null; e.target.textContent = 'auto'; } }, 500);
  });
  host.querySelector('#cemReset').addEventListener('click', reset);
  sK.addEventListener('input', () => { vK.textContent = sK.value; });
  sE.addEventListener('input', () => { vE.textContent = Math.round(parseFloat(sE.value) * 100) + '%'; });
  onTheme(() => { renderHeat(); draw(); });
  renderHeat();
  reset();
})();

/* =====================================================================
 * Widget 5: mppi-lab — one MPPI planning tick; λ slider sweeps the
 * weighting from argmax (cold) to uniform average (hot).
 * ===================================================================== */
(function mppiLab() {
  const host = document.getElementById('mppi-lab');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="mppiCanvas"></canvas>
      <div class="controls">
        <div><label>temperature $\\lambda$: <span id="mppiLv">6.0</span></label>
          <input type="range" id="mppiL" min="-1.3" max="2.2" step="0.02" value="0.78"/></div>
        <button id="mppiResample" class="primary">resample noise</button>
        <div class="readout" id="mppiReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#mppiCanvas');
  const W = 680, H_px = 360;
  const ctx = devicePx(cv, W, H_px);
  const sL = host.querySelector('#mppiL');
  const vL = host.querySelector('#mppiLv');
  const readout = host.querySelector('#mppiReadout');

  const START = [-4.6, -1.4], GOAL = [4.6, 1.2], OBS = [0, 0.0], OBS_R = 1.05, V = 0.55, Hn = 16, K = 60;
  const w2x = (x) => (x + 5.4) / 10.8 * W;
  const w2y = (y) => H_px * 0.5 - y * (H_px / 7.0);

  // fixed noise bank so λ is the ONLY thing changing between slider moves
  let bank = null;
  function resample() {
    bank = [];
    for (let k = 0; k < K; k++) {
      const e = [];
      let ex = 0, ey = 0;
      for (let t = 0; t < Hn; t++) {
        ex = 0.6 * ex + 0.9 * randn() * 0.2;
        ey = 0.6 * ey + 0.9 * randn() * 0.2;
        e.push([ex, ey]);
      }
      bank.push(e);
    }
  }

  function rolloutAndScore() {
    const U = freshU(START, GOAL, Hn, V, 2.2);
    const paths = [], costs = [];
    for (let k = 0; k < K; k++) {
      const path = [[START[0], START[1]]];
      let cx = START[0], cy = START[1], cost = 0;
      for (let t = 0; t < Hn; t++) {
        let ux = U[t][0] + bank[k][t][0], uy = U[t][1] + bank[k][t][1];
        const m = Math.hypot(ux, uy);
        if (m > V * 1.3) { ux *= V * 1.3 / m; uy *= V * 1.3 / m; }
        cx += ux; cy += uy;
        path.push([cx, cy]);
        cost += 0.6 * Math.hypot(cx - GOAL[0], cy - GOAL[1]);
        const dObs = Math.hypot(cx - OBS[0], cy - OBS[1]);
        const pen = Math.max(0, (OBS_R + 0.22) - dObs);
        cost += 900 * pen * pen;
      }
      cost += 4 * Math.pow(Math.hypot(cx - GOAL[0], cy - GOAL[1]), 2);
      paths.push(path); costs.push(cost);
    }
    return { U, paths, costs };
  }

  function draw() {
    const lambda = Math.pow(10, parseFloat(sL.value));
    vL.textContent = lambda >= 10 ? lambda.toFixed(0) : lambda.toFixed(2);
    const { U, paths, costs } = rolloutAndScore();
    const cmin = Math.min(...costs);
    let wsum = 0;
    const w = costs.map(c => { const v = Math.exp(-(c - cmin) / lambda); wsum += v; return v; });
    for (let k = 0; k < K; k++) w[k] /= wsum;
    const wmax = Math.max(...w);
    const ess = 1 / w.reduce((a, b) => a + b * b, 0);

    ctx.clearRect(0, 0, W, H_px);
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute');
    // obstacle + goal + start
    ctx.fillStyle = 'rgba(224,85,85,0.18)';
    ctx.strokeStyle = RED; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(w2x(OBS[0]), w2y(OBS[1]), OBS_R * (W / 10.8), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(w2x(GOAL[0]), w2y(GOAL[1]), 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = BLUE;
    ctx.beginPath(); ctx.arc(w2x(START[0]), w2y(START[1]), 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mute; ctx.font = '12px sans-serif';
    ctx.fillText('start', w2x(START[0]) - 12, w2y(START[1]) + 22);
    ctx.fillText('goal', w2x(GOAL[0]) - 12, w2y(GOAL[1]) - 12);
    // rollouts, low weight first
    const order = w.map((v, k) => k).sort((a, b) => w[a] - w[b]);
    order.forEach(k => {
      const t = Math.pow(w[k] / wmax, 0.5);
      ctx.strokeStyle = lerpColor('#7a7d88', accent.startsWith('#') ? accent : '#c2571f', t);
      ctx.globalAlpha = 0.25 + 0.65 * t;
      ctx.lineWidth = 1 + 2 * t;
      ctx.beginPath();
      paths[k].forEach((p, i) => i === 0 ? ctx.moveTo(w2x(p[0]), w2y(p[1])) : ctx.lineTo(w2x(p[0]), w2y(p[1])));
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // weighted-average plan
    const plan = [[START[0], START[1]]];
    let cx = START[0], cy = START[1];
    for (let t = 0; t < Hn; t++) {
      let ux = U[t][0], uy = U[t][1];
      for (let k = 0; k < K; k++) { ux += w[k] * bank[k][t][0]; uy += w[k] * bank[k][t][1]; }
      cx += ux; cy += uy;
      plan.push([cx, cy]);
    }
    ctx.strokeStyle = accent; ctx.lineWidth = 4;
    ctx.beginPath();
    plan.forEach((p, i) => i === 0 ? ctx.moveTo(w2x(p[0]), w2y(p[1])) : ctx.lineTo(w2x(p[0]), w2y(p[1])));
    ctx.stroke();
    // does the plan hit the obstacle?
    const clips = plan.some(p => Math.hypot(p[0] - OBS[0], p[1] - OBS[1]) < OBS_R);
    let regime;
    if (ess < 2.5) regime = 'cold: argmax on one rollout — brittle';
    else if (ess > K * 0.6) regime = 'hot: averaging everything — plan ignores cost' + (clips ? ' (and clips the obstacle!)' : '');
    else regime = 'consensus of the good rollouts';
    readout.innerHTML = `effective samples <b>${ess.toFixed(1)}</b> / ${K} &nbsp;·&nbsp; max weight <b>${wmax.toFixed(2)}</b> &nbsp;·&nbsp; ${regime}`;
  }

  sL.addEventListener('input', draw);
  host.querySelector('#mppiResample').addEventListener('click', () => { resample(); draw(); });
  onTheme(draw);
  resample();
  draw();
})();
