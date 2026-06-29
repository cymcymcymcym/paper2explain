/* GPU crash course blog — interactive widgets. Plain JS / Canvas. No deps.
 *   1. lat-thru   latency vs throughput: a few fast lanes vs many slow lanes
 *   2. simt       a warp of 32 threads in lockstep; branch divergence serializes
 *   3. mem-hier   the memory hierarchy: size · bandwidth · latency, round-trip time
 *   4. roofline   arithmetic intensity vs attainable FLOP/s; memory- vs compute-bound
 *   5. fusion     separate kernels round-trip HBM each; fusion pays once
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
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function canvasXY(canvas, e, W, H) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  const cy = (e.touches ? e.touches[0].clientY : e.clientY);
  return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H];
}

/* =====================================================================
 * Widget 1: lat-thru — latency vs throughput
 * ===================================================================== */
(function latThru() {
  const host = document.getElementById('lat-thru');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="ltCanvas"></canvas>
      <div class="controls">
        <div class="toggle-row"><button class="btn" id="ltRun">▶ run the batch</button></div>
        <div class="readout" id="ltReadout"></div>
      </div>
    </div>`);
  const W = 440, H = 220;
  const cv = host.querySelector('#ltCanvas');
  const ctx = devicePx(cv, W, H);
  const runBtn = host.querySelector('#ltRun');
  const readout = host.querySelector('#ltReadout');
  const TASKS = 48;
  const cpuDone = (t) => Math.min(TASKS, 2 * Math.floor(t / 1.0));   // 2 lanes, 1.0/task
  const gpuDone = (t) => Math.min(TASKS, 16 * Math.floor(t / 3.0));  // 16 lanes, 3.0/task
  let t = 0, running = false;

  function row(y, label, done, col, mute, fg, rule) {
    ctx.fillStyle = mute; ctx.textAlign = 'right'; ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(label, 74, y + 16);
    const barX = 84, barW = W - barX - 38;
    ctx.fillStyle = rule; ctx.beginPath(); ctx.roundRect(barX, y, barW, 24, 4); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(barX, y, barW * done / TASKS, 24, 4); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`${done}/${TASKS}`, barX + barW + 5, y + 16);
  }
  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      data = '#5fa9ff', rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);
    const cd = cpuDone(t), gd = gpuDone(t);
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText(`time = ${t.toFixed(1)}`, 14, 18);
    ctx.fillText('48 identical tasks', W - 130, 18);
    row(58, 'CPU ×2', cd, data, mute, fg, rule);
    row(120, 'GPU ×16', gd, accent, mute, fg, rule);
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('few fast lanes', 84, 50);
    ctx.fillText('many slower lanes', 84, 112);
    readout.innerHTML =
      `<b>CPU</b> · 2 fast lanes<br>first task done @ 1.0, all @ 24.0<br>` +
      `<b>GPU</b> · 16 slow lanes<br>first task done @ 3.0, all @ <span class="ok">9.0</span><br>` +
      (cd >= TASKS && gd >= TASKS
        ? `<span class="ok">GPU cleared the batch 2.7× sooner</span>`
        : `<span class="hint">slower per task, far faster overall</span>`);
  }
  function loop() { if (running) { t += 0.18; if (t > 26) running = false; } draw(); requestAnimationFrame(loop); }
  runBtn.addEventListener('click', () => { t = 0; running = true; });
  loop();
})();

/* =====================================================================
 * Widget 2: simt — a warp of 32 threads; divergence serializes
 * ===================================================================== */
(function simt() {
  const host = document.getElementById('simt');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="siCanvas"></canvas>
      <div class="controls">
        <div class="toggle-row" id="siMode">
          <button class="btn active" data-d="0">uniform branch</button>
          <button class="btn" data-d="1">divergent branch</button>
        </div>
        <div class="readout" id="siReadout"></div>
      </div>
    </div>`);
  const W = 440, H = 250;
  const cv = host.querySelector('#siCanvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#siReadout');
  let diverge = false;

  function program() {
    if (!diverge) return [
      { l: 'LOAD a[i]', m: () => true },
      { l: 'MUL', m: () => true },
      { l: 'cmp  (all agree)', m: () => true },
      { l: 'y = f(x)', m: () => true },
      { l: 'y += b', m: () => true },
      { l: 'STORE', m: () => true },
    ];
    return [
      { l: 'LOAD a[i]', m: () => true },
      { l: 'MUL', m: () => true },
      { l: 'cmp  (threads split!)', m: () => true },
      { l: 'if-branch:  A1', m: (id) => id < 16 },
      { l: 'if-branch:  A2', m: (id) => id < 16 },
      { l: 'else-branch:  B1', m: (id) => id >= 16 },
      { l: 'STORE', m: () => true },
    ];
  }
  let step = 0, prog = program(), tAcc = 0;

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      rule = cssVar('--rule'), dim = cssVar('--bg-card');
    ctx.clearRect(0, 0, W, H);
    const cur = prog[step];
    ctx.fillStyle = fg; ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText(`step ${step + 1}/${prog.length}:  `, 14, 18);
    ctx.fillStyle = accent; ctx.fillText(cur.l, 120, 18);
    const cols = 8, rows = 4, gx = 14, gy = 32, cw = (W - 28) / cols, chh = 30;
    for (let id = 0; id < 32; id++) {
      const c = id % cols, r = Math.floor(id / cols), x = gx + c * cw, y = gy + r * (chh + 6);
      const on = cur.m(id);
      ctx.fillStyle = on ? accent : dim; ctx.globalAlpha = on ? 0.85 : 1;
      ctx.beginPath(); ctx.roundRect(x, y, cw - 5, chh, 4); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = on ? accent : rule; ctx.lineWidth = on ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(x, y, cw - 5, chh, 4); ctx.stroke();
    }
    ctx.fillStyle = mute; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('warp = 32 threads   (orange = active · gray = masked off)', 14, gy + rows * (chh + 6) + 12);

    let totalActive = 0;
    prog.forEach((p) => { for (let id = 0; id < 32; id++) if (p.m(id)) totalActive++; });
    const cycles = prog.length, util = 100 * totalActive / (cycles * 32);
    readout.innerHTML =
      `cycles: <b>${cycles}</b> &nbsp;·&nbsp; lane use: <b>${util.toFixed(0)}%</b><br>` +
      (diverge
        ? `<span class="bad">divergent</span>: the warp runs <em>both</em> paths, masking half each time — wasted lanes and extra cycles.`
        : `<span class="ok">uniform</span>: all 32 agree → one path, every lane busy.`);
  }
  function loop() { tAcc += 1; if (tAcc > 44) { tAcc = 0; step = (step + 1) % prog.length; } draw(); requestAnimationFrame(loop); }
  host.querySelectorAll('#siMode .btn').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('#siMode .btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); diverge = b.dataset.d === '1'; prog = program(); step = 0;
  }));
  loop();
})();

/* =====================================================================
 * Widget 3: mem-hier — click a level, watch the round-trip
 * ===================================================================== */
(function memHier() {
  const host = document.getElementById('mem-hier');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="mhCanvas"></canvas>
      <div class="controls">
        <div class="readout" id="mhReadout"></div>
        <p class="hint">Click a level to fetch a value from it — the trip time scales with latency.</p>
      </div>
    </div>`);
  const W = 440, H = 260;
  const cv = host.querySelector('#mhCanvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#mhReadout');
  const levels = [
    { name: 'Registers', size: '256 KB/SM', bw: 'instant', lat: 1, col: '#66bb6a' },
    { name: 'Shared / SRAM', size: '228 KB/SM', bw: '~tens of TB/s', lat: 25, col: '#5fa9ff' },
    { name: 'L2 cache', size: '50 MB', bw: '~7 TB/s', lat: 200, col: '#ffd166' },
    { name: 'HBM (global)', size: '80 GB', bw: '3.35 TB/s', lat: 500, col: '#ff9b6a' },
  ];
  let sel = 3, tripT = 0, tripping = false;
  const compY = 30, boxX = 196, boxW = W - boxX - 14, boxH = 34, boxGap = 13, boxY0 = 64;
  const boxY = (i) => boxY0 + i * (boxH + boxGap);

  function draw() {
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule'), accent = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('compute', 28, compY - 7);
    ctx.fillStyle = 'rgba(255,155,106,0.18)'; ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(24, compY, 120, 30, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = fg; ctx.font = '11px ui-monospace, monospace'; ctx.fillText('SM cores', 44, compY + 19);

    for (let i = 0; i < levels.length; i++) {
      const L = levels[i], y = boxY(i);
      ctx.globalAlpha = i === sel ? 0.30 : 1; ctx.fillStyle = i === sel ? L.col : cssVar('--bg-card');
      ctx.beginPath(); ctx.roundRect(boxX, y, boxW, boxH, 5); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = i === sel ? L.col : rule; ctx.lineWidth = i === sel ? 2 : 1;
      ctx.beginPath(); ctx.roundRect(boxX, y, boxW, boxH, 5); ctx.stroke();
      ctx.fillStyle = fg; ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillText(L.name, boxX + 8, y + 15);
      ctx.fillStyle = mute; ctx.font = '10px ui-monospace, monospace'; ctx.fillText(`${L.lat} cyc · ${L.size}`, boxX + 8, y + 28);
    }
    const sx = 144, sy = compY + 15, ty = boxY(sel) + boxH / 2, tx = boxX;
    ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    if (tripping) {
      const phase = tripT <= 1 ? tripT : 2 - tripT;
      const dx = sx + (tx - sx) * phase, dy = sy + (ty - sy) * phase;
      ctx.beginPath(); ctx.arc(dx, dy, 5, 0, 7); ctx.fillStyle = levels[sel].col; ctx.fill();
      ctx.fillStyle = mute; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left';
      ctx.fillText(`waiting ~${Math.round(levels[sel].lat * Math.min(1, tripT))} cycles`, 24, compY + 50);
    }
    const L = levels[sel];
    readout.innerHTML =
      `<b>${L.name}</b><br>size: ${L.size}<br>bandwidth: ${L.bw}<br>latency: <b>${L.lat} cycle${L.lat > 1 ? 's' : ''}</b><br>` +
      (L.lat >= 200 ? `<span class="bad">far — hundreds of cycles away</span>` : `<span class="ok">near — keep hot data here</span>`);
  }
  function loop() {
    if (tripping) {
      const dur = 0.3 + levels[sel].lat / 500 * 2.2;
      tripT += 2 / (dur * 60);
      if (tripT >= 2) { tripping = false; tripT = 0; }
    }
    draw(); requestAnimationFrame(loop);
  }
  cv.addEventListener('pointerdown', (e) => {
    const [px, py] = canvasXY(cv, e, W, H);
    for (let i = 0; i < levels.length; i++) {
      const y = boxY(i);
      if (px >= boxX && px <= boxX + boxW && py >= y && py <= y + boxH) { sel = i; tripT = 0; tripping = true; }
    }
  });
  draw(); loop();
})();

/* =====================================================================
 * Widget 4: roofline — arithmetic intensity vs attainable FLOP/s
 * ===================================================================== */
(function roofline() {
  const host = document.getElementById('roofline');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rfCanvas"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>arithmetic intensity = <span id="rfAIval">2.0</span> FLOP/byte</label>
          <input type="range" id="rfSlider" min="0" max="1" step="0.001" value="0.348"/>
        </div>
        <div class="ctl"><label>real ops (click)</label>
          <div class="toggle-row" id="rfOps">
            <button class="btn" data-ai="0.12">add</button>
            <button class="btn" data-ai="0.5">softmax</button>
            <button class="btn" data-ai="2.5">attention</button>
            <button class="btn" data-ai="200">FlashAttn</button>
            <button class="btn" data-ai="600">GEMM</button>
          </div>
        </div>
        <div class="readout" id="rfReadout"></div>
      </div>
    </div>`);
  const W = 440, H = 300;
  const cv = host.querySelector('#rfCanvas');
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#rfSlider');
  const aival = host.querySelector('#rfAIval');
  const readout = host.querySelector('#rfReadout');
  const PEAK = 990, BW = 3.35, RIDGE = PEAK / BW;            // ~295.5 FLOP/byte
  const AImin = 0.05, AImax = 2000, Pmin = 1, Pmax = 2000;
  const padL = 40, padR = 14, padT = 14, padB = 34, pw = W - padL - padR, ph = H - padT - padB;
  const lx = (ai) => padL + (Math.log10(ai) - Math.log10(AImin)) / (Math.log10(AImax) - Math.log10(AImin)) * pw;
  const ly = (p) => padT + (1 - (Math.log10(p) - Math.log10(Pmin)) / (Math.log10(Pmax) - Math.log10(Pmin))) * ph;
  const sToAI = (s) => AImin * Math.pow(AImax / AImin, s);
  const aiToS = (ai) => Math.log(ai / AImin) / Math.log(AImax / AImin);
  const fmtAI = (ai) => ai >= 10 ? ai.toFixed(0) : ai.toFixed(2);

  function draw() {
    const ai = sToAI(parseFloat(slider.value)); aival.textContent = fmtAI(ai);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule'), green = '#5cb85c', data = '#5fa9ff';
    ctx.clearRect(0, 0, W, H);
    // bound regions
    ctx.fillStyle = 'rgba(95,169,255,0.08)'; ctx.fillRect(padL, padT, lx(RIDGE) - padL, ph);
    ctx.fillStyle = 'rgba(102,187,106,0.08)'; ctx.fillRect(lx(RIDGE), padT, padL + pw - lx(RIDGE), ph);
    // grid + ticks
    ctx.strokeStyle = rule; ctx.fillStyle = mute; ctx.font = '9px ui-monospace, monospace'; ctx.lineWidth = 1;
    for (let e = -1; e <= 3; e++) {
      const a0 = Math.pow(10, e); if (a0 < AImin || a0 > AImax) continue; const x = lx(a0);
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.fillText('1e' + e, x, padT + ph + 12);
    }
    for (let e = 0; e <= 3; e++) {
      const p0 = Math.pow(10, e), y = ly(p0);
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.textAlign = 'right'; ctx.fillText(p0 + 'T', padL - 4, y + 3);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = mute; ctx.fillText('arithmetic intensity (FLOP/byte) →', padL + pw / 2, H - 4);
    // roofline
    ctx.strokeStyle = fg; ctx.lineWidth = 2.4; ctx.beginPath(); let first = true;
    for (let s = 0; s <= 1.0001; s += 0.008) {
      const a = sToAI(s), p = Math.min(PEAK, a * BW); if (p < Pmin) continue;
      const X = lx(a), Y = ly(p); first ? (ctx.moveTo(X, Y), first = false) : ctx.lineTo(X, Y);
    }
    ctx.stroke();
    // ridge + peak labels
    ctx.strokeStyle = mute; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx(RIDGE), ly(PEAK)); ctx.lineTo(lx(RIDGE), padT + ph); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = mute; ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.fillText('ridge ≈ 295', lx(RIDGE), ly(PEAK) - 5);
    ctx.textAlign = 'left'; ctx.fillText('peak 990 TFLOP/s', lx(RIDGE) + 6, ly(PEAK) + 11);
    ctx.fillStyle = data; ctx.textAlign = 'left'; ctx.fillText('memory-bound', padL + 6, padT + 12);
    ctx.fillStyle = green; ctx.textAlign = 'right'; ctx.fillText('compute-bound', padL + pw - 4, padT + 12);
    // current point
    const perf = Math.min(PEAK, ai * BW), X = lx(ai), Y = ly(perf), bound = ai < RIDGE;
    ctx.beginPath(); ctx.arc(X, Y, 6, 0, 7); ctx.fillStyle = bound ? data : green; ctx.fill();
    ctx.strokeStyle = fg; ctx.lineWidth = 1.5; ctx.stroke();
    const pct = 100 * perf / PEAK;
    readout.innerHTML =
      `intensity: <b>${fmtAI(ai)}</b> FLOP/byte<br>` +
      `attainable: <b>${perf < 10 ? perf.toFixed(1) : perf.toFixed(0)} TFLOP/s</b> (${pct < 1 ? pct.toFixed(2) : pct.toFixed(0)}% of peak)<br>` +
      (bound ? `<span class="bad">memory-bound</span> → move less data` : `<span class="ok">compute-bound</span> → feed the tensor cores`);
  }
  cv.addEventListener('pointerdown', (e) => {
    const [px] = canvasXY(cv, e, W, H);
    const frac = Math.max(0, Math.min(1, (px - padL) / pw));
    const ai = Math.pow(10, Math.log10(AImin) + frac * (Math.log10(AImax) - Math.log10(AImin)));
    slider.value = aiToS(ai);
    host.querySelectorAll('#rfOps .btn').forEach((x) => x.classList.remove('active'));
    draw();
  });
  host.querySelectorAll('#rfOps .btn').forEach((b) => b.addEventListener('click', () => {
    slider.value = aiToS(parseFloat(b.dataset.ai));
    host.querySelectorAll('#rfOps .btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); draw();
  }));
  slider.addEventListener('input', () => { host.querySelectorAll('#rfOps .btn').forEach((x) => x.classList.remove('active')); draw(); });
  draw();
})();

/* =====================================================================
 * Widget 5: fusion — separate kernels vs one fused kernel
 * ===================================================================== */
(function fusion() {
  const host = document.getElementById('fusion');
  if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="fuCanvas"></canvas>
      <div class="controls">
        <div class="toggle-row" id="fuMode">
          <button class="btn" data-f="0">separate kernels</button>
          <button class="btn active" data-f="1">fused</button>
        </div>
        <div class="ctl"><label>ops in the chain = <span id="fuNval">3</span></label>
          <input type="range" id="fuN" min="2" max="6" step="1" value="3"/></div>
        <div class="readout" id="fuReadout"></div>
      </div>
    </div>`);
  const W = 440, H = 240;
  const cv = host.querySelector('#fuCanvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#fuReadout');
  const sN = host.querySelector('#fuN'), nval = host.querySelector('#fuNval');
  let fused = true;
  const SIZE = 32; // MB per tensor

  function arrow(x1, y1, x2, y2, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 7 * Math.cos(a - 0.4), y2 - 7 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 7 * Math.cos(a + 0.4), y2 - 7 * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }
  function draw() {
    const N = parseInt(sN.value, 10); nval.textContent = N;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'),
      rule = cssVar('--rule'), green = '#5cb85c', data = '#5fa9ff', red = '#e0533d';
    ctx.clearRect(0, 0, W, H);
    const hbmY = H - 42;
    ctx.fillStyle = 'rgba(95,169,255,0.12)'; ctx.strokeStyle = data; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(14, hbmY, W - 28, 26, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = data; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillText('HBM (global memory)', 22, hbmY + 17);

    const opY = 74, opH = 40, gx = 18, gw = (W - 36) / N;
    for (let i = 0; i < N; i++) {
      const x = gx + i * gw + 4;
      ctx.fillStyle = 'rgba(255,155,106,0.16)'; ctx.strokeStyle = accent; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.roundRect(x, opY, gw - 8, opH, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = fg; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText('op' + (i + 1), x + (gw - 8) / 2, opY + 24);
    }
    if (!fused) {
      for (let i = 0; i < N; i++) {
        const cx = gx + i * gw + 4 + (gw - 8) / 2;
        arrow(cx - 9, hbmY, cx - 9, opY + opH, green);   // read up
        arrow(cx + 9, opY + opH, cx + 9, hbmY, red);      // write down
      }
    } else {
      const firstcx = gx + 4 + (gw - 8) / 2, lastcx = gx + (N - 1) * gw + 4 + (gw - 8) / 2;
      arrow(firstcx, hbmY, firstcx, opY + opH, green);
      arrow(lastcx, opY + opH, lastcx, hbmY, red);
      for (let i = 0; i < N - 1; i++) {
        const x1 = gx + i * gw + 4 + (gw - 8), x2 = gx + (i + 1) * gw + 4;
        arrow(x1, opY + opH / 2, x2, opY + opH / 2, mute);
      }
      ctx.fillStyle = mute; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText('intermediates stay in registers / SRAM', W / 2, opY - 8);
    }
    ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = green; ctx.fillText('● read', 16, 18); ctx.fillStyle = red; ctx.fillText('● write', 70, 18);

    const unf = 2 * N * SIZE, fus = 2 * SIZE, cur = fused ? fus : unf;
    readout.innerHTML =
      `HBM traffic now: <b>${cur} MB</b><br>` +
      `separate: ${unf} MB &nbsp;·&nbsp; fused: ${fus} MB<br>` +
      `<span class="ok">fusion moves ${(unf / fus).toFixed(0)}× less data</span> for the same math`;
  }
  host.querySelectorAll('#fuMode .btn').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('#fuMode .btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); fused = b.dataset.f === '1'; draw();
  }));
  sN.addEventListener('input', draw);
  draw();
})();
