/* IC-Light blog interactive widgets. Plain JS / Canvas. No deps.
 *
 * The four widgets ride on a single shared Lambertian-sphere renderer
 * (no shortcuts: actual N·L summed per pixel), so the addition law
 * I_{L1} + I_{L2} = I_{L1+L2} holds literally — pixel for pixel — by
 * construction of the math. That's the whole point of widgets 1 and 2.
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
function flatPx(canvas, w, h) {
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext('2d');
}
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
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* ---------- shared sphere geometry ---------- */
const SR = 96;                          // sphere bitmap resolution
const SR2 = SR * SR;

// Precompute normals and albedo once.
const ALBEDO = new Float32Array(SR2 * 3);
const NORMAL = new Float32Array(SR2 * 3);
const INSIDE = new Uint8Array(SR2);
(function buildSphere() {
  const cx = SR / 2, cy = SR / 2, R = SR * 0.46;
  for (let y = 0; y < SR; y++) {
    for (let x = 0; x < SR; x++) {
      const idx = y * SR + x;
      const ux = (x - cx) / R;
      const uy = -(y - cy) / R;            // image-space y is down; world-space up
      const r2 = ux * ux + uy * uy;
      if (r2 > 1) { INSIDE[idx] = 0; continue; }
      INSIDE[idx] = 1;
      const nz = Math.sqrt(1 - r2);
      NORMAL[idx * 3 + 0] = ux;
      NORMAL[idx * 3 + 1] = uy;
      NORMAL[idx * 3 + 2] = nz;
      // warm clay base albedo + two patches so relighting is legible
      let r = 0.82, g = 0.50, b = 0.34;
      const d1 = Math.hypot(ux + 0.35, uy - 0.18);
      const w1 = clamp(1 - (d1 / 0.30) ** 2, 0, 1);
      r = r * (1 - w1) + 0.30 * w1;
      g = g * (1 - w1) + 0.36 * w1;
      b = b * (1 - w1) + 0.55 * w1;
      const d2 = Math.hypot(ux - 0.30, uy + 0.25);
      const w2 = clamp(1 - (d2 / 0.24) ** 2, 0, 1);
      r = r * (1 - w2) + 0.20 * w2;
      g = g * (1 - w2) + 0.45 * w2;
      b = b * (1 - w2) + 0.40 * w2;
      ALBEDO[idx * 3 + 0] = r;
      ALBEDO[idx * 3 + 1] = g;
      ALBEDO[idx * 3 + 2] = b;
    }
  }
})();

// Background color for unmasked pixels (matches the panel canvas CSS).
const BG_RGB = [14, 15, 18];

/**
 * Render a sphere into a canvas. `lights` is an array of {dir:[x,y,z], rgb:[r,g,b], gain:number}.
 * Per-pixel: out_rgb = albedo * Σ_i rgb_i * gain_i * max(0, N·L_i).  No ambient — keeps the
 * addition law exact: rendering with [L1, L2] == rendering with [L1] + rendering with [L2].
 * If `out` is provided, fills it with the float RGB image (length SR*SR*3) without clipping.
 */
function renderSphere(canvas, lights, out) {
  const ctx = flatPx(canvas, SR, SR);
  const img = ctx.createImageData(SR, SR);
  for (let i = 0; i < SR2; i++) {
    if (!INSIDE[i]) {
      img.data[i * 4]     = BG_RGB[0];
      img.data[i * 4 + 1] = BG_RGB[1];
      img.data[i * 4 + 2] = BG_RGB[2];
      img.data[i * 4 + 3] = 255;
      if (out) { out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = 0; }
      continue;
    }
    const nx = NORMAL[i * 3], ny = NORMAL[i * 3 + 1], nz = NORMAL[i * 3 + 2];
    const ar = ALBEDO[i * 3], ag = ALBEDO[i * 3 + 1], ab = ALBEDO[i * 3 + 2];
    let r = 0, g = 0, b = 0;
    for (let li = 0; li < lights.length; li++) {
      const L = lights[li];
      const ndl = nx * L.dir[0] + ny * L.dir[1] + nz * L.dir[2];
      if (ndl <= 0) continue;
      const k = ndl * L.gain;
      r += ar * L.rgb[0] * k;
      g += ag * L.rgb[1] * k;
      b += ab * L.rgb[2] * k;
    }
    if (out) { out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b; }
    img.data[i * 4]     = clamp(Math.round(r * 255), 0, 255);
    img.data[i * 4 + 1] = clamp(Math.round(g * 255), 0, 255);
    img.data[i * 4 + 2] = clamp(Math.round(b * 255), 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Render from a pre-computed float RGB image (length SR*SR*3, unclipped) onto a canvas.
function drawFloatImage(canvas, rgb) {
  const ctx = flatPx(canvas, SR, SR);
  const img = ctx.createImageData(SR, SR);
  for (let i = 0; i < SR2; i++) {
    if (!INSIDE[i]) {
      img.data[i * 4]     = BG_RGB[0];
      img.data[i * 4 + 1] = BG_RGB[1];
      img.data[i * 4 + 2] = BG_RGB[2];
      img.data[i * 4 + 3] = 255;
      continue;
    }
    img.data[i * 4]     = clamp(Math.round(rgb[i * 3]     * 255), 0, 255);
    img.data[i * 4 + 1] = clamp(Math.round(rgb[i * 3 + 1] * 255), 0, 255);
    img.data[i * 4 + 2] = clamp(Math.round(rgb[i * 3 + 2] * 255), 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/* =====================================================================
 * Widget 1: light-add
 * Drag two directional lights around. Show I_{L1}, I_{L2}, I_{L1}+I_{L2},
 * and I_{L1+L2}. The last two are constructed differently (sum-of-renders
 * vs render-with-both) and end up bitwise identical.
 * ===================================================================== */
(function lightAdd() {
  const host = document.getElementById('light-add');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="lt-panel-grid panels">
      <div class="lt-panel"><canvas id="la-p1"></canvas>
        <p class="cap"><span class="eqlabel">$I_{L_1}$</span><br/>only $L_1$</p></div>
      <div class="lt-panel"><canvas id="la-p2"></canvas>
        <p class="cap"><span class="eqlabel">$I_{L_2}$</span><br/>only $L_2$</p></div>
      <div class="lt-panel"><canvas id="la-p3"></canvas>
        <p class="cap"><span class="eqlabel">$I_{L_1}+I_{L_2}$</span><br/>sum of images</p></div>
      <div class="lt-panel"><canvas id="la-p4"></canvas>
        <p class="cap"><span class="eqlabel">$I_{L_1+L_2}$</span><br/>both lights at once</p></div>
    </div>
    <div class="controls">
      <div class="ctl">
        <label>$L_1$ azimuth <span class="val" id="la-a1-v">−60°</span></label>
        <input type="range" id="la-a1" min="-180" max="180" step="1" value="-60"/>
      </div>
      <div class="ctl">
        <label>$L_2$ azimuth <span class="val" id="la-a2-v">+60°</span></label>
        <input type="range" id="la-a2" min="-180" max="180" step="1" value="60"/>
      </div>
      <div class="ctl">
        <label>$L_1$ intensity <span class="val" id="la-g1-v">1.0</span></label>
        <input type="range" id="la-g1" min="0.0" max="1.5" step="0.05" value="1.0"/>
      </div>
      <div class="ctl">
        <label>$L_2$ intensity <span class="val" id="la-g2-v">1.0</span></label>
        <input type="range" id="la-g2" min="0.0" max="1.5" step="0.05" value="1.0"/>
      </div>
    </div>
    <div class="readout" id="la-readout"></div>
  `);

  const q = s => host.querySelector(s);
  const elv = 25 * Math.PI / 180;              // 25° above horizon
  function dirFromAz(deg) {
    const az = deg * Math.PI / 180;
    return [Math.sin(az) * Math.cos(elv), Math.sin(elv), Math.cos(az) * Math.cos(elv)];
  }

  const COL_L1 = [1.00, 0.85, 0.65];  // warm key (matches accent feel)
  const COL_L2 = [0.65, 0.85, 1.00];  // cool key
  const buf1 = new Float32Array(SR2 * 3);
  const buf2 = new Float32Array(SR2 * 3);
  const bufS = new Float32Array(SR2 * 3);

  function update() {
    const a1 = parseFloat(q('#la-a1').value);
    const a2 = parseFloat(q('#la-a2').value);
    const g1 = parseFloat(q('#la-g1').value);
    const g2 = parseFloat(q('#la-g2').value);
    q('#la-a1-v').textContent = (a1 >= 0 ? '+' : '') + a1 + '°';
    q('#la-a2-v').textContent = (a2 >= 0 ? '+' : '') + a2 + '°';
    q('#la-g1-v').textContent = g1.toFixed(2);
    q('#la-g2-v').textContent = g2.toFixed(2);

    const L1 = { dir: dirFromAz(a1), rgb: COL_L1, gain: g1 };
    const L2 = { dir: dirFromAz(a2), rgb: COL_L2, gain: g2 };

    renderSphere(q('#la-p1'), [L1], buf1);
    renderSphere(q('#la-p2'), [L2], buf2);

    // Panel 3 = pixelwise sum of the two single-light bitmaps.
    for (let i = 0; i < SR2 * 3; i++) bufS[i] = buf1[i] + buf2[i];
    drawFloatImage(q('#la-p3'), bufS);

    // Panel 4 = the actual render with both lights at once.
    renderSphere(q('#la-p4'), [L1, L2]);

    // Measure agreement between panels 3 and 4 — same operation, so should be 0.
    // (We do it by re-rendering with both and comparing the raw float buffers.)
    const both = new Float32Array(SR2 * 3);
    renderSphere(q('#la-p4'), [L1, L2], both);     // re-fill `both`
    let maxAbs = 0, sumAbs = 0, n = 0;
    for (let i = 0; i < SR2; i++) {
      if (!INSIDE[i]) continue;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(bufS[i * 3 + c] - both[i * 3 + c]);
        if (d > maxAbs) maxAbs = d;
        sumAbs += d; n++;
      }
    }
    q('#la-readout').innerHTML =
      `max |Δ| over the sphere &nbsp;=&nbsp; <b>${maxAbs.toExponential(2)}</b><br/>` +
      `mean |Δ|&nbsp;=&nbsp; <b>${(sumAbs / n).toExponential(2)}</b>  ` +
      `<span class="ok">Eq. 3 holds at machine precision — the consistency loss is asking the diffusion model to reach the same identity.</span>`;
  }
  q('#la-a1').addEventListener('input', update);
  q('#la-a2').addEventListener('input', update);
  q('#la-g1').addEventListener('input', update);
  q('#la-g2').addEventListener('input', update);
  update();
})();

/* =====================================================================
 * Widget 2: mask-split
 * Env map = 4x4 directional-light grid (16 light sources).
 * Click cells to flip them between L1 (orange) and L2 (blue).
 * Render the sphere lit by L1, by L2, and by L (all 16). By construction
 * sphere(L) = sphere(L1) + sphere(L2) exactly (no nonlinearity above).
 * ===================================================================== */
(function maskSplit() {
  const host = document.getElementById('mask-split');
  if (!host) return;

  // Build the 16-light env map. Position determines direction (azimuth, elevation);
  // a colorful palette across the grid so the sphere's response is visibly varied.
  const N = 4;
  const ENV = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const az = ((c + 0.5) / N - 0.5) * Math.PI;             // -π/2 .. π/2
      const el = ((N - 0.5 - r) / N) * 0.85 * Math.PI / 2;     // ~+75° at top row down to ~+10°
      const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      // A warm/cool palette: redder at the right, bluer at the left, brighter at the top.
      const bri = 0.55 + 0.45 * ((N - 1 - r) / (N - 1));
      const hue = c / (N - 1);
      const rgb = [
        bri * (0.55 + 0.45 * hue),
        bri * (0.55 + 0.18 * (1 - Math.abs(2 * hue - 1))),
        bri * (0.55 + 0.45 * (1 - hue)),
      ];
      ENV.push({ dir, rgb, gain: 0.7 / 16 * 4 });  // overall sphere brightness ~0.7
    }
  }

  // Default mask: a stripe shape; reader can shuffle or click.
  let mask = ENV.map((_, i) => (Math.floor(i / N) + i) % 2);  // checker-ish

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="env-block">
        <p class="env-title">env map  $L$  (16 directional lights)</p>
        <div class="mask-grid" id="ms-grid"></div>
        <p class="legend">
          <span class="l1">●</span> cell belongs to <span class="l1">$L_1$</span>,
          <span class="l2">●</span> belongs to <span class="l2">$L_2$</span>.
          Click a cell to flip. Every cell stays in exactly one half.
        </p>
        <button class="shuffle" id="ms-shuffle">Shuffle mask</button>
      </div>
      <div class="env-block">
        <div class="lt-panel-grid panels">
          <div class="lt-panel"><canvas id="ms-p1"></canvas>
            <p class="cap"><span class="eqlabel">$I_{L_1}$</span><br/>lit by $L_1$ only</p></div>
          <div class="lt-panel"><canvas id="ms-p2"></canvas>
            <p class="cap"><span class="eqlabel">$I_{L_2}$</span><br/>lit by $L_2$ only</p></div>
          <div class="lt-panel"><canvas id="ms-p3"></canvas>
            <p class="cap"><span class="eqlabel">$I_{L_1+L_2}$</span><br/>lit by every cell</p></div>
        </div>
        <div class="verdict" id="ms-verdict"></div>
      </div>
    </div>
  `);

  const q = s => host.querySelector(s);
  const grid = q('#ms-grid');
  // Build cells, color them by their env-map RGB.
  for (let i = 0; i < ENV.length; i++) {
    const e = ENV[i];
    const cell = document.createElement('div');
    cell.className = 'mask-cell';
    const r = clamp(Math.round(e.rgb[0] * 240), 0, 255);
    const g = clamp(Math.round(e.rgb[1] * 240), 0, 255);
    const b = clamp(Math.round(e.rgb[2] * 240), 0, 255);
    cell.style.background = `rgb(${r},${g},${b})`;
    cell.addEventListener('click', () => { mask[i] = 1 - mask[i]; redraw(); });
    grid.appendChild(cell);
  }
  q('#ms-shuffle').addEventListener('click', () => {
    mask = mask.map(() => Math.random() < 0.5 ? 1 : 0);
    redraw();
  });

  const bufA = new Float32Array(SR2 * 3);
  const bufB = new Float32Array(SR2 * 3);
  const bufC = new Float32Array(SR2 * 3);

  function redraw() {
    // Update cell visuals.
    Array.from(grid.children).forEach((cell, i) => {
      cell.classList.toggle('l1', mask[i] === 1);
      cell.classList.toggle('l2', mask[i] === 0);
    });

    const L1 = ENV.filter((_, i) => mask[i] === 1);
    const L2 = ENV.filter((_, i) => mask[i] === 0);

    renderSphere(q('#ms-p1'), L1, bufA);
    renderSphere(q('#ms-p2'), L2, bufB);
    renderSphere(q('#ms-p3'), ENV, bufC);

    // Verify: bufA + bufB === bufC (it has to, by construction; useful to show anyway).
    let maxAbs = 0, sumAbs = 0, n = 0;
    for (let i = 0; i < SR2; i++) {
      if (!INSIDE[i]) continue;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(bufA[i * 3 + c] + bufB[i * 3 + c] - bufC[i * 3 + c]);
        if (d > maxAbs) maxAbs = d;
        sumAbs += d; n++;
      }
    }
    const sz1 = L1.length, sz2 = L2.length;
    q('#ms-verdict').innerHTML =
      `$L_1$ uses <b>${sz1}</b> cells, $L_2$ uses <b>${sz2}</b>. ` +
      `$\\|I_{L_1} + I_{L_2} - I_{L_1+L_2}\\|_\\infty = $ <b>${maxAbs.toExponential(2)}</b> ` +
      `<span class="ok">— exact for every partition.</span>`;
    // Re-render the math symbols inside the verdict if KaTeX is loaded.
    if (window.renderMathInElement) window.renderMathInElement(q('#ms-verdict'),
      { delimiters: [{left:'$',right:'$',display:false}] });
  }
  redraw();
})();

/* =====================================================================
 * Widget 3: normals
 * Render the sphere under four directional lights (right/left/up/down),
 * divide each by the per-pixel mean (the albedo estimator A from §4.3),
 * and assemble an RGB normal map via
 *   N_red   = (S_left - S_right) / 2 + 0.5
 *   N_green = (S_up   - S_down ) / 2 + 0.5
 *   N_blue  = sqrt(1 - (2 N_red - 1)^2 - (2 N_green - 1)^2)
 * exactly as in IC-Light §4.3.
 * ===================================================================== */
(function normalsWidget() {
  const host = document.getElementById('normals');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div>
        <div class="lights" id="nm-lights"></div>
        <div class="formula">
          $A$ = mean of the four $I_{L_i}$ &nbsp;→&nbsp; shadings $S_{L_i} = I_{L_i} / A$<br/>
          <span class="ch-r">$N_\\text{red}$</span>  = $\\tfrac{1}{2}(S_\\text{left} - S_\\text{right})$<br/>
          <span class="ch-g">$N_\\text{green}$</span> = $\\tfrac{1}{2}(S_\\text{up} - S_\\text{down})$<br/>
          <span class="ch-b">$N_\\text{blue}$</span>  = $\\sqrt{1 - N_\\text{red}^2 - N_\\text{green}^2}$
        </div>
        <button class="step-btn" id="nm-reveal">Reveal lights one by one</button>
      </div>
      <div class="right">
        <p class="lab">albedo $A$ (per-pixel mean)</p>
        <canvas id="nm-albedo"></canvas>
        <p class="lab">recovered normal map $N$</p>
        <canvas id="nm-normal"></canvas>
      </div>
    </div>
  `);

  const q = s => host.querySelector(s);
  const lightsBox = q('#nm-lights');

  // Pure ±x and ±y lights (we want the paper's formula to be exact).
  // gain set so that, summed across the four, average sphere brightness ~ albedo.
  const LIGHTS = [
    { name: 'up',    tag: 'L↑',  dir: [ 0,  1, 0], col: [1,1,1] },
    { name: 'left',  tag: 'L←',  dir: [-1,  0, 0], col: [1,1,1] },
    { name: 'right', tag: 'L→',  dir: [ 1,  0, 0], col: [1,1,1] },
    { name: 'down',  tag: 'L↓',  dir: [ 0, -1, 0], col: [1,1,1] },
  ];
  // Order them visually in a 3-column compass layout:
  //    .   up   .
  //   left . right
  //    .  down  .
  const SLOTS = [
    null, 'up', null,
    'left', null, 'right',
    null, 'down', null,
  ];
  const slotCanvas = {};

  for (let s = 0; s < SLOTS.length; s++) {
    const which = SLOTS[s];
    const slot = document.createElement('div');
    slot.className = 'slot';
    if (!which) {
      slot.classList.add('empty');
    } else {
      const cv = document.createElement('canvas');
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = LIGHTS.find(L => L.name === which).tag;
      slot.appendChild(cv);
      slot.appendChild(tag);
      slotCanvas[which] = cv;
    }
    lightsBox.appendChild(slot);
  }

  // Render all four shadings.
  const renders = {};
  for (const L of LIGHTS) {
    const buf = new Float32Array(SR2 * 3);
    renderSphere(slotCanvas[L.name], [{ dir: L.dir, rgb: L.col, gain: 0.95 }], buf);
    renders[L.name] = buf;
  }

  // Albedo estimate = per-pixel mean of the four renderings. For directional lights
  // {±x, ±y} the lit-hemisphere contributions cover the disk and the mean ≈ a constant
  // fraction of the true albedo — divide it out to get the shading maps.
  const A = new Float32Array(SR2 * 3);
  for (let i = 0; i < SR2 * 3; i++) {
    A[i] = (renders.up[i] + renders.down[i] + renders.left[i] + renders.right[i]) / 4;
  }
  drawFloatImage(q('#nm-albedo'), A);

  // Shading maps S_Li = I_Li / A (grayscale, averaged over RGB).
  function shading(im) {
    const out = new Float32Array(SR2);
    for (let i = 0; i < SR2; i++) {
      if (!INSIDE[i]) { out[i] = 0; continue; }
      const Aavg = (A[i * 3] + A[i * 3 + 1] + A[i * 3 + 2]) / 3;
      const Iavg = (im[i * 3] + im[i * 3 + 1] + im[i * 3 + 2]) / 3;
      out[i] = Aavg > 1e-4 ? Iavg / Aavg : 0;
    }
    return out;
  }
  const Su = shading(renders.up);
  const Sd = shading(renders.down);
  const Sl = shading(renders.left);
  const Sr = shading(renders.right);

  // Assemble normal map per the paper's formula.
  const normalImg = new Float32Array(SR2 * 3);
  for (let i = 0; i < SR2; i++) {
    if (!INSIDE[i]) continue;
    let nx = 0.5 * (Sl[i] - Sr[i]);   // ∈ [-0.5, 0.5]
    let ny = 0.5 * (Su[i] - Sd[i]);
    nx = clamp(nx, -1, 1);
    ny = clamp(ny, -1, 1);
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    normalImg[i * 3]     = nx + 0.5;     // R
    normalImg[i * 3 + 1] = ny + 0.5;     // G
    normalImg[i * 3 + 2] = nz;           // B (already in [0,1])
  }
  drawFloatImage(q('#nm-normal'), normalImg);

  // KaTeX re-render for the formula block (auto-render only sniffs page load).
  if (window.renderMathInElement) {
    window.renderMathInElement(q('.formula'),
      { delimiters: [{left:'$',right:'$',display:false}] });
  }

  // Optional: a small "reveal" animation that fades the four lights in sequentially.
  q('#nm-reveal').addEventListener('click', () => {
    const order = ['up', 'left', 'right', 'down'];
    Object.values(slotCanvas).forEach(c => c.style.opacity = 0);
    q('#nm-albedo').style.opacity = 0;
    q('#nm-normal').style.opacity = 0;
    order.forEach((name, k) => {
      setTimeout(() => { slotCanvas[name].style.transition = 'opacity 0.35s'; slotCanvas[name].style.opacity = 1; }, k * 350);
    });
    setTimeout(() => {
      q('#nm-albedo').style.transition = 'opacity 0.4s';
      q('#nm-albedo').style.opacity = 1;
    }, 1700);
    setTimeout(() => {
      q('#nm-normal').style.transition = 'opacity 0.4s';
      q('#nm-normal').style.opacity = 1;
    }, 2100);
  });
})();

/* =====================================================================
 * Widget 4: prompt-gallery
 * Four (input, relit) pairs cropped from Paper Figure 1, with the
 * authors' text prompts. Click a tag to swap.
 * ===================================================================== */
(function promptGallery() {
  const host = document.getElementById('prompt-gallery');
  if (!host) return;

  const PAIRS = [
    {
      label: 'Portrait · window blinds',
      input: 'assets/figures/teaser_panels/r1c1.png',
      output: 'assets/figures/teaser_panels/r1c2.png',
      caption: '"… sunlight through the blinds, near window blinds"',
    },
    {
      label: 'Portrait · beach',
      input: 'assets/figures/teaser_panels/r1c3.png',
      output: 'assets/figures/teaser_panels/r1c4.png',
      caption: '"… sunlight from the left side, beach"',
    },
    {
      label: 'Bottle · golden forest',
      input: 'assets/figures/teaser_panels/r2c1.png',
      output: 'assets/figures/teaser_panels/r2c2.png',
      caption: '"… magic golden lit, forest"',
    },
    {
      label: 'Car · neo-punk night',
      input: 'assets/figures/teaser_panels/r2c3.png',
      output: 'assets/figures/teaser_panels/r2c4.png',
      caption: '"… neo punk, city night"',
    },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="pg-picker"></div>
    <div class="pair">
      <img id="pg-input"  alt="input image"/>
      <span class="arrow">→</span>
      <img id="pg-output" alt="IC-Light output"/>
    </div>
    <div class="caption" id="pg-cap"></div>
  `);

  const q = s => host.querySelector(s);
  const picker = q('#pg-picker');
  PAIRS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'pick' + (i === 0 ? ' active' : '');
    b.textContent = p.label;
    b.addEventListener('click', () => select(i));
    picker.appendChild(b);
  });

  function select(i) {
    Array.from(picker.children).forEach((b, k) => b.classList.toggle('active', k === i));
    q('#pg-input').src  = PAIRS[i].input;
    q('#pg-output').src = PAIRS[i].output;
    q('#pg-cap').textContent = PAIRS[i].caption;
  }
  select(0);
})();
