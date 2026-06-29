/* Speculative decoding blog interactive widgets. Plain JS / Canvas. No deps.
 * Conventions:
 *   - One IIFE per widget. Always check `host` exists first.
 *   - devicePx for fillRect/stroke/text canvases (crisp 2x).
 *   - cssVar('--accent') so theming follows the user's choice.
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
    document.dispatchEvent(new CustomEvent('themechange'));
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
function pointerPos(canvas, e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  const cy = (e.touches ? e.touches[0].clientY : e.clientY);
  return {
    x: (cx - r.left) / r.width * (canvas.width / 2),
    y: (cy - r.top) / r.height * (canvas.height / 2),
  };
}

const COL = {
  green: '#66bb6a', red: '#e8554e', orange: '#ffb020',
  blue: '#5fa9ff', mute: '#8a8a96',
};

/* =====================================================================
 * Widget 1: the memory wall — parallel tokens are nearly free
 * ===================================================================== */
(function bottleneck() {
  const host = document.getElementById('bottleneck-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="bnCanvas"></canvas>
      <div class="controls">
        <label class="ctl-lbl">tokens scored in one pass: <span id="bnN">8</span></label>
        <input type="range" id="bnSlider" min="1" max="64" step="1" value="8"/>
        <div class="readout" id="bnRead"></div>
        <p class="ctl-note">The flat stretch is memory-bound: the pass is just waiting for weights, so
        extra tokens cost almost nothing. Past the knee, compute saturates and latency finally climbs.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#bnCanvas');
  const W = 440, H = 300;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#bnRead');
  const slider = host.querySelector('#bnSlider');

  const memLoad = 1.0, cComp = 0.045, NMAX = 64;
  const lat = n => memLoad + n * cComp;
  const tpNorm = n => (n / lat(n)) / (1 / lat(1));
  const knee = memLoad / cComp;

  function draw() {
    const n = +slider.value;
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent');
    const padL = 44, padR = 44, padT = 24, padB = 40;
    const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT;
    const X = n => x0 + (n - 1) / (NMAX - 1) * (x1 - x0);
    const latMax = lat(NMAX), tpMax = tpNorm(NMAX);
    const YL = v => y0 - v / latMax * (y0 - y1);
    const YT = v => y0 - v / tpMax * (y0 - y1);

    // knee shading (memory-bound region)
    ctx.fillStyle = 'rgba(95,169,255,0.08)';
    ctx.fillRect(x0, y1, X(knee) - x0, y0 - y1);
    ctx.fillStyle = mute; ctx.font = '10px ' + cssVar('--sans'); ctx.textAlign = 'center';
    ctx.fillText('memory-bound', (x0 + X(knee)) / 2, y1 + 12);
    ctx.fillText('compute-bound', (X(knee) + x1) / 2, y1 + 12);

    // throughput curve (green)
    ctx.strokeStyle = COL.green; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let k = 1; k <= NMAX; k++) { const px = X(k), py = YT(tpNorm(k)); k === 1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
    // latency curve (blue)
    ctx.strokeStyle = COL.blue; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let k = 1; k <= NMAX; k++) { const px = X(k), py = YL(lat(k)); k === 1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();

    // current marker
    const px = X(n);
    ctx.strokeStyle = mute; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, y1); ctx.lineTo(px, y0); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.blue; ctx.beginPath(); ctx.arc(px, YL(lat(n)), 4.5, 0, 7); ctx.fill();
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(px, YT(tpNorm(n)), 4.5, 0, 7); ctx.fill();

    // axes labels
    ctx.fillStyle = mute; ctx.font = '11px ' + cssVar('--mono'); ctx.textAlign = 'center';
    ctx.fillText('tokens per pass', (x0 + x1) / 2, H - 10);
    ctx.textAlign = 'left'; ctx.fillStyle = COL.blue; ctx.fillText('per-pass latency', x0 + 4, y0 - 6);
    ctx.fillStyle = COL.green; ctx.textAlign = 'right'; ctx.fillText('throughput vs 1 token', x1 - 4, y1 + 30);

    read.innerHTML =
      `tokens / pass = <b>${n}</b><br>` +
      `per-pass latency = <b style="color:${COL.blue}">${lat(n).toFixed(2)}×</b> a 1-token pass<br>` +
      `throughput = <b style="color:${COL.green}">${tpNorm(n).toFixed(1)}×</b> if all accepted<br>` +
      `regime: <b>${n < knee ? 'memory-bound (free tokens)' : 'compute-bound'}</b>`;
    host.querySelector('#bnN').textContent = n;
  }

  slider.addEventListener('input', draw);
  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 2: draft -> verify -> accept, step by step
 * ===================================================================== */
(function draftTrace() {
  const host = document.getElementById('drafttrace-widget');
  if (!host) return;

  // scripted rounds; accumulates "The otter drifts down the quiet river at dawn"
  const ROUNDS = [
    { proposed: ['The', 'otter', 'drifts', 'in', 'the'], accept: 3, corrected: 'down' },
    { proposed: ['the', 'quiet', 'river', 'calm'], accept: 3, corrected: 'at' },
    { proposed: ['dawn', 'and', 'then'], accept: 1, corrected: '·' },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="dt-stats" id="dtStats"></div>
    <div class="dt-section-lbl">generated so far</div>
    <div class="dt-stage" id="dtStage"></div>
    <div class="dt-section-lbl">this pass — draft proposes, target verifies</div>
    <div class="dt-round" id="dtRound"></div>
    <div class="dt-buttons">
      <button class="btn" id="dtStep">▶ step one pass</button>
      <button class="btn" id="dtReset">reset</button>
    </div>
    <div class="dt-legend">
      <span><span class="chip-dot" style="background:${COL.green}"></span>accepted</span>
      <span><span class="chip-dot" style="background:${COL.red}"></span>rejected</span>
      <span><span class="chip-dot" style="background:${COL.orange}"></span>corrected</span>
      <span><span class="chip-dot" style="background:${COL.blue}"></span>draft proposal</span>
    </div>
  `);

  const stage = host.querySelector('#dtStage');
  const round = host.querySelector('#dtRound');
  const stats = host.querySelector('#dtStats');
  let r = 0, totalTokens = 0;
  let accepted = []; // {word, type}

  function chip(word, cls) { return `<span class="dt-chip ${cls}">${word}</span>`; }

  function render(showRound) {
    stage.innerHTML = accepted.map(a => chip(a.word, a.type)).join('') ||
      '<span class="dt-empty">(nothing yet — press step)</span>';
    const passes = r;
    const tp = passes ? (totalTokens / passes).toFixed(2) : '—';
    stats.innerHTML =
      `<span class="kv">passes: <b>${passes}</b></span>` +
      `<span class="kv">tokens: <b>${totalTokens}</b></span>` +
      `<span class="kv">tokens / pass: <b style="color:${COL.green}">${tp}</b></span>`;

    if (showRound != null) {
      const R = ROUNDS[showRound];
      let html = '';
      R.proposed.forEach((w, i) => {
        let cls = 'draft';
        if (i < R.accept) cls = 'acc';
        else if (i === R.accept) cls = 'rej';
        else cls = 'disc';
        html += chip(w, cls);
      });
      if (R.corrected && R.corrected !== '·') html += '<span class="dt-arrow">→</span>' + chip(R.corrected, 'cor');
      round.innerHTML = html;
    } else {
      round.innerHTML = '<span class="dt-empty">—</span>';
    }
  }

  function step() {
    if (r >= ROUNDS.length) return;
    const R = ROUNDS[r];
    for (let i = 0; i < R.accept; i++) accepted.push({ word: R.proposed[i], type: 'acc' });
    if (R.corrected && R.corrected !== '·') accepted.push({ word: R.corrected, type: 'cor' });
    const gained = R.accept + (R.corrected && R.corrected !== '·' ? 1 : 0);
    totalTokens += gained;
    const shown = r;
    r += 1;
    render(shown);
    host.querySelector('#dtStep').disabled = (r >= ROUNDS.length);
    host.querySelector('#dtStep').textContent = (r >= ROUNDS.length) ? '✓ sentence complete' : '▶ step one pass';
  }
  function reset() {
    r = 0; totalTokens = 0; accepted = [];
    host.querySelector('#dtStep').disabled = false;
    host.querySelector('#dtStep').textContent = '▶ step one pass';
    render(null);
  }

  host.querySelector('#dtStep').onclick = step;
  host.querySelector('#dtReset').onclick = reset;
  reset();
})();

/* =====================================================================
 * Widget 3: the accept rule, and why it's exact
 * ===================================================================== */
(function acceptRule() {
  const host = document.getElementById('accept-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="acCanvas"></canvas>
      <div class="controls">
        <p class="ctl-note">Drag in the <b style="color:${COL.blue}">top half</b> to reshape the draft q,
          in the <b style="color:${cssVar('--accent') || '#c64f24'}">bottom half</b> to reshape the target p.
          Click a token to draft it.</p>
        <div class="readout" id="acRead"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#acCanvas');
  const W = 440, H = 300;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#acRead');

  const TOK = ['A', 'B', 'C', 'D', 'E'];
  const n = TOK.length;
  let qRaw = [0.40, 0.28, 0.16, 0.10, 0.06];
  let pRaw = [0.22, 0.30, 0.24, 0.14, 0.10];
  let sel = 0;
  let drag = null;

  const padX = 28, midY = 150, maxH = 96;
  const colW = (W - 2 * padX) / n;
  const norm = a => { const s = a.reduce((x, y) => x + y, 0) || 1; return a.map(v => v / s); };

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent');
    const p = norm(pRaw), q = norm(qRaw);
    const alpha = p.reduce((s, _, i) => s + Math.min(p[i], q[i]), 0);
    const resid = pRaw.map((_, i) => Math.max(0, p[i] - q[i]));
    const residSum = resid.reduce((a, b) => a + b, 0) || 1;

    // center axis
    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, midY); ctx.lineTo(W - padX, midY); ctx.stroke();
    ctx.fillStyle = mute; ctx.font = '11px ' + cssVar('--sans'); ctx.textAlign = 'left';
    ctx.fillText('draft  q ↑', padX, 16);
    ctx.fillText('target  p ↓', padX, H - 6);

    for (let i = 0; i < n; i++) {
      const cx = padX + i * colW + colW / 2;
      const bw = colW * 0.5;
      // q bar up
      const qh = q[i] * maxH * 2.2;
      ctx.fillStyle = COL.blue; ctx.globalAlpha = (i === sel ? 1 : 0.7);
      ctx.fillRect(cx - bw / 2, midY - qh, bw, qh);
      // p bar down
      const ph = p[i] * maxH * 2.2;
      ctx.fillStyle = accent;
      ctx.fillRect(cx - bw / 2, midY, bw, ph);
      // residual marker on p side (the part that survives a rejection)
      if (resid[i] > 1e-4) {
        const rh = resid[i] * maxH * 2.2;
        ctx.globalAlpha = 1; ctx.strokeStyle = COL.green; ctx.lineWidth = 2;
        ctx.strokeRect(cx - bw / 2, midY + ph - rh, bw, rh);
      }
      ctx.globalAlpha = 1;
      // token label + selection
      ctx.fillStyle = (i === sel ? accent : mute); ctx.font = (i === sel ? '700 ' : '') + '13px ' + cssVar('--mono');
      ctx.textAlign = 'center'; ctx.fillText(TOK[i], cx, midY + 4 + (p[i] > q[i] ? -0 : 0));
      ctx.fillText(TOK[i], cx, midY + 3);
    }
    // green legend
    ctx.fillStyle = COL.green; ctx.font = '10px ' + cssVar('--sans'); ctx.textAlign = 'right';
    ctx.fillText('green outline = residual p′ (survives rejection)', W - padX, H - 6);

    const ap = Math.min(1, p[sel] / (q[sel] || 1e-9));
    read.innerHTML =
      `drafted token: <b style="color:${accent}">${TOK[sel]}</b><br>` +
      `q(${TOK[sel]}) = <b>${q[sel].toFixed(2)}</b> &nbsp; p(${TOK[sel]}) = <b>${p[sel].toFixed(2)}</b><br>` +
      `accept prob = min(1, p/q) = <b style="color:${ap >= 1 ? COL.green : COL.orange}">${ap.toFixed(2)}</b><br>` +
      `<hr class="ac-hr">P(accept any draft) = Σ min(p,q) = <b style="color:${COL.green}">${alpha.toFixed(2)}</b><br>` +
      `emitted distribution ≡ <b>p</b> exactly ✓`;
  }

  function handle(e) {
    if (!drag) return;
    const { x, y } = pointerPos(cv, e);
    let i = Math.floor((x - padX) / colW);
    i = Math.max(0, Math.min(n - 1, i));
    if (drag === 'q') {
      const h = Math.max(0, (midY - y)) / (maxH * 2.2);
      qRaw[i] = Math.max(0.01, Math.min(0.9, h));
    } else {
      const h = Math.max(0, (y - midY)) / (maxH * 2.2);
      pRaw[i] = Math.max(0.01, Math.min(0.9, h));
    }
    draw();
  }
  cv.addEventListener('mousedown', e => {
    const { x, y } = pointerPos(cv, e);
    let i = Math.floor((x - padX) / colW); i = Math.max(0, Math.min(n - 1, i));
    sel = i;
    drag = (y < midY) ? 'q' : 'p';
    handle(e);
  });
  window.addEventListener('mousemove', handle);
  window.addEventListener('mouseup', () => { drag = null; });
  cv.addEventListener('touchstart', e => {
    const { x, y } = pointerPos(cv, e);
    let i = Math.floor((x - padX) / colW); i = Math.max(0, Math.min(n - 1, i));
    sel = i; drag = (y < midY) ? 'q' : 'p'; handle(e); e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => { handle(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchend', () => { drag = null; });

  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 4: speedup calculator
 * ===================================================================== */
(function speedupCalc() {
  const host = document.getElementById('speedup-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="spCanvas"></canvas>
      <div class="controls">
        <label class="ctl-lbl">acceptance rate α = <span id="spAlphaV">0.80</span></label>
        <input type="range" id="spAlpha" min="0.1" max="0.95" step="0.01" value="0.8"/>
        <label class="ctl-lbl">draft cost ratio c = <span id="spCV">0.10</span></label>
        <input type="range" id="spC" min="0.02" max="0.5" step="0.01" value="0.1"/>
        <div class="readout" id="spRead"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#spCanvas');
  const W = 440, H = 300;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#spRead');
  let alpha = 0.8, c = 0.1;
  const GMAX = 16;

  const tokens = g => (1 - Math.pow(alpha, g + 1)) / (1 - alpha);
  const speed = g => tokens(g) / (g * c + 1);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent');
    const padL = 40, padR = 20, padT = 22, padB = 38;
    const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT;
    let best = 1, bestS = 0;
    for (let g = 1; g <= GMAX; g++) { const s = speed(g); if (s > bestS) { bestS = s; best = g; } }
    const sMax = Math.max(bestS * 1.15, 1.2);
    const X = g => x0 + (g - 1) / (GMAX - 1) * (x1 - x0);
    const Y = s => y0 - s / sMax * (y0 - y1);

    // gridline at speedup = 1
    ctx.strokeStyle = mute; ctx.globalAlpha = 0.4; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, Y(1)); ctx.lineTo(x1, Y(1)); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = mute; ctx.font = '10px ' + cssVar('--mono'); ctx.textAlign = 'left';
    ctx.fillText('1× (no gain)', x0 + 4, Y(1) - 4);

    // speedup curve
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let g = 1; g <= GMAX; g++) { const px = X(g), py = Y(speed(g)); g === 1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
    // dots
    for (let g = 1; g <= GMAX; g++) { ctx.fillStyle = accent; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(X(g), Y(speed(g)), 2.5, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // optimal marker
    ctx.fillStyle = COL.green; ctx.beginPath(); ctx.arc(X(best), Y(bestS), 6, 0, 7); ctx.fill();
    ctx.strokeStyle = COL.green; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(best), Y(bestS)); ctx.lineTo(X(best), y0); ctx.stroke(); ctx.setLineDash([]);

    ctx.fillStyle = mute; ctx.font = '11px ' + cssVar('--mono'); ctx.textAlign = 'center';
    ctx.fillText('draft length γ', (x0 + x1) / 2, H - 8);
    ctx.fillStyle = accent; ctx.textAlign = 'left';
    ctx.fillText('wall-clock speedup', x0 + 4, y1 + 6);

    read.innerHTML =
      `optimal draft length γ* = <b style="color:${COL.green}">${best}</b><br>` +
      `max speedup = <b style="color:${accent}">${bestS.toFixed(2)}×</b><br>` +
      `tokens / pass at γ* = <b>${tokens(best).toFixed(2)}</b>`;
    host.querySelector('#spAlphaV').textContent = alpha.toFixed(2);
    host.querySelector('#spCV').textContent = c.toFixed(2);
  }

  host.querySelector('#spAlpha').addEventListener('input', e => { alpha = +e.target.value; draw(); });
  host.querySelector('#spC').addEventListener('input', e => { c = +e.target.value; draw(); });
  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 5: linear draft vs token tree
 * ===================================================================== */
(function treeWidget() {
  const host = document.getElementById('tree-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="trCanvas"></canvas>
      <div class="controls">
        <div class="picker" id="trB"></div>
        <label class="ctl-lbl">draft depth d = <span id="trDV">4</span></label>
        <input type="range" id="trD" min="1" max="6" step="1" value="4"/>
        <label class="ctl-lbl">per-token acceptance α = <span id="trAV">0.70</span></label>
        <input type="range" id="trA" min="0.3" max="0.95" step="0.01" value="0.7"/>
        <div class="readout" id="trRead"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#trCanvas');
  const W = 440, H = 300;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#trRead');
  let b = 2, d = 4, alpha = 0.7;

  // expected accepted length: at each level, P(correct token among b candidates) = 1-(1-α)^b
  function metrics() {
    const ab = 1 - Math.pow(1 - alpha, b);
    let exp = 0, prod = 1;
    for (let k = 1; k <= d; k++) { prod *= ab; exp += prod; }
    let nodes = 0; for (let k = 1; k <= d; k++) nodes += Math.pow(b, k);
    return { ab, exp, nodes };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent');
    const m = metrics();
    const padL = 26, padT = 22, padB = 70;
    const levels = d, lw = (W - 2 * padL) / Math.max(levels, 1);
    const top = padT, bot = H - padB;

    // draw level columns left->right; cap nodes drawn per level
    const CAP = 9;
    // root
    let prevPts = [{ x: padL, y: (top + bot) / 2 }];
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(prevPts[0].x, prevPts[0].y, 6, 0, 7); ctx.fill();
    for (let lvl = 1; lvl <= levels; lvl++) {
      const count = Math.pow(b, lvl);
      const drawn = Math.min(count, CAP);
      const x = padL + lvl * lw;
      const pts = [];
      for (let i = 0; i < drawn; i++) {
        const y = drawn === 1 ? (top + bot) / 2 : top + i / (drawn - 1) * (bot - top);
        pts.push({ x, y });
      }
      // connect to previous (schematic fan)
      ctx.strokeStyle = mute; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
      pts.forEach(pt => {
        const par = prevPts[Math.min(prevPts.length - 1, Math.floor(pt.y / H * prevPts.length))] || prevPts[0];
        ctx.beginPath(); ctx.moveTo(par.x, par.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      // nodes; first node of each level on the "accepted path" tinted green by expectation
      pts.forEach((pt, i) => {
        ctx.fillStyle = (i === 0 && lvl <= Math.round(m.exp)) ? COL.green : COL.blue;
        ctx.globalAlpha = (i === 0) ? 1 : 0.55;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (count > drawn) {
        ctx.fillStyle = mute; ctx.font = '10px ' + cssVar('--mono'); ctx.textAlign = 'center';
        ctx.fillText('+' + (count - drawn), x, bot + 14);
      }
      prevPts = pts;
    }

    ctx.fillStyle = mute; ctx.font = '11px ' + cssVar('--sans'); ctx.textAlign = 'center';
    ctx.fillText(b === 1 ? 'linear draft (one chain)' : `token tree · branching ${b}`, W / 2, H - 44);

    const linAb = 1 - Math.pow(1 - alpha, 1);
    let linExp = 0, pr = 1; for (let k = 1; k <= d; k++) { pr *= linAb; linExp += pr; }
    read.innerHTML =
      `candidates scored = <b>${m.nodes}</b> <span style="color:${mute}">(nearly free)</span><br>` +
      `P(hit per level) = 1−(1−α)<sup>${b}</sup> = <b style="color:${COL.green}">${m.ab.toFixed(2)}</b><br>` +
      `expected accepted length = <b style="color:${COL.green}">${m.exp.toFixed(2)}</b><br>` +
      `<span style="color:${mute}">vs linear (b=1): ${linExp.toFixed(2)}</span>`;
    host.querySelector('#trDV').textContent = d;
    host.querySelector('#trAV').textContent = alpha.toFixed(2);
  }

  const bBox = host.querySelector('#trB');
  [1, 2, 3, 4].forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (v === b ? ' active' : '');
    btn.textContent = v === 1 ? 'b=1 (linear)' : 'b=' + v;
    btn.onclick = () => { b = v; bBox.querySelectorAll('button').forEach(x => x.classList.remove('active')); btn.classList.add('active'); draw(); };
    bBox.appendChild(btn);
  });
  host.querySelector('#trD').addEventListener('input', e => { d = +e.target.value; draw(); });
  host.querySelector('#trA').addEventListener('input', e => { alpha = +e.target.value; draw(); });
  draw();
  document.addEventListener('themechange', draw);
})();
