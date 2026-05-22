/* Normalization blog — interactive widgets. Plain JS / Canvas. No deps. */

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
    window.dispatchEvent(new Event('themechange'));
  });
})();

/* ---------- shared canvas helpers ---------- */
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
function evtPos(e, canvas, logicalW, logicalH) {
  const r = canvas.getBoundingClientRect();
  const src = (e.touches && e.touches[0]) ? e.touches[0] : e;
  return {
    x: (src.clientX - r.left) * (logicalW / r.width),
    y: (src.clientY - r.top) * (logicalH / r.height),
  };
}
const BLUE = '#5fa9ff', GREEN = '#4fb286', YELLOW = '#e0a93b', PINK = '#d6597a', PURPLE = '#9b6dd6';

/* =====================================================================
 * Widget 1: THE NORMALIZATION CUBE
 * A batch of activations drawn as a fanned deck of N sheets, each a
 * C x (H·W) grid. Pick a norm; the pooled cells light up — drawn as an
 * overlay on top, so a back-sheet region is never hidden by a front one.
 * Single-example norms light the front sheet; BatchNorm spans every sheet.
 * ===================================================================== */
(function cubeWidget() {
  const host = document.getElementById('cube-widget');
  if (!host) return;

  const N = 4, C = 6, S = 4;          // examples, channels, spatial positions
  const CELL = 18, DX = 46, DY = 28;  // cell size, per-sheet fan offset
  const HC = 2, GROUP = 3;            // highlighted channel; GroupNorm group size
  const W = 470, H = 380;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="cubeCv" width="470" height="380"></canvas></div>
      <div class="controls">
        <div class="picker">
          <button class="btn active" data-m="batch">BatchNorm</button>
          <button class="btn" data-m="layer">LayerNorm</button>
          <button class="btn" data-m="instance">InstanceNorm</button>
          <button class="btn" data-m="group">GroupNorm</button>
        </div>
        <div class="readout" id="cubeRead"></div>
        <p class="hint">It is the same tensor every time — only the grouping changes.
          Spatial positions H·W are always pooled. BatchNorm is the one method whose
          pile reaches across examples.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#cubeCv');
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#cubeRead');
  const modeBtns = [...host.querySelectorAll('.picker .btn[data-m]')];
  let mode = 'batch';

  // single-example norms light the FRONT sheet (n = N-1); BatchNorm spans all
  function highlighted(n, c, s) {
    if (mode === 'batch')    return c === HC;
    if (mode === 'layer')    return n === N - 1;
    if (mode === 'instance') return n === N - 1 && c === HC;
    if (mode === 'group')    return n === N - 1 && c < GROUP;
    return false;
  }

  function draw() {
    const bgCard = cssVar('--bg-card') || '#1f2128';
    const bgElev = cssVar('--bg-elev') || '#1a1c22';
    const fgMute = cssVar('--fg-mute') || '#999';
    const rule = cssVar('--rule') || '#2c2e36';
    const accent = cssVar('--accent') || '#ff9b6a';
    const muted = lerpColor(bgCard, fgMute, 0.30);

    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    const blockW = S * CELL + (N - 1) * DX;
    const blockH = C * CELL + (N - 1) * DY;
    const bx = (W - blockW) / 2;
    const by = (H - blockH) / 2 + 12;
    const sheetX = n => bx + n * DX;
    const sheetY = n => by + n * DY;

    // pass 1 — the muted tensor, back sheet first
    for (let n = 0; n < N; n++) {
      const ox = sheetX(n), oy = sheetY(n);
      ctx.globalAlpha = 0.6 + 0.4 * (n / (N - 1));
      ctx.fillStyle = bgElev;
      ctx.fillRect(ox - 1, oy - 1, S * CELL + 2, C * CELL + 2);
      for (let c = 0; c < C; c++) {
        for (let s = 0; s < S; s++) {
          ctx.fillStyle = muted;
          ctx.fillRect(ox + s * CELL, oy + c * CELL, CELL - 1.5, CELL - 1.5);
        }
      }
      ctx.strokeStyle = rule;
      ctx.lineWidth = 1;
      ctx.strokeRect(ox - 1, oy - 1, S * CELL + 2, C * CELL + 2);
    }
    ctx.globalAlpha = 1;

    // pass 2 — the pooled region, drawn on top of every sheet
    for (let n = 0; n < N; n++) {
      const ox = sheetX(n), oy = sheetY(n);
      for (let c = 0; c < C; c++) {
        for (let s = 0; s < S; s++) {
          if (!highlighted(n, c, s)) continue;
          ctx.fillStyle = accent;
          ctx.fillRect(ox + s * CELL, oy + c * CELL, CELL - 1.5, CELL - 1.5);
        }
      }
    }

    // axis labels
    ctx.fillStyle = fgMute;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('N — batch', bx + blockW - 58, by - 7);
    const fx = sheetX(N - 1), fy = sheetY(N - 1);
    ctx.save();
    ctx.translate(fx - 11, fy + C * CELL / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('C — channels', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillText('H·W — space', fx + 2, fy + C * CELL + 16);
  }

  const DESC = {
    batch: `BatchNorm · one channel, pooled across all ${N} examples and\n`
      + `${S} positions → ${N * S} cells share one (μ, σ). One (μ,σ) per channel.`,
    layer: `LayerNorm · one example, pooled across all ${C} channels and\n`
      + `${S} positions → ${C * S} cells share one (μ, σ). One (μ,σ) per example.`,
    instance: `InstanceNorm · one (example, channel), pooled across ${S}\n`
      + `positions → ${S} cells. One (μ,σ) per (example, channel).`,
    group: `GroupNorm · one example, a group of ${GROUP} channels, ${S}\n`
      + `positions → ${GROUP * S} cells. One (μ,σ) per (example, group).`,
  };
  function refresh() { draw(); read.textContent = DESC[mode]; }

  modeBtns.forEach(b => b.addEventListener('click', () => {
    modeBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    mode = b.dataset.m;
    refresh();
  }));
  window.addEventListener('themechange', draw);
  refresh();
})();

/* =====================================================================
 * Widget 2: BATCHNORM'S FRAGILE STATISTICS
 * View A — error vs batch size (BN cliff vs flat GN).
 * View B — the train/eval gap: batch Gaussian vs running-average Gaussian.
 * ===================================================================== */
(function bnStatsWidget() {
  const host = document.getElementById('bn-stats-widget');
  if (!host) return;

  const SIZES = [2, 4, 8, 16, 32, 64, 128, 256];
  // ResNet-50 / ImageNet error (%). bs 2..32 are the Wu & He (2018) numbers.
  const BN_ERR = { 2: 34.7, 4: 27.3, 8: 24.8, 16: 23.7, 32: 23.6, 64: 23.5, 128: 23.7, 256: 24.2 };
  const GN_FLAT = 24.1;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="bnCv" width="540" height="320"></canvas></div>
      <div class="controls">
        <div class="picker">
          <button class="btn active" data-v="cliff">the batch-size cliff</button>
          <button class="btn" data-v="gap">train vs. eval gap</button>
        </div>
        <div>
          <label class="ctl-label">batch size per device</label>
          <input type="range" id="bnSlider" min="0" max="7" step="1" value="2"/>
        </div>
        <div class="picker"><button class="btn" id="bnResample">↻ resample the batch</button></div>
        <div class="readout" id="bnRead"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#bnCv');
  const ctx = devicePx(cv, 540, 320);
  const slider = host.querySelector('#bnSlider');
  const read = host.querySelector('#bnRead');
  const resampleBtn = host.querySelector('#bnResample');
  const vBtns = [...host.querySelectorAll('.picker .btn[data-v]')];
  let view = 'cliff';
  let batchSeed = 0;

  const W = 540, H = 320;

  function bs() { return SIZES[parseInt(slider.value)]; }

  // deterministic pseudo-random from seed
  function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = s * 16807 % 2147483647) / 2147483647; }

  function drawCliff() {
    const bgCard = cssVar('--bg-card'), fg = cssVar('--fg'), fgMute = cssVar('--fg-mute');
    const rule = cssVar('--rule'), accent = cssVar('--accent');
    const padL = 52, padR = 96, padT = 26, padB = 48;
    ctx.fillStyle = bgCard; ctx.fillRect(0, 0, W, H);

    const eMin = 22, eMax = 36;
    const px = i => padL + i / (SIZES.length - 1) * (W - padL - padR);
    const py = e => H - padB - (e - eMin) / (eMax - eMin) * (H - padT - padB);

    ctx.font = '11px ui-monospace, monospace';
    ctx.strokeStyle = rule; ctx.fillStyle = fgMute;
    for (let e = 22; e <= 36; e += 2) {
      ctx.globalAlpha = 0.4; ctx.beginPath();
      ctx.moveTo(padL, py(e)); ctx.lineTo(W - padR, py(e)); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillText(e + '%', padL - 32, py(e) + 4);
    }
    ctx.strokeStyle = rule; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB); ctx.stroke();
    SIZES.forEach((s, i) => ctx.fillText(String(s), px(i) - 7, H - padB + 17));
    ctx.fillText('batch size →', W / 2 - 70, H - 10);
    ctx.save(); ctx.translate(14, H / 2 + 36); ctx.rotate(-Math.PI / 2);
    ctx.fillText('ImageNet error (↓ better)', 0, 0); ctx.restore();

    const cur = parseInt(slider.value);
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.3; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px(cur), padT); ctx.lineTo(px(cur), H - padB); ctx.stroke();
    ctx.globalAlpha = 1;

    // GroupNorm — flat
    ctx.strokeStyle = BLUE; ctx.lineWidth = 2.6; ctx.beginPath();
    SIZES.forEach((s, i) => { const x = px(i), y = py(GN_FLAT); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    // BatchNorm — the cliff
    ctx.strokeStyle = accent; ctx.lineWidth = 2.6; ctx.beginPath();
    SIZES.forEach((s, i) => { const x = px(i), y = py(BN_ERR[s]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    SIZES.forEach((s, i) => {
      ctx.fillStyle = accent; ctx.beginPath();
      ctx.arc(px(i), py(BN_ERR[s]), i === cur ? 6 : 3.5, 0, 7); ctx.fill();
      ctx.fillStyle = BLUE; ctx.beginPath();
      ctx.arc(px(i), py(GN_FLAT), i === cur ? 6 : 3.5, 0, 7); ctx.fill();
    });
    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillStyle = accent; ctx.fillText('BatchNorm', W - padR + 8, py(BN_ERR[256]) - 2);
    ctx.fillStyle = BLUE; ctx.fillText('GroupNorm', W - padR + 8, py(GN_FLAT) + 14);
  }

  function drawGap() {
    const bgCard = cssVar('--bg-card'), fg = cssVar('--fg'), fgMute = cssVar('--fg-mute');
    const rule = cssVar('--rule'), accent = cssVar('--accent');
    const padL = 40, padR = 24, padT = 30, padB = 52;
    ctx.fillStyle = bgCard; ctx.fillRect(0, 0, W, H);

    const xMin = -3.6, xMax = 3.6;
    const px = v => padL + (v - xMin) / (xMax - xMin) * (W - padL - padR);
    const baseY = H - padB;
    const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));

    // batch estimate: noisier the smaller the batch
    const r = rng(batchSeed * 131 + parseInt(slider.value) + 1);
    const noise = 1.7 / Math.sqrt(bs());
    const mB = (r() - 0.5) * 2 * noise;
    const sB = 1 + (r() - 0.5) * 1.6 * noise;

    ctx.strokeStyle = rule; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(padL, baseY); ctx.lineTo(W - padR, baseY); ctx.stroke();
    ctx.fillStyle = fgMute; ctx.font = '11px ui-monospace, monospace';
    for (let v = -3; v <= 3; v++) { ctx.fillText(String(v), px(v) - 3, baseY + 16); }
    ctx.fillText('activation value for one channel →', W / 2 - 110, H - 12);

    const amp = H - padT - padB - 8;
    function curve(m, s, color, fill) {
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const v = xMin + (xMax - xMin) * i / 240;
        const y = baseY - gauss(v, m, s) * amp;
        i ? ctx.lineTo(px(v), y) : ctx.moveTo(px(v), y);
      }
      if (fill) { ctx.lineTo(px(xMax), baseY); ctx.lineTo(px(xMin), baseY);
        ctx.globalAlpha = 0.16; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px(m), baseY); ctx.lineTo(px(m), baseY - amp * 1.04); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    curve(0, 1, accent, true);     // running average — stable
    curve(mB, sB, BLUE, true);     // this batch — jittery

    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillStyle = accent; ctx.fillText('running avg (used at eval)', padL + 6, padT + 4);
    ctx.fillStyle = BLUE; ctx.fillText('this batch (used in training)', padL + 6, padT + 20);
    return { mB, sB };
  }

  function refresh() {
    let gap = null;
    if (view === 'cliff') drawCliff(); else gap = drawGap();
    resampleBtn.style.display = view === 'gap' ? '' : 'none';
    if (view === 'cliff') {
      const s = bs();
      read.textContent = `batch = ${s}  ·  BatchNorm error ${BN_ERR[s].toFixed(1)}%`
        + `  ·  GroupNorm ${GN_FLAT}%\n`
        + (s <= 8 ? '→ tiny batch: BN statistics are noisy — off the cliff.'
                  : s >= 64 ? '→ large batch: BN is in its comfort zone.'
                  : '→ mid batch: BN holding, but watch the small end.');
    } else {
      const d = Math.abs(gap.mB).toFixed(2);
      read.textContent = `batch = ${bs()}  ·  mean gap |Δμ| ≈ ${d}\n`
        + (bs() <= 8 ? '→ small batch: training and eval normalize the same input very differently.'
                     : '→ large batch: the batch estimate sits close to the running average.');
    }
  }

  vBtns.forEach(b => b.addEventListener('click', () => {
    vBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active'); view = b.dataset.v; refresh();
  }));
  slider.addEventListener('input', refresh);
  resampleBtn.addEventListener('click', () => { batchSeed++; refresh(); });
  window.addEventListener('themechange', refresh);
  refresh();
})();

/* =====================================================================
 * Widget 3: LAYERNORM vs RMSNORM, GEOMETRICALLY
 * Drag a 2-D input. LayerNorm = recenter onto the zero-mean line, then
 * project to the circle. RMSNorm = project to the circle directly.
 * ===================================================================== */
(function rmsGeomWidget() {
  const host = document.getElementById('rms-geom-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="rmsCv" width="380" height="380"></canvas></div>
      <div class="controls">
        <div class="readout" id="rmsRead"></div>
        <p class="hint">Drag the orange dot. <span style="color:${BLUE}">LayerNorm</span> slides
          the input onto the zero-mean line, then onto the circle.
          <span style="color:${GREEN}">RMSNorm</span> skips the slide. They part company most
          when the input points along the all-ones direction.</p>
        <div class="picker"><button class="btn" id="rmsReset">↻ reset input</button></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#rmsCv');
  const ctx = devicePx(cv, 380, 380);
  const read = host.querySelector('#rmsRead');
  const CX = 190, CY = 190, U = 58, R = 1.55;  // px centre, px-per-unit, circle radius (units)

  let x = { a: 1.7, b: -0.4 };
  const toPx = p => ({ x: CX + p.a * U, y: CY - p.b * U });

  function draw() {
    const bgCard = cssVar('--bg-card'), fg = cssVar('--fg'), fgMute = cssVar('--fg-mute');
    const rule = cssVar('--rule'), accent = cssVar('--accent');
    ctx.fillStyle = bgCard; ctx.fillRect(0, 0, 380, 380);

    // axes
    ctx.strokeStyle = rule; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(20, CY); ctx.lineTo(360, CY);
    ctx.moveTo(CX, 20); ctx.lineTo(CX, 360); ctx.stroke();
    ctx.globalAlpha = 1;

    // all-ones direction (constant vectors): a = b  →  screen bottom-left ↔ top-right
    ctx.strokeStyle = fgMute; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CX - 150, CY + 150); ctx.lineTo(CX + 150, CY - 150); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = fgMute; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('all-ones direction', CX + 26, CY - 130);

    // zero-mean line: a = -b  →  screen top-left ↔ bottom-right
    ctx.strokeStyle = lerpColor(bgCard, BLUE, 0.55); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(CX - 150, CY - 150); ctx.lineTo(CX + 150, CY + 150); ctx.stroke();
    ctx.fillStyle = lerpColor(bgCard, BLUE, 0.8);
    ctx.fillText('zero-mean line', CX - 148, CY - 156);

    // circle (target shell)
    ctx.strokeStyle = fgMute; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(CX, CY, R * U, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;

    // compute outputs
    const m = (x.a + x.b) / 2;
    const cen = { a: x.a - m, b: x.b - m };
    const cenN = Math.hypot(cen.a, cen.b);
    const xN = Math.hypot(x.a, x.b);
    const ln = cenN < 1e-4 ? { a: 0, b: 0, collapsed: true }
      : { a: cen.a / cenN * R, b: cen.b / cenN * R, collapsed: false };
    const rms = xN < 1e-4 ? { a: 0, b: 0 } : { a: x.a / xN * R, b: x.b / xN * R };

    const pIn = toPx(x), pLN = toPx(ln), pRMS = toPx(rms);

    // connector lines from origin
    function ray(p, color) {
      ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.globalAlpha = 1;
    }
    ray(pRMS, GREEN); ray(pLN, BLUE);

    // dots
    function dot(p, color, r, label) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      if (label) { ctx.fillStyle = color; ctx.font = '600 12px ui-monospace, monospace';
        ctx.fillText(label, p.x + 9, p.y - 8); }
    }
    if (!ln.collapsed) dot(pLN, BLUE, 6, 'LayerNorm');
    else { ctx.fillStyle = BLUE; ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillText('LayerNorm → 0 (collapsed)', CX + 10, CY + 18); }
    dot(pRMS, GREEN, 6, 'RMSNorm');
    dot(pIn, accent, 7.5, 'input x');

    return { m, ln, rms, dist: ln.collapsed ? R : Math.hypot(ln.a - rms.a, ln.b - rms.b) };
  }

  function refresh() {
    const o = draw();
    const agree = Math.max(0, 100 * (1 - o.dist / (2 * R)));
    read.textContent = `x = (${x.a.toFixed(2)}, ${x.b.toFixed(2)})   mean(x) = ${o.m.toFixed(2)}\n`
      + `output gap = ${o.dist.toFixed(2)}   ·   agreement ≈ ${agree.toFixed(0)}%\n`
      + (Math.abs(o.m) < 0.25 ? '→ input already near zero-mean: the two norms agree.'
         : '→ input has a large mean component: recentering changes the answer.');
  }

  let dragging = false;
  function pick(e) {
    const p = evtPos(e, cv, 380, 380);
    const pIn = toPx(x);
    if (Math.hypot(p.x - pIn.x, p.y - pIn.y) < 22) dragging = true;
  }
  function move(e) {
    if (!dragging) return;
    e.preventDefault();
    const p = evtPos(e, cv, 380, 380);
    x.a = Math.max(-2.7, Math.min(2.7, (p.x - CX) / U));
    x.b = Math.max(-2.7, Math.min(2.7, (CY - p.y) / U));
    refresh();
  }
  function drop() { dragging = false; }
  cv.addEventListener('mousedown', pick);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', drop);
  cv.addEventListener('touchstart', pick, { passive: true });
  cv.addEventListener('touchmove', move, { passive: false });
  cv.addEventListener('touchend', drop);
  host.querySelector('#rmsReset').addEventListener('click', () => { x = { a: 1.7, b: -0.4 }; refresh(); });
  window.addEventListener('themechange', refresh);
  refresh();
})();

/* =====================================================================
 * Widget 4: CONDITIONAL NORMALIZATION
 * A conditioning signal feeds an MLP that emits per-channel γ and β.
 * Watch the normalized features get repainted.
 * ===================================================================== */
(function condNormWidget() {
  const host = document.getElementById('cond-norm-widget');
  if (!host) return;

  const CH = 6;
  const XHAT = [0.9, -0.7, 1.1, -0.4, 0.6, -1.0];   // fixed standardized features

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="condCv" width="540" height="300"></canvas></div>
      <div class="controls">
        <div class="slider-block">
          <label class="ctl-label">conditioning signal c</label>
          <input type="range" id="condSlider" min="0" max="100" step="1" value="22"/>
        </div>
        <div class="readout" id="condRead"></div>
        <p class="hint">A class label, a text prompt, a diffusion timestep — the condition feeds
          a small MLP that predicts γ and β. The <em>normalize</em> step never changes; only the
          affine correction is now data-dependent.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#condCv');
  const ctx = devicePx(cv, 540, 300);
  const slider = host.querySelector('#condSlider');
  const read = host.querySelector('#condRead');
  const W = 540, H = 300;

  // smooth pseudo-MLP: condition c ∈ [0,1] → γ, β per channel
  function gammaBeta(c) {
    const g = [], b = [];
    for (let i = 0; i < CH; i++) {
      g.push(1 + 0.75 * Math.sin(2 * Math.PI * c + i * 1.05));
      b.push(0.85 * Math.sin(2 * Math.PI * c * 1.3 + i * 0.7 + 1));
    }
    return { g, b };
  }

  function draw() {
    const bgCard = cssVar('--bg-card'), fg = cssVar('--fg'), fgMute = cssVar('--fg-mute');
    const rule = cssVar('--rule'), accent = cssVar('--accent'), bgElev = cssVar('--bg-elev');
    ctx.fillStyle = bgCard; ctx.fillRect(0, 0, W, H);

    const c = parseInt(slider.value) / 100;
    const { g, b } = gammaBeta(c);

    // ---- left: condition → MLP glyph ----
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = fgMute;
    ctx.fillText('condition c', 24, 40);
    // condition bar
    ctx.fillStyle = rule; ctx.fillRect(24, 48, 96, 12);
    ctx.fillStyle = accent; ctx.fillRect(24, 48, 96 * c, 12);
    // MLP box
    ctx.strokeStyle = fgMute; ctx.lineWidth = 1.4;
    ctx.strokeRect(36, 96, 72, 48);
    ctx.fillStyle = fg; ctx.font = '600 13px var(--sans), sans-serif';
    ctx.fillText('MLP', 58, 124);
    // arrows
    ctx.strokeStyle = fgMute; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(72, 64); ctx.lineTo(72, 94); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(108, 120); ctx.lineTo(150, 120); ctx.stroke();
    ctx.fillStyle = fgMute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('→ γ, β', 116, 110);

    // ---- right: the channels ----
    const colX = 196, colW = (W - colX - 26) / CH;
    const rowGamma = 58, rowBeta = 104, rowOut = 250, barMax = 64;

    ctx.fillStyle = fgMute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('predicted γ (scale)', colX, rowGamma - 30);
    ctx.fillText('predicted β (shift)', colX, rowBeta - 30);
    ctx.fillText('output = γ · x̂ + β', colX, 150);

    for (let i = 0; i < CH; i++) {
      const cx = colX + i * colW + colW / 2;
      // gamma chip
      const gv = g[i];
      ctx.fillStyle = lerpColor(cssVar('--bg-elev'), accent, Math.min(1, gv / 2));
      ctx.fillRect(colX + i * colW + 3, rowGamma - 12, colW - 6, 18);
      ctx.fillStyle = fg; ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(gv.toFixed(2), cx - 12, rowGamma + 1);
      // beta chip
      const bv = b[i];
      ctx.fillStyle = lerpColor(cssVar('--bg-elev'), BLUE, Math.min(1, Math.abs(bv)));
      ctx.fillRect(colX + i * colW + 3, rowBeta - 12, colW - 6, 18);
      ctx.fillStyle = fg;
      ctx.fillText(bv.toFixed(2), cx - 12, rowBeta + 1);
    }

    // output bars (and faint input ghost)
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(colX, rowOut); ctx.lineTo(W - 22, rowOut); ctx.stroke();
    for (let i = 0; i < CH; i++) {
      const x0 = colX + i * colW + 5, bw = colW - 10;
      const inV = XHAT[i], outV = g[i] * XHAT[i] + b[i];
      // ghost input
      ctx.strokeStyle = fgMute; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
      ctx.strokeRect(x0, rowOut - Math.max(0, inV) * barMax * 0.5,
        bw, Math.abs(inV) * barMax * 0.5);
      ctx.globalAlpha = 1;
      // output bar
      const hgt = outV * barMax * 0.5;
      ctx.fillStyle = outV >= 0 ? accent : BLUE;
      ctx.fillRect(x0, hgt >= 0 ? rowOut - hgt : rowOut, bw, Math.abs(hgt));
      ctx.fillStyle = fgMute; ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('c' + (i + 1), x0 + bw / 2 - 6, rowOut + 14);
    }
    ctx.fillStyle = fgMute; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('outline = normalized input x̂', colX, H - 8);
  }

  function refresh() {
    draw();
    const c = parseInt(slider.value) / 100;
    read.textContent = `c = ${c.toFixed(2)}  →  MLP emits a fresh (γ, β) for all ${CH} channels.\n`
      + 'Same normalized x̂ every time — the condition repaints it.';
  }
  slider.addEventListener('input', refresh);
  window.addEventListener('themechange', draw);
  refresh();
})();

/* =====================================================================
 * Widget 5: PRE-NORM vs POST-NORM
 * Gradient magnitude across a deep residual stack at initialization.
 * Post-LN blows up near the output; Pre-LN stays flat.
 * ===================================================================== */
(function prePostWidget() {
  const host = document.getElementById('prepost-widget');
  if (!host) return;

  const L = 36;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap"><canvas id="ppCv" width="540" height="340"></canvas></div>
      <div class="controls">
        <div class="picker">
          <button class="btn active" data-p="pre">Pre-LN</button>
          <button class="btn" data-p="post">Post-LN</button>
        </div>
        <div class="slider-block">
          <label class="ctl-label">inspect layer</label>
          <input type="range" id="ppSlider" min="1" max="${L}" step="1" value="${L}"/>
        </div>
        <div class="readout" id="ppRead"></div>
        <p class="hint">Solid = gradient magnitude at initialization. Dashed = forward
          activation magnitude. Even gradients across depth mean stable training.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#ppCv');
  const ctx = devicePx(cv, 540, 340);
  const slider = host.querySelector('#ppSlider');
  const read = host.querySelector('#ppRead');
  const pBtns = [...host.querySelectorAll('.picker .btn[data-p]')];
  let placement = 'pre';
  const W = 540, H = 340;

  // gradient & activation magnitude as a function of (layer, placement)
  function grad(l, p) {
    const t = l / L;
    return p === 'post' ? 0.05 * (1 + 55 * Math.pow(t, 2.2))
                        : 0.92 + 0.16 * Math.sin(l * 0.7);
  }
  function act(l, p) {
    const t = l / L;
    return p === 'post' ? 0.95 + 0.12 * Math.sin(l * 0.5)
                        : 0.6 + 1.7 * Math.sqrt(t);
  }

  function draw() {
    const bgCard = cssVar('--bg-card'), fg = cssVar('--fg'), fgMute = cssVar('--fg-mute');
    const rule = cssVar('--rule'), accent = cssVar('--accent');
    const padL = 50, padR = 22, padT = 28, padB = 50;
    ctx.fillStyle = bgCard; ctx.fillRect(0, 0, W, H);

    const yMax = 3.2;
    const px = l => padL + (l - 1) / (L - 1) * (W - padL - padR);
    const py = v => H - padB - Math.min(v, yMax) / yMax * (H - padT - padB);

    ctx.font = '11px ui-monospace, monospace';
    ctx.strokeStyle = rule; ctx.fillStyle = fgMute;
    for (let v = 0; v <= 3; v++) {
      ctx.globalAlpha = 0.4; ctx.beginPath();
      ctx.moveTo(padL, py(v)); ctx.lineTo(W - padR, py(v)); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillText(v + '×', padL - 26, py(v) + 4);
    }
    ctx.strokeStyle = rule; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB); ctx.stroke();
    ctx.fillStyle = fgMute;
    ctx.fillText('input', padL - 4, H - padB + 17);
    ctx.fillText('layer depth →', W / 2 - 40, H - padB + 17);
    ctx.fillText('output', W - padR - 36, H - padB + 17);
    ctx.save(); ctx.translate(14, H / 2 + 30); ctx.rotate(-Math.PI / 2);
    ctx.fillText('magnitude (relative)', 0, 0); ctx.restore();

    const cur = parseInt(slider.value);
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.28; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px(cur), padT); ctx.lineTo(px(cur), H - padB); ctx.stroke();
    ctx.globalAlpha = 1;

    // activation — dashed faint
    ctx.strokeStyle = BLUE; ctx.lineWidth = 1.8; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let l = 1; l <= L; l++) { const x = px(l), y = py(act(l, placement)); l === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.setLineDash([]);
    // gradient — solid
    ctx.strokeStyle = accent; ctx.lineWidth = 2.8;
    ctx.beginPath();
    for (let l = 1; l <= L; l++) { const x = px(l), y = py(grad(l, placement)); l === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();

    // markers at inspected layer
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(px(cur), py(grad(cur, placement)), 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(px(cur), py(act(cur, placement)), 5, 0, 7); ctx.fill();

    ctx.font = '600 12px ui-monospace, monospace';
    ctx.fillStyle = accent; ctx.fillText('gradient', W - padR - 70, padT + 6);
    ctx.fillStyle = BLUE; ctx.fillText('activation', W - padR - 78, padT + 22);
  }

  function refresh() {
    draw();
    const cur = parseInt(slider.value);
    let gmin = Infinity, gmax = -Infinity;
    for (let l = 1; l <= L; l++) {
      const g = grad(l, placement);
      if (g < gmin) gmin = g;
      if (g > gmax) gmax = g;
    }
    if (placement === 'post') {
      const ratio = grad(L, 'post') / grad(1, 'post');
      read.textContent = `Post-LN · layer ${cur}: gradient ${grad(cur,'post').toFixed(2)}×\n`
        + `the output-layer gradient is ${ratio.toFixed(0)}× the input-layer gradient.\n`
        + '→ badly scaled at init — needs learning-rate warmup.';
    } else {
      read.textContent = `Pre-LN · layer ${cur}: gradient ${grad(cur,'pre').toFixed(2)}×\n`
        + `gradient stays within ${(gmax/gmin).toFixed(1)}× across all ${L} layers.\n`
        + '→ well-scaled — warmup optional, stacks far deeper.';
    }
  }
  pBtns.forEach(b => b.addEventListener('click', () => {
    pBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active'); placement = b.dataset.p; refresh();
  }));
  slider.addEventListener('input', refresh);
  window.addEventListener('themechange', draw);
  refresh();
})();
