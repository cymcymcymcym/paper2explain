/* TTT-Discover blog — interactive widgets. Plain JS / Canvas. No deps.
 * Conventions:
 *   - One IIFE per widget; always check `host` exists first.
 *   - devicePx() for crisp 2x canvases that draw with fillRect/stroke/text.
 *   - cssVar() so widgets follow the light/dark theme.
 *   - Each widget registers its draw fn so a theme switch repaints it.
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
    window.dispatchEvent(new Event('ttd-theme'));
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
const SANS = '-apple-system, "Helvetica Neue", Arial, sans-serif';
function lerpColor(hex1, hex2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex1), b = p(hex2);
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)}, ${Math.round(a[1]+(b[1]-a[1])*t)}, ${Math.round(a[2]+(b[2]-a[2])*t)})`;
}
function mkRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const BLUE = '#5fa9ff';
const GREEN = '#66bb6a';
const LN2 = Math.log(2);

/* =====================================================================
 * Widget 1: THE ENTROPIC OBJECTIVE
 * 16 attempts with rewards. Slide β; the gradient's per-attempt weights
 * move from a flat average (plain RL) to a spike on the single best.
 * ===================================================================== */
(function entropicWidget() {
  const host = document.getElementById('entropic-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="entCanvas" width="480" height="320"></canvas></div>
      <div class="controls">
        <div>
          <label class="ctl-label">inverse temperature  β = <b id="entBetaVal">0.0</b></label>
          <input type="range" id="entBeta" min="0" max="1" step="0.004" value="0"/>
        </div>
        <div class="picker">
          <button class="btn mini" id="entAuto">auto-β · KL = ln 2</button>
          <button class="btn mini" id="entResample">resample attempts</button>
        </div>
        <div class="readout" id="entReadout"></div>
        <p class="hint">
          β = 0 is ordinary RL: every attempt pulls the gradient equally. Crank β up and the gradient
          chases only the best attempts. <b>auto-β</b> stops at a fixed KL budget — the paper's choice.
        </p>
      </div>
    </div>
  `);

  const W = 480, H = 320;
  const cv = host.querySelector('#entCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#entBeta');
  const betaVal = host.querySelector('#entBetaVal');
  const readout = host.querySelector('#entReadout');
  const N = 16, BETA_MAX = 36;
  let rewards = [];

  function genRewards(seed) {
    const rand = mkRng(seed);
    const r = [];
    for (let i = 0; i < N; i++) r.push(0.30 + 0.42 * rand());
    // plant a clear discovery and a runner-up
    r[(rand() * N) | 0] = 0.82 + 0.13 * rand();
    let j = (rand() * N) | 0;
    if (r[j] < 0.7) r[j] = 0.64 + 0.08 * rand();
    return r;
  }
  rewards = genRewards(1217);

  const sliderToBeta = (s) => s * s * BETA_MAX;
  const betaToSlider = (b) => Math.min(1, Math.sqrt(Math.max(0, b) / BETA_MAX));

  // entropic weights, tilted distribution q, soft-max objective
  function compute(beta) {
    const mx = Math.max(...rewards);
    const mean = rewards.reduce((a, b) => a + b, 0) / N;
    const g = rewards.map(r => Math.exp(beta * (r - mx)));   // shifted for stability
    const sumg = g.reduce((a, b) => a + b, 0);
    const meang = sumg / N;
    const w = g.map(v => v / meang);                          // E[w] = 1
    const q = g.map(v => v / sumg);                           // tilted dist, sums to 1
    let kl = 0;
    for (const qi of q) if (qi > 1e-12) kl += qi * Math.log(N * qi);
    const J = beta < 1e-6 ? mean : mx + Math.log(meang) / beta; // certainty equivalent
    return { mean, mx, w, q, kl, J };
  }
  function autoBeta() {
    let lo = 0, hi = 400;
    for (let it = 0; it < 80; it++) {
      const mid = (lo + hi) / 2;
      if (compute(mid).kl < LN2) lo = mid; else hi = mid;
    }
    return lo;
  }

  function panel(x0, x1, yTop, yBase, vals, scaleMax, accent, baseLine, baseLabel) {
    const fgMute = cssVar('--fg-mute'), rule = cssVar('--rule');
    const bg = cssVar('--bg-card');
    const slot = (x1 - x0) / N, bw = slot * 0.58;
    // baseline reference
    if (baseLine != null) {
      const by = yBase - (baseLine / scaleMax) * (yBase - yTop);
      ctx.strokeStyle = lerpColor(bg, fgMute, 0.85);
      ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x0, by); ctx.lineTo(x1, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = fgMute; ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(baseLabel, x0 + 2, by - 4);
    }
    const mxIdx = rewards.indexOf(Math.max(...rewards));
    for (let i = 0; i < N; i++) {
      const cx = x0 + (i + 0.5) * slot;
      const h = Math.max(0, Math.min(1, vals[i] / scaleMax)) * (yBase - yTop);
      ctx.fillStyle = i === mxIdx ? GREEN : accent;
      ctx.fillRect(cx - bw / 2, yBase - h, bw, h);
    }
    ctx.strokeStyle = rule; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, yBase); ctx.lineTo(x1, yBase); ctx.stroke();
  }

  function draw() {
    const beta = sliderToBeta(parseFloat(slider.value));
    const { mean, mx, w, q, kl, J } = compute(beta);
    const fg = cssVar('--fg'), fgMute = cssVar('--fg-mute'), bg = cssVar('--bg-card');

    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';

    // panel A — rewards
    ctx.fillStyle = fgMute; ctx.font = '600 11px ' + SANS;
    ctx.fillText('16 ATTEMPTS — reward R(s, a)', 44, 22);
    panel(44, 460, 40, 148, rewards, 1.0, lerpColor(bg, BLUE, 0.92), mean, 'mean reward');

    // panel B — entropic weights
    ctx.fillStyle = fgMute; ctx.font = '600 11px ' + SANS;
    ctx.fillText('GRADIENT WEIGHT  w' + 'β' + '(a) — how hard each attempt is imitated', 44, 178);
    const maxW = Math.max(...w);
    const scaleW = Math.max(1.75, maxW * 1.07);
    panel(44, 460, 210, 304, w, scaleW, cssVar('--accent'), 1.0, 'w = 1  (baseline)');

    betaVal.textContent = beta.toFixed(1);
    const frac = mx > mean + 1e-6 ? (J - mean) / (mx - mean) : 0;
    const klPct = Math.min(100, (kl / LN2) * 100);
    readout.innerHTML =
      `mean reward&nbsp;&nbsp;<b>${mean.toFixed(3)}</b>&nbsp; <span style="color:${fgMute}">← plain RL maximizes this</span><br>` +
      `max reward&nbsp;&nbsp;&nbsp;<b class="good">${mx.toFixed(3)}</b>&nbsp; <span style="color:${fgMute}">← a discovery needs this</span><br>` +
      `objective J<sub>β</sub>&nbsp;&nbsp;<b>${J.toFixed(3)}</b>&nbsp; <span style="color:${fgMute}">(${Math.round(frac * 100)}% of the way mean → max)</span><br>` +
      `KL(q ‖ uniform)&nbsp;&nbsp;<b>${kl.toFixed(3)}</b> / ${LN2.toFixed(3)} budget&nbsp; <span style="color:${fgMute}">[${klPct.toFixed(0)}%]</span><br>` +
      `best attempt's pull&nbsp;&nbsp;<b>${maxW.toFixed(2)}×</b>&nbsp; <span style="color:${fgMute}">(every attempt is 1.0× at β = 0)</span>`;
  }

  slider.addEventListener('input', draw);
  host.querySelector('#entAuto').addEventListener('click', () => {
    slider.value = betaToSlider(autoBeta()); draw();
  });
  host.querySelector('#entResample').addEventListener('click', () => {
    rewards = genRewards((Math.random() * 1e9) | 0); draw();
  });
  window.addEventListener('ttd-theme', draw);
  // open on the paper's adaptive choice
  slider.value = betaToSlider(autoBeta());
  draw();
})();

/* =====================================================================
 * Widget 2: PUCT OVER THE SOLUTION BUFFER
 * An archive of 8 candidate solutions. Set c, expand states, watch PUCT
 * trade "build on the best" against "try something under-explored".
 * ===================================================================== */
(function puctWidget() {
  const host = document.getElementById('puct-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="puctCanvas" width="520" height="340"></canvas></div>
      <div class="controls">
        <div>
          <label class="ctl-label">exploration coefficient  c = <b id="puctCVal">1.0</b></label>
          <input type="range" id="puctC" min="0" max="2.6" step="0.1" value="1"/>
        </div>
        <div class="picker">
          <button class="btn mini" id="puctStep">expand →</button>
          <button class="btn mini" id="puctStep10">expand ×10</button>
          <button class="btn mini" id="puctReset">reset</button>
        </div>
        <div class="readout" id="puctReadout"></div>
        <p class="hint">
          Each expansion builds on the PUCT-chosen state. At c = 0 the search only ever expands the
          current best — and stalls. Raise c and it explores: one ordinary-looking state hides a much
          better solution.
        </p>
      </div>
    </div>
  `);

  const W = 520, H = 340;
  const cv = host.querySelector('#puctCanvas');
  const ctx = devicePx(cv, W, H);
  const cSlider = host.querySelector('#puctC');
  const cVal = host.querySelector('#puctCVal');
  const readout = host.querySelector('#puctReadout');
  const NN = 8;

  const R0   = [0.49, 0.52, 0.55, 0.51, 0.58, 0.63, 0.60, 0.67];
  const CEIL = [0.55, 0.59, 0.95, 0.57, 0.64, 0.69, 0.66, 0.74]; // node 2 is the sleeper
  let Q, n, T, expandedSet, lastPick, lastGain;
  const rand = mkRng(90210);

  function reset() {
    Q = R0.slice(); n = new Array(NN).fill(0); T = 0;
    expandedSet = new Set(); lastPick = -1; lastGain = 0;
    draw();
  }

  function scores(c) {
    const qmax = Math.max(...Q), qmin = Math.min(...Q);
    const scale = Math.max(0.02, qmax - qmin);
    const order = Q.map((q, i) => [q, i]).sort((a, b) => b[0] - a[0]);
    const rank = new Array(NN);
    order.forEach((pair, r) => { rank[pair[1]] = r; });
    const denom = NN * (NN + 1) / 2;
    const out = [];
    for (let i = 0; i < NN; i++) {
      const P = (NN - rank[i]) / denom;
      const explore = c * scale * P * Math.sqrt(1 + T) / (1 + n[i]);
      out.push({ score: Q[i] + explore, exploit: Q[i], explore });
    }
    return out;
  }
  function pickIndex(c) {
    const s = scores(c);
    let best = 0;
    for (let i = 1; i < NN; i++) if (s[i].score > s[best].score) best = i;
    return best;
  }
  function expand(c) {
    const i = pickIndex(c);
    const g = Math.max(0, (CEIL[i] - Q[i]) * (0.26 + 0.5 * rand()));
    Q[i] += g;
    n[i] += 1; T += 1;
    expandedSet.add(i);
    lastPick = i; lastGain = g;
  }

  function draw() {
    const c = parseFloat(cSlider.value);
    const fg = cssVar('--fg'), fgMute = cssVar('--fg-mute'), bg = cssVar('--bg-card');
    const accent = cssVar('--accent'), rule = cssVar('--rule');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';

    const QLO = 0.40, QHI = 1.00;
    const nodeY = (q) => 250 - (Math.max(QLO, Math.min(QHI, q)) - QLO) / (QHI - QLO) * 204;
    const nodeX = (i) => 48 + i * (424 / (NN - 1));

    const sc = scores(c);
    const pick = pickIndex(c);
    const bestI = Q.indexOf(Math.max(...Q));
    const maxScore = Math.max(...sc.map(s => s.score));

    ctx.fillStyle = fgMute; ctx.font = '600 11px ' + SANS;
    ctx.fillText('ARCHIVE — 8 candidate solutions  ·  height = best reward Q(s)', 24, 20);

    // reward-axis hint
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    [0.5, 0.7, 0.9].forEach(q => {
      const y = nodeY(q);
      ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(484, y); ctx.stroke();
      ctx.fillStyle = lerpColor(bg, fgMute, 0.6);
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(q.toFixed(1), 488, y + 3);
    });
    ctx.setLineDash([]);

    // score strip
    const stripBase = 326, stripTop = 270;
    ctx.fillStyle = fgMute; ctx.font = '600 10px ' + SANS;
    ctx.fillText('PUCT SCORE', 24, stripTop - 6);

    for (let i = 0; i < NN; i++) {
      const x = nodeX(i), y = nodeY(Q[i]);
      // score bar
      const bh = (sc[i].score / maxScore) * (stripBase - stripTop);
      ctx.fillStyle = i === pick ? accent : lerpColor(bg, fgMute, 0.45);
      ctx.fillRect(x - 13, stripBase - bh, 26, bh);
      // node
      if (i === pick) {
        ctx.beginPath(); ctx.arc(x, y, 22, 0, 2 * Math.PI);
        ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
      }
      const qn = (Q[i] - QLO) / (QHI - QLO);
      ctx.beginPath(); ctx.arc(x, y, 16, 0, 2 * Math.PI);
      ctx.fillStyle = lerpColor(BLUE, GREEN, Math.max(0, Math.min(1, qn)));
      ctx.fill();
      ctx.fillStyle = '#0e0f12';
      ctx.font = '600 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(Q[i].toFixed(2), x, y + 3.5);
      ctx.textAlign = 'left';
      // visits
      ctx.fillStyle = fgMute; ctx.font = '9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('n=' + n[i], x, y + 32);
      ctx.textAlign = 'left';
      // best marker
      if (i === bestI) {
        ctx.fillStyle = GREEN; ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('★', x, y - 24);
        ctx.textAlign = 'left';
      }
    }

    cVal.textContent = c.toFixed(1);
    const p = sc[pick];
    const note = c < 0.05
      ? 'c = 0 — pure exploitation. Only the top state is ever expanded.'
      : (expandedSet.size >= 6 ? 'exploration is reaching the whole archive.'
                               : 'exploration spreads the search across the buffer.');
    readout.innerHTML =
      `exploration&nbsp; c = <b>${c.toFixed(1)}</b><br>` +
      `expansions&nbsp; T = <b>${T}</b>&nbsp; ·&nbsp; <b>${expandedSet.size}</b> / 8 states tried<br>` +
      `best discovered&nbsp; Q = <b class="good">${Math.max(...Q).toFixed(3)}</b>` +
      `&nbsp; <span style="color:${fgMute}">(node ${bestI})</span><br>` +
      `next pick → node <b>${pick}</b>:&nbsp; ${p.exploit.toFixed(3)} <span style="color:${fgMute}">exploit</span> ` +
      `+ ${p.explore.toFixed(3)} <span style="color:${fgMute}">explore</span><br>` +
      `<span style="color:${fgMute}">${note}</span>`;
  }

  cSlider.addEventListener('input', draw);
  host.querySelector('#puctStep').addEventListener('click', () => { expand(parseFloat(cSlider.value)); draw(); });
  host.querySelector('#puctStep10').addEventListener('click', () => {
    for (let k = 0; k < 10; k++) expand(parseFloat(cSlider.value));
    draw();
  });
  host.querySelector('#puctReset').addEventListener('click', reset);
  window.addEventListener('ttd-theme', draw);
  reset();
})();

/* =====================================================================
 * Widget 3: BUILDING THE TRIMUL KERNEL
 * Toggle the fusions and FP16 delegation; watch runtime fall. Only all
 * four together clear the best-human line.
 * ===================================================================== */
(function kernelWidget() {
  const host = document.getElementById('kernel-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="kernCanvas" width="460" height="360"></canvas></div>
      <div class="controls">
        <div class="toggle-col">
          <button class="btn tog" data-k="inLN">fuse the input LayerNorm</button>
          <button class="btn tog" data-k="inGate">fuse the input gating  σ(·)×</button>
          <button class="btn tog" data-k="outLN">fuse output LayerNorm + gating</button>
          <button class="btn tog" data-k="fp16">FP16 + cuBLAS for the matmul</button>
        </div>
        <div class="readout" id="kernReadout"></div>
        <p class="hint">
          TriMul is memory-bound: every separate elementwise op pays a round-trip to slow GPU memory.
          Fusing collapses those trips; FP16 + cuBLAS hands the O(N³) matmul to the TensorCores.
        </p>
      </div>
    </div>
  `);

  const W = 460, H = 360;
  const cv = host.querySelector('#kernCanvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#kernReadout');
  const HUMAN = 1371, TTTD = 1161, MAXR = 5400;
  const state = { inLN: false, inGate: false, outLN: false, fp16: false };

  const STAGES = [
    { key: 'inLN',   name: 'Input LayerNorm',          on: 95,  off: 640, onTag: 'fused', offTag: '4 separate kernels' },
    { key: 'inGate', name: 'Input gating  σ(·) ×',     on: 80,  off: 520, onTag: 'fused', offTag: '2 separate kernels' },
    { key: 'fp16',   name: 'Matmul   O(N³)',           on: 560, off: 2900, onTag: 'FP16 → cuBLAS', offTag: 'FP32 naïve', mm: true },
    { key: 'outLN',  name: 'Output LayerNorm + gating', on: 140, off: 880, onTag: 'fused', offTag: '4 separate kernels' },
  ];
  const FIXED = 286;
  const MEM = { inLN: [7.2, 1.8], inGate: [4.8, 1.2], fp16: [6.0, 3.0], outLN: [9.0, 2.4] };
  const LAUNCH = { inLN: [4, 1], inGate: [2, 1], fp16: [1, 1], outLN: [4, 1] };

  function totals() {
    let rt = FIXED, mem = 0, launch = 1;
    for (const s of STAGES) {
      const onv = state[s.key];
      rt += onv ? s.on : s.off;
      mem += MEM[s.key][onv ? 1 : 0];
      launch += LAUNCH[s.key][onv ? 1 : 0];
    }
    return { rt, mem, launch };
  }

  function draw() {
    const fg = cssVar('--fg'), fgMute = cssVar('--fg-mute'), bg = cssVar('--bg-card');
    const accent = cssVar('--accent'), rule = cssVar('--rule'), elev = cssVar('--bg-elev');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';

    ctx.fillStyle = fgMute; ctx.font = '600 11px ' + SANS;
    ctx.fillText('THE KERNEL PIPELINE', 28, 20);

    // 4 stage blocks
    const bx = 28, bw = 404, bh = 44, gap = 10;
    let by = 32;
    for (const s of STAGES) {
      const onv = state[s.key];
      const good = onv;
      roundRect(ctx, bx, by, bw, bh, 8);
      ctx.fillStyle = good ? lerpColor(bg, GREEN, 0.20) : lerpColor(bg, fgMute, 0.14);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = good ? GREEN : rule;
      ctx.stroke();
      ctx.fillStyle = fg; ctx.font = '600 13px ' + SANS;
      ctx.fillText(s.name, bx + 14, by + 20);
      ctx.fillStyle = good ? lerpColor(bg, GREEN, 0.9) : fgMute;
      ctx.font = '10px ' + SANS;
      ctx.fillText(onv ? s.onTag : s.offTag, bx + 14, by + 35);
      ctx.fillStyle = fg; ctx.font = '600 14px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText((onv ? s.on : s.off) + ' μs', bx + bw - 14, by + 27);
      ctx.textAlign = 'left';
      by += bh + gap;
    }

    const { rt, mem, launch } = totals();
    const beats = rt <= HUMAN;

    // runtime bar
    const rbX = 28, rbW = 404, rbY = 270, rbH = 26;
    ctx.fillStyle = fgMute; ctx.font = '600 11px ' + SANS;
    ctx.fillText('SINGLE-KERNEL RUNTIME  (H100)', rbX, rbY - 10);
    ctx.fillStyle = lerpColor(bg, fgMute, 0.22);
    roundRect(ctx, rbX, rbY, rbW, rbH, 5); ctx.fill();
    const fillW = Math.min(1, rt / MAXR) * rbW;
    ctx.fillStyle = beats ? GREEN : accent;
    roundRect(ctx, rbX, rbY, Math.max(6, fillW), rbH, 5); ctx.fill();
    // reference lines
    function ref(val, label, col) {
      const x = rbX + (val / MAXR) * rbW;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, rbY - 4); ctx.lineTo(x, rbY + rbH + 4); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = '9px ' + SANS;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, rbY + rbH + 16);
      ctx.textAlign = 'left';
    }
    ref(HUMAN, 'best human', fg);
    ref(TTTD, 'TTT-Discover', GREEN);

    // big readout on canvas
    ctx.fillStyle = beats ? GREEN : fg;
    ctx.font = '800 30px ' + SANS;
    ctx.fillText(rt + ' μs', rbX, rbY + rbH + 56);
    ctx.fillStyle = fgMute; ctx.font = '11px ' + SANS;
    const vsH = Math.round((rt / HUMAN - 1) * 100);
    ctx.fillText(beats ? `${-vsH}% faster than the best human` : `${vsH}% slower than the best human`,
                 rbX + 116, rbY + rbH + 56);

    readout.innerHTML =
      `runtime&nbsp;&nbsp;<b${beats ? ' class="good"' : ''}>${rt} μs</b>&nbsp; ` +
      `<span style="color:${fgMute}">human ${HUMAN} · TTT-Discover ${TTTD}</span><br>` +
      `memory moved&nbsp;&nbsp;<b>${mem.toFixed(1)} GB</b>&nbsp; <span style="color:${fgMute}">per call</span><br>` +
      `kernel launches&nbsp;&nbsp;<b>${launch}</b><br>` +
      (beats
        ? `<span class="good">✓ beats every human submission</span>`
        : `<span style="color:${fgMute}">✗ still behind the best human — keep optimizing</span>`);
  }

  host.querySelectorAll('.btn.tog').forEach(b => {
    b.addEventListener('click', () => {
      state[b.dataset.k] = !state[b.dataset.k];
      b.classList.toggle('active', state[b.dataset.k]);
      draw();
    });
  });
  window.addEventListener('ttd-theme', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: ABLATION EXPLORER
 * Pick a train method and a reuse rule; see the best runtime that
 * combination reached on the TriMul competition.
 * ===================================================================== */
(function ablationWidget() {
  const host = document.getElementById('ablation-widget');
  if (!host) return;

  const TRAIN = [
    { id: 'adapt', label: 'entropic · adaptive β' },
    { id: 'const', label: 'entropic · constant β' },
    { id: 'exp',   label: 'expected reward' },
    { id: 'none',  label: 'no training' },
  ];
  const REUSE = [
    { id: 'puct', label: 'PUCT' },
    { id: 'eps',  label: 'ε-greedy' },
    { id: 'noreuse', label: 'no reuse' },
  ];
  // runtime (μs) + takeaway; null = not reported in the paper
  const DATA = {
    'adapt|puct':   [1203, 'Full TTT-Discover — entropic objective + PUCT. The only run that beats the best human.'],
    'adapt|eps':    [1329, 'Swap PUCT for ε-greedy reuse: still strong. PUCT helps, but the objective carries most of the weight.'],
    'adapt|noreuse':[5274, 'Remove reuse entirely and the horizon collapses — one attempt is not enough room to build a kernel this good.'],
    'const|puct':   [1484, 'A constant β instead of the KL-budget adaptive β: improvements stall later in training.'],
    'const|eps':    [null, null],
    'const|noreuse':[null, null],
    'exp|puct':     [1986, 'Ordinary expected-reward RL: a policy that averages its rewards barely notices the rare great kernels.'],
    'exp|eps':      [null, null],
    'exp|noreuse':  [5329, 'Naïve test-time RL — standard objective, no reuse. No better than not training at all.'],
    'none|puct':    [2061, 'PUCT reuse but a frozen model: search without learning plateaus above the human line.'],
    'none|eps':     [null, null],
    'none|noreuse': [5352, 'Best-of-N — a frozen model, no reuse. The starting point everything else improves on.'],
  };
  const HUMAN = 1371, FULL = 1203, MAXR = 5600;

  let grid = '<div class="abl-grid">';
  grid += '<div class="abl-h" style="text-align:left">train ↓ &nbsp; reuse →</div>';
  for (const r of REUSE) grid += `<div class="abl-h">${r.label}</div>`;
  for (const t of TRAIN) {
    grid += `<div class="abl-rowlab">${t.label}</div>`;
    for (const r of REUSE) {
      const key = t.id + '|' + r.id, d = DATA[key];
      if (d[0] == null) {
        grid += `<div class="abl-cell empty">not reported</div>`;
      } else {
        grid += `<div class="abl-cell" data-key="${key}">${d[0]}</div>`;
      }
    }
  }
  grid += '</div>';
  grid += `<div class="abl-lower">
      <div class="canvas-wrap"><canvas id="ablCanvas" width="460" height="150"></canvas></div>
      <div class="readout" id="ablReadout"></div>
    </div>`;
  host.insertAdjacentHTML('beforeend', grid);

  const cv = host.querySelector('#ablCanvas');
  const ctx = devicePx(cv, 460, 150);
  const readout = host.querySelector('#ablReadout');
  const cells = [...host.querySelectorAll('.abl-cell[data-key]')];
  let sel = 'adapt|puct';

  function draw() {
    const fg = cssVar('--fg'), fgMute = cssVar('--fg-mute'), bg = cssVar('--bg-card');
    const accent = cssVar('--accent'), rule = cssVar('--rule');
    const W = 460, H = 150;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left';

    const d = DATA[sel], rt = d[0];
    const beats = rt <= HUMAN;

    const bX = 24, bW = 412, bY = 46, bH = 30;
    ctx.fillStyle = fgMute; ctx.font = '600 11px ' + SANS;
    ctx.fillText('BEST KERNEL RUNTIME  (H100, ↓)', bX, bY - 12);
    ctx.fillStyle = lerpColor(bg, fgMute, 0.22);
    roundRect(ctx, bX, bY, bW, bH, 5); ctx.fill();
    ctx.fillStyle = beats ? GREEN : accent;
    roundRect(ctx, bX, bY, Math.max(6, Math.min(1, rt / MAXR) * bW), bH, 5); ctx.fill();

    function ref(val, label, col) {
      const x = bX + (val / MAXR) * bW;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, bY - 5); ctx.lineTo(x, bY + bH + 5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = '9px ' + SANS;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, bY + bH + 16);
      ctx.textAlign = 'left';
    }
    ref(HUMAN, 'best human', fg);
    if (sel !== 'adapt|puct') ref(FULL, 'TTT-Discover', GREEN);

    ctx.fillStyle = beats ? GREEN : fg;
    ctx.font = '800 30px ' + SANS;
    ctx.fillText(rt + ' μs', bX, bY + bH + 50);
    ctx.fillStyle = fgMute; ctx.font = '11px ' + SANS;
    const vsH = Math.round((rt / HUMAN - 1) * 100);
    ctx.fillText(beats ? `${-vsH}% faster than the best human`
                       : `${vsH}% slower than the best human`, bX + 118, bY + bH + 50);

    readout.innerHTML =
      `<b${beats ? ' class="good"' : ''}>${rt} μs</b><br>` +
      `<span style="color:${fgMute}">${d[1]}</span>`;
  }

  cells.forEach(c => c.addEventListener('click', () => {
    sel = c.dataset.key;
    cells.forEach(x => x.classList.remove('sel'));
    c.classList.add('sel');
    draw();
  }));
  // mark human-beating cells + initial selection
  cells.forEach(c => { if (DATA[c.dataset.key][0] <= HUMAN) c.classList.add('win'); });
  host.querySelector('.abl-cell[data-key="adapt|puct"]').classList.add('sel');
  window.addEventListener('ttd-theme', draw);
  draw();
})();
