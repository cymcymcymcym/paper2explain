/* nerf blog interactive widgets. Plain JS / Canvas. No deps. */

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

function rgbStr(rgb) {
  return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
}

/* =====================================================================
 * Widget 1: viewdep
 * A single surface point whose emitted color depends on view direction.
 * Orbit the camera; toggle view-dependence on/off (the No-VD ablation).
 * ===================================================================== */
(function viewDep() {
  const host = document.getElementById('viewdep');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="vd-canvas"></canvas>
      <div class="controls">
        <div class="nf-row"><label>camera angle <span id="vd-av"></span></label>
          <input type="range" id="vd-angle" min="0" max="360" step="1" value="35"/></div>
        <div class="nf-toggle">
          <button id="vd-on" class="active">view dependence ON</button>
          <button id="vd-off">OFF (ablation)</button>
        </div>
        <div class="readout" id="vd-readout"></div>
      </div>
    </div>
  `);

  const W = 460, H = 300;
  const cv = host.querySelector('#vd-canvas');
  const ctx = devicePx(cv, W, H);
  const angleS = host.querySelector('#vd-angle');
  const readout = host.querySelector('#vd-readout');
  let vd = true;

  // diffuse (base) color + a specular lobe centered at a fixed "light reflection"
  const base = [70, 90, 130];
  const specColor = [255, 240, 210];
  const lightDir = -0.6; // radians, where the highlight peaks

  function emitted(theta) {
    if (!vd) {
      // No view dependence: a flat average (diffuse + averaged specular)
      return [base[0] + 40, base[1] + 38, base[2] + 30];
    }
    // specular: narrow lobe in viewing angle
    let d = Math.cos(theta - lightDir);
    const spec = Math.pow(Math.max(d, 0), 18);
    return [
      base[0] + spec * (specColor[0] - base[0]),
      base[1] + spec * (specColor[1] - base[1]),
      base[2] + spec * (specColor[2] - base[2]),
    ];
  }

  function draw() {
    const a = parseFloat(angleS.value) * Math.PI / 180;
    host.querySelector('#vd-av').textContent = angleS.value + '°';
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const cx = 175, cyy = H / 2, orbitR = 105;

    // ring showing emitted color for each viewing direction
    for (let i = 0; i < 160; i++) {
      const t0 = i / 160 * Math.PI * 2, t1 = (i + 1.4) / 160 * Math.PI * 2;
      ctx.strokeStyle = rgbStr(emitted(t0));
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cyy, orbitR, t0, t1);
      ctx.stroke();
    }

    // the surface point (a small shaded sphere) in current emitted color
    const col = emitted(a);
    const g = ctx.createRadialGradient(cx - 12, cyy - 12, 4, cx, cyy, 40);
    g.addColorStop(0, rgbStr(col.map(c => Math.min(255, c + 40))));
    g.addColorStop(1, rgbStr(col.map(c => c * 0.6)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cyy, 40, 0, Math.PI * 2);
    ctx.fill();

    // camera marker + ray
    const camX = cx + Math.cos(a) * orbitR, camY = cyy + Math.sin(a) * orbitR;
    ctx.strokeStyle = 'rgba(232,232,238,0.45)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(camX, camY); ctx.lineTo(cx, cyy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8e8ee';
    ctx.beginPath(); ctx.arc(camX, camY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.fillText('camera', camX + 9, camY + 4);
    ctx.fillText('ring = emitted color per direction', 56, 20);

    // swatch
    ctx.fillStyle = rgbStr(col);
    ctx.fillRect(348, 80, 80, 80);
    ctx.strokeStyle = '#e8e8ee';
    ctx.strokeRect(348, 80, 80, 80);
    ctx.fillStyle = '#888';
    ctx.fillText('seen color', 360, 178);

    readout.innerHTML = vd
      ? 'view dependence <b>ON</b> — color $\\vc(\\vx,\\vd)$ tracks the highlight as you orbit'
          .replace(/\$.*?\$/, 'c(x, d)')
      : '<span style="color:var(--accent)">view dependence OFF</span> — color is a flat average; the specular glint is gone (the paper\'s "No View Dependence" ablation)';
  }

  host.querySelector('#vd-on').addEventListener('click', () => {
    vd = true;
    host.querySelector('#vd-on').classList.add('active');
    host.querySelector('#vd-off').classList.remove('active');
    draw();
  });
  host.querySelector('#vd-off').addEventListener('click', () => {
    vd = false;
    host.querySelector('#vd-off').classList.add('active');
    host.querySelector('#vd-on').classList.remove('active');
    draw();
  });
  angleS.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: raymarch
 * 1D scene with two density bumps. Slider sets N samples; shows sigma(t),
 * transmittance T(t), per-sample weights, and the quadrature color estimate.
 * ===================================================================== */
(function rayMarch() {
  const host = document.getElementById('raymarch');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rm-canvas"></canvas>
      <div class="controls">
        <div class="nf-row"><label>samples N <span id="rm-nv"></span></label>
          <input type="range" id="rm-n" min="2" max="96" step="1" value="8"/></div>
        <div class="nf-toggle">
          <button id="rm-strat" class="active">stratified</button>
          <button id="rm-unif">uniform</button>
        </div>
        <div class="readout" id="rm-readout"></div>
      </div>
    </div>
  `);

  const W = 460, H = 320;
  const cv = host.querySelector('#rm-canvas');
  const ctx = devicePx(cv, W, H);
  const nS = host.querySelector('#rm-n');
  const readout = host.querySelector('#rm-readout');
  let strat = true;

  // two density bumps; the front one (t~0.35) mostly occludes the back (t~0.7)
  function sigma(t) {
    return 9.0 * Math.exp(-((t - 0.35) ** 2) / (2 * 0.05 ** 2)) +
           6.0 * Math.exp(-((t - 0.70) ** 2) / (2 * 0.05 ** 2));
  }
  function colorAt(t) {
    const c0 = [255, 155, 74], c1 = [95, 169, 255];
    const a = Math.min(1, Math.max(0, (t - 0.35) / 0.35));
    return [c0[0] + a * (c1[0] - c0[0]), c0[1] + a * (c1[1] - c0[1]), c0[2] + a * (c1[2] - c0[2])];
  }
  // high-res "true" color (Riemann with 2000 steps)
  function trueColor() {
    const M = 2000, dt = 1 / M;
    let C = [0, 0, 0], T = 1;
    for (let i = 0; i < M; i++) {
      const t = (i + 0.5) * dt;
      const a = 1 - Math.exp(-sigma(t) * dt);
      const c = colorAt(t);
      C = [C[0] + T * a * c[0], C[1] + T * a * c[1], C[2] + T * a * c[2]];
      T *= (1 - a);
    }
    return C;
  }
  const Ctrue = trueColor();

  function draw() {
    const N = parseInt(nS.value, 10);
    host.querySelector('#rm-nv').textContent = N;
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const mute = '#888', fg = '#e8e8ee';
    const x0 = 50, x1 = W - 70, plotW = x1 - x0;
    const tx = t => x0 + t * plotW;

    // --- sigma curve (top) ---
    const sy0 = 30, sh = 70;
    ctx.fillStyle = mute; ctx.font = '11px sans-serif';
    ctx.fillText('σ(t) density', x0, sy0 - 8);
    let smax = 9.0;
    ctx.strokeStyle = '#ff6a8a'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120, y = sy0 + sh - (sigma(t) / smax) * sh;
      i === 0 ? ctx.moveTo(tx(t), y) : ctx.lineTo(tx(t), y);
    }
    ctx.stroke();

    // --- samples ---
    const ts = [];
    for (let i = 0; i < N; i++) {
      const lo = i / N, hi = (i + 1) / N;
      ts.push(strat ? lo + ((i * 0.61803 + 0.13) % 1) * (hi - lo) : (i + 0.5) / N);
    }
    // compute transmittance + weights via quadrature
    let T = 1, C = [0, 0, 0];
    const Ts = [], ws = [];
    for (let i = 0; i < N; i++) {
      const delta = (i < N - 1 ? ts[i + 1] - ts[i] : 1 - ts[i]);
      const a = 1 - Math.exp(-sigma(ts[i]) * delta);
      Ts.push(T);
      const w = T * a;
      ws.push(w);
      const c = colorAt(ts[i]);
      C = [C[0] + w * c[0], C[1] + w * c[1], C[2] + w * c[2]];
      T *= (1 - a);
    }

    // --- transmittance curve (middle) ---
    const ty0 = 130, th = 60;
    ctx.fillStyle = mute;
    ctx.fillText('T(t) transmittance (1 → 0)', x0, ty0 - 8);
    ctx.strokeStyle = cssVar('--accent') || '#ff9b6a'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const y = ty0 + th - Ts[i] * th;
      i === 0 ? ctx.moveTo(tx(ts[i]), y) : ctx.lineTo(tx(ts[i]), y);
    }
    ctx.stroke();

    // --- weight stems + sample dots (bottom) ---
    const wy0 = 230, wh = 54;
    ctx.fillStyle = mute;
    ctx.fillText('weights wᵢ = Tᵢ(1−e^−σδ) and samples', x0, wy0 - 8);
    const wmax = Math.max(...ws, 1e-6);
    for (let i = 0; i < N; i++) {
      const x = tx(ts[i]);
      ctx.strokeStyle = '#6adfb8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, wy0 + wh);
      ctx.lineTo(x, wy0 + wh - (ws[i] / wmax) * wh);
      ctx.stroke();
      ctx.fillStyle = rgbStr(colorAt(ts[i]));
      ctx.beginPath(); ctx.arc(x, wy0 + wh + 10, 3, 0, Math.PI * 2); ctx.fill();
    }

    // --- estimate vs truth swatches ---
    ctx.fillStyle = rgbStr(C);
    ctx.fillRect(x1 + 6, 40, 24, 24);
    ctx.fillStyle = rgbStr(Ctrue);
    ctx.fillRect(x1 + 6, 70, 24, 24);
    ctx.fillStyle = mute; ctx.font = '9px sans-serif';
    ctx.fillText('est', x1 + 8, 38);
    ctx.fillText('true', x1 + 6, 106);

    const err = Math.sqrt(C.reduce((s, c, i) => s + (c - Ctrue[i]) ** 2, 0)) / 255;
    readout.innerHTML =
      `N = <b>${N}</b> · estimate error = <b>${err.toFixed(3)}</b>` +
      (err < 0.02 ? ' — <span style="color:var(--accent)">converged</span>'
                  : err > 0.1 ? ' — too few samples, color is wrong' : '') +
      `<br/>front bump absorbs the ray: back bump gets only <b>${(Ts[N - 1] !== undefined ? (Ts.find((t, i) => ts[i] > 0.6) || 0) * 100 : 0).toFixed(0)}%</b> of the light`;
  }

  nS.addEventListener('input', draw);
  host.querySelector('#rm-strat').addEventListener('click', () => {
    strat = true;
    host.querySelector('#rm-strat').classList.add('active');
    host.querySelector('#rm-unif').classList.remove('active');
    draw();
  });
  host.querySelector('#rm-unif').addEventListener('click', () => {
    strat = false;
    host.querySelector('#rm-unif').classList.add('active');
    host.querySelector('#rm-strat').classList.remove('active');
    draw();
  });
  draw();
})();

/* =====================================================================
 * Widget 3: posenc-fit
 * Least-squares fit of a sharp 1D target using the positional-encoding
 * basis gamma(p). Slider L controls number of frequency bands. L=0 is the
 * raw-coordinate (no encoding) case — hopelessly smooth.
 * ===================================================================== */
(function posencFit() {
  const host = document.getElementById('posenc-fit');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="pe-canvas"></canvas>
      <div class="controls">
        <div class="nf-row"><label>frequency bands L <span id="pe-lv"></span></label>
          <input type="range" id="pe-l" min="0" max="10" step="1" value="0"/></div>
        <div class="readout" id="pe-readout"></div>
      </div>
    </div>
  `);

  const W = 460, H = 300;
  const cv = host.querySelector('#pe-canvas');
  const ctx = devicePx(cv, W, H);
  const lS = host.querySelector('#pe-l');
  const readout = host.querySelector('#pe-readout');

  // target: a sharp signal with a step and fine wiggles, p in [0,1]
  function target(p) {
    return (p > 0.5 ? 0.55 : -0.35)
      + 0.28 * Math.sin(2 * Math.PI * 6 * p)
      + 0.12 * Math.sin(2 * Math.PI * 13 * p);
  }

  // features: [1, p,  sin(2^0 pi p), cos(...), ..., sin(2^{L-1} pi p), cos(...)]
  function feat(p, L) {
    const f = [1, p * 2 - 1];
    for (let l = 0; l < L; l++) {
      const w = Math.pow(2, l) * Math.PI;
      f.push(Math.sin(w * (p * 2 - 1)), Math.cos(w * (p * 2 - 1)));
    }
    return f;
  }

  // solve (XtX + λI) c = Xt y  via Gaussian elimination
  function fit(L) {
    const M = 240;
    const ps = [], ys = [];
    for (let i = 0; i < M; i++) { const p = i / (M - 1); ps.push(p); ys.push(target(p)); }
    const D = 2 + 2 * L;
    const XtX = Array.from({ length: D }, () => new Float64Array(D));
    const Xty = new Float64Array(D);
    for (let i = 0; i < M; i++) {
      const f = feat(ps[i], L);
      for (let a = 0; a < D; a++) {
        Xty[a] += f[a] * ys[i];
        for (let b = 0; b < D; b++) XtX[a][b] += f[a] * f[b];
      }
    }
    const lambda = 1e-4;
    for (let a = 0; a < D; a++) XtX[a][a] += lambda;
    // Gaussian elimination
    const A = XtX.map((row, i) => Array.from(row).concat(Xty[i]));
    for (let col = 0; col < D; col++) {
      let piv = col;
      for (let r = col + 1; r < D; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      [A[col], A[piv]] = [A[piv], A[col]];
      const d = A[col][col] || 1e-9;
      for (let c = col; c <= D; c++) A[col][c] /= d;
      for (let r = 0; r < D; r++) {
        if (r === col) continue;
        const factor = A[r][col];
        for (let c = col; c <= D; c++) A[r][c] -= factor * A[col][c];
      }
    }
    return A.map(row => row[D]);
  }

  function draw() {
    const L = parseInt(lS.value, 10);
    host.querySelector('#pe-lv').textContent = L;
    const coef = fit(L);
    const D = coef.length;

    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const x0 = 30, x1 = W - 20, y0 = 30, y1 = H - 40;
    const px = p => x0 + p * (x1 - x0);
    const py = v => (y0 + y1) / 2 - v * ((y1 - y0) / 2.4);

    // axis
    ctx.strokeStyle = '#2a2c34'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, py(0)); ctx.lineTo(x1, py(0)); ctx.stroke();

    // target
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) { const p = i / 240; i === 0 ? ctx.moveTo(px(p), py(target(p))) : ctx.lineTo(px(p), py(target(p))); }
    ctx.stroke();

    // reconstruction
    let mse = 0, cnt = 0;
    ctx.strokeStyle = cssVar('--accent') || '#ff9b6a'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const p = i / 240;
      const f = feat(p, L);
      let v = 0; for (let a = 0; a < D; a++) v += coef[a] * f[a];
      i === 0 ? ctx.moveTo(px(p), py(v)) : ctx.lineTo(px(p), py(v));
      mse += (v - target(p)) ** 2; cnt++;
    }
    ctx.stroke();
    mse /= cnt;

    // legend
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#888'; ctx.fillText('target', x1 - 130, y0 + 4);
    ctx.fillStyle = cssVar('--accent') || '#ff9b6a'; ctx.fillText('γ(p) fit', x1 - 64, y0 + 4);

    readout.innerHTML =
      `L = <b>${L}</b> → ${D} features (incl. raw p) · fit MSE = <b>${mse.toFixed(4)}</b><br/>` +
      (L === 0
        ? '<span style="color:var(--accent)">no encoding: only the raw coordinate — the network can only draw a smooth line (the oversmoothed ablation)</span>'
        : L < 4 ? 'low frequencies captured; sharp edges still blurred'
                : 'high-frequency detail recovered — this is why the paper uses L=10 for position');
  }

  lS.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: hiersample
 * Coarse uniform pass discovers density; fine pass redraws samples from the
 * resulting PDF via inverse-transform sampling, clustering on the surface.
 * Drag the surface; change Nc / Nf.
 * ===================================================================== */
(function hierSample() {
  const host = document.getElementById('hiersample');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="hs-canvas"></canvas>
      <div class="controls">
        <div class="nf-row"><label>coarse N<sub>c</sub> <span id="hs-ncv"></span></label>
          <input type="range" id="hs-nc" min="4" max="64" step="1" value="16"/></div>
        <div class="nf-row"><label>fine N<sub>f</sub> <span id="hs-nfv"></span></label>
          <input type="range" id="hs-nf" min="4" max="128" step="1" value="32"/></div>
        <div class="readout" id="hs-readout">drag the canvas to move the surface →</div>
      </div>
    </div>
  `);

  const W = 460, H = 300;
  const cv = host.querySelector('#hs-canvas');
  const ctx = devicePx(cv, W, H);
  const ncS = host.querySelector('#hs-nc'), nfS = host.querySelector('#hs-nf');
  const readout = host.querySelector('#hs-readout');
  let surf = 0.6;

  function sigma(t) {
    return Math.exp(-((t - surf) ** 2) / (2 * 0.04 ** 2));
  }

  function draw() {
    const Nc = parseInt(ncS.value, 10), Nf = parseInt(nfS.value, 10);
    host.querySelector('#hs-ncv').textContent = Nc;
    host.querySelector('#hs-nfv').textContent = Nf;
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const mute = '#888';
    const x0 = 40, x1 = W - 20, plotW = x1 - x0;
    const tx = t => x0 + t * plotW;

    // density curve
    ctx.fillStyle = mute; ctx.font = '11px sans-serif';
    ctx.fillText('σ(t) — drag to move surface', x0, 22);
    ctx.strokeStyle = '#5fa9ff'; ctx.lineWidth = 2;
    const cy0 = 30, ch = 70;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) { const t = i / 160; const y = cy0 + ch - sigma(t) * ch; i === 0 ? ctx.moveTo(tx(t), y) : ctx.lineTo(tx(t), y); }
    ctx.stroke();

    // coarse samples (uniform) + weights
    const cy1 = 140;
    ctx.fillStyle = mute;
    ctx.fillText('coarse: uniform samples → weights (PDF)', x0, cy1 - 6);
    const ts = [], ws = [];
    let T = 1, wmax = 0;
    for (let i = 0; i < Nc; i++) {
      const t = (i + 0.5) / Nc;
      const delta = 1 / Nc;
      const a = 1 - Math.exp(-sigma(t) * 4 * delta * Nc / 8);
      const w = T * a; T *= (1 - a);
      ts.push(t); ws.push(w); wmax = Math.max(wmax, w);
    }
    for (let i = 0; i < Nc; i++) {
      const x = tx(ts[i]);
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.arc(x, cy1 + 12, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6adfb8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, cy1 + 50); ctx.lineTo(x, cy1 + 50 - (ws[i] / (wmax || 1)) * 40); ctx.stroke();
    }

    // build CDF and inverse-sample fine points
    const wsum = ws.reduce((a, b) => a + b, 0) || 1;
    const cdf = [];
    let acc = 0;
    for (let i = 0; i < Nc; i++) { acc += ws[i] / wsum; cdf.push(acc); }
    const fineY = 250;
    ctx.fillStyle = mute;
    ctx.fillText('fine: resampled from PDF — clustered on surface', x0, fineY - 14);
    for (let i = 0; i < Nf; i++) {
      const u = (i + 0.5) / Nf;
      let bin = 0; while (bin < Nc - 1 && cdf[bin] < u) bin++;
      // jitter within the chosen coarse bin
      const t = Math.min(1, Math.max(0, ts[bin] + (((i * 0.61803) % 1) - 0.5) / Nc));
      ctx.fillStyle = '#ff9b6a';
      ctx.beginPath(); ctx.arc(tx(t), fineY, 3, 0, Math.PI * 2); ctx.fill();
    }

    const nearSurf = Array.from({ length: Nf }, (_, i) => {
      const u = (i + 0.5) / Nf; let bin = 0; while (bin < Nc - 1 && cdf[bin] < u) bin++;
      return Math.abs(ts[bin] - surf) < 0.1 ? 1 : 0;
    }).reduce((a, b) => a + b, 0);
    readout.innerHTML = `N<sub>c</sub>=${Nc}, N<sub>f</sub>=${Nf} · ` +
      `<b>${Math.round(100 * nearSurf / Nf)}%</b> of fine samples land within 0.1 of the surface ` +
      `(uniform would give ~${Math.round(100 * 0.2)}%)`;
  }

  function setSurf(e) {
    const r = cv.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width * (1 + 40 / W) - 40 / W;
    surf = Math.min(0.95, Math.max(0.1, t));
    draw();
  }
  let dragging = false;
  cv.addEventListener('pointerdown', (e) => { dragging = true; cv.setPointerCapture(e.pointerId); setSurf(e); });
  cv.addEventListener('pointermove', (e) => { if (dragging) setSurf(e); });
  cv.addEventListener('pointerup', () => { dragging = false; });
  ncS.addEventListener('input', draw);
  nfS.addEventListener('input', draw);
  draw();
})();
