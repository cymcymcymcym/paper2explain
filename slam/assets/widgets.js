/* SLAM blog interactive widgets. Plain JS / Canvas. No deps.
 * Conventions: one IIFE per widget; check host first; devicePx for crisp 2x;
 * cssVar so theming follows the user's choice.
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
    if (dark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('vb-theme', 'light'); }
    else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('vb-theme', 'dark'); }
    setLabel();
    document.dispatchEvent(new CustomEvent('themechange'));
  });
})();

/* ---------- helpers ---------- */
function devicePx(canvas, cssW, cssH) {
  canvas.width = cssW * 2; canvas.height = cssH * 2;
  const ctx = canvas.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); return ctx;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function pointerPos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  const cy = (e.touches ? e.touches[0].clientY : e.clientY);
  return { x: (cx - r.left) / r.width * (canvas.width / 2), y: (cy - r.top) / r.height * (canvas.height / 2) };
}
function randn() { const u = 1 - Math.random(), v = 1 - Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

const COL = { truth: '#8a8a96', est: '#ff9b6a', blue: '#5fa9ff', green: '#66bb6a', red: '#e8554e', mute: '#8a8a96' };

function drawFrame(ctx, x, y, th, color, len) {
  // a little heading triad: forward axis + perpendicular tick
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * Math.cos(th), y + len * Math.sin(th)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len * 0.6 * Math.cos(th + Math.PI / 2), y + len * 0.6 * Math.sin(th + Math.PI / 2)); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
}

/* =====================================================================
 * Widget 1: watch odometry drift
 * ===================================================================== */
(function driftWidget() {
  const host = document.getElementById('drift-widget');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="drCanvas"></canvas>
      <div class="controls">
        <label class="ctl-lbl">per-step sensor noise: <span id="drNoiseV">moderate</span></label>
        <input type="range" id="drNoise" min="0" max="100" step="1" value="40"/>
        <button class="btn full" id="drGo">↻ re-drive the loop</button>
        <div class="readout" id="drRead"></div>
        <p class="ctl-note">Grey is the true loop; orange is what the robot believes from its noisy motion
        alone. With no map to correct against, the estimate never closes the loop.</p>
      </div>
    </div>`);
  const cv = host.querySelector('#drCanvas'); const W = 440, H = 300; const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#drRead');
  const cx = 195, cy = 150, R = 100, N = 80;
  let noise = 0.4, truePts = [], estPts = [], anim = 0, raf = null;

  function build() {
    truePts = []; estPts = [];
    for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / N; truePts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); }
    const L = 2 * Math.PI * R / N, turn = 2 * Math.PI / N;
    let p = { x: truePts[0].x, y: truePts[0].y }, h = 0; estPts.push({ ...p });
    for (let i = 0; i < N; i++) {
      h += turn + randn() * noise * 0.05;
      const step = L * (1 + randn() * noise * 0.03);
      p = { x: p.x + step * Math.cos(h), y: p.y + step * Math.sin(h) }; estPts.push({ ...p });
    }
  }
  function poly(pts, n) { ctx.beginPath(); for (let i = 0; i < n; i++) { i ? ctx.lineTo(pts[i].x, pts[i].y) : ctx.moveTo(pts[i].x, pts[i].y); } ctx.stroke(); }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = COL.truth; ctx.lineWidth = 2; ctx.globalAlpha = 0.55; poly(truePts, truePts.length); ctx.globalAlpha = 1;
    const n = Math.max(2, Math.floor(anim * estPts.length));
    ctx.strokeStyle = COL.est; ctx.lineWidth = 2.5; poly(estPts, n);
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(estPts[0].x, estPts[0].y, 6, 0, 7); ctx.fill();
    const e = estPts[n - 1];
    ctx.strokeStyle = COL.est; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 6, 0, 7); ctx.stroke();
    if (n >= estPts.length) {
      ctx.strokeStyle = COL.red; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(estPts[0].x, estPts[0].y); ctx.stroke(); ctx.setLineDash([]);
      const gap = Math.hypot(e.x - estPts[0].x, e.y - estPts[0].y);
      read.innerHTML = `final drift gap = <b style="color:${COL.red}">${(gap / (2 * R) * 100).toFixed(0)}%</b> of the loop diameter<br><span style="color:${COL.mute}">pure odometry can't come home</span>`;
    }
  }
  function run() { if (raf) cancelAnimationFrame(raf); anim = 0; build(); const tick = () => { anim = Math.min(1, anim + 0.025); draw(); if (anim < 1) raf = requestAnimationFrame(tick); }; tick(); }
  host.querySelector('#drNoise').addEventListener('input', e => {
    noise = +e.target.value / 100; host.querySelector('#drNoiseV').textContent = noise < 0.25 ? 'low' : noise < 0.6 ? 'moderate' : 'high'; run();
  });
  host.querySelector('#drGo').onclick = run;
  run();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 2: close the loop, optimize the graph
 * ===================================================================== */
(function poseGraph() {
  const host = document.getElementById('posegraph-widget');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="pgCanvas"></canvas>
      <div class="controls">
        <button class="btn full" id="pgClose">⛓ close the loop &amp; optimize</button>
        <button class="btn full" id="pgReset">↻ reset to drifted</button>
        <div class="readout" id="pgRead"></div>
        <p class="ctl-note">Nodes are poses; edges are odometry constraints. The loop-closure edge (green)
        says "start and end are the same place." Gauss-Seidel sweeps distribute the drift around the loop.</p>
      </div>
    </div>`);
  const cv = host.querySelector('#pgCanvas'); const W = 440, H = 300; const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#pgRead');
  const cx = 200, cy = 150, R = 100, N = 48, lam = 6;
  let truePts = [], d = [], P = [], closure = false, iters = 0, raf = null;

  function build() {
    truePts = []; for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / N; truePts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); }
    // drifted odometry measurements (global step vectors)
    const L = 2 * Math.PI * R / N, turn = 2 * Math.PI / N; let p = { x: truePts[0].x, y: truePts[0].y }, h = 0; const est = [{ ...p }];
    for (let i = 0; i < N; i++) { h += turn + 0.028; const s = L; p = { x: p.x + s * Math.cos(h), y: p.y + s * Math.sin(h) }; est.push({ ...p }); }
    d = []; for (let i = 0; i < N; i++) d.push({ x: est[i + 1].x - est[i].x, y: est[i + 1].y - est[i].y });
    P = est.map(q => ({ ...q })); closure = false; iters = 0;
  }
  function sweep() {
    // p0 anchored. interior: average of neighbor predictions. pN: + closure pull to p0.
    for (let i = 1; i < N; i++) {
      P[i].x = ((P[i - 1].x + d[i - 1].x) + (P[i + 1].x - d[i].x)) / 2;
      P[i].y = ((P[i - 1].y + d[i - 1].y) + (P[i + 1].y - d[i].y)) / 2;
    }
    if (closure) {
      P[N].x = ((P[N - 1].x + d[N - 1].x) + lam * P[0].x) / (1 + lam);
      P[N].y = ((P[N - 1].y + d[N - 1].y) + lam * P[0].y) / (1 + lam);
    } else { P[N].x = P[N - 1].x + d[N - 1].x; P[N].y = P[N - 1].y + d[N - 1].y; }
    iters++;
  }
  function error() {
    let e = 0; for (let i = 0; i < N; i++) { const ex = (P[i + 1].x - P[i].x) - d[i].x, ey = (P[i + 1].y - P[i].y) - d[i].y; e += ex * ex + ey * ey; }
    if (closure) { const gx = P[N].x - P[0].x, gy = P[N].y - P[0].y; e += lam * (gx * gx + gy * gy); }
    return e;
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = COL.truth; ctx.globalAlpha = 0.4; ctx.lineWidth = 2;
    ctx.beginPath(); truePts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke(); ctx.globalAlpha = 1;
    if (closure) { ctx.strokeStyle = COL.green; ctx.lineWidth = 2.5; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(P[N].x, P[N].y); ctx.lineTo(P[0].x, P[0].y); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = COL.est; ctx.lineWidth = 2.5; ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
    for (let i = 0; i <= N; i += 4) { ctx.fillStyle = COL.est; ctx.beginPath(); ctx.arc(P[i].x, P[i].y, 2.6, 0, 7); ctx.fill(); }
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(P[0].x, P[0].y, 6, 0, 7); ctx.fill();
    // mark the open end-of-loop pose
    ctx.strokeStyle = COL.est; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P[N].x, P[N].y, 5.5, 0, 7); ctx.stroke();
    const gap = Math.hypot(P[N].x - P[0].x, P[N].y - P[0].y);
    read.innerHTML = `loop closure: <b>${closure ? 'ON' : 'off'}</b><br>optimizer sweeps: <b>${iters}</b><br>loop gap = <b style="color:${gap < 6 ? COL.green : COL.red}">${gap.toFixed(0)} px</b><br><span style="color:${COL.mute}">graph error = ${error().toFixed(0)}</span>`;
  }
  function animateSweeps(k) { if (raf) cancelAnimationFrame(raf); let c = 0; const tick = () => { sweep(); draw(); if (++c < k) raf = requestAnimationFrame(tick); }; tick(); }
  host.querySelector('#pgClose').onclick = () => { closure = true; animateSweeps(60); };
  host.querySelector('#pgReset').onclick = () => { if (raf) cancelAnimationFrame(raf); build(); draw(); };
  build(); draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 3: triangulate a landmark
 * ===================================================================== */
(function triangulate() {
  const host = document.getElementById('triangulation-widget');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="tgCanvas"></canvas>
      <div class="controls">
        <label class="ctl-lbl">camera baseline: <span id="tgBaseV"></span></label>
        <input type="range" id="tgBase" min="20" max="320" step="2" value="200"/>
        <label class="ctl-lbl">bearing noise: <span id="tgNoiseV"></span></label>
        <input type="range" id="tgNoise" min="0" max="100" step="1" value="35"/>
        <div class="picker" id="tgViews"></div>
        <button class="btn full" id="tgResample">↻ resample bearings</button>
        <div class="readout" id="tgRead"></div>
      </div>
    </div>`);
  const cv = host.querySelector('#tgCanvas'); const W = 440, H = 300; const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#tgRead');
  const L = { x: 220, y: 64 }; let baseline = 200, noise = 0.35, nv = 3, deltas = [];
  function resample() { deltas = []; for (let i = 0; i < 8; i++) deltas.push(randn()); }
  resample();
  function cams() { const arr = [], y = 256, c = 220; for (let i = 0; i < nv; i++) { const t = nv === 1 ? 0.5 : i / (nv - 1); arr.push({ x: c - baseline / 2 + t * baseline, y }); } return arr; }
  function solve(cs) {
    let a = 0, b = 0, cc = 0, bx = 0, by = 0;
    cs.forEach((c, k) => {
      const th = Math.atan2(L.y - c.y, L.x - c.x) + deltas[k] * noise * 0.08;
      const rx = Math.cos(th), ry = Math.sin(th);
      const m00 = 1 - rx * rx, m01 = -rx * ry, m11 = 1 - ry * ry;
      a += m00; b += m01; cc += m11; bx += m00 * c.x + m01 * c.y; by += m01 * c.x + m11 * c.y;
    });
    const det = a * cc - b * b || 1e-6; const ix = (cc * bx - b * by) / det, iy = (-b * bx + a * by) / det;
    return { x: ix, y: iy, A: { a, b, c: cc, det } };
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const cs = cams(); const s = solve(cs);
    // rays
    cs.forEach((c, k) => {
      const th = Math.atan2(L.y - c.y, L.x - c.x) + deltas[k] * noise * 0.08;
      ctx.strokeStyle = COL.blue; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + 320 * Math.cos(th), c.y + 320 * Math.sin(th)); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = COL.blue; ctx.fillRect(c.x - 6, c.y - 4, 12, 8);
    });
    // baseline bar
    ctx.strokeStyle = COL.mute; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(220 - baseline / 2, 270); ctx.lineTo(220 + baseline / 2, 270); ctx.stroke();
    // uncertainty ellipse from A^-1 (cov ~ sigma^2 A^-1)
    const inv = { a: s.A.c / s.A.det, b: -s.A.b / s.A.det, c: s.A.a / s.A.det };
    const tr = inv.a + inv.c, dt = inv.a * inv.c - inv.b * inv.b;
    const l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - dt)), l2 = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - dt));
    const ang = Math.atan2(l1 - inv.a, inv.b);
    const sc = 26 * (0.4 + noise);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
    ctx.strokeStyle = COL.est; ctx.lineWidth = 2; ctx.beginPath();
    ctx.ellipse(0, 0, Math.min(140, Math.sqrt(l1) * sc), Math.min(140, Math.sqrt(l2) * sc), 0, 0, 7); ctx.stroke(); ctx.restore();
    // true & estimate
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(L.x, L.y, 6, 0, 7); ctx.fill();
    ctx.fillStyle = COL.est; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill();
    ctx.fillStyle = COL.mute; ctx.font = '11px ' + cssVar('--sans'); ctx.textAlign = 'left';
    ctx.fillText('landmark', L.x + 10, L.y); ctx.fillText('cameras', 220 - baseline / 2, 288);
    const err = Math.hypot(s.x - L.x, s.y - L.y);
    read.innerHTML = `views = <b>${nv}</b> · baseline = <b>${baseline}px</b><br>estimate error = <b style="color:${err < 12 ? COL.green : COL.est}">${err.toFixed(1)}px</b><br><span style="color:${COL.mute}">wider baseline → rounder, smaller ellipse</span>`;
    host.querySelector('#tgBaseV').textContent = baseline < 90 ? 'narrow' : baseline < 230 ? 'medium' : 'wide';
    host.querySelector('#tgNoiseV').textContent = noise < 0.25 ? 'low' : noise < 0.6 ? 'medium' : 'high';
  }
  const vbox = host.querySelector('#tgViews');
  [2, 3, 4, 6].forEach(v => { const btn = document.createElement('button'); btn.className = 'btn' + (v === nv ? ' active' : ''); btn.textContent = v + ' views'; btn.onclick = () => { nv = v; vbox.querySelectorAll('button').forEach(x => x.classList.remove('active')); btn.classList.add('active'); draw(); }; vbox.appendChild(btn); });
  host.querySelector('#tgBase').addEventListener('input', e => { baseline = +e.target.value; draw(); });
  host.querySelector('#tgNoise').addEventListener('input', e => { noise = +e.target.value / 100; draw(); });
  host.querySelector('#tgResample').onclick = () => { resample(); draw(); };
  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 4: monocular scale ambiguity
 * ===================================================================== */
(function scaleWidget() {
  const host = document.getElementById('scale-widget');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="scCanvas"></canvas>
      <div class="controls">
        <label class="ctl-lbl">world scale s = <span id="scV">1.00</span></label>
        <input type="range" id="scS" min="0.45" max="2.1" step="0.01" value="1.0"/>
        <button class="btn full" id="scAnchor">add metric anchor (stereo / IMU)</button>
        <div class="readout" id="scRead"></div>
        <p class="ctl-note">Slide s: the world on the left grows and shrinks, but the image on the right
        never changes — one camera can't tell scale. A metric anchor pins it.</p>
      </div>
    </div>`);
  const cv = host.querySelector('#scCanvas'); const W = 440, H = 300; const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#scRead');
  let s = 1.0, anchor = false;
  const camX = 28, camY = 170, D = 150, h = 95, base = 46;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent');
    const ss = anchor ? 1.0 : s;
    // divider
    ctx.strokeStyle = mute; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(290, 20); ctx.lineTo(290, 280); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = mute; ctx.font = '600 11px ' + cssVar('--sans'); ctx.textAlign = 'left';
    ctx.fillText('world (top view)', 14, 22); ctx.fillText('camera image', 300, 22);
    // landmark position scales with ss
    const lx = camX + D * 0.62 * ss, ly = camY - h * 0.62 * ss;
    const c2x = camX + base * 0.62 * ss;
    // cameras
    drawFrame(ctx, camX, camY, -0.5, COL.blue, 16);
    drawFrame(ctx, c2x, camY, -0.5, COL.blue, 16);
    ctx.fillStyle = mute; ctx.font = '10px ' + cssVar('--mono'); ctx.fillText('cam 1', camX - 4, camY + 20); ctx.fillText('cam 2', c2x - 4, camY + 32);
    // rays
    ctx.strokeStyle = COL.blue; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(camX, camY); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c2x, camY); ctx.lineTo(lx, ly); ctx.stroke(); ctx.globalAlpha = 1;
    // landmark
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(lx, ly, 6, 0, 7); ctx.fill();
    // anchor ruler on baseline
    if (anchor) { ctx.strokeStyle = COL.est; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(camX, camY + 14); ctx.lineTo(c2x, camY + 14); ctx.stroke(); ctx.fillStyle = COL.est; ctx.font = '10px ' + cssVar('--mono'); ctx.fillText('known baseline', camX, camY + 48); }
    // image panel: projected pixel v = f*h/D  (independent of ss)
    const ix = 360, iy0 = 60, iy1 = 250; const v = (h / D); const py = iy0 + (1 - v) * (iy1 - iy0) * 0.7 + 30;
    ctx.strokeStyle = mute; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ix, iy0); ctx.lineTo(ix, iy1); ctx.stroke();
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(ix, py, 6, 0, 7); ctx.fill();
    ctx.fillStyle = mute; ctx.font = '10px ' + cssVar('--mono'); ctx.fillText('image plane', ix - 28, iy1 + 16);
    ctx.fillStyle = (anchor ? COL.green : COL.est); ctx.font = '11px ' + cssVar('--sans'); ctx.textAlign = 'center';
    ctx.fillText(anchor ? 'scale fixed ✓' : 'identical ∀ s', ix, 44);
    read.innerHTML = anchor
      ? `metric anchor <b style="color:${COL.green}">ON</b> · true scale recovered<br><span style="color:${mute}">stereo baseline / depth / IMU gives real units</span>`
      : `image coordinate u = f·h/D = <b>const</b><br><span style="color:${COL.est}">world is ambiguous up to scale s</span>`;
    host.querySelector('#scV').textContent = (anchor ? 1.0 : s).toFixed(2);
  }
  host.querySelector('#scS').addEventListener('input', e => { s = +e.target.value; if (anchor) return; draw(); });
  host.querySelector('#scAnchor').onclick = () => { anchor = !anchor; const b = host.querySelector('#scAnchor'); b.classList.toggle('active', anchor); b.textContent = anchor ? 'remove metric anchor' : 'add metric anchor (stereo / IMU)'; host.querySelector('#scS').disabled = anchor; draw(); };
  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 5: from SLAM pose to robot action (UMI)
 * ===================================================================== */
(function umiWidget() {
  const host = document.getElementById('umi-widget');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="umCanvas"></canvas>
      <div class="controls">
        <label class="ctl-lbl">scrub the trajectory: t = <span id="umTV">0.50</span></label>
        <input type="range" id="umT" min="0" max="1" step="0.005" value="0.5"/>
        <button class="btn full" id="umOff">hand-eye offset: ON</button>
        <div class="readout" id="umRead"></div>
        <p class="ctl-note">SLAM gives the camera frame (blue). The fixed, calibrated hand-eye transform
        offsets it to the gripper-tip frame (green) — the action a robot actually executes.</p>
      </div>
    </div>`);
  const cv = host.querySelector('#umCanvas'); const W = 440, H = 300; const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#umRead');
  let t = 0.5, useOff = true; const off = { x: 0, y: 34 };
  function cam(tt) { return { x: 50 + 340 * tt, y: 210 - 120 * Math.sin(Math.PI * tt) - 18 * Math.sin(5 * tt) }; }
  function theta(tt) { const a = cam(tt - 0.005), b = cam(tt + 0.005); return Math.atan2(b.y - a.y, b.x - a.x); }
  function grip(tt) { const c = cam(tt), th = theta(tt); if (!useOff) return { ...c }; return { x: c.x + off.x * Math.cos(th) - off.y * Math.sin(th), y: c.y + off.x * Math.sin(th) + off.y * Math.cos(th) }; }
  function gw(tt) { return 0.5 + 0.5 * Math.sin(2 * Math.PI * tt - 1); }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const mute = cssVar('--fg-mute');
    // full paths
    ctx.strokeStyle = COL.blue; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 100; i++) { const c = cam(i / 100); i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y); } ctx.stroke();
    ctx.strokeStyle = COL.green; ctx.beginPath();
    for (let i = 0; i <= 100; i++) { const g = grip(i / 100); i ? ctx.lineTo(g.x, g.y) : ctx.moveTo(g.x, g.y); } ctx.stroke(); ctx.globalAlpha = 1;
    const c = cam(t), th = theta(t), g = grip(t);
    // connector
    ctx.strokeStyle = mute; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(g.x, g.y); ctx.stroke(); ctx.setLineDash([]);
    drawFrame(ctx, c.x, c.y, th, COL.blue, 22);
    drawFrame(ctx, g.x, g.y, th, COL.green, 22);
    // gripper opening glyph at tip
    const w = gw(t) * 14 + 4;
    ctx.strokeStyle = COL.green; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(g.x - w, g.y + 8); ctx.lineTo(g.x - w, g.y + 18); ctx.moveTo(g.x + w, g.y + 8); ctx.lineTo(g.x + w, g.y + 18); ctx.stroke();
    ctx.fillStyle = COL.blue; ctx.font = '11px ' + cssVar('--sans'); ctx.textAlign = 'left'; ctx.fillText('camera (SLAM)', c.x + 10, c.y - 6);
    ctx.fillStyle = COL.green; ctx.fillText('gripper (action)', g.x + 10, g.y + 22);
    read.innerHTML = `camera pose: <b>(${c.x.toFixed(0)}, ${c.y.toFixed(0)}, ${(th * 180 / Math.PI).toFixed(0)}°)</b><br>gripper pose: <b style="color:${COL.green}">(${g.x.toFixed(0)}, ${g.y.toFixed(0)}, ${(th * 180 / Math.PI).toFixed(0)}°)</b><br>gripper width: <b>${(gw(t) * 100).toFixed(0)}%</b>`;
    host.querySelector('#umTV').textContent = t.toFixed(2);
  }
  host.querySelector('#umT').addEventListener('input', e => { t = +e.target.value; draw(); });
  host.querySelector('#umOff').onclick = () => { useOff = !useOff; const b = host.querySelector('#umOff'); b.classList.toggle('active', useOff); b.textContent = 'hand-eye offset: ' + (useOff ? 'ON' : 'OFF'); draw(); };
  host.querySelector('#umOff').classList.add('active');
  draw();
  document.addEventListener('themechange', draw);
})();
