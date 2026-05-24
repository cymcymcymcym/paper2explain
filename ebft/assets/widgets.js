/* EBFT blog interactive widgets. Plain JS / Canvas. No deps.
 *   Widget 1  #ce-vs-fm          two losses, one minimizer (drag a distribution)
 *   Widget 2  #reward-space      alignment vs diversity in feature space
 *   Widget 3  #strided-calc      strided block-parallel rollouts
 *   Widget 4  #tradeoff-scrubber accuracy vs calibration over training
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
// map a pointer event to logical canvas coords (handles CSS scaling)
function evtXY(cv, e, W, H) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function drawArrow(ctx, x1, y1, x2, y2, color, width) {
  if (Math.hypot(x2 - x1, y2 - y1) < 2) return;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || 2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.translate(x2, y2); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -4.5); ctx.lineTo(-9, 4.5);
  ctx.closePath(); ctx.fill(); ctx.restore();
}

/* =====================================================================
 * Widget 1: CE vs FM — two losses, one minimizer
 * Drag the model's next-token bars; watch FM (symmetric) and CE (asymmetric).
 * ===================================================================== */
(function ceVsFm() {
  const host = document.getElementById('ce-vs-fm');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="cf-cv" width="460" height="300"></canvas>
      <div class="controls">
        <div class="loss-card">
          <div class="row"><span>feature-matching&nbsp;ℒ<sub>FM</sub></span><span class="v" id="cf-fm">0.000</span></div>
          <div class="row"><span>cross-entropy&nbsp;ℒ<sub>CE</sub></span><span class="v" id="cf-ce">0.000</span></div>
        </div>
        <div class="readout" id="cf-note"></div>
        <div class="btn-row">
          <button class="btn" id="cf-match">match target</button>
          <button class="btn" id="cf-rand">randomize</button>
        </div>
      </div>
    </div>`);

  const W = 460, H = 300;
  const cv = host.querySelector('#cf-cv');
  const ctx = devicePx(cv, W, H);
  const fmEl = host.querySelector('#cf-fm');
  const ceEl = host.querySelector('#cf-ce');
  const noteEl = host.querySelector('#cf-note');

  const K = 5;
  const labels = ['t₁', 't₂', 't₃', 't₄', 't₅'];
  const p = [0.40, 0.27, 0.18, 0.10, 0.05];        // target distribution (fixed)
  let q = [0.12, 0.30, 0.13, 0.20, 0.25];          // model distribution (draggable)

  const padL = 42, padR = 16, padT = 18, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const bw = plotW / K * 0.62, gap = plotW / K;
  const y0 = padT + plotH;                          // baseline (prob 0)
  const yProb = v => y0 - v * plotH;                // prob -> y
  const xCtr = i => padL + gap * (i + 0.5);

  function normalizeAround(i, h) {
    h = Math.max(0.001, Math.min(0.985, h));
    const others = q.reduce((s, v, k) => k === i ? s : s + v, 0);
    const scale = others > 1e-6 ? (1 - h) / others : 0;
    q = q.map((v, k) => k === i ? h : (others > 1e-6 ? v * scale : (1 - h) / (K - 1)));
  }

  function losses() {
    let fm = 0, ce = 0;
    for (let i = 0; i < K; i++) {
      fm += (q[i] - p[i]) ** 2;
      ce += -p[i] * Math.log(Math.max(q[i], 1e-9));
    }
    return { fm, ce };
  }
  const Hp = (() => { let h = 0; for (let i = 0; i < K; i++) h += -p[i] * Math.log(p[i]); return h; })();

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule');
    const accent = cssVar('--accent');
    const blue = '#5fa9ff';
    ctx.clearRect(0, 0, W, H);

    // y gridlines
    ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.fillStyle = mute;
    ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 1.0001; g += 0.25) {
      const y = yProb(g);
      ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillText(g.toFixed(2), padL - 6, y);
    }

    for (let i = 0; i < K; i++) {
      const cx = xCtr(i);
      // target (ghost outline + tick)
      ctx.strokeStyle = blue; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - bw / 2, yProb(p[i]), bw, p[i] * plotH);
      ctx.setLineDash([]);
      ctx.strokeStyle = blue; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx - bw / 2 - 3, yProb(p[i])); ctx.lineTo(cx + bw / 2 + 3, yProb(p[i])); ctx.stroke();
      // model bar (filled)
      const over = q[i] >= p[i];
      ctx.fillStyle = accent; ctx.globalAlpha = 0.85;
      ctx.fillRect(cx - bw / 2, yProb(q[i]), bw, q[i] * plotH);
      ctx.globalAlpha = 1;
      // grab handle
      ctx.fillStyle = accent;
      ctx.fillRect(cx - bw / 2, yProb(q[i]) - 2, bw, 4);
      // label
      ctx.fillStyle = mute; ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(labels[i], cx, y0 + 7);
      ctx.fillStyle = over ? mute : '#d4604f';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(q[i].toFixed(2), cx, y0 + 22);
    }
    // axis
    ctx.strokeStyle = mute; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, y0); ctx.lineTo(W - padR, y0); ctx.stroke();
    // legend
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = blue; ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('— target p', padL + 4, padT + 6);
    ctx.fillStyle = accent; ctx.fillText('■ model pθ', padL + 78, padT + 6);

    const { fm, ce } = losses();
    fmEl.textContent = fm.toFixed(3);
    ceEl.textContent = ce.toFixed(3);
    ceEl.style.color = ce > Hp + 0.6 ? '#d4604f' : cssVar('--fg');

    // diagnostic note
    let starved = -1, worst = 0;
    for (let i = 0; i < K; i++) { const def = p[i] - q[i]; if (p[i] > 0.05 && def > worst) { worst = def; starved = i; } }
    const matched = fm < 1e-4;
    if (matched) {
      noteEl.innerHTML = `<b>pθ = p.</b> Both losses are at their minimum. FM hits 0; CE bottoms out at the entropy of p (${Hp.toFixed(3)}).`;
    } else if (starved >= 0 && worst > 0.12) {
      noteEl.innerHTML = `You're <b>starving ${labels[starved]}</b> — the data wants it (${p[starved].toFixed(2)}) but the model gives ${q[starved].toFixed(2)}. CE punishes this hard; FM only mildly.`;
    } else {
      noteEl.innerHTML = `Drag a bar to the dashed target on every token. Both losses share the same minimizer — the truth p.`;
    }
  }

  // dragging
  let dragging = -1;
  function pick(x) {
    for (let i = 0; i < K; i++) if (Math.abs(x - xCtr(i)) < gap * 0.45) return i;
    return -1;
  }
  function onMove(e) {
    if (dragging < 0) return;
    e.preventDefault();
    const { y } = evtXY(cv, e, W, H);
    normalizeAround(dragging, (y0 - y) / plotH);
    draw();
  }
  cv.addEventListener('pointerdown', e => {
    const { x } = evtXY(cv, e, W, H);
    dragging = pick(x);
    if (dragging >= 0) { cv.setPointerCapture(e.pointerId); onMove(e); }
  });
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', () => dragging = -1);
  cv.addEventListener('pointercancel', () => dragging = -1);

  host.querySelector('#cf-match').addEventListener('click', () => { q = p.slice(); draw(); });
  host.querySelector('#cf-rand').addEventListener('click', () => {
    const r = Array.from({ length: K }, () => 0.05 + Math.random());
    const s = r.reduce((a, b) => a + b, 0); q = r.map(v => v / s); draw();
  });

  draw();
})();

/* =====================================================================
 * Widget 2: reward in feature space — alignment vs diversity
 * Drag rollouts (orange) and the ground-truth feature (blue star).
 * ===================================================================== */
(function rewardSpace() {
  const host = document.getElementById('reward-space');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rs-cv" width="440" height="440"></canvas>
      <div class="controls">
        <div class="readout" id="rs-read"></div>
        <div class="btn-row">
          <button class="btn" id="rs-step">take a step ▸</button>
          <button class="btn" id="rs-reset">reset</button>
        </div>
        <div class="readout" id="rs-loss" style="font-size:13px;"></div>
      </div>
    </div>`);

  const W = 440, H = 440, cx = W / 2, cy = H / 2, SC = 118;
  const cv = host.querySelector('#rs-cv');
  const ctx = devicePx(cv, W, H);
  const readEl = host.querySelector('#rs-read');
  const lossEl = host.querySelector('#rs-loss');

  const f2p = f => ({ x: cx + f.x * SC, y: cy - f.y * SC });
  const p2f = (px, py) => ({ x: (px - cx) / SC, y: -(py - cy) / SC });
  const dot = (a, b) => a.x * b.x + a.y * b.y;

  let gt, roll;
  function reset() {
    gt = { x: 0.95, y: 0.6 };
    roll = [
      { x: -0.75, y: -0.35 }, { x: -0.35, y: 0.15 },
      { x: -0.95, y: 0.25 }, { x: -0.45, y: -0.7 },
    ];
    draw();
  }

  function mean() {
    const m = { x: 0, y: 0 };
    roll.forEach(r => { m.x += r.x; m.y += r.y; });
    return { x: m.x / roll.length, y: m.y / roll.length };
  }

  function rewards() {
    const n = roll.length;
    return roll.map((rj, j) => {
      const align = 2 * dot(rj, gt);
      let div = 0;
      roll.forEach((rk, k) => { if (k !== j) div += dot(rj, rk); });
      div = (2 / (n - 1)) * div;
      return { align, div, r: align - div };
    });
  }

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule'), accent = cssVar('--accent');
    const blue = '#5fa9ff', green = '#3fae6a', red = '#d4604f';
    ctx.clearRect(0, 0, W, H);

    // grid + axes
    ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    for (let g = -1.5; g <= 1.5001; g += 0.5) {
      const px = cx + g * SC, py = cy - g * SC;
      ctx.beginPath(); ctx.moveTo(px, 18); ctx.lineTo(px, H - 18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, py); ctx.lineTo(W - 18, py); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mute; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(18, cy); ctx.lineTo(W - 18, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 18); ctx.lineTo(cx, H - 18); ctx.stroke();
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('feature space φ(c:·)', 22, 22);

    const m = mean(), mp = f2p(m), gp = f2p(gt);
    const rw = rewards();

    // spokes from rollouts to mean
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.3; ctx.lineWidth = 1.2;
    roll.forEach(r => { const p = f2p(r); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(mp.x, mp.y); ctx.stroke(); });
    ctx.globalAlpha = 1;

    // loss line: mean -> ground truth
    ctx.strokeStyle = fg; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mp.x, mp.y); ctx.lineTo(gp.x, gp.y); ctx.stroke();
    ctx.setLineDash([]);

    // ground-truth star
    drawStar(ctx, gp.x, gp.y, 5, 11, 5.2, blue);
    ctx.fillStyle = blue; ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(' φ(c:y)', gp.x + 9, gp.y);

    // mean ring
    ctx.strokeStyle = accent; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(mp.x, mp.y, 9, 0, 2 * Math.PI); ctx.stroke();

    // rollout dots (colored by reward sign)
    roll.forEach((r, j) => {
      const p = f2p(r);
      ctx.fillStyle = rw[j].r >= 0 ? green : red;
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = fg; ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText((rw[j].r >= 0 ? '+' : '') + rw[j].r.toFixed(2), p.x, p.y - 10);
    });

    // readout
    const L = (m.x - gt.x) ** 2 + (m.y - gt.y) ** 2;
    let rows = rw.map((v, j) =>
      `<div>ŷ<sub>${j + 1}</sub>&nbsp; r=<b style="color:${v.r >= 0 ? '#3fae6a' : '#d4604f'}">${(v.r >= 0 ? '+' : '') + v.r.toFixed(2)}</b>
       <span style="color:var(--fg-mute)">= align ${v.align.toFixed(2)} − div ${v.div.toFixed(2)}</span></div>`).join('');
    readEl.innerHTML = rows;
    lossEl.innerHTML = `feature-matching loss<br><b style="font-size:18px">ℒ<sub>FM</sub> = ${L.toFixed(3)}</b>
      <span style="color:var(--fg-mute)">= ‖mean − truth‖²</span>`;
  }

  function drawStar(ctx, x, y, spikes, R, r, color) {
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? R : r;
      const a = -Math.PI / 2 + i * Math.PI / spikes;
      ctx[i === 0 ? 'moveTo' : 'lineTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  // dragging (rollouts or the star)
  let drag = null;
  function pick(px, py) {
    const gp = f2p(gt);
    if (Math.hypot(px - gp.x, py - gp.y) < 16) return { type: 'gt' };
    for (let j = 0; j < roll.length; j++) {
      const p = f2p(roll[j]);
      if (Math.hypot(px - p.x, py - p.y) < 15) return { type: 'roll', j };
    }
    return null;
  }
  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    const { x, y } = evtXY(cv, e, W, H);
    const f = p2f(x, y);
    f.x = Math.max(-1.5, Math.min(1.5, f.x)); f.y = Math.max(-1.5, Math.min(1.5, f.y));
    if (drag.type === 'gt') gt = f; else roll[drag.j] = f;
    draw();
  }
  cv.addEventListener('pointerdown', e => {
    const { x, y } = evtXY(cv, e, W, H);
    drag = pick(x, y);
    if (drag) cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', () => drag = null);
  cv.addEventListener('pointercancel', () => drag = null);

  host.querySelector('#rs-step').addEventListener('click', () => {
    const m = mean(), eta = 0.4;
    const sx = eta * (gt.x - m.x), sy = eta * (gt.y - m.y);
    roll = roll.map(r => ({ x: r.x + sx, y: r.y + sy }));
    draw();
  });
  host.querySelector('#rs-reset').addEventListener('click', reset);

  reset();
})();

/* =====================================================================
 * Widget 3: strided block-parallel rollouts
 * Set T, stride s, completion length G; see how many pairs one sequence yields.
 * ===================================================================== */
(function stridedCalc() {
  const host = document.getElementById('strided-calc');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="sc-cv" width="460" height="240"></canvas>
      <div class="controls">
        <div class="slider-row">
          <label>sequence length T <b id="sc-tv">12</b></label>
          <input type="range" id="sc-t" min="8" max="20" step="1" value="12"/>
        </div>
        <div class="slider-row">
          <label>stride s <b id="sc-sv">4</b></label>
          <input type="range" id="sc-s" min="2" max="8" step="1" value="4"/>
        </div>
        <div class="slider-row">
          <label>completion length G <b id="sc-gv">4</b></label>
          <input type="range" id="sc-g" min="2" max="6" step="1" value="4"/>
        </div>
        <div class="readout" id="sc-read"></div>
      </div>
    </div>`);

  const W = 460, H = 240;
  const cv = host.querySelector('#sc-cv');
  const ctx = devicePx(cv, W, H);
  const tEl = host.querySelector('#sc-t'), sEl = host.querySelector('#sc-s'), gEl = host.querySelector('#sc-g');
  const tv = host.querySelector('#sc-tv'), sv = host.querySelector('#sc-sv'), gv = host.querySelector('#sc-gv');
  const readEl = host.querySelector('#sc-read');
  const branchCols = ['#ff7a59', '#3fae6a', '#5fa9ff', '#e6a23c', '#b07be8', '#e85d9b'];

  function draw() {
    const T = +tEl.value, s = +sEl.value, G = +gEl.value;
    tv.textContent = T; sv.textContent = s; gv.textContent = G;
    const B = Math.max(0, Math.floor((T - G) / s));

    const fg = cssVar('--fg'), mute = cssVar('--fg-mute');
    const blue = '#5a86c9';
    ctx.clearRect(0, 0, W, H);

    const padX = 16, baseY = H - 34;
    const cw = (W - 2 * padX) / T;
    const box = Math.min(cw * 0.84, 22);
    const bh = Math.min(box, 20);

    // base sequence (bottom row)
    for (let i = 0; i < T; i++) {
      const x = padX + cw * i + (cw - box) / 2;
      ctx.fillStyle = blue; ctx.globalAlpha = 0.9;
      roundRect(ctx, x, baseY - bh / 2, box, bh, 4); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.font = `${Math.min(10, box * 0.5)}px ui-monospace, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('t' + i, x + box / 2, baseY);
    }

    // branches: anchor after token (b*s)-1, completion occupies columns b*s .. b*s+G-1
    const rowH = (baseY - bh / 2 - 14) / Math.max(G, 1);
    const stepH = Math.min(rowH, bh + 5);
    for (let b = 1; b <= B; b++) {
      const startCol = b * s;
      const col = branchCols[(b - 1) % branchCols.length];
      for (let k = 0; k < G; k++) {
        const colIdx = startCol + k;
        if (colIdx >= T) break;
        const x = padX + cw * colIdx + (cw - box) / 2;
        const y = baseY - bh / 2 - 8 - (k + 1) * stepH;
        ctx.fillStyle = col;
        roundRect(ctx, x, y, box, bh, 4); ctx.fill();
        // connector
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.moveTo(x + box / 2, y + bh); ctx.lineTo(x + box / 2, y + stepH); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // anchor tick on base
      const ax = padX + cw * startCol + cw / 2 - cw / 2;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, baseY + bh / 2 + 2); ctx.lineTo(ax, baseY + bh / 2 + 9); ctx.stroke();
    }

    ctx.fillStyle = mute; ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('base sequence (blue) → ' + B + ' branched rollouts', padX, 8);

    readEl.innerHTML =
      `<div>pairs&nbsp; B = ⌊(T−G)/s⌋ = <b>${B}</b></div>
       <div>supervision points: <b>${B}</b> <span style="color:var(--fg-mute)">(vs 1 for a plain rollout)</span></div>
       <div>forward passes: <b>${G}</b> parallel <span style="color:var(--fg-mute)">vs ${B * G} sequential</span></div>
       <div>generated tokens: <b>${B * G}</b></div>`;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  [tEl, sEl, gEl].forEach(el => el.addEventListener('input', draw));
  draw();
})();

/* =====================================================================
 * Widget 4: tradeoff scrubber — accuracy vs calibration over training
 * Scrub training; watch SFT, RLVR, EBFT move in the (accuracy, CE) plane.
 * (Trajectories approximated from Figure 1, Q&A coding.)
 * ===================================================================== */
(function tradeoffScrubber() {
  const host = document.getElementById('tradeoff-scrubber');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="ts-cv" width="440" height="360"></canvas>
      <div class="controls">
        <div class="slider-row">
          <label>training progress <b id="ts-tv">0%</b></label>
          <input type="range" id="ts-t" min="0" max="1" step="0.01" value="0"/>
        </div>
        <div class="btn-row"><button class="btn" id="ts-play">▶ play</button></div>
        <div class="legend">
          <span><span class="sw" style="background:#2f6fdb"></span>EBFT — acc↑, calibration↑</span>
          <span><span class="sw" style="background:#b23b34"></span>SFT — calibration↑, acc flat</span>
          <span><span class="sw" style="background:#f1936a"></span>RLVR — acc↑, calibration↓</span>
        </div>
        <div class="readout" id="ts-read"></div>
      </div>
    </div>`);

  const W = 440, H = 360;
  const cv = host.querySelector('#ts-cv');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#ts-t');
  const tvEl = host.querySelector('#ts-tv');
  const readEl = host.querySelector('#ts-read');
  const playBtn = host.querySelector('#ts-play');

  // keyframes: [accuracy, CE]; index 0 = base, 4 = final
  const base = [0.484, 0.338];
  const traj = {
    EBFT: { c: '#2f6fdb', k: [[0.484, 0.338], [0.505, 0.300], [0.524, 0.262], [0.539, 0.232], [0.548, 0.207]] },
    SFT:  { c: '#b23b34', k: [[0.484, 0.338], [0.479, 0.318], [0.486, 0.304], [0.481, 0.295], [0.483, 0.289]] },
    RLVR: { c: '#f1936a', k: [[0.484, 0.338], [0.506, 0.372], [0.520, 0.470], [0.531, 0.610], [0.535, 0.774]] },
  };
  const accMin = 0.46, accMax = 0.565, ceMin = 0.18, ceMax = 0.80;
  const padL = 52, padR = 14, padT = 16, padB = 42;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const X = a => padL + (a - accMin) / (accMax - accMin) * plotW;
  const Y = c => padT + (c - ceMin) / (ceMax - ceMin) * plotH;   // higher CE = lower on screen (worse = up? -> invert)
  // we want higher CE near TOP (worse), so invert:
  const Yc = c => padT + plotH - (c - ceMin) / (ceMax - ceMin) * plotH;

  function at(k, t) {
    const seg = t * (k.length - 1);
    const i = Math.min(k.length - 2, Math.floor(seg));
    const f = seg - i;
    return [k[i][0] + (k[i + 1][0] - k[i][0]) * f, k[i][1] + (k[i + 1][1] - k[i][1]) * f];
  }

  function draw(t) {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);

    // gridlines + axis labels
    ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.fillStyle = mute;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let c = 0.2; c <= 0.8001; c += 0.2) {
      const y = Yc(c);
      ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillText(c.toFixed(1), padL - 6, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let a = 0.48; a <= 0.5601; a += 0.04) {
      const x = X(a);
      ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillText(a.toFixed(2), x, padT + plotH + 6);
    }
    // axes
    ctx.strokeStyle = mute; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(W - padR, padT + plotH); ctx.stroke();
    // axis titles
    ctx.fillStyle = mute; ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('HumanEval greedy accuracy →', padL + plotW / 2, H - 4);
    ctx.save(); ctx.translate(13, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top'; ctx.fillText('← validation cross-entropy (worse)', 0, 0); ctx.restore();

    // "better" corner hint (bottom-right)
    ctx.fillStyle = '#3fae6a'; ctx.globalAlpha = 0.85;
    ctx.font = 'italic 11px -apple-system, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('better ↘', W - padR - 6, padT + plotH - 6);
    ctx.globalAlpha = 1;

    // base reference
    const bx = X(base[0]), by = Yc(base[1]);
    ctx.strokeStyle = mute; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, by); ctx.lineTo(W - padR, by); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = mute; ctx.beginPath(); ctx.arc(bx, by, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText(' base', bx + 6, by - 8);

    let lines = '';
    for (const name of ['SFT', 'RLVR', 'EBFT']) {
      const { c, k } = traj[name];
      // trail
      ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.85;
      ctx.beginPath();
      const N = 40;
      for (let i = 0; i <= N * t; i++) {
        const tt = i / N;
        const [a, ce] = at(k, tt);
        const px = X(a), py = Yc(ce);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      // current dot
      const [a, ce] = at(k, t);
      const px = X(a), py = Yc(ce);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, 6, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = cssVar('--bg-card'); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = c; ctx.font = 'bold 11px -apple-system, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(' ' + name, px + 6, py);
      lines += `<div><b style="color:${c}">${name}</b>&nbsp; acc ${a.toFixed(3)} · CE ${ce.toFixed(3)}</div>`;
    }
    readEl.innerHTML = lines;
    tvEl.textContent = Math.round(t * 100) + '%';
  }

  let timer = null;
  function stop() { if (timer) { clearInterval(timer); timer = null; playBtn.textContent = '▶ play'; } }
  playBtn.addEventListener('click', () => {
    if (timer) { stop(); return; }
    if (+slider.value >= 1) slider.value = 0;
    playBtn.textContent = '❚❚ pause';
    timer = setInterval(() => {
      let v = +slider.value + 0.012;
      if (v >= 1) { v = 1; stop(); }
      slider.value = v; draw(v);
    }, 32);
  });
  slider.addEventListener('input', () => { stop(); draw(+slider.value); });
  draw(0);
})();
