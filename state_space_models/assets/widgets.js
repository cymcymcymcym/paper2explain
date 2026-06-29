/* State Space Models blog — interactive widgets. Plain JS / Canvas. No deps.
 *   1. eig-lab         eigenvalue plane + phase portrait + classification
 *   2. discretize      continuous vs discrete (forward Euler) at step size Δ
 *   3. recur-conv      a scalar SSM run as recurrence AND as convolution (identical)
 *   4. hippo-memory    Legendre projection: reconstruct the whole past from N coeffs
 *   5. selective-scan  fixed gate (LTI) vs input-dependent gate (selection)
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
// seeded RNG so the "random" inputs are stable across redraws/themes
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// pointer position in a canvas's logical coordinate system
function canvasXY(canvas, e, W, H) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  const cy = (e.touches ? e.touches[0].clientY : e.clientY);
  return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H];
}
// Legendre polynomial P_n(z) by the standard recurrence.
function legendre(n, z) {
  if (n === 0) return 1;
  if (n === 1) return z;
  let p0 = 1, p1 = z;
  for (let k = 1; k < n; k++) {
    const p2 = ((2 * k + 1) * z * p1 - k * p0) / (k + 1);
    p0 = p1; p1 = p2;
  }
  return p1;
}

/* =====================================================================
 * Widget 1: eig-lab — drag the eigenvalues of A, watch the dynamics
 * ===================================================================== */
(function eigLab() {
  const host = document.getElementById('eig-lab');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body stack">
      <div class="eig-panels">
        <canvas id="eigPlane"></canvas>
        <canvas id="eigPortrait"></canvas>
      </div>
      <div class="controls">
        <div class="readout" id="eigReadout"></div>
        <p class="hint">Drag the orange dot. Left: eigenvalues of $A$ in the complex plane. Right: the state trajectory it produces.</p>
      </div>
    </div>`);

  const W = 240, H = 240;
  const planeC = host.querySelector('#eigPlane');
  const portC = host.querySelector('#eigPortrait');
  const pctx = devicePx(planeC, W, H);
  const xctx = devicePx(portC, W, H);
  const readout = host.querySelector('#eigReadout');

  // eigenvalue pair sigma ± i*omega
  let sigma = -0.35, omega = 1.5;
  const reMin = -2.5, reMax = 1.5, imMin = -3, imMax = 3;
  const toPx = (re, im) => [(re - reMin) / (reMax - reMin) * W, H - (im - imMin) / (imMax - imMin) * H];
  const toRe = (px) => reMin + px / W * (reMax - reMin);
  const toIm = (py) => imMin + (H - py) / H * (imMax - imMin);

  let tAnim = 0;

  function drawPlane() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'), rule = cssVar('--rule');
    pctx.clearRect(0, 0, W, H);
    // stable / unstable half-plane shading
    const [zx] = toPx(0, 0);
    pctx.fillStyle = 'rgba(92,184,92,0.10)';
    pctx.fillRect(0, 0, zx, H);
    pctx.fillStyle = 'rgba(224,83,61,0.10)';
    pctx.fillRect(zx, 0, W - zx, H);
    // grid
    pctx.strokeStyle = rule; pctx.lineWidth = 1;
    for (let re = -2; re <= 1; re++) { const [x] = toPx(re, 0); pctx.beginPath(); pctx.moveTo(x, 0); pctx.lineTo(x, H); pctx.stroke(); }
    for (let im = -3; im <= 3; im++) { const [, y] = toPx(0, im); pctx.beginPath(); pctx.moveTo(0, y); pctx.lineTo(W, y); pctx.stroke(); }
    // axes
    pctx.strokeStyle = mute; pctx.lineWidth = 1.5;
    pctx.beginPath(); pctx.moveTo(zx, 0); pctx.lineTo(zx, H); pctx.stroke();
    const [, y0] = toPx(0, 0);
    pctx.beginPath(); pctx.moveTo(0, y0); pctx.lineTo(W, y0); pctx.stroke();
    // labels
    pctx.fillStyle = mute; pctx.font = '10px ui-monospace, monospace';
    pctx.fillText('stable', 6, 14);
    pctx.fillText('unstable', W - 50, 14);
    pctx.fillText('Re', W - 18, y0 - 5);
    pctx.fillText('Im', zx + 4, 12);
    // the eigenvalue pair
    for (const s of [1, -1]) {
      const [x, y] = toPx(sigma, s * omega);
      pctx.beginPath(); pctx.arc(x, y, 7, 0, 7); pctx.fillStyle = accent; pctx.fill();
      pctx.strokeStyle = fg; pctx.lineWidth = 1.5; pctx.stroke();
    }
  }

  function drawPortrait() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      data = '#5fa9ff', rule = cssVar('--rule');
    xctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, sc = 46; // state-space scale
    // grid + axes
    xctx.strokeStyle = rule; xctx.lineWidth = 1;
    for (let g = -2; g <= 2; g++) {
      xctx.beginPath(); xctx.moveTo(cx + g * sc, 0); xctx.lineTo(cx + g * sc, H); xctx.stroke();
      xctx.beginPath(); xctx.moveTo(0, cy + g * sc); xctx.lineTo(W, cy + g * sc); xctx.stroke();
    }
    xctx.strokeStyle = mute; xctx.lineWidth = 1.4;
    xctx.beginPath(); xctx.moveTo(cx, 0); xctx.lineTo(cx, H); xctx.stroke();
    xctx.beginPath(); xctx.moveTo(0, cy); xctx.lineTo(W, cy); xctx.stroke();
    xctx.fillStyle = mute; xctx.font = '10px ui-monospace, monospace';
    xctx.fillText('x₁', W - 16, cy - 5); xctx.fillText('x₂', cx + 5, 12);

    // trajectory x(t) = e^{sigma t}(cos wt, -sin wt) from x0=(1,0)
    const pt = (t) => {
      const e = Math.exp(sigma * t);
      return [e * Math.cos(omega * t), -e * Math.sin(omega * t)];
    };
    xctx.strokeStyle = accent; xctx.lineWidth = 2; xctx.beginPath();
    let started = false;
    for (let t = 0; t <= 14; t += 0.03) {
      const [a, b] = pt(t);
      const px = cx + a * sc, py = cy + b * sc;
      if (Math.abs(px - cx) > W || Math.abs(py - cy) > H) break;
      if (!started) { xctx.moveTo(px, py); started = true; } else xctx.lineTo(px, py);
    }
    xctx.stroke();
    // moving dot
    const [da, db] = pt(tAnim);
    const dpx = cx + da * sc, dpy = cy + db * sc;
    if (Math.abs(dpx - cx) < W && Math.abs(dpy - cy) < H) {
      xctx.beginPath(); xctx.arc(dpx, dpy, 5, 0, 7); xctx.fillStyle = data; xctx.fill();
      xctx.strokeStyle = fg; xctx.lineWidth = 1.4; xctx.stroke();
    }
    // start marker
    xctx.beginPath(); xctx.arc(cx + sc, cy, 3, 0, 7); xctx.fillStyle = fg; xctx.fill();
  }

  function classify() {
    const eps = 0.06;
    let kind, color;
    if (omega < eps) {
      if (sigma < -eps) { kind = 'stable node — pure decay'; color = 'ok'; }
      else if (sigma > eps) { kind = 'unstable node — blows up'; color = 'bad'; }
      else { kind = 'marginal'; color = ''; }
    } else {
      if (sigma < -eps) { kind = 'stable spiral — damped oscillation'; color = 'ok'; }
      else if (sigma > eps) { kind = 'unstable spiral — growing oscillation'; color = 'bad'; }
      else { kind = 'center — undamped oscillation'; color = ''; }
    }
    const om = omega.toFixed(2);
    readout.innerHTML =
      `&lambda; = <b>${sigma.toFixed(2)} &plusmn; ${om}i</b><br>` +
      `Re &lambda; = ${sigma.toFixed(2)} &nbsp; (decay rate)<br>` +
      `Im &lambda; = ${om} &nbsp; (frequency)<br>` +
      `<span class="${color}">${kind}</span>`;
  }

  function redrawStatic() { drawPlane(); classify(); }
  redrawStatic();

  // drag on the plane
  let dragging = false;
  function setFromEvent(e) {
    const [px, py] = canvasXY(planeC, e, W, H);
    sigma = Math.max(reMin + 0.05, Math.min(reMax - 0.05, toRe(px)));
    omega = Math.min(imMax - 0.05, Math.abs(toIm(py)));
    redrawStatic();
  }
  planeC.addEventListener('pointerdown', (e) => { dragging = true; setFromEvent(e); planeC.setPointerCapture(e.pointerId); });
  planeC.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
  planeC.addEventListener('pointerup', () => { dragging = false; });
  planeC.addEventListener('pointercancel', () => { dragging = false; });

  // animation loop for the moving dot
  (function loop() {
    tAnim += 0.04;
    const period = (omega > 0.06) ? (2 * Math.PI / omega) : 14;
    // loop the dot over a sensible window so it never flies off forever
    if (tAnim > Math.min(14, Math.max(period * 1.5, 4))) tAnim = 0;
    drawPortrait();
    requestAnimationFrame(loop);
  })();
})();

/* =====================================================================
 * Widget 2: discretize — continuous trajectory vs forward-Euler samples
 * ===================================================================== */
(function discretize() {
  const host = document.getElementById('discretize');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="discCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>step size &Delta; = <span id="discDval">0.15</span></label>
          <input type="range" id="discSlider" min="0.05" max="2.6" step="0.01" value="0.15"/>
        </div>
        <div class="readout" id="discReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 250;
  const cv = host.querySelector('#discCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#discSlider');
  const dval = host.querySelector('#discDval');
  const readout = host.querySelector('#discReadout');

  // damped oscillator: state (p, v), p'' = -k p - c v
  const k = 1.0, c = 0.28;
  // A = [[0,1],[-k,-c]]; eigenvalues -c/2 ± i sqrt(k - c^2/4)
  const re = -c / 2, im = Math.sqrt(k - c * c / 4);
  const T = 22;
  const padL = 34, padR = 12, padT = 14, padB = 24;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const tx = (t) => x0 + t / T * (x1 - x0);
  const py = (p) => (y0 + y1) / 2 - p * ((y1 - y0) / 2) * 0.82;

  function continuousP(t) {
    // p(t) for p0=1, v0=0:  e^{re t}(cos(im t) - (re/im) sin(im t))
    return Math.exp(re * t) * (Math.cos(im * t) - (re / im) * Math.sin(im * t));
  }

  function draw() {
    const D = parseFloat(slider.value);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      data = '#5fa9ff', rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);
    // axes
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, py(0)); ctx.lineTo(x1, py(0)); ctx.stroke();
    ctx.strokeStyle = mute; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('position', x0 + 4, y0 + 10);
    ctx.fillText('time →', x1 - 44, py(0) + 14);

    // continuous trajectory
    ctx.strokeStyle = data; ctx.lineWidth = 2; ctx.beginPath();
    for (let t = 0; t <= T; t += 0.04) {
      const X = tx(t), Y = py(continuousP(t));
      if (t === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    // forward-Euler discrete samples: x_{n+1} = (I + D A) x_n
    // p_{n+1} = p + D v ; v_{n+1} = v + D(-k p - c v)
    let p = 1, v = 0, blew = false;
    ctx.strokeStyle = accent; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(tx(0), py(1));
    const pts = [[0, 1]];
    for (let t = D; t <= T + 1e-9; t += D) {
      const np = p + D * v, nv = v + D * (-k * p - c * v);
      p = np; v = nv;
      pts.push([t, p]);
      if (Math.abs(p) > 6) { blew = true; break; }
    }
    for (let i = 1; i < pts.length; i++) {
      const [t, pp] = pts[i];
      ctx.lineTo(tx(t), py(Math.max(-2.4, Math.min(2.4, pp))));
    }
    ctx.stroke();
    ctx.fillStyle = accent;
    for (const [t, pp] of pts) {
      ctx.beginPath(); ctx.arc(tx(t), py(Math.max(-2.4, Math.min(2.4, pp))), 2.6, 0, 7); ctx.fill();
    }

    // legend
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = data; ctx.fillText('— continuous  ẋ = Ax', x0 + 8, y1 - 24);
    ctx.fillStyle = accent; ctx.fillText('• discrete (Euler, Δ)', x0 + 8, y1 - 10);

    // amplification factor |1 + D·λ| (controls stability of the discretization)
    const ampRe = 1 + D * re, ampIm = D * im;
    const amp = Math.hypot(ampRe, ampIm);
    dval.textContent = D.toFixed(2);
    readout.innerHTML =
      `discrete map &nbsp;x<sub>k+1</sub> = (I + &Delta;A)x<sub>k</sub><br>` +
      `growth factor |1+&Delta;&lambda;| = <b>${amp.toFixed(3)}</b><br>` +
      (amp <= 1.0001
        ? `<span class="ok">stable — samples track the curve</span>`
        : `<span class="bad">|·| &gt; 1 → the discretization diverges</span>`);
  }
  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: recur-conv — same scalar SSM, two ways, identical output
 * ===================================================================== */
(function recurConv() {
  const host = document.getElementById('recur-conv');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rcCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>state decay $\\bar A$ = <span id="rcAval">0.75</span></label>
          <input type="range" id="rcSlider" min="-0.95" max="0.95" step="0.01" value="0.75"/>
        </div>
        <div class="ctl">
          <label>input u</label>
          <div class="toggle-row" id="rcInputs">
            <button class="btn active" data-in="impulses">impulses</button>
            <button class="btn" data-in="step">step</button>
            <button class="btn" data-in="noise">noise</button>
          </div>
        </div>
        <div class="readout" id="rcReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 320;
  const cv = host.querySelector('#rcCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#rcSlider');
  const aval = host.querySelector('#rcAval');
  const readout = host.querySelector('#rcReadout');
  const L = 26;
  let inputMode = 'impulses';

  function makeInput() {
    const u = new Array(L).fill(0);
    if (inputMode === 'impulses') { u[2] = 1; u[9] = 0.85; u[16] = -0.7; }
    else if (inputMode === 'step') { for (let i = 6; i < L; i++) u[i] = 0.7; }
    else { const r = mulberry32(42); for (let i = 0; i < L; i++) u[i] = (r() * 2 - 1) * 0.8; }
    return u;
  }

  function draw() {
    const a = parseFloat(slider.value);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      data = '#5fa9ff', rule = cssVar('--rule'), green = '#5cb85c';
    aval.textContent = a.toFixed(2);
    const u = makeInput();

    // kernel K_j = a^j  (c=b=1)
    const K = new Array(L);
    for (let j = 0; j < L; j++) K[j] = Math.pow(a, j);
    // recurrence
    const yRec = new Array(L); let x = 0;
    for (let kk = 0; kk < L; kk++) { x = a * x + u[kk]; yRec[kk] = x; }
    // convolution y_k = sum_j K_j u_{k-j}
    const yConv = new Array(L).fill(0);
    for (let kk = 0; kk < L; kk++) { let s = 0; for (let j = 0; j <= kk; j++) s += K[j] * u[kk - j]; yConv[kk] = s; }
    let maxErr = 0; for (let kk = 0; kk < L; kk++) maxErr = Math.max(maxErr, Math.abs(yRec[kk] - yConv[kk]));

    ctx.clearRect(0, 0, W, H);
    const padL = 30, padR = 12;
    const colW = (W - padL - padR) / L;
    const cX = (i) => padL + (i + 0.5) * colW;

    // --- top: kernel bars ---
    const kTop = 18, kBot = 120, kAxis = kBot - 0;
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('kernel  K = (CB̄, CĀB̄, CĀ²B̄, …) = (a⁰, a¹, a²,…)', padL, kTop - 4);
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(padL, kAxis); ctx.lineTo(W - padR, kAxis); ctx.stroke();
    const kScale = 46;
    for (let j = 0; j < L; j++) {
      const h = K[j] * kScale;
      ctx.fillStyle = accent;
      const bw = Math.max(2, colW - 3);
      ctx.fillRect(cX(j) - bw / 2, kAxis - Math.max(0, h), bw, Math.abs(h));
      if (h < 0) ctx.fillRect(cX(j) - bw / 2, kAxis, bw, -h);
    }

    // --- bottom: input + outputs ---
    const oTop = 150, oBot = H - 22, oMid = (oTop + oBot) / 2;
    // autoscale outputs
    let m = 0.6; for (let kk = 0; kk < L; kk++) m = Math.max(m, Math.abs(yRec[kk]), Math.abs(u[kk]));
    const oScale = (oBot - oTop) / 2 / m * 0.9;
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(padL, oMid); ctx.lineTo(W - padR, oMid); ctx.stroke();
    ctx.fillStyle = mute; ctx.fillText('input u (gray)   vs   output y', padL, oTop - 6);

    // input stems
    ctx.strokeStyle = mute; ctx.lineWidth = 1.5;
    for (let i = 0; i < L; i++) {
      if (Math.abs(u[i]) < 1e-9) continue;
      ctx.beginPath(); ctx.moveTo(cX(i), oMid); ctx.lineTo(cX(i), oMid - u[i] * oScale); ctx.stroke();
      ctx.fillStyle = mute; ctx.beginPath(); ctx.arc(cX(i), oMid - u[i] * oScale, 2.4, 0, 7); ctx.fill();
    }
    // recurrence line
    ctx.strokeStyle = data; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i < L; i++) { const X = cX(i), Y = oMid - yRec[i] * oScale; i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
    ctx.stroke();
    // convolution dots (should land on the line)
    ctx.fillStyle = green;
    for (let i = 0; i < L; i++) { ctx.beginPath(); ctx.arc(cX(i), oMid - yConv[i] * oScale, 3.1, 0, 7); ctx.fill(); }

    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = data; ctx.fillText('— recurrence', padL + 8, oBot + 16);
    ctx.fillStyle = green; ctx.fillText('• convolution', padL + 110, oBot + 16);

    readout.innerHTML =
      `kernel K<sub>j</sub> = <b>${a.toFixed(2)}<sup>j</sup></b><br>` +
      `max |y<sub>rec</sub> − y<sub>conv</sub>| = <b>${maxErr.toExponential(1)}</b><br>` +
      `<span class="ok">the two faces agree ✓</span>` +
      (a < 0 ? `<br><span class="hint">a&lt;0 → the kernel oscillates</span>` : '');
  }

  host.querySelectorAll('#rcInputs .btn').forEach((b) => {
    b.addEventListener('click', () => {
      host.querySelectorAll('#rcInputs .btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); inputMode = b.dataset.in; draw();
    });
  });
  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: hippo-memory — reconstruct the whole history from N coeffs
 * ===================================================================== */
(function hippoMemory() {
  const host = document.getElementById('hippo-memory');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="hpCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>state size N = <span id="hpNval">8</span> coefficients</label>
          <input type="range" id="hpSlider" min="2" max="20" step="1" value="8"/>
        </div>
        <div class="toggle-row">
          <button class="btn" id="hpPlay">❚❚ pause</button>
        </div>
        <div class="readout" id="hpReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 300;
  const cv = host.querySelector('#hpCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#hpSlider');
  const nval = host.querySelector('#hpNval');
  const playBtn = host.querySelector('#hpPlay');
  const readout = host.querySelector('#hpReadout');

  const signal = (x) =>
    0.55 * Math.sin(2 * Math.PI * 2.0 * x) +
    0.30 * Math.sin(2 * Math.PI * 5.0 * x + 1.0) +
    0.16 * Math.sin(2 * Math.PI * 9.0 * x + 2.1);

  let t = 0.06, playing = true, N = 8;

  // Legendre coefficients of the history on [0, t]
  function coeffs(tt, n) {
    const M = 200, dx = tt / M;
    const c = new Array(n).fill(0);
    for (let i = 0; i < M; i++) {
      const x = (i + 0.5) * dx;
      const f = signal(x);
      const z = 2 * x / tt - 1;
      for (let k = 0; k < n; k++) c[k] += f * legendre(k, z) * dx;
    }
    for (let k = 0; k < n; k++) c[k] *= (2 * k + 1) / tt;
    return c;
  }

  const padL = 30, padR = 12, padT = 16, padB = 56;
  const x0 = padL, x1 = W - padR, yA = padT, yB = H - padB;
  const tx = (x) => x0 + x * (x1 - x0);
  const py = (v) => (yA + yB) / 2 - v * ((yB - yA) / 2) * 0.7;

  function draw() {
    N = parseInt(slider.value, 10); nval.textContent = N;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      data = '#5fa9ff', rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);

    const c = coeffs(t, N);
    const recon = (x) => { const z = 2 * x / t - 1; let s = 0; for (let k = 0; k < N; k++) s += c[k] * legendre(k, z); return s; };

    // baseline + axes
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(x0, py(0)); ctx.lineTo(x1, py(0)); ctx.stroke();

    // future (faint) + past (solid) true signal
    ctx.lineWidth = 2;
    ctx.strokeStyle = mute; ctx.globalAlpha = 0.35; ctx.beginPath();
    for (let x = 0; x <= 1.0001; x += 0.004) { const X = tx(x), Y = py(signal(x)); x === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
    ctx.stroke(); ctx.globalAlpha = 1;
    ctx.strokeStyle = fg; ctx.beginPath();
    for (let x = 0; x <= t + 1e-9; x += 0.004) { const X = tx(x), Y = py(signal(x)); x === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
    ctx.stroke();

    // reconstruction from the N coefficients
    ctx.strokeStyle = accent; ctx.lineWidth = 2.2; ctx.beginPath();
    let err = 0, ec = 0;
    for (let x = 0; x <= t + 1e-9; x += 0.004) {
      const r = recon(x); const X = tx(x), Y = py(r);
      x === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      err += (r - signal(x)) ** 2; ec++;
    }
    ctx.stroke();
    err = Math.sqrt(err / Math.max(1, ec));

    // "now" line
    ctx.strokeStyle = data; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(tx(t), yA); ctx.lineTo(tx(t), yB); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = data; ctx.font = '10px ui-monospace, monospace'; ctx.fillText('now (t)', tx(t) - 18, yA + 24);

    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('history', x0 + 4, yB - 4);
    ctx.fillStyle = fg; ctx.fillText('— true signal', x0 + 4, yA + 10);
    ctx.fillStyle = accent; ctx.fillText('— reconstructed from N coeffs', x0 + 110, yA + 10);

    // coefficient bars (the state) along the bottom
    const bTop = yB + 12, bBot = H - 6, bMid = (bTop + bBot) / 2;
    const bw = (x1 - x0) / 20;
    let mc = 0.2; for (let k = 0; k < N; k++) mc = Math.max(mc, Math.abs(c[k]));
    ctx.fillStyle = mute; ctx.fillText('state c (Legendre coefficients):', x0, bTop - 1);
    for (let k = 0; k < N; k++) {
      const h = c[k] / mc * ((bBot - bMid) * 0.9);
      ctx.fillStyle = accent;
      ctx.fillRect(x0 + k * bw + 1, bMid - Math.max(0, h), bw - 2, Math.abs(h));
    }
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(x0, bMid); ctx.lineTo(x0 + N * bw, bMid); ctx.stroke();

    readout.innerHTML =
      `N = <b>${N}</b> numbers summarize the whole past<br>` +
      `t = ${t.toFixed(2)} &nbsp; reconstruction error = <b>${err.toFixed(3)}</b><br>` +
      `<span class="hint">${N <= 5 ? 'low N: oldest detail blurs first' : 'higher N: sharper memory'}</span>`;
  }

  slider.addEventListener('input', draw);
  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '❚❚ pause' : '► play';
  });

  (function loop() {
    if (playing) { t += 0.0035; if (t > 1.0) t = 0.06; }
    draw();
    requestAnimationFrame(loop);
  })();
})();

/* =====================================================================
 * Widget 5: selective-scan — fixed gate (LTI) vs input-dependent gate
 * ===================================================================== */
(function selectiveScan() {
  const host = document.getElementById('selective-scan');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="ssCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>gate</label>
          <div class="toggle-row" id="ssMode">
            <button class="btn" data-m="lti">fixed (LTI)</button>
            <button class="btn active" data-m="sel">selective</button>
          </div>
        </div>
        <div class="toggle-row">
          <button class="btn" id="ssReplay">► replay scan</button>
        </div>
        <div class="readout" id="ssReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 320;
  const cv = host.querySelector('#ssCanvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#ssReadout');
  let mode = 'sel';

  // sequence: filler (gray, ~0) with a few marked tokens carrying values
  const L = 22;
  const marks = { 3: 0.8, 8: -0.55, 14: 0.6, 19: -0.35 };
  const rng = mulberry32(7);
  const u = [], isMark = [];
  for (let i = 0; i < L; i++) {
    if (marks[i] !== undefined) { u.push(marks[i]); isMark.push(true); }
    else { u.push((rng() * 2 - 1) * 0.08); isMark.push(false); }
  }

  let scan = 0; // animated scan position (float)

  const padL = 28, padR = 12;
  const colW = (W - padL - padR) / L;
  const cX = (i) => padL + (i + 0.5) * colW;
  const inTop = 26, inMid = 92, inBot = 150;      // input stream band
  const stTop = 192, stBot = 302, stMid = (stTop + stBot) / 2; // state trace band

  function gateAt(i) {
    if (mode === 'lti') return 0.28;            // same every step
    return isMark[i] ? 0.95 : 0.04;             // write marks, ignore filler
  }

  // precompute full state trajectory h_k = (1-g)h_{k-1} + g u_k
  function stateTraj() {
    const h = []; let hv = 0;
    for (let i = 0; i < L; i++) { const g = gateAt(i); hv = (1 - g) * hv + g * u[i]; h.push(hv); }
    return h;
  }

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      data = '#5fa9ff', rule = cssVar('--rule'), green = '#5cb85c';
    ctx.clearRect(0, 0, W, H);
    const h = stateTraj();
    const upto = Math.min(L - 1, Math.floor(scan));

    // --- input stream ---
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('input stream  (colored = "remember me",  gray = filler)', padL, inTop - 8);
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(padL, inMid); ctx.lineTo(W - padR, inMid); ctx.stroke();
    for (let i = 0; i < L; i++) {
      const bw = Math.max(3, colW - 4);
      const hgt = u[i] * 50;
      ctx.fillStyle = isMark[i] ? (u[i] >= 0 ? accent : data) : mute;
      ctx.globalAlpha = isMark[i] ? 1 : 0.6;
      ctx.fillRect(cX(i) - bw / 2, inMid - Math.max(0, hgt), bw, Math.abs(hgt));
      ctx.globalAlpha = 1;
      // gate marker
      const g = gateAt(i);
      ctx.fillStyle = (i <= upto) ? green : rule;
      ctx.fillRect(cX(i) - bw / 2, inBot - g * 22, bw, g * 22);
    }
    ctx.fillStyle = mute; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('gate g', padL, inBot + 10);

    // scan cursor
    const sx = cX(Math.min(L - 1, scan));
    ctx.strokeStyle = green; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(sx, inTop - 2); ctx.lineTo(sx, stBot); ctx.stroke(); ctx.setLineDash([]);

    // --- state trace ---
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('hidden state  hₖ = (1−g)hₖ₋₁ + g·uₖ', padL, stTop - 8);
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(padL, stMid); ctx.lineTo(W - padR, stMid); ctx.stroke();
    const sc = 55;
    // faint full trace
    ctx.strokeStyle = mute; ctx.globalAlpha = 0.25; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < L; i++) { const X = cX(i), Y = stMid - h[i] * sc; i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
    ctx.stroke(); ctx.globalAlpha = 1;
    // revealed trace up to scan
    ctx.strokeStyle = accent; ctx.lineWidth = 2.4; ctx.beginPath();
    for (let i = 0; i <= upto; i++) { const X = cX(i), Y = stMid - h[i] * sc; i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
    ctx.stroke();
    ctx.fillStyle = accent;
    for (let i = 0; i <= upto; i++) { ctx.beginPath(); ctx.arc(cX(i), stMid - h[i] * sc, 2.6, 0, 7); ctx.fill(); }
    // ghost the target mark values as faint ticks
    for (let i = 0; i < L; i++) {
      if (!isMark[i]) continue;
      ctx.strokeStyle = (u[i] >= 0 ? accent : data); ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cX(i) - 6, stMid - u[i] * sc); ctx.lineTo(cX(i) + 6, stMid - u[i] * sc); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // verdict
    if (mode === 'sel') {
      readout.innerHTML =
        `<b>selective</b>: g≈1 on marks, g≈0 on filler<br>` +
        `the state <span class="ok">locks onto each marked value</span> and holds it through the noise — content-based memory.`;
    } else {
      const last = h[L - 1];
      readout.innerHTML =
        `<b>fixed (LTI)</b>: same g every step<br>` +
        `the state <span class="bad">drifts to a blurred average</span> (h≈${last.toFixed(2)}); it can't tell a mark from filler.`;
    }
  }

  host.querySelectorAll('#ssMode .btn').forEach((b) => {
    b.addEventListener('click', () => {
      host.querySelectorAll('#ssMode .btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); mode = b.dataset.m; scan = 0;
    });
  });
  host.querySelector('#ssReplay').addEventListener('click', () => { scan = 0; });

  (function loop() {
    if (scan < L - 0.001) scan = Math.min(L - 0.001, scan + 0.10);
    draw();
    requestAnimationFrame(loop);
  })();
})();
