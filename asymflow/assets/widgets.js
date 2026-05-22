/* AsymFlow blog interactive widgets. Plain JS / Canvas. No deps. */

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
function randn() {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function drawArrow(ctx, x1, y1, x2, y2, color, width, headSize) {
  width = width || 2;
  headSize = headSize || 7;
  if (Math.hypot(x2 - x1, y2 - y1) < 2) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-headSize, -headSize * 0.55);
  ctx.lineTo(-headSize, headSize * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* =====================================================================
 * Widget 1: rank slider
 * Sweep r from 0 → D (here 12). Visualizes how the AsymFlow target uA
 * interpolates between x0-prediction (r=0) and u-prediction (r=D).
 * Shows the FID readout from the paper's ablation.
 * ===================================================================== */
(function rankSlider() {
  const host = document.getElementById('rank-slider');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rankCanvas"></canvas>
      <div class="controls">
        <div>
          <div class="slider-label">
            <span>patch rank r</span>
            <span class="val" id="rankVal">8</span>
          </div>
          <input type="range" id="rankInput" min="0" max="12" step="1" value="8"/>
          <div style="font-family:var(--sans);font-size:11px;color:var(--fg-mute);display:flex;justify-content:space-between;margin-top:2px;">
            <span>0 = x₀-pred</span>
            <span>12 = u-pred</span>
          </div>
        </div>
        <div class="readout" id="rankReadout"></div>
        <div class="legend">
          <div><span class="swatch" style="background:#5fa9ff"></span>data manifold</div>
          <div><span class="swatch" style="background:#9b8cff"></span>low-rank subspace Im(P)</div>
          <div><span class="swatch" style="background:#ff9b4a"></span>noise ε (full-rank or projected)</div>
          <div><span class="swatch" style="background:var(--accent)"></span>target uₐ = Pε − x₀</div>
        </div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#rankCanvas');
  const slider = host.querySelector('#rankInput');
  const valEl = host.querySelector('#rankVal');
  const readout = host.querySelector('#rankReadout');
  const W = 460, H = 320;
  const ctx = devicePx(cv, W, H);

  // pre-sample noise vectors (consistent across redraws so the picture is stable)
  const noises = [];
  for (let i = 0; i < 22; i++) noises.push([randn() * 0.95, randn() * 0.55]);
  // a data point on the manifold (line through origin with slope tan(theta))
  const theta = 0.45;          // manifold direction angle
  const dirX = Math.cos(theta), dirY = Math.sin(theta);
  const x0 = [0.45 * dirX, 0.45 * dirY];

  // FID values reproduced from paper Figure 5 (rank ablation, 160 epochs).
  // r values: 0, 2, 4, 8, 12, 16
  // FID:     ~2.4, ~2.1, ~2.0, 1.95, ~2.05, ~2.15
  // We use a smooth interpolation on a 0..12 range here.
  function fidAt(r) {
    if (r === 0) return 2.40;
    if (r <= 4) return 2.40 - 0.40 * (r / 4);   // 2.40 → 2.00
    if (r <= 8) return 2.00 - 0.05 * ((r - 4) / 4); // 2.00 → 1.95
    return 1.95 + 0.20 * ((r - 8) / 4);          // 1.95 → 2.15
  }
  // Effective projection strength: r=0 → fully removed (treated as x0-pred),
  // r=12 → fully kept (treated as u-pred). For 0<r<12, project noise onto a
  // 1D subspace aligned with the manifold and partially fold in the rest.
  function projectedNoise(eps, r) {
    if (r <= 0) return [0, 0];                  // P=0
    if (r >= 12) return eps;                    // P=I
    // smooth interpolation: at r=4 we already capture most of the in-subspace
    // variance, then the orthogonal complement fades in linearly.
    const t = r / 12;
    const dot = eps[0] * dirX + eps[1] * dirY;
    const along = [dot * dirX, dot * dirY];
    const perp = [eps[0] - along[0], eps[1] - along[1]];
    return [along[0] + t * perp[0], along[1] + t * perp[1]];
  }

  function draw() {
    const r = parseInt(slider.value);
    valEl.textContent = r;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const SCALE = 110;
    const toPx = (p) => [cx + p[0] * SCALE, cy - p[1] * SCALE];

    // axes / background
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    // data manifold
    ctx.strokeStyle = '#5fa9ff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(...toPx([-2 * dirX, -2 * dirY]));
    ctx.lineTo(...toPx([2 * dirX, 2 * dirY]));
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // subspace axis (dashed) — only visible when r > 0
    if (r > 0) {
      ctx.strokeStyle = '#9b8cff';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(...toPx([-1.7 * dirX, -1.7 * dirY]));
      ctx.lineTo(...toPx([1.7 * dirX, 1.7 * dirY]));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }

    // x0 point
    const x0px = toPx(x0);
    ctx.fillStyle = '#5fa9ff';
    ctx.beginPath();
    ctx.arc(x0px[0], x0px[1], 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cssVar('--fg');
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('x₀', x0px[0] + 8, x0px[1] - 6);

    // velocity vectors uA = (projected noise) - x0
    for (const eps of noises) {
      const projEps = projectedNoise(eps, r);
      const tgt = [projEps[0] - x0[0] + x0[0], projEps[1] - x0[1] + x0[1]];
      // ^ this resolves to projEps (we draw from x0 to projEps; the target is the displacement)
      const tgtPx = toPx(projEps);
      // draw the noise sample as a small dot
      ctx.fillStyle = '#ff9b4a';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(tgtPx[0], tgtPx[1], 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
      // draw arrow from x0 to projEps (this represents the target uA)
      drawArrow(ctx, x0px[0], x0px[1], tgtPx[0], tgtPx[1], cssVar('--accent'), 1.4, 5);
    }

    // mode label
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '12px var(--sans), sans-serif';
    let mode = 'AsymFlow (intermediate)';
    if (r === 0) mode = 'x₀-prediction (pure data target)';
    else if (r === 12) mode = 'u-prediction (standard flow matching)';
    ctx.fillText(mode, 14, 22);

    // FID badge
    const fid = fidAt(r);
    readout.innerHTML = `
      <div>rank <b>r = ${r}</b> / D = 12</div>
      <div>FID (160 ep) ≈ <b style="color:var(--accent)">${fid.toFixed(2)}</b></div>
      <div style="margin-top:4px;font-size:11px;color:var(--fg-mute);">
        sweet spot at r=8 — most of the noise variance lives in a low-dim slice.
      </div>
    `;
  }
  slider.addEventListener('input', draw);
  // theme-aware redraw
  const obs = new MutationObserver(draw);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
})();

/* =====================================================================
 * Widget 2: velocity decomposition
 * Drag x0 and a noise sample ε. See u = ε - x0 vs uA = Pε - x0.
 * Shows the orthogonal split into in-subspace (u) and ⊥ (x0).
 * ===================================================================== */
(function velocityDecomp() {
  const host = document.getElementById('velocity-decomp');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="vdCanvas"></canvas>
      <div class="controls">
        <div class="readout" id="vdReadout"></div>
        <div class="legend">
          <div><span class="swatch" style="background:#5fa9ff"></span>x₀ (drag me)</div>
          <div><span class="swatch" style="background:#ff9b4a"></span>ε (drag me)</div>
          <div><span class="swatch" style="background:#9b8cff"></span>subspace Im(P)</div>
          <div><span class="swatch" style="background:#888"></span>standard u = ε − x₀</div>
          <div><span class="swatch" style="background:var(--accent)"></span>asymmetric uₐ = Pε − x₀</div>
        </div>
        <div style="font-family:var(--sans);font-size:12px;color:var(--fg-mute);line-height:1.5;">
          Tip: the asymmetric vector lives in the union of the subspace and the orthogonal x₀ direction —
          a much smaller manifold than the full plane.
        </div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#vdCanvas');
  const readout = host.querySelector('#vdReadout');
  const W = 460, H = 320;
  const ctx = devicePx(cv, W, H);

  const theta = 0.35;
  const dirX = Math.cos(theta), dirY = Math.sin(theta);
  let x0 = [-0.4, 0.2];
  let eps = [0.9, -0.5];
  let dragging = null;

  const cx = W / 2, cy = H / 2, SCALE = 120;
  const toPx = (p) => [cx + p[0] * SCALE, cy - p[1] * SCALE];
  const fromPx = (px) => [(px[0] - cx) / SCALE, (cy - px[1]) / SCALE];

  function project(v) {
    const d = v[0] * dirX + v[1] * dirY;
    return [d * dirX, d * dirY];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // light grid + axes
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    // subspace line (long, light)
    ctx.strokeStyle = '#9b8cff';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(...toPx([-2 * dirX, -2 * dirY]));
    ctx.lineTo(...toPx([2 * dirX, 2 * dirY]));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    // projection: Pε
    const peps = project(eps);

    // x0 point
    const x0px = toPx(x0);
    const epspx = toPx(eps);
    const pepspx = toPx(peps);

    // standard velocity u = ε − x0 (drawn from x0 to ε in grey)
    drawArrow(ctx, x0px[0], x0px[1], epspx[0], epspx[1], '#888', 1.6, 6);

    // asymmetric velocity uA = Pε − x0 (drawn from x0 to Pε in accent)
    drawArrow(ctx, x0px[0], x0px[1], pepspx[0], pepspx[1], cssVar('--accent'), 2.4, 8);

    // little dashed line: ε down to its projection Pε
    ctx.strokeStyle = '#666';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(epspx[0], epspx[1]);
    ctx.lineTo(pepspx[0], pepspx[1]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ε dot
    ctx.fillStyle = '#ff9b4a';
    ctx.beginPath();
    ctx.arc(epspx[0], epspx[1], 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cssVar('--fg');
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('ε', epspx[0] + 9, epspx[1] - 6);

    // Pε dot (smaller, on the subspace line)
    ctx.fillStyle = '#9b8cff';
    ctx.beginPath();
    ctx.arc(pepspx[0], pepspx[1], 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('Pε', pepspx[0] + 8, pepspx[1] + 14);

    // x0 dot (last, on top)
    ctx.fillStyle = '#5fa9ff';
    ctx.beginPath();
    ctx.arc(x0px[0], x0px[1], 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cssVar('--fg');
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('x₀', x0px[0] + 9, x0px[1] - 6);

    // numeric readout
    const u = sub(eps, x0);
    const uA = sub(peps, x0);
    readout.innerHTML = `
      <div>‖u‖ &nbsp;= <b>${Math.hypot(u[0], u[1]).toFixed(2)}</b> &nbsp;<span style="color:var(--fg-mute)">(full target)</span></div>
      <div>‖uₐ‖ = <b style="color:var(--accent)">${Math.hypot(uA[0], uA[1]).toFixed(2)}</b> &nbsp;<span style="color:var(--fg-mute)">(asymmetric)</span></div>
      <div style="margin-top:4px;font-size:11px;color:var(--fg-mute);">
        uₐ stays close to the dashed subspace; u points anywhere.
      </div>
    `;
  }

  // dragging
  function hitTest(mxy) {
    const x0px = toPx(x0), epspx = toPx(eps);
    if (Math.hypot(mxy[0] - x0px[0], mxy[1] - x0px[1]) < 14) return 'x0';
    if (Math.hypot(mxy[0] - epspx[0], mxy[1] - epspx[1]) < 14) return 'eps';
    return null;
  }
  function mousePos(e) {
    const rect = cv.getBoundingClientRect();
    return [(e.clientX - rect.left), (e.clientY - rect.top)];
  }
  cv.addEventListener('mousedown', (e) => { dragging = hitTest(mousePos(e)); });
  cv.addEventListener('mousemove', (e) => {
    if (!dragging) {
      cv.style.cursor = hitTest(mousePos(e)) ? 'grab' : 'default';
      return;
    }
    cv.style.cursor = 'grabbing';
    const p = fromPx(mousePos(e));
    if (dragging === 'x0') x0 = p;
    else if (dragging === 'eps') eps = p;
    draw();
  });
  window.addEventListener('mouseup', () => { dragging = null; });
  // touch
  cv.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const rect = cv.getBoundingClientRect();
    const mxy = [t.clientX - rect.left, t.clientY - rect.top];
    dragging = hitTest(mxy);
    if (dragging) e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches[0];
    const rect = cv.getBoundingClientRect();
    const p = fromPx([t.clientX - rect.left, t.clientY - rect.top]);
    if (dragging === 'x0') x0 = p; else if (dragging === 'eps') eps = p;
    draw();
  }, { passive: false });
  cv.addEventListener('touchend', () => { dragging = null; });

  const obs = new MutationObserver(draw);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
})();

/* =====================================================================
 * Widget 3: PCA vs random subspace
 * Toggle between a meaningful PCA axis fit to "patches" and a random axis.
 * Shows variance captured in each case.
 * ===================================================================== */
(function pcaVsRandom() {
  const host = document.getElementById('pca-vs-random');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="pcaCanvas"></canvas>
      <div class="controls">
        <div class="picker">
          <button class="btn active" data-mode="pca">PCA subspace</button>
          <button class="btn" data-mode="random">Random subspace</button>
        </div>
        <button class="btn" id="pcaReroll" style="font-size:12px;padding:6px 12px;align-self:flex-start;">Reroll patches</button>
        <div class="readout" id="pcaReadout"></div>
        <div style="font-family:var(--sans);font-size:12px;color:var(--fg-mute);line-height:1.5;">
          The paper: random subspaces perform close to the JiT baseline (FID ≈ 1.86);
          PCA at r=8 reaches FID 1.76. Same rank, totally different result.
        </div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#pcaCanvas');
  const readout = host.querySelector('#pcaReadout');
  let mode = 'pca';
  let patches = [];

  function regenerate() {
    patches = [];
    // patches are correlated 2D Gaussians along a slanted direction (signal)
    // plus a small isotropic noise — mimics low-rank patch structure
    const sigTheta = 0.55 + (Math.random() - 0.5) * 0.6;
    const sx = Math.cos(sigTheta), sy = Math.sin(sigTheta);
    for (let i = 0; i < 60; i++) {
      const t = randn() * 0.85;
      patches.push([
        t * sx + randn() * 0.18,
        t * sy + randn() * 0.18,
      ]);
    }
  }
  regenerate();

  function meanOf(pts) {
    let mx = 0, my = 0;
    for (const p of pts) { mx += p[0]; my += p[1]; }
    return [mx / pts.length, my / pts.length];
  }
  function pca(pts) {
    const m = meanOf(pts);
    let cxx = 0, cxy = 0, cyy = 0;
    for (const p of pts) {
      const dx = p[0] - m[0], dy = p[1] - m[1];
      cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
    }
    cxx /= pts.length; cxy /= pts.length; cyy /= pts.length;
    // top eigenvector of [[cxx,cxy],[cxy,cyy]]
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
    const lam1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const lam2 = tr - lam1;
    let vx = cxy, vy = lam1 - cxx;
    if (Math.abs(cxy) < 1e-9) { vx = cxx > cyy ? 1 : 0; vy = cxx > cyy ? 0 : 1; }
    const n = Math.hypot(vx, vy) || 1;
    return { mean: m, dir: [vx / n, vy / n], lam1, lam2 };
  }

  function draw() {
    const W = 460, H = 320;
    const ctx = devicePx(cv, W, H);
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, SCALE = 110;
    const toPx = (p) => [cx + p[0] * SCALE, cy - p[1] * SCALE];

    // background grid
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();

    // patches
    ctx.fillStyle = '#5fa9ff';
    ctx.globalAlpha = 0.55;
    for (const p of patches) {
      const px = toPx(p);
      ctx.beginPath();
      ctx.arc(px[0], px[1], 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // axis
    let dir, mean, captured;
    if (mode === 'pca') {
      const r = pca(patches);
      dir = r.dir; mean = r.mean;
      captured = r.lam1 / (r.lam1 + r.lam2);
    } else {
      const t = (window._pcaSeedRand !== undefined ? window._pcaSeedRand : (window._pcaSeedRand = Math.random())) * Math.PI;
      dir = [Math.cos(t), Math.sin(t)];
      mean = meanOf(patches);
      // projected variance
      let varAlong = 0, varTotal = 0;
      for (const p of patches) {
        const dx = p[0] - mean[0], dy = p[1] - mean[1];
        const proj = dx * dir[0] + dy * dir[1];
        varAlong += proj * proj;
        varTotal += dx * dx + dy * dy;
      }
      captured = varAlong / Math.max(varTotal, 1e-9);
    }

    // axis line
    ctx.strokeStyle = '#9b8cff';
    ctx.lineWidth = 2.4;
    const a1 = [mean[0] - 2.0 * dir[0], mean[1] - 2.0 * dir[1]];
    const a2 = [mean[0] + 2.0 * dir[0], mean[1] + 2.0 * dir[1]];
    ctx.beginPath();
    ctx.moveTo(...toPx(a1));
    ctx.lineTo(...toPx(a2));
    ctx.stroke();

    // projection ticks for each patch onto the axis
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.7;
    ctx.globalAlpha = 0.45;
    for (const p of patches) {
      const dx = p[0] - mean[0], dy = p[1] - mean[1];
      const proj = dx * dir[0] + dy * dir[1];
      const foot = [mean[0] + proj * dir[0], mean[1] + proj * dir[1]];
      const pp = toPx(p), fp = toPx(foot);
      ctx.beginPath(); ctx.moveTo(pp[0], pp[1]); ctx.lineTo(fp[0], fp[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    // label
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '12px var(--sans), sans-serif';
    ctx.fillText(mode === 'pca' ? 'PCA top axis (rank-1 subspace)' : 'random axis (rank-1 subspace)', 14, 22);

    readout.innerHTML = `
      <div>variance captured by axis: <b style="color:var(--accent)">${(captured * 100).toFixed(0)}%</b></div>
      <div style="font-size:11px;color:var(--fg-mute);margin-top:4px;">
        ${mode === 'pca' ? 'A meaningful subspace; one dimension carries most of the signal.' : 'An arbitrary direction; barely better than chance.'}
      </div>
    `;
  }

  host.querySelectorAll('.picker .btn').forEach(b => {
    b.addEventListener('click', () => {
      host.querySelectorAll('.picker .btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      mode = b.dataset.mode;
      delete window._pcaSeedRand;
      draw();
    });
  });
  host.querySelector('#pcaReroll').addEventListener('click', () => {
    regenerate();
    delete window._pcaSeedRand;
    draw();
  });
  const obs = new MutationObserver(draw);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
})();

/* =====================================================================
 * Widget 4: convergence race
 * Animated FID-vs-epoch curves for JiT-H/16 (x0-pred) and AsymFlow.
 * Numbers approximated from paper Figure 6.
 * ===================================================================== */
(function convergenceRace() {
  const host = document.getElementById('convergence-race');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="raceCanvas"></canvas>
      <div class="controls">
        <div class="play-row">
          <button class="btn" id="racePlay">▶ play</button>
          <span class="epoch-display" id="raceEpoch">epoch 0</span>
        </div>
        <div class="readout" id="raceReadout"></div>
        <div class="legend">
          <div><span class="swatch" style="background:#888"></span>JiT-H/16 baseline (r=0)</div>
          <div><span class="swatch" style="background:var(--accent)"></span>AsymFlow-H/16 (r=8)</div>
        </div>
        <div style="font-family:var(--sans);font-size:12px;color:var(--fg-mute);line-height:1.5;">
          Same network, same recipe — only the prediction target changes.
          AsymFlow reaches the baseline's final FID about 40% earlier.
        </div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#raceCanvas');
  const playBtn = host.querySelector('#racePlay');
  const epochEl = host.querySelector('#raceEpoch');
  const readout = host.querySelector('#raceReadout');
  const W = 460, H = 280;
  const ctx = devicePx(cv, W, H);

  // approximate FID-vs-epoch curves (unguided), digitized from Fig 6
  // x: epoch, y: FID
  const xs = [10, 20, 40, 60, 80, 100, 130, 160, 200, 250, 300, 400, 500, 600];
  const jit = [11.0, 7.5, 5.1, 3.9, 3.3, 2.9, 2.55, 2.35, 2.15, 2.00, 1.95, 1.90, 1.88, 1.86];
  const asy = [ 9.0, 5.9, 4.0, 3.1, 2.6, 2.3, 2.05, 1.92, 1.82, 1.77, 1.76, 1.75, 1.76, 1.76];

  let frame = 0;
  let playing = false;
  let lastTime = 0;

  function lerpAt(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    for (let i = 1; i < xs.length; i++) {
      if (x <= xs[i]) {
        const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return ys[i - 1] + t * (ys[i] - ys[i - 1]);
      }
    }
    return ys[ys.length - 1];
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const padL = 44, padR = 18, padT = 24, padB = 32;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const xMin = 0, xMax = 600;
    const yMin = 1.5, yMax = 11.5;
    const px = (e) => padL + (e - xMin) / (xMax - xMin) * plotW;
    const py = (f) => padT + (1 - (f - yMin) / (yMax - yMin)) * plotH;

    // grid
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    for (let f = 2; f <= 11; f += 2) {
      ctx.beginPath();
      ctx.moveTo(padL, py(f)); ctx.lineTo(W - padR, py(f));
      ctx.stroke();
      ctx.fillStyle = cssVar('--fg-mute');
      ctx.font = '10px var(--sans), sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(f), padL - 4, py(f) + 3);
    }
    ctx.textAlign = 'left';
    for (const e of [0, 100, 200, 300, 400, 500, 600]) {
      ctx.fillStyle = cssVar('--fg-mute');
      ctx.fillText(String(e), px(e) - 8, H - padB + 14);
    }
    // axis labels
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px var(--sans), sans-serif';
    ctx.fillText('epoch', W - padR - 32, H - padB + 28);
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('unguided FID', 0, 0);
    ctx.restore();

    // current epoch (animated)
    const e = (xMin + (frame / 100) * (xMax - xMin));
    const eClamped = Math.min(xMax, e);

    // curves: full curve in faint tone, animated portion in solid
    function plotLine(ys, color, faintColor) {
      ctx.strokeStyle = faintColor;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(px(xs[0]), py(ys[0]));
      for (let i = 1; i < xs.length; i++) ctx.lineTo(px(xs[i]), py(ys[i]));
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px(xs[0]), py(ys[0]));
      let prev = [xs[0], ys[0]];
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] <= eClamped) {
          ctx.lineTo(px(xs[i]), py(ys[i]));
          prev = [xs[i], ys[i]];
        } else {
          // linear interp to current epoch
          const t = (eClamped - prev[0]) / (xs[i] - prev[0]);
          const y = prev[1] + t * (ys[i] - prev[1]);
          ctx.lineTo(px(eClamped), py(y));
          break;
        }
      }
      ctx.stroke();

      // current dot
      const yNow = lerpAt(xs, ys, eClamped);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px(eClamped), py(yNow), 4, 0, Math.PI * 2);
      ctx.fill();
      return yNow;
    }

    const jitNow = plotLine(jit, '#888', '#888');
    const asyNow = plotLine(asy, cssVar('--accent'), cssVar('--accent'));

    // readout
    epochEl.textContent = `epoch ${Math.round(eClamped)}`;
    const gap = jitNow - asyNow;
    readout.innerHTML = `
      <div>JiT FID: <b>${jitNow.toFixed(2)}</b></div>
      <div>AsymFlow FID: <b style="color:var(--accent)">${asyNow.toFixed(2)}</b></div>
      <div style="font-size:11px;color:var(--fg-mute);margin-top:4px;">
        AsymFlow leads by ${gap.toFixed(2)} FID at this epoch.
      </div>
    `;
  }

  function tick(now) {
    if (!playing) return;
    if (!lastTime) lastTime = now;
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    frame = Math.min(100, frame + dt * 33); // 100 units in ~3s
    draw();
    if (frame >= 100) {
      playing = false;
      playBtn.textContent = '↺ replay';
      return;
    }
    requestAnimationFrame(tick);
  }
  playBtn.addEventListener('click', () => {
    if (frame >= 100) frame = 0;
    playing = !playing;
    if (playing) {
      playBtn.textContent = '⏸ pause';
      lastTime = 0;
      requestAnimationFrame(tick);
    } else {
      playBtn.textContent = '▶ play';
    }
  });

  const obs = new MutationObserver(draw);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  draw();
})();
