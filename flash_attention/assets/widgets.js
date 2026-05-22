/* FlashAttention blog interactive widgets. Plain JS / Canvas. No deps. */

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
    window.dispatchEvent(new Event('theme-changed'));
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

const C_HBM     = '#ff5d6c';
const C_SRAM    = '#39d28a';
const C_REG     = '#5fa9ff';
const C_ACCENT  = '#ff9b6a';
const C_MUTE    = '#888';

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
function fmtTime(seconds) {
  if (seconds < 1e-6) return `${(seconds * 1e9).toFixed(1)} ns`;
  if (seconds < 1e-3) return `${(seconds * 1e6).toFixed(2)} µs`;
  if (seconds < 1) return `${(seconds * 1e3).toFixed(2)} ms`;
  return `${seconds.toFixed(2)} s`;
}

/* =====================================================================
 * Widget 1: MEMORY HIERARCHY EXPLORER
 * Slider for data size. Show transfer time at HBM vs SRAM vs Registers
 * bandwidths on A100.
 * ===================================================================== */
(function memoryHierarchy() {
  const host = document.getElementById('memory-hierarchy');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="mhCanvas"></canvas>
      <div class="controls">
        <div class="fa-slider-row">
          <label>data size to move <span class="val" id="mhSizeLab">1 MB</span></label>
          <input type="range" id="mhSize" min="0" max="9" step="1" value="5"/>
        </div>
        <div class="readout" id="mhReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#mhCanvas');
  const W = 520, H = 330;
  const ctx = devicePx(cv, W, H);
  const slSize = host.querySelector('#mhSize');
  const labSize = host.querySelector('#mhSizeLab');
  const readout = host.querySelector('#mhReadout');

  // A100 numbers
  const TIERS = [
    { name: 'Registers', sizeBytes: 64 * 1024,                bwBytes: 80e12,   color: C_REG,
      sub: '64 KB / SM, ~80 TB/s' },
    { name: 'SRAM',      sizeBytes: 192 * 1024,               bwBytes: 19e12,   color: C_SRAM,
      sub: '192 KB / SM, ~19 TB/s' },
    { name: 'HBM',       sizeBytes: 40 * 1024 * 1024 * 1024,  bwBytes: 1.5e12,  color: C_HBM,
      sub: '40 GB total, ~1.5 TB/s' },
  ];

  // log-scale data sizes
  const SIZES = [
    1024,             // 1 KB
    4 * 1024,         // 4 KB
    16 * 1024,        // 16 KB
    64 * 1024,        // 64 KB
    256 * 1024,       // 256 KB
    1024 * 1024,      // 1 MB
    16 * 1024 * 1024, // 16 MB
    256 * 1024 * 1024,// 256 MB
    1024 * 1024 * 1024, // 1 GB
    16 * 1024 * 1024 * 1024, // 16 GB
  ];

  function draw() {
    const idx = parseInt(slSize.value, 10);
    const sz = SIZES[idx];
    labSize.textContent = fmtBytes(sz);
    ctx.clearRect(0, 0, W, H);

    const fg = cssVar('--fg') || '#1b1b1f';
    const fgMute = cssVar('--fg-mute') || '#5a5a64';

    // Title
    ctx.fillStyle = fg;
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('time to move data on A100', 22, 22);

    // Draw a vertical stack: Registers (top, smallest) → SRAM → HBM (bottom, biggest)
    const layoutX = 22;
    const layoutW = W - 44;
    const startY = 50;
    const rowH = 80;

    TIERS.forEach((tier, i) => {
      const y = startY + i * (rowH + 12);
      // size box width proportional to log size of tier
      const fits = sz <= tier.sizeBytes;
      const timeSec = sz / tier.bwBytes;

      // tier name + sub
      ctx.fillStyle = tier.color;
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(tier.name, layoutX, y - 4);
      ctx.fillStyle = fgMute;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(tier.sub, layoutX + 80, y - 4);

      // bar background
      ctx.fillStyle = cssVar('--bg-card') || '#f1f0eb';
      ctx.fillRect(layoutX, y, layoutW, rowH - 14);
      ctx.strokeStyle = tier.color + '88'; ctx.lineWidth = 1.2;
      ctx.strokeRect(layoutX, y, layoutW, rowH - 14);

      if (!fits) {
        // Doesn't fit — show striped overlay
        ctx.fillStyle = tier.color + '22';
        ctx.fillRect(layoutX, y, layoutW, rowH - 14);
        ctx.fillStyle = tier.color;
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`✗ does not fit (${fmtBytes(tier.sizeBytes)} max)`, layoutX + layoutW / 2, y + (rowH - 14) / 2 + 4);
      } else {
        // Draw a "fill" bar proportional to time (log-scaled)
        const maxLogTime = Math.log10(SIZES[SIZES.length - 1] / TIERS[2].bwBytes);
        const minLogTime = Math.log10(SIZES[0] / TIERS[0].bwBytes);
        const t = (Math.log10(timeSec) - minLogTime) / (maxLogTime - minLogTime);
        const barW = Math.max(8, t * layoutW);
        ctx.fillStyle = tier.color;
        ctx.fillRect(layoutX, y, barW, rowH - 14);

        ctx.fillStyle = fg;
        ctx.font = 'bold 14px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(fmtTime(timeSec), layoutX + barW + 8, y + (rowH - 14) / 2 + 4);
      }
    });

    // Readout
    const tHbm = sz / TIERS[2].bwBytes;
    const tSram = sz / TIERS[1].bwBytes;
    const speedup = tHbm / tSram;
    const sramFits = sz <= TIERS[1].sizeBytes;
    readout.innerHTML = `
      <div>moving <b>${fmtBytes(sz)}</b>:</div>
      <div>HBM  → <b>${fmtTime(tHbm)}</b></div>
      <div>SRAM → <b>${sramFits ? fmtTime(tSram) : '<span style="color:'+C_HBM+'">won\'t fit</span>'}</b></div>
      ${sramFits ? `<div style="margin-top:6px;">SRAM is <b style="color:${C_SRAM}">${speedup.toFixed(1)}× faster</b></div>` : ''}
      <div style="margin-top:6px;font-size:12px;color:var(--fg-mute);line-height:1.4;">
        Try moving 32 KB — both fit, SRAM wins. Try 16 MB — only HBM has room. This is why FlashAttention tiles attention into ~64×64 blocks.
      </div>
    `;
  }
  slSize.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: ARITHMETIC INTENSITY CALCULATOR
 * Picker for op. Show AI and roofline classification on A100.
 * ===================================================================== */
(function arithIntensity() {
  const host = document.getElementById('arith-intensity-widget');
  if (!host) return;

  const OPS = [
    { name: 'Element-wise (ReLU)', flops: 1, bytes: 8, desc: 'Read 4 bytes, write 4 bytes, 1 FLOP.' },
    { name: 'Softmax (row of 1024)', flops: 5 * 1024, bytes: 2 * 4 * 1024, desc: 'Read row, compute max/sum/normalize, write row. ~5 FLOPs per element.' },
    { name: 'Attention (N=1024, d=64) standard', flops: 4 * 1024 * 1024 * 64, bytes: 4 * (1024 * 1024 + 2 * 1024 * 64), desc: 'QK^T + softmax + PV. N^2 intermediate matrix dominates bytes.' },
    { name: 'Attention (N=1024, d=64) FlashAttention', flops: 4 * 1024 * 1024 * 64 * 1.13, bytes: 4 * (3 * 1024 * 64 + 1024 * 64), desc: '13% more FLOPs but only loads Q, K, V, O — no N×N intermediate.' },
    { name: 'Matmul (1024 × 1024 × 1024)', flops: 2 * 1024 * 1024 * 1024, bytes: 4 * 3 * 1024 * 1024, desc: 'Each loaded element is reused 1024 times — high AI.' },
    { name: 'Layer norm (row of 1024)', flops: 5 * 1024, bytes: 4 * 2 * 1024, desc: 'Read row, compute mean/var/normalize, write row. AI ≈ 0.6.' },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="aiCanvas"></canvas>
      <div class="controls">
        <div class="fa-slider-row">
          <label>operation <span class="val" id="aiOpLab">${OPS[2].name}</span></label>
          <input type="range" id="aiOp" min="0" max="${OPS.length - 1}" step="1" value="2"/>
        </div>
        <div class="readout" id="aiReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#aiCanvas');
  const W = 520, H = 320;
  const ctx = devicePx(cv, W, H);
  const slOp = host.querySelector('#aiOp');
  const labOp = host.querySelector('#aiOpLab');
  const readout = host.querySelector('#aiReadout');

  // A100 FP32: 19.5 TFLOPs, FP16/BF16: 312 TFLOPs (tensor cores)
  // HBM: 1.5 TB/s
  // Break-even AI for FP16: 312 / 1.5 ≈ 208 FLOPs/byte
  const PEAK_FLOPS = 312e12;
  const PEAK_BW = 1.5e12;
  const RIDGE_AI = PEAK_FLOPS / PEAK_BW; // ≈ 208

  function draw() {
    const idx = parseInt(slOp.value, 10);
    const op = OPS[idx];
    labOp.textContent = op.name;
    const ai = op.flops / op.bytes;
    const isCompute = ai >= RIDGE_AI;
    ctx.clearRect(0, 0, W, H);

    const padL = 56, padR = 18, padT = 18, padB = 40;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const log10 = Math.log10 || (x => Math.log(x) / Math.LN10);
    const xMin = log10(0.05), xMax = log10(10000);
    const yMin = log10(0.5e12), yMax = log10(500e12);
    const xMap = lg => padL + ((lg - xMin) / (xMax - xMin)) * plotW;
    const yMap = lp => padT + (1 - (lp - yMin) / (yMax - yMin)) * plotH;

    const fg = cssVar('--fg') || '#1b1b1f';
    const fgMute = cssVar('--fg-mute') || '#5a5a64';

    // grid
    ctx.strokeStyle = cssVar('--rule') || '#e6e4dd'; ctx.lineWidth = 1;
    for (const v of [0.1, 1, 10, 100, 1000]) {
      const x = xMap(log10(v));
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    for (const v of [1e12, 1e13, 1e14]) {
      const y = yMap(log10(v));
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    // axes
    ctx.strokeStyle = fgMute; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();

    // Roofline: bw line (y = AI * bw, sloped up) intersects compute line (y = peak)
    // Memory bound region: y < min(AI * BW, PEAK)
    // Draw two segments: bandwidth-limited (slope) and compute-limited (horizontal)
    ctx.strokeStyle = C_HBM; ctx.lineWidth = 2.5;
    ctx.beginPath();
    // bandwidth-limited segment: from x_min to AI = RIDGE
    {
      const lg1 = xMin, lg2 = log10(RIDGE_AI);
      const v1 = Math.pow(10, lg1) * PEAK_BW;
      const v2 = Math.pow(10, lg2) * PEAK_BW;
      ctx.moveTo(xMap(lg1), yMap(log10(v1)));
      ctx.lineTo(xMap(lg2), yMap(log10(v2)));
    }
    ctx.stroke();
    ctx.strokeStyle = C_SRAM; ctx.lineWidth = 2.5;
    ctx.beginPath();
    // compute-limited segment: horizontal at PEAK
    ctx.moveTo(xMap(log10(RIDGE_AI)), yMap(log10(PEAK_FLOPS)));
    ctx.lineTo(xMap(xMax), yMap(log10(PEAK_FLOPS)));
    ctx.stroke();

    // tick labels
    ctx.fillStyle = fgMute; ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (const v of [0.1, 1, 10, 100, 1000]) {
      ctx.fillText(`${v}`, xMap(log10(v)), padT + plotH + 14);
    }
    ctx.textAlign = 'right';
    for (const v of [1e12, 1e13, 1e14]) {
      ctx.fillText(`${(v / 1e12).toFixed(0)}T`, padL - 6, yMap(log10(v)) + 4);
    }
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('arithmetic intensity (FLOPs/byte, log)', padL + plotW / 2, H - 8);
    ctx.save();
    ctx.translate(16, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('attainable TFLOPs/s ↑', 0, 0);
    ctx.restore();

    // Ridge label
    ctx.fillStyle = C_ACCENT;
    ctx.setLineDash([3, 3]); ctx.strokeStyle = C_ACCENT; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xMap(log10(RIDGE_AI)), padT);
    ctx.lineTo(xMap(log10(RIDGE_AI)), padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('break-even ≈ 208', xMap(log10(RIDGE_AI)) - 4, padT + 12);

    // region labels
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillStyle = C_HBM;
    ctx.textAlign = 'center';
    ctx.fillText('MEMORY-BOUND', xMap(log10(2)), padT + 20);
    ctx.fillStyle = C_SRAM;
    ctx.fillText('COMPUTE-BOUND', xMap(log10(2000)), padT + 20);

    // The op as a dot
    const opThroughput = Math.min(PEAK_FLOPS, ai * PEAK_BW);
    const ox = xMap(log10(Math.max(0.05, Math.min(10000, ai))));
    const oy = yMap(log10(opThroughput));
    ctx.fillStyle = C_ACCENT;
    ctx.beginPath(); ctx.arc(ox, oy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = fg; ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`AI = ${ai.toFixed(1)}`, ox + 14, oy + 3);

    // Readout
    const cls = isCompute ? 'compute' : 'memory';
    const text = isCompute ? '✅ compute-bound' : '⚠ memory-bound';
    readout.innerHTML = `
      <div>FLOPs = <b>${(op.flops / 1e9).toFixed(2)} G</b></div>
      <div>bytes = <b>${fmtBytes(op.bytes)}</b></div>
      <div>AI    = <b style="color:${C_ACCENT}">${ai.toFixed(1)}</b> FLOPs/byte</div>
      <div style="margin-top:6px;">status: <span class="fa-pill ${cls}">${text}</span></div>
      <div style="margin-top:6px;font-size:12px;color:var(--fg-mute);line-height:1.4;">${op.desc}</div>
    `;
  }
  slOp.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: TILING VISUALIZER
 * Toggle Standard vs FlashAttention. Animate the data flow.
 * ===================================================================== */
(function tilingViz() {
  const host = document.getElementById('tiling-viz');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="tvCanvas"></canvas>
      <div class="controls">
        <div class="fa-step-buttons">
          <button class="btn active" data-mode="std">Standard</button>
          <button class="btn" data-mode="fa">FlashAttention</button>
        </div>
        <div class="fa-step-buttons">
          <button class="btn" id="tvPlay">▶ play</button>
          <button class="btn" id="tvReset">⟲ reset</button>
        </div>
        <div class="readout" id="tvReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#tvCanvas');
  const W = 520, H = 360;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#tvReadout');
  const buttons = host.querySelectorAll('[data-mode]');
  const playBtn = host.querySelector('#tvPlay');
  const resetBtn = host.querySelector('#tvReset');

  let mode = 'std'; // 'std' or 'fa'
  let step = 0;     // animation step
  let raf = null;
  let playing = false;

  // Standard steps: 0 = idle, 1 = load Q,K, 2 = compute S full, 3 = softmax to P full, 4 = compute O
  // FlashAttention steps: 0 = idle, 1-4 = process tile 1, 5-8 = tile 2, etc., 16 = done

  function setMode(m) {
    mode = m;
    step = 0;
    stop();
    buttons.forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    draw();
  }
  function stop() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }
  function play() {
    if (playing) { stop(); return; }
    playing = true;
    const total = mode === 'std' ? 4 : 16;
    let last = performance.now();
    const tick = (now) => {
      if (!playing) return;
      if (now - last > (mode === 'std' ? 700 : 250)) {
        step = (step + 1);
        if (step > total) step = 0;
        last = now;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function drawBox(x, y, w, h, color, fillOp, label, sub) {
    ctx.fillStyle = color + Math.floor(fillOp * 255).toString(16).padStart(2, '0');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.strokeRect(x, y, w, h);
    if (label) {
      ctx.fillStyle = cssVar('--fg') || '#1b1b1f';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, y + h / 2 + 3);
    }
    if (sub) {
      ctx.fillStyle = cssVar('--fg-mute') || '#888';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(sub, x + w / 2, y + h / 2 + 15);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg') || '#1b1b1f';
    const fgMute = cssVar('--fg-mute') || '#5a5a64';

    // Two zones: HBM (top), SRAM (bottom)
    const hbmY = 28, hbmH = 150;
    const sramY = 200, sramH = 130;

    // HBM zone background
    ctx.fillStyle = cssVar('--bg-card') || '#f1f0eb';
    ctx.fillRect(12, hbmY, W - 24, hbmH);
    ctx.strokeStyle = C_HBM; ctx.lineWidth = 1.5;
    ctx.strokeRect(12, hbmY, W - 24, hbmH);
    ctx.fillStyle = C_HBM;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HBM (slow, big)', 18, hbmY + 14);

    ctx.fillStyle = cssVar('--bg-card') || '#f1f0eb';
    ctx.fillRect(12, sramY, W - 24, sramH);
    ctx.strokeStyle = C_SRAM; ctx.lineWidth = 1.5;
    ctx.strokeRect(12, sramY, W - 24, sramH);
    ctx.fillStyle = C_SRAM;
    ctx.fillText('SRAM (fast, small)', 18, sramY + 14);

    // Total HBM bytes counter
    let hbmBytes = 0;

    if (mode === 'std') {
      // Standard: full Q, K, V, S, P, O in HBM
      // Step 0: Q, K, V always in HBM. Step 1: also S. Step 2: also P. Step 3: O.
      const baseX = 30;
      drawBox(baseX, hbmY + 28, 50, 70, C_REG, 0.4, 'Q', 'N×d');
      drawBox(baseX + 60, hbmY + 28, 50, 70, C_REG, 0.4, 'K', 'N×d');
      drawBox(baseX + 120, hbmY + 28, 50, 70, C_REG, 0.4, 'V', 'N×d');
      hbmBytes += 3 * 0.1; // arbitrary scale: 3 × Nd

      if (step >= 1) {
        drawBox(baseX + 200, hbmY + 28, 100, 90, C_HBM, 0.6, 'S = QKᵀ', 'N×N');
        hbmBytes += 1.0; // N×N is huge
      }
      if (step >= 2) {
        drawBox(baseX + 310, hbmY + 28, 100, 90, C_HBM, 0.6, 'P = softmax(S)', 'N×N');
        hbmBytes += 1.0;
      }
      if (step >= 3) {
        drawBox(baseX + 430, hbmY + 28, 50, 70, C_ACCENT, 0.6, 'O', 'N×d');
        hbmBytes += 0.1;
      }

      // SRAM: just shows current compute
      ctx.fillStyle = fgMute;
      ctx.font = '12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      if (step === 0) ctx.fillText('(idle)', W / 2, sramY + 70);
      else if (step === 1) ctx.fillText('matmul kernel: load Q, K → compute S → store S', W / 2, sramY + 70);
      else if (step === 2) ctx.fillText('softmax kernel: load S → compute P → store P', W / 2, sramY + 70);
      else if (step === 3) ctx.fillText('matmul kernel: load P, V → compute O → store O', W / 2, sramY + 70);
      else ctx.fillText('done — 3 round trips through HBM', W / 2, sramY + 70);

    } else {
      // FlashAttention: small tiles flow through SRAM. Q, K, V, O in HBM (sizes only).
      const baseX = 30;
      drawBox(baseX, hbmY + 28, 40, 60, C_REG, 0.4, 'Q', 'N×d');
      drawBox(baseX + 50, hbmY + 28, 40, 60, C_REG, 0.4, 'K', 'N×d');
      drawBox(baseX + 100, hbmY + 28, 40, 60, C_REG, 0.4, 'V', 'N×d');
      drawBox(baseX + 150, hbmY + 28, 40, 60, C_ACCENT, 0.4, 'O', 'N×d');
      drawBox(baseX + 210, hbmY + 28, 30, 60, C_SRAM, 0.4, 'm,ℓ', 'O(N)');
      hbmBytes = 0.4; // just inputs

      // SRAM tiles
      const tileSize = (step % 4); // 0 = idle, 1 = load Qi, Kj, Vj, 2 = compute Sij, 3 = update m, ℓ, O
      const tileIdx = Math.floor((step - 1) / 4);

      // Show 4 sub-stages for current tile
      const subStage = (step - 1) % 4 + 1;
      ctx.fillStyle = fgMute;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      if (step === 0) ctx.fillText('(idle — ready to begin)', W / 2, sramY + 70);
      else {
        // Draw a tile flowing
        const xtile = 80 + (tileIdx % 4) * 90;
        const ytile = sramY + 30;
        drawBox(xtile, ytile, 70, 50, C_SRAM, 0.5,
                subStage === 1 ? 'Qi, Kj' : subStage === 2 ? 'Sij' : subStage === 3 ? 'P̃ij' : 'O update',
                `tile ${tileIdx + 1}`);
        ctx.fillStyle = fg;
        ctx.font = 'bold 11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        let msg = '';
        if (subStage === 1) msg = 'load Q-block, K-block, V-block into SRAM';
        else if (subStage === 2) msg = 'compute tile of S in SRAM';
        else if (subStage === 3) msg = 'compute tile of P (rescaled exp) in SRAM';
        else msg = 'update O, m, ℓ in HBM — no S, no P written';
        ctx.fillText(msg, W / 2, sramY + sramH - 14);
      }
      if (step > 16) {
        ctx.fillStyle = C_SRAM;
        ctx.font = 'bold 13px ui-monospace, monospace';
        ctx.fillText('done — no N×N matrix ever materialized', W / 2, sramY + 70);
      }
    }

    // HBM traffic indicator (rough)
    ctx.fillStyle = fgMute;
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    const trafficLabel = mode === 'std' ? 'HBM traffic (N×N dominated)' : 'HBM traffic (~Nd only)';
    ctx.fillText(trafficLabel, W - 18, hbmY + 14);

    // Update readout
    if (mode === 'std') {
      readout.innerHTML = `
        <div><b>Standard attention</b></div>
        <div>step <b>${step}/3</b></div>
        <div style="margin-top:6px;font-size:12px;color:var(--fg-mute);line-height:1.45;">
          Each kernel reads/writes the full <b>N×N</b> matrix. Three round trips through HBM. Total HBM bytes ∝ <b>N²</b>.
        </div>
      `;
    } else {
      readout.innerHTML = `
        <div><b>FlashAttention</b></div>
        <div>tile <b>${Math.min(4, Math.floor((step - 1) / 4) + 1)}/4</b>, sub-step <b>${Math.max(1, (step - 1) % 4 + 1)}/4</b></div>
        <div style="margin-top:6px;font-size:12px;color:var(--fg-mute);line-height:1.45;">
          One fused kernel. Tiles flow through SRAM. Only Q, K, V, O, m, ℓ ever touch HBM. Total HBM bytes ∝ <b>Nd</b>.
        </div>
      `;
    }
  }

  buttons.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  playBtn.addEventListener('click', play);
  resetBtn.addEventListener('click', () => { stop(); step = 0; draw(); });

  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: ONLINE SOFTMAX STEPPER
 * Process a row of 8 attention scores in 4 chunks. Show m, ℓ, O update.
 * ===================================================================== */
(function onlineSoftmaxStepper() {
  const host = document.getElementById('online-softmax-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="osCanvas"></canvas>
      <div class="controls">
        <div class="fa-step-buttons">
          <button class="btn" id="osPrev">◀ prev</button>
          <button class="btn" id="osNext">next ▶</button>
          <button class="btn" id="osReset">⟲ reset</button>
        </div>
        <div class="readout" id="osReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#osCanvas');
  const W = 520, H = 330;
  const ctx = devicePx(cv, W, H);
  const prevBtn = host.querySelector('#osPrev');
  const nextBtn = host.querySelector('#osNext');
  const resetBtn = host.querySelector('#osReset');
  const readout = host.querySelector('#osReadout');

  // attention scores S_i, length 8, in 4 chunks of 2
  const SCORES = [1.2, 2.4, 0.3, 1.8, 3.7, 0.9, 2.1, 1.5];
  const V = [0.4, 1.1, 0.2, 0.7, 1.6, 0.3, 0.9, 0.6];
  const CHUNK = 2;
  let step = 0; // 0..4: how many chunks processed

  function computeRunning(nChunks) {
    let m = -Infinity, l = 0, O = 0;
    const history = [{ m, l, O, after: 0 }];
    for (let c = 0; c < nChunks; c++) {
      const chunk = SCORES.slice(c * CHUNK, (c + 1) * CHUNK);
      const chunkV = V.slice(c * CHUNK, (c + 1) * CHUNK);
      const cm = Math.max(...chunk);
      const newM = Math.max(m, cm);
      const rescale = m === -Infinity ? 0 : Math.exp(m - newM);
      const chunkExp = chunk.map(s => Math.exp(s - newM));
      const cSum = chunkExp.reduce((a, b) => a + b, 0);
      const cOnum = chunkExp.reduce((acc, e, i) => acc + e * chunkV[i], 0);
      const newL = rescale * l + cSum;
      const newOnum = rescale * O * l + cOnum;
      const newO = newL > 0 ? newOnum / newL : 0;
      m = newM; l = newL; O = newO;
      history.push({ m, l, O, after: c + 1 });
    }
    return history;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg') || '#1b1b1f';
    const fgMute = cssVar('--fg-mute') || '#5a5a64';

    // Draw the score row
    const cellW = 50, cellH = 40;
    const rowY = 32;
    const startX = (W - cellW * SCORES.length) / 2;
    ctx.fillStyle = fgMute;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('attention scores  S_i  (one row of 8)', W / 2, 18);

    for (let i = 0; i < SCORES.length; i++) {
      const x = startX + i * cellW;
      const inProcessed = i < step * CHUNK;
      const inCurrent = step > 0 && i >= (step - 1) * CHUNK && i < step * CHUNK;
      const color = inCurrent ? C_ACCENT : inProcessed ? C_REG : C_MUTE;
      const fillOp = inCurrent ? 0.45 : inProcessed ? 0.18 : 0.08;
      ctx.fillStyle = color + Math.floor(fillOp * 255).toString(16).padStart(2, '0');
      ctx.fillRect(x + 2, rowY, cellW - 4, cellH);
      ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 2, rowY, cellW - 4, cellH);
      ctx.fillStyle = inProcessed || inCurrent ? fg : fgMute;
      ctx.font = '14px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${SCORES[i].toFixed(1)}`, x + cellW / 2, rowY + cellH / 2 + 5);
    }

    // Chunk dividers
    ctx.strokeStyle = fgMute; ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (let c = 1; c < SCORES.length / CHUNK; c++) {
      const x = startX + c * CHUNK * cellW;
      ctx.beginPath(); ctx.moveTo(x, rowY - 4); ctx.lineTo(x, rowY + cellH + 4); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Get running state
    const hist = computeRunning(step);
    const cur = hist[hist.length - 1];

    // Running stats panel
    const panelY = 110;
    ctx.fillStyle = cssVar('--bg-card') || '#f1f0eb';
    ctx.fillRect(40, panelY, W - 80, 160);
    ctx.strokeStyle = fgMute; ctx.lineWidth = 1;
    ctx.strokeRect(40, panelY, W - 80, 160);
    ctx.fillStyle = fgMute;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`running stats after ${step} of 4 chunks:`, 56, panelY + 22);

    ctx.font = '16px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = C_ACCENT;
    ctx.fillText(`m  =  ${cur.m === -Infinity ? '-∞' : cur.m.toFixed(3)}`, 60, panelY + 60);
    ctx.fillStyle = C_SRAM;
    ctx.fillText(`ℓ  =  ${cur.l.toFixed(4)}`, 60, panelY + 90);
    ctx.fillStyle = C_HBM;
    ctx.fillText(`O  =  ${cur.O.toFixed(4)}`, 60, panelY + 120);
    ctx.fillStyle = fgMute;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('(running max)', 270, panelY + 60);
    ctx.fillText('(running sum of exp(s - m))', 270, panelY + 90);
    ctx.fillText('(running weighted output O · V)', 270, panelY + 120);

    if (step === 4) {
      ctx.fillStyle = C_SRAM;
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('= identical to one-shot softmax · V', W / 2, panelY + 150);
    }
  }

  function update() {
    prevBtn.disabled = step === 0;
    nextBtn.disabled = step === 4;
    const hist = computeRunning(step);
    const cur = hist[hist.length - 1];
    const next = step < 4 ? `chunk ${step + 1}: [${SCORES.slice(step * CHUNK, (step + 1) * CHUNK).join(', ')}]` : 'all done';
    readout.innerHTML = `
      <div>processed: <b>${step}/4</b> chunks</div>
      <div>next: <b>${next}</b></div>
      <div style="margin-top:6px;">m = <b>${cur.m === -Infinity ? '-∞' : cur.m.toFixed(3)}</b></div>
      <div>ℓ = <b>${cur.l.toFixed(4)}</b></div>
      <div>O = <b>${cur.O.toFixed(4)}</b></div>
      ${step === 4 ? `<div style="margin-top:6px;color:${C_SRAM};">✓ done — bit-identical to one-shot softmax</div>` : ''}
    `;
    draw();
  }

  prevBtn.addEventListener('click', () => { if (step > 0) { step--; update(); } });
  nextBtn.addEventListener('click', () => { if (step < 4) { step++; update(); } });
  resetBtn.addEventListener('click', () => { step = 0; update(); });
  window.addEventListener('theme-changed', draw);
  update();
})();

/* =====================================================================
 * Widget 5: SPEEDUP vs SEQUENCE LENGTH
 * Slider for N. Show HBM accesses (GB) and est runtime for standard vs FA.
 * ===================================================================== */
(function speedupWidget() {
  const host = document.getElementById('speedup-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="suCanvas"></canvas>
      <div class="controls">
        <div class="fa-slider-row">
          <label>sequence length N <span class="val" id="suNLab">2048</span></label>
          <input type="range" id="suN" min="7" max="15" step="1" value="11"/>
        </div>
        <div class="readout" id="suReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#suCanvas');
  const W = 520, H = 320;
  const ctx = devicePx(cv, W, H);
  const slN = host.querySelector('#suN');
  const labN = host.querySelector('#suNLab');
  const readout = host.querySelector('#suReadout');

  const d = 64, M = 100 * 1024; // SRAM ~100 KB
  const BW_HBM = 1.5e12; // bytes/sec
  const PEAK_FLOPS = 312e12;
  const BATCH = 16, HEADS = 16;
  const HBM_LIMIT = 40e9; // 40 GB HBM

  function calc(N) {
    // bytes per head per batch element
    // Standard: 3*N*d (inputs) + N^2 (S) + N^2 (P) + N^2 (read in PV) + N*d (out)
    // multiply by 2 for FP16 bytes
    const standardBytes = 2 * (3 * N * d + 3 * N * N + 2 * N * d) * BATCH * HEADS;
    // FA: ~2 * N^2 * d^2 / M (theoretical) — approximate
    const faBytes = 2 * (N * N * d * d / M + 4 * N * d) * BATCH * HEADS;
    const flops = 4 * N * N * d * BATCH * HEADS;

    // estimated wall-clock: max(bytes/BW, flops/peak)
    const tStd = Math.max(standardBytes / BW_HBM, flops / PEAK_FLOPS);
    const tFA = Math.max(faBytes / BW_HBM, flops / PEAK_FLOPS);

    // attention activations memory needed
    const stdMemory = 2 * N * N * BATCH * HEADS;
    const faMemory = 2 * N * d * BATCH * HEADS;
    return { N, standardBytes, faBytes, tStd, tFA, stdMemory, faMemory };
  }

  function draw() {
    const N = 1 << parseInt(slN.value, 10);
    labN.textContent = `${N}`;
    const r = calc(N);

    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg') || '#1b1b1f';
    const fgMute = cssVar('--fg-mute') || '#5a5a64';

    // Title
    ctx.fillStyle = fg;
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`attention forward pass: N=${N}, d=${d}, batch=${BATCH}, heads=${HEADS}`, 22, 22);

    // Two bar groups: HBM bytes, time
    const groups = [
      { label: 'HBM traffic',
        std: r.standardBytes, fa: r.faBytes,
        fmt: fmtBytes },
      { label: 'estimated time',
        std: r.tStd, fa: r.tFA,
        fmt: fmtTime },
      { label: 'attention activations memory',
        std: r.stdMemory, fa: r.faMemory,
        fmt: fmtBytes },
    ];

    const groupH = 86;
    const startY = 42;
    const padX = 22;
    const barAreaW = W - 220;

    groups.forEach((g, gi) => {
      const y0 = startY + gi * groupH;
      // group label
      ctx.fillStyle = fgMute;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(g.label, padX, y0 + 12);

      // bars
      const maxV = Math.max(g.std, g.fa);
      const stdW = (g.std / maxV) * barAreaW;
      const faW = (g.fa / maxV) * barAreaW;

      // standard bar
      ctx.fillStyle = C_HBM + 'cc';
      ctx.fillRect(padX, y0 + 20, stdW, 22);
      ctx.fillStyle = fg;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`standard  ${g.fmt(g.std)}`, padX + stdW + 6, y0 + 35);

      // FA bar
      ctx.fillStyle = C_SRAM + 'cc';
      ctx.fillRect(padX, y0 + 48, faW, 22);
      ctx.fillStyle = fg;
      ctx.fillText(`FlashAttn  ${g.fmt(g.fa)}`, padX + faW + 6, y0 + 63);

      // ratio
      const ratio = g.std / g.fa;
      ctx.fillStyle = C_ACCENT;
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${ratio.toFixed(1)}× less`, W - padX, y0 + 50);
    });

    // OOM warning if standard exceeds memory
    if (r.stdMemory > HBM_LIMIT) {
      ctx.fillStyle = C_HBM;
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`⚠ standard attention OOM at this N (${fmtBytes(r.stdMemory)} > 40 GB HBM)`, W / 2, H - 12);
    }

    // Readout
    const speedup = r.tStd / r.tFA;
    const memSave = r.stdMemory / r.faMemory;
    readout.innerHTML = `
      <div>N = <b>${N}</b></div>
      <div>HBM <b>${(r.standardBytes / r.faBytes).toFixed(1)}× less</b></div>
      <div>time <b>${speedup.toFixed(1)}× faster</b></div>
      <div>memory <b>${memSave.toFixed(1)}× less</b></div>
      ${r.stdMemory > HBM_LIMIT ?
        `<div style="margin-top:6px;color:${C_HBM};">standard attention OOMs; FlashAttention keeps going.</div>` :
        ''}
      <div style="margin-top:6px;font-size:11px;color:var(--fg-mute);line-height:1.4;">
        Estimates use A100: 1.5 TB/s HBM bandwidth, 312 TFLOPs/s tensor cores, 100 KB SRAM.
      </div>
    `;
  }

  slN.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();
