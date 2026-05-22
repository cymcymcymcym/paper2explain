/* ELF blog interactive widgets. Plain JS / Canvas. No deps. */

/* ---------- theme toggle (same as Vision Banana) ---------- */
(function () {
  const toggle = document.getElementById('themeToggle');
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

/* =====================================================================
 * Widget 1: PATH COMPARISON
 * Two side-by-side animations: discrete (token unmasking) vs continuous
 * (embedding flow). Each runs in step. Play/pause/reset buttons.
 * ===================================================================== */
(function pathComparison() {
  const host = document.getElementById('path-comparison');
  if (!host) return;

  const targetTokens = ['the', 'cat', 'sat', 'on', 'the', 'mat'];
  const N = targetTokens.length;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="panel" id="discretePanel">
        <h4>Discrete diffusion (e.g. MDLM)</h4>
        <div class="tokens" id="discreteTokens"></div>
        <p class="step-label" id="discreteStep">step 0 / 6 · all masked</p>
      </div>
      <div class="panel" id="continuousPanel">
        <h4>Continuous diffusion (ELF)</h4>
        <canvas id="continuousCanvas" width="320" height="180"></canvas>
        <p class="step-label" id="continuousStep">step 0 / 64 · pure noise</p>
      </div>
    </div>
    <div class="controls">
      <button class="btn" id="ppPlay">▶ play</button>
      <button class="btn" id="ppReset">⟲ reset</button>
    </div>
  `);

  // discrete panel
  const dTokens = host.querySelector('#discreteTokens');
  const dStep = host.querySelector('#discreteStep');

  // continuous panel
  const cv = host.querySelector('#continuousCanvas');
  const ctx = devicePx(cv, 320, 180);
  const cStep = host.querySelector('#continuousStep');

  const cwidth = 320, cheight = 180;
  // anchor positions for tokens in 2D
  const anchors = [
    { x: 50, y: 50, tok: 'the' },
    { x: 110, y: 130, tok: 'cat' },
    { x: 170, y: 60, tok: 'sat' },
    { x: 220, y: 130, tok: 'on' },
    { x: 270, y: 50, tok: 'the' },
    { x: 290, y: 130, tok: 'mat' },
  ];
  // initial noise
  let particles;
  function resetParticles() {
    particles = [];
    for (let i = 0; i < N; i++) {
      particles.push({
        x: cwidth / 2 + (Math.random() - 0.5) * 60,
        y: cheight / 2 + (Math.random() - 0.5) * 60,
        targetIdx: i,
        token: '',
      });
    }
  }

  let discreteState; // array of N: 'mask' | tokenString
  let dT = 0; // discrete step counter
  const dTotal = 6;
  let cT = 0; // continuous step counter
  const cTotal = 64;
  let timer = null;

  function renderDiscrete() {
    dTokens.innerHTML = discreteState.map((t, i) => {
      if (t === 'mask') return '<span class="tok mask">[MASK]</span>';
      // freshly unmasked = highlight
      if (i === dLast) return `<span class="tok fresh">${t}</span>`;
      return `<span class="tok set">${t}</span>`;
    }).join('');
    const remaining = discreteState.filter(t => t === 'mask').length;
    dStep.textContent = `step ${dT} / ${dTotal} · ${remaining} masked`;
  }
  let dLast = -1;

  function drawContinuous() {
    ctx.clearRect(0, 0, cwidth, cheight);
    // anchors
    ctx.fillStyle = cssVar('--accent');
    anchors.forEach(a => {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cssVar('--fg-mute');
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(a.tok, a.x, a.y + 14);
      ctx.fillStyle = cssVar('--accent');
    });
    // particles
    particles.forEach((p, i) => {
      const blueShade = '#7aa6ff';
      const accentShade = cssVar('--accent') || '#c64f24';
      const t = cT / cTotal;
      const target = anchors[p.targetIdx];
      const x = (1 - t) * p.x + t * target.x;
      const y = (1 - t) * p.y + t * target.y;
      // color blend
      const ctxColor = cT >= cTotal ? accentShade : blueShade;
      ctx.fillStyle = ctxColor;
      ctx.beginPath();
      ctx.arc(x, y, cT >= cTotal ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    if (cT >= cTotal) {
      const phase = 'tokens snapped';
      cStep.textContent = `step ${cT} / ${cTotal} · ${phase}`;
    } else {
      cStep.textContent = `step ${cT} / ${cTotal} · t = ${(cT / cTotal).toFixed(2)}`;
    }
  }

  function reset() {
    stopTimer();
    discreteState = new Array(N).fill('mask');
    dT = 0;
    dLast = -1;
    cT = 0;
    resetParticles();
    renderDiscrete();
    drawContinuous();
    host.querySelector('#ppPlay').textContent = '▶ play';
  }

  function step() {
    let done = true;
    if (dT < dTotal) {
      // unmask one random token
      const masked = discreteState.map((t, i) => t === 'mask' ? i : -1).filter(i => i >= 0);
      const pick = masked[Math.floor(Math.random() * masked.length)];
      discreteState[pick] = targetTokens[pick];
      dLast = pick;
      dT++;
      renderDiscrete();
      done = false;
    }
    if (cT < cTotal) {
      cT += 1;
      drawContinuous();
      done = false;
    }
    if (done) {
      stopTimer();
      host.querySelector('#ppPlay').textContent = '▶ play';
    }
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function play() {
    if (timer) {
      stopTimer();
      host.querySelector('#ppPlay').textContent = '▶ play';
      return;
    }
    if (dT >= dTotal && cT >= cTotal) reset();
    host.querySelector('#ppPlay').textContent = '❚❚ pause';
    timer = setInterval(step, 250);
  }

  host.querySelector('#ppPlay').addEventListener('click', play);
  host.querySelector('#ppReset').addEventListener('click', reset);
  reset();
})();

/* =====================================================================
 * Widget 2: FLOW-VIZ (rectified-flow trajectory)
 * Slider for t. Particles linearly interpolate from noise to anchors.
 * Velocity field shown as arrows from selected sample points.
 * ===================================================================== */
(function flowViz() {
  const host = document.getElementById('flow-viz');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="flowCanvas" width="440" height="280"></canvas>
      <div class="controls">
        <div>
          <label style="font-family:var(--sans);font-size:13px;color:var(--fg-mute);">time t</label>
          <input type="range" id="flowT" min="0" max="1" step="0.01" value="0"/>
        </div>
        <div class="toggle-row">
          <button class="btn active" id="flowShowVel">show velocity field</button>
          <button class="btn" id="flowReshuffle">⟲ reshuffle noise</button>
        </div>
        <div class="readout" id="flowReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#flowCanvas');
  const ctx = devicePx(cv, 440, 280);
  const slider = host.querySelector('#flowT');
  const readout = host.querySelector('#flowReadout');
  const showVelBtn = host.querySelector('#flowShowVel');
  const reshuffleBtn = host.querySelector('#flowReshuffle');
  const W = 440, H = 280;

  let showVel = true;
  showVelBtn.onclick = () => {
    showVel = !showVel;
    showVelBtn.classList.toggle('active', showVel);
    draw();
  };

  const anchors = [
    { x: 90, y: 80, tok: 'the' },
    { x: 130, y: 200, tok: 'cat' },
    { x: 210, y: 70, tok: 'sat' },
    { x: 240, y: 220, tok: 'on' },
    { x: 320, y: 80, tok: 'the' },
    { x: 380, y: 200, tok: 'mat' },
  ];

  let particles;
  function reshuffle() {
    particles = [];
    const n = 20;
    for (let i = 0; i < n; i++) {
      const e = { x: W / 2 + (Math.random() - 0.5) * 200, y: H / 2 + (Math.random() - 0.5) * 100 };
      // pick nearest anchor as target
      let best = 0, bestD = Infinity;
      for (let k = 0; k < anchors.length; k++) {
        const d = (e.x - anchors[k].x) ** 2 + (e.y - anchors[k].y) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      particles.push({ e, targetIdx: best });
    }
  }
  reshuffleBtn.onclick = () => { reshuffle(); draw(); };
  reshuffle();

  function draw() {
    const t = parseFloat(slider.value);
    ctx.clearRect(0, 0, W, H);

    // background grid
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 0.5;
    for (let i = 0; i < W; i += 30) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    for (let i = 0; i < H; i += 30) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }

    // anchors
    anchors.forEach(a => {
      ctx.fillStyle = cssVar('--accent');
      ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = cssVar('--fg-mute');
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(a.tok, a.x, a.y + 16);
    });

    // velocity field arrows at every other particle (if shown)
    if (showVel) {
      ctx.strokeStyle = '#ff9b6a';
      ctx.fillStyle = '#ff9b6a';
      ctx.lineWidth = 1.2;
      particles.forEach((p, i) => {
        if (i % 2 !== 0) return;
        const start = { x: (1 - t) * p.e.x + t * anchors[p.targetIdx].x, y: (1 - t) * p.e.y + t * anchors[p.targetIdx].y };
        const target = anchors[p.targetIdx];
        const vx = target.x - p.e.x;
        const vy = target.y - p.e.y;
        const mag = Math.sqrt(vx * vx + vy * vy);
        const ux = vx / mag * 14, uy = vy / mag * 14;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(start.x + ux, start.y + uy);
        ctx.stroke();
        // arrow head
        ctx.save();
        ctx.translate(start.x + ux, start.y + uy);
        ctx.rotate(Math.atan2(uy, ux));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, -2);
        ctx.lineTo(-4, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }

    // particles (interpolated z_t)
    particles.forEach(p => {
      const x = (1 - t) * p.e.x + t * anchors[p.targetIdx].x;
      const y = (1 - t) * p.e.y + t * anchors[p.targetIdx].y;
      // lerp blue->accent
      const accent = cssVar('--accent') || '#c64f24';
      const c = lerpColor('#7aa6ff', accent, t);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // readout
    readout.innerHTML = `
      <div>t = <b>${t.toFixed(2)}</b></div>
      <div>z<sub>t</sub> = <b>${t.toFixed(2)} · x</b> + <b>${(1-t).toFixed(2)} · e</b></div>
      <div>v = x − e (constant along straight path)</div>
      <div style="margin-top:6px; color: var(--fg-mute); font-size: 11px;">
        ${t < 0.05 ? 'pure noise' : (t > 0.95 ? 'snapping to tokens' : 'flowing in continuous space')}
      </div>
    `;
  }

  function lerpColor(hex1, hex2, t) {
    const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const a = p(hex1), b = p(hex2);
    const r = a[0] + (b[0] - a[0]) * t;
    const g = a[1] + (b[1] - a[1]) * t;
    const bl = a[2] + (b[2] - a[2]) * t;
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)})`;
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: SNAP (final-step discretization)
 * Many embeddings approach token anchors as t -> 1; snap-to-token at t=1.
 * Hover/drag a moving embedding to see nearest-token decoding.
 * ===================================================================== */
(function snap() {
  const host = document.getElementById('snap');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="snapCanvas" width="640" height="280"></canvas>
    <div class="controls">
      <label>t =</label>
      <span class="t-readout" id="snapT">0.50</span>
      <input type="range" id="snapSlider" min="0" max="1" step="0.005" value="0.5"/>
    </div>
  `);

  const cv = host.querySelector('#snapCanvas');
  const ctx = devicePx(cv, 640, 280);
  const slider = host.querySelector('#snapSlider');
  const tReadout = host.querySelector('#snapT');

  const W = 640, H = 280;
  // Token "vocabulary" anchors in 2D embedding space
  const vocab = [
    { x: 80,  y: 50,  tok: 'the' },
    { x: 200, y: 90,  tok: 'cat' },
    { x: 340, y: 60,  tok: 'sat' },
    { x: 460, y: 100, tok: 'on' },
    { x: 560, y: 70,  tok: 'the' },
    { x: 100, y: 180, tok: 'dog' },
    { x: 240, y: 210, tok: 'mat' },
    { x: 380, y: 220, tok: 'sky' },
    { x: 510, y: 200, tok: 'sun' },
    { x: 580, y: 230, tok: 'run' },
  ];

  // Embedding test points (six of them, each targeting a specific token)
  const targets = [0, 1, 2, 3, 4, 6]; // "the cat sat on the mat"
  const noise = targets.map(() => ({
    x: W * 0.3 + Math.random() * W * 0.4,
    y: H * 0.4 + Math.random() * H * 0.3,
  }));

  function nearestToken(x, y) {
    let best = 0, bestD = Infinity;
    for (let k = 0; k < vocab.length; k++) {
      const d = (vocab[k].x - x) ** 2 + (vocab[k].y - y) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  function draw() {
    const t = parseFloat(slider.value);
    tReadout.textContent = t.toFixed(2);
    ctx.clearRect(0, 0, W, H);

    // grid
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 0.5;
    for (let i = 0; i < W; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    for (let i = 0; i < H; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }

    // vocab anchors
    ctx.fillStyle = cssVar('--accent');
    ctx.strokeStyle = cssVar('--accent');
    vocab.forEach(v => {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cssVar('--fg-mute');
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(v.tok, v.x + 8, v.y + 4);
      ctx.fillStyle = cssVar('--accent');
    });

    // For each embedding particle, determine current position by lerp
    // toward its target — but at t=1, we *snap* to nearest token via argmax.
    for (let i = 0; i < noise.length; i++) {
      const e = noise[i];
      const targetAnchor = vocab[targets[i]];
      let x, y, snapped, label;
      if (t < 1) {
        // continuous linear interpolation toward target embedding (which is x in the equation)
        x = (1 - t) * e.x + t * targetAnchor.x;
        y = (1 - t) * e.y + t * targetAnchor.y;
        snapped = false;
      } else {
        // t = 1: snap argmax to nearest vocab token
        const aboutTarget = { x: targetAnchor.x + (Math.random() - 0.5) * 4, y: targetAnchor.y + (Math.random() - 0.5) * 4 };
        const idx = nearestToken(aboutTarget.x, aboutTarget.y);
        x = vocab[idx].x;
        y = vocab[idx].y;
        snapped = true;
        label = vocab[idx].tok;
      }

      // line back to noise origin (faint)
      ctx.strokeStyle = '#7aa6ff44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      // current position
      ctx.fillStyle = snapped ? '#fff' : '#7aa6ff';
      ctx.strokeStyle = snapped ? cssVar('--accent') : 'transparent';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, snapped ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (snapped) ctx.stroke();

      if (snapped) {
        // big label
        ctx.fillStyle = cssVar('--accent');
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label.toUpperCase(), x, y - 12);
      }
    }

    // Status line
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const status = t < 0.99
      ? `denoise mode — embeddings flowing in continuous space (t = ${t.toFixed(2)})`
      : `decode mode — argmax W·xθ(z) → token`;
    ctx.fillText(status, 14, H - 10);
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: CFG SLIDER
 * Quality (low PPL) vs diversity (high entropy) trade-off curve.
 * Slide CFG scale, see point move along curve.
 * Numbers approximated from Figure 4 of the paper.
 * ===================================================================== */
(function cfgSlider() {
  const host = document.getElementById('cfg-slider');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="cfgCanvas" width="380" height="240"></canvas>
      <div class="controls">
        <div>
          <label style="font-family:var(--sans);font-size:13px;color:var(--fg-mute);">CFG scale ω</label>
          <input type="range" id="cfgScale" min="1" max="6" step="0.1" value="3"/>
        </div>
        <div class="readout" id="cfgReadout"></div>
        <p style="font-family:var(--sans); font-size:11px; color:var(--fg-mute); margin:6px 0 0;">
          Curve approximated from Fig. 4 of the paper. The actual paper sweeps multiple ELF variants;
          values shown here are a single best-fit curve.
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#cfgCanvas');
  const ctx = devicePx(cv, 380, 240);
  const slider = host.querySelector('#cfgScale');
  const readout = host.querySelector('#cfgReadout');
  const W = 380, H = 240;

  // Approximated points (CFG ω, PPL, entropy) from Fig 4 of paper
  // PPL is generative perplexity (lower better). Entropy is unigram entropy (higher better).
  function curve(omega) {
    // ω in [1, 6]. PPL drops from ~50 at ω=1 to ~22 at ω=4 then plateaus.
    // Entropy drops from ~6.6 at ω=1 to ~5.8 at ω=6.
    const ppl = 22 + 30 * Math.exp(-1.2 * (omega - 1));
    const entropy = 6.6 - 0.18 * (omega - 1) - 0.04 * (omega - 1) ** 1.2;
    return { ppl, entropy };
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const padL = 56, padR = 14, padT = 14, padB = 36;
    const w = W - padL - padR, h = H - padT - padB;

    // x axis = entropy (5.6 to 6.7), y axis = PPL (20 to 60)
    const xMin = 5.6, xMax = 6.7;
    const yMin = 20, yMax = 60;
    const sx = (e) => padL + (e - xMin) / (xMax - xMin) * w;
    const sy = (p) => padT + (1 - (p - yMin) / (yMax - yMin)) * h;

    // axes
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, w, h);
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [20, 30, 40, 50, 60].forEach(p => {
      ctx.fillText(p, padL - 4, sy(p));
      ctx.strokeStyle = cssVar('--rule');
      ctx.beginPath(); ctx.moveTo(padL, sy(p)); ctx.lineTo(padL + w, sy(p)); ctx.stroke();
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [5.8, 6.0, 6.2, 6.4, 6.6].forEach(e => {
      ctx.fillText(e.toFixed(1), sx(e), padT + h + 4);
      ctx.beginPath(); ctx.moveTo(sx(e), padT); ctx.lineTo(sx(e), padT + h); ctx.stroke();
    });
    // axis labels
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('unigram entropy (higher = more diverse →)', padL + w / 2, padT + h + 20);
    ctx.save();
    ctx.translate(14, padT + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Gen. PPL (lower = higher quality ↑)', 0, 0);
    ctx.restore();

    // trade-off curve
    ctx.strokeStyle = cssVar('--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    let first = true;
    for (let omega = 1; omega <= 6.05; omega += 0.05) {
      const { ppl, entropy } = curve(omega);
      const x = sx(entropy), y = sy(ppl);
      if (first) { ctx.moveTo(x, y); first = false; } else { ctx.lineTo(x, y); }
    }
    ctx.stroke();

    // current point
    const omega = parseFloat(slider.value);
    const { ppl, entropy } = curve(omega);
    const cx = sx(entropy), cy = sy(ppl);
    // dashed lines
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = cssVar('--fg-mute');
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, padT + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(padL, cy); ctx.stroke();
    ctx.setLineDash([]);
    // dot
    ctx.fillStyle = cssVar('--accent');
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();

    readout.innerHTML = `
      <div>ω (CFG scale) = <b>${omega.toFixed(1)}</b></div>
      <div>Gen. PPL = <b>${ppl.toFixed(1)}</b></div>
      <div>entropy = <b>${entropy.toFixed(2)}</b></div>
      <div style="margin-top:6px; color: var(--fg-mute); font-size: 11px;">
        ${omega < 1.5 ? 'very diverse, mediocre quality' : (omega > 4 ? 'high quality, low diversity' : 'sweet spot')}
      </div>
    `;
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 5: STEP QUALITY
 * Slider for # steps + ODE/SDE toggle, shows PPL at that config.
 * Curve approximated from Fig 3c of the paper.
 * ===================================================================== */
(function stepQuality() {
  const host = document.getElementById('step-quality');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="stepCanvas" width="380" height="240"></canvas>
      <div class="controls">
        <div>
          <label style="font-family:var(--sans);font-size:13px;color:var(--fg-mute);">sampling steps</label>
          <input type="range" id="stepCount" min="4" max="128" step="1" value="32"/>
        </div>
        <div class="toggle-row">
          <button class="btn active" id="stepSDE">SDE sampler</button>
          <button class="btn" id="stepODE">ODE sampler</button>
        </div>
        <div class="readout" id="stepReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#stepCanvas');
  const ctx = devicePx(cv, 380, 240);
  const slider = host.querySelector('#stepCount');
  const readout = host.querySelector('#stepReadout');
  const sdeBtn = host.querySelector('#stepSDE');
  const odeBtn = host.querySelector('#stepODE');
  const W = 380, H = 240;

  let sampler = 'SDE';
  sdeBtn.onclick = () => { sampler = 'SDE'; sdeBtn.classList.add('active'); odeBtn.classList.remove('active'); draw(); };
  odeBtn.onclick = () => { sampler = 'ODE'; odeBtn.classList.add('active'); sdeBtn.classList.remove('active'); draw(); };

  // Approximated from Fig 3c of paper.
  function pplOf(steps, sampler) {
    if (sampler === 'SDE') {
      // SDE: ~50 at 4 steps, ~30 at 8, ~25 at 16, ~23 at 32, ~22 at 64+
      return 22 + 60 * Math.exp(-0.18 * steps);
    } else {
      // ODE: ~80 at 4 steps, ~55 at 8, ~35 at 16, ~26 at 32, ~22 at 64+
      return 22 + 120 * Math.exp(-0.13 * steps);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const padL = 50, padR = 14, padT = 14, padB = 36;
    const w = W - padL - padR, h = H - padT - padB;

    const xMin = 0, xMax = 128;
    const yMin = 20, yMax = 110;
    const sx = (x) => padL + (x - xMin) / (xMax - xMin) * w;
    const sy = (p) => padT + (1 - (p - yMin) / (yMax - yMin)) * h;

    // axes
    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, w, h);
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [20, 40, 60, 80, 100].forEach(p => {
      ctx.fillText(p, padL - 4, sy(p));
      ctx.strokeStyle = cssVar('--rule');
      ctx.beginPath(); ctx.moveTo(padL, sy(p)); ctx.lineTo(padL + w, sy(p)); ctx.stroke();
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [8, 16, 32, 64, 128].forEach(s => {
      ctx.fillText(s, sx(s), padT + h + 4);
    });
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sampling steps', padL + w / 2, padT + h + 20);
    ctx.save();
    ctx.translate(14, padT + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Gen. PPL ↓', 0, 0);
    ctx.restore();

    // Plot both curves; highlight selected
    [['ODE', '#7aa6ff'], ['SDE', cssVar('--accent') || '#c64f24']].forEach(([s, col]) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = (s === sampler) ? 2.5 : 1.2;
      ctx.globalAlpha = (s === sampler) ? 1.0 : 0.4;
      ctx.beginPath();
      let first = true;
      for (let x = 4; x <= 128; x += 1) {
        const px = sx(x), py = sy(pplOf(x, s));
        if (first) { ctx.moveTo(px, py); first = false; } else { ctx.lineTo(px, py); }
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });

    // Legend
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7aa6ff';
    ctx.fillText('— ODE', padL + 10, padT + 14);
    ctx.fillStyle = cssVar('--accent');
    ctx.fillText('— SDE', padL + 60, padT + 14);

    // current point
    const steps = parseInt(slider.value);
    const ppl = pplOf(steps, sampler);
    const cx = sx(steps), cy = sy(ppl);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = cssVar('--fg-mute');
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, padT + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(padL, cy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cssVar('--accent');
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();

    readout.innerHTML = `
      <div>steps = <b>${steps}</b> · sampler = <b>${sampler}</b></div>
      <div>est. Gen. PPL = <b>${ppl.toFixed(1)}</b></div>
      <div style="margin-top:6px; color: var(--fg-mute); font-size: 11px;">
        ${steps <= 16 && sampler === 'ODE' ? 'ODE is poor at low step counts — try SDE' :
          steps >= 32 ? 'beyond ~32 steps, returns diminish' :
          'in the few-step regime, SDE has a clear edge'}
      </div>
    `;
  }

  slider.addEventListener('input', draw);
  draw();
})();
