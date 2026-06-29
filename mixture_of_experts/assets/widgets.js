/* Mixture of Experts blog — interactive widgets. Plain JS / Canvas. No deps.
 *   1. gate-partition  classical softmax gate softly partitions a 2-D input space
 *   2. topk-compute     top-k router: total params grow, active params/FLOPs stay flat
 *   3. load-balance     expert collapse (rich-get-richer) vs a balanced router
 *   4. capacity         expert capacity & token dropping at a chosen capacity factor
 *   5. routing-modes    token-choice vs expert-choice routing
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
  });
})();

/* ---------- helpers ---------- */
function devicePx(canvas, cssW, cssH) {
  canvas.width = cssW * 2; canvas.height = cssH * 2;
  const ctx = canvas.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); return ctx;
}
function flatPx(canvas, w, h) { canvas.width = w; canvas.height = h; return canvas.getContext('2d'); }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvasXY(canvas, e, W, H) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  const cy = (e.touches ? e.touches[0].clientY : e.clientY);
  return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H];
}
function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

const EXPERT_COLORS = ['#5fa9ff', '#ff9b6a', '#66bb6a', '#c77dff', '#ffd166', '#4dd0e1', '#f06292', '#9ccc65'];

/* =====================================================================
 * Widget 1: gate-partition — softmax gate over expert centers, in 2-D
 * ===================================================================== */
(function gatePartition() {
  const host = document.getElementById('gate-partition');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body stack">
      <canvas id="gpCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>gate sharpness &beta; = <span id="gpBval">14</span></label>
          <input type="range" id="gpBeta" min="2" max="40" step="1" value="14"/>
        </div>
        <div class="readout" id="gpReadout"></div>
      </div>
    </div>`);

  const W = 248, H = 162;
  const cv = host.querySelector('#gpCanvas');
  const ctx = flatPx(cv, W, H);
  const beta = host.querySelector('#gpBeta');
  const bval = host.querySelector('#gpBval');
  const readout = host.querySelector('#gpReadout');

  const NE = 4;
  const experts = [
    { x: 0.25, y: 0.30 }, { x: 0.72, y: 0.26 },
    { x: 0.30, y: 0.74 }, { x: 0.74, y: 0.72 },
  ];
  const cols = experts.map((_, i) => hexToRgb(EXPERT_COLORS[i]));
  let img = ctx.createImageData(W, H);

  function draw() {
    const b = parseFloat(beta.value); bval.textContent = b;
    const data = img.data;
    for (let py = 0; py < H; py++) {
      const fy = py / H;
      for (let px = 0; px < W; px++) {
        const fx = px / W;
        let wsum = 0; const w = new Array(NE);
        for (let i = 0; i < NE; i++) {
          const dx = fx - experts[i].x, dy = fy - experts[i].y;
          const e = Math.exp(-b * (dx * dx + dy * dy));
          w[i] = e; wsum += e;
        }
        let r = 0, g = 0, bl = 0;
        for (let i = 0; i < NE; i++) { const ww = w[i] / wsum; r += ww * cols[i][0]; g += ww * cols[i][1]; bl += ww * cols[i][2]; }
        const idx = (py * W + px) * 4;
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = bl; data[idx + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);
    // expert markers
    for (let i = 0; i < NE; i++) {
      const cx = experts[i].x * W, cy = experts[i].y * H;
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, 7); ctx.fillStyle = EXPERT_COLORS[i]; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('' + (i + 1), cx, cy);
    }
    readout.innerHTML =
      `output  <b>y = &Sigma;<sub>i</sub> G(x)<sub>i</sub> E<sub>i</sub>(x)</b><br>` +
      `each region = the expert the gate trusts most.<br>` +
      `<span class="hint">${b < 8 ? 'low &beta;: soft, blended borders' : b > 26 ? 'high &beta;: crisp, hard partition' : 'drag the dots to move the experts'}</span>`;
  }

  // drag nearest expert
  let dragIdx = -1;
  function nearest(px, py) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < NE; i++) {
      const d = Math.hypot(px - experts[i].x * W, py - experts[i].y * H);
      if (d < bd) { bd = d; best = i; }
    }
    return bd < 22 ? best : -1;
  }
  cv.addEventListener('pointerdown', (e) => {
    const [px, py] = canvasXY(cv, e, W, H);
    dragIdx = nearest(px, py);
    if (dragIdx >= 0) cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (dragIdx < 0) return;
    const [px, py] = canvasXY(cv, e, W, H);
    experts[dragIdx].x = Math.max(0.04, Math.min(0.96, px / W));
    experts[dragIdx].y = Math.max(0.04, Math.min(0.96, py / H));
    draw();
  });
  cv.addEventListener('pointerup', () => { dragIdx = -1; });
  cv.addEventListener('pointercancel', () => { dragIdx = -1; });
  beta.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: topk-compute — total params grow with N, active stays at k
 * ===================================================================== */
(function topkCompute() {
  const host = document.getElementById('topk-compute');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="tkCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>experts N = <span id="tkNval">8</span></label>
          <input type="range" id="tkN" min="2" max="48" step="1" value="8"/>
        </div>
        <div class="ctl">
          <label>top-k fired / token = <span id="tkKval">2</span></label>
          <input type="range" id="tkK" min="1" max="8" step="1" value="2"/>
        </div>
        <div class="readout" id="tkReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 250;
  const cv = host.querySelector('#tkCanvas');
  const ctx = devicePx(cv, W, H);
  const sN = host.querySelector('#tkN'), sK = host.querySelector('#tkK');
  const nval = host.querySelector('#tkNval'), kval = host.querySelector('#tkKval');
  const readout = host.querySelector('#tkReadout');
  const BASE = 2.4, PER = 5.6, MAXN = 48; // billions
  const scores = []; { const r = mulberry32(99); for (let i = 0; i < MAXN; i++) scores.push(r()); }

  function draw() {
    let N = parseInt(sN.value, 10); let k = parseInt(sK.value, 10);
    if (k > N) { k = N; sK.value = k; }
    sK.max = N; nval.textContent = N; kval.textContent = k;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      green = '#5cb85c', rule = cssVar('--rule'), dim = cssVar('--bg-card');
    ctx.clearRect(0, 0, W, H);

    // pick top-k experts by score among first N
    const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const lit = new Set(idx.slice(0, k));

    // expert grid (top region)
    const cols = Math.min(N, 12), rows = Math.ceil(N / 12);
    const gx0 = 14, gy0 = 22, gw = W - 28, cellW = gw / 12, cellH = 22;
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = mute; ctx.textAlign = 'left';
    ctx.fillText(`${N} experts · ${k} fire for this token`, gx0, gy0 - 6);
    for (let i = 0; i < N; i++) {
      const cx = gx0 + (i % 12) * cellW, cy = gy0 + Math.floor(i / 12) * (cellH + 5);
      ctx.fillStyle = lit.has(i) ? accent : dim;
      ctx.strokeStyle = lit.has(i) ? accent : rule; ctx.lineWidth = lit.has(i) ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(cx, cy, cellW - 5, cellH, 4); ctx.fill(); ctx.stroke();
    }

    // bars
    const barX = 130, maxW = W - barX - 70;
    const total = BASE + N * PER, active = BASE + k * PER, MAXTOT = BASE + MAXN * PER;
    const yT = gy0 + rows * (cellH + 5) + 36, yA = yT + 54;
    ctx.textAlign = 'left'; ctx.fillStyle = mute; ctx.font = '12px var(--sans, sans-serif)';
    function bar(y, label, val, col) {
      ctx.fillStyle = mute; ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(label, 14, y - 8);
      ctx.fillStyle = rule; ctx.beginPath(); ctx.roundRect(barX, y, maxW, 24, 4); ctx.fill();
      const w = maxW * val / MAXTOT;
      ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(barX, y, Math.max(3, w), 24, 4); ctx.fill();
      ctx.fillStyle = fg; ctx.font = 'bold 13px ui-monospace, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${val.toFixed(0)}B`, barX + Math.max(3, w) + 8, y + 17);
    }
    bar(yT, 'total parameters (∝ N)', total, accent);
    bar(yA, 'active / token (∝ k)', active, green);

    readout.innerHTML =
      `total params: <b>${total.toFixed(0)}B</b> &nbsp;(grows with N)<br>` +
      `active / token: <b>${active.toFixed(0)}B</b> &nbsp;(only k experts)<br>` +
      `compute ratio: <b>${(100 * k / N).toFixed(0)}%</b> of dense<br>` +
      `<span class="ok">${N}× the knowledge · ${k}/${N} the cost</span>`;
  }
  sN.addEventListener('input', draw); sK.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: load-balance — collapse vs balanced router (live)
 * ===================================================================== */
(function loadBalance() {
  const host = document.getElementById('load-balance');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="lbCanvas"></canvas>
      <div class="controls">
        <div class="toggle-row" id="lbMode">
          <button class="btn" data-b="0">no balancing</button>
          <button class="btn active" data-b="1">balancing loss</button>
        </div>
        <div class="toggle-row"><button class="btn" id="lbReset">↺ restart</button></div>
        <div class="readout" id="lbReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 240;
  const cv = host.querySelector('#lbCanvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#lbReadout');
  const N = 12;
  let counts, skill, total, balance = true, rng;

  function reset() {
    counts = new Array(N).fill(0); skill = new Array(N).fill(0); total = 0; rng = mulberry32(5);
  }
  reset();

  function step() {
    const maxc = Math.max(1, ...counts);
    for (let s = 0; s < 6; s++) {           // a few tokens per frame
      let best = -1, bv = -1e9;
      for (let i = 0; i < N; i++) {
        let v = skill[i] + rng() * 0.45;
        if (balance) v -= 6.0 * (counts[i] / maxc);
        if (v > bv) { bv = v; best = i; }
      }
      counts[best]++; skill[best] += 0.06; total++;
    }
    if (total > 1600) reset();
  }

  function draw() {
    step();
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      green = '#5cb85c', rule = cssVar('--rule'), bad = '#e0533d';
    ctx.clearRect(0, 0, W, H);
    const pad = 16, base = H - 34, top = 28, maxc = Math.max(1, ...counts);
    const bw = (W - 2 * pad) / N;
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = mute; ctx.textAlign = 'left';
    ctx.fillText('tokens routed to each expert', pad, 16);
    const used = counts.filter((c) => c > total * 0.01).length;
    for (let i = 0; i < N; i++) {
      const h = (counts[i] / maxc) * (base - top);
      const x = pad + i * bw;
      const share = total > 0 ? counts[i] / total : 0;
      ctx.fillStyle = (!balance && share > 0.2) ? bad : (balance ? green : accent);
      ctx.beginPath(); ctx.roundRect(x + 2, base - h, bw - 4, h, 3); ctx.fill();
    }
    ctx.strokeStyle = rule; ctx.beginPath(); ctx.moveTo(pad, base); ctx.lineTo(W - pad, base); ctx.stroke();
    ctx.fillStyle = mute; ctx.fillText('experts →', pad, base + 16);

    const maxShare = total > 0 ? Math.max(...counts) / total : 0;
    readout.innerHTML = balance
      ? `<b>balancing loss on</b><br>tokens spread across <span class="ok">${used}/${N} experts</span><br>busiest expert: ${(100 * maxShare).toFixed(0)}% of traffic`
      : `<b>no balancing</b><br>used: <span class="bad">${used}/${N} experts</span> (rest starved)<br>busiest expert: <span class="bad">${(100 * maxShare).toFixed(0)}%</span> of traffic`;
  }

  host.querySelectorAll('#lbMode .btn').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('#lbMode .btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); balance = b.dataset.b === '1'; reset();
  }));
  host.querySelector('#lbReset').addEventListener('click', reset);
  (function loop() { draw(); requestAnimationFrame(loop); })();
})();

/* =====================================================================
 * Widget 4: capacity — expert buffers, capacity factor, token dropping
 * ===================================================================== */
(function capacity() {
  const host = document.getElementById('capacity');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="capCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>capacity factor = <span id="capCFval">1.0</span></label>
          <input type="range" id="capCF" min="0.5" max="2.5" step="0.05" value="1.0"/>
        </div>
        <div class="readout" id="capReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 250;
  const cv = host.querySelector('#capCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#capCF');
  const cfval = host.querySelector('#capCFval');
  const readout = host.querySelector('#capReadout');
  const N = 8, T = 64;
  // skewed popularity → some experts overflow at low CF
  const pop = [3.0, 2.4, 1.9, 1.5, 1.1, 0.9, 0.6, 0.45];
  const assign = []; { // token -> expert, seeded
    const r = mulberry32(11); const cum = []; let s = 0; pop.forEach((p) => { s += p; cum.push(s); });
    for (let t = 0; t < T; t++) { const u = r() * s; assign.push(cum.findIndex((c) => u < c)); }
  }
  let frame = 0;

  function draw() {
    const CF = parseFloat(slider.value); cfval.textContent = CF.toFixed(2);
    const cap = Math.floor((T / N) * CF);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      green = '#5cb85c', rule = cssVar('--rule'), bad = '#e0533d';
    ctx.clearRect(0, 0, W, H);

    const shown = Math.min(T, Math.floor(frame / 1.2));
    const filled = new Array(N).fill(0); let drops = 0;
    const dropFlash = [];
    for (let t = 0; t < shown; t++) {
      const e = assign[t];
      if (filled[e] < cap) filled[e]++;
      else { drops++; if (t > shown - 4) dropFlash.push(e); }
    }
    // total counts (for wasted slots)
    const counts = new Array(N).fill(0); for (let t = 0; t < T; t++) counts[assign[t]]++;
    let totalDrops = 0, wasted = 0;
    for (let i = 0; i < N; i++) { totalDrops += Math.max(0, counts[i] - cap); wasted += Math.max(0, cap - counts[i]); }

    const pad = 18, base = H - 30, topY = 30, binW = (W - 2 * pad) / N;
    const slotH = Math.min(13, (base - topY) / Math.max(1, cap));
    const capY = base - cap * slotH;
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = mute; ctx.textAlign = 'left';
    ctx.fillText(`buffer per expert = ⌊(${T}/${N}) × ${CF.toFixed(2)}⌋ = ${cap} tokens`, pad, 16);
    for (let i = 0; i < N; i++) {
      const x = pad + i * binW;
      // capacity outline
      ctx.strokeStyle = rule; ctx.lineWidth = 1;
      ctx.strokeRect(x + 3, capY, binW - 6, cap * slotH);
      // filled tokens
      for (let f = 0; f < filled[i]; f++) {
        ctx.fillStyle = green;
        ctx.beginPath(); ctx.roundRect(x + 4, base - (f + 1) * slotH + 1.5, binW - 8, slotH - 2.5, 2); ctx.fill();
      }
      // overflow indicator
      if (counts[i] > cap && shown >= T) {
        ctx.fillStyle = bad; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText('▲' + (counts[i] - cap), x + binW / 2, capY - 4);
      }
    }
    // capacity line
    ctx.strokeStyle = accent; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pad, capY); ctx.lineTo(W - pad, capY); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = accent; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('capacity', W - pad - 50, capY - 4);
    ctx.fillStyle = mute; ctx.textAlign = 'center';
    for (let i = 0; i < N; i++) ctx.fillText('E' + (i + 1), pad + i * binW + binW / 2, base + 14);

    const dropPct = (100 * totalDrops / T).toFixed(0);
    readout.innerHTML =
      `capacity / expert: <b>${cap}</b> tokens<br>` +
      `dropped: <span class="${totalDrops > 0 ? 'bad' : 'ok'}">${totalDrops} (${dropPct}%)</span> &nbsp;` +
      `empty slots: <b>${wasted}</b><br>` +
      `<span class="hint">${CF < 1 ? 'tight buffers → drops' : CF > 1.6 ? 'roomy buffers → wasted compute' : 'balance drops against waste'}</span>`;
    frame++;
    if (frame > (T + 30) * 1.2) frame = 0;
  }
  slider.addEventListener('input', () => { frame = 0; });
  (function loop() { draw(); requestAnimationFrame(loop); })();
})();

/* =====================================================================
 * Widget 5: routing-modes — token-choice vs expert-choice
 * ===================================================================== */
(function routingModes() {
  const host = document.getElementById('routing-modes');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rmCanvas"></canvas>
      <div class="controls">
        <div class="toggle-row" id="rmMode">
          <button class="btn active" data-m="token">token-choice</button>
          <button class="btn" data-m="expert">expert-choice</button>
        </div>
        <div class="readout" id="rmReadout"></div>
      </div>
    </div>`);

  const W = 440, H = 280;
  const cv = host.querySelector('#rmCanvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#rmReadout');
  const E = 6, Tn = 12, K = 2, CAP = 4;
  // affinity[token][expert]
  const aff = []; { const r = mulberry32(23); for (let t = 0; t < Tn; t++) { aff.push([]); for (let e = 0; e < E; e++) aff[t].push(r()); } }
  let mode = 'token';

  function compute() {
    const chosen = Array.from({ length: Tn }, () => new Array(E).fill(false));
    if (mode === 'token') {
      for (let t = 0; t < Tn; t++) {
        const order = Array.from({ length: E }, (_, e) => e).sort((a, b) => aff[t][b] - aff[t][a]);
        order.slice(0, K).forEach((e) => chosen[t][e] = true);
      }
    } else {
      for (let e = 0; e < E; e++) {
        const order = Array.from({ length: Tn }, (_, t) => t).sort((a, b) => aff[b][e] - aff[a][e]);
        order.slice(0, CAP).forEach((t) => chosen[t][e] = true);
      }
    }
    return chosen;
  }

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      green = '#5cb85c', rule = cssVar('--rule'), bad = '#e0533d', card = cssVar('--bg-card');
    ctx.clearRect(0, 0, W, H);
    const chosen = compute();
    const loadE = new Array(E).fill(0), loadT = new Array(Tn).fill(0);
    for (let t = 0; t < Tn; t++) for (let e = 0; e < E; e++) if (chosen[t][e]) { loadE[e]++; loadT[t]++; }

    const gx = 70, gy = 36, cw = (W - gx - 70) / Tn, ch = 26;
    ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = mute;
    ctx.fillText('tokens →', gx + Tn * cw / 2, 16);
    // grid
    for (let e = 0; e < E; e++) {
      ctx.textAlign = 'right'; ctx.fillStyle = mute; ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('E' + (e + 1), gx - 8, gy + e * ch + ch / 2 + 3);
      for (let t = 0; t < Tn; t++) {
        const x = gx + t * cw, y = gy + e * ch;
        // affinity background
        const a = aff[t][e];
        ctx.fillStyle = card; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, cw - 2, ch - 2, 3); ctx.fill();
        if (chosen[t][e]) {
          ctx.fillStyle = accent; ctx.globalAlpha = 0.35 + 0.55 * a;
          ctx.beginPath(); ctx.roundRect(x + 1, y + 1, cw - 2, ch - 2, 3); ctx.fill(); ctx.globalAlpha = 1;
          ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x + 1, y + 1, cw - 2, ch - 2, 3); ctx.stroke();
        }
      }
    }
    // per-expert load (right)
    const lx = gx + Tn * cw + 10;
    for (let e = 0; e < E; e++) {
      const over = mode === 'token' && loadE[e] > CAP;
      ctx.fillStyle = over ? bad : (mode === 'expert' ? green : mute);
      ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`${loadE[e]}${over ? '!' : ''}`, lx, gy + e * ch + ch / 2 + 3);
    }
    ctx.fillStyle = mute; ctx.textAlign = 'left'; ctx.fillText('load', lx, gy - 6);
    // per-token markers (bottom): unrouted in expert-choice
    let unrouted = 0;
    for (let t = 0; t < Tn; t++) {
      const x = gx + t * cw;
      if (loadT[t] === 0) { unrouted++; ctx.fillStyle = bad; ctx.beginPath(); ctx.arc(x + cw / 2, gy + E * ch + 10, 3, 0, 7); ctx.fill(); }
      else { ctx.fillStyle = rule; ctx.beginPath(); ctx.arc(x + cw / 2, gy + E * ch + 10, 2, 0, 7); ctx.fill(); }
    }

    const maxLoad = Math.max(...loadE);
    readout.innerHTML = mode === 'token'
      ? `<b>token-choice</b>: each token picks its top-${K} experts.<br>` +
        `loads uneven — busiest expert has <span class="bad">${maxLoad}</span> tokens (cap ${CAP}); <span class="bad">overload!</span><br>` +
        `<span class="hint">this is why you need a balancing loss</span>`
      : `<b>expert-choice</b>: each expert picks its top-${CAP} tokens.<br>` +
        `every expert gets exactly <span class="ok">${CAP}</span> — <span class="ok">balance is automatic</span><br>` +
        `but <span class="bad">${unrouted} token(s)</span> went unrouted (red).`;
  }

  host.querySelectorAll('#rmMode .btn').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('#rmMode .btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); mode = b.dataset.m; draw();
  }));
  draw();
})();
