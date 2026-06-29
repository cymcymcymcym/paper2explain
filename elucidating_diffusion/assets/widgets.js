/* EDM blog interactive widgets. Plain JS / Canvas. No deps. */

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

/* =====================================================================
 * Widget 1: noise-explorer
 * Slide sigma, watch the noisy image and ideal denoiser output update.
 * Uses the 11-column CIFAR strip from the paper (cifar10u-seed84-*.jpg).
 * The image is 1408x384 with sigmas: 0, 0.2, 0.5, 1, 2, 3, 5, 7, 10, 20, 50
 * arranged in 11 columns of 128px each, 3 rows of 128px each.
 * We pick the top row (a single CIFAR exemplar) for clarity.
 * ===================================================================== */
(function noiseExplorer() {
  const host = document.getElementById('noise-explorer');
  if (!host) return;

  const SIGMAS = [0, 0.2, 0.5, 1, 2, 3, 5, 7, 10, 20, 50];
  const COL = 128;     // column width in source image
  const ROW = 128;     // row height in source image

  host.insertAdjacentHTML('beforeend', `
    <div class="body noise-body">
      <div class="noise-row">
        <div class="noise-panel">
          <div class="noise-label">noisy input <span class="muted">$\\xx = \\yy + \\nn$</span></div>
          <canvas id="noiseInput" width="220" height="220"></canvas>
        </div>
        <div class="noise-panel">
          <div class="noise-label">ideal denoiser <span class="muted">$D(\\xx; \\sigma)$</span></div>
          <canvas id="noiseOut" width="220" height="220"></canvas>
        </div>
      </div>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">noise level $\\sigma$</label>
          <input type="range" id="noiseSlider" min="0" max="10" step="1" value="3"/>
        </div>
        <div class="readout" id="noiseReadout"></div>
      </div>
    </div>
  `);

  const noisyImg = new Image();
  const oracleImg = new Image();
  noisyImg.src = 'assets/figures/denoising_noisy.jpg';
  oracleImg.src = 'assets/figures/denoising_oracle.jpg';

  const cvIn = host.querySelector('#noiseInput');
  const cvOut = host.querySelector('#noiseOut');
  const ctxIn = devicePx(cvIn, 220, 220);
  const ctxOut = devicePx(cvOut, 220, 220);
  const slider = host.querySelector('#noiseSlider');
  const readout = host.querySelector('#noiseReadout');

  function drawColumn(ctx, img, idx) {
    ctx.clearRect(0, 0, 220, 220);
    if (!img.complete || img.naturalWidth === 0) {
      ctx.fillStyle = cssVar('--bg-soft') || '#222';
      ctx.fillRect(0, 0, 220, 220);
      return;
    }
    // Source: row 0 (top row), column idx, COL x ROW
    ctx.drawImage(img, idx * COL, 0, COL, ROW, 0, 0, 220, 220);
  }

  function draw() {
    const idx = parseInt(slider.value);
    const sigma = SIGMAS[idx];
    drawColumn(ctxIn, noisyImg, idx);
    drawColumn(ctxOut, oracleImg, idx);
    const sigmaStr = sigma === 0 ? '0.0 (clean)' : (sigma < 1 ? sigma.toFixed(2) : sigma.toFixed(1));
    let note = '';
    if (sigma === 0) note = 'no noise — denoiser returns the input';
    else if (sigma <= 0.5) note = 'low noise — denoiser recovers most detail';
    else if (sigma <= 3) note = 'critical regime — features sharpening into focus';
    else if (sigma <= 10) note = 'high noise — global structure preserved, detail lost';
    else note = 'noise dominates — denoiser converges to dataset mean';
    readout.innerHTML = `$\\sigma$ = <b>${sigmaStr}</b><div class="note">${note}</div>`;
    if (window.renderMathInElement) window.renderMathInElement(readout);
  }

  noisyImg.addEventListener('load', draw);
  oracleImg.addEventListener('load', draw);
  slider.addEventListener('input', draw);
  draw();
})();


/* =====================================================================
 * Widget 2: schedule-explorer
 * Slide rho, watch the noise levels {sigma_i} redistribute.
 * Show them as ticks on a log-sigma axis, plus the step-size profile.
 * ===================================================================== */
(function scheduleExplorer() {
  const host = document.getElementById('schedule-explorer');
  if (!host) return;

  const SIGMA_MAX = 80, SIGMA_MIN = 0.002, N = 18;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="schCanvas" width="600" height="300"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">shape $\\rho$</label>
          <input type="range" id="rhoSlider" min="1" max="20" step="0.5" value="7"/>
        </div>
        <div class="readout" id="schReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#schCanvas');
  const ctx = devicePx(cv, 600, 300);
  const slider = host.querySelector('#rhoSlider');
  const readout = host.querySelector('#schReadout');
  const W = 600, H = 300;

  function sigmasFor(rho) {
    const a = Math.pow(SIGMA_MAX, 1/rho);
    const b = Math.pow(SIGMA_MIN, 1/rho);
    const arr = [];
    for (let i = 0; i < N; i++) {
      arr.push(Math.pow(a + (i/(N-1)) * (b - a), rho));
    }
    return arr;
  }

  function xLog(sigma) {
    const lo = Math.log(SIGMA_MIN), hi = Math.log(SIGMA_MAX);
    const t = (Math.log(Math.max(sigma, SIGMA_MIN)) - lo) / (hi - lo);
    return 60 + t * (W - 90);
  }

  function draw() {
    const rho = parseFloat(slider.value);
    const sigmas = sigmasFor(rho);

    ctx.clearRect(0, 0, W, H);

    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    // ---- top: sigma ticks on a log axis ----
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.strokeStyle = mute;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, 60);
    ctx.lineTo(W - 30, 60);
    ctx.stroke();

    // tick labels at decade markers
    [0.01, 0.1, 1, 10, 80].forEach(s => {
      const x = xLog(s);
      ctx.strokeStyle = mute;
      ctx.beginPath();
      ctx.moveTo(x, 56);
      ctx.lineTo(x, 64);
      ctx.stroke();
      ctx.fillStyle = mute;
      ctx.textAlign = 'center';
      ctx.fillText(s + '', x, 50);
    });

    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText('σ (log scale)', 60, 30);
    ctx.textAlign = 'right';
    ctx.fillText('σ_max = 80', W - 30, 30);

    // schedule sigmas as vertical bars
    sigmas.forEach((s, i) => {
      const x = xLog(s);
      const grad = ctx.createLinearGradient(0, 60, 0, 100);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent + '00');
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.lineTo(x, 86);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x, 86, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // ---- bottom: step-size profile ----
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText('step size  σ_i − σ_{i+1}  vs. step index', 60, 130);

    const steps = [];
    for (let i = 0; i < sigmas.length - 1; i++) {
      steps.push(sigmas[i] - sigmas[i+1]);
    }
    const maxStep = Math.max(...steps);
    const barW = (W - 90) / steps.length;
    const baseY = H - 30;

    steps.forEach((s, i) => {
      const h = (s / maxStep) * (H - 180);
      const x = 60 + i * barW;
      ctx.fillStyle = blue;
      ctx.fillRect(x, baseY - h, barW * 0.7, h);
    });

    ctx.strokeStyle = mute;
    ctx.beginPath();
    ctx.moveTo(60, baseY);
    ctx.lineTo(W - 30, baseY);
    ctx.stroke();

    ctx.fillStyle = mute;
    ctx.textAlign = 'left';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('start ←', 60, baseY + 16);
    ctx.textAlign = 'right';
    ctx.fillText('→ end (low σ)', W - 30, baseY + 16);

    const note = rho < 2 ? 'roughly uniform spacing — too many steps near σ_max' :
                 rho < 5 ? 'tilting toward low σ' :
                 rho < 10 ? 'EDM choice: ρ = 7 packs effort where it matters' :
                            'extreme — almost all budget near σ_min';
    readout.innerHTML = `$\\rho$ = <b>${rho.toFixed(1)}</b><div class="note">${note}</div>`;
    if (window.renderMathInElement) window.renderMathInElement(readout);
  }

  slider.addEventListener('input', draw);
  window.addEventListener('resize', draw);
  draw();
})();


/* =====================================================================
 * Widget 3: precond-explorer
 * Slide sigma, see c_skip, c_out, c_in, c_noise as functions of sigma.
 * Visualizes the smooth transition from "tweak input" to "build from scratch".
 * ===================================================================== */
(function precondExplorer() {
  const host = document.getElementById('precond-explorer');
  if (!host) return;

  const SIGMA_DATA = 0.5;
  const SIGMA_MAX = 80, SIGMA_MIN = 0.002;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="precCanvas" width="600" height="320"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">noise level $\\sigma$ (log)</label>
          <input type="range" id="sigmaSlider" min="-3" max="2" step="0.02" value="0"/>
        </div>
        <div class="readout" id="precReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#precCanvas');
  const ctx = devicePx(cv, 600, 320);
  const slider = host.querySelector('#sigmaSlider');
  const readout = host.querySelector('#precReadout');
  const W = 600, H = 320;

  function cSkip(s) { return SIGMA_DATA * SIGMA_DATA / (s*s + SIGMA_DATA*SIGMA_DATA); }
  function cOut(s)  { return (s * SIGMA_DATA) / Math.sqrt(s*s + SIGMA_DATA*SIGMA_DATA); }
  function cIn(s)   { return 1 / Math.sqrt(s*s + SIGMA_DATA*SIGMA_DATA); }
  function cNoise(s){ return 0.25 * Math.log(s); }

  function xLog(s) {
    const lo = Math.log10(SIGMA_MIN), hi = Math.log10(SIGMA_MAX);
    const t = (Math.log10(s) - lo) / (hi - lo);
    return 60 + t * (W - 90);
  }

  function yLin(v, vmin, vmax, top, bot) {
    const t = (v - vmin) / (vmax - vmin);
    return bot - t * (bot - top);
  }

  function draw() {
    const sigma = Math.pow(10, parseFloat(slider.value));

    ctx.clearRect(0, 0, W, H);

    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const purple = '#c47dff';
    const green  = '#5dd39e';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';

    const top = 40, bot = H - 50;

    // axis frame
    ctx.strokeStyle = mute;
    ctx.lineWidth = 1;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.beginPath();
    ctx.moveTo(60, top); ctx.lineTo(60, bot); ctx.lineTo(W - 30, bot);
    ctx.stroke();

    // x-axis labels
    ctx.fillStyle = mute;
    ctx.textAlign = 'center';
    [0.01, 0.1, 1, 10, 80].forEach(s => {
      const x = xLog(s);
      ctx.fillText(s + '', x, bot + 16);
      ctx.beginPath();
      ctx.moveTo(x, bot); ctx.lineTo(x, bot + 4); ctx.stroke();
    });
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText('σ (log)', 60, top - 12);

    // y-axis labels for [0, 1]
    ctx.textAlign = 'right';
    ctx.fillStyle = mute;
    [0, 0.25, 0.5, 0.75, 1.0].forEach(y => {
      const py = yLin(y, 0, 1, top, bot);
      ctx.fillText(y.toFixed(2), 55, py + 4);
      ctx.beginPath();
      ctx.moveTo(56, py); ctx.lineTo(60, py); ctx.stroke();
    });

    // plot each function
    function plotFn(fn, color, vmin, vmax, label, labelY) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      const lo = Math.log10(SIGMA_MIN), hi = Math.log10(SIGMA_MAX);
      for (let i = 0; i <= 400; i++) {
        const s = Math.pow(10, lo + (i / 400) * (hi - lo));
        const v = fn(s);
        const px = xLog(s);
        const py = yLin(v, vmin, vmax, top, bot);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(label, W - 95, labelY);
    }

    plotFn(cSkip, accent, 0, 1, 'c_skip', 60);
    plotFn(cIn,   blue,   0, 1, 'c_in',   80);
    // c_out grows to about sigma_data at large sigma; scale by sigma_data for plotting in [0,1].
    plotFn(s => cOut(s) / SIGMA_DATA, green, 0, 1, 'c_out / σ_data', 100);

    // sigma marker
    const px = xLog(sigma);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, top); ctx.lineTo(px, bot);
    ctx.stroke();
    ctx.setLineDash([]);

    // dots at current sigma
    const skipVal = cSkip(sigma);
    const inVal = cIn(sigma);
    const outVal = cOut(sigma) / SIGMA_DATA;
    [[skipVal, accent], [inVal, blue], [outVal, green]].forEach(([v, c]) => {
      const py = yLin(v, 0, 1, top, bot);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, 2 * Math.PI);
      ctx.fill();
    });

    // role bar at top
    const skipFrac = skipVal;
    ctx.fillStyle = accent;
    ctx.fillRect(60, top - 28, skipFrac * (W - 90), 8);
    ctx.fillStyle = blue;
    ctx.fillRect(60 + skipFrac * (W - 90), top - 28, (1 - skipFrac) * (W - 90), 8);
    ctx.fillStyle = mute;
    ctx.textAlign = 'left';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('skip', 60, top - 32);
    ctx.textAlign = 'right';
    ctx.fillText('F_θ', W - 30, top - 32);

    let role;
    if (sigma < 0.1) role = 'network refines a near-clean image (skip dominates)';
    else if (sigma < 1) role = 'mixed regime — both pathways contribute';
    else if (sigma < 10) role = 'F_θ does most of the work, skip fading';
    else role = 'almost pure F_θ — building image from noise';
    readout.innerHTML = `$\\sigma$ = <b>${sigma.toFixed(3)}</b>,
       c_skip = <b>${skipVal.toFixed(3)}</b>,
       c_in = <b>${inVal.toFixed(3)}</b>,
       c_out = <b>${cOut(sigma).toFixed(3)}</b>
       <div class="note">${role}</div>`;
    if (window.renderMathInElement) window.renderMathInElement(readout);
  }

  slider.addEventListener('input', draw);
  draw();
})();


/* =====================================================================
 * Widget 4: trajectory-toy
 * Click in 2D noise space, integrate the EDM ODE with Heun, watch the
 * trajectory snap to one of a few data clusters. Slider controls NFE.
 * ===================================================================== */
(function trajectoryToy() {
  const host = document.getElementById('trajectory-toy');
  if (!host) return;

  const SIGMA_MAX = 3.0, SIGMA_MIN = 0.02, RHO = 7.0, SIGMA_DATA = 0.7;
  const DATA = [
    [-2.6, 0.8], [-2.2, -1.1],
    [2.4, 1.2],  [2.0, -0.9],
    [0.2, 1.8],  [0.5, -1.7],
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="trajCanvas" width="640" height="380"></canvas>
      <div class="controls">
        <div class="slider-wrap">
          <label class="slider-label">network evaluations  N</label>
          <input type="range" id="nfeSlider" min="3" max="50" step="1" value="18"/>
        </div>
        <div class="readout" id="trajReadout">click anywhere on the canvas →</div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#trajCanvas');
  const ctx = devicePx(cv, 640, 380);
  const slider = host.querySelector('#nfeSlider');
  const readout = host.querySelector('#trajReadout');
  const W = 640, H = 380;

  // World coordinates: x in [-4, 4], y in [-2.5, 2.5]
  function worldToPx(x, y) {
    const px = (x + 4) / 8 * W;
    const py = (1 - (y + 2.5) / 5) * H;
    return [px, py];
  }
  function pxToWorld(px, py) {
    const x = px / W * 8 - 4;
    const y = (1 - py / H) * 5 - 2.5;
    return [x, y];
  }

  function denoise(x, y, sigma) {
    const vTot = sigma * sigma + SIGMA_DATA * SIGMA_DATA;
    const logW = DATA.map(p => -((p[0] - x) ** 2 + (p[1] - y) ** 2) / (2 * vTot));
    const m = Math.max(...logW);
    const w = logW.map(l => Math.exp(l - m));
    const s = w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) w[i] /= s;
    let dx = 0, dy = 0;
    for (let i = 0; i < DATA.length; i++) {
      const mx = (sigma * sigma * DATA[i][0] + SIGMA_DATA * SIGMA_DATA * x) / vTot;
      const my = (sigma * sigma * DATA[i][1] + SIGMA_DATA * SIGMA_DATA * y) / vTot;
      dx += w[i] * mx;
      dy += w[i] * my;
    }
    return [dx, dy];
  }

  function schedule(N) {
    const a = Math.pow(SIGMA_MAX, 1/RHO);
    const b = Math.pow(SIGMA_MIN, 1/RHO);
    const arr = [];
    for (let i = 0; i < N; i++) {
      arr.push(Math.pow(a + (i / (N - 1)) * (b - a), RHO));
    }
    arr.push(0);
    return arr;
  }

  function integrate(x0, y0, N) {
    const sigmas = schedule(N);
    const traj = [[x0, y0]];
    let x = x0, y = y0;
    for (let k = 0; k < N; k++) {
      const s = sigmas[k], sn = sigmas[k + 1];
      const [dx, dy] = denoise(x, y, s);
      const ex = (x - dx) / s, ey = (y - dy) / s;
      let xp = x + (sn - s) * ex, yp = y + (sn - s) * ey;
      if (sn > 0) {
        const [dxp, dyp] = denoise(xp, yp, sn);
        const exp_ = (xp - dxp) / sn, eyp = (yp - dyp) / sn;
        x = x + (sn - s) * 0.5 * (ex + exp_);
        y = y + (sn - s) * 0.5 * (ey + eyp);
      } else {
        x = xp; y = yp;
      }
      traj.push([x, y]);
    }
    return traj;
  }

  let start = null; // world coords of clicked starting point

  function drawScene() {
    const accent = cssVar('--accent') || '#ff9b6a';
    const blue   = cssVar('--accent-blue') || '#5fa9ff';
    const fg     = cssVar('--fg') || '#222';
    const mute   = cssVar('--fg-mute') || '#888';
    const bgSoft = cssVar('--bg-soft') || '#f0f0f4';

    ctx.fillStyle = bgSoft;
    ctx.fillRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = mute;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 1;
    for (let x = -4; x <= 4; x++) {
      const [px] = worldToPx(x, 0);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    }
    for (let y = -2; y <= 2; y++) {
      const [, py] = worldToPx(0, y);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // data points
    DATA.forEach(p => {
      const [px, py] = worldToPx(p[0], p[1]);
      ctx.fillStyle = blue;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, 2 * Math.PI);
      ctx.fill();
      // ring
      ctx.strokeStyle = blue;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    ctx.fillStyle = fg;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('blue = data modes', 10, H - 12);

    // trajectory if we have a start
    if (start) {
      const N = parseInt(slider.value);
      const traj = integrate(start[0], start[1], N);

      // path
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const [sx, sy] = worldToPx(traj[0][0], traj[0][1]);
      ctx.moveTo(sx, sy);
      for (let i = 1; i < traj.length; i++) {
        const [px, py] = worldToPx(traj[i][0], traj[i][1]);
        ctx.lineTo(px, py);
      }
      ctx.stroke();

      // step dots
      traj.forEach((p, i) => {
        const [px, py] = worldToPx(p[0], p[1]);
        ctx.fillStyle = i === 0 ? accent : (i === traj.length - 1 ? '#fff' : accent);
        ctx.strokeStyle = i === traj.length - 1 ? accent : 'transparent';
        ctx.lineWidth = 2;
        const r = i === 0 ? 6 : (i === traj.length - 1 ? 7 : 3);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, 2 * Math.PI);
        ctx.fill();
        if (i === traj.length - 1) ctx.stroke();
      });

      // start marker label
      const [stx, sty] = worldToPx(traj[0][0], traj[0][1]);
      ctx.fillStyle = accent;
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('start (σ_max)', stx + 9, sty - 9);
      const end = traj[traj.length - 1];
      const [ex, ey] = worldToPx(end[0], end[1]);
      ctx.fillStyle = fg;
      ctx.fillText('sample (σ=0)', ex + 9, ey + 14);

      readout.innerHTML = `N = <b>${N}</b> &nbsp; NFE ≈ <b>${2*N-1}</b> (Heun)<div class="note">trajectory locked to nearest mode in ${N} steps</div>`;
    } else {
      readout.innerHTML = `N = <b>${slider.value}</b><div class="note">click anywhere on the canvas to launch a trajectory</div>`;
    }
  }

  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    const cssX = (e.clientX - rect.left) * (W / rect.width);
    const cssY = (e.clientY - rect.top) * (H / rect.height);
    const [wx, wy] = pxToWorld(cssX, cssY);
    start = [clamp(wx, -3.8, 3.8), clamp(wy, -2.3, 2.3)];
    drawScene();
  });
  slider.addEventListener('input', drawScene);
  drawScene();
})();
