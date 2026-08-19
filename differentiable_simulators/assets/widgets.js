/* diffhand_codesign blog interactive widgets. Plain JS / Canvas. No deps. */

/* ---------- theme toggle ---------- */
(function () {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const saved = localStorage.getItem('vb-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
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
    window.dispatchEvent(new Event('dh-theme'));
  });
})();

/* ---------- helpers ---------- */
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
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// Deterministic pseudo-random in [-1,1], so scrubbing a slider is stable.
function hashNoise(i, j) {
  let x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

/* Mean value coordinates for a point p inside a 2-D polygon cage.
 * Returns one weight per cage vertex; the weights sum to 1.
 * This is exactly the construction the paper uses (Ju/Schaefer/Warren),
 * including the special case for a point lying on a cage edge — which is
 * the property that makes the connectivity constraint automatic. */
function mvcWeights(p, cage) {
  const n = cage.length;
  const w = new Array(n).fill(0);
  const d = new Array(n), u = new Array(n);
  for (let i = 0; i < n; i++) {
    const dx = cage[i][0] - p[0], dy = cage[i][1] - p[1];
    const r = Math.hypot(dx, dy);
    if (r < 1e-7) { w[i] = 1; return w; }
    d[i] = r; u[i] = [dx / r, dy / r];
  }
  const t = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = u[i][0] * u[j][1] - u[i][1] * u[j][0];
    const dot = u[i][0] * u[j][0] + u[i][1] * u[j][1];
    const alpha = Math.atan2(cross, dot);
    if (Math.abs(Math.abs(alpha) - Math.PI) < 1e-5) {
      // p lies on edge (i, i+1): only those two handles get weight.
      const tot = d[i] + d[j];
      w.fill(0); w[i] = d[j] / tot; w[j] = d[i] / tot;
      return w;
    }
    t[i] = Math.tan(alpha / 2);
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const im = (i - 1 + n) % n;
    w[i] = (t[im] + t[i]) / d[i];
    sum += w[i];
  }
  for (let i = 0; i < n; i++) w[i] /= sum;
  return w;
}

function applyWeights(w, cage) {
  let x = 0, y = 0;
  for (let i = 0; i < w.length; i++) { x += w[i] * cage[i][0]; y += w[i] * cage[i][1]; }
  return [x, y];
}

function drawPoly(ctx, pts, stroke, fill, lw, dash) {
  ctx.save();
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  ctx.restore();
}

function pointerPos(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  const t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
  return [(t.clientX - r.left) * (canvas.width / 2) / r.width,
          (t.clientY - r.top) * (canvas.height / 2) / r.height];
}


/* =================================================================
 * WIDGET 1 — cage-lab: drag cage handles, the mesh follows via MVC
 * ================================================================= */
(function cageLab() {
  const host = document.getElementById('cage-lab');
  if (!host) return;

  const W = 520, H = 330;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div><canvas id="cage-lab-cv"></canvas></div>
      <div class="controls">
        <div class="toggle-row">
          <button class="btn active" data-h="8">8 handles</button>
          <button class="btn" data-h="4">4 handles</button>
          <button class="btn" data-h="12">12 handles</button>
        </div>
        <div class="toggle-row">
          <button class="btn" id="cage-lab-hook">grow a hook</button>
          <button class="btn" id="cage-lab-reset">reset</button>
        </div>
        <label class="chk"><input type="checkbox" id="cage-lab-dots" checked/> show mesh vertices</label>
        <div class="readout" id="cage-lab-read"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#cage-lab-cv');
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#cage-lab-read');
  const dotsChk = host.querySelector('#cage-lab-dots');

  // --- rest-shape fingertip mesh (outline + interior samples) -------------
  const outline = [];
  const NOUT = 96;
  for (let k = 0; k < NOUT; k++) {
    const s = k / NOUT * Math.PI * 2;
    // capsule-ish fingertip: long in x, rounded at the right end
    const a = 105, b = 44;
    let x = 260 + a * Math.cos(s);
    let y = 165 + b * Math.sin(s);
    x += 18 * Math.pow(Math.max(0, Math.cos(s)), 2);   // slightly fuller tip
    outline.push([x, y]);
  }
  const interior = [];
  for (let ix = 0; ix < 15; ix++) {
    for (let iy = 0; iy < 7; iy++) {
      const x = 165 + ix * 13.6, y = 130 + iy * 11.7;
      const e = Math.pow((x - 260) / 100, 2) + Math.pow((y - 165) / 40, 2);
      if (e < 0.92) interior.push([x, y]);
    }
  }

  function makeCage(n) {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const s = -k / n * Math.PI * 2 + Math.PI;   // clockwise in screen coords
      pts.push([260 + 138 * Math.cos(s), 165 + 74 * Math.sin(s)]);
    }
    return pts;
  }

  let nH = 8;
  let rest = makeCage(nH);
  let cage = rest.map(p => p.slice());
  let wOut = [], wIn = [];

  function rebuild(n) {
    nH = n;
    rest = makeCage(nH);
    cage = rest.map(p => p.slice());
    wOut = outline.map(p => mvcWeights(p, rest));
    wIn = interior.map(p => mvcWeights(p, rest));
    draw();
  }

  let drag = -1;
  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'),
          acc = cssVar('--accent'), card = cssVar('--bg-card');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = card; ctx.fillRect(0, 0, W, H);

    // rest shape, faint
    drawPoly(ctx, outline, mute + '55', null, 1.2, [3, 4]);

    // deformed mesh
    const defOut = wOut.map(w => applyWeights(w, cage));
    drawPoly(ctx, defOut, acc, acc + '33', 2.2);
    if (dotsChk.checked) {
      ctx.fillStyle = acc + 'cc';
      for (const w of wIn) {
        const p = applyWeights(w, cage);
        ctx.beginPath(); ctx.arc(p[0], p[1], 1.7, 0, 7); ctx.fill();
      }
      ctx.fillStyle = acc;
      for (const p of defOut) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.5, 0, 7); ctx.fill(); }
    }

    // cage
    drawPoly(ctx, cage, '#5fa9ff', null, 1.8, [6, 5]);
    for (let i = 0; i < cage.length; i++) {
      ctx.beginPath(); ctx.arc(cage[i][0], cage[i][1], i === drag ? 8 : 6.5, 0, 7);
      ctx.fillStyle = i === drag ? '#9cc9ff' : '#5fa9ff'; ctx.fill();
      ctx.strokeStyle = card; ctx.lineWidth = 2; ctx.stroke();
    }

    ctx.fillStyle = mute; ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('dashed grey = rest shape', 12, H - 14);

    let moved = 0;
    for (let i = 0; i < cage.length; i++)
      if (Math.hypot(cage[i][0] - rest[i][0], cage[i][1] - rest[i][1]) > 0.5) moved++;
    read.innerHTML =
      `cage handles |H| = <b>${nH}</b><br>` +
      `mesh vertices |V| = <b>${outline.length + interior.length}</b><br>` +
      `stored weights |V|·|H| = <b>${(outline.length + interior.length) * nH}</b><br>` +
      `handles you moved = <b>${moved}</b>`;
  }

  function nearest(p) {
    let best = -1, bd = 15;
    for (let i = 0; i < cage.length; i++) {
      const d = Math.hypot(cage[i][0] - p[0], cage[i][1] - p[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  const down = ev => { drag = nearest(pointerPos(cv, ev)); if (drag >= 0) { ev.preventDefault(); draw(); } };
  const move = ev => {
    if (drag < 0) return;
    ev.preventDefault();
    const p = pointerPos(cv, ev);
    cage[drag] = [clamp(p[0], 10, W - 10), clamp(p[1], 10, H - 10)];
    draw();
  };
  const up = () => { drag = -1; draw(); };
  cv.addEventListener('mousedown', down); window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  cv.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);

  host.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', () => {
    host.querySelectorAll('[data-h]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    rebuild(+b.dataset.h);
  }));
  host.querySelector('#cage-lab-reset').addEventListener('click', () => {
    cage = rest.map(p => p.slice()); draw();
  });
  host.querySelector('#cage-lab-hook').addEventListener('click', () => {
    // pull the handles nearest the tip downward and back: a hook
    cage = rest.map(p => p.slice());
    const targets = cage.map((p, i) => {
      const tipness = clamp((p[0] - 290) / 110, 0, 1);
      const lower = p[1] > 165 ? 1 : 0.15;
      return [p[0] - 26 * tipness * lower, p[1] + 62 * tipness * lower];
    });
    const t0 = performance.now();
    (function step(now) {
      const a = clamp((now - t0) / 700, 0, 1);
      const e = a * a * (3 - 2 * a);
      for (let i = 0; i < cage.length; i++) {
        cage[i][0] = rest[i][0] + e * (targets[i][0] - rest[i][0]);
        cage[i][1] = rest[i][1] + e * (targets[i][1] - rest[i][1]);
      }
      draw();
      if (a < 1) requestAnimationFrame(step);
    })(t0);
  });
  dotsChk.addEventListener('change', draw);
  window.addEventListener('dh-theme', draw);
  rebuild(8);
})();


/* =================================================================
 * WIDGET 2 — connect-lab: merged connection handles vs independent
 * ================================================================= */
(function connectLab() {
  const host = document.getElementById('connect-lab');
  if (!host) return;

  const W = 520, H = 300;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div><canvas id="connect-lab-cv"></canvas></div>
      <div class="controls">
        <div class="toggle-row">
          <button class="btn active" data-m="merged">merge connection handles</button>
          <button class="btn" data-m="free">independent cages</button>
        </div>
        <button class="btn" id="connect-lab-reset">reset</button>
        <div class="readout" id="connect-lab-read"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#connect-lab-cv');
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#connect-lab-read');
  let merged = true;

  // Cages. Shared face is the vertical segment x = 250, y in [70,225].
  const JOINT0 = [[95, 70], [250, 70], [250, 225], [95, 225]];      // green, axis-only
  const PHAL0  = [[250, 70], [455, 55], [455, 240], [250, 225]];    // yellow, free
  let J = JOINT0.map(p => p.slice());
  let P = PHAL0.map(p => p.slice());
  // shared: J[1] <-> P[0]  and  J[2] <-> P[3]
  const LINKS = [[1, 0], [2, 3]];

  // Meshes. The connection face points sit EXACTLY on the shared cage edge,
  // so mean value coordinates give them weight only on the two shared handles.
  const jm = [], pm = [];
  for (let k = 0; k <= 40; k++) {
    const s = k / 40;
    // joint body: rounded left cap, flat right face on x = 250
    const ang = Math.PI * 0.5 + s * Math.PI;
    jm.push([170 + 62 * Math.cos(ang), 147 + 62 * Math.sin(ang)]);
  }
  jm.push([250, 96]); jm.push([250, 199]);
  const jmOrdered = [[250, 96]].concat(jm.slice(0, 41)).concat([[250, 199]]);
  for (let k = 0; k <= 30; k++) {
    const s = k / 30;
    pm.push([270 + s * 165, 105 - 12 * s - 10 * Math.sin(s * Math.PI)]);
  }
  for (let k = 0; k <= 30; k++) {
    const s = k / 30;
    pm.push([435 - s * 165, 190 + 12 * (1 - s) - 8 * Math.sin(s * Math.PI)]);
  }
  const pmOrdered = [[250, 96]].concat(pm).concat([[250, 199]]);

  const wJ = jmOrdered.map(p => mvcWeights(p, JOINT0));
  const wP = pmOrdered.map(p => mvcWeights(p, PHAL0));
  // the two interface points, tracked separately for each part
  const iJ = [mvcWeights([250, 96], JOINT0), mvcWeights([250, 199], JOINT0)];
  const iP = [mvcWeights([250, 96], PHAL0), mvcWeights([250, 199], PHAL0)];

  let drag = null; // {which:'J'|'P', idx}

  function draw() {
    const mute = cssVar('--fg-mute'), card = cssVar('--bg-card');
    const GREEN = '#4fbf87', YELLOW = '#e0a93b', RED = '#e3564a';
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = card; ctx.fillRect(0, 0, W, H);

    const jPts = wJ.map(w => applyWeights(w, J));
    const pPts = wP.map(w => applyWeights(w, P));
    drawPoly(ctx, jPts, GREEN, GREEN + '33', 2.2);
    drawPoly(ctx, pPts, YELLOW, YELLOW + '33', 2.2);

    drawPoly(ctx, J, GREEN, null, 1.6, [6, 5]);
    drawPoly(ctx, P, YELLOW, null, 1.6, [6, 5]);

    // interface surfaces
    const fJ = iJ.map(w => applyWeights(w, J));
    const fP = iP.map(w => applyWeights(w, P));
    const gap = Math.max(Math.hypot(fJ[0][0] - fP[0][0], fJ[0][1] - fP[0][1]),
                         Math.hypot(fJ[1][0] - fP[1][0], fJ[1][1] - fP[1][1]));
    ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.strokeStyle = gap > 1 ? RED : '#5fa9ff';
    ctx.beginPath(); ctx.moveTo(fJ[0][0], fJ[0][1]); ctx.lineTo(fJ[1][0], fJ[1][1]); ctx.stroke();
    if (gap > 1) {
      ctx.strokeStyle = RED;
      ctx.beginPath(); ctx.moveTo(fP[0][0], fP[0][1]); ctx.lineTo(fP[1][0], fP[1][1]); ctx.stroke();
    }
    ctx.lineCap = 'butt';

    const drawHandles = (cage, color, which) => {
      for (let i = 0; i < cage.length; i++) {
        const shared = LINKS.some(l => (which === 'J' ? l[0] : l[1]) === i);
        ctx.beginPath(); ctx.arc(cage[i][0], cage[i][1], shared ? 7.5 : 6, 0, 7);
        ctx.fillStyle = (merged && shared) ? '#5fa9ff' : color;
        ctx.fill(); ctx.strokeStyle = card; ctx.lineWidth = 2; ctx.stroke();
      }
    };
    drawHandles(J, GREEN, 'J');
    drawHandles(P, YELLOW, 'P');

    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = GREEN; ctx.fillText('joint — cage may only stretch along its axis (x)', 12, 22);
    ctx.fillStyle = YELLOW; ctx.fillText('phalanx — 3D printed, cage is free', 12, 40);
    ctx.fillStyle = mute; ctx.fillText('blue handles are shared between the two cages', 12, H - 12);

    read.innerHTML =
      `mode: <b>${merged ? 'merged' : 'independent'}</b><br>` +
      `interface mismatch = <b style="color:${gap > 1 ? RED : GREEN}">${gap.toFixed(1)} px</b><br>` +
      (gap > 1
        ? `<span style="color:${RED}">parts have separated — not manufacturable</span>`
        : `<span style="color:${GREEN}">connection surfaces match exactly</span>`);
  }

  function nearest(p) {
    let best = null, bd = 15;
    [['J', J], ['P', P]].forEach(([which, cage]) => {
      for (let i = 0; i < cage.length; i++) {
        const d = Math.hypot(cage[i][0] - p[0], cage[i][1] - p[1]);
        if (d < bd) { bd = d; best = { which, idx: i }; }
      }
    });
    return best;
  }

  function setHandle(which, idx, x, y) {
    const cage = which === 'J' ? J : P;
    if (which === 'J') {
      const shared = LINKS.some(l => l[0] === idx);
      // fabrication constraint: a joint handle that is not on the connection
      // face may only slide along the axis (here, horizontally).
      if (!shared) { cage[idx][0] = x; return; }
    }
    cage[idx][0] = x; cage[idx][1] = y;
    if (!merged) return;
    for (const [ji, pi] of LINKS) {
      if (which === 'J' && ji === idx) { P[pi][0] = x; P[pi][1] = y; }
      if (which === 'P' && pi === idx) { J[ji][0] = x; J[ji][1] = y; }
    }
  }

  const down = ev => { drag = nearest(pointerPos(cv, ev)); if (drag) { ev.preventDefault(); draw(); } };
  const move = ev => {
    if (!drag) return;
    ev.preventDefault();
    const p = pointerPos(cv, ev);
    setHandle(drag.which, drag.idx, clamp(p[0], 15, W - 15), clamp(p[1], 15, H - 15));
    draw();
  };
  const up = () => { drag = null; draw(); };
  cv.addEventListener('mousedown', down); window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  cv.addEventListener('touchstart', down, { passive: false });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);

  host.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
    host.querySelectorAll('[data-m]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    merged = b.dataset.m === 'merged';
    if (merged) for (const [ji, pi] of LINKS) { P[pi][0] = J[ji][0]; P[pi][1] = J[ji][1]; }
    draw();
  }));
  host.querySelector('#connect-lab-reset').addEventListener('click', () => {
    J = JOINT0.map(p => p.slice()); P = PHAL0.map(p => p.slice()); draw();
  });
  window.addEventListener('dh-theme', draw);
  draw();
})();


/* =================================================================
 * WIDGET 3 — codesign-landscape: control-only vs co-design vs CMA-ES
 * ================================================================= */
(function codesignLandscape() {
  const host = document.getElementById('codesign-landscape');
  if (!host) return;

  const W = 460, H = 330, PAD = 34;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div><canvas id="cdl-cv"></canvas></div>
      <div class="controls">
        <div class="toggle-row">
          <button class="btn" data-run="control">control only</button>
          <button class="btn" data-run="codesign">co-design (ours)</button>
          <button class="btn" data-run="cma">CMA-ES</button>
        </div>
        <button class="btn" id="cdl-clear">clear</button>
        <div class="readout" id="cdl-read"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#cdl-cv');
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#cdl-read');

  const D0 = 0.20, C0 = 0.10;                 // the human's nominal design + start
  const cstar = d => 0.25 + 0.50 * d;         // best control for a given design
  const floor = d => 0.05 + 1.30 * (d - 0.72) * (d - 0.72);
  const loss = (d, c) => floor(d) + 1.6 * (c - cstar(d)) * (c - cstar(d));
  const gradD = (d, c) => 2.60 * (d - 0.72) - 3.2 * (c - cstar(d)) * 0.5;
  const gradC = (d, c) => 3.2 * (c - cstar(d));

  const px = d => PAD + d * (W - 2 * PAD);
  const py = c => H - PAD - c * (H - 2 * PAD);

  let paths = [];   // {color, pts:[], scatter:[], label, episodes, best}
  let anim = null;

  function drawBase() {
    const mute = cssVar('--fg-mute');
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = (x - PAD) / (W - 2 * PAD), c = (H - PAD - y) / (H - 2 * PAD);
        let v = clamp(loss(d, c) / 1.1, 0, 1);
        const inside = x >= PAD && x <= W - PAD && y >= PAD && y <= H - PAD;
        const g = Math.round(dark ? 18 + v * 120 : 250 - v * 150);
        const i = (y * W + x) * 4;
        img.data[i] = inside ? g + (dark ? 6 : 0) : (dark ? 16 : 255);
        img.data[i + 1] = inside ? g : (dark ? 17 : 255);
        img.data[i + 2] = inside ? Math.round(g * (dark ? 1.15 : 0.98)) : (dark ? 20 : 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0, W * 2, H * 2);
    ctx.restore();

    ctx.strokeStyle = mute + '66'; ctx.lineWidth = 1;
    ctx.strokeRect(PAD, PAD, W - 2 * PAD, H - 2 * PAD);
    ctx.fillStyle = mute; ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('design parameter  ψc  →', PAD, H - 12);
    ctx.save(); ctx.translate(14, H - PAD); ctx.rotate(-Math.PI / 2);
    ctx.fillText('control parameter  u  →', 0, 0); ctx.restore();
    ctx.fillText('darker = lower loss', PAD, 20);

    // the frozen-design line
    ctx.setLineDash([5, 5]); ctx.strokeStyle = '#e3564a99'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px(D0), py(0)); ctx.lineTo(px(D0), py(1)); ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawAll() {
    drawBase();
    for (const p of paths) {
      ctx.fillStyle = p.color + '55';
      for (const s of p.scatter) { ctx.beginPath(); ctx.arc(px(s[0]), py(s[1]), 2, 0, 7); ctx.fill(); }
      if (p.pts.length > 1) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(px(p.pts[0][0]), py(p.pts[0][1]));
        for (const q of p.pts) ctx.lineTo(px(q[0]), py(q[1]));
        ctx.stroke();
      }
      const last = p.pts[p.pts.length - 1];
      if (last) {
        ctx.beginPath(); ctx.arc(px(last[0]), py(last[1]), 5, 0, 7);
        ctx.fillStyle = p.color; ctx.fill();
        ctx.strokeStyle = cssVar('--bg-card'); ctx.lineWidth = 2; ctx.stroke();
      }
    }
    read.innerHTML = paths.length
      ? paths.map(p => `<span style="color:${p.color}">■</span> ${p.label}<br>` +
          `&nbsp;&nbsp;episodes <b>${p.episodes}</b> · loss <b>${p.best.toFixed(3)}</b>`).join('<br>')
      : 'press a button to run a search';
  }

  function run(kind) {
    if (anim) cancelAnimationFrame(anim);
    const spec = {
      control:  { color: '#e3564a', label: 'control only (design frozen)' },
      codesign: { color: '#4fbf87', label: 'co-design, analytic gradients' },
      cma:      { color: '#5fa9ff', label: 'CMA-ES, no gradients' },
    }[kind];
    paths = paths.filter(p => p.label !== spec.label);
    const P = { color: spec.color, label: spec.label, pts: [], scatter: [], episodes: 0, best: 1 };
    paths.push(P);

    if (kind === 'cma') {
      let mD = D0, mC = C0, sig = 0.22, gen = 0;
      const step = () => {
        const pop = [];
        for (let k = 0; k < 12; k++) {
          const d = clamp(mD + sig * hashNoise(gen * 31 + k, 1), 0, 1);
          const c = clamp(mC + sig * hashNoise(gen * 31 + k, 2), 0, 1);
          pop.push([d, c, loss(d, c)]);
          P.scatter.push([d, c]);
        }
        pop.sort((a, b) => a[2] - b[2]);
        mD = (pop[0][0] + pop[1][0] + pop[2][0]) / 3;
        mC = (pop[0][1] + pop[1][1] + pop[2][1]) / 3;
        sig *= 0.93;
        P.pts.push([mD, mC]);
        P.episodes += 12;
        P.best = Math.min(P.best, loss(mD, mC));
        gen++;
        drawAll();
        if (gen < 26) anim = requestAnimationFrame(step);
      };
      step();
      return;
    }

    let d = D0, c = C0, i = 0;
    const lr = 0.09;
    const step = () => {
      const gd = kind === 'codesign' ? gradD(d, c) : 0;
      const gc = gradC(d, c);
      d = clamp(d - lr * gd, 0, 1);
      c = clamp(c - lr * gc, 0, 1);
      P.pts.push([d, c]);
      P.episodes += 1;                 // one forward + one adjoint backward pass
      P.best = loss(d, c);
      i++;
      drawAll();
      if (i < 60) anim = requestAnimationFrame(step);
    };
    P.pts.push([d, c]);
    step();
  }

  host.querySelectorAll('[data-run]').forEach(b =>
    b.addEventListener('click', () => run(b.dataset.run)));
  host.querySelector('#cdl-clear').addEventListener('click', () => {
    if (anim) cancelAnimationFrame(anim);
    paths = []; drawAll();
  });
  window.addEventListener('dh-theme', drawAll);
  drawAll();
})();


/* =================================================================
 * WIDGET — grad-cost: how many rollouts does one gradient cost?
 * ================================================================= */
(function gradCost() {
  const host = document.getElementById('grad-cost');
  if (!host) return;

  const W = 480, H = 260;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div><canvas id="gc-cv"></canvas></div>
      <div class="controls">
        <label class="sl">number of parameters n = <b id="gc-n">817</b>
          <input type="range" id="gc-s" min="0" max="100" value="72" step="1"/></label>
        <div class="toggle-row">
          <button class="btn" data-n="9">9 · a finger's shape</button>
          <button class="btn" data-n="189">189 · Flip Box, shape + control</button>
          <button class="btn active" data-n="817">817 · Assemble</button>
          <button class="btn" data-n="20000">20,000 · a policy network</button>
        </div>
        <div class="readout" id="gc-read"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#gc-cv');
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#gc-read');
  const slider = host.querySelector('#gc-s');
  const nLbl = host.querySelector('#gc-n');
  const ES_SAMPLES = 30;

  const sliderToN = v => Math.round(Math.pow(10, (v / 100) * 4.4));  // 1 .. ~25000
  const nToSlider = n => Math.round(Math.log10(n) / 4.4 * 100);
  let n = 817;

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), card = cssVar('--bg-card');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = card; ctx.fillRect(0, 0, W, H);

    const rows = [
      { name: 'adjoint / reverse-mode', cost: 2, color: '#4fbf87', info: n },
      { name: 'evolution strategy (30 samples)', cost: ES_SAMPLES, color: '#5fa9ff', info: 1 },
      { name: 'forward-mode AD', cost: n, color: '#e0a93b', info: n },
      { name: 'finite differences (central)', cost: 2 * n, color: '#e3564a', info: n },
    ];
    const maxLog = Math.log10(Math.max(60, 2 * n)) + 0.25;
    const x0 = 168, x1 = W - 22;
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    rows.forEach((r, i) => {
      const y = 46 + i * 48;
      const w = (Math.log10(Math.max(1, r.cost)) / maxLog) * (x1 - x0);
      ctx.fillStyle = r.color + '44';
      ctx.fillRect(x0, y, Math.max(3, w), 22);
      ctx.fillStyle = r.color;
      ctx.fillRect(x0, y, Math.max(3, w), 22);
      ctx.fillStyle = fg;
      ctx.textAlign = 'right'; ctx.fillText(r.name, x0 - 10, y + 15);
      ctx.textAlign = 'left';
      ctx.fillText(r.cost.toLocaleString() + ' rollouts', x0 + Math.max(3, w) + 8, y + 15);
      ctx.fillStyle = mute;
      ctx.fillText(r.info === 1 ? '1 number learned per rollout'
                                : r.info.toLocaleString() + ' numbers learned per rollout',
                   x0, y + 34);
    });
    ctx.fillStyle = mute; ctx.textAlign = 'left';
    ctx.fillText('simulator rollouts needed for one gradient (log scale)', 16, 22);

    const ratio = (2 * n) / 2;
    read.innerHTML =
      `n = <b>${n.toLocaleString()}</b> parameters<br>` +
      `adjoint: <b>2</b> rollouts<br>` +
      `finite differences: <b>${(2 * n).toLocaleString()}</b> rollouts<br>` +
      `<span style="color:#4fbf87">that is <b>${ratio.toLocaleString()}×</b> cheaper</span><br>` +
      `<span class="dim">an evolution strategy always costs 30 rollouts here, but each one returns a single score, not n slopes.</span>`;
  }

  slider.addEventListener('input', () => {
    n = sliderToN(+slider.value);
    nLbl.textContent = n.toLocaleString();
    host.querySelectorAll('[data-n]').forEach(x => x.classList.remove('active'));
    draw();
  });
  host.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
    host.querySelectorAll('[data-n]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    n = +b.dataset.n;
    slider.value = nToSlider(n);
    nLbl.textContent = n.toLocaleString();
    draw();
  }));
  window.addEventListener('dh-theme', draw);
  nLbl.textContent = n.toLocaleString();
  draw();
})();


/* ---- the shared toy contact loss used by the next two widgets ----
 * A pusher at position theta reaches toward a block. It only touches once
 * theta passes THC. Penetration depth d = theta - THC; the block is pushed
 * a distance proportional to the contact force; the loss is how far the
 * block ends up from where you wanted it. */
const THC = 0.35, KC = 1.6, STAR = 0.55, LFLOOR = 0.02;
function forceHard(th) { return Math.max(0, th - THC); }
function forceSoft(th, eps) {
  const z = (th - THC) / eps;
  // numerically safe softplus
  const sp = z > 30 ? z : Math.log(1 + Math.exp(z));
  return eps * sp;
}
function lossFromForce(F) { const e = KC * F - STAR; return e * e + LFLOOR; }
function lossHard(th) { return lossFromForce(forceHard(th)); }
function lossSoft(th, eps) { return lossFromForce(forceSoft(th, eps)); }
function dLossSoft(th, eps) {
  const F = forceSoft(th, eps);
  const dF = 1 / (1 + Math.exp(-(th - THC) / eps));   // d(softplus)/dth = sigmoid
  return 2 * (KC * F - STAR) * KC * dF;
}
function dLossHard(th) {
  const F = forceHard(th);
  const dF = th > THC ? 1 : 0;
  return 2 * (KC * F - STAR) * KC * dF;
}


/* =================================================================
 * WIDGET — contact-landscape: what contact does to the loss surface
 * ================================================================= */
(function contactLandscape() {
  const host = document.getElementById('contact-landscape');
  if (!host) return;

  const W = 480, H = 300, L = 46, R = 16, T = 18, B = 40;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div><canvas id="cl-cv"></canvas></div>
      <div class="controls">
        <label class="sl">contact softness ε = <b id="cl-e">0.001</b>
          <input type="range" id="cl-s" min="0" max="100" value="0" step="1"/></label>
        <label class="sl">where you are standing, θ = <b id="cl-t">0.10</b>
          <input type="range" id="cl-th" min="0" max="100" value="10" step="1"/></label>
        <button class="btn" id="cl-run">run gradient descent from θ = 0.10</button>
        <div class="readout" id="cl-read"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#cl-cv');
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#cl-read');
  const sE = host.querySelector('#cl-s'), sT = host.querySelector('#cl-th');
  const lE = host.querySelector('#cl-e'), lT = host.querySelector('#cl-t');

  const epsOf = v => 0.001 * Math.pow(300, v / 100);   // 0.001 .. 0.30
  let eps = epsOf(0), th = 0.10, anim = null, trace = null;

  const X = t => L + t * (W - L - R);
  const Y = v => H - B - (v / 0.42) * (H - T - B);

  function argmin(f) {
    let best = 0, bv = 1e9;
    for (let i = 0; i <= 1000; i++) { const t = i / 1000, v = f(t); if (v < bv) { bv = v; best = t; } }
    return best;
  }

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), card = cssVar('--bg-card');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = card; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = mute + '55'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - R, H - B); ctx.stroke();
    ctx.fillStyle = mute; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('loss', 8, T + 10);
    ctx.fillText('θ  (how far the pusher reaches)', L, H - 14);

    // contact onset
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#e3564a88';
    ctx.beginPath(); ctx.moveTo(X(THC), T); ctx.lineTo(X(THC), H - B); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e3564a'; ctx.fillText('contact starts', X(THC) + 5, T + 12);

    const curve = (f, color, lw, dash) => {
      ctx.save(); if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i <= 400; i++) {
        const t = i / 400, y = Y(Math.min(0.42, f(t)));
        i ? ctx.lineTo(X(t), y) : ctx.moveTo(X(t), y);
      }
      ctx.stroke(); ctx.restore();
    };
    curve(lossHard, mute + '99', 1.6, [5, 4]);
    curve(t => lossSoft(t, eps), '#5fa9ff', 2.4);

    // descent trace
    if (trace) {
      ctx.strokeStyle = '#4fbf87'; ctx.lineWidth = 2;
      ctx.beginPath();
      trace.forEach((t, i) => {
        const y = Y(Math.min(0.42, lossSoft(t, eps)));
        i ? ctx.lineTo(X(t), y) : ctx.moveTo(X(t), y);
      });
      ctx.stroke();
      ctx.fillStyle = '#4fbf87';
      const last = trace[trace.length - 1];
      ctx.beginPath(); ctx.arc(X(last), Y(Math.min(0.42, lossSoft(last, eps))), 5, 0, 7); ctx.fill();
    }

    // the marker and its tangent
    const g = dLossSoft(th, eps), lv = Math.min(0.42, lossSoft(th, eps));
    const dx = 0.12;
    ctx.strokeStyle = '#ff9b6a'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(th - dx), Y(Math.min(0.42, lv - g * dx)));
    ctx.lineTo(X(th + dx), Y(Math.min(0.42, lv + g * dx)));
    ctx.stroke();
    ctx.beginPath(); ctx.arc(X(th), Y(lv), 5.5, 0, 7);
    ctx.fillStyle = '#ff9b6a'; ctx.fill();
    ctx.strokeStyle = card; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = mute;
    ctx.fillText('grey dashed = true hard contact · blue = softened contact', L, T + 12);

    const bias = argmin(t => lossSoft(t, eps)) - argmin(lossHard);
    read.innerHTML =
      `gradient here dℒ/dθ = <b style="color:${Math.abs(g) < 1e-4 ? '#e3564a' : '#4fbf87'}">${g.toFixed(5)}</b><br>` +
      (Math.abs(g) < 1e-4
        ? `<span style="color:#e3564a">flat: the optimizer learns nothing</span><br>`
        : `<span style="color:#4fbf87">usable slope</span><br>`) +
      `answer shifted by softening = <b>${bias >= 0 ? '+' : ''}${bias.toFixed(3)}</b><br>` +
      (trace ? `descent from 0.10 ended at θ = <b>${trace[trace.length - 1].toFixed(3)}</b> ` +
               `(loss ${lossSoft(trace[trace.length - 1], eps).toFixed(3)})` : '');
  }

  sE.addEventListener('input', () => {
    eps = epsOf(+sE.value); lE.textContent = eps.toFixed(3); trace = null; draw();
  });
  sT.addEventListener('input', () => { th = +sT.value / 100; lT.textContent = th.toFixed(2); draw(); });
  host.querySelector('#cl-run').addEventListener('click', () => {
    if (anim) cancelAnimationFrame(anim);
    let t = 0.10; trace = [t]; let i = 0;
    const step = () => {
      for (let k = 0; k < 10; k++) {
        t = clamp(t - 0.35 * dLossSoft(t, eps), 0, 1);
        trace.push(t); i++;
      }
      draw();
      if (i < 200) anim = requestAnimationFrame(step);
    };
    step();
  });
  window.addEventListener('dh-theme', draw);
  lE.textContent = eps.toFixed(3);
  draw();
})();


/* =================================================================
 * WIDGET — smoothing: what a gradient can and cannot see
 * ================================================================= */
(function smoothing() {
  const host = document.getElementById('smoothing');
  if (!host) return;

  const W = 480, H = 300, L = 46, R = 16, T = 18, B = 40;
  const CLIFF = 0.20, LOW = 0.005;
  // Same pusher, plus a second strategy: reach under the block instead of
  // pushing it. That strategy is better, and it is a JUMP away, not a slope.
  function loss(t) { return t < CLIFF ? LOW : lossHard(t); }
  function dloss(t) { return t < CLIFF ? 0 : dLossHard(t); }

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div><canvas id="sm-cv"></canvas></div>
      <div class="controls">
        <label class="sl">noise width σ = <b id="sm-sg">0.12</b>
          <input type="range" id="sm-s" min="2" max="30" value="12" step="1"/></label>
        <label class="sl">where you are standing, θ = <b id="sm-t">0.25</b>
          <input type="range" id="sm-th" min="0" max="100" value="25" step="1"/></label>
        <label class="sl">samples N = <b id="sm-nn">24</b>
          <input type="range" id="sm-n" min="4" max="120" value="24" step="4"/></label>
        <button class="btn" id="sm-re">draw new samples</button>
        <div class="readout" id="sm-read"></div>
      </div>
    </div>`);

  const cv = host.querySelector('#sm-cv');
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#sm-read');
  const sS = host.querySelector('#sm-s'), sT = host.querySelector('#sm-th'), sN = host.querySelector('#sm-n');
  let sigma = 0.12, th = 0.25, N = 24, seed = 1, samples = [];

  const X = t => L + t * (W - L - R);
  const Y = v => H - B - (v / 0.42) * (H - T - B);

  function gauss(i) {   // Box-Muller from the deterministic hash
    const u1 = (hashNoise(i, seed) + 1) / 2 + 1e-6;
    const u2 = (hashNoise(i, seed + 77) + 1) / 2;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function resample() { samples = Array.from({ length: N }, (_, i) => gauss(i + 1) * sigma); }

  // smoothed loss by quadrature
  function lossSm(t) {
    let s = 0, wsum = 0;
    for (let k = -30; k <= 30; k++) {
      const z = k / 10, w = Math.exp(-z * z / 2);
      s += w * loss(clamp(t + z * sigma, 0, 1)); wsum += w;
    }
    return s / wsum;
  }

  function draw() {
    const mute = cssVar('--fg-mute'), card = cssVar('--bg-card');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = card; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = mute + '55'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, H - B); ctx.lineTo(W - R, H - B); ctx.stroke();
    ctx.fillStyle = mute; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('loss', 8, T + 10);
    ctx.fillText('θ', W / 2, H - 14);

    const curve = (f, color, lw, dash, jump) => {
      ctx.save(); if (dash) ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 500; i++) {
        const t = i / 500;
        if (jump && Math.abs(t - CLIFF) < 0.0021) { pen = false; continue; }
        const y = Y(Math.min(0.42, f(t)));
        pen ? ctx.lineTo(X(t), y) : ctx.moveTo(X(t), y);
        pen = true;
      }
      ctx.stroke(); ctx.restore();
    };
    curve(loss, cssVar('--fg'), 2.2, null, true);
    curve(lossSm, '#5fa9ff', 2, [6, 4]);

    ctx.fillStyle = mute;
    ctx.fillText('solid = true loss (note the jump) · blue dashed = loss blurred by σ', L, T + 12);

    // samples
    ctx.fillStyle = '#e0a93b';
    for (const w of samples) {
      const t = clamp(th + w, 0, 1);
      ctx.beginPath(); ctx.arc(X(t), Y(Math.min(0.42, loss(t))), 2.6, 0, 7); ctx.fill();
    }

    const lv = Math.min(0.42, loss(th));
    ctx.beginPath(); ctx.arc(X(th), Y(lv), 5.5, 0, 7);
    ctx.fillStyle = '#ff9b6a'; ctx.fill();
    ctx.strokeStyle = card; ctx.lineWidth = 2; ctx.stroke();

    // estimators
    const gTrue = dloss(th);
    let g1 = 0;
    for (const w of samples) g1 += dloss(clamp(th + w, 0, 1));
    g1 /= samples.length;
    let g0 = 0;
    for (const w of samples) g0 += loss(clamp(th + w, 0, 1)) * w / (sigma * sigma);
    g0 /= samples.length;
    const gSm = (lossSm(th + 0.004) - lossSm(th - 0.004)) / 0.008;

    const arrow = (g, y, color, label) => {
      const len = clamp(-g * 90, -95, 95);
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(X(th), y); ctx.lineTo(X(th) + len, y); ctx.stroke();
      if (Math.abs(len) > 5) {
        ctx.beginPath();
        const s = Math.sign(len);
        ctx.moveTo(X(th) + len, y); ctx.lineTo(X(th) + len - 7 * s, y - 4);
        ctx.lineTo(X(th) + len - 7 * s, y + 4); ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
      }
      ctx.fillStyle = color; ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.fillText(label, L + 2, y - 6);
    };
    arrow(gTrue, H - B - 6, '#e3564a', 'exact gradient');
    arrow(g1, H - B - 26, '#4fbf87', 'first order (average of gradients)');
    arrow(g0, H - B - 46, '#e0a93b', 'zeroth order (compare loss values)');

    read.innerHTML =
      `exact gradient = <b style="color:#e3564a">${gTrue.toFixed(4)}</b><br>` +
      `blurred gradient (the honest target) = <b style="color:#5fa9ff">${gSm.toFixed(4)}</b><br>` +
      `first-order estimate = <b style="color:#4fbf87">${g1.toFixed(4)}</b><br>` +
      `zeroth-order estimate = <b style="color:#e0a93b">${g0.toFixed(4)}</b><br>` +
      `<span class="dim">σ = ${sigma.toFixed(2)} · N = ${samples.length}</span>`;
  }

  sS.addEventListener('input', () => {
    sigma = +sS.value / 100; host.querySelector('#sm-sg').textContent = sigma.toFixed(2);
    resample(); draw();
  });
  sT.addEventListener('input', () => {
    th = +sT.value / 100; host.querySelector('#sm-t').textContent = th.toFixed(2); draw();
  });
  sN.addEventListener('input', () => {
    N = +sN.value; host.querySelector('#sm-nn').textContent = N; resample(); draw();
  });
  host.querySelector('#sm-re').addEventListener('click', () => { seed += 13; resample(); draw(); });
  window.addEventListener('dh-theme', draw);
  resample(); draw();
})();
