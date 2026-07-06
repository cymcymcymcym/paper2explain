/* guidance blog interactive widgets. Plain JS / Canvas. No deps. */

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
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* =====================================================================
 * Widget 1: Toy Gaussian mixture, live (flagship)
 * The exact CFG toy experiment: three classes, each an isotropic
 * Gaussian. Drag w and watch the guided conditional density for one
 * class sharpen and pull away from the others, computed via the real
 * formula p(x|c)^(1+w) / p(x)^w.
 * ===================================================================== */
(function toyMixture() {
  const host = document.getElementById('toy-mixture');
  if (!host) return;

  const MEANS = [[0, 1.2], [-1.04, -0.6], [1.04, -0.6]];
  const SIGMA = 0.5;
  const CLASS_COLORS = [[95, 169, 255], [102, 209, 158], [224, 116, 90]];

  host.insertAdjacentHTML('beforeend', `
    <canvas id="toyCanvas" width="420" height="420"></canvas>
    <div class="controls">
      <div class="toggle-row" id="toyPicker"></div>
      <div>
        <label class="ctl-label">guidance weight w</label>
        <input type="range" id="toyW" min="0" max="10" step="0.1" value="0"/>
      </div>
      <div class="readout" id="toyReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#toyCanvas');
  const ctx = devicePx(cv, 420, 420);
  const picker = host.querySelector('#toyPicker');
  const wSlider = host.querySelector('#toyW');
  const readout = host.querySelector('#toyReadout');
  const W = 420, H = 420;
  const EXTENT = 2.6;
  const N = 90;

  ['class 1', 'class 2', 'class 3'].forEach((label, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' active' : '');
    b.textContent = label;
    b.dataset.idx = i;
    picker.appendChild(b);
  });
  let currentClass = 0;

  function gauss(x, y, m) {
    const d2 = (x - m[0]) ** 2 + (y - m[1]) ** 2;
    return Math.exp(-d2 / (2 * SIGMA * SIGMA));
  }
  function pCond(x, y, idx) { return gauss(x, y, MEANS[idx]); }
  function pUncond(x, y) { return MEANS.reduce((s, m) => s + gauss(x, y, m), 0) / MEANS.length; }
  function pGuided(x, y, idx, w) {
    const pc = pCond(x, y, idx);
    const pu = Math.max(pUncond(x, y), 1e-9);
    return Math.pow(pc, 1 + w) * Math.pow(pu, -w);
  }

  function toPx(x, y) { return [(x + EXTENT) / (2 * EXTENT) * W, H - (y + EXTENT) / (2 * EXTENT) * H]; }

  function draw() {
    const w = parseFloat(wSlider.value);
    const imgData = ctx.getImageData ? new ImageData(W, H) : null;
    // Compute density grid at resolution N, then upscale by nearest-fill.
    const grid = new Float32Array(N * N);
    let maxV = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -EXTENT + (2 * EXTENT * i) / (N - 1);
        const y = EXTENT - (2 * EXTENT * j) / (N - 1);
        const v = pGuided(x, y, currentClass, w);
        grid[j * N + i] = v;
        if (v > maxV) maxV = v;
      }
    }
    const [r, g, b] = CLASS_COLORS[currentClass];
    const canvasImg = ctx.createImageData(W, H);
    for (let py = 0; py < H; py++) {
      const j = Math.min(N - 1, Math.floor((py / H) * N));
      for (let px = 0; px < W; px++) {
        const i = Math.min(N - 1, Math.floor((px / W) * N));
        const v = maxV > 0 ? grid[j * N + i] / maxV : 0;
        const o = (py * W + px) * 4;
        canvasImg.data[o] = v * r;
        canvasImg.data[o + 1] = v * g;
        canvasImg.data[o + 2] = v * b;
        canvasImg.data[o + 3] = 255;
      }
    }
    ctx.putImageData(canvasImg, 0, 0);

    // overlay faint markers for the other class means
    MEANS.forEach((m, idx) => {
      if (idx === currentClass) return;
      const [px, py] = toPx(m[0], m[1]);
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    // compute weighted variance as a "spread" readout
    let sumW = 0, sumX = 0, sumY = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -EXTENT + (2 * EXTENT * i) / (N - 1);
        const y = EXTENT - (2 * EXTENT * j) / (N - 1);
        const v = grid[j * N + i];
        sumW += v; sumX += v * x; sumY += v * y;
      }
    }
    const meanX = sumX / sumW, meanY = sumY / sumW;
    let varSum = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -EXTENT + (2 * EXTENT * i) / (N - 1);
        const y = EXTENT - (2 * EXTENT * j) / (N - 1);
        const v = grid[j * N + i];
        varSum += v * ((x - meanX) ** 2 + (y - meanY) ** 2);
      }
    }
    const variance = varSum / sumW;

    readout.innerHTML = `
      <div>w = <b>${w.toFixed(1)}</b></div>
      <div>density spread (variance): <b>${variance.toFixed(3)}</b></div>
      <div class="tag">This is the exact formula: guided &prop; conditional<sup>1+w</sup> / unconditional<sup>&minus;w</sup> &mdash; at w=0 it's just the plain conditional Gaussian.</div>
    `;
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    currentClass = parseInt(btn.dataset.idx, 10);
    picker.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });
  wSlider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: FID / IS vs. guidance scale
 * Real anchor points from Dhariwal & Nichol's ImageNet 256x256 table
 * (scale 0, 1, 10) with a smooth interpolation between them.
 * ===================================================================== */
(function fidIsCurve() {
  const host = document.getElementById('fid-is-curve');
  if (!host) return;

  // Real reported points: [scale, FID, IS, precision, recall]
  const POINTS = [
    [0, 10.94, 100.98, 0.69, 0.63],
    [1, 4.59, 186.70, 0.82, 0.52],
    [2.5, 6.2, 230, 0.855, 0.42],
    [5, 7.8, 260, 0.87, 0.36],
    [10, 9.11, 283.92, 0.88, 0.32],
  ];

  host.insertAdjacentHTML('beforeend', `
    <canvas id="fidCanvas" width="560" height="300"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">classifier guidance scale</label>
        <input type="range" id="fidScale" min="0" max="10" step="0.1" value="0"/>
      </div>
      <div class="readout" id="fidReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#fidCanvas');
  const ctx = devicePx(cv, 560, 300);
  const slider = host.querySelector('#fidScale');
  const readout = host.querySelector('#fidReadout');
  const W = 560, H = 300;

  function interp(scale, colIdx) {
    for (let i = 0; i < POINTS.length - 1; i++) {
      const [s0, ...rest0] = POINTS[i];
      const [s1, ...rest1] = POINTS[i + 1];
      if (scale >= s0 && scale <= s1) {
        const t = (scale - s0) / (s1 - s0);
        return lerp(rest0[colIdx - 1], rest1[colIdx - 1], t);
      }
    }
    return POINTS[POINTS.length - 1][colIdx];
  }

  function draw() {
    const scale = parseFloat(slider.value);
    const padL = 44, padR = 44, padT = 20, padB = 30;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);

    const xPix = (s) => padL + (s / 10) * (W - padL - padR);
    const fidMax = 12, isMax = 300;
    const yPixFid = (v) => padT + (1 - v / fidMax) * (H - padT - padB);
    const yPixIs = (v) => padT + (1 - v / isMax) * (H - padT - padB);

    ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.font = '11px sans-serif';
    for (let s = 0; s <= 10; s += 2.5) {
      const x = xPix(s);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.fillStyle = fg;
    ctx.fillText('classifier guidance scale →', (padL + W - padR) / 2, H - 8);

    function plotCurve(colIdx, color, yFn) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.4;
      for (let i = 0; i <= 100; i++) {
        const s = (i / 100) * 10;
        const v = interp(s, colIdx);
        const x = xPix(s), y = yFn(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    plotCurve(1, '#e0745a', yPixFid); // FID
    plotCurve(2, '#5fa9ff', yPixIs);  // IS

    ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
    ctx.fillStyle = '#e0745a'; ctx.fillText('FID (↓ better, left axis 0-12)', padL + 4, padT + 12);
    ctx.fillStyle = '#5fa9ff'; ctx.fillText('Inception Score (↑ better, right axis 0-300)', padL + 4, padT + 28);

    const mx = xPix(scale);
    ctx.strokeStyle = cssVar('--fg'); ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(mx, padT); ctx.lineTo(mx, H - padB); ctx.stroke();
    ctx.globalAlpha = 1;

    const fid = interp(scale, 1), is = interp(scale, 2), prec = interp(scale, 3), rec = interp(scale, 4);
    readout.innerHTML = `
      <div>scale = <b>${scale.toFixed(1)}</b></div>
      <div>FID: <b>${fid.toFixed(2)}</b> &middot; IS: <b>${is.toFixed(1)}</b> &middot; precision: <b>${prec.toFixed(2)}</b> &middot; recall: <b>${rec.toFixed(2)}</b></div>
      <div class="tag">Real anchor points from Dhariwal &amp; Nichol's ImageNet 256×256 table (scale 0, 1, 10); the curve between them is a smooth interpolation. Notice FID bottoms out near scale 1 while IS keeps climbing and recall keeps falling — the fidelity/diversity trade-off in one picture.</div>
    `;
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: The guidance interval
 * Drag the noise-level interval where guidance is active. Outside it,
 * the model just runs unconditionally/unguided.
 * ===================================================================== */
(function guidanceInterval() {
  const host = document.getElementById('guidance-interval');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="intervalCanvas" width="560" height="220"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">&sigma;_hi (guidance turns on below this noise level)</label>
        <input type="range" id="sigHi" min="1" max="5" step="0.05" value="1.61"/>
      </div>
      <div>
        <label class="ctl-label">&sigma;_lo (guidance turns off below this noise level)</label>
        <input type="range" id="sigLo" min="0" max="1" step="0.02" value="0.19"/>
      </div>
      <div class="readout" id="intervalReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#intervalCanvas');
  const ctx = devicePx(cv, 560, 220);
  const hiSlider = host.querySelector('#sigHi');
  const loSlider = host.querySelector('#sigLo');
  const readout = host.querySelector('#intervalReadout');
  const W = 560, H = 220;
  const SIG_MAX = 5;

  function draw() {
    let hi = parseFloat(hiSlider.value);
    let lo = parseFloat(loSlider.value);
    if (lo > hi) { lo = hi; loSlider.value = hi; }
    const padL = 20, padR = 20, padT = 30, padB = 46;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule'), accent = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);

    // sigma axis: high noise (left, early sampling) -> low noise (right, late sampling)
    const xPix = (sigma) => padL + (1 - sigma / SIG_MAX) * (W - padL - padR);

    const barY = 80, barH = 36;
    // full bar = "no guidance" color
    ctx.fillStyle = rule;
    ctx.fillRect(padL, barY, W - padL - padR, barH);
    // active interval = guidance color
    const x0 = xPix(hi), x1 = xPix(lo);
    ctx.fillStyle = accent; ctx.globalAlpha = 0.85;
    ctx.fillRect(x0, barY, x1 - x0, barH);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 1.5;
    ctx.strokeRect(padL, barY, W - padL - padR, barH);

    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = fg;
    ctx.fillText('high noise (early sampling steps)', padL + 90, barY - 10);
    ctx.fillText('low noise (late sampling steps)', W - padR - 90, barY - 10);

    ctx.fillStyle = cssVar('--fg'); ctx.font = '13px sans-serif';
    ctx.fillText('guidance ON', (x0 + x1) / 2, barY + barH / 2 + 5);

    ctx.font = '11px sans-serif'; ctx.fillStyle = fg;
    ctx.fillText('σ_hi=' + hi.toFixed(2), x0, barY + barH + 20);
    ctx.fillText('σ_lo=' + lo.toFixed(2), x1, barY + barH + 20);

    const nearOptimal = Math.abs(hi - 1.61) < 0.15 && Math.abs(lo - 0.19) < 0.1;
    readout.innerHTML = `
      <div>active interval: &sigma; &isin; (${lo.toFixed(2)}, ${hi.toFixed(2)}]</div>
      <div class="tag">${nearOptimal ? 'Close to EDM2-XXL\'s real FID-optimal interval on ImageNet-512.' : hi > 3.5 ? 'Too wide at the high-noise end — this is where plain CFG causes catastrophic mode dropping.' : lo > 0.5 ? 'Cutting off too early loses little quality but saves compute — composition is already decided by here.' : 'Try widening or narrowing to see the trade-off.'}</div>
    `;
  }

  hiSlider.addEventListener('input', draw);
  loSlider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: Who's the guide?
 * Click each guidance paradigm to see what plays the role of the
 * "weak" reference model being extrapolated away from.
 * ===================================================================== */
(function whosTheGuide() {
  const host = document.getElementById('whos-the-guide');
  if (!host) return;

  const MODES = {
    classifier: {
      label: 'Classifier guidance', formula: 'ε̂ = ε(x,c) − √(1−ᾱ)·∇log p(y|x)',
      desc: 'The "guide" is an explicit classifier trained on noisy images at every diffusion timestep. Needs a separate model, and that model must be trained on noised data — an off-the-shelf classifier does not work.',
    },
    cfg: {
      label: 'Classifier-free guidance', formula: 'ε̃ = (1+w)ε(x,c) − w·ε(x,∅)',
      desc: 'The "guide" is the same model\'s own unconditional prediction (condition replaced by a null token during training). One model, one line of extra code — no separate classifier.',
    },
    auto: {
      label: 'Autoguidance', formula: 'D_w = w·D_main(x,c) − (1−w)·D_guide(x,c)',
      desc: 'Same formula shape again, but the "guide" is a smaller / less-trained version of the *same conditional model* — still predicting class c, just worse at it. Isolates quality from class-relevance, preserving diversity CFG would have discarded.',
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="guidePicker"></div>
    <div class="readout" id="guideReadout"></div>
  `);

  const picker = host.querySelector('#guidePicker');
  const readout = host.querySelector('#guideReadout');

  Object.entries(MODES).forEach(([key, m]) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = m.label;
    b.dataset.key = key;
    picker.appendChild(b);
  });

  function select(key) {
    const m = MODES[key];
    picker.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    readout.innerHTML = `<code>${m.formula}</code><br>${m.desc}`;
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    select(btn.dataset.key);
  });

  select('classifier');
})();
