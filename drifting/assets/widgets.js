/* Drifting Models blog interactive widgets. Plain JS / Canvas. No deps. */

/* ---------- theme toggle ---------- */
(function () {
  const toggle = document.getElementById('themeToggle');
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

/* Sample helpers */
function randn() {
  // Box-Muller
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sampleBimodal(n, mode_a, mode_b, sigma) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = Math.random() < 0.5 ? mode_a : mode_b;
    out.push([m[0] + randn() * sigma, m[1] + randn() * sigma]);
  }
  return out;
}
function sampleGaussian(n, mu, sigma) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([mu[0] + randn() * sigma, mu[1] + randn() * sigma]);
  return out;
}

/* Drifting field calculation in 2D */
function computeDrift(xs, p_pos, q_neg, tau) {
  // For each x in xs, compute V(x) = V+(x) - V-(x) using normalized kernel weights.
  const Vs = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    // attract: weighted sum of (y+ - x) using k(x, y+)
    let wpSum = 0;
    let attrX = 0, attrY = 0;
    for (let j = 0; j < p_pos.length; j++) {
      const y = p_pos[j];
      const d = Math.hypot(x[0] - y[0], x[1] - y[1]);
      const w = Math.exp(-d / tau);
      wpSum += w;
      attrX += w * (y[0] - x[0]);
      attrY += w * (y[1] - x[1]);
    }
    attrX /= (wpSum + 1e-8);
    attrY /= (wpSum + 1e-8);
    // repel: weighted sum of (y- - x) using k(x, y-)
    let wnSum = 0;
    let repX = 0, repY = 0;
    for (let j = 0; j < q_neg.length; j++) {
      const y = q_neg[j];
      const d = Math.hypot(x[0] - y[0], x[1] - y[1]);
      // skip self
      if (d < 0.001) continue;
      const w = Math.exp(-d / tau);
      wnSum += w;
      repX += w * (y[0] - x[0]);
      repY += w * (y[1] - x[1]);
    }
    repX /= (wnSum + 1e-8);
    repY /= (wnSum + 1e-8);
    Vs.push([attrX - repX, attrY - repY]);
  }
  return Vs;
}

/* =====================================================================
 * Widget 1: PUSHFORWARD (animated training)
 * ===================================================================== */
(function pushforward() {
  const host = document.getElementById('pushforward');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="picker">
      <button class="btn active" data-init="between">init: between modes</button>
      <button class="btn" data-init="far">init: far away</button>
      <button class="btn" data-init="collapsed">init: collapsed</button>
    </div>
    <canvas id="pfCanvas" width="560" height="320"></canvas>
    <div class="controls">
      <button class="btn" id="pfPlay">▶ play</button>
      <button class="btn" id="pfReset">⟲ reset</button>
    </div>
    <div class="readout" id="pfReadout"></div>
  `);

  const cv = host.querySelector('#pfCanvas');
  const ctx = devicePx(cv, 560, 320);
  const W = 560, H = 320;
  const readout = host.querySelector('#pfReadout');
  // World coordinates: x in [-3, 3], y in [-2, 2]
  const wx = (x) => (x + 3) / 6 * W;
  const wy = (y) => H - (y + 2) / 4 * H;

  // Data distribution: bimodal
  const mode_a = [-1.6, 0.6];
  const mode_b = [1.6, -0.6];
  let p_samples = sampleBimodal(50, mode_a, mode_b, 0.25);
  let q_samples = [];
  let iter = 0;
  let timer = null;
  let initType = 'between';

  function resetQ() {
    if (initType === 'between') q_samples = sampleGaussian(40, [0, 0], 0.35);
    else if (initType === 'far') q_samples = sampleGaussian(40, [0, 1.6], 0.3);
    else if (initType === 'collapsed') q_samples = sampleGaussian(40, [-1.4, 0.6], 0.12);
    iter = 0;
  }

  function draw(showArrows) {
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 6; i++) {
      const x = wx(-3 + i);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const y = wy(-2 + i);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // data p (blue)
    ctx.fillStyle = '#5fa9ff';
    p_samples.forEach(p => {
      ctx.beginPath(); ctx.arc(wx(p[0]), wy(p[1]), 2.5, 0, Math.PI * 2); ctx.fill();
    });
    // generator q (orange)
    ctx.fillStyle = cssVar('--accent') || '#ff9b4a';
    q_samples.forEach(q => {
      ctx.beginPath(); ctx.arc(wx(q[0]), wy(q[1]), 3, 0, Math.PI * 2); ctx.fill();
    });
    // velocity field for a subset
    if (showArrows) {
      const Vs = computeDrift(q_samples, p_samples, q_samples, 0.45);
      const meanV2 = Vs.reduce((s, v) => s + v[0]*v[0] + v[1]*v[1], 0) / Vs.length;
      ctx.strokeStyle = '#ffb84d';
      ctx.fillStyle = '#ffb84d';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < q_samples.length; i += 3) {
        const v = Vs[i];
        const scale = 30;
        const sx = wx(q_samples[i][0]), sy = wy(q_samples[i][1]);
        const ex = sx + v[0] * scale, ey = sy - v[1] * scale;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      // readout
      readout.innerHTML = `iter ${iter} &middot; mean ‖V‖² = <b>${meanV2.toFixed(4)}</b>`;
    } else {
      readout.innerHTML = `iter ${iter} &middot; press play to run drift iterations`;
    }
    // legend
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('● data p', 10, 16);
    ctx.fillStyle = cssVar('--accent');
    ctx.fillText('● generator q', 70, 16);
    ctx.fillStyle = '#ffb84d';
    ctx.fillText('→ drift V', 168, 16);
  }

  function step() {
    const Vs = computeDrift(q_samples, p_samples, q_samples, 0.45);
    const lr = 0.4;
    for (let i = 0; i < q_samples.length; i++) {
      q_samples[i][0] += lr * Vs[i][0];
      q_samples[i][1] += lr * Vs[i][1];
    }
    iter++;
    draw(true);
    if (iter > 60) {
      stopTimer();
      host.querySelector('#pfPlay').textContent = '▶ play';
    }
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function play() {
    if (timer) { stopTimer(); host.querySelector('#pfPlay').textContent = '▶ play'; return; }
    if (iter > 60) { resetQ(); }
    host.querySelector('#pfPlay').textContent = '❚❚ pause';
    timer = setInterval(step, 120);
  }
  function reset() {
    stopTimer();
    host.querySelector('#pfPlay').textContent = '▶ play';
    resetQ();
    draw(false);
  }
  host.querySelectorAll('.picker .btn').forEach(b => {
    b.onclick = () => {
      host.querySelectorAll('.picker .btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      initType = b.dataset.init;
      reset();
    };
  });
  host.querySelector('#pfPlay').onclick = play;
  host.querySelector('#pfReset').onclick = reset;
  reset();
})();

/* =====================================================================
 * Widget 2: ANTISYMMETRY PROOF (3 clickable steps)
 * ===================================================================== */
(function antisymmetryProof() {
  const host = document.getElementById('antisymmetry-proof');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="steps">
      <div class="step" data-i="0">
        <span class="num">1</span><strong>If $q = p$, then $V_{p,q}(x)$ and $V_{q,p}(x)$ have the same arguments.</strong>
        <div class="reveal">
          Both $V_{p,q}$ and $V_{q,p}$ are computed from samples of $p$ and samples of $q$.
          Since $q = p$, swapping the two doesn't change anything — they're the same distribution.
          <div class="formula" style="margin-top:6px;">⇒ $V_{p,q}(x) = V_{q,p}(x)$</div>
        </div>
      </div>
      <div class="step" data-i="1">
        <span class="num">2</span><strong>By the anti-symmetry assumption: $V_{q,p}(x) = -V_{p,q}(x)$.</strong>
        <div class="reveal">
          This is the constraint we <em>chose</em> when designing $V$. We built it so that swapping
          its two distribution arguments flips the sign.
          <div class="formula" style="margin-top:6px;">⇒ $V_{q,p}(x) = -V_{p,q}(x)$</div>
        </div>
      </div>
      <div class="step" data-i="2">
        <span class="num">3</span><strong>Combine the two: a number equal to its own negative must be zero.</strong>
        <div class="reveal">
          From step 1: $V_{p,q}(x) = V_{q,p}(x)$.<br/>
          From step 2: $V_{q,p}(x) = -V_{p,q}(x)$.<br/>
          Therefore: $V_{p,q}(x) = -V_{p,q}(x)$, which forces:
          <div class="formula" style="margin-top:6px; color: var(--accent); font-weight: 700;">⇒ $V_{p,q}(x) = 0$ for all $x$.</div>
          The generator has reached equilibrium. ∎
        </div>
      </div>
    </div>
  `);

  host.querySelectorAll('.step').forEach(s => {
    s.addEventListener('click', () => s.classList.toggle('revealed'));
  });
})();

/* =====================================================================
 * Widget 3: DRIFT EXPLORER (click to place sample, see V)
 * ===================================================================== */
(function driftExplorer() {
  const host = document.getElementById('drift-explorer');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="deCanvas" width="440" height="320"></canvas>
      <div class="controls">
        <p class="legend">
          <span class="swatch" style="background:#5fa9ff;"></span>data ($y^+$)
          <span class="swatch" style="background:var(--accent);"></span>generator ($y^-$)
          <span class="swatch" style="background:#fff; border: 1px solid var(--rule);"></span>your sample $x$
        </p>
        <div>
          <label style="font-family:var(--sans);font-size:13px;color:var(--fg-mute);">kernel temperature τ</label>
          <input type="range" id="deTau" min="0.1" max="2" step="0.05" value="0.6"/>
        </div>
        <div class="toggle-row">
          <button class="btn active" id="deShowAttract">show V⁺ (attract)</button>
          <button class="btn active" id="deShowRepel">show V⁻ (repel)</button>
        </div>
        <div class="toggle-row">
          <button class="btn" id="deReshuffle">⟲ reshuffle distributions</button>
        </div>
        <div class="readout" id="deReadout"></div>
        <p style="font-family:var(--sans); font-size:11px; color:var(--fg-mute); margin:6px 0 0;">
          Click anywhere in the canvas to place your sample $x$.
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#deCanvas');
  const ctx = devicePx(cv, 440, 320);
  const W = 440, H = 320;
  const tauSlider = host.querySelector('#deTau');
  const readout = host.querySelector('#deReadout');
  const showAttractBtn = host.querySelector('#deShowAttract');
  const showRepelBtn = host.querySelector('#deShowRepel');
  const reshuffleBtn = host.querySelector('#deReshuffle');

  let showAttract = true, showRepel = true;
  showAttractBtn.onclick = () => { showAttract = !showAttract; showAttractBtn.classList.toggle('active', showAttract); draw(); };
  showRepelBtn.onclick = () => { showRepel = !showRepel; showRepelBtn.classList.toggle('active', showRepel); draw(); };

  // World coords: x in [-3, 3], y in [-2, 2]
  const wx = (x) => (x + 3) / 6 * W;
  const wy = (y) => H - (y + 2) / 4 * H;
  const ix = (px) => px / W * 6 - 3;
  const iy = (py) => -(py / H * 4 - 2);

  let p_samples, q_samples;
  function reshuffle() {
    p_samples = sampleBimodal(30, [-1.4, 0.5], [1.4, -0.5], 0.3);
    q_samples = sampleGaussian(20, [0, 0.6], 0.35);
  }
  reshuffle();
  reshuffleBtn.onclick = () => { reshuffle(); draw(); };

  let x = [0, -0.3]; // selected sample

  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    x = [ix(px), iy(py)];
    draw();
  });

  function draw() {
    const tau = parseFloat(tauSlider.value);
    ctx.clearRect(0, 0, W, H);
    // grid
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 6; i++) {
      const xv = wx(-3 + i);
      ctx.beginPath(); ctx.moveTo(xv, 0); ctx.lineTo(xv, H); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const yv = wy(-2 + i);
      ctx.beginPath(); ctx.moveTo(0, yv); ctx.lineTo(W, yv); ctx.stroke();
    }
    // data
    ctx.fillStyle = '#5fa9ff';
    p_samples.forEach(p => { ctx.beginPath(); ctx.arc(wx(p[0]), wy(p[1]), 3, 0, Math.PI * 2); ctx.fill(); });
    // generator
    ctx.fillStyle = cssVar('--accent') || '#ff9b4a';
    q_samples.forEach(p => { ctx.beginPath(); ctx.arc(wx(p[0]), wy(p[1]), 3, 0, Math.PI * 2); ctx.fill(); });

    // compute V+ and V- separately
    let wp = 0, attrX = 0, attrY = 0;
    p_samples.forEach(y => {
      const d = Math.hypot(x[0]-y[0], x[1]-y[1]);
      const w = Math.exp(-d / tau);
      wp += w;
      attrX += w * (y[0] - x[0]);
      attrY += w * (y[1] - x[1]);
    });
    attrX /= (wp + 1e-8); attrY /= (wp + 1e-8);

    let wn = 0, repX = 0, repY = 0;
    q_samples.forEach(y => {
      const d = Math.hypot(x[0]-y[0], x[1]-y[1]);
      if (d < 0.01) return;
      const w = Math.exp(-d / tau);
      wn += w;
      repX += w * (y[0] - x[0]);
      repY += w * (y[1] - x[1]);
    });
    repX /= (wn + 1e-8); repY /= (wn + 1e-8);
    const Vx = attrX - repX, Vy = attrY - repY;

    // draw attract vector (blue arrow from x)
    const sx = wx(x[0]), sy = wy(x[1]);
    const SCALE = 60;
    if (showAttract) {
      drawArrow(sx, sy, sx + attrX * SCALE, sy - attrY * SCALE, '#5fa9ff');
    }
    // draw repel vector (orange arrow from x; note the sign: we draw -V- as the actual repulsion direction)
    if (showRepel) {
      drawArrow(sx, sy, sx - repX * SCALE, sy + repY * SCALE, cssVar('--accent') || '#ff9b4a');
    }
    // draw resultant V (white)
    drawArrow(sx, sy, sx + Vx * SCALE, sy - Vy * SCALE, '#fff', 3);

    // x dot
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // legend in corner
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('blue arrow: V⁺ (toward data)', 10, 16);
    ctx.fillText('orange arrow: V⁻ negated (away from generator samples)', 10, 30);
    ctx.fillText('white arrow: V = V⁺ − V⁻ (resultant drift)', 10, 44);

    // readout
    readout.innerHTML = `
      <div>x = (<b>${x[0].toFixed(2)}</b>, <b>${x[1].toFixed(2)}</b>)</div>
      <div>V⁺ = (<b>${attrX.toFixed(3)}</b>, <b>${attrY.toFixed(3)}</b>)</div>
      <div>V⁻ = (<b>${repX.toFixed(3)}</b>, <b>${repY.toFixed(3)}</b>)</div>
      <div style="color: var(--accent); margin-top:6px;">V = (<b>${Vx.toFixed(3)}</b>, <b>${Vy.toFixed(3)}</b>)</div>
      <div style="font-size:11px; color: var(--fg-mute);">‖V‖ = ${Math.hypot(Vx, Vy).toFixed(3)}</div>
    `;
  }

  function drawArrow(x1, y1, x2, y2, color, width=2) {
    if (Math.hypot(x2 - x1, y2 - y1) < 2) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.translate(x2, y2);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  tauSlider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: SPEED COMPARE (diffusion vs drifting inference)
 * Fakes inference visually: diffusion shows iterative refinement of a
 * noisy block, drifting shows one-step generation.
 * ===================================================================== */
(function speedCompare() {
  const host = document.getElementById('speed-compare');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="picker">
      <button class="btn active" data-mode="drift">Drifting Model (1 step)</button>
      <button class="btn" data-mode="diffusion">Diffusion (250 steps × 2 CFG)</button>
    </div>
    <canvas id="scCanvas" width="560" height="280"></canvas>
    <div class="controls">
      <button class="btn" id="scPlay">▶ generate</button>
    </div>
    <div class="readout" id="scReadout"></div>
  `);

  const cv = host.querySelector('#scCanvas');
  const ctx = devicePx(cv, 560, 280);
  const W = 560, H = 280;
  const readout = host.querySelector('#scReadout');
  const playBtn = host.querySelector('#scPlay');

  let mode = 'drift';
  // pretend image is a 16x16 grid we "denoise"
  const GW = 32, GH = 32;
  let pixels;
  function init() {
    pixels = new Array(GW * GH);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = Math.random() * 255;
    }
  }
  function targetPixels() {
    // simple gradient + circle to look like a "result"
    const target = new Array(GW * GH);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const cx = GW / 2, cy = GH / 2.2;
        const r = Math.hypot(x - cx, y - cy);
        const angle = Math.atan2(y - cy, x - cx);
        // sun-like blob with orange-yellow gradient
        let v = Math.max(0, 200 - r * 9) + 50;
        v += 30 * Math.sin(angle * 4);
        target[y * GW + x] = Math.max(0, Math.min(255, v));
      }
    }
    return target;
  }

  function drawPanel(panelX, panelW, pix, title) {
    const cellW = panelW / GW;
    const cellH = (H - 50) / GH;
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const v = pix[y * GW + x];
        // map value to color (sun: orange-red gradient)
        const r = Math.min(255, 100 + v * 0.8);
        const g = Math.min(255, 50 + v * 0.6);
        const b = Math.min(255, v * 0.3);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(panelX + x * cellW, 30 + y * cellH, cellW + 1, cellH + 1);
      }
    }
    // title
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, panelX + panelW / 2, 22);
  }

  function draw(step, totalSteps) {
    ctx.clearRect(0, 0, W, H);
    // single big panel showing current state
    drawPanel(W / 2 - 120, 240, pixels, mode === 'drift' ? 'one-step output' : `step ${step}/${totalSteps}`);
    // progress bar at bottom
    const barY = H - 16;
    const barW = 480;
    const barX = (W - barW) / 2;
    ctx.fillStyle = cssVar('--bg-card');
    ctx.fillRect(barX, barY, barW, 6);
    const frac = step / totalSteps;
    ctx.fillStyle = cssVar('--accent');
    ctx.fillRect(barX, barY, barW * frac, 6);
  }

  function generate() {
    playBtn.textContent = '...';
    playBtn.disabled = true;
    init();
    const target = targetPixels();

    if (mode === 'drift') {
      // single-step: blend from noise to target in one frame
      const startTime = performance.now();
      function anim() {
        const t = Math.min(1, (performance.now() - startTime) / 600);
        for (let i = 0; i < pixels.length; i++) {
          // smooth blend - in real Drifting this is a single forward pass; we animate for visual clarity
          const noise = pixels[i];
          pixels[i] = (1 - t) * noise + t * target[i];
        }
        draw(t, 1);
        readout.innerHTML = `Drifting Model &middot; <b>1 NFE</b> &middot; ~600ms one-shot`;
        if (t < 1) requestAnimationFrame(anim);
        else { playBtn.textContent = '▶ generate'; playBtn.disabled = false; }
      }
      anim();
    } else {
      // diffusion: 250 small steps
      const T = 250;
      let stepN = 0;
      const startTime = performance.now();
      function step() {
        // each step blend a little toward target
        const lr = 0.024;
        for (let i = 0; i < pixels.length; i++) {
          pixels[i] = (1 - lr) * pixels[i] + lr * target[i];
        }
        stepN++;
        if (stepN % 5 === 0 || stepN === T) draw(stepN, T);
        const elapsedMs = performance.now() - startTime;
        readout.innerHTML = `Diffusion &middot; step <b>${stepN}/${T}</b> &middot; ${elapsedMs.toFixed(0)}ms elapsed`;
        if (stepN < T) requestAnimationFrame(step);
        else { playBtn.textContent = '▶ generate'; playBtn.disabled = false; }
      }
      step();
    }
  }

  host.querySelectorAll('.picker .btn').forEach(b => {
    b.onclick = () => {
      host.querySelectorAll('.picker .btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      mode = b.dataset.mode;
      init();
      draw(0, mode === 'drift' ? 1 : 250);
      readout.innerHTML = mode === 'drift'
        ? 'Drifting Model · 1 NFE · press generate'
        : 'Diffusion · 250 NFE · press generate';
    };
  });

  playBtn.onclick = generate;

  init();
  draw(0, mode === 'drift' ? 1 : 250);
  readout.innerHTML = 'Drifting Model · 1 NFE · press generate';
})();
