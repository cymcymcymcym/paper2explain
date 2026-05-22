/* DiT blog interactive widgets. Plain JS / Canvas. No deps. */

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

const TOKEN_BLUE  = '#5fa9ff';
const ACCENT_ORG  = '#ff9b6a';
const ADA_GREEN   = '#39d28a';
const RED_HOT     = '#ff5d6c';
const GREY_MUTE   = '#888';

/* DiT model data — params (M), Gflops, FID-50K at 400K iters (no cfg) */
const DIT_MODELS = [
  { name: 'S/8',  cfg: 'S',  p: 8, params: 33,  gflops: 0.36,   fid: 153.60 },
  { name: 'S/4',  cfg: 'S',  p: 4, params: 33,  gflops: 1.41,   fid: 100.41 },
  { name: 'S/2',  cfg: 'S',  p: 2, params: 33,  gflops: 6.06,   fid: 68.40 },
  { name: 'B/8',  cfg: 'B',  p: 8, params: 131, gflops: 1.42,   fid: 122.74 },
  { name: 'B/4',  cfg: 'B',  p: 4, params: 130, gflops: 5.56,   fid: 68.38 },
  { name: 'B/2',  cfg: 'B',  p: 2, params: 130, gflops: 23.01,  fid: 43.47 },
  { name: 'L/8',  cfg: 'L',  p: 8, params: 459, gflops: 5.01,   fid: 118.87 },
  { name: 'L/4',  cfg: 'L',  p: 4, params: 458, gflops: 19.70,  fid: 45.64 },
  { name: 'L/2',  cfg: 'L',  p: 2, params: 458, gflops: 80.71,  fid: 23.33 },
  { name: 'XL/8', cfg: 'XL', p: 8, params: 676, gflops: 7.39,   fid: 106.41 },
  { name: 'XL/4', cfg: 'XL', p: 4, params: 675, gflops: 29.05,  fid: 43.01 },
  { name: 'XL/2', cfg: 'XL', p: 2, params: 675, gflops: 118.64, fid: 19.47 },
];

/* =====================================================================
 * Widget 1: PATCHIFY EXPLORER
 * Drag patch size p → see token count, Gflops, FID for DiT-XL.
 * Visualizes 32x32 latent broken into patches at p ∈ {2, 4, 8}.
 * ===================================================================== */
(function patchifyExplorer() {
  const host = document.getElementById('patchify-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="pwCanvas"></canvas>
      <div class="controls">
        <div class="dit-slider-row">
          <label>patch size <span class="val" id="pwLabel">p = 2</span></label>
          <input type="range" id="pwSlider" min="0" max="2" step="1" value="2"/>
        </div>
        <div class="dit-slider-row">
          <label>model config <span class="val" id="pwCfgLabel">DiT-XL</span></label>
          <input type="range" id="pwCfg" min="0" max="3" step="1" value="3"/>
        </div>
        <div class="readout" id="pwReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#pwCanvas');
  const W = 520, H = 360;
  const ctx = devicePx(cv, W, H);
  const sl = host.querySelector('#pwSlider');
  const slCfg = host.querySelector('#pwCfg');
  const lab = host.querySelector('#pwLabel');
  const labCfg = host.querySelector('#pwCfgLabel');
  const readout = host.querySelector('#pwReadout');

  const PATCH_SIZES = [8, 4, 2];
  const CFGS = ['S', 'B', 'L', 'XL'];

  function lookup(cfg, p) {
    return DIT_MODELS.find(m => m.cfg === cfg && m.p === p);
  }

  function draw() {
    const p = PATCH_SIZES[parseInt(sl.value, 10)];
    const cfg = CFGS[parseInt(slCfg.value, 10)];
    const model = lookup(cfg, p);
    const T = (32 / p) * (32 / p);
    const gridN = 32 / p;

    ctx.clearRect(0, 0, W, H);

    // Draw 32x32 latent on the left, broken into gridN x gridN patches
    const titleH = 26;
    ctx.fillStyle = cssVar('--fg-mute') || '#5a5a64';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('noised latent  z  ∈ ℝ³²ˣ³²ˣ⁴', 22, 22);

    const latentSize = 240;
    const latentX = 30, latentY = titleH + 14;

    // background
    ctx.fillStyle = cssVar('--bg-elev') || '#ffffff';
    ctx.fillRect(latentX, latentY, latentSize, latentSize);
    ctx.strokeStyle = cssVar('--rule') || '#e6e4dd';
    ctx.lineWidth = 1;
    ctx.strokeRect(latentX, latentY, latentSize, latentSize);

    // patches
    const cell = latentSize / gridN;
    for (let i = 0; i < gridN; i++) {
      for (let j = 0; j < gridN; j++) {
        const x = latentX + j * cell;
        const y = latentY + i * cell;
        // hue based on position for visual variety
        const t = (i * gridN + j) / (gridN * gridN);
        const hue = 200 + Math.sin(t * 9.0) * 30;
        ctx.fillStyle = `hsla(${hue}, 60%, 65%, 0.35)`;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
    // grid lines on top
    ctx.strokeStyle = TOKEN_BLUE;
    ctx.lineWidth = gridN > 8 ? 0.6 : 1.2;
    for (let i = 0; i <= gridN; i++) {
      ctx.beginPath();
      ctx.moveTo(latentX, latentY + i * cell);
      ctx.lineTo(latentX + latentSize, latentY + i * cell);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(latentX + i * cell, latentY);
      ctx.lineTo(latentX + i * cell, latentY + latentSize);
      ctx.stroke();
    }

    // arrow to token sequence on the right
    const arrowX = latentX + latentSize + 20;
    const arrowY = latentY + latentSize / 2;
    ctx.strokeStyle = ACCENT_ORG; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX + 30, arrowY);
    ctx.stroke();
    // arrow head
    ctx.fillStyle = ACCENT_ORG;
    ctx.beginPath();
    ctx.moveTo(arrowX + 30, arrowY);
    ctx.lineTo(arrowX + 24, arrowY - 4);
    ctx.lineTo(arrowX + 24, arrowY + 4);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = ACCENT_ORG;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('patchify', arrowX + 15, arrowY - 10);
    ctx.fillText('+ pos emb', arrowX + 15, arrowY + 22);

    // token sequence (vertical stack on the right)
    const tokX = arrowX + 50;
    const tokY = latentY;
    const tokAreaH = latentSize;
    const maxShown = Math.min(T, 24);
    const tokH = tokAreaH / maxShown - 1;
    for (let i = 0; i < maxShown; i++) {
      ctx.fillStyle = `rgba(95, 169, 255, ${0.4 + 0.35 * (i / maxShown)})`;
      ctx.fillRect(tokX, tokY + i * (tokH + 1), 90, tokH);
    }
    if (T > maxShown) {
      ctx.fillStyle = cssVar('--fg-mute') || '#888';
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`… ${T - maxShown} more`, tokX + 45, tokY + tokAreaH + 12);
    }
    ctx.fillStyle = cssVar('--fg-mute') || '#5a5a64';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${T} tokens`, tokX + 45, tokY - 6);

    // Update labels
    lab.textContent = `p = ${p}`;
    labCfg.textContent = `DiT-${cfg}`;

    // readout
    let qualityClass = 'lo', qualityText = '😖 noisy samples';
    if (model.fid < 25) { qualityClass = 'win'; qualityText = '✅ great samples'; }
    else if (model.fid < 70) { qualityClass = 'mid'; qualityText = '🙂 decent samples'; }
    readout.innerHTML = `
      <div>tokens  T = <b>${T}</b></div>
      <div>params  ≈ <b>${model.params}M</b> (independent of p)</div>
      <div>Gflops  = <b style="color:${ACCENT_ORG}">${model.gflops}</b></div>
      <div>FID-50K = <b style="color:${RED_HOT}">${model.fid.toFixed(2)}</b></div>
      <div style="margin-top:6px;">quality: <span class="dit-pill ${qualityClass}">${qualityText}</span></div>
    `;
  }

  sl.addEventListener('input', draw);
  slCfg.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: BLOCK TOGGLE
 * Toggle between 4 conditioning strategies for DiT-XL/2.
 * Show a schematic block diagram for each + Gflops + FID at 400K.
 * ===================================================================== */
(function blockToggle() {
  const host = document.getElementById('block-toggle');
  if (!host) return;

  const BLOCKS = [
    {
      key: 'incontext',
      name: 'In-context',
      gflops: 119.4,
      fid: 35.24,
      desc: 't and c are extra tokens prepended to the image sequence; standard transformer block, no other change.',
    },
    {
      key: 'crossattn',
      name: 'Cross-attention',
      gflops: 137.6,
      fid: 26.14,
      desc: 'Add a cross-attention layer in each block that attends from image tokens to (t, c). +15% Gflops.',
    },
    {
      key: 'adaln',
      name: 'adaLN',
      gflops: 118.6,
      fid: 25.21,
      desc: 'Regress LayerNorm scale γ and shift β from MLP(t+c). Same transformation applied to every token.',
    },
    {
      key: 'adalnzero',
      name: 'adaLN-Zero',
      gflops: 118.6,
      fid: 19.47,
      desc: 'adaLN + an extra dimension-wise scale α before each residual connection; α is zero-initialized so each block starts as the identity function.',
    },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="bcCanvas"></canvas>
      <div class="controls">
        <div class="dit-pill-row" id="bcPicker">
          ${BLOCKS.map((b, i) => `<button class="btn${i === 3 ? ' active' : ''}" data-i="${i}">${b.name}</button>`).join('')}
        </div>
        <div class="readout" id="bcReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#bcCanvas');
  const W = 520, H = 360;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#bcReadout');
  const buttons = host.querySelectorAll('#bcPicker .btn');
  let active = 3; // adaLN-Zero by default

  function drawBox(x, y, w, h, color, label, sub) {
    ctx.fillStyle = color + '33';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = cssVar('--fg') || '#1b1b1f';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    if (sub) {
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = cssVar('--fg-mute') || '#888';
      ctx.fillText(sub, x + w / 2, y + h / 2 + 18);
    }
  }
  function drawArrow(x1, y1, x2, y2) {
    ctx.strokeStyle = cssVar('--fg-mute') || '#888';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillStyle = cssVar('--fg-mute') || '#888';
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save(); ctx.translate(x2, y2); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -3); ctx.lineTo(-7, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw() {
    const b = BLOCKS[active];
    ctx.clearRect(0, 0, W, H);

    // Title
    ctx.fillStyle = cssVar('--fg') || '#1b1b1f';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`block design: ${b.name}`, 22, 24);

    // Common: tokens in (left)
    drawBox(22, 60, 90, 36, TOKEN_BLUE, 'tokens', 'image patches');
    // common: conditioning in (top right)
    drawBox(380, 28, 110, 32, ACCENT_ORG, '(t, c)', '');

    if (b.key === 'incontext') {
      // Tokens + (t, c) as extra tokens → transformer block → tokens
      drawBox(170, 30, 130, 36, ACCENT_ORG, 'cond tokens', '+ 2 extra');
      drawArrow(112, 78, 165, 50);
      drawArrow(305, 48, 358, 78);
      drawBox(360, 60, 130, 36, GREY_MUTE, 'concat seq', '(T+2 tokens)');
      drawBox(170, 130, 200, 80, GREY_MUTE, 'standard transformer block', 'self-attn + MLP');
      drawArrow(425, 96, 280, 128);
      drawBox(380, 240, 110, 36, TOKEN_BLUE, 'tokens out', '');
      drawArrow(270, 212, 380, 240);
    } else if (b.key === 'crossattn') {
      drawArrow(112, 78, 175, 130);
      drawBox(170, 130, 200, 36, GREY_MUTE, 'self-attention', '');
      drawBox(170, 175, 200, 36, ACCENT_ORG, 'cross-attention', 'image tokens × (t,c)');
      drawArrow(435, 44, 370, 190);
      drawBox(170, 220, 200, 36, GREY_MUTE, 'MLP', '');
      drawArrow(270, 166, 270, 175);
      drawArrow(270, 211, 270, 220);
      drawBox(170, 280, 200, 36, TOKEN_BLUE, 'tokens out', '+15% Gflops');
      drawArrow(270, 256, 270, 280);
    } else {
      // adaLN / adaLN-Zero
      drawArrow(112, 78, 175, 130);
      drawBox(170, 130, 200, 36,
        b.key === 'adalnzero' ? ADA_GREEN : ACCENT_ORG,
        b.key === 'adalnzero' ? 'adaLN-Zero' : 'adaLN',
        'scale γ, shift β ← MLP(t+c)');
      drawArrow(435, 44, 370, 148);
      drawBox(170, 175, 200, 36, GREY_MUTE, 'self-attention', '');
      drawArrow(270, 166, 270, 175);
      if (b.key === 'adalnzero') {
        drawBox(170, 220, 200, 28, ADA_GREEN, 'α₁ ⊙ residual', 'α init = 0');
        drawArrow(270, 211, 270, 220);
        drawBox(170, 254, 200, 36, b.key === 'adalnzero' ? ADA_GREEN : ACCENT_ORG, b.key === 'adalnzero' ? 'adaLN-Zero' : 'adaLN', '');
        drawArrow(270, 248, 270, 254);
        drawBox(170, 295, 200, 28, GREY_MUTE, 'MLP', '');
        drawArrow(270, 290, 270, 295);
        // skip α2 to save space
      } else {
        drawBox(170, 220, 200, 36, ACCENT_ORG, 'adaLN', '');
        drawArrow(270, 211, 270, 220);
        drawBox(170, 265, 200, 36, GREY_MUTE, 'MLP', '');
        drawArrow(270, 256, 270, 265);
      }
      drawBox(380, b.key === 'adalnzero' ? 295 : 265, 110, 32, TOKEN_BLUE, 'tokens out', '');
      drawArrow(370, b.key === 'adalnzero' ? 310 : 282, 380, b.key === 'adalnzero' ? 310 : 282);
    }

    // Update active button styles
    buttons.forEach((bt, i) => {
      bt.classList.toggle('active', i === active);
    });

    // Readout
    let fidClass;
    if (b.fid < 22) fidClass = 'win';
    else if (b.fid < 28) fidClass = 'mid';
    else fidClass = 'lo';
    readout.innerHTML = `
      <div>Gflops  = <b>${b.gflops}</b></div>
      <div>FID-50K = <b style="color:${RED_HOT}">${b.fid.toFixed(2)}</b> <span class="dit-pill ${fidClass}" style="margin-left:6px;">${b.name}</span></div>
      <div style="margin-top:8px;font-size:12px;color:var(--fg-mute);line-height:1.5;">${b.desc}</div>
    `;
  }

  buttons.forEach(bt => bt.addEventListener('click', () => {
    active = parseInt(bt.dataset.i, 10);
    draw();
  }));
  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: BUBBLE PLOT
 * All 12 DiT models on Gflops (x, log) vs FID (y, log) axes.
 * Bubble size proportional to Gflops.
 * ===================================================================== */
(function bubblePlot() {
  const host = document.getElementById('bubble-plot');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="bpCanvas"></canvas>
      <div class="controls">
        <div class="readout" id="bpReadout"><div>hover or click a bubble to inspect a DiT config</div></div>
        <div style="font-family:var(--sans);font-size:12px;color:var(--fg-mute);line-height:1.5;">
          Each bubble is a DiT config trained for 400K iterations. <strong>X</strong> = forward-pass Gflops; <strong>Y</strong> = FID-50K. Bubble area ∝ Gflops. Notice how configs with similar Gflops achieve similar FID, regardless of how the Gflops were obtained.
        </div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#bpCanvas');
  const W = 520, H = 380;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#bpReadout');

  const padL = 56, padR = 18, padT = 22, padB = 42;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const log10 = Math.log10 || (x => Math.log(x) / Math.LN10);
  // log axes
  const gfMin = log10(0.3), gfMax = log10(140);
  const fdMin = log10(15), fdMax = log10(160);
  const xMap = lg => padL + ((lg - gfMin) / (gfMax - gfMin)) * plotW;
  const yMap = lf => padT + (1 - (lf - fdMin) / (fdMax - fdMin)) * plotH;

  const COLOR_BY_CFG = { S: '#ffaaaa', B: '#ffd966', L: '#7ed7a8', XL: '#5fa9ff' };

  let hover = null;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg-mute') || '#5a5a64';

    // Grid lines (log)
    ctx.strokeStyle = cssVar('--rule') || '#e6e4dd'; ctx.lineWidth = 1;
    for (const v of [0.3, 1, 3, 10, 30, 100]) {
      if (v < 0.3 || v > 140) continue;
      const x = xMap(log10(v));
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    for (const v of [15, 25, 50, 100, 160]) {
      const y = yMap(log10(v));
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = fg; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // Tick labels
    ctx.fillStyle = fg; ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (const v of [0.3, 1, 3, 10, 30, 100]) {
      if (v < 0.3 || v > 140) continue;
      ctx.fillText(`${v}`, xMap(log10(v)), padT + plotH + 14);
    }
    ctx.textAlign = 'right';
    for (const v of [15, 25, 50, 100, 160]) {
      ctx.fillText(`${v}`, padL - 6, yMap(log10(v)) + 4);
    }
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Gflops  (log)  →', padL + plotW / 2, H - 10);
    ctx.save();
    ctx.translate(16, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('FID-50K  (log)  ↑', 0, 0);
    ctx.restore();

    // Trend line (rough log-log fit)
    ctx.strokeStyle = GREY_MUTE; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    // FID ≈ 130 * Gflops^(-0.45) approximately
    let first = true;
    for (let lg = gfMin; lg <= gfMax; lg += 0.05) {
      const g = Math.pow(10, lg);
      const fid = 130 * Math.pow(g, -0.45);
      if (fid < Math.pow(10, fdMin) || fid > Math.pow(10, fdMax)) continue;
      const x = xMap(lg), y = yMap(log10(fid));
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Bubbles
    for (const m of DIT_MODELS) {
      const x = xMap(log10(m.gflops));
      const y = yMap(log10(m.fid));
      const r = 4 + Math.sqrt(m.gflops) * 1.5;
      const isHover = hover === m.name;
      ctx.fillStyle = COLOR_BY_CFG[m.cfg] + (isHover ? 'ee' : 'aa');
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (isHover) {
        ctx.strokeStyle = cssVar('--fg') || '#1b1b1f';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2); ctx.stroke();
      }
      // label
      ctx.fillStyle = cssVar('--fg') || '#1b1b1f';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(m.name, x + r + 3, y + 3);
    }

    // Legend
    ctx.font = 'bold 10px ui-monospace, monospace';
    let lx = padL + 8, ly = padT + 12;
    for (const cfg of ['S', 'B', 'L', 'XL']) {
      ctx.fillStyle = COLOR_BY_CFG[cfg];
      ctx.beginPath(); ctx.arc(lx + 5, ly, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cssVar('--fg') || '#1b1b1f';
      ctx.textAlign = 'left';
      ctx.fillText(`DiT-${cfg}`, lx + 14, ly + 3);
      ly += 14;
    }
  }

  cv.addEventListener('mousemove', (e) => {
    const rect = cv.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    const py = (e.clientY - rect.top) * (H / rect.height);
    let best = null, bestD = Infinity;
    for (const m of DIT_MODELS) {
      const x = xMap(log10(m.gflops));
      const y = yMap(log10(m.fid));
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (bestD < 28) {
      hover = best.name;
      readout.innerHTML = `
        <div><b>${best.name}</b> &nbsp; <span class="dit-pill mid">DiT-${best.cfg}, p=${best.p}</span></div>
        <div>params  = <b>${best.params}M</b></div>
        <div>Gflops  = <b>${best.gflops}</b></div>
        <div>FID-50K = <b style="color:${RED_HOT}">${best.fid.toFixed(2)}</b></div>
      `;
    } else {
      hover = null;
      readout.innerHTML = `<div style="color:var(--fg-mute);">hover a bubble to inspect</div>`;
    }
    draw();
  });
  cv.addEventListener('mouseleave', () => { hover = null; readout.innerHTML = `<div style="color:var(--fg-mute);">hover a bubble to inspect</div>`; draw(); });

  window.addEventListener('theme-changed', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: SAMPLING vs MODEL COMPUTE
 * Slider for number of sampling steps. Show FID vs per-image Gflops for
 * three model sizes — curves never cross.
 * ===================================================================== */
(function samplingWidget() {
  const host = document.getElementById('sampling-widget');
  if (!host) return;

  // Approximate FID(steps, model) from paper data
  // Each model has an asymptotic FID it converges to; below a threshold
  // sampling steps, FID degrades sharply.
  const SAMP_MODELS = [
    { name: 'DiT-S/2',  gf: 6.06,   floor: 68.4, color: '#ffaaaa' },
    { name: 'DiT-L/2',  gf: 80.71,  floor: 23.3, color: '#7ed7a8' },
    { name: 'DiT-XL/2', gf: 118.64, floor: 19.5, color: '#5fa9ff' },
  ];

  function fid_at_steps(model, steps) {
    // monotonically decreasing toward floor, with degradation at small steps
    const ratio = Math.max(1, steps) / 250;
    return model.floor * (1 + 0.6 / Math.pow(ratio, 0.45));
  }

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="swCanvas"></canvas>
      <div class="controls">
        <div class="dit-slider-row">
          <label>sampling steps <span class="val" id="swStepsLab">128</span></label>
          <input type="range" id="swSteps" min="0" max="5" step="1" value="3"/>
        </div>
        <div class="readout" id="swReadout"></div>
      </div>
    </div>
  `);

  const STEP_OPTIONS = [16, 32, 64, 128, 256, 1000];
  const cv = host.querySelector('#swCanvas');
  const W = 520, H = 320;
  const ctx = devicePx(cv, W, H);
  const slSteps = host.querySelector('#swSteps');
  const labSteps = host.querySelector('#swStepsLab');
  const readout = host.querySelector('#swReadout');

  const padL = 56, padR = 18, padT = 16, padB = 42;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const log10 = Math.log10 || (x => Math.log(x) / Math.LN10);
  const xMin = log10(50), xMax = log10(200000); // per-image Gflops
  const yMin = 18, yMax = 120;
  const xMap = lg => padL + ((lg - xMin) / (xMax - xMin)) * plotW;
  const yMap = v => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  function draw() {
    const idx = parseInt(slSteps.value, 10);
    const steps = STEP_OPTIONS[idx];
    labSteps.textContent = `${steps}`;

    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg-mute') || '#5a5a64';

    // grid
    ctx.strokeStyle = cssVar('--rule') || '#e6e4dd'; ctx.lineWidth = 1;
    for (const v of [100, 1000, 10000, 100000]) {
      const x = xMap(log10(v));
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    for (const v of [20, 40, 60, 80, 100, 120]) {
      const y = yMap(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }
    // axes
    ctx.strokeStyle = fg; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + plotH); ctx.lineTo(padL + plotW, padT + plotH); ctx.stroke();
    ctx.fillStyle = fg; ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    for (const v of [100, 1000, 10000, 100000]) {
      const lbl = v >= 1000 ? `${v / 1000}K` : `${v}`;
      ctx.fillText(lbl, xMap(log10(v)), padT + plotH + 14);
    }
    ctx.textAlign = 'right';
    for (const v of [20, 40, 60, 80, 100, 120]) {
      ctx.fillText(`${v}`, padL - 6, yMap(v) + 4);
    }
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('per-image Gflops (log) →', padL + plotW / 2, H - 8);
    ctx.save();
    ctx.translate(16, padT + plotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('FID-10K  ↑', 0, 0);
    ctx.restore();

    // For each model, draw curve over all step options
    for (const m of SAMP_MODELS) {
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      let first = true;
      for (let s = 16; s <= 1000; s += s < 64 ? 4 : 32) {
        const gf = m.gf * s;
        const f = fid_at_steps(m, s);
        if (gf < Math.pow(10, xMin) || gf > Math.pow(10, xMax)) continue;
        const x = xMap(log10(gf)), y = yMap(Math.max(yMin, Math.min(yMax, f)));
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // dot at current step
      const gf = m.gf * steps;
      const f = fid_at_steps(m, steps);
      const x = xMap(log10(gf)), y = yMap(Math.max(yMin, Math.min(yMax, f)));
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cssVar('--bg-elev') || '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
    }

    // legend
    let ly = padT + 14;
    ctx.font = 'bold 11px ui-monospace, monospace';
    for (const m of SAMP_MODELS) {
      ctx.fillStyle = m.color;
      ctx.fillRect(padL + 10, ly - 6, 12, 12);
      ctx.fillStyle = cssVar('--fg') || '#1b1b1f';
      ctx.textAlign = 'left';
      ctx.fillText(m.name, padL + 28, ly + 3);
      ly += 16;
    }

    // readout
    const rows = SAMP_MODELS.map(m => {
      const gf = m.gf * steps;
      const f = fid_at_steps(m, steps);
      return `<div>${m.name.padEnd(9)} → <b>${f.toFixed(1)}</b> FID @ <b>${(gf / 1000).toFixed(1)}K</b> Gflops/img</div>`;
    }).join('');
    readout.innerHTML = `
      <div>at <b>${steps}</b> sampling steps:</div>
      <div style="margin-top:4px;">${rows}</div>
      <div style="margin-top:8px;font-size:12px;color:var(--fg-mute);line-height:1.4;">
        Sliding right adds more steps → moves all three dots rightward, but the small model never catches up.
      </div>
    `;
  }

  slSteps.addEventListener('input', draw);
  window.addEventListener('theme-changed', draw);
  draw();
})();
