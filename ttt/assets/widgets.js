/* Test-Time Training blog — interactive widgets. Plain JS / Canvas. No deps. */

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
  });
})();

/* ---------- canvas helpers ---------- */
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
function lerpColor(hex1, hex2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex1), b = p(hex2);
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)}, ${Math.round(a[1]+(b[1]-a[1])*t)}, ${Math.round(a[2]+(b[2]-a[2])*t)})`;
}
function noise(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/* =====================================================================
 * Widget 1: THREE WAYS TO REMEMBER
 * RNN (fixed vector), self-attention (growing KV cache), TTT (fixed model).
 * Slide the token counter; watch the state and the cost-per-token bar.
 * ===================================================================== */
(function paradigmsWidget() {
  const host = document.getElementById('paradigms-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap">
        <canvas id="pdgCanvas" width="520" height="300"></canvas>
      </div>
      <div class="controls">
        <div class="picker">
          <span class="ctl-label">paradigm:</span>
          <button class="btn active" data-p="rnn">RNN</button>
          <button class="btn" data-p="attn">Attention</button>
          <button class="btn" data-p="ttt">TTT</button>
        </div>
        <div>
          <label class="ctl-label">tokens read so far: <span id="pdgT">14</span></label>
          <input type="range" id="pdgSlider" min="1" max="48" step="1" value="14"/>
        </div>
        <div class="readout" id="pdgReadout"></div>
        <p class="hint">
          RNN and TTT keep a <em>fixed-size</em> state — constant cost per token. Attention's state and
          cost grow with every token. The twist: TTT's fixed-size box holds the weights of a model.
        </p>
      </div>
    </div>
  `);

  const W = 520, H = 300;
  const cv = host.querySelector('#pdgCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#pdgSlider');
  const tLabel = host.querySelector('#pdgT');
  const readout = host.querySelector('#pdgReadout');
  const btns = [...host.querySelectorAll('.picker .btn')];
  let mode = 'rnn';

  function cell(x, y, w, h, val, accent, blue, bg) {
    const mag = Math.min(1, Math.abs(val));
    ctx.fillStyle = val >= 0 ? lerpColor(bg, accent, mag * 0.9 + 0.1)
                             : lerpColor(bg, blue, mag * 0.9 + 0.1);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function draw() {
    const t = parseInt(slider.value);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue = '#5fa9ff';
    const bg = cssVar('--bg-card') || '#1f2128';
    const fg = cssVar('--fg') || '#e8e8ee';
    const fgMute = cssVar('--fg-mute') || '#888';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';

    let stateLabel, costLabel, costFrac, note;

    if (mode === 'rnn') {
      ctx.fillStyle = fgMute;
      ctx.fillText('hidden state — a fixed vector (dim 6)', 16, 26);
      const n = 6, cw = 44, ch = 44, gap = 8;
      const ox = (W - n * (cw + gap) + gap) / 2, oy = 86;
      for (let i = 0; i < n; i++) {
        cell(ox + i * (cw + gap), oy, cw, ch, noise(i + 1 + t * 0.41), accent, blue, bg);
      }
      stateLabel = 'fixed vector, 6 numbers';
      costLabel = 'O(1)'; costFrac = 0.14;
      note = 'fixed size — cheap, but a blunt summary of the past';
    } else if (mode === 'attn') {
      ctx.fillStyle = fgMute;
      ctx.fillText('hidden state — the KV cache, one entry per token', 16, 26);
      const cw = 34, ch = 24, gap = 5, perRow = 12;
      const ox = (W - perRow * (cw + gap) + gap) / 2, oy = 44;
      for (let i = 0; i < t; i++) {
        const r = Math.floor(i / perRow), c = i % perRow;
        cell(ox + c * (cw + gap), oy + r * (ch + gap), cw, ch, noise(i + 1) * 0.8, accent, blue, bg);
      }
      stateLabel = t + ' KV pairs (and counting)';
      costLabel = 'O(t)'; costFrac = 0.14 + 0.72 * (t / 48);
      note = 'grows with every token — lossless, but never stops growing';
    } else {
      ctx.fillStyle = fgMute;
      ctx.fillText('hidden state — the weights W of a model f', 16, 26);
      const n = 6, cw = 26, ch = 26, gap = 5;
      const block = n * (cw + gap) - gap;
      const ox = (W - block) / 2, oy = 44;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          cell(ox + c * (cw + gap), oy + r * (ch + gap),
               cw, ch, noise(r * n + c + 1 + t * 0.3), accent, blue, bg);
        }
      }
      stateLabel = 'weights of a model — fixed size';
      costLabel = 'O(1)'; costFrac = 0.16;
      note = 'fixed size like an RNN — but it is a model, trained on the sequence';
    }

    // cost-per-token bar
    const barY = 244, barX = 120, barMax = 360;
    ctx.fillStyle = fgMute;
    ctx.textAlign = 'right';
    ctx.fillText('cost / token', barX - 12, barY + 13);
    ctx.textAlign = 'left';
    ctx.fillStyle = lerpColor(bg, '#888', 0.4);
    ctx.fillRect(barX, barY, barMax, 16);
    ctx.fillStyle = mode === 'attn' ? blue : accent;
    ctx.fillRect(barX, barY, barMax * Math.min(1, costFrac), 16);
    ctx.fillStyle = fg;
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillText(costLabel, barX + barMax * Math.min(1, costFrac) + 8, barY + 13);

    readout.innerHTML = `state: <b>${stateLabel}</b><br>cost / token: <b>${costLabel}</b><br>${note}`;
    tLabel.textContent = t;
  }

  slider.addEventListener('input', draw);
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    mode = b.dataset.p;
    draw();
  }));
  draw();
})();

/* =====================================================================
 * Widget 2: THE HIDDEN STATE TRAINS ITSELF
 * Real arithmetic: a linear model f(x)=Wx, a reconstruction loss, one
 * gradient step per token. Watch W drift and the loss fall.
 * ===================================================================== */
(function innerloopWidget() {
  const host = document.getElementById('innerloop-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap">
        <canvas id="ilCanvas" width="560" height="300"></canvas>
      </div>
      <div class="controls">
        <div class="picker">
          <button class="btn" id="ilStep">▶ step a token</button>
          <button class="btn" id="ilRun">▶▶ run</button>
          <button class="btn" id="ilReset">↻ reset</button>
        </div>
        <div class="readout" id="ilReadout"></div>
        <p class="hint">
          Real numbers: a linear model $f$, a reconstruction loss, one gradient step per token. The
          orange curve is the loss after each step; the grey line is what a frozen, untrained $W_0$ would
          score. The widening gap is the hidden state learning the sequence.
        </p>
      </div>
    </div>
  `);

  const D = 8, R = 3, TMAX = 40, ETA = 0.085;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  const rand = rng(20240705);
  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const BAS = []; for (let i = 0; i < D * R; i++) BAS.push(randn());
  const mask = []; for (let i = 0; i < D; i++) mask.push(i % 2 === 0 ? 1 : 0);
  const SEQ = [];
  for (let t = 0; t < TMAX; t++) {
    const c = []; for (let r = 0; r < R; r++) c.push(randn());
    const x = [];
    for (let i = 0; i < D; i++) {
      let v = 0; for (let r = 0; r < R; r++) v += BAS[i * R + r] * c[r];
      x.push(v * 0.55 + randn() * 0.16);
    }
    SEQ.push(x);
  }
  const W0 = []; for (let i = 0; i < D * D; i++) W0.push(randn() * 0.06);

  function mv(W, x) {
    const y = [];
    for (let i = 0; i < D; i++) { let s = 0; for (let j = 0; j < D; j++) s += W[i * D + j] * x[j]; y.push(s); }
    return y;
  }
  function lossOf(W, x) {
    const xt = x.map((v, j) => v * mask[j]);
    const p = mv(W, xt);
    let s = 0; for (let i = 0; i < D; i++) { const e = p[i] - x[i]; s += e * e; }
    return s / D;
  }

  let W, t, hist, timer;
  function reset() {
    W = W0.slice();
    t = 0; hist = [];
    if (timer) { clearInterval(timer); timer = null; runBtn.textContent = '▶▶ run'; }
    draw();
  }
  function step() {
    if (t >= TMAX) return false;
    const x = SEQ[t];
    const xt = x.map((v, j) => v * mask[j]);
    const w0loss = lossOf(W0, x);
    const p = mv(W, xt);
    for (let i = 0; i < D; i++) {
      const e = 2 * (p[i] - x[i]) / D;
      for (let j = 0; j < D; j++) W[i * D + j] -= ETA * e * xt[j];
    }
    hist.push({ t: t + 1, after: lossOf(W, x), w0: w0loss });
    t += 1;
    return true;
  }

  const cv = host.querySelector('#ilCanvas');
  const CW = 560, CH = 300;
  const ctx = devicePx(cv, CW, CH);
  const stepBtn = host.querySelector('#ilStep');
  const runBtn = host.querySelector('#ilRun');
  const resetBtn = host.querySelector('#ilReset');
  const readout = host.querySelector('#ilReadout');

  function draw() {
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue = '#5fa9ff';
    const bg = cssVar('--bg-card') || '#1f2128';
    const fg = cssVar('--fg') || '#e8e8ee';
    const fgMute = cssVar('--fg-mute') || '#888';
    const rule = cssVar('--rule') || '#333';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);
    ctx.textAlign = 'left';
    ctx.font = '11px ui-monospace, monospace';

    // ---- W grid (left) ----
    ctx.fillStyle = fgMute;
    ctx.fillText('weights W', 22, 30);
    const cw = 18, ox = 22, oy = 44;
    for (let r = 0; r < D; r++) {
      for (let c = 0; c < D; c++) {
        const w = W ? W[r * D + c] : 0;
        const mag = Math.min(1, Math.abs(w) * 1.7);
        ctx.fillStyle = w >= 0 ? lerpColor(bg, accent, mag * 0.92 + 0.08)
                               : lerpColor(bg, blue, mag * 0.92 + 0.08);
        ctx.fillRect(ox + c * cw, oy + r * cw, cw - 1.5, cw - 1.5);
      }
    }
    ctx.fillStyle = fgMute;
    ctx.fillText('model f(x) = Wx', 22, oy + D * cw + 20);

    // ---- loss plot (right) ----
    const pL = 220, pR = CW - 20, pT = 40, pB = CH - 44;
    let maxL = 0.4;
    hist.forEach(h => { maxL = Math.max(maxL, h.after, h.w0); });
    maxL *= 1.12;
    const px = i => pL + (i - 1) / (TMAX - 1) * (pR - pL);
    const py = l => pB - (l / maxL) * (pB - pT);

    ctx.strokeStyle = rule;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(pL, pT); ctx.lineTo(pL, pB); ctx.lineTo(pR, pB);
    ctx.stroke();
    ctx.fillStyle = fgMute;
    ctx.fillText('self-supervised loss', pL, pT - 14);
    ctx.fillText('token index  →', pR - 86, pB + 18);

    function trace(key, color, dash) {
      if (hist.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      hist.forEach((h, i) => {
        const x = px(h.t), y = py(h[key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    trace('w0', lerpColor(bg, fgMute, 0.85), [5, 4]);
    trace('after', accent);
    if (hist.length) {
      const last = hist[hist.length - 1];
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(px(last.t), py(last.after), 4, 0, 2 * Math.PI); ctx.fill();
    }
    // legend
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = accent;
    ctx.fillText('● loss after the gradient step', pL + 4, pT + 2);
    ctx.fillStyle = fgMute;
    ctx.fillText('- - frozen W0 (no learning)', pL + 4, pT + 18);

    // readout
    if (hist.length) {
      const last = hist[hist.length - 1];
      const gap = (last.w0 - last.after);
      readout.innerHTML =
        `token <b>${t}</b> / ${TMAX}<br>` +
        `loss now: <b>${last.after.toFixed(3)}</b><br>` +
        `frozen W0: <b>${last.w0.toFixed(3)}</b><br>` +
        `the layer is ${gap > 0.001 ? '<b>' + (gap > 0 ? '+' : '') + gap.toFixed(3) + '</b> ahead of no-learning' : 'just getting started'}`;
    } else {
      readout.innerHTML = `token <b>0</b> / ${TMAX}<br>press “step a token” to run one gradient step.`;
    }
  }

  stepBtn.addEventListener('click', () => { step(); draw(); });
  resetBtn.addEventListener('click', reset);
  runBtn.addEventListener('click', () => {
    if (timer) {
      clearInterval(timer); timer = null; runBtn.textContent = '▶▶ run';
    } else {
      if (t >= TMAX) reset();
      runBtn.textContent = '⏸ pause';
      timer = setInterval(() => {
        if (!step()) { clearInterval(timer); timer = null; runBtn.textContent = '▶▶ run'; }
        draw();
      }, 360);
    }
  });
  reset();
})();

/* =====================================================================
 * Widget 3: PARALLELISING TEST-TIME TRAINING
 * Slide the TTT mini-batch size b. See the chunking, the count of
 * sequential GD steps, and the speed / search-depth trade-off.
 * ===================================================================== */
(function minibatchWidget() {
  const host = document.getElementById('minibatch-widget');
  if (!host) return;

  const BVALS = [1, 2, 4, 8, 16, 32, 48];
  const T = 48;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap">
        <canvas id="mbCanvas" width="540" height="300"></canvas>
      </div>
      <div class="controls">
        <div>
          <label class="ctl-label">TTT mini-batch size b = <span id="mbB">16</span></label>
          <input type="range" id="mbSlider" min="0" max="6" step="1" value="4"/>
        </div>
        <div class="readout" id="mbReadout"></div>
        <p class="hint">
          $b = 1$ is online GD — every gradient at the freshest weights, fully sequential. $b = T$ is
          batch GD — all gradients at $W_0$, fully parallel but a shallow search. The paper picks
          $b = 16$.
        </p>
      </div>
    </div>
  `);

  const CW = 540, CH = 300;
  const cv = host.querySelector('#mbCanvas');
  const ctx = devicePx(cv, CW, CH);
  const slider = host.querySelector('#mbSlider');
  const bLabel = host.querySelector('#mbB');
  const readout = host.querySelector('#mbReadout');

  function draw() {
    const b = BVALS[parseInt(slider.value)];
    const nchunks = Math.ceil(T / b);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue = '#5fa9ff';
    const bg = cssVar('--bg-card') || '#1f2128';
    const fg = cssVar('--fg') || '#e8e8ee';
    const fgMute = cssVar('--fg-mute') || '#888';
    const rule = cssVar('--rule') || '#333';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);
    ctx.textAlign = 'left';
    ctx.font = '11px ui-monospace, monospace';

    // ---- token grid, tinted by mini-batch ----
    ctx.fillStyle = fgMute;
    ctx.fillText('48 tokens, grouped into mini-batches', 18, 24);
    const perRow = 24, cw = 20, ch = 22, gap = 2;
    const ox = (CW - perRow * (cw + gap) + gap) / 2, oy = 38;
    for (let i = 0; i < T; i++) {
      const r = Math.floor(i / perRow), c = i % perRow;
      const chunk = Math.floor(i / b);
      const x = ox + c * (cw + gap), y = oy + r * (ch + gap);
      ctx.fillStyle = lerpColor(bg, accent, chunk % 2 === 0 ? 0.32 : 0.62);
      ctx.fillRect(x, y, cw, ch);
      if (i % b === 0) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x, y + ch + 2); ctx.stroke();
      }
    }

    // ---- sequential GD-step chain ----
    const chainY = 132;
    ctx.fillStyle = fgMute;
    ctx.fillText(nchunks + ' mini-batch' + (nchunks > 1 ? 'es' : '') +
                 '  →  ' + nchunks + ' sequential GD step' + (nchunks > 1 ? 's' : ''), 18, chainY - 14);
    const chL = 30, chR = CW - 30;
    ctx.strokeStyle = rule;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(chL, chainY); ctx.lineTo(chR, chainY); ctx.stroke();
    for (let k = 0; k < nchunks; k++) {
      const x = nchunks === 1 ? (chL + chR) / 2 : chL + k / (nchunks - 1) * (chR - chL);
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(x, chainY, 5, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.fillStyle = fgMute;
    ctx.fillText('W0', chL - 4, chainY + 20);
    ctx.fillText('WT', chR - 14, chainY + 20);

    // ---- two trade-off bars ----
    function bar(y, label, frac, color, valText) {
      ctx.fillStyle = fgMute;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(label, 18, y - 6);
      const bx = 18, bw = CW - 130;
      ctx.fillStyle = lerpColor(bg, '#888', 0.4);
      ctx.fillRect(bx, y, bw, 14);
      ctx.fillStyle = color;
      ctx.fillRect(bx, y, bw * Math.max(0.02, Math.min(1, frac)), 14);
      ctx.fillStyle = fg;
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText(valText, bx + bw + 10, y + 11);
    }
    bar(192, 'parallelism — gradients computed at once', b / T, blue, b + ' / 48');
    bar(238, 'search depth — sequential gradient steps', nchunks / T, accent, nchunks + ' step' + (nchunks > 1 ? 's' : ''));

    let note;
    if (b === 1) note = 'online GD — deepest search, zero parallelism (slow)';
    else if (b === T) note = 'batch GD — one shallow step, fully parallel (weak)';
    else if (b === 16) note = "the paper's choice — enough parallelism, search still deep";
    else note = 'a point on the speed / quality trade-off';

    bLabel.textContent = b;
    readout.innerHTML =
      `b = <b>${b}</b><br>` +
      `<b>${nchunks}</b> sequential GD step${nchunks > 1 ? 's' : ''} ` +
      `· <b>${b}</b> gradient${b > 1 ? 's' : ''} in parallel each<br>${note}`;
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: EVERY LEARNER IS A LAYER
 * Pick an inner model and an update rule; the card names the sequence
 * layer that combination induces.
 * ===================================================================== */
(function learnerWidget() {
  const host = document.getElementById('learner-widget');
  if (!host) return;

  const TABLE = {
    'linear|online': {
      tag: 'closely related work',
      name: 'DeltaNet (≈)',
      desc: 'A linear inner model updated one token at a time is, essentially, DeltaNet — TTT-Linear with mini-batch size 1, minus the Layer Norm and residual connection.',
      eq: 'W_t = W_{t-1} - \\eta\\,\\nabla\\ell(W_{t-1}; x_t)',
    },
    'linear|minibatch': {
      tag: 'introduced by this paper',
      name: 'TTT-Linear',
      desc: "The paper's headline layer: a linear inner model, mini-batch gradient descent, plus a Layer Norm, residual, and learnable learning rate. Linear-time, and it keeps improving in long context.",
      eq: 'G_t = \\nabla\\ell(W_{t\'}; x_t), \\quad t\' = t - \\mathrm{mod}(t, b)',
    },
    'linear|batch': {
      tag: 'a known layer · Theorem 1',
      name: 'Linear attention',
      desc: 'A linear inner model with batch GD, η = 1/2 and W₀ = 0 is provably identical to linear attention — self-attention with the softmax removed.',
      eq: 'z_t = \\sum_{s \\le t} (\\theta_V x_s)(\\theta_K x_s)^\\top (\\theta_Q x_t)',
    },
    'mlp|online': {
      tag: 'a TTT variant',
      name: 'Online TTT-MLP',
      desc: 'A two-layer MLP as the hidden state, updated one token at a time. More expressive than linear, but fully sequential — slow without the mini-batch trick.',
      eq: 'W_t = W_{t-1} - \\eta\\,\\nabla\\ell(W_{t-1}; x_t)',
    },
    'mlp|minibatch': {
      tag: 'introduced by this paper',
      name: 'TTT-MLP',
      desc: 'A two-layer MLP hidden state with mini-batch GD. The most expressive instantiation in the paper — strongest in long context, but its extra structure costs real wall-clock time.',
      eq: 'f(x) = x + \\mathrm{LN}(f_{\\mathrm{MLP}}(x))',
    },
    'mlp|batch': {
      tag: 'a TTT variant',
      name: 'Batch TTT-MLP',
      desc: 'An MLP hidden state with batch GD. Fully parallel, but every W_t is just one gradient step from W₀ — a shallow search that hurts language modelling.',
      eq: 'G_t = \\nabla\\ell(W_0; x_t)\\quad\\text{for all } t',
    },
    'kernel': {
      tag: 'a known layer · Theorem 2',
      name: 'Self-attention',
      desc: 'A nonparametric learner — the Nadaraya–Watson kernel estimator — keeps the tokens around instead of compressing them into weights. The TTT layer it induces is exactly softmax self-attention.',
      eq: 'f(x; x_1,\\dots,x_t) = \\sum_s \\mathrm{softmax}\\big((\\theta_K x)^\\top \\theta_Q x_s\\big)\\,\\theta_V x_s',
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="pickers">
        <div class="picker-row">
          <span class="ctl-label">inner model</span>
          <button class="btn active" data-model="linear">Linear</button>
          <button class="btn" data-model="mlp">MLP</button>
          <button class="btn" data-model="kernel">Kernel (nonparametric)</button>
        </div>
        <div class="picker-row" id="lrnOptRow">
          <span class="ctl-label">update rule</span>
          <button class="btn" data-opt="online">Online GD</button>
          <button class="btn active" data-opt="minibatch">Mini-batch GD</button>
          <button class="btn" data-opt="batch">Batch GD</button>
        </div>
      </div>
      <div class="result-card" id="lrnCard"></div>
    </div>
  `);

  const card = host.querySelector('#lrnCard');
  const optRow = host.querySelector('#lrnOptRow');
  const modelBtns = [...host.querySelectorAll('[data-model]')];
  const optBtns = [...host.querySelectorAll('[data-opt]')];
  let model = 'linear', opt = 'minibatch';

  function render() {
    const key = model === 'kernel' ? 'kernel' : model + '|' + opt;
    const d = TABLE[key];
    optRow.style.opacity = model === 'kernel' ? 0.4 : 1;
    optRow.style.pointerEvents = model === 'kernel' ? 'none' : 'auto';
    card.innerHTML = `
      <p class="rc-tag">${d.tag}</p>
      <p class="rc-name">${d.name}</p>
      <p class="rc-desc">${d.desc}</p>
      <div class="rc-eq">$$${d.eq}$$</div>
      ${model === 'kernel' ? '<p class="rc-tag" style="margin-top:8px">a nonparametric learner stores tokens — there is no update rule to pick</p>' : ''}
    `;
    if (window.renderMathInElement) {
      renderMathInElement(card, { delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ]});
    }
  }

  modelBtns.forEach(b => b.addEventListener('click', () => {
    modelBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    model = b.dataset.model;
    render();
  }));
  optBtns.forEach(b => b.addEventListener('click', () => {
    optBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    opt = b.dataset.opt;
    render();
  }));
  render();
})();
