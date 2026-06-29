/* High-dimensional geometry blog widgets. Plain JS / Canvas. No deps. */

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

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function randn() {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* lgamma via Lanczos. */
function lgamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/* log V_n = (n/2) log pi - lgamma(n/2 + 1). */
function logVolBall(n) {
  return (n / 2) * Math.log(Math.PI) - lgamma(n / 2 + 1);
}

/* =====================================================================
 * Widget 1: vol-of-ball
 * Bar plot of V_n (unit ball volume) over n on a log y-axis. Slider
 * highlights a chosen n with the actual value of V_n.
 * ===================================================================== */
(function volBallWidget() {
  const host = document.getElementById('vol-of-ball');
  if (!host) return;

  const N_MAX = 200;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="volCanvas" width="640" height="320"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">dimension n</label>
          <input type="range" id="volSlider" min="1" max="${N_MAX}" step="1" value="10"/>
        </div>
        <div class="readout" id="volReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#volCanvas');
  const ctx = devicePx(cv, 640, 320);
  const slider = host.querySelector('#volSlider');
  const readout = host.querySelector('#volReadout');
  const W = 640, H = 320;

  // Precompute log volumes
  const logV = [];
  for (let n = 1; n <= N_MAX; n++) logV.push(logVolBall(n));
  const logVmax = Math.max(...logV);
  const logVmin = Math.min(...logV);

  function draw() {
    const n = parseInt(slider.value);
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    // Axes
    const left = 60, right = W - 30, top = 40, bot = H - 40;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, bot); ctx.lineTo(right, bot);
    ctx.stroke();

    // Y labels (log scale)
    ctx.fillStyle = mute; ctx.textAlign = 'right';
    for (let exp = -100; exp <= 0; exp += 20) {
      const ln = exp * Math.LN10;
      if (ln > logVmax || ln < logVmin) continue;
      const y = bot - (ln - logVmin) / (logVmax - logVmin) * (bot - top);
      ctx.fillText(`10^${exp}`, left - 4, y + 4);
      ctx.beginPath();
      ctx.moveTo(left - 2, y); ctx.lineTo(left, y); ctx.stroke();
    }
    // Mark log10(V) = 0 (V=1) and the peak
    const yPeak = bot - (logVmax - logVmin) / (logVmax - logVmin) * (bot - top);
    ctx.strokeStyle = mute; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(left, yPeak); ctx.lineTo(right, yPeak); ctx.stroke();
    ctx.setLineDash([]);

    // X labels
    ctx.textAlign = 'center';
    [1, 25, 50, 100, 150, 200].forEach(nn => {
      const x = left + (nn - 1) / (N_MAX - 1) * (right - left);
      ctx.fillText(nn, x, bot + 14);
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    });

    // Bars
    const barW = (right - left) / N_MAX;
    for (let i = 0; i < N_MAX; i++) {
      const ln = logV[i];
      const y = bot - (ln - logVmin) / (logVmax - logVmin) * (bot - top);
      const isSelected = (i + 1) === n;
      ctx.fillStyle = isSelected ? accent : blue;
      ctx.globalAlpha = isSelected ? 1.0 : 0.55;
      ctx.fillRect(left + i * barW, y, barW * 0.85, bot - y);
    }
    ctx.globalAlpha = 1;

    // Title text
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('log₁₀ V_n  (volume of unit ball in ℝⁿ)', left, top - 14);

    // Selected value pointer
    const xSel = left + (n - 1) / (N_MAX - 1) * (right - left);
    const ySel = bot - (logV[n-1] - logVmin) / (logVmax - logVmin) * (bot - top);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(xSel + barW * 0.4, ySel, 4, 0, 2 * Math.PI); ctx.fill();

    const v = Math.exp(logV[n-1]);
    let vStr;
    if (v >= 0.01) vStr = v.toFixed(3);
    else vStr = v.toExponential(2);
    const peakN = logV.indexOf(logVmax) + 1;
    readout.innerHTML =
      `n = <b>${n}</b><br>V_n = <b>${vStr}</b>
       <div class="note">peak at n = ${peakN}, V_${peakN} ≈ ${Math.exp(logVmax).toFixed(2)}</div>`;
  }

  slider.addEventListener('input', draw);
  draw();
})();


/* =====================================================================
 * Widget 2: gaussian-norm
 * Sample 5000 Gaussian vectors of dimension d, histogram their norms,
 * mark sqrt(d). Slider controls d.
 * ===================================================================== */
(function gaussianNormWidget() {
  const host = document.getElementById('gaussian-norm');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="gnCanvas" width="640" height="320"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">dimension d</label>
          <input type="range" id="gnSlider" min="1" max="500" step="1" value="20"/>
        </div>
        <div class="readout" id="gnReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#gnCanvas');
  const ctx = devicePx(cv, 640, 320);
  const slider = host.querySelector('#gnSlider');
  const readout = host.querySelector('#gnReadout');
  const W = 640, H = 320;

  const N_SAMPLES = 5000;
  const BINS = 60;

  function sampleNorms(d) {
    const norms = new Float64Array(N_SAMPLES);
    for (let i = 0; i < N_SAMPLES; i++) {
      let s = 0;
      for (let j = 0; j < d; j++) {
        const x = randn();
        s += x * x;
      }
      norms[i] = Math.sqrt(s);
    }
    return norms;
  }

  function draw() {
    const d = parseInt(slider.value);
    const sqrtD = Math.sqrt(d);
    const norms = sampleNorms(d);
    const mean = norms.reduce((a, b) => a + b, 0) / norms.length;
    let var_ = 0;
    for (let i = 0; i < norms.length; i++) var_ += (norms[i] - mean) ** 2;
    var_ /= norms.length;
    const std = Math.sqrt(var_);

    // x range: 0 to ~sqrt(500)+a few = 24, but adaptive
    const xMax = Math.max(sqrtD + 4 * std, 5);
    const xMin = 0;

    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    const left = 60, right = W - 30, top = 40, bot = H - 40;
    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, bot); ctx.lineTo(right, bot); ctx.stroke();

    // Histogram
    const hist = new Array(BINS).fill(0);
    for (let i = 0; i < norms.length; i++) {
      const t = (norms[i] - xMin) / (xMax - xMin);
      const b = Math.floor(t * BINS);
      if (b >= 0 && b < BINS) hist[b]++;
    }
    const maxBin = Math.max(...hist);
    const barW = (right - left) / BINS;
    for (let i = 0; i < BINS; i++) {
      const h = (hist[i] / maxBin) * (bot - top - 10);
      const x = left + i * barW;
      ctx.fillStyle = blue;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(x, bot - h, barW * 0.92, h);
    }
    ctx.globalAlpha = 1;

    // sqrt(d) marker
    const xMark = left + (sqrtD - xMin) / (xMax - xMin) * (right - left);
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(xMark, top); ctx.lineTo(xMark, bot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`√d ≈ ${sqrtD.toFixed(2)}`, xMark + 4, top + 14);

    // X labels
    ctx.fillStyle = mute;
    ctx.textAlign = 'center';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    const nTicks = 6;
    for (let i = 0; i <= nTicks; i++) {
      const xVal = xMin + (i / nTicks) * (xMax - xMin);
      const x = left + i / nTicks * (right - left);
      ctx.fillText(xVal.toFixed(1), x, bot + 14);
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`histogram of ‖X‖, X ~ N(0, I_d), 5000 samples`, left, top - 14);

    readout.innerHTML =
      `d = <b>${d}</b>, √d = <b>${sqrtD.toFixed(2)}</b><br>
       sample mean = <b>${mean.toFixed(2)}</b>, std = <b>${std.toFixed(3)}</b>
       <div class="note">relative width = std/mean = ${(std/mean*100).toFixed(2)}% (→ 0 as 1/√d)</div>`;
  }

  slider.addEventListener('input', draw);
  draw();
})();


/* =====================================================================
 * Widget 3: orange-peel
 * Sliders for n (dim) and epsilon (shell thickness). Show the 2D
 * cross-section with the shell highlighted, and the true fraction
 * 1 - (1-eps)^n.
 * ===================================================================== */
(function orangePeelWidget() {
  const host = document.getElementById('orange-peel');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="peelCanvas" width="640" height="320"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">dimension n</label>
          <input type="range" id="peelN" min="1" max="500" step="1" value="20"/>
        </div>
        <div class="slider-wrap">
          <label class="slider-label">peel thickness ε (fraction of radius)</label>
          <input type="range" id="peelEps" min="0.005" max="0.5" step="0.005" value="0.05"/>
        </div>
        <div class="readout" id="peelReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#peelCanvas');
  const ctx = devicePx(cv, 640, 320);
  const sN = host.querySelector('#peelN');
  const sE = host.querySelector('#peelEps');
  const readout = host.querySelector('#peelReadout');
  const W = 640, H = 320;

  function draw() {
    const n = parseInt(sN.value);
    const eps = parseFloat(sE.value);
    const frac = 1 - Math.pow(1 - eps, n);

    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    // Left: ball cross-section
    const cx = 160, cy = H / 2, R = 110;
    ctx.fillStyle = blue;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.arc(cx, cy, R * (1 - eps), 0, 2 * Math.PI, true);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * (1 - eps), 0, 2 * Math.PI); ctx.stroke();

    ctx.fillStyle = mute;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('2-D cross-section', cx, cy + R + 26);
    ctx.fillStyle = accent;
    ctx.textAlign = 'center';
    ctx.fillText('shell', cx, cy - R - 8);

    // Right: bar showing fraction
    const barLeft = 340, barRight = W - 30, barTop = 60, barBot = H - 60;
    ctx.fillStyle = mute;
    ctx.textAlign = 'left';
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('fraction of ball volume in outer shell:', barLeft, barTop - 22);

    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.strokeRect(barLeft, barTop, barRight - barLeft, barBot - barTop);
    ctx.fillStyle = accent;
    ctx.fillRect(barLeft, barBot - (barBot - barTop) * frac,
                  barRight - barLeft, (barBot - barTop) * frac);

    ctx.fillStyle = fg;
    ctx.font = '24px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${(frac * 100).toFixed(2)}%`,
                  (barLeft + barRight) / 2, barBot + 30);

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = mute;
    ctx.fillText(`1 − (1 − ε)ⁿ = 1 − (1 − ${eps.toFixed(3)})^${n}`,
                  (barLeft + barRight) / 2, barTop - 4);

    readout.innerHTML =
      `n = <b>${n}</b>, ε = <b>${eps.toFixed(3)}</b><br>
       in outer ε-shell: <b>${(frac * 100).toFixed(2)}%</b>
       <div class="note">${frac > 0.9 ? 'essentially all volume is in the peel'
         : frac > 0.5 ? 'majority in the peel'
         : frac > 0.1 ? 'substantial but not dominant'
         : 'low-dim regime — most volume is interior'}</div>`;
  }

  sN.addEventListener('input', draw);
  sE.addEventListener('input', draw);
  draw();
})();


/* =====================================================================
 * Widget 4: spiky-cube
 * Left: 2D illustration of square + inscribed disk.
 * Right: log plot of V_ball / V_cube vs n.
 * ===================================================================== */
(function spikyCubeWidget() {
  const host = document.getElementById('spiky-cube');
  if (!host) return;

  const N_MAX = 50;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="cubeCanvas" width="640" height="320"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">dimension n</label>
          <input type="range" id="cubeSlider" min="2" max="${N_MAX}" step="1" value="3"/>
        </div>
        <div class="readout" id="cubeReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#cubeCanvas');
  const ctx = devicePx(cv, 640, 320);
  const slider = host.querySelector('#cubeSlider');
  const readout = host.querySelector('#cubeReadout');
  const W = 640, H = 320;

  // log ratio = logV_n - n log 2
  const logRatios = [];
  for (let n = 1; n <= N_MAX; n++) {
    logRatios.push(logVolBall(n) - n * Math.log(2));
  }
  const rMin = Math.min(...logRatios);
  const rMax = Math.max(...logRatios);

  function draw() {
    const n = parseInt(slider.value);
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    // Left: 2D illustration
    const cx = 130, cy = H / 2, side = 200;
    ctx.fillStyle = blue;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(cx - side/2, cy - side/2, side, side);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = blue; ctx.lineWidth = 2;
    ctx.strokeRect(cx - side/2, cy - side/2, side, side);

    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(cx, cy, side/2, 0, 2 * Math.PI); ctx.fill();
    ctx.globalAlpha = 1;

    // Mark a corner-to-center diagonal
    ctx.strokeStyle = fg; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + side/2, cy - side/2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = fg;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`corner at √n = ${Math.sqrt(n).toFixed(2)}`, cx + side/2 + 6, cy - side/2 + 10);
    ctx.fillText(`face at 1`, cx + side/2 + 6, cy - 4);

    ctx.fillStyle = mute;
    ctx.textAlign = 'center';
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('2-D: ball fills disk well', cx, cy + side/2 + 24);

    // Right: log ratio plot
    const left = 340, right = W - 30, top = 50, bot = H - 50;
    ctx.strokeStyle = mute;
    ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, bot); ctx.lineTo(right, bot); ctx.stroke();

    // Plot the log ratio curve
    ctx.strokeStyle = blue; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < N_MAX; i++) {
      const x = left + i / (N_MAX - 1) * (right - left);
      const y = bot - (logRatios[i] - rMin) / (rMax - rMin) * (bot - top);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Selected point
    const xSel = left + (n - 1) / (N_MAX - 1) * (right - left);
    const ySel = bot - (logRatios[n-1] - rMin) / (rMax - rMin) * (bot - top);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(xSel, ySel, 5, 0, 2 * Math.PI); ctx.fill();

    // Y axis labels (log10)
    ctx.fillStyle = mute;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    [0, -5, -10, -15, -20, -25, -30].forEach(exp => {
      const ln = exp * Math.LN10;
      if (ln < rMin || ln > rMax) return;
      const y = bot - (ln - rMin) / (rMax - rMin) * (bot - top);
      ctx.fillText(exp === 0 ? '1' : `10^${exp}`, left - 4, y + 4);
      ctx.beginPath(); ctx.moveTo(left - 2, y); ctx.lineTo(left, y); ctx.stroke();
    });

    // X axis labels
    ctx.textAlign = 'center';
    [2, 10, 20, 30, 40, 50].forEach(nn => {
      const x = left + (nn - 1) / (N_MAX - 1) * (right - left);
      ctx.fillText(nn, x, bot + 14);
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    });

    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('V(inscribed ball) / V(cube), log scale', left, top - 12);

    const r = Math.exp(logRatios[n-1]);
    const rStr = r > 0.01 ? r.toFixed(4) : r.toExponential(2);
    readout.innerHTML =
      `n = <b>${n}</b><br>
       V_ball / V_cube = <b>${rStr}</b><br>
       corner distance = <b>√n = ${Math.sqrt(n).toFixed(2)}</b>
       <div class="note">${n <= 3 ? 'ball is most of the cube' :
         n <= 10 ? 'ball is shrinking fast' :
         n <= 30 ? 'cube is almost all corners now' :
         'inscribed ball is essentially invisible'}</div>`;
  }

  slider.addEventListener('input', draw);
  draw();
})();


/* =====================================================================
 * Widget 5: orthogonality
 * Sample 4000 pairs of unit vectors in R^n, histogram their angles.
 * ===================================================================== */
(function orthogonalityWidget() {
  const host = document.getElementById('orthogonality');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="orthCanvas" width="640" height="320"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">dimension n</label>
          <input type="range" id="orthSlider" min="2" max="500" step="1" value="3"/>
        </div>
        <div class="readout" id="orthReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#orthCanvas');
  const ctx = devicePx(cv, 640, 320);
  const slider = host.querySelector('#orthSlider');
  const readout = host.querySelector('#orthReadout');
  const W = 640, H = 320;

  const N_SAMPLES = 4000;
  const BINS = 60;

  function sampleAngles(n) {
    const angles = new Float64Array(N_SAMPLES);
    for (let i = 0; i < N_SAMPLES; i++) {
      let dot = 0, na = 0, nb = 0;
      for (let j = 0; j < n; j++) {
        const a = randn(), b = randn();
        dot += a * b; na += a * a; nb += b * b;
      }
      const cos = dot / Math.sqrt(na * nb);
      angles[i] = Math.acos(clamp(cos, -1, 1)) * 180 / Math.PI;
    }
    return angles;
  }

  function draw() {
    const n = parseInt(slider.value);
    const angles = sampleAngles(n);
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    let var_ = 0;
    for (let i = 0; i < angles.length; i++) var_ += (angles[i] - mean) ** 2;
    var_ /= angles.length;
    const std = Math.sqrt(var_);

    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    const left = 60, right = W - 30, top = 40, bot = H - 40;
    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, bot); ctx.lineTo(right, bot); ctx.stroke();

    // Histogram on [0, 180]
    const hist = new Array(BINS).fill(0);
    for (let i = 0; i < angles.length; i++) {
      const b = Math.floor(angles[i] / 180 * BINS);
      if (b >= 0 && b < BINS) hist[b]++;
    }
    const maxBin = Math.max(...hist);
    const barW = (right - left) / BINS;
    for (let i = 0; i < BINS; i++) {
      const h = (hist[i] / maxBin) * (bot - top - 10);
      const x = left + i * barW;
      ctx.fillStyle = blue;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(x, bot - h, barW * 0.92, h);
    }
    ctx.globalAlpha = 1;

    // 90 degree marker
    const xMark = left + (90 / 180) * (right - left);
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(xMark, top); ctx.lineTo(xMark, bot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('90°', xMark + 4, top + 14);

    // X labels
    ctx.fillStyle = mute;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    [0, 30, 60, 90, 120, 150, 180].forEach(a => {
      const x = left + (a / 180) * (right - left);
      ctx.fillText(`${a}°`, x, bot + 14);
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    });

    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('angle between two random unit vectors in ℝⁿ', left, top - 14);

    // Theoretical std for cos: 1/sqrt(n) → std of angle near pi/2 is roughly 1/sqrt(n) rad
    const thStdDeg = (1 / Math.sqrt(n)) * 180 / Math.PI;
    readout.innerHTML =
      `n = <b>${n}</b><br>
       mean angle = <b>${mean.toFixed(2)}°</b>, std = <b>${std.toFixed(2)}°</b><br>
       <div class="note">theoretical std ≈ 1/√n × (180/π) = ${thStdDeg.toFixed(2)}°</div>`;
  }

  slider.addEventListener('input', draw);
  draw();
})();


/* =====================================================================
 * Widget 6: distance-concentration
 * Sample 200 points uniformly in [0,1]^n; show histogram of pairwise
 * distances and max/min ratio.
 * ===================================================================== */
(function distanceWidget() {
  const host = document.getElementById('distance-concentration');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="distCanvas" width="640" height="320"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">dimension n</label>
          <input type="range" id="distSlider" min="1" max="500" step="1" value="3"/>
        </div>
        <div class="readout" id="distReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#distCanvas');
  const ctx = devicePx(cv, 640, 320);
  const slider = host.querySelector('#distSlider');
  const readout = host.querySelector('#distReadout');
  const W = 640, H = 320;

  const N_POINTS = 120;
  const BINS = 50;

  function sampleDistances(n) {
    // n_points points in [0,1]^n, return all pairwise distances
    const pts = [];
    for (let i = 0; i < N_POINTS; i++) {
      const p = new Float64Array(n);
      for (let j = 0; j < n; j++) p[j] = Math.random();
      pts.push(p);
    }
    const dists = [];
    for (let i = 0; i < N_POINTS; i++) {
      for (let j = i + 1; j < N_POINTS; j++) {
        let s = 0;
        for (let k = 0; k < n; k++) {
          const d = pts[i][k] - pts[j][k];
          s += d * d;
        }
        dists.push(Math.sqrt(s));
      }
    }
    return dists;
  }

  function draw() {
    const n = parseInt(slider.value);
    const dists = sampleDistances(n);
    const mn = Math.min(...dists);
    const mx = Math.max(...dists);
    const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
    const ratio = mx / mn;

    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    const left = 60, right = W - 30, top = 40, bot = H - 40;
    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, bot); ctx.lineTo(right, bot); ctx.stroke();

    // Pad axis a little
    const pad = (mx - mn) * 0.1 || 0.1;
    const xMin = Math.max(0, mn - pad), xMax = mx + pad;

    const hist = new Array(BINS).fill(0);
    for (let i = 0; i < dists.length; i++) {
      const t = (dists[i] - xMin) / (xMax - xMin);
      const b = Math.floor(t * BINS);
      if (b >= 0 && b < BINS) hist[b]++;
    }
    const maxBin = Math.max(...hist);
    const barW = (right - left) / BINS;
    for (let i = 0; i < BINS; i++) {
      const h = (hist[i] / maxBin) * (bot - top - 10);
      const x = left + i * barW;
      ctx.fillStyle = blue;
      ctx.globalAlpha = 0.78;
      ctx.fillRect(x, bot - h, barW * 0.92, h);
    }
    ctx.globalAlpha = 1;

    // Mean marker
    const xMean = left + (mean - xMin) / (xMax - xMin) * (right - left);
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(xMean, top); ctx.lineTo(xMean, bot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`mean = ${mean.toFixed(2)}`, xMean + 4, top + 14);

    // X labels
    ctx.fillStyle = mute;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const nTicks = 6;
    for (let i = 0; i <= nTicks; i++) {
      const xVal = xMin + (i / nTicks) * (xMax - xMin);
      const x = left + i / nTicks * (right - left);
      ctx.fillText(xVal.toFixed(2), x, bot + 14);
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, bot + 3); ctx.stroke();
    }

    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`pairwise distances among 120 uniform points in [0,1]ⁿ`, left, top - 14);

    const theoreticalMean = Math.sqrt(n / 6);
    readout.innerHTML =
      `n = <b>${n}</b>, mean dist ≈ <b>${mean.toFixed(2)}</b> (theory √(n/6) = ${theoreticalMean.toFixed(2)})<br>
       max/min ratio = <b>${ratio.toFixed(2)}</b>
       <div class="note">${ratio > 3 ? 'large spread — neighbors meaningful' :
         ratio > 1.5 ? 'distances tightening' :
         ratio > 1.2 ? 'concentrating fast' :
         'all distances essentially equal — kNN is useless here'}</div>`;
  }

  slider.addEventListener('input', draw);
  draw();
})();
