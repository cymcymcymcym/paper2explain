/* Titans blog interactive widgets. Plain JS / Canvas. No deps. */

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
function lerpColor(hex1, hex2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex1), b = p(hex2);
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)}, ${Math.round(a[1]+(b[1]-a[1])*t)}, ${Math.round(a[2]+(b[2]-a[2])*t)})`;
}

/* =====================================================================
 * Widget 1: SURPRISE STREAMING
 * Stream of tokens. For each, pick a "surprise" magnitude and step the
 * memory. See how the memory grid drifts under SGD with momentum + decay.
 * ===================================================================== */
(function surpriseWidget() {
  const host = document.getElementById('surprise-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="memory-display">
        <canvas id="surpriseCanvas" width="520" height="280"></canvas>
        <p class="mem-label">memory $\\mathcal{M}$ (8×16 weight grid)</p>
      </div>
      <div class="controls">
        <div>
          <label class="ctl-label">incoming surprise (gradient magnitude)</label>
          <input type="range" id="srpSlider" min="0" max="2" step="0.05" value="1"/>
          <div class="readout" id="srpReadout"></div>
        </div>
        <div class="picker">
          <button class="btn" id="srpStep">step: process next (k, v)</button>
          <button class="btn" id="srpReset">↻ reset memory</button>
        </div>
        <div class="picker">
          <span class="ctl-label">use:</span>
          <button class="btn active" data-mode="momentum">momentum + decay</button>
          <button class="btn" data-mode="vanilla">vanilla SGD</button>
        </div>
        <div class="hint" style="font-size:13px">
          Each "step" applies one gradient update to $\\mathcal{M}$. Bigger surprise = bigger weight shift.
          Momentum carries surprise into the next step; decay slowly shrinks old content.
        </div>
      </div>
    </div>
  `);

  const ROWS = 8, COLS = 16;
  const cv = host.querySelector('#surpriseCanvas');
  const ctx = devicePx(cv, 520, 280);
  const slider = host.querySelector('#srpSlider');
  const stepBtn = host.querySelector('#srpStep');
  const resetBtn = host.querySelector('#srpReset');
  const readout = host.querySelector('#srpReadout');
  const modeBtns = [...host.querySelectorAll('.picker .btn[data-mode]')];

  let W, S, step, mode;
  function rand() { return (Math.random() - 0.5) * 2; }
  function reset() {
    W = Array.from({length: ROWS * COLS}, () => rand() * 0.15);
    S = Array.from({length: ROWS * COLS}, () => 0);
    step = 0;
    draw();
  }
  mode = 'momentum';

  function draw() {
    const accent = cssVar('--accent') || '#ff9b6a';
    const bgCard = cssVar('--bg-card') || '#1a1c22';
    const fgMute = cssVar('--fg-mute') || '#888';
    const blue = '#5fa9ff';
    const orange = accent;

    const cellW = 28, cellH = 28;
    const gw = COLS * cellW, gh = ROWS * cellH;
    const ox = (520 - gw) / 2, oy = (280 - gh) / 2;

    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, 520, 280);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const w = W[r * COLS + c];
        const mag = Math.min(1, Math.abs(w) * 3);
        const col = w >= 0 ? lerpColor('#1a1c22', orange, mag) : lerpColor('#1a1c22', blue, mag);
        ctx.fillStyle = col;
        ctx.fillRect(ox + c * cellW + 1, oy + r * cellH + 1, cellW - 2, cellH - 2);
        // subtle border
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + c * cellW + 0.5, oy + r * cellH + 0.5, cellW - 1, cellH - 1);
      }
    }

    // legend
    ctx.fillStyle = fgMute;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('weight: negative ', 6, 18);
    ctx.fillStyle = blue;
    ctx.fillRect(76, 11, 10, 10);
    ctx.fillStyle = fgMute;
    ctx.fillText(' ~ positive ', 92, 18);
    ctx.fillStyle = orange;
    ctx.fillRect(150, 11, 10, 10);

    // step count
    ctx.fillStyle = fgMute;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`step t = ${step}`, 6, 274);
  }

  function applyStep() {
    const surprise = parseFloat(slider.value);
    // Make a pseudo-gradient: random direction, magnitude proportional to surprise.
    // Concentrate the gradient in a few cells (to simulate sparse activation of MLP weights).
    const grad = Array.from({length: ROWS * COLS}, () => 0);
    const active = 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i < active; i++) {
      const idx = Math.floor(Math.random() * ROWS * COLS);
      grad[idx] += (Math.random() - 0.5) * surprise;
    }

    const eta = 0.55;     // momentum coefficient
    const alpha = 0.04;   // weight decay
    const theta = 0.6;    // step size

    for (let i = 0; i < ROWS * COLS; i++) {
      if (mode === 'momentum') {
        // S_t = eta * S_{t-1} - theta * grad_t
        S[i] = eta * S[i] - theta * grad[i];
        // M_t = (1 - alpha) * M_{t-1} + S_t
        W[i] = (1 - alpha) * W[i] + S[i];
      } else {
        // vanilla: M_t = M_{t-1} - theta * grad_t
        W[i] = W[i] - theta * grad[i];
        S[i] = 0;
      }
    }
    step += 1;
    draw();

    const surpriseLevel = surprise > 1.4 ? 'huge surprise — big imprint'
                       : surprise > 0.8 ? 'medium surprise'
                       : surprise > 0.3 ? 'mild surprise'
                       : 'barely noticed';
    readout.innerHTML = `surprise = <b>${surprise.toFixed(2)}</b> · ${surpriseLevel}`;
  }

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    readout.innerHTML = `surprise = <b>${v.toFixed(2)}</b>`;
  });
  stepBtn.addEventListener('click', applyStep);
  resetBtn.addEventListener('click', reset);
  modeBtns.forEach(b => b.addEventListener('click', () => {
    modeBtns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    mode = b.dataset.mode;
  }));

  reset();
})();

/* =====================================================================
 * Widget 2: BUILD THE UPDATE RULE
 * Three steps: vanilla SGD → +momentum → +weight decay. Show what the
 * equation and the behaviour look like at each step.
 * ===================================================================== */
(function updateRuleWidget() {
  const host = document.getElementById('update-rule-widget');
  if (!host) return;

  const STEPS = [
    {
      name: "Vanilla SGD",
      eq: `\\mathcal{M}_t = \\mathcal{M}_{t-1} \\;-\\; \\theta_t\\,\\nabla \\ell(\\mathcal{M}_{t-1}; x_t)`,
      what: "One gradient step per token. Each token's surprise contributes once and never again.",
      problem: "<strong>Problem:</strong> after a surprising token, the memory has shifted. Subsequent surprising-but-related tokens look uninteresting and get under-written.",
      colorClass: "step-1",
    },
    {
      name: "+ Momentum",
      eq: `\\begin{aligned}\\mathcal{M}_t &= \\mathcal{M}_{t-1} \\;+\\; S_t \\\\ S_t &= \\eta_t\\,S_{t-1} \\;-\\; \\theta_t\\,\\nabla \\ell(\\mathcal{M}_{t-1}; x_t)\\end{aligned}`,
      what: "Surprise accumulates in $S_t$. A single shock keeps writing for several steps. $\\eta_t$ is data-dependent — it can shut off momentum mid-sequence.",
      problem: "<strong>Problem:</strong> the memory never forgets. After a topic shift, old content keeps occupying capacity that new content needs.",
      colorClass: "step-2",
    },
    {
      name: "+ Weight decay (forgetting)",
      eq: `\\begin{aligned}\\mathcal{M}_t &= (1 - \\alpha_t)\\,\\mathcal{M}_{t-1} \\;+\\; S_t \\\\ S_t &= \\eta_t\\,S_{t-1} \\;-\\; \\theta_t\\,\\nabla \\ell(\\mathcal{M}_{t-1}; x_t)\\end{aligned}`,
      what: "Old content fades. With $\\alpha_t \\to 0$ the memory is preserved; with $\\alpha_t \\to 1$ it's wiped before the new step. $\\alpha_t$ is per-token so the model can decide when to clear room.",
      problem: "<strong>This is the Titans rule.</strong> Three data-dependent gates ($\\theta_t$, $\\eta_t$, $\\alpha_t$) give a controller per token; the memory acts like a tiny on-the-fly learner.",
      colorClass: "step-3",
    },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="step-tabs" id="srtTabs">
        ${STEPS.map((s, i) => `<button class="step-tab${i===0?' active':''}" data-i="${i}">
          <span class="num">${i+1}</span>
          <span class="name">${s.name}</span>
        </button>`).join('')}
      </div>
      <div class="step-content" id="srtContent"></div>
    </div>
  `);

  const tabs = [...host.querySelectorAll('.step-tab')];
  const content = host.querySelector('#srtContent');

  function render(i) {
    const s = STEPS[i];
    content.innerHTML = `
      <div class="step-eq ${s.colorClass}">$$${s.eq}$$</div>
      <div class="step-what">${s.what}</div>
      <div class="step-problem">${s.problem}</div>
    `;
    if (window.renderMathInElement) {
      renderMathInElement(content, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});
    }
  }
  tabs.forEach(b => b.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    render(parseInt(b.dataset.i));
  }));
  render(0);
})();

/* =====================================================================
 * Widget 3: THREE VARIANTS (MAC / MAG / MAL)
 * Side-by-side block diagram. Click to swap. Show data flow + attention mask.
 * ===================================================================== */
(function variantsWidget() {
  const host = document.getElementById('variants-widget');
  if (!host) return;

  const VARIANTS = {
    MAC: {
      name: "MAC — Memory as Context",
      flow: [
        ["sequence", "chunk into segments"],
        ["chunk S^(t)", "query M_{t-1} → retrieve h_t"],
        ["[ persistent | h_t | S^(t) ]", "full attention"],
        ["attention output", "update M, emit y_t"],
      ],
      mask: "full",
      pros: "Attention sees current + retrieved past. M only memorises attention-filtered tokens.",
      cons: "Chunking introduces a quadratic-within-chunk cost.",
      strength: "Best on long-context retrieval (BABILong, NIAH).",
    },
    MAG: {
      name: "MAG — Memory as Gate",
      flow: [
        ["sequence + persistent prefix", "(no chunking)"],
        ["branch 1: sliding-window attention", "(precise short-term)"],
        ["branch 2: long-term M(x)", "(blurry long-term)"],
        ["learnable gate combines branches", "output"],
      ],
      mask: "sliding",
      pros: "Two complementary memory systems, no chunking. Cleanest 'multi-head' interpretation.",
      cons: "Both branches process the full sequence, redundant when local is enough.",
      strength: "Competitive on standard LM, slightly behind MAC on long-context.",
    },
    MAL: {
      name: "MAL — Memory as Layer",
      flow: [
        ["sequence + persistent prefix", ""],
        ["long-term memory M as a layer", "compress past+current"],
        ["sliding-window attention on M's output", ""],
        ["readout", ""],
      ],
      mask: "stacked",
      pros: "Familiar hybrid recipe (matches Mamba/Samba style).",
      cons: "Attention can't undo the memory's compression; loses precision on recent tokens.",
      strength: "Weakest of the three on every benchmark in the paper.",
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="picker" style="margin-bottom: 14px">
        ${Object.keys(VARIANTS).map((k, i) => `<button class="btn${i===0?' active':''}" data-v="${k}">${k}</button>`).join('')}
      </div>
      <div class="variants-grid">
        <div class="variant-flow">
          <p class="d-label">data flow</p>
          <div id="flowList"></div>
        </div>
        <div class="variant-meta">
          <p class="d-label">name</p>
          <p class="vn" id="varName"></p>
          <p class="d-label" style="margin-top:14px">strength</p>
          <p class="vs" id="varStrength"></p>
          <p class="d-label" style="margin-top:14px">pros</p>
          <p class="vp" id="varPros"></p>
          <p class="d-label" style="margin-top:8px">cons</p>
          <p class="vc" id="varCons"></p>
        </div>
      </div>
    </div>
  `);

  const flowList = host.querySelector('#flowList');
  const nameEl = host.querySelector('#varName');
  const strengthEl = host.querySelector('#varStrength');
  const prosEl = host.querySelector('#varPros');
  const consEl = host.querySelector('#varCons');
  const btns = [...host.querySelectorAll('.picker .btn')];

  function render(v) {
    const d = VARIANTS[v];
    flowList.innerHTML = d.flow.map((row, i) => `
      <div class="flow-step">
        <div class="flow-num">${i + 1}</div>
        <div class="flow-body">
          <div class="flow-main">${row[0]}</div>
          ${row[1] ? `<div class="flow-aux">${row[1]}</div>` : ''}
        </div>
      </div>
    `).join('');
    nameEl.textContent = d.name;
    strengthEl.textContent = d.strength;
    prosEl.textContent = d.pros;
    consEl.textContent = d.cons;
  }
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    render(b.dataset.v);
  }));
  render('MAC');
})();

/* =====================================================================
 * Widget 4: NIAH ACCURACY BY SEQUENCE LENGTH
 * Plot accuracy vs sequence length for several models. Click to toggle.
 * ===================================================================== */
(function niahWidget() {
  const host = document.getElementById('niah-widget');
  if (!host) return;

  // Approximate numbers from RULER S-NIAH Pass-Key (paper Table 2).
  // We blend pass-key, number, and UUID for a single representative track.
  const LENGTHS = [2000, 4000, 8000, 16000];
  const MODELS = {
    "Titans (MAC)": { c: '#ff9b6a', data: [98, 97, 95, 94] },
    "Titans (Neural Mem.)": { c: '#ffd166', data: [95, 96, 94, 92] },
    "TTT":         { c: '#7be582', data: [98, 96, 90, 75] },
    "Gated DeltaNet": { c: '#cc7adb', data: [99, 95, 80, 50] },
    "Mamba2":      { c: '#5fa9ff', data: [99, 98, 73, 28] },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap">
        <canvas id="niahCanvas" width="540" height="340"></canvas>
      </div>
      <div class="controls">
        <p class="d-label">visible models</p>
        <div class="legend" id="niahLegend"></div>
        <p class="hint" style="font-size:13px;margin-top:8px">
          Titans hold their accuracy almost flat from 2K to 16K. Mamba2 and Gated DeltaNet — both
          fixed-state recurrent — crater past 8K.
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#niahCanvas');
  const ctx = devicePx(cv, 540, 340);
  const W = 540, H = 340;
  const padL = 50, padR = 24, padT = 26, padB = 50;
  const legend = host.querySelector('#niahLegend');

  const enabled = Object.fromEntries(Object.keys(MODELS).map(k => [k, true]));

  function px(i) {
    return padL + i / (LENGTHS.length - 1) * (W - padL - padR);
  }
  function py(a) {
    return H - padB - (a / 100) * (H - padT - padB);
  }

  function draw() {
    const bgCard = cssVar('--bg-card') || '#1a1c22';
    const fg = cssVar('--fg') || '#e8e8ee';
    const fgMute = cssVar('--fg-mute') || '#888';
    const rule = cssVar('--rule') || '#333';

    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    // gridlines
    ctx.strokeStyle = rule;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = fgMute;
    [0, 25, 50, 75, 100].forEach(a => {
      const y = py(a);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(a + '%', padL - 32, y + 4);
    });
    ctx.globalAlpha = 1;

    // axes
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, H - padB);
    ctx.lineTo(W - padR, H - padB);
    ctx.stroke();

    // x ticks
    LENGTHS.forEach((L, i) => {
      const x = px(i);
      ctx.strokeStyle = rule;
      ctx.beginPath(); ctx.moveTo(x, H - padB); ctx.lineTo(x, H - padB + 4); ctx.stroke();
      ctx.fillStyle = fgMute;
      const lbl = L >= 1000 ? `${L/1000}K` : String(L);
      ctx.fillText(lbl, x - 9, H - padB + 18);
    });

    // axis labels
    ctx.fillStyle = fgMute;
    ctx.fillText('sequence length', W/2 - 40, H - 8);
    ctx.save();
    ctx.translate(14, H/2 + 40);
    ctx.rotate(-Math.PI/2);
    ctx.fillText('S-NIAH accuracy (↑ better)', 0, 0);
    ctx.restore();

    // curves
    Object.entries(MODELS).forEach(([name, m]) => {
      if (!enabled[name]) return;
      ctx.strokeStyle = m.c;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      m.data.forEach((a, i) => {
        const x = px(i), y = py(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      m.data.forEach((a, i) => {
        const x = px(i), y = py(a);
        ctx.fillStyle = m.c;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 2*Math.PI); ctx.fill();
      });
      // annotate the last point
      ctx.fillStyle = m.c;
      ctx.font = '600 11px ui-monospace, monospace';
      const lastA = m.data[m.data.length - 1];
      ctx.fillText(`${lastA}%`, px(LENGTHS.length - 1) + 6, py(lastA) + 4);
    });
  }

  function renderLegend() {
    legend.innerHTML = Object.entries(MODELS).map(([name, m]) => `
      <label class="legend-row${enabled[name] ? '' : ' off'}" data-name="${name}">
        <span class="dot" style="background:${m.c}"></span>
        <span class="lname">${name}</span>
      </label>
    `).join('');
    legend.querySelectorAll('.legend-row').forEach(el => {
      el.addEventListener('click', () => {
        const n = el.dataset.name;
        enabled[n] = !enabled[n];
        renderLegend();
        draw();
      });
    });
  }
  renderLegend();
  draw();
})();

/* =====================================================================
 * Widget 5: MEMORY DEPTH TRADEOFF
 * Slider over L_M ∈ {1,2,3,4}. Show perplexity and throughput.
 * ===================================================================== */
(function depthWidget() {
  const host = document.getElementById('depth-widget');
  if (!host) return;

  // From paper Figure 5 (deep-memory-2.png, 360M params). Approximate values
  // read off the figure. Sequence length 16K.
  const DATA = [
    { L: 1, ppl: 14.8, throughput: 100 },
    { L: 2, ppl: 13.2, throughput: 70 },
    { L: 3, ppl: 12.5, throughput: 55 },
    { L: 4, ppl: 12.1, throughput: 44 },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="canvas-wrap">
        <canvas id="depthCanvas" width="520" height="280"></canvas>
      </div>
      <div class="controls">
        <div>
          <label class="ctl-label">memory depth $L_\\mathcal{M}$</label>
          <input type="range" id="depthSlider" min="0" max="3" step="1" value="1"/>
        </div>
        <div class="readout" id="depthReadout"></div>
        <p class="hint" style="font-size:13px">
          $L_\\mathcal{M} = 1$ is exactly the linear-RNN case ($\\mathcal{M} = Wx$). Deeper memories give
          strictly more expressive non-linear memorisation. The price is roughly linear in tokens/sec.
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#depthCanvas');
  const ctx = devicePx(cv, 520, 280);
  const W = 520, H = 280;
  const padL = 56, padR = 56, padT = 24, padB = 46;
  const slider = host.querySelector('#depthSlider');
  const readout = host.querySelector('#depthReadout');

  function draw() {
    const idx = parseInt(slider.value);
    const cur = DATA[idx];

    const bgCard = cssVar('--bg-card') || '#1a1c22';
    const fg = cssVar('--fg') || '#e8e8ee';
    const fgMute = cssVar('--fg-mute') || '#888';
    const rule = cssVar('--rule') || '#333';
    const blue = '#5fa9ff';
    const orange = cssVar('--accent') || '#ff9b6a';

    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    // Two y-axes: left = perplexity (blue), right = throughput (orange)
    function pxX(L) { return padL + (L - 1) / 3 * (W - padL - padR); }
    const minPpl = 11.5, maxPpl = 15.5;
    function pyL(p) { return H - padB - (p - minPpl) / (maxPpl - minPpl) * (H - padT - padB); }
    const minTp = 40, maxTp = 110;
    function pyR(t) { return H - padB - (t - minTp) / (maxTp - minTp) * (H - padT - padB); }

    // axes
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB);
    ctx.moveTo(W - padR, padT); ctx.lineTo(W - padR, H - padB);
    ctx.stroke();

    // grid + y-axis labels
    ctx.font = '11px ui-monospace, monospace';
    for (let p = 12; p <= 15; p++) {
      const y = pyL(p);
      ctx.strokeStyle = rule;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = blue;
      ctx.fillText(String(p), padL - 22, y + 4);
    }
    [50, 70, 90].forEach(t => {
      const y = pyR(t);
      ctx.fillStyle = orange;
      ctx.fillText(String(t), W - padR + 8, y + 4);
    });

    // x ticks
    DATA.forEach(d => {
      const x = pxX(d.L);
      ctx.strokeStyle = rule;
      ctx.beginPath(); ctx.moveTo(x, H - padB); ctx.lineTo(x, H - padB + 4); ctx.stroke();
      ctx.fillStyle = fgMute;
      ctx.fillText(`L=${d.L}`, x - 12, H - padB + 18);
    });

    // axis labels
    ctx.fillStyle = blue;
    ctx.fillText('perplexity (↓)', padL - 30, padT - 8);
    ctx.fillStyle = orange;
    ctx.fillText('throughput (↑)', W - padR - 30, padT - 8);
    ctx.fillStyle = fgMute;
    ctx.fillText('memory depth', W/2 - 35, H - 8);

    // ppl curve
    ctx.strokeStyle = blue;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    DATA.forEach((d, i) => {
      const x = pxX(d.L), y = pyL(d.ppl);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // throughput curve
    ctx.strokeStyle = orange;
    ctx.lineWidth = 2.6;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    DATA.forEach((d, i) => {
      const x = pxX(d.L), y = pyR(d.throughput);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // points (current highlighted)
    DATA.forEach((d, i) => {
      const x = pxX(d.L);
      const isCur = i === idx;

      ctx.fillStyle = isCur ? blue : bgCard;
      ctx.strokeStyle = blue;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, pyL(d.ppl), isCur ? 7 : 4, 0, 2*Math.PI); ctx.fill(); ctx.stroke();

      ctx.fillStyle = isCur ? orange : bgCard;
      ctx.strokeStyle = orange;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, pyR(d.throughput), isCur ? 7 : 4, 0, 2*Math.PI); ctx.fill(); ctx.stroke();
    });

    readout.innerHTML = `
      <div>$L_\\mathcal{M}$ = <b>${cur.L}</b></div>
      <div style="color:${blue}">perplexity = <b>${cur.ppl.toFixed(1)}</b></div>
      <div style="color:${orange}">throughput = <b>${cur.throughput}%</b> of $L{=}1$ baseline</div>
      <div style="margin-top:6px;font-size:12px;opacity:.7">
        ${cur.L === 1 ? 'equivalent to a linear RNN — the bottom of the depth ablation' :
          cur.L === 4 ? 'deepest in the paper — best perplexity, slowest throughput' :
          'intermediate depth — good practical tradeoff'}
      </div>
    `;
    if (window.renderMathInElement) {
      renderMathInElement(readout, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});
    }
  }

  slider.addEventListener('input', draw);
  draw();
})();
