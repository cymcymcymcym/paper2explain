/* JiT (Back to Basics) blog interactive widgets. Plain JS / Canvas. No deps. */

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

function drawArrow(ctx, x1, y1, x2, y2, color, width = 2) {
  if (Math.hypot(x2 - x1, y2 - y1) < 3) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-9, -4.5);
  ctx.lineTo(-9, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* =====================================================================
 * Widget 1: MANIFOLD VIEW
 * 1-D blue spiral lives inside 2-D space. A clean point x sits on the
 * curve; a noise point eps is anywhere. The interpolant z_t slides.
 * Toggle prediction target to show which point the network must output.
 * ===================================================================== */
(function manifoldWidget() {
  const host = document.getElementById('manifold-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap">
        <canvas id="mfCanvas" width="480" height="360"></canvas>
      </div>
      <div class="controls">
        <div class="picker">
          <button class="btn active" data-tgt="x">predict x</button>
          <button class="btn" data-tgt="eps">predict ε</button>
          <button class="btn" data-tgt="v">predict v</button>
        </div>
        <div>
          <label class="ctl-label">noise level t (1 = clean, 0 = pure noise)</label>
          <input type="range" id="mfT" min="0" max="1" step="0.01" value="0.5"/>
        </div>
        <div>
          <label class="ctl-label">re-roll noise ε</label>
          <button class="btn" id="mfReroll">↻ new ε</button>
        </div>
        <div class="readout" id="mfReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#mfCanvas');
  const ctx = devicePx(cv, 480, 360);
  const W = 480, H = 360;
  const cx = W / 2, cy = H / 2;
  const scale = 70; // pixels per unit
  const tSlider = host.querySelector('#mfT');
  const readout = host.querySelector('#mfReadout');
  const btns = [...host.querySelectorAll('.picker .btn')];
  const reroll = host.querySelector('#mfReroll');

  let target = 'x';
  // a clean sample on the spiral
  const theta = 2.4 * Math.PI;
  const r = 0.35 + 0.18 * theta;
  let xPt = { x: r * Math.cos(theta), y: r * Math.sin(theta) };
  // noise sample
  let epsPt = { x: 1.6, y: 1.3 };
  function newEps() {
    // a wider Gaussian-ish sample so it's clearly off-manifold
    const u = Math.random() - 0.5;
    const v = Math.random() - 0.5;
    epsPt = { x: 2.6 * u * 2 * (Math.random() < 0.5 ? -1 : 1) + (Math.random() - 0.5) * 0.8,
              y: 2.0 * v * 2 * (Math.random() < 0.5 ? -1 : 1) + (Math.random() - 0.5) * 0.8 };
    if (epsPt.x > 2.3) epsPt.x = 2.3;
    if (epsPt.x < -2.3) epsPt.x = -2.3;
    if (epsPt.y > 1.7) epsPt.y = 1.7;
    if (epsPt.y < -1.7) epsPt.y = -1.7;
  }

  function spiralPt(th) {
    const r = 0.35 + 0.18 * th;
    return { x: r * Math.cos(th), y: r * Math.sin(th) };
  }
  function toScreen(p) {
    return { x: cx + p.x * scale, y: cy - p.y * scale };
  }

  function draw() {
    const t = parseFloat(tSlider.value);
    const z = {
      x: t * xPt.x + (1 - t) * epsPt.x,
      y: t * xPt.y + (1 - t) * epsPt.y,
    };
    const v = { x: xPt.x - epsPt.x, y: xPt.y - epsPt.y };

    const accent = cssVar('--accent') || '#ff9b6a';
    const bgCard = cssVar('--bg-card') || '#1a1c22';
    const fg = cssVar('--fg') || '#e8e8ee';
    const fgMute = cssVar('--fg-mute') || '#888';
    const dataC = '#5fa9ff';
    const noiseC = '#cc7adb';
    const predC = '#ffd166';
    const vC = '#7be582';

    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    // light grid
    ctx.strokeStyle = fgMute;
    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * scale, 0);
      ctx.lineTo(cx + i * scale, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, cy - i * scale);
      ctx.lineTo(W, cy - i * scale);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The 1-D manifold (spiral)
    ctx.strokeStyle = dataC;
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    for (let th = 0.5; th < 4 * Math.PI; th += 0.05) {
      const p = toScreen(spiralPt(th));
      if (th === 0.5) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Labels
    ctx.fillStyle = fgMute;
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('manifold (1-D)', 12, 20);
    ctx.fillText('ambient space (2-D)', 12, H - 12);

    // Other clean samples on the manifold
    ctx.fillStyle = dataC;
    ctx.globalAlpha = 0.4;
    for (let th = 0.7; th < 4 * Math.PI - 0.3; th += 0.6) {
      if (Math.abs(th - theta) < 0.4) continue;
      const p = toScreen(spiralPt(th));
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pin-point: x
    const xS = toScreen(xPt);
    ctx.fillStyle = dataC;
    ctx.beginPath(); ctx.arc(xS.x, xS.y, 6, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = dataC;
    ctx.font = 'italic 600 14px ui-monospace, monospace';
    ctx.fillText('x', xS.x + 9, xS.y - 8);

    // Pin-point: eps
    const eS = toScreen(epsPt);
    ctx.fillStyle = noiseC;
    ctx.beginPath(); ctx.arc(eS.x, eS.y, 6, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = noiseC;
    ctx.fillText('ε', eS.x + 9, eS.y - 8);

    // Connecting line x -> eps (the interpolation segment)
    ctx.strokeStyle = fgMute;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(xS.x, xS.y);
    ctx.lineTo(eS.x, eS.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // z_t point
    const zS = toScreen(z);
    ctx.fillStyle = predC;
    ctx.beginPath(); ctx.arc(zS.x, zS.y, 7, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = predC;
    ctx.fillText('z_t', zS.x + 9, zS.y + 16);

    // Show the prediction target
    let targetPt, targetColor, targetLabel;
    if (target === 'x') {
      targetPt = xPt; targetColor = dataC; targetLabel = 'x  (on the 1-D curve)';
    } else if (target === 'eps') {
      targetPt = epsPt; targetColor = noiseC; targetLabel = 'ε  (anywhere in 2-D)';
    } else {
      // v = x - eps. We need to display it as a target the network outputs.
      // Visually we anchor v at the origin so it doesn't fly off-screen.
      targetPt = { x: v.x, y: v.y }; targetColor = vC; targetLabel = 'v = x - ε  (anywhere in 2-D)';
    }
    const tS = toScreen(targetPt);
    // Draw a glowing ring around the target point
    ctx.strokeStyle = targetColor;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(tS.x, tS.y, 13, 0, 2 * Math.PI); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = targetColor;
    ctx.beginPath(); ctx.arc(tS.x, tS.y, 5, 0, 2 * Math.PI); ctx.fill();
    if (target === 'v') {
      ctx.fillStyle = vC;
      ctx.fillText('v', tS.x + 9, tS.y - 8);
    }

    // Arrow from z_t to target
    drawArrow(ctx, zS.x, zS.y, tS.x, tS.y, targetColor, 2.4);

    // ---- readout ----
    const targetMag = Math.hypot(targetPt.x, targetPt.y);
    const xMag = Math.hypot(xPt.x, xPt.y);
    const epsMag = Math.hypot(epsPt.x, epsPt.y);
    const targetDim = (target === 'x') ? '1' : '2';
    readout.innerHTML = `
      <div>t = <b>${t.toFixed(2)}</b></div>
      <div style="color: #5fa9ff">|x|  = ${xMag.toFixed(2)} &nbsp; <span style="opacity:.5">(on 1-D manifold)</span></div>
      <div style="color: #cc7adb">|ε|  = ${epsMag.toFixed(2)} &nbsp; <span style="opacity:.5">(off-manifold)</span></div>
      <div style="color: #ffd166">|z_t| = ${Math.hypot(z.x, z.y).toFixed(2)}</div>
      <div style="margin-top:8px;color:${target==='x'?'#5fa9ff':target==='eps'?'#cc7adb':'#7be582'}">
        target: <b>${target === 'x' ? 'x' : target === 'eps' ? 'ε' : 'v'}</b> · output dimension =
        <b>${targetDim}-D</b>
      </div>
    `;
  }

  tSlider.addEventListener('input', draw);
  reroll.addEventListener('click', () => { newEps(); draw(); });
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    target = b.dataset.tgt;
    draw();
  }));
  draw();
})();

/* =====================================================================
 * Widget 2: NINE-CELL PREDICTION MATRIX
 * Click cells to inspect formula. Toggle between 64x64 (all green) and
 * 256x256 (only x-pred column survives).
 * ===================================================================== */
(function matrixWidget() {
  const host = document.getElementById('matrix-widget');
  if (!host) return;

  // FID numbers from paper Table 2.
  // rows: x-loss, eps-loss, v-loss.  cols: x-pred, eps-pred, v-pred.
  const FID_256 = [
    [10.14, 379.21, 107.55],
    [10.45, 394.58, 126.88],
    [ 8.62, 372.38,  96.53],
  ];
  const FID_64 = [
    [5.76, 6.20, 6.12],
    [3.56, 4.02, 3.76],
    [3.55, 3.63, 3.46],
  ];
  // Per-cell formulas. Each maps the network output to the loss-space target.
  const FORMULAS = [
    [
      { net: 'x_θ', loss: '‖x_θ - x‖²', xform: 'x_θ' },
      { net: 'ε_θ', loss: '‖x_θ - x‖²', xform: 'x_θ = (z_t - (1-t)·ε_θ) / t' },
      { net: 'v_θ', loss: '‖x_θ - x‖²', xform: 'x_θ = (1-t)·v_θ + z_t' },
    ],
    [
      { net: 'x_θ', loss: '‖ε_θ - ε‖²', xform: 'ε_θ = (z_t - t·x_θ) / (1-t)' },
      { net: 'ε_θ', loss: '‖ε_θ - ε‖²', xform: 'ε_θ' },
      { net: 'v_θ', loss: '‖ε_θ - ε‖²', xform: 'ε_θ = z_t - t·v_θ' },
    ],
    [
      { net: 'x_θ', loss: '‖v_θ - v‖²', xform: 'v_θ = (x_θ - z_t) / (1-t)' },
      { net: 'ε_θ', loss: '‖v_θ - v‖²', xform: 'v_θ = (z_t - ε_θ) / t' },
      { net: 'v_θ', loss: '‖v_θ - v‖²', xform: 'v_θ' },
    ],
  ];
  const ROW_LABELS = ['x-loss', 'ε-loss', 'v-loss'];
  const COL_LABELS = ['x-pred', 'ε-pred', 'v-pred'];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="picker" style="margin-bottom: 14px">
        <button class="btn active" data-setting="256">256×256 (patch dim 768)</button>
        <button class="btn" data-setting="64">64×64 (patch dim 48)</button>
      </div>
      <div class="matrix-grid" id="matrixGrid"></div>
      <div class="cell-detail" id="cellDetail">
        <span class="hint">Click any cell to inspect the parameterization.</span>
      </div>
    </div>
  `);

  let setting = '256';
  let activeCell = [0, 0]; // [row, col]

  const grid = host.querySelector('#matrixGrid');
  const detail = host.querySelector('#cellDetail');
  const settingBtns = [...host.querySelectorAll('.picker .btn')];

  function renderGrid() {
    const data = setting === '256' ? FID_256 : FID_64;
    let html = `<div class="mhdr corner"></div>`;
    for (let c = 0; c < 3; c++) {
      html += `<div class="mhdr col">${COL_LABELS[c]}</div>`;
    }
    for (let r = 0; r < 3; r++) {
      html += `<div class="mhdr row">${ROW_LABELS[r]}</div>`;
      for (let c = 0; c < 3; c++) {
        const fid = data[r][c];
        const bad = fid > 40;
        const cls = bad ? 'cell bad' : 'cell good';
        const active = (activeCell[0] === r && activeCell[1] === c) ? ' active' : '';
        html += `<div class="${cls}${active}" data-r="${r}" data-c="${c}">
          <div class="fid">${fid.toFixed(2)}</div>
          <div class="lbl">${bad ? 'fails' : 'works'}</div>
        </div>`;
      }
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.cell').forEach(el => {
      el.addEventListener('click', () => {
        activeCell = [+el.dataset.r, +el.dataset.c];
        renderGrid();
        renderDetail();
      });
    });
  }

  function renderDetail() {
    const [r, c] = activeCell;
    const data = setting === '256' ? FID_256 : FID_64;
    const fid = data[r][c];
    const f = FORMULAS[r][c];
    const bad = fid > 40;
    detail.innerHTML = `
      <div class="cell-detail-grid">
        <div>
          <p class="d-label">Network outputs</p>
          <p class="d-value">${f.net}</p>
        </div>
        <div>
          <p class="d-label">Loss space</p>
          <p class="d-value">${f.loss}</p>
        </div>
        <div>
          <p class="d-label">Transformation</p>
          <p class="d-value mono">${f.xform}</p>
        </div>
        <div>
          <p class="d-label">FID @ ${setting}×${setting}</p>
          <p class="d-value ${bad ? 'fid-bad' : 'fid-good'}">${fid.toFixed(2)}</p>
        </div>
      </div>
    `;
  }

  settingBtns.forEach(b => b.addEventListener('click', () => {
    settingBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setting = b.dataset.setting;
    renderGrid();
    renderDetail();
  }));

  renderGrid();
  renderDetail();
})();

/* =====================================================================
 * Widget 3: TOY EXPERIMENT (D-slider)
 * Slide D ∈ {2, 8, 16, 512}. Show ground truth (always 2-D spiral) and
 * the three model outputs. x-pred stays sharp; the others collapse.
 * ===================================================================== */
(function toyWidget() {
  const host = document.getElementById('toy-widget');
  if (!host) return;

  const DIMS = ['2', '8', '16', '512'];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="picker" style="margin-bottom: 12px">
        ${DIMS.map((d, i) => `<button class="btn${i===0?' active':''}" data-d="${d}">D = ${d}</button>`).join('')}
      </div>
      <div class="toy-grid">
        <div class="cell">
          <img id="toyGT" src="assets/figures/toy/gt_HD2.png" alt="ground truth"/>
          <p class="lbl">ground truth (spiral in 2-D)</p>
        </div>
        <div class="cell">
          <img id="toyX" src="assets/figures/toy/gen_HD2_x.png" alt="x-pred output"/>
          <p class="lbl" style="color: #5fa9ff">x-pred</p>
        </div>
        <div class="cell">
          <img id="toyE" src="assets/figures/toy/gen_HD2_eps.png" alt="eps-pred output"/>
          <p class="lbl" style="color: #cc7adb">ε-pred</p>
        </div>
        <div class="cell">
          <img id="toyV" src="assets/figures/toy/gen_HD2_v.png" alt="v-pred output"/>
          <p class="lbl" style="color: #7be582">v-pred</p>
        </div>
      </div>
      <div class="caption" id="toyCaption"></div>
    </div>
  `);

  const btns = [...host.querySelectorAll('.picker .btn')];
  const gt = host.querySelector('#toyGT');
  const xImg = host.querySelector('#toyX');
  const eImg = host.querySelector('#toyE');
  const vImg = host.querySelector('#toyV');
  const cap = host.querySelector('#toyCaption');

  const CAPTIONS = {
    '2':   "At D = 2 there's no manifold/ambient gap. The 256-dim MLP has more than enough capacity for all three; the spiral comes out cleanly under every parameterization.",
    '8':   "At D = 8 the spiral is buried in a richer ambient space. x-pred still recovers it; ε-pred and v-pred are starting to lose sharpness.",
    '16':  "At D = 16 the gap is visible. x-pred is essentially perfect; ε- and v-pred are smeared — the network is starting to fail at reproducing a 16-dim Gaussian sample.",
    '512': "At D = 512 the 256-dim MLP is under-complete: it literally cannot reproduce a 512-dim Gaussian. ε- and v-pred collapse to noise. x-pred still works — its output is implicitly 2-D, regardless of how it's coordinatized.",
  };

  function update(d) {
    gt.src = `assets/figures/toy/gt_HD${d}.png`;
    xImg.src = `assets/figures/toy/gen_HD${d}_x.png`;
    eImg.src = `assets/figures/toy/gen_HD${d}_eps.png`;
    vImg.src = `assets/figures/toy/gen_HD${d}_v.png`;
    cap.textContent = CAPTIONS[d];
  }
  update('2');
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    update(b.dataset.d);
  }));
})();

/* =====================================================================
 * Widget 4: BOTTLENECK FID CURVE
 * Slider over bottleneck dim d' ∈ {16, 32, 64, 128, 256, 512, 768}.
 * Show FID curve with the active point highlighted.
 * ===================================================================== */
(function bottleneckWidget() {
  const host = document.getElementById('bottleneck-widget');
  if (!host) return;

  // From Figure 4 of the paper. (d', FID).
  const POINTS = [
    { d: 16,  fid: 9.40 },
    { d: 32,  fid: 8.38 },
    { d: 64,  fid: 7.35 },
    { d: 128, fid: 7.48 },
    { d: 256, fid: 7.89 },
    { d: 512, fid: 8.15 },
    { d: 768, fid: 8.62 }, // "no bottleneck" baseline
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap">
        <canvas id="btCanvas" width="540" height="340"></canvas>
      </div>
      <div class="controls">
        <div>
          <label class="ctl-label">bottleneck dimension d'</label>
          <input type="range" id="btSlider" min="0" max="6" step="1" value="2"/>
        </div>
        <div class="readout" id="btReadout"></div>
        <p class="hint" style="font-size:13px;margin-top:6px;line-height:1.5">
          The raw patch is 768-D (16×16×3). The bottleneck factors the embedding through a $d'$-D
          intermediate. Even <em>d' = 16</em> doesn't crash — and d' between 32 and 256 actively helps.
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#btCanvas');
  const ctx = devicePx(cv, 540, 340);
  const W = 540, H = 340;
  const padL = 56, padR = 26, padT = 22, padB = 46;
  const slider = host.querySelector('#btSlider');
  const readout = host.querySelector('#btReadout');

  function draw() {
    const idx = parseInt(slider.value);
    const cur = POINTS[idx];

    const bgCard = cssVar('--bg-card') || '#1a1c22';
    const fg = cssVar('--fg') || '#e8e8ee';
    const fgMute = cssVar('--fg-mute') || '#888';
    const accent = cssVar('--accent') || '#ff9b6a';
    const rule = cssVar('--rule') || '#333';

    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    const minD = Math.log2(POINTS[0].d), maxD = Math.log2(POINTS[POINTS.length-1].d);
    const minF = 6.5, maxF = 10.0;

    function px(d) {
      return padL + (Math.log2(d) - minD) / (maxD - minD) * (W - padL - padR);
    }
    function py(f) {
      return H - padB - (f - minF) / (maxF - minF) * (H - padT - padB);
    }

    // axes
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB);
    ctx.stroke();

    // y gridlines at FID 7, 8, 9
    ctx.strokeStyle = rule;
    ctx.globalAlpha = 0.4;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = fgMute;
    for (let f = 7; f <= 10; f++) {
      const y = py(f);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(String(f), padL - 26, y + 4);
    }
    ctx.globalAlpha = 1;
    // x ticks
    ctx.fillStyle = fgMute;
    POINTS.forEach(p => {
      const x = px(p.d);
      ctx.beginPath();
      ctx.moveTo(x, H - padB);
      ctx.lineTo(x, H - padB + 4);
      ctx.strokeStyle = rule;
      ctx.stroke();
      ctx.fillText(String(p.d), x - (p.d > 99 ? 11 : p.d > 9 ? 8 : 4), H - padB + 18);
    });
    // axis labels
    ctx.fillStyle = fgMute;
    ctx.fillText("bottleneck dim d'", W/2 - 50, H - 8);
    ctx.save();
    ctx.translate(14, H/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText('FID-50K (↓ better)', -50, 0);
    ctx.restore();

    // curve
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    POINTS.forEach((p, i) => {
      const x = px(p.d), y = py(p.fid);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // dots
    POINTS.forEach((p, i) => {
      const x = px(p.d), y = py(p.fid);
      const active = (i === idx);
      ctx.fillStyle = active ? accent : bgCard;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, active ? 7 : 4, 0, 2*Math.PI);
      ctx.fill(); ctx.stroke();
    });

    // active label
    const ax = px(cur.d), ay = py(cur.fid);
    ctx.fillStyle = fg;
    ctx.font = '600 13px ui-monospace, monospace';
    ctx.fillText(`d' = ${cur.d},  FID = ${cur.fid}`, Math.min(ax + 12, W - 130), ay - 10);

    // "no bottleneck" annotation
    const lastP = POINTS[POINTS.length - 1];
    ctx.fillStyle = fgMute;
    ctx.font = 'italic 11px ui-monospace, monospace';
    ctx.fillText('no bottleneck →', px(lastP.d) - 100, py(lastP.fid) + 18);

    readout.innerHTML = `
      <div>d' = <b>${cur.d}</b></div>
      <div>FID = <b style="color:${cur.fid < 7.6 ? '#7be582' : (cur.fid > 8.5 ? '#cc7adb' : '#ffd166')}">${cur.fid.toFixed(2)}</b></div>
      <div style="margin-top:6px;font-size:12px;opacity:.7">
        ${cur.d === 768 ? '"no bottleneck" baseline' :
          cur.fid === Math.min(...POINTS.map(p=>p.fid)) ? 'sweet spot' :
          cur.d <= 32 ? 'aggressive bottleneck — still works' :
          'mild bottleneck'}
      </div>
    `;
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 5: PATCH DIMENSION CALCULATOR
 * Pick resolution × patch size. Show per-patch dim, sequence length,
 * and which JiT model handled it.
 * ===================================================================== */
(function patchWidget() {
  const host = document.getElementById('patch-widget');
  if (!host) return;

  const RESES = [256, 512, 1024];
  const PATCHES = [4, 8, 16, 32, 64];

  // From the paper (when reported). Otherwise blank.
  // Keyed by `${res}_${p}` → { variant, params, gflops, fid }
  const RESULTS = {
    '256_16': { variant: 'JiT-B/16',  params: '131M',  gflops: 25,  fid: 4.37, seqlen: 256 },
    '512_32': { variant: 'JiT-B/32',  params: '133M',  gflops: 26,  fid: 4.64, seqlen: 256 },
    '1024_64':{ variant: 'JiT-B/64',  params: '141M',  gflops: 30,  fid: 4.82, seqlen: 256 },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="picker" style="margin-bottom: 6px">
        <span class="ctl-label">resolution:</span>
        ${RESES.map((r, i) => `<button class="btn${i===0?' active':''}" data-axis="res" data-v="${r}">${r}</button>`).join('')}
      </div>
      <div class="picker" style="margin-bottom: 16px">
        <span class="ctl-label">patch p:</span>
        ${PATCHES.map((p, i) => `<button class="btn${p===16?' active':''}" data-axis="p" data-v="${p}">${p}</button>`).join('')}
      </div>
      <div class="patch-readout" id="patchReadout"></div>
    </div>
  `);

  let res = 256, p = 16;
  const btns = [...host.querySelectorAll('.picker .btn')];
  const readout = host.querySelector('#patchReadout');

  function update() {
    const patchDim = p * p * 3;
    const seqLen = Math.pow(res / p, 2);
    const hiddens = { B: 768, L: 1024, H: 1280, G: 1664 };
    const exceedsB = patchDim > hiddens.B;
    const exceedsAll = patchDim > hiddens.G;
    const result = RESULTS[`${res}_${p}`];

    readout.innerHTML = `
      <div class="patch-stats">
        <div class="stat">
          <p class="d-label">patch dim (p × p × 3)</p>
          <p class="d-value mono ${exceedsB ? 'highlight' : ''}">${patchDim.toLocaleString()}</p>
        </div>
        <div class="stat">
          <p class="d-label">sequence length</p>
          <p class="d-value mono">${seqLen.toLocaleString()}</p>
        </div>
        <div class="stat">
          <p class="d-label">vs hidden dims</p>
          <p class="d-value mono" style="font-size: 14px; line-height: 1.45">
            B 768 ${patchDim > 768 ? '<span class="x">×</span>' : '<span class="ok">✓</span>'}
            &nbsp;L 1024 ${patchDim > 1024 ? '<span class="x">×</span>' : '<span class="ok">✓</span>'}
            <br/>
            H 1280 ${patchDim > 1280 ? '<span class="x">×</span>' : '<span class="ok">✓</span>'}
            &nbsp;G 1664 ${patchDim > 1664 ? '<span class="x">×</span>' : '<span class="ok">✓</span>'}
          </p>
        </div>
      </div>
      ${result ? `
        <div class="patch-fid">
          <p class="d-label">reported in paper as ${result.variant}</p>
          <div class="patch-numbers">
            <div><span class="lbl">params</span><b>${result.params}</b></div>
            <div><span class="lbl">Gflops</span><b>${result.gflops}</b></div>
            <div><span class="lbl">FID</span><b style="color: var(--accent)">${result.fid}</b></div>
          </div>
        </div>` : `
        <div class="patch-fid empty">
          <p style="font-size: 13px; opacity: 0.7; margin: 8px 0">
            ${exceedsAll
              ? `Per-patch dim ${patchDim.toLocaleString()} > every JiT hidden dim. Pre-JiT this was the death zone for noise prediction. With x-prediction this is still tractable.`
              : `Configuration not specifically reported. ${seqLen <= 64 ? 'Very short sequence — likely under-utilizes attention.' : seqLen >= 4096 ? 'Long sequence — attention becomes the bottleneck.' : 'A standard configuration.'}`}
          </p>
        </div>`}
    `;
  }

  btns.forEach(b => b.addEventListener('click', () => {
    const axis = b.dataset.axis;
    host.querySelectorAll(`.picker .btn[data-axis="${axis}"]`).forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    if (axis === 'res') res = parseInt(b.dataset.v);
    else p = parseInt(b.dataset.v);
    update();
  }));

  update();
})();
