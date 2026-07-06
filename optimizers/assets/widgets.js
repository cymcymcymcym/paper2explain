/* optimizers blog interactive widgets. Plain JS / Canvas. No deps. */

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

/* ---------- shared helpers ---------- */

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

function lerp(a, b, t) { return a + (b - a) * t; }

function randn() {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* =====================================================================
 * Widget 1: Optimizer race
 * SGD, Momentum, and Adam descending the same ill-conditioned quadratic
 * bowl (condition number 40). Scrub through steps, or play; drag the
 * learning-rate multiplier to probe stability.
 * ===================================================================== */
(function optimizerRace() {
  const host = document.getElementById('optimizer-race');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="raceCanvas" width="440" height="440"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">Step</label>
        <input type="range" id="raceStep" min="0" max="40" step="1" value="0"/>
      </div>
      <div>
        <label class="ctl-label">Learning-rate multiplier (all three scaled together)</label>
        <input type="range" id="raceLr" min="0.3" max="2.5" step="0.05" value="1"/>
      </div>
      <button class="btn" id="racePlay">▶ play</button>
      <div class="readout" id="raceReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#raceCanvas');
  const ctx = devicePx(cv, 440, 440);
  const stepSlider = host.querySelector('#raceStep');
  const lrSlider = host.querySelector('#raceLr');
  const playBtn = host.querySelector('#racePlay');
  const readout = host.querySelector('#raceReadout');
  const W = 440, H = 440;

  const A = 40, Bc = 1, X0 = -4, Y0 = 4, STEPS = 40;
  const LR0 = { sgd: 0.04, mom: 0.02, adam: 0.3 };
  const BETA1 = 0.9, BETA2 = 0.999, EPS = 1e-8;
  const COLORS = { sgd: '#5fa9ff', mom: '#e0b400', adam: '#37b073' };
  const NAMES = { sgd: 'SGD', mom: 'Momentum', adam: 'Adam' };

  function computePaths(mult) {
    let sgd = [X0, Y0];
    let mom = [X0, Y0], momV = [0, 0];
    let adam = [X0, Y0], adamM = [0, 0], adamV = [0, 0];
    const paths = { sgd: [sgd.slice()], mom: [mom.slice()], adam: [adam.slice()] };
    for (let t = 1; t <= STEPS; t++) {
      let g = [A * sgd[0], Bc * sgd[1]];
      sgd = [sgd[0] - LR0.sgd * mult * g[0], sgd[1] - LR0.sgd * mult * g[1]];
      g = [A * mom[0], Bc * mom[1]];
      momV = [0.9 * momV[0] - LR0.mom * mult * g[0], 0.9 * momV[1] - LR0.mom * mult * g[1]];
      mom = [mom[0] + momV[0], mom[1] + momV[1]];
      g = [A * adam[0], Bc * adam[1]];
      adamM = [BETA1 * adamM[0] + (1 - BETA1) * g[0], BETA1 * adamM[1] + (1 - BETA1) * g[1]];
      adamV = [BETA2 * adamV[0] + (1 - BETA2) * g[0] * g[0], BETA2 * adamV[1] + (1 - BETA2) * g[1] * g[1]];
      const mHat = [adamM[0] / (1 - BETA1 ** t), adamM[1] / (1 - BETA1 ** t)];
      const vHat = [adamV[0] / (1 - BETA2 ** t), adamV[1] / (1 - BETA2 ** t)];
      adam = [adam[0] - LR0.adam * mult * mHat[0] / (Math.sqrt(vHat[0]) + EPS), adam[1] - LR0.adam * mult * mHat[1] / (Math.sqrt(vHat[1]) + EPS)];
      const clamp = (p) => [Math.max(-8, Math.min(8, p[0])), Math.max(-8, Math.min(8, p[1]))];
      sgd = clamp(sgd); mom = clamp(mom); adam = clamp(adam);
      paths.sgd.push(sgd.slice()); paths.mom.push(mom.slice()); paths.adam.push(adam.slice());
    }
    return paths;
  }

  let playing = false, playTimer = null;

  function toPx([x, y]) {
    const scale = (W * 0.82) / 10;
    return [W / 2 + x * scale, H / 2 - y * scale];
  }

  function draw() {
    const mult = parseFloat(lrSlider.value);
    const step = parseInt(stepSlider.value, 10);
    const paths = computePaths(mult);
    ctx.clearRect(0, 0, W, H);

    // contour ellipses of f(x,y)=0.5*(A x^2 + Bc y^2)
    const scale = (W * 0.82) / 10;
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    [0.5, 2, 5, 10, 18].forEach(level => {
      const rx = Math.sqrt(2 * level / A) * scale;
      const ry = Math.sqrt(2 * level / Bc) * scale;
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    });

    ['sgd', 'mom', 'adam'].forEach(key => {
      ctx.beginPath();
      ctx.strokeStyle = COLORS[key];
      ctx.lineWidth = 2;
      for (let i = 0; i <= step; i++) {
        const [x, y] = toPx(paths[key][i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const [x, y] = toPx(paths[key][step]);
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[key]; ctx.fill();
    });

    ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    let ly = 16;
    ['sgd', 'mom', 'adam'].forEach(key => {
      ctx.fillStyle = COLORS[key];
      ctx.fillText('● ' + NAMES[key], 8, ly);
      ly += 16;
    });

    const rows = ['sgd', 'mom', 'adam'].map(key => {
      const [x, y] = paths[key][step];
      const loss = 0.5 * (A * x * x + Bc * y * y);
      const diverged = Math.abs(x) >= 7.9 || Math.abs(y) >= 7.9;
      return `<div style="color:${COLORS[key]}">${NAMES[key]}: loss=${loss.toFixed(2)}${diverged ? ' <b>(diverging)</b>' : ''}</div>`;
    }).join('');
    readout.innerHTML = `<div>step ${step} / ${STEPS} &middot; lr ×${mult.toFixed(2)}</div>${rows}`;
  }

  stepSlider.addEventListener('input', draw);
  lrSlider.addEventListener('input', draw);
  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '⏸ pause' : '▶ play';
    if (playing) {
      if (parseInt(stepSlider.value, 10) >= STEPS) stepSlider.value = 0;
      playTimer = setInterval(() => {
        let s = parseInt(stepSlider.value, 10) + 1;
        if (s > STEPS) { s = STEPS; playing = false; playBtn.textContent = '▶ play'; clearInterval(playTimer); }
        stepSlider.value = s;
        draw();
      }, 120);
    } else {
      clearInterval(playTimer);
    }
  });

  draw();
})();

/* =====================================================================
 * Widget 2: Bias correction
 * Under a constant gradient signal, the raw second-moment EMA v_t starts
 * far below the true value (biased toward its zero init) while the
 * bias-corrected v_hat_t recovers the true value exactly, at every step.
 * ===================================================================== */
(function biasCorrection() {
  const host = document.getElementById('bias-correction');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="bcCanvas" width="560" height="300"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">&beta;&#8322; (second-moment decay)</label>
        <input type="range" id="bcBeta" min="0.9" max="0.9995" step="0.0005" value="0.999"/>
      </div>
      <div class="toggle-row">
        <button class="btn active" data-mode="clean">constant gradient</button>
        <button class="btn" data-mode="noisy">noisy gradient</button>
      </div>
      <div class="readout" id="bcReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#bcCanvas');
  const ctx = devicePx(cv, 560, 300);
  const betaSlider = host.querySelector('#bcBeta');
  const toggleRow = host.querySelector('.toggle-row');
  const readout = host.querySelector('#bcReadout');
  const W = 560, H = 300;
  const T_MAX = 60;
  let mode = 'clean';
  let noiseSeq = Array.from({ length: T_MAX }, () => randn());

  function compute(beta2) {
    let v = 0;
    const raw = [], corrected = [];
    for (let t = 1; t <= T_MAX; t++) {
      const g = mode === 'clean' ? 1 : 1 + 0.3 * noiseSeq[t - 1];
      v = beta2 * v + (1 - beta2) * g * g;
      raw.push(v);
      corrected.push(v / (1 - Math.pow(beta2, t)));
    }
    return { raw, corrected };
  }

  function draw() {
    const beta2 = parseFloat(betaSlider.value);
    const { raw, corrected } = compute(beta2);
    const padL = 40, padR = 14, padT = 16, padB = 30;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);

    const xPix = (t) => padL + ((t - 1) / (T_MAX - 1)) * (W - padL - padR);
    const yPix = (v) => padT + (1 - Math.min(v, 1.6) / 1.6) * (H - padT - padB);

    ctx.strokeStyle = rule; ctx.fillStyle = fg; ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
    [0, 0.4, 0.8, 1.0, 1.2, 1.6].forEach(v => {
      const y = yPix(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(1), padL - 6, y + 3);
    });
    ctx.save();
    ctx.setLineDash([2, 3]); ctx.strokeStyle = cssVar('--fg'); ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, yPix(1)); ctx.lineTo(W - padR, yPix(1)); ctx.stroke();
    ctx.restore();

    function plot(series, color) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.2;
      series.forEach((v, i) => {
        const x = xPix(i + 1), y = yPix(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    plot(raw, '#e0745a');
    plot(corrected, '#37b073');

    ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
    ctx.fillStyle = '#e0745a'; ctx.fillText('raw v_t (uncorrected)', padL + 6, yPix(raw[raw.length - 1]) - 8);
    ctx.fillStyle = '#37b073'; ctx.fillText('bias-corrected v̂_t', padL + 6, 26);
    ctx.textAlign = 'center'; ctx.fillStyle = fg;
    ctx.fillText('training step t →', (padL + W - padR) / 2, H - 8);

    readout.innerHTML = `
      <div>&beta;&#8322; = <b>${beta2.toFixed(4)}</b> &mdash; true g&sup2; = 1.0</div>
      <div>raw v_t after 10 steps: <b>${raw[9].toFixed(4)}</b> (still ${(100 * (1 - raw[9])).toFixed(1)}% below truth)</div>
      <div>corrected v&#770;_t after 10 steps: <b>${corrected[9].toFixed(4)}</b> ${mode === 'clean' ? '(exactly right, every step)' : ''}</div>
    `;
  }

  betaSlider.addEventListener('input', draw);
  toggleRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    mode = btn.dataset.mode;
    if (mode === 'noisy') noiseSeq = Array.from({ length: T_MAX }, () => randn());
    toggleRow.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });
  draw();
})();

/* =====================================================================
 * Widget 3: Muon orthogonalization
 * A skewed 2x2 update matrix, run through the same Newton-Schulz
 * iteration Muon uses. Watch the singular values converge to each other
 * (not to any fixed magnitude — the ratio, not the scale, is the point)
 * within a handful of steps.
 * ===================================================================== */
(function muonOrthogonalize() {
  const host = document.getElementById('muon-orthogonalize');
  if (!host) return;

  const PRESETS = {
    typical: { label: 'typical gradient', G: [[5, 0.3], [0.1, 0.5]] },
    extreme: { label: 'highly skewed', G: [[8, 0.05], [0.02, 0.15]] },
    balanced: { label: 'already balanced', G: [[1.2, 0.9], [-0.8, 1.1]] },
  };
  const COEFFS = [3.4445, -4.7750, 2.0315]; // Muon's published quintic Newton-Schulz coefficients

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="muonPicker"></div>
    <canvas id="muonCanvas" width="420" height="280"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">Newton-Schulz iterations</label>
        <input type="range" id="muonIters" min="0" max="8" step="1" value="5"/>
      </div>
      <div class="readout" id="muonReadout"></div>
    </div>
  `);

  const picker = host.querySelector('#muonPicker');
  const cv = host.querySelector('#muonCanvas');
  const ctx = devicePx(cv, 420, 280);
  const itersSlider = host.querySelector('#muonIters');
  const readout = host.querySelector('#muonReadout');
  const W = 420, H = 280;

  Object.keys(PRESETS).forEach((key, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' active' : '');
    b.textContent = PRESETS[key].label;
    b.dataset.key = key;
    picker.appendChild(b);
  });
  let current = Object.keys(PRESETS)[0];

  function matmul(X, Y) {
    return [
      [X[0][0] * Y[0][0] + X[0][1] * Y[1][0], X[0][0] * Y[0][1] + X[0][1] * Y[1][1]],
      [X[1][0] * Y[0][0] + X[1][1] * Y[1][0], X[1][0] * Y[0][1] + X[1][1] * Y[1][1]],
    ];
  }
  function transpose(X) { return [[X[0][0], X[1][0]], [X[0][1], X[1][1]]]; }
  function frobNorm(X) { return Math.sqrt(X[0][0] ** 2 + X[0][1] ** 2 + X[1][0] ** 2 + X[1][1] ** 2); }
  function scalarMul(X, s) { return [[X[0][0] * s, X[0][1] * s], [X[1][0] * s, X[1][1] * s]]; }
  function addMat(X, Y) { return [[X[0][0] + Y[0][0], X[0][1] + Y[0][1]], [X[1][0] + Y[1][0], X[1][1] + Y[1][1]]]; }

  function newtonSchulz(G, iters) {
    let X = scalarMul(G, 1 / frobNorm(G));
    for (let i = 0; i < iters; i++) {
      const A = matmul(transpose(X), X);
      const A2 = matmul(A, A);
      X = addMat(addMat(scalarMul(X, COEFFS[0]), scalarMul(matmul(X, A), COEFFS[1])), scalarMul(matmul(X, A2), COEFFS[2]));
    }
    return X;
  }
  function singularValues(X) {
    const AtA = matmul(transpose(X), X);
    const tr = AtA[0][0] + AtA[1][1];
    const det = AtA[0][0] * AtA[1][1] - AtA[0][1] * AtA[1][0];
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    return [Math.sqrt(Math.max(0, tr / 2 + disc)), Math.sqrt(Math.max(0, tr / 2 - disc))];
  }

  // Draw the unit circle transformed by matrix X as an ellipse-ish shape (polyline of transformed circle points)
  function drawTransformed(X, cx, cy, scale, color, fillAlpha) {
    ctx.beginPath();
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const px = Math.cos(a), py = Math.sin(a);
      const tx = X[0][0] * px + X[0][1] * py;
      const ty = X[1][0] * px + X[1][1] * py;
      const x = cx + tx * scale, y = cy - ty * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fillAlpha) { ctx.fillStyle = color; ctx.globalAlpha = fillAlpha; ctx.fill(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  }

  function draw() {
    const iters = parseInt(itersSlider.value, 10);
    const G = PRESETS[current].G;
    const X = iters === 0 ? scalarMul(G, 1 / frobNorm(G)) : newtonSchulz(G, iters);
    ctx.clearRect(0, 0, W, H);

    const cx1 = W * 0.27, cx2 = W * 0.73, cy = H * 0.42, scale = 34;
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx1, cy, scale, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx2, cy, scale, 0, Math.PI * 2); ctx.stroke();

    const G0 = scalarMul(G, 1 / frobNorm(G));
    drawTransformed(G0, cx1, cy, scale, '#e0745a', 0.18);
    drawTransformed(X, cx2, cy, scale, '#37b073', 0.18);

    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = cssVar('--fg-mute');
    ctx.fillText('before (raw update)', cx1, H * 0.42 + scale + 22);
    ctx.fillText(`after ${iters} NS step${iters === 1 ? '' : 's'}`, cx2, H * 0.42 + scale + 22);

    const svBefore = singularValues(G0);
    const svAfter = singularValues(X);
    const ratioBefore = svBefore[0] / svBefore[1];
    const ratioAfter = svAfter[0] / svAfter[1];

    readout.innerHTML = `
      <div>singular values before: <b>${svBefore[0].toFixed(3)}, ${svBefore[1].toFixed(3)}</b> &mdash; ratio ${ratioBefore.toFixed(2)}×</div>
      <div>singular values after: <b>${svAfter[0].toFixed(3)}, ${svAfter[1].toFixed(3)}</b> &mdash; ratio ${ratioAfter.toFixed(2)}×</div>
      <div class="tag">Muon uses exactly 5 iterations in practice — the ratio, not the absolute scale, is what converges.</div>
    `;
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    current = btn.dataset.key;
    picker.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });
  itersSlider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: Optimizer state memory
 * For a model with N parameters, how much extra memory does the
 * optimizer's own state cost, on top of the parameters and gradients
 * every method needs regardless. Drag model size; see it in GB.
 * ===================================================================== */
(function memoryOverhead() {
  const host = document.getElementById('memory-overhead');
  if (!host) return;

  // Extra optimizer-state memory as a multiple of N (model parameter count).
  // Shampoo/SOAP are layer-shape-dependent (can exceed 2N for wide layers)
  // so shown as a range rather than a single multiple.
  const METHODS = [
    { key: 'sgd', label: 'SGD', mult: 0, note: 'no extra state at all' },
    { key: 'mom', label: 'SGD + Momentum', mult: 1, note: 'one momentum buffer' },
    { key: 'adam', label: 'Adam / AdamW', mult: 2, note: 'momentum + second moment' },
    { key: 'lion', label: 'Lion', mult: 1, note: 'momentum only — half of Adam' },
    { key: 'muon', label: 'Muon', mult: 1, note: 'momentum only, then orthogonalized on the fly' },
    { key: 'adafactor', label: 'Adafactor', mult: 0.02, note: 'factored row/column sums, ~O(rows+cols) not O(N)' },
    { key: 'shampoo', label: 'Shampoo / SOAP', mult: null, note: 'per-layer d_in×d_in + d_out×d_out — can exceed 2N for wide layers' },
  ];

  host.insertAdjacentHTML('beforeend', `
    <canvas id="memCanvas" width="600" height="280"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">Model size (billions of parameters)</label>
        <input type="range" id="memN" min="0.1" max="500" step="0.1" value="7"/>
      </div>
      <div class="toggle-row">
        <button class="btn active" data-bytes="2">bf16 (2 bytes)</button>
        <button class="btn" data-bytes="4">fp32 (4 bytes)</button>
      </div>
      <div class="readout" id="memReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#memCanvas');
  const ctx = devicePx(cv, 600, 280);
  const nSlider = host.querySelector('#memN');
  const toggleRow = host.querySelector('.toggle-row');
  const readout = host.querySelector('#memReadout');
  const W = 600, H = 280;
  let bytesPerParam = 2;

  function draw() {
    const N_billion = parseFloat(nSlider.value);
    const N = N_billion * 1e9;
    const padL = 170, padR = 70, padT = 16, padB = 16;
    const rowH = (H - padT - padB) / METHODS.length;
    ctx.clearRect(0, 0, W, H);

    const maxGB = 2 * N * bytesPerParam / 1e9; // Adam's 2N sets the scale
    const xPix = (gb) => padL + (gb / maxGB) * (W - padL - padR);

    METHODS.forEach((m, i) => {
      const y = padT + i * rowH + rowH * 0.28;
      const barH = rowH * 0.5;
      const gb = m.mult === null ? maxGB * 0.55 : m.mult * N * bytesPerParam / 1e9;
      ctx.fillStyle = m.key === 'adam' ? cssVar('--fg-mute') : cssVar('--accent');
      ctx.globalAlpha = m.key === 'shampoo' ? 0.35 : 0.85;
      ctx.fillRect(xPix(0), y, Math.max(1, xPix(gb) - xPix(0)), barH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar('--fg'); ctx.font = '13px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(m.label, padL - 10, y + barH * 0.75);
      ctx.textAlign = 'left'; ctx.font = '12px monospace';
      const label = m.mult === null ? 'layer-dependent' : `${gb.toFixed(1)} GB`;
      ctx.fillText(label, xPix(gb) + 6, y + barH * 0.75);
    });

    readout.innerHTML = `
      <div>model size: <b>${N_billion.toFixed(1)}B</b> params, ${bytesPerParam === 2 ? 'bf16' : 'fp32'}</div>
      <div>Adam's extra state alone: <b>${(2 * N * bytesPerParam / 1e9).toFixed(1)} GB</b> — on top of the ${(N * bytesPerParam / 1e9).toFixed(1)} GB the parameters themselves already take</div>
      <div class="tag">Real example: AdamW needs ≥16 TPU v4 chips to fit ViT-B/16 at batch 4096; Lion's single momentum buffer needs only 8.</div>
    `;
  }

  nSlider.addEventListener('input', draw);
  toggleRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    bytesPerParam = parseInt(btn.dataset.bytes, 10);
    toggleRow.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });
  draw();
})();

/* =====================================================================
 * Widget 5: The critical batch size
 * The steps-vs-compute trade-off from the gradient noise scale: past
 * the critical batch size, bigger batches buy less and less wall-clock
 * speedup per unit of extra compute spent.
 * ===================================================================== */
(function criticalBatchSize() {
  const host = document.getElementById('critical-batch-size');
  if (!host) return;

  const REGIMES = {
    small: { label: 'small image classifier', Bcrit: 3000 },
    lm: { label: 'language model (tokens)', Bcrit: 100000 },
    rl: { label: 'large RL agent (Dota-scale)', Bcrit: 8000000 },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="cbsPicker"></div>
    <canvas id="cbsCanvas" width="600" height="300"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">Batch size (log scale)</label>
        <input type="range" id="cbsBatch" min="2" max="8" step="0.02" value="4.5"/>
      </div>
      <div class="readout" id="cbsReadout"></div>
    </div>
  `);

  const picker = host.querySelector('#cbsPicker');
  const cv = host.querySelector('#cbsCanvas');
  const ctx = devicePx(cv, 600, 300);
  const batchSlider = host.querySelector('#cbsBatch');
  const readout = host.querySelector('#cbsReadout');
  const W = 600, H = 300;

  Object.keys(REGIMES).forEach((key, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 1 ? ' active' : '');
    b.textContent = REGIMES[key].label;
    b.dataset.key = key;
    picker.appendChild(b);
  });
  let current = 'lm';

  function draw() {
    const Bcrit = REGIMES[current].Bcrit;
    const logB = parseFloat(batchSlider.value);
    const B = Math.pow(10, logB);
    const padL = 50, padR = 20, padT = 20, padB = 34;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);

    const logMin = 1, logMax = 8.3;
    const xPix = (lb) => padL + ((lb - logMin) / (logMax - logMin)) * (W - padL - padR);
    const yPix = (v) => padT + (1 - Math.min(v, 6) / 6) * (H - padT - padB);

    ctx.strokeStyle = rule; ctx.fillStyle = fg; ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
    [1, 2, 3, 4, 5, 6].forEach(v => {
      const y = yPix(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v + '×', padL - 6, y + 3);
    });
    ctx.textAlign = 'center';
    ctx.fillText('batch size (log scale) →', (padL + W - padR) / 2, H - 8);

    function plot(fn, color) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.2;
      for (let i = 0; i <= 100; i++) {
        const lb = logMin + (i / 100) * (logMax - logMin);
        const b = Math.pow(10, lb);
        const v = fn(b);
        const x = xPix(lb), y = yPix(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const stepsRel = (b) => 1 + Bcrit / b;
    const examplesRel = (b) => 1 + b / Bcrit;
    plot(stepsRel, '#5fa9ff');
    plot(examplesRel, cssVar('--accent'));

    // critical batch size marker
    const critLog = Math.log10(Bcrit);
    ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = fg; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(xPix(critLog), padT); ctx.lineTo(xPix(critLog), H - padB); ctx.stroke();
    ctx.restore();

    // current batch marker
    ctx.strokeStyle = cssVar('--fg'); ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(xPix(logB), padT); ctx.lineTo(xPix(logB), H - padB); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
    ctx.fillStyle = '#5fa9ff'; ctx.fillText('steps needed (wall-clock)', padL + 6, yPix(stepsRel(Math.pow(10,logMin+0.3))) - 6);
    ctx.fillStyle = cssVar('--accent'); ctx.fillText('examples processed (compute)', padL + 6, 32);

    readout.innerHTML = `
      <div>batch size: <b>${Math.round(B).toLocaleString()}</b> &mdash; critical batch size (this regime): <b>${Bcrit.toLocaleString()}</b></div>
      <div>steps needed: <b>${stepsRel(B).toFixed(2)}×</b> the minimum &mdash; examples processed: <b>${examplesRel(B).toFixed(2)}×</b> the minimum</div>
      <div class="tag">${B < Bcrit ? 'Below critical: more parallelism is nearly free — steps drop fast, compute barely rises.' : 'Above critical: you are mostly buying wasted compute for a shrinking wall-clock win.'}</div>
    `;
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    current = btn.dataset.key;
    picker.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });
  batchSlider.addEventListener('input', draw);
  draw();
})();
