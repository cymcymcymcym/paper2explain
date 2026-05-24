/* IRED (Iterative Reasoning through Energy Diffusion) blog widgets.
 * Plain JS / Canvas 2D. No deps.
 *   Widget 1  field-compare       — energy field (scalar) vs score field (vector)
 *   Widget 2  annealed-descent    — roll a ball down a smooth->sharp landscape
 *   Widget 3  contrastive-shaping — slide the global minimum onto the true answer
 *   Widget 4  compute-dial        — test-time optimization steps vs accuracy
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
function drawArrow(ctx, x1, y1, x2, y2, color, width = 2) {
  if (Math.hypot(x2 - x1, y2 - y1) < 1.5) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-7, -3.5); ctx.lineTo(-7, 3.5); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* =====================================================================
 * Widget 1: FIELD COMPARE — energy field vs score field
 * An energy model gives a scalar landscape (a bottom you can find + a value
 * you can read). A raw score model is just a vector field that can circulate
 * forever with no minimum to verify.
 * ===================================================================== */
(function fieldCompare() {
  const host = document.getElementById('field-compare');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="fcCanvas" width="420" height="320"></canvas>
      <div class="controls">
        <div class="picker">
          <button class="btn active" data-mode="energy">energy model</button>
          <button class="btn" data-mode="score">score model</button>
        </div>
        <div class="toggle-row">
          <button class="btn" id="fcRelease">▶ release probe</button>
        </div>
        <div class="readout" id="fcReadout"></div>
        <p class="hint">Click in the field to drop the probe somewhere new.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#fcCanvas');
  const ctx = devicePx(cv, 420, 320);
  const W = 420, H = 320;
  const readout = host.querySelector('#fcReadout');
  const releaseBtn = host.querySelector('#fcRelease');

  // world coords
  const XLO = -3, XHI = 3, YLO = -2.4, YHI = 2.4;
  const wx = (x) => (x - XLO) / (XHI - XLO) * W;
  const wy = (y) => H - (y - YLO) / (YHI - YLO) * H;
  const ix = (px) => XLO + px / W * (XHI - XLO);
  const iy = (py) => YHI - py / H * (YHI - YLO);

  const tx = 0.4, ty = 0.2;            // target / basin center
  let mode = 'energy';
  let probe = [-1.9, 1.5];
  let traj = [];
  let anim = null;

  const Efn = (x, y) => 0.5 * ((x - tx) ** 2 + (y - ty) ** 2);
  function field(x, y) {
    const gx = (tx - x), gy = (ty - y);            // -grad E (radial, inward)
    if (mode === 'energy') return [gx, gy];
    // score: mostly rotational, a hair of inward drift -> orbits, never settles
    return [0.15 * gx - 1.5 * (y - ty), 0.15 * gy + 1.5 * (x - tx)];
  }

  function computeTraj() {
    traj = [probe.slice()];
    let p = probe.slice();
    const dt = 0.05, steps = 170;
    for (let i = 0; i < steps; i++) {
      const f = field(p[0], p[1]);
      p = [p[0] + dt * f[0], p[1] + dt * f[1]];
      p[0] = Math.max(XLO, Math.min(XHI, p[0]));
      p[1] = Math.max(YLO, Math.min(YHI, p[1]));
      traj.push(p.slice());
    }
  }

  function drawField(nShown) {
    ctx.clearRect(0, 0, W, H);
    // heatmap (energy mode only — a score field has no potential to show)
    if (mode === 'energy') {
      const cs = 14;
      for (let py = 0; py < H; py += cs) {
        for (let px = 0; px < W; px += cs) {
          const e = Efn(ix(px + cs / 2), iy(py + cs / 2));
          const v = Math.exp(-0.42 * e);          // 1 at basin -> 0 far away
          ctx.fillStyle = lerpColor('#0e1118', '#5fa9ff', v);
          ctx.fillRect(px, py, cs + 1, cs + 1);
        }
      }
    } else {
      ctx.fillStyle = '#14161d';
      ctx.fillRect(0, 0, W, H);
    }
    // vector field (downsampled grid)
    const cols = 9, rows = 7;
    ctx.globalAlpha = 0.85;
    for (let i = 1; i < cols; i++) {
      for (let j = 1; j < rows; j++) {
        const x = XLO + (XHI - XLO) * i / cols;
        const y = YLO + (YHI - YLO) * j / rows;
        const f = field(x, y);
        const mag = Math.hypot(f[0], f[1]) + 1e-6;
        const L = Math.min(16, 7 + mag * 3);
        const ux = f[0] / mag, uy = f[1] / mag;
        const sx = wx(x), sy = wy(y);
        drawArrow(ctx, sx, sy, sx + ux * L, sy - uy * L, '#8fb8e8', 1.4);
      }
    }
    ctx.globalAlpha = 1;
    // target basin marker (energy mode)
    if (mode === 'energy') {
      ctx.strokeStyle = '#cfe2ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(wx(tx), wy(ty), 5, 0, Math.PI * 2); ctx.stroke();
    }
    // probe trajectory so far
    if (nShown > 1) {
      ctx.strokeStyle = cssVar('--accent') || '#ff9b6a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < nShown; i++) {
        const p = traj[i];
        if (i === 0) ctx.moveTo(wx(p[0]), wy(p[1]));
        else ctx.lineTo(wx(p[0]), wy(p[1]));
      }
      ctx.stroke();
    }
    // probe head
    const head = nShown > 0 ? traj[nShown - 1] : probe;
    ctx.fillStyle = cssVar('--accent') || '#ff9b6a';
    ctx.beginPath(); ctx.arc(wx(head[0]), wy(head[1]), 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();

    // info
    if (mode === 'energy') {
      const e = Efn(head[0], head[1]);
      const settled = Math.hypot(head[0] - tx, head[1] - ty) < 0.12;
      readout.innerHTML = `mode: <b>energy</b><br>` +
        `E(probe) = <b>${e.toFixed(3)}</b> &nbsp;<span style="color:var(--fg-mute)">— a value you can read</span><br>` +
        (settled ? `<span style="color:var(--accent)">✓ reached the minimum</span>`
                 : `descending toward the bottom…`);
    } else {
      readout.innerHTML = `mode: <b>score</b><br>` +
        `E(probe) = <b>—</b> &nbsp;<span style="color:var(--fg-mute)">(no scalar; only a direction)</span><br>` +
        `<span style="color:#ff8c8c">↻ the probe just circles — no bottom to find</span>`;
    }
  }

  function play() {
    if (anim) cancelAnimationFrame(anim);
    computeTraj();
    let i = 0;
    const tick = () => {
      i += 2;
      drawField(Math.min(i, traj.length));
      if (i < traj.length) anim = requestAnimationFrame(tick);
    };
    tick();
  }

  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    probe = [ix((e.clientX - rect.left) * (W / rect.width)),
             iy((e.clientY - rect.top) * (H / rect.height))];
    if (anim) cancelAnimationFrame(anim);
    drawField(0);
  });
  host.querySelectorAll('.picker .btn').forEach(b => {
    b.onclick = () => {
      host.querySelectorAll('.picker .btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      mode = b.dataset.mode;
      if (anim) cancelAnimationFrame(anim);
      drawField(0);
    };
  });
  releaseBtn.onclick = play;
  drawField(0);
})();

/* =====================================================================
 * Widget 2: ANNEALED DESCENT — roll a ball down a smooth->sharp landscape
 * Same energy function as the manim animation.
 * ===================================================================== */
(function annealedDescent() {
  const host = document.getElementById('annealed-descent');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="adCanvas" width="460" height="300"></canvas>
      <div class="controls">
        <div>
          <label>sharpness s &nbsp;(smooth → rugged)</label>
          <input type="range" id="adS" min="0" max="1" step="0.01" value="1"/>
        </div>
        <div class="toggle-row">
          <button class="btn" id="adDirect">▶ direct descent</button>
          <button class="btn" id="adAnneal">▶ annealed descent</button>
        </div>
        <div class="toggle-row">
          <button class="btn" id="adReset">⟲ reset</button>
        </div>
        <div class="readout" id="adReadout"></div>
        <p class="hint">Click the plot to choose where the ball starts.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#adCanvas');
  const ctx = devicePx(cv, 460, 300);
  const W = 460, H = 300;
  const sSlider = host.querySelector('#adS');
  const readout = host.querySelector('#adReadout');

  const YSTAR = 1.4, YLO = -3.2, YHI = 3.6, ELO = -1.2, EHI = 4.9;
  const wx = (y) => 28 + (y - YLO) / (YHI - YLO) * (W - 40);
  const wy = (E) => (H - 28) - (E - ELO) / (EHI - ELO) * (H - 44);
  const ix = (px) => YLO + (px - 28) / (W - 40) * (YHI - YLO);

  const Efn = (y, s) => 0.11 * (y - YSTAR) ** 2 + s * 0.95 * Math.cos(2.3 * (y - 0.2))
    + s * (-1.7) * Math.exp(-((y - YSTAR) ** 2) / (2 * 0.10)) + 1.6;
  const dE = (y, s) => { const h = 1e-3; return (Efn(y + h, s) - Efn(y - h, s)) / (2 * h); };

  let x0 = -2.7;            // start position
  let frames = [];          // [{y,s}]
  let fi = 0, anim = null;
  let resultMsg = '';

  function drawCurve(s) {
    ctx.clearRect(0, 0, W, H);
    // axis baseline
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, wy(0)); ctx.lineTo(W - 6, wy(0)); ctx.stroke();
    // y* dashed line
    ctx.strokeStyle = '#7d8694';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(wx(YSTAR), 12); ctx.lineTo(wx(YSTAR), H - 20); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#7d8694'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('y*', wx(YSTAR), H - 7);
    // energy curve
    ctx.strokeStyle = '#5fa9ff'; ctx.lineWidth = 3;
    ctx.beginPath();
    let first = true;
    for (let y = YLO; y <= YHI; y += 0.02) {
      const E = Math.min(EHI, Efn(y, s));
      const X = wx(y), Y = wy(E);
      if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    // labels
    ctx.fillStyle = cssVar('--fg-mute'); ctx.font = '11px sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('energy E(x, y)', 8, 14);
    ctx.textAlign = 'right'; ctx.fillText('candidate solution y →', W - 6, 14);
  }

  function drawBall(y, s, color) {
    const X = wx(y), Y = wy(Math.min(EHI, Efn(y, s)));
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(X, Y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
  }

  function render(frame) {
    drawCurve(frame.s);
    drawBall(frame.y, frame.s, cssVar('--accent') || '#ff9b6a');
    const status = resultMsg ||
      `start y = ${x0.toFixed(2)} &middot; drag s or press a button`;
    readout.innerHTML = status;
  }

  function gdTraj(y0, s, steps, lr) {
    let y = y0; const out = [{ y, s }];
    for (let i = 0; i < steps; i++) {
      y = y - lr * dE(y, s);
      y = Math.max(YLO + 0.05, Math.min(YHI - 0.05, y));
      out.push({ y, s });
    }
    return out;
  }

  function sample(arr, maxN) {
    if (arr.length <= maxN) return arr;
    const out = []; const stride = arr.length / maxN;
    for (let i = 0; i < maxN; i++) out.push(arr[Math.floor(i * stride)]);
    out.push(arr[arr.length - 1]);
    return out;
  }

  function finalize() {
    const last = frames[frames.length - 1];
    const ok = Math.abs(last.y - YSTAR) < 0.3;
    resultMsg = ok
      ? `landed at y = <b>${last.y.toFixed(2)}</b> &nbsp;<span style="color:var(--accent)">✓ global minimum (true answer)</span>`
      : `landed at y = <b>${last.y.toFixed(2)}</b> &nbsp;<span style="color:#ff8c8c">✗ stuck in a local minimum</span>`;
    render(last);
  }

  function playFrames() {
    if (anim) cancelAnimationFrame(anim);
    resultMsg = '';
    fi = 0;
    const tick = () => {
      if (fi < frames.length) { render(frames[fi]); fi++; anim = requestAnimationFrame(tick); }
      else finalize();
    };
    tick();
  }

  function runDirect() {
    const s = parseFloat(sSlider.value);
    frames = sample(gdTraj(x0, s, 500, 0.012), 110);
    playFrames();
  }
  function runAnneal() {
    const stages = [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1.0];
    let y = x0; let all = [];
    stages.forEach(s => {
      const seg = gdTraj(y, s, 100, 0.08);
      all = all.concat(seg);
      y = seg[seg.length - 1].y;
    });
    frames = sample(all, 140);
    sSlider.value = '1';
    playFrames();
  }
  function reset() {
    if (anim) cancelAnimationFrame(anim);
    resultMsg = '';
    render({ y: x0, s: parseFloat(sSlider.value) });
  }

  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    x0 = Math.max(YLO + 0.1, Math.min(YHI - 0.1, ix((e.clientX - rect.left) * (W / rect.width))));
    reset();
  });
  sSlider.addEventListener('input', () => {
    if (anim) cancelAnimationFrame(anim);
    resultMsg = '';
    render({ y: x0, s: parseFloat(sSlider.value) });
  });
  host.querySelector('#adDirect').onclick = runDirect;
  host.querySelector('#adAnneal').onclick = runAnneal;
  host.querySelector('#adReset').onclick = reset;
  reset();
})();

/* =====================================================================
 * Widget 3: CONTRASTIVE SHAPING — slide the global minimum onto the truth
 * Denoising alone can leave a spurious basin lower than the true one. The
 * contrastive term lifts the impostor and deepens the true well.
 * ===================================================================== */
(function contrastiveShaping() {
  const host = document.getElementById('contrastive-shaping');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="csCanvas" width="460" height="300"></canvas>
      <div class="controls">
        <div>
          <label>contrastive strength</label>
          <input type="range" id="csC" min="0" max="1" step="0.01" value="0"/>
        </div>
        <p class="legend">
          <span><span class="swatch" style="background:#ff9b6a;"></span>argmin (search result)</span>
          <span><span class="swatch" style="background:#5fa9ff;"></span>true answer y*</span>
        </p>
        <div class="readout" id="csReadout"></div>
        <p class="hint">At strength 0 you have score supervision only. Slide right to add contrastive shaping.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#csCanvas');
  const ctx = devicePx(cv, 460, 300);
  const W = 460, H = 300;
  const cSlider = host.querySelector('#csC');
  const readout = host.querySelector('#csReadout');

  const YLO = -3.2, YHI = 3.2, ELO = -1.0, EHI = 3.4;
  const YT = 1.2, YS = -1.5;      // true well, spurious well
  const wx = (y) => 24 + (y - YLO) / (YHI - YLO) * (W - 36);
  const wy = (E) => (H - 26) - (E - ELO) / (EHI - ELO) * (H - 42);

  const gauss = (y, mu, w) => Math.exp(-((y - mu) ** 2) / (2 * w));
  // true well deepens with c; spurious well lifts with c
  const Efn = (y, c) => 0.10 * y * y
    - 1.3 * (1 + 0.85 * c) * gauss(y, YT, 0.18)
    - 1.7 * (1 - 0.92 * c) * gauss(y, YS, 0.22) + 2.2;
  const dE = (y, c) => { const h = 1e-3; return (Efn(y + h, c) - Efn(y - h, c)) / (2 * h); };

  function argmin(c) {
    let best = YLO, bestE = Infinity;
    for (let y = YLO; y <= YHI; y += 0.005) {
      const e = Efn(y, c);
      if (e < bestE) { bestE = e; best = y; }
    }
    return [best, bestE];
  }

  function draw() {
    const c = parseFloat(cSlider.value);
    ctx.clearRect(0, 0, W, H);
    // baseline
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(16, wy(0)); ctx.lineTo(W - 6, wy(0)); ctx.stroke();
    // true-answer marker
    ctx.strokeStyle = '#5fa9ff'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(wx(YT), 12); ctx.lineTo(wx(YT), H - 18); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5fa9ff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('y*', wx(YT), H - 5);
    // energy curve
    ctx.strokeStyle = cssVar('--fg-mute'); ctx.lineWidth = 3;
    ctx.beginPath();
    let first = true;
    for (let y = YLO; y <= YHI; y += 0.02) {
      const E = Math.min(EHI, Efn(y, c));
      const X = wx(y), Y = wy(E);
      if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    // labels
    ctx.fillStyle = cssVar('--fg-mute'); ctx.font = '11px sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('energy E(x, y)', 8, 14);
    // annotate the two wells
    ctx.fillStyle = '#7d8694'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('spurious basin', wx(YS), wy(Efn(YS, c)) + 18);
    // global-minimum ball
    const [ya, ea] = argmin(c);
    const correct = Math.abs(ya - YT) < 0.3;
    ctx.fillStyle = '#ff9b6a';
    ctx.beginPath(); ctx.arc(wx(ya), wy(ea), 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
    // readout
    readout.innerHTML =
      `contrastive strength = <b>${c.toFixed(2)}</b><br>` +
      `E(true&nbsp;well) = <b>${Efn(YT, c).toFixed(2)}</b> &middot; E(spurious) = <b>${Efn(YS, c).toFixed(2)}</b><br>` +
      `argmin at y = <b>${ya.toFixed(2)}</b> ` +
      (correct ? `<span style="color:var(--accent)">✓ true answer</span>`
               : `<span style="color:#ff8c8c">✗ spurious answer</span>`);
  }

  cSlider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: COMPUTE DIAL — optimization steps vs accuracy (Sudoku)
 * Real numbers from the paper's Figure 6. Same trained model; the only knob
 * is T, the number of gradient steps per energy landscape.
 * ===================================================================== */
(function computeDial() {
  const host = document.getElementById('compute-dial');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="cdCanvas" width="440" height="260"></canvas>
      <div class="controls">
        <div>
          <label>optimization steps per landscape&nbsp; T</label>
          <input type="range" id="cdT" min="1" max="20" step="1" value="1"/>
        </div>
        <div class="bignum">
          <div class="cell"><div class="v" id="cdTest" style="color:#5fa9ff;">—</div><div class="k">standard test</div></div>
          <div class="cell"><div class="v" id="cdHard" style="color:var(--accent);">—</div><div class="k">harder split</div></div>
        </div>
        <div class="readout" id="cdReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#cdCanvas');
  const ctx = devicePx(cv, 440, 260);
  const W = 440, H = 260;
  const tSlider = host.querySelector('#cdT');
  const elTest = host.querySelector('#cdTest');
  const elHard = host.querySelector('#cdHard');
  const readout = host.querySelector('#cdReadout');

  // paper Figure 6 (Sudoku accuracy vs steps per landscape)
  const KN = [1, 5, 10, 15, 20];
  const TEST = [98.5, 99.2, 99.3, 99.4, 99.4];
  const HARD = [42.8, 57.0, 60.0, 61.2, 62.1];

  function interp(T, ys) {
    if (T <= KN[0]) return ys[0];
    if (T >= KN[KN.length - 1]) return ys[ys.length - 1];
    for (let i = 0; i < KN.length - 1; i++) {
      if (T >= KN[i] && T <= KN[i + 1]) {
        const f = (T - KN[i]) / (KN[i + 1] - KN[i]);
        return ys[i] + f * (ys[i + 1] - ys[i]);
      }
    }
    return ys[0];
  }

  // plot box
  const PL = 42, PR = 14, PT = 16, PB = 32;
  const AYLO = 35, AYHI = 102;
  const px = (T) => PL + (T - 1) / 19 * (W - PL - PR);
  const py = (acc) => (H - PB) - (acc - AYLO) / (AYHI - AYLO) * (H - PT - PB);

  function curve(ys, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < KN.length; i++) {
      const X = px(KN[i]), Y = py(ys[i]);
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (let i = 0; i < KN.length; i++) {
      ctx.beginPath(); ctx.arc(px(KN[i]), py(ys[i]), 3.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function draw() {
    const T = parseInt(tSlider.value, 10);
    ctx.clearRect(0, 0, W, H);
    // grid + y labels
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1;
    ctx.fillStyle = cssVar('--fg-mute'); ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    [40, 60, 80, 100].forEach(a => {
      const Y = py(a);
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(PL, Y); ctx.lineTo(W - PR, Y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(a + '%', PL - 6, Y + 3);
    });
    // x labels
    ctx.textAlign = 'center';
    KN.forEach(k => ctx.fillText(k, px(k), H - PB + 14));
    ctx.fillText('steps per landscape  T', (PL + W - PR) / 2, H - 4);
    // current-T marker
    const X = px(T);
    ctx.strokeStyle = cssVar('--accent'); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(X, PT); ctx.lineTo(X, H - PB); ctx.stroke();
    ctx.setLineDash([]);
    // curves
    curve(TEST, '#5fa9ff');
    curve(HARD, cssVar('--accent') || '#ff9b6a');
    // moving dots at current T
    const tv = interp(T, TEST), hv = interp(T, HARD);
    [[tv, '#5fa9ff'], [hv, cssVar('--accent') || '#ff9b6a']].forEach(([v, c]) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(X, py(v), 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.stroke();
    });
    // legend
    ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#5fa9ff'; ctx.fillText('● standard test', PL + 4, PT + 10);
    ctx.fillStyle = cssVar('--accent'); ctx.fillText('● harder split', PL + 110, PT + 10);

    elTest.textContent = tv.toFixed(1) + '%';
    elHard.textContent = hv.toFixed(1) + '%';
    readout.innerHTML = `T = <b>${T}</b> steps × K=10 landscapes ≈ <b>${T * 10}</b> gradient steps total.<br>` +
      `Easy puzzles are already solved; the harder split keeps climbing as you spend more.`;
  }

  tSlider.addEventListener('input', draw);
  draw();
})();
