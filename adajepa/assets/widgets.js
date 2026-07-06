/* adajepa blog interactive widgets. Plain JS / Canvas. No deps. */

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

/* ---------- shared helpers ---------- */
function devicePx(canvas, cssW, cssH) {
  canvas.width = cssW * 2;
  canvas.height = cssH * 2;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  return ctx;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function lerp(a, b, t) { return a + (b - a) * t; }

/* =====================================================================
 * Widget 1: The plan-execute-adapt loop
 * Click through the five stages of one MPC replanning cycle.
 * ===================================================================== */
(function loopStepper() {
  const host = document.getElementById('loop-stepper');
  if (!host) return;

  const STAGES = [
    { label: 'Plan', desc: 'Optimize an action sequence (horizon H=25) against the current — possibly already-adapted — world model, using gradient descent or CEM.' },
    { label: 'Execute', desc: 'Take only the first action chunk (5 low-level actions) of the plan. Do not execute the whole plan blind.' },
    { label: 'Observe', desc: 'Record the real transition (o_t, a_t, o_{t+1}) that just happened — this is ground truth the model did not have during pretraining.' },
    { label: 'Adapt', desc: 'Take exactly 1 gradient step on the same self-supervised prediction loss used in pretraining, applied to this one real transition, updating only a small parameter subset.' },
    { label: 'Replan', desc: 'Go back to Plan — but now with a model that has seen one more piece of real, possibly out-of-distribution, evidence.' },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="loop-diagram" id="loopDiagram"></div>
    <p class="arch-detail" id="loopDetail">${STAGES[0].desc}</p>
    <div class="loop-nav">
      <button class="btn" id="loopPrev">← prev</button>
      <button class="btn" id="loopNext">next →</button>
      <button class="btn" id="loopPlay">▶ auto-cycle</button>
    </div>
  `);

  const diagram = host.querySelector('#loopDiagram');
  STAGES.forEach((s, i) => {
    const angle = (i / STAGES.length) * Math.PI * 2 - Math.PI / 2;
    const cx = 50 + 38 * Math.cos(angle);
    const cy = 48 + 38 * Math.sin(angle);
    const el = document.createElement('button');
    el.className = 'loop-node' + (i === 0 ? ' active' : '');
    el.style.left = cx + '%'; el.style.top = cy + '%';
    el.textContent = s.label;
    el.dataset.i = i;
    diagram.appendChild(el);
  });

  const detail = host.querySelector('#loopDetail');
  let current = 0;
  let playing = false, timer = null;

  function render() {
    diagram.querySelectorAll('.loop-node').forEach((n, i) => n.classList.toggle('active', i === current));
    detail.innerHTML = `<strong>${STAGES[current].label}.</strong> ${STAGES[current].desc}`;
  }

  diagram.addEventListener('click', (e) => {
    const node = e.target.closest('.loop-node');
    if (!node) return;
    current = parseInt(node.dataset.i, 10);
    render();
  });
  host.querySelector('#loopPrev').addEventListener('click', () => { current = (current - 1 + STAGES.length) % STAGES.length; render(); });
  host.querySelector('#loopNext').addEventListener('click', () => { current = (current + 1) % STAGES.length; render(); });
  host.querySelector('#loopPlay').addEventListener('click', (e) => {
    playing = !playing;
    e.target.textContent = playing ? '⏸ pause' : '▶ auto-cycle';
    if (playing) {
      timer = setInterval(() => { current = (current + 1) % STAGES.length; render(); }, 1400);
    } else clearInterval(timer);
  });
  render();
})();

/* =====================================================================
 * Widget 2: Frozen vs. adaptive over the episode
 * Success rate vs. MPC step, for a seen shape ("T") vs. an unseen shape
 * ("square") — frozen plateaus early, AdaJEPA keeps climbing. Curve
 * shapes are illustrative; endpoints match the paper's reported numbers.
 * ===================================================================== */
(function frozenVsAdaptive() {
  const host = document.getElementById('frozen-vs-adaptive');
  if (!host) return;

  const SCENARIOS = {
    seen: { label: 'seen shape ("T")', frozenEnd: 50.0, adaptEnd: 88.0, plateauStep: 5 },
    unseen: { label: 'unseen shape ("square")', frozenEnd: 20.0, adaptEnd: 50.7, plateauStep: 6 },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="fvaPicker"></div>
    <canvas id="fvaCanvas" width="560" height="300"></canvas>
    <div class="readout" id="fvaReadout"></div>
  `);

  const picker = host.querySelector('#fvaPicker');
  const cv = host.querySelector('#fvaCanvas');
  const ctx = devicePx(cv, 560, 300);
  const readout = host.querySelector('#fvaReadout');
  const W = 560, H = 300;
  const N_STEPS = 20;

  Object.keys(SCENARIOS).forEach((key, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 1 ? ' active' : '');
    b.textContent = SCENARIOS[key].label;
    b.dataset.key = key;
    picker.appendChild(b);
  });
  let current = 'unseen';

  function frozenCurve(s) {
    return Array.from({ length: N_STEPS + 1 }, (_, k) => s.frozenEnd * (1 - Math.exp(-k / s.plateauStep)));
  }
  function adaptCurve(s) {
    return Array.from({ length: N_STEPS + 1 }, (_, k) => s.adaptEnd * (1 - Math.exp(-k / (N_STEPS * 0.55))));
  }

  function draw() {
    const s = SCENARIOS[current];
    const frozen = frozenCurve(s), adapt = adaptCurve(s);
    const padL = 42, padR = 16, padT = 16, padB = 30;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);
    const xPix = (k) => padL + (k / N_STEPS) * (W - padL - padR);
    const yPix = (v) => padT + (1 - v / 100) * (H - padT - padB);

    ctx.strokeStyle = rule; ctx.fillStyle = fg; ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(v => {
      const y = yPix(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v + '%', padL - 6, y + 3);
    });
    ctx.textAlign = 'center'; ctx.fillText('MPC replanning step →', (padL + W - padR) / 2, H - 8);

    function plot(series, color) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.4;
      series.forEach((v, k) => { const x = xPix(k), y = yPix(v); if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    }
    plot(frozen, '#e0745a');
    plot(adapt, '#37b073');

    ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#e0745a'; ctx.fillText('frozen — plateaus early', padL + 6, yPix(frozen[N_STEPS]) - 8);
    ctx.fillStyle = '#37b073'; ctx.fillText('AdaJEPA — keeps climbing', padL + 6, 28);

    readout.innerHTML = `
      <div>final success rate — frozen: <b>${frozen[N_STEPS].toFixed(1)}%</b> &middot; AdaJEPA: <b>${adapt[N_STEPS].toFixed(1)}%</b></div>
      <div class="tag">Curve shape is illustrative; endpoints match the paper's reported numbers for this scenario.</div>
    `;
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    current = btn.dataset.key;
    picker.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });
  draw();
})();

/* =====================================================================
 * Widget 3: Data efficiency
 * Real numbers: adapting a model trained on 1k trajectories beats a
 * frozen model trained on 16x more data.
 * ===================================================================== */
(function dataEfficiency() {
  const host = document.getElementById('data-efficiency');
  if (!host) return;

  const BARS = [
    { label: 'Frozen, 1k trajectories', value: 28.1, color: '#e0745a' },
    { label: 'AdaJEPA, 1k trajectories', value: 60.8, color: '#37b073' },
    { label: 'Frozen, 16k trajectories (16× the data)', value: 43.5, color: '#e0b400' },
  ];

  host.insertAdjacentHTML('beforeend', `<canvas id="dataCanvas" width="560" height="260"></canvas><div class="readout" id="dataReadout"></div>`);
  const cv = host.querySelector('#dataCanvas');
  const ctx = devicePx(cv, 560, 260);
  const readout = host.querySelector('#dataReadout');
  const W = 560, H = 260;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const padL = 14, padR = 14, padT = 20, padB = 60;
    const rowW = (W - padL - padR) / BARS.length;
    const maxV = 70;
    BARS.forEach((b, i) => {
      const x0 = padL + i * rowW + rowW * 0.18;
      const barW = rowW * 0.64;
      const barH = (b.value / maxV) * (H - padT - padB);
      const y0 = H - padB - barH;
      ctx.fillStyle = b.color; ctx.globalAlpha = 0.85;
      ctx.fillRect(x0, y0, barW, barH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar('--fg'); ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(b.value.toFixed(1) + '%', x0 + barW / 2, y0 - 8);
      ctx.font = '11.5px sans-serif'; ctx.fillStyle = cssVar('--fg-mute');
      const words = b.label.split(' ');
      let line = '', ly = H - padB + 16;
      words.forEach(w => {
        if ((line + ' ' + w).trim().length > 18) {
          ctx.fillText(line.trim(), x0 + barW / 2, ly); line = w; ly += 13;
        } else line += ' ' + w;
      });
      ctx.fillText(line.trim(), x0 + barW / 2, ly);
    });
    readout.innerHTML = `<div>A model adapted online on just <b>1,000</b> trajectories beats a frozen model trained on <b>16,000</b> (16×) — shape diversity plus test-time adaptation beats raw volume alone.</div>`;
  }
  draw();
})();

/* =====================================================================
 * Widget 4: Which parameters to adapt
 * Qualitative comparison of adaptation-target variants — all beat
 * frozen; predlast+enclast is the consistently competitive default.
 * ===================================================================== */
(function layerAblation() {
  const host = document.getElementById('layer-ablation');
  if (!host) return;

  const VARIANTS = [
    { label: 'frozen (no adaptation)', rel: 0, note: 'baseline — no adaptation at all' },
    { label: 'predlast + enclast (default)', rel: 1.0, note: 'consistently competitive across shift types — the recommended default' },
    { label: 'predfirst + enclast', rel: 0.95, note: 'best specifically under layout/maze shifts — closer to the action/latent input' },
    { label: 'predlast + encfrozen', rel: 0.75, note: 'still beats frozen for shape shifts; underperforms for visual/layout shifts (mismatch enters at the encoder)' },
    { label: 'LoRA (rank 8, every linear layer)', rel: 0.85, note: 'competitive, more parameter-efficient adapter-style alternative' },
  ];

  host.insertAdjacentHTML('beforeend', `<canvas id="layerCanvas" width="560" height="260"></canvas><div class="readout" id="layerReadout">All variants beat the frozen baseline; the choice of exactly which layers to adapt matters far less than the decision to adapt at all.</div>`);
  const cv = host.querySelector('#layerCanvas');
  const ctx = devicePx(cv, 560, 260);
  const W = 560, H = 260;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const padL = 210, padR = 40, padT = 10, padB = 10;
    const rowH = (H - padT - padB) / VARIANTS.length;
    VARIANTS.forEach((v, i) => {
      const y = padT + i * rowH + rowH * 0.28;
      const barH = rowH * 0.48;
      const barW = v.rel * (W - padL - padR);
      ctx.fillStyle = v.rel === 0 ? cssVar('--fg-mute') : cssVar('--accent');
      ctx.globalAlpha = v.rel === 0 ? 0.4 : 0.85;
      ctx.fillRect(padL, y, Math.max(2, barW), barH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar('--fg'); ctx.font = '12.5px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(v.label, padL - 10, y + barH * 0.7);
    });
  }
  draw();
})();
