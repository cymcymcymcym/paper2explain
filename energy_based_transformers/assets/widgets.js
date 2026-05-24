/* Energy-Based Transformers blog — interactive widgets. Plain JS / Canvas. No deps.
 * Widgets:
 *   1. energy-descent      — roll a candidate prediction downhill on a learned landscape
 *   2. self-verification   — best-of-N: launch many starts, keep the lowest-energy one
 *   3. uncertainty-tokens  — easy vs hard tokens give smooth vs rugged landscapes
 *   4. thinking-payoff     — scaling inference compute helps EBTs (not feed-forward)
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
    // redraw all widgets so colors follow the theme
    window.dispatchEvent(new Event('eb-theme'));
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
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// Map a 1-D energy landscape (domain y, range E) into canvas pixels.
function landscapeMap(W, H, dom, er, pad) {
  const [y0, y1] = dom, [e0, e1] = er;
  const L = pad.l, R = W - pad.r, T = pad.t, B = H - pad.b;
  return {
    L, R, T, B,
    px: (y) => L + (y - y0) / (y1 - y0) * (R - L),
    py: (e) => B - (clamp(e, e0, e1) - e0) / (e1 - e0) * (B - T),
    x2y: (xp) => y0 + (xp - L) / (R - L) * (y1 - y0),
  };
}
function drawGrid(ctx, m, dom) {
  ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
  for (let g = Math.ceil(dom[0]); g <= dom[1]; g++) {
    ctx.beginPath(); ctx.moveTo(m.px(g), m.T); ctx.lineTo(m.px(g), m.B); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = cssVar('--fg-mute'); ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(m.L, m.B); ctx.lineTo(m.R, m.B); ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawCurve(ctx, m, Efn, dom, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width || 3; ctx.beginPath();
  const n = 260; let first = true;
  for (let i = 0; i <= n; i++) {
    const y = dom[0] + (dom[1] - dom[0]) * i / n;
    const X = m.px(y), Y = m.py(Efn(y));
    if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
  }
  ctx.stroke();
}
function axisLabels(ctx, m, xlabel, ylabel) {
  ctx.fillStyle = cssVar('--fg-mute');
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(xlabel, (m.L + m.R) / 2, m.B + 22);
  ctx.save();
  ctx.translate(m.L - 26, (m.T + m.B) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText(ylabel, 0, 0);
  ctx.restore();
}

/* =====================================================================
 * Widget 1: energy-descent
 * Click to drop a random guess; gradient descent rolls it to the minimum.
 * ===================================================================== */
(function energyDescent() {
  const host = document.getElementById('energy-descent');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="edCanvas"></canvas>
      <div class="controls">
        <div class="eb-ctl">
          <label>step size &alpha; = <span class="val" id="edAlphaV">1.00</span></label>
          <input type="range" id="edAlpha" min="0.05" max="3" step="0.05" value="1.0"/>
        </div>
        <div class="eb-ctl">
          <label>think steps N = <span class="val" id="edNV">8</span></label>
          <input type="range" id="edN" min="1" max="20" step="1" value="8"/>
        </div>
        <div class="eb-row">
          <button class="btn" id="edLang">+ Langevin noise</button>
        </div>
        <div class="eb-row">
          <button class="btn active" id="edThink">&#9654; think</button>
          <button class="btn" id="edRand">&#8635; random init</button>
        </div>
        <div class="readout" id="edRead"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#edCanvas');
  const W = 470, H = 320, ctx = devicePx(cv, W, H);
  const dom = [-4, 4], er = [0, 7];
  const m = landscapeMap(W, H, dom, er, { l: 40, r: 14, t: 16, b: 30 });
  const E = (y) => 0.6 + 0.24 * (y - 1) * (y - 1);
  const dE = (y) => 0.48 * (y - 1);
  const yMin = 1.0;

  const aS = host.querySelector('#edAlpha'), nS = host.querySelector('#edN');
  const aV = host.querySelector('#edAlphaV'), nV = host.querySelector('#edNV');
  const read = host.querySelector('#edRead');
  const langBtn = host.querySelector('#edLang');

  let y0 = -3.1, lang = false, timer = null, traj = [], idx = 0;
  const ACC = () => cssVar('--accent');
  const DATA = '#5fa9ff';

  function ball(y, big) {
    const X = m.px(y), Y = m.py(E(y));
    if (big) {
      ctx.fillStyle = ACC();
      ctx.beginPath(); ctx.arc(X, Y, 8, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(X - 2, Y - 2, 3, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = ACC();
      ctx.beginPath(); ctx.arc(X, Y, 6, 0, 7); ctx.fill();
    }
  }
  function target() {
    const X = m.px(yMin), Y = m.py(E(yMin));
    ctx.strokeStyle = DATA; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(X, Y, 9, 0, 7); ctx.stroke();
    ctx.fillStyle = DATA;
    ctx.beginPath(); ctx.arc(X, Y, 2.5, 0, 7); ctx.fill();
  }
  function scene(y, label) {
    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, m, dom);
    drawCurve(ctx, m, E, dom, cssVar('--fg-mute'), 3);
    target();
    ball(y, true);
    axisLabels(ctx, m, 'candidate prediction  ŷ', 'energy  E(x, ŷ)');
    read.innerHTML = label;
  }
  function idleRead(y) {
    return `guess  ŷ&#8320; = <b>${y.toFixed(2)}</b><br>energy E = <b>${E(y).toFixed(2)}</b><br><span style="color:var(--fg-mute)">press think to roll downhill</span>`;
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function think() {
    stop();
    const alpha = parseFloat(aS.value), N = parseInt(nS.value);
    traj = [y0]; let y = y0;
    for (let i = 0; i < N; i++) {
      y = y - alpha * dE(y) + (lang ? randn() * 0.22 : 0);
      y = clamp(y, -4, 4);
      traj.push(y);
    }
    idx = 0;
    timer = setInterval(() => {
      idx++;
      const y = traj[idx];
      scene(y, `think step <b>${idx}/${N}</b><br>ŷ = <b>${y.toFixed(2)}</b> &nbsp; E = <b>${E(y).toFixed(2)}</b>`);
      if (idx >= traj.length - 1) {
        stop();
        const conv = Math.abs(E(y) - E(yMin)) < 0.08;
        const tail = conv
          ? '<span style="color:#5fa9ff">low energy → converged, compatible ✓</span>'
          : '<span style="color:var(--accent)">not converged — give it more steps</span>';
        read.innerHTML = `done after <b>${N}</b> steps<br>final E = <b>${E(y).toFixed(2)}</b> (min ≈ ${E(yMin).toFixed(2)})<br>${tail}`;
      }
    }, 200);
  }

  aS.addEventListener('input', () => { aV.textContent = parseFloat(aS.value).toFixed(2); if (!timer) scene(y0, idleRead(y0)); });
  nS.addEventListener('input', () => { nV.textContent = nS.value; });
  langBtn.addEventListener('click', () => { lang = !lang; langBtn.classList.toggle('active', lang); });
  host.querySelector('#edThink').addEventListener('click', think);
  host.querySelector('#edRand').addEventListener('click', () => { stop(); y0 = -3.5 + Math.random() * 7; scene(y0, idleRead(y0)); });
  cv.addEventListener('click', (e) => {
    stop();
    const r = cv.getBoundingClientRect();
    const xp = (e.clientX - r.left) / r.width * W;
    y0 = clamp(m.x2y(xp), -3.9, 3.9);
    scene(y0, idleRead(y0));
  });
  window.addEventListener('eb-theme', () => { if (!timer) scene(y0, idleRead(y0)); });

  scene(y0, idleRead(y0));
})();

/* =====================================================================
 * Widget 2: self-verification (best-of-N)
 * Launch N random starts on a rugged landscape; keep the lowest energy.
 * ===================================================================== */
(function selfVerification() {
  const host = document.getElementById('self-verification');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="svCanvas"></canvas>
      <div class="controls">
        <div class="eb-ctl">
          <label>candidates N = <span class="val" id="svNV">5</span></label>
          <input type="range" id="svN" min="1" max="12" step="1" value="5"/>
        </div>
        <div class="eb-row">
          <button class="btn active" id="svGo">&#9654; launch N starts</button>
        </div>
        <div class="readout" id="svRead"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#svCanvas');
  const W = 470, H = 320, ctx = devicePx(cv, W, H);
  const dom = [-4, 4], er = [0.7, 3.6];
  const m = landscapeMap(W, H, dom, er, { l: 40, r: 14, t: 16, b: 30 });
  const E = (y) => 1.7 + 0.10 * (y - 0.3) * (y - 0.3) + 0.62 * Math.cos(2.1 * y);
  const dE = (y) => (E(y + 1e-3) - E(y - 1e-3)) / 2e-3;
  const GLOBAL_Y = 1.485, GLOBAL_E = E(1.485);

  const nS = host.querySelector('#svN'), nV = host.querySelector('#svNV');
  const read = host.querySelector('#svRead');
  let timer = null, balls = [], step = 0, winner = -1, settled = false;
  const ACC = () => cssVar('--accent');
  const DATA = '#5fa9ff';

  function dot(y, rad, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(m.px(y), m.py(E(y)), rad, 0, 7); ctx.fill();
  }
  function scene() {
    ctx.clearRect(0, 0, W, H);
    drawGrid(ctx, m, dom);
    drawCurve(ctx, m, E, dom, cssVar('--fg-mute'), 3);
    // faint marker on the true global minimum
    ctx.strokeStyle = DATA; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(m.px(GLOBAL_Y), m.py(GLOBAL_E), 11, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    balls.forEach((y, i) => {
      if (settled && i === winner) return;
      dot(y, 5, ACC());
    });
    if (settled && winner >= 0) {
      const y = balls[winner];
      ctx.strokeStyle = DATA; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(m.px(y), m.py(E(y)), 11, 0, 7); ctx.stroke();
      dot(y, 7, DATA);
    }
    axisLabels(ctx, m, 'candidate prediction  ŷ', 'energy  E(x, ŷ)');
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function go() {
    stop();
    const N = parseInt(nS.value);
    balls = Array.from({ length: N }, () => -3.6 + Math.random() * 7.2);
    step = 0; winner = -1; settled = false;
    scene();
    read.innerHTML = `descending <b>${N}</b> candidate${N > 1 ? 's' : ''}…`;
    timer = setInterval(() => {
      step++;
      for (let i = 0; i < balls.length; i++) {
        balls[i] = clamp(balls[i] - 0.5 * dE(balls[i]), -3.95, 3.95);
      }
      scene();
      if (step >= 26) {
        stop();
        settled = true;
        const energies = balls.map(E);
        winner = energies.indexOf(Math.min(...energies));
        scene();
        const bestE = energies[winner];
        const foundGlobal = Math.abs(bestE - GLOBAL_E) < 0.12;
        const sorted = energies.slice().sort((a, b) => a - b).map(e => e.toFixed(2)).join(', ');
        read.innerHTML =
          `energies: <span style="color:var(--fg-mute)">${sorted}</span><br>` +
          `kept lowest = <b>${bestE.toFixed(2)}</b> at ŷ = <b>${balls[winner].toFixed(2)}</b><br>` +
          `global min ≈ ${GLOBAL_E.toFixed(2)} at ŷ ≈ ${GLOBAL_Y.toFixed(1)}<br>` +
          (foundGlobal
            ? '<span style="color:#5fa9ff">found the global minimum ✓</span>'
            : '<span style="color:var(--accent)">stuck in a local min — try more N</span>');
      }
    }, 70);
  }

  nS.addEventListener('input', () => { nV.textContent = nS.value; });
  host.querySelector('#svGo').addEventListener('click', go);
  window.addEventListener('eb-theme', scene);
  go();
})();

/* =====================================================================
 * Widget 3: uncertainty-tokens
 * Easy tokens → deep smooth well (fast, low energy = confident).
 * Hard tokens → rugged shallow landscape (energy stays high = uncertain).
 * ===================================================================== */
(function uncertaintyTokens() {
  const host = document.getElementById('uncertainty-tokens');
  if (!host) return;
  const TOKENS = [
    { t: '“the”', type: 'easy', c: 0.6, ph: 0 },
    { t: '“.”', type: 'easy', c: -0.4, ph: 1 },
    { t: '“quick”', type: 'hard', ph: 0.4 },
    { t: '“problem”', type: 'hard', ph: 2.1 },
  ];
  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="utPick">
      ${TOKENS.map((tk, i) => `<button class="btn${i === 0 ? ' active' : ''}" data-i="${i}">${tk.t}</button>`).join('')}
    </div>
    <div class="body">
      <canvas id="utCanvas"></canvas>
      <div class="controls">
        <div class="readout" id="utRead"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#utCanvas');
  const W = 470, H = 320, ctx = devicePx(cv, W, H);
  const read = host.querySelector('#utRead');
  // landscape panel (top) + convergence panel (bottom)
  const ldom = [-4, 4], ler = [0, 7];
  const lm = landscapeMap(W, 190, ldom, ler, { l: 40, r: 14, t: 14, b: 26 });
  const maxStep = 22;
  const ACC = () => cssVar('--accent');
  const DATA = '#5fa9ff';

  function mkE(tk) {
    if (tk.type === 'easy') {
      const c = tk.c;
      return (y) => 0.35 + 0.55 * (y - c) * (y - c);
    }
    const ph = tk.ph;
    return (y) => 2.35 + 0.13 * (y - 0.2) * (y - 0.2) + 0.72 * Math.cos(2.3 * y + ph);
  }

  let cur = 0, timer = null, hist = [], y = 0, stepi = 0, Efn = mkE(TOKENS[0]);

  function convPanel() {
    const T = 214, B = 304, L = 40, R = W - 14;
    return {
      T, B, L, R,
      px: (s) => L + s / maxStep * (R - L),
      py: (e) => B - clamp(e, 0, 7) / 7 * (B - T),
    };
  }
  function scene() {
    ctx.clearRect(0, 0, W, H);
    // ---- landscape ----
    drawGrid(ctx, lm, ldom);
    drawCurve(ctx, lm, Efn, ldom, cssVar('--fg-mute'), 3);
    ctx.fillStyle = ACC();
    ctx.beginPath(); ctx.arc(lm.px(y), lm.py(Efn(y)), 7, 0, 7); ctx.fill();
    ctx.fillStyle = cssVar('--fg-mute'); ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('energy landscape over ŷ', lm.L, lm.T - 2);
    // ---- convergence curve ----
    const cm = convPanel();
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(cm.L, cm.B); ctx.lineTo(cm.R, cm.B); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cm.L, cm.T); ctx.lineTo(cm.L, cm.B); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--fg-mute'); ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('energy vs think-step', cm.L, cm.T - 4);
    ctx.strokeStyle = ACC(); ctx.lineWidth = 2.5; ctx.beginPath();
    hist.forEach((e, i) => {
      const X = cm.px(i), Y = cm.py(e);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    });
    ctx.stroke();
    if (hist.length) {
      const i = hist.length - 1;
      ctx.fillStyle = ACC();
      ctx.beginPath(); ctx.arc(cm.px(i), cm.py(hist[i]), 3.5, 0, 7); ctx.fill();
    }
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function run(i) {
    stop();
    cur = i;
    const tk = TOKENS[i];
    Efn = mkE(tk);
    const dE = (yy) => (Efn(yy + 1e-3) - Efn(yy - 1e-3)) / 2e-3;
    const easy = tk.type === 'easy';
    y = -3.2 + Math.random() * 0.4;
    hist = [Efn(y)]; stepi = 0;
    scene();
    timer = setInterval(() => {
      stepi++;
      const noise = easy ? 0 : randn() * 0.06;
      y = clamp(y - (easy ? 0.5 : 0.42) * dE(y) + noise, -3.9, 3.9);
      hist.push(Efn(y));
      scene();
      const fE = Efn(y);
      if (easy) {
        read.innerHTML = `token ${tk.t} <span style="color:var(--fg-mute)">(easy)</span><br>step <b>${stepi}</b> &nbsp; E = <b>${fE.toFixed(2)}</b><br><span style="color:#5fa9ff">deep smooth well → drops fast, low energy = <b>confident</b></span>`;
      } else {
        read.innerHTML = `token ${tk.t} <span style="color:var(--fg-mute)">(hard)</span><br>step <b>${stepi}</b> &nbsp; E = <b>${fE.toFixed(2)}</b><br><span style="color:var(--accent)">rugged & shallow → energy stays high = <b>uncertain</b></span>`;
      }
      if (stepi >= maxStep) {
        stop();
        setTimeout(() => { if (cur === i) run(i); }, 1100);
      }
    }, 150);
  }

  host.querySelectorAll('#utPick .btn').forEach((b) => {
    b.addEventListener('click', () => {
      host.querySelectorAll('#utPick .btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      run(parseInt(b.dataset.i));
    });
  });
  window.addEventListener('eb-theme', scene);
  run(0);
})();

/* =====================================================================
 * Widget 4: thinking-payoff
 * Scale inference forward passes; EBT error falls (more so OOD), baseline flat.
 * ===================================================================== */
(function thinkingPayoff() {
  const host = document.getElementById('thinking-payoff');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="tpCanvas"></canvas>
      <div class="controls">
        <div class="eb-ctl">
          <label>forward passes (NFEs) = <span class="val" id="tpNV">8</span></label>
          <input type="range" id="tpN" min="1" max="32" step="1" value="8"/>
        </div>
        <div class="eb-ctl">
          <label>out-of-distribution shift = <span class="val" id="tpOV">2.5</span></label>
          <input type="range" id="tpO" min="1" max="4.5" step="0.1" value="2.5"/>
        </div>
        <div class="readout" id="tpRead"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#tpCanvas');
  const W = 470, H = 320, ctx = devicePx(cv, W, H);
  const nMax = 32, TPP = 38;
  const m = {
    L: 46, R: W - 14, T: 18, B: H - 32,
    px: (n) => 46 + (n - 1) / (nMax - 1) * (W - 14 - 46),
    py: (e) => (H - 32) - (clamp(e, 26, 40) - 26) / (40 - 26) * (H - 32 - 18),
  };
  const nS = host.querySelector('#tpN'), oS = host.querySelector('#tpO');
  const nV = host.querySelector('#tpNV'), oV = host.querySelector('#tpOV');
  const read = host.querySelector('#tpRead');
  const ACC = () => cssVar('--accent');
  const DATA = '#5fa9ff';

  const impFrac = (ood) => 0.07 * ood;                       // larger gains further OOD
  const ebt = (n, ood) => TPP * (1 - impFrac(ood) * (1 - 1 / Math.sqrt(n)));

  function draw() {
    const n = parseInt(nS.value), ood = parseFloat(oS.value);
    ctx.clearRect(0, 0, W, H);
    // grid + axes
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    for (let g = 0; g <= 4; g++) { const yy = m.py(26 + g * 3.5); ctx.beginPath(); ctx.moveTo(m.L, yy); ctx.lineTo(m.R, yy); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--fg-mute'); ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(m.L, m.B); ctx.lineTo(m.R, m.B); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m.L, m.T); ctx.lineTo(m.L, m.B); ctx.stroke();
    ctx.globalAlpha = 1;

    // Transformer++ flat line
    ctx.strokeStyle = cssVar('--fg-mute'); ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(m.px(1), m.py(TPP)); ctx.lineTo(m.px(nMax), m.py(TPP)); ctx.stroke();
    ctx.setLineDash([]);

    // EBT curve
    ctx.strokeStyle = ACC(); ctx.lineWidth = 3; ctx.beginPath();
    for (let k = 1; k <= nMax; k++) {
      const X = m.px(k), Y = m.py(ebt(k, ood));
      if (k === 1) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    // operating-point markers + gap
    const eE = ebt(n, ood);
    const xN = m.px(n);
    ctx.strokeStyle = DATA; ctx.lineWidth = 1; ctx.globalAlpha = 0.6; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xN, m.T); ctx.lineTo(xN, m.B); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.beginPath(); ctx.arc(xN, m.py(TPP), 5, 0, 7); ctx.fill();
    ctx.fillStyle = ACC();
    ctx.beginPath(); ctx.arc(xN, m.py(eE), 6, 0, 7); ctx.fill();

    // labels
    ctx.fillStyle = cssVar('--fg-mute'); ctx.font = '11px sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('inference forward passes (NFEs) →', (m.L + m.R) / 2, m.B + 22);
    ctx.save(); ctx.translate(m.L - 32, (m.T + m.B) / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillText('error  (perplexity, ↓)', 0, 0); ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = ACC(); ctx.fillText('● EBT', m.R - 120, m.T + 12);
    ctx.fillStyle = cssVar('--fg-mute'); ctx.fillText('-- Transformer++', m.R - 120, m.T + 28);

    const pct = (impFrac(ood) * (1 - 1 / Math.sqrt(n)) * 100);
    read.innerHTML =
      `at <b>${n}</b> forward pass${n > 1 ? 'es' : ''}:<br>` +
      `EBT error = <b>${eE.toFixed(1)}</b><br>` +
      `Transformer++ = <b>${TPP.toFixed(1)}</b> <span style="color:var(--fg-mute)">(flat)</span><br>` +
      `thinking gain = <b>${pct.toFixed(1)}%</b><br>` +
      `<span style="color:var(--fg-mute)">farther OOD ⇒ steeper EBT payoff</span>`;
  }
  nS.addEventListener('input', () => { nV.textContent = nS.value; draw(); });
  oS.addEventListener('input', () => { oV.textContent = parseFloat(oS.value).toFixed(1); draw(); });
  window.addEventListener('eb-theme', draw);
  draw();
})();
