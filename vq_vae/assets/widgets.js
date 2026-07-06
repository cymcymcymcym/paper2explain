/* vq_vae blog interactive widgets. Plain JS / Canvas. No deps. */

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
 * Widget 1: Quantize + straight-through gradient (flagship)
 * Drag the encoder output z_e(x) around a fixed codebook. See it snap to
 * its nearest neighbor, and watch the "gradient" get copied straight
 * through from z_q(x) back to z_e(x), unaltered.
 * ===================================================================== */
(function quantizeDrag() {
  const host = document.getElementById('quantize-drag');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="qCanvas" width="480" height="420"></canvas>
    <div class="controls">
      <p class="ctl-label">Drag the blue point (encoder output z<sub>e</sub>(x)).</p>
      <button class="btn" id="qVoronoi">show Voronoi cells</button>
      <div class="readout" id="qReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#qCanvas');
  const ctx = devicePx(cv, 480, 420);
  const voronoiBtn = host.querySelector('#qVoronoi');
  const readout = host.querySelector('#qReadout');
  const W = 480, H = 420;

  const CODES = [
    [-170, -110], [-40, -150], [110, -130], [180, 20], [140, 140],
    [10, 170], [-130, 130], [-190, 10], [30, 10],
  ].map(([x, y]) => [W / 2 + x, H / 2 + y]);

  let z = [W / 2 + 30, H / 2 + 10];
  let dragging = false;
  let showVoronoi = false;

  function nearest(p) {
    let best = 0, bestD = Infinity;
    CODES.forEach((c, i) => {
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    if (showVoronoi) {
      const imgData = ctx.createImageData(W, H);
      const step = 3;
      for (let py = 0; py < H; py += step) {
        for (let px = 0; px < W; px += step) {
          const idx = nearest([px, py]);
          const hue = (idx * 40) % 360;
          const [r, g, b] = hslToRgb(hue / 360, 0.35, 0.16);
          for (let dy = 0; dy < step; dy++) {
            for (let dx = 0; dx < step; dx++) {
              const x2 = px + dx, y2 = py + dy;
              if (x2 >= W || y2 >= H) continue;
              const o = (y2 * W + x2) * 4;
              imgData.data[o] = r; imgData.data[o + 1] = g; imgData.data[o + 2] = b; imgData.data[o + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const k = nearest(z);
    const zq = CODES[k];

    // line from z to zq
    ctx.strokeStyle = cssVar('--fg-mute'); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(z[0], z[1]); ctx.lineTo(zq[0], zq[1]); ctx.stroke();
    ctx.setLineDash([]);

    // codebook points
    CODES.forEach((c, i) => {
      ctx.beginPath(); ctx.arc(c[0], c[1], i === k ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = i === k ? cssVar('--accent') : '#8a7fd6';
      ctx.fill();
      ctx.fillStyle = cssVar('--fg'); ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('e' + (i + 1), c[0], c[1] - 14);
    });

    // z_e(x)
    ctx.beginPath(); ctx.arc(z[0], z[1], 8, 0, Math.PI * 2);
    ctx.fillStyle = '#5fa9ff'; ctx.fill();
    ctx.fillStyle = cssVar('--fg'); ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText('z_e(x)', z[0], z[1] + 24);

    readout.innerHTML = `
      <div>nearest codebook vector: <b>e${k + 1}</b> &mdash; this is z_q(x)</div>
      <div class="tag">Forward pass sends e${k + 1} to the decoder. Backward pass copies &nabla;<sub>z</sub>L from z_q(x) straight back to z_e(x) &mdash; the lookup itself has no real gradient.</div>
    `;
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function toLocal(e) {
    const rect = cv.getBoundingClientRect();
    const scaleX = W / rect.width, scaleY = H / rect.height;
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return [cx * scaleX, cy * scaleY];
  }
  cv.addEventListener('mousedown', (e) => { dragging = true; z = toLocal(e); draw(); });
  window.addEventListener('mousemove', (e) => { if (!dragging) return; z = toLocal(e); draw(); });
  window.addEventListener('mouseup', () => { dragging = false; });
  cv.addEventListener('touchstart', (e) => { dragging = true; z = toLocal(e); draw(); });
  cv.addEventListener('touchmove', (e) => { if (!dragging) return; z = toLocal(e); draw(); e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', () => { dragging = false; });

  voronoiBtn.addEventListener('click', () => {
    showVoronoi = !showVoronoi;
    voronoiBtn.classList.toggle('active', showVoronoi);
    draw();
  });

  draw();
})();

/* =====================================================================
 * Widget 2: Which term updates what
 * Click each of the three loss terms to see which parameters it trains.
 * ===================================================================== */
(function lossBreakdown() {
  const host = document.getElementById('loss-breakdown');
  if (!host) return;

  const TERMS = {
    recon: {
      label: 'reconstruction', eq: 'log p(x | z_q(x))',
      desc: 'Trains the decoder directly, and the encoder through the straight-through estimator. This is the only term the embeddings never see — the lookup blocks their gradient entirely.',
      targets: ['decoder', 'encoder'],
    },
    codebook: {
      label: 'codebook (VQ)', eq: '‖sg[z_e(x)] − e‖²',
      desc: 'Moves each codebook vector toward the encoder outputs assigned to it — a dictionary-learning update. sg[·] blocks gradient into the encoder, so this term trains only the embedding table.',
      targets: ['embeddings'],
    },
    commit: {
      label: 'commitment', eq: 'β‖z_e(x) − sg[e]‖²',
      desc: 'The opposite direction: pulls the encoder output toward its assigned codebook vector, so its output volume does not grow without bound. sg[·] here blocks gradient into the embeddings — only the encoder is trained.',
      targets: ['encoder'],
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="lbPicker"></div>
    <div class="loss-diagram" id="lbDiagram">
      <div class="loss-block" data-p="encoder">encoder</div>
      <div class="loss-block" data-p="embeddings">embeddings e</div>
      <div class="loss-block" data-p="decoder">decoder</div>
    </div>
    <div class="readout" id="lbReadout">Click a term above.</div>
  `);

  const picker = host.querySelector('#lbPicker');
  const diagram = host.querySelector('#lbDiagram');
  const readout = host.querySelector('#lbReadout');

  Object.entries(TERMS).forEach(([key, t]) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = `${t.label}`;
    b.dataset.key = key;
    picker.appendChild(b);
  });

  function select(key) {
    const t = TERMS[key];
    picker.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b.dataset.key === key));
    diagram.querySelectorAll('.loss-block').forEach(b => b.classList.toggle('active', t.targets.includes(b.dataset.p)));
    readout.innerHTML = `<code>${t.eq}</code><br>${t.desc}`;
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    select(btn.dataset.key);
  });

  select('recon');
})();

/* =====================================================================
 * Widget 3: EMA codebook update
 * The real exponential-moving-average update from the paper's appendix,
 * applied to a toy codebook vector as batches of assigned encoder
 * outputs arrive.
 * ===================================================================== */
(function emaUpdate() {
  const host = document.getElementById('ema-update');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="emaCanvas" width="480" height="280"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">&gamma; (decay)</label>
        <input type="range" id="emaGamma" min="0.5" max="0.995" step="0.005" value="0.99"/>
      </div>
      <button class="btn" id="emaStep">▶ next minibatch</button>
      <button class="btn" id="emaReset">↻ reset</button>
      <div class="readout" id="emaReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#emaCanvas');
  const ctx = devicePx(cv, 480, 280);
  const gammaSlider = host.querySelector('#emaGamma');
  const stepBtn = host.querySelector('#emaStep');
  const resetBtn = host.querySelector('#emaReset');
  const readout = host.querySelector('#emaReadout');
  const W = 480, H = 280;

  // Toy 1D scenario: the "true" batch mean drifts slowly, we track it via EMA.
  const N_BATCHES = 40;
  let batchMeans = [];
  let N_t = 0, m_t = 0, history = [];

  function genBatchMeans() {
    let v = 0;
    const arr = [];
    for (let i = 0; i < N_BATCHES; i++) {
      v += (Math.random() - 0.5) * 0.9;
      arr.push(v);
    }
    return arr;
  }

  function reset() {
    batchMeans = genBatchMeans();
    N_t = 0; m_t = 0; history = [];
    draw();
  }

  function step() {
    if (history.length >= N_BATCHES) return;
    const gamma = parseFloat(gammaSlider.value);
    const t = history.length;
    const n_i = 8; // toy batch count assigned to this code
    N_t = N_t * gamma + n_i * (1 - gamma);
    m_t = m_t * gamma + (batchMeans[t] * n_i) * (1 - gamma);
    const e_t = N_t > 1e-8 ? m_t / N_t : batchMeans[t];
    history.push(e_t);
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const padL = 40, padR = 14;
    const pT = 16, pB = 30;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule');
    const xPix = (i) => padL + (i / (N_BATCHES - 1)) * (W - padL - padR);
    const allVals = batchMeans.concat(history);
    const yMin = Math.min(...allVals) - 0.5, yMax = Math.max(...allVals) + 0.5;
    const yPix = (v) => pT + (1 - (v - yMin) / (yMax - yMin)) * (H - pT - pB);

    ctx.strokeStyle = rule; ctx.fillStyle = fg; ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yPix(0)); ctx.lineTo(W - padR, yPix(0)); ctx.stroke();

    // batch means (grey dots)
    batchMeans.forEach((v, i) => {
      ctx.beginPath(); ctx.arc(xPix(i), yPix(v), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = fg; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    });

    // EMA trace
    if (history.length > 0) {
      ctx.beginPath(); ctx.strokeStyle = cssVar('--accent'); ctx.lineWidth = 2.4;
      history.forEach((v, i) => { const x = xPix(i), y = yPix(v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      const last = history[history.length - 1];
      ctx.beginPath(); ctx.arc(xPix(history.length - 1), yPix(last), 5, 0, Math.PI * 2);
      ctx.fillStyle = cssVar('--accent'); ctx.fill();
    }

    ctx.textAlign = 'left'; ctx.fillStyle = fg; ctx.font = '12px sans-serif';
    ctx.fillText('grey = incoming batch means · orange = e_i (EMA codebook vector)', padL, 14);

    readout.innerHTML = `
      <div>minibatches processed: <b>${history.length}</b> / ${N_BATCHES}</div>
      <div>current e<sub>i</sub>: <b>${history.length ? history[history.length - 1].toFixed(3) : '—'}</b></div>
      <div class="tag">${parseFloat(gammaSlider.value) > 0.95 ? 'high γ — smooth, slow to adapt, resistant to noisy batches' : 'low γ — fast, jumpy, tracks recent batches closely'}</div>
    `;
  }

  gammaSlider.addEventListener('input', draw);
  stepBtn.addEventListener('click', step);
  resetBtn.addEventListener('click', reset);
  reset();
})();

/* =====================================================================
 * Widget 4: Compression ratio calculator
 * The exact formula from the paper: raw bits vs. discrete latent bits.
 * ===================================================================== */
(function compressionCalc() {
  const host = document.getElementById('compression-calc');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="controls">
      <div>
        <label class="ctl-label">Image size (H = W)</label>
        <input type="range" id="ccSize" min="32" max="256" step="8" value="128"/>
      </div>
      <div>
        <label class="ctl-label">Latent grid downsampling factor</label>
        <input type="range" id="ccDown" min="2" max="16" step="1" value="4"/>
      </div>
      <div>
        <label class="ctl-label">Codebook size K</label>
        <input type="range" id="ccK" min="1" max="10" step="1" value="9"/>
      </div>
      <div class="readout" id="ccReadout"></div>
    </div>
  `);

  const sizeSlider = host.querySelector('#ccSize');
  const downSlider = host.querySelector('#ccDown');
  const kSlider = host.querySelector('#ccK');
  const readout = host.querySelector('#ccReadout');

  function draw() {
    const size = parseInt(sizeSlider.value, 10);
    const down = parseInt(downSlider.value, 10);
    const kExp = parseInt(kSlider.value, 10);
    const K = Math.pow(2, kExp);
    const latentSide = Math.round(size / down);
    const rawBits = size * size * 3 * 8;
    const latentBits = latentSide * latentSide * kExp;
    const ratio = rawBits / latentBits;

    readout.innerHTML = `
      <div>raw image: <b>${size}×${size}×3</b> @ 8 bits &rarr; <b>${rawBits.toLocaleString()}</b> bits</div>
      <div>discrete latent: <b>${latentSide}×${latentSide}×1</b>, K=${K} (log&#8322;K=${kExp} bits/code) &rarr; <b>${latentBits.toLocaleString()}</b> bits</div>
      <div>compression ratio: <b>${ratio.toFixed(1)}×</b> ${Math.abs(size - 128) < 1 && down === 4 && kExp === 9 ? '<span class="tag">— this is the paper\'s own ImageNet setting</span>' : ''}</div>
    `;
  }

  [sizeSlider, downSlider, kSlider].forEach(s => s.addEventListener('input', draw));
  draw();
})();
