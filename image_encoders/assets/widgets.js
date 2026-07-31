/* image_encoders blog interactive widgets. Plain JS / Canvas 2D. No deps.
 * Widgets, in reading order:
 *   w-patchify      image size + patch size -> token count and attention cost
 *   w-siglip-loss   softmax vs sigmoid: what each device materialises
 *   w-resolution    squash vs tile vs native, on a non-square image
 *   w-attention     full vs window vs hybrid attention cost
 *   w-budget        pixels -> patches -> merger -> LLM tokens -> prefill FLOPs
 */

/* ---------- theme toggle ---------- */
(function () {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const saved = localStorage.getItem('vb-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
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
    window.dispatchEvent(new Event('vb-theme-change'));
  });
})();

/* ---------- helpers ---------- */
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

function fmt(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(n / 1e12 < 10 ? 2 : 1) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(n / 1e9 < 10 ? 2 : 1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(n / 1e6 < 10 ? 2 : 1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n / 1e3 < 10 ? 1 : 0) + 'k';
  return String(Math.round(n));
}

function commas(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Re-run every registered draw function when the theme flips.
const REDRAWS = [];
window.addEventListener('vb-theme-change', () => REDRAWS.forEach((f) => f()));

/* =====================================================================
 * Widget 1: patchify
 * How an image becomes a token sequence, and what that costs.
 * ===================================================================== */
(function patchify() {
  const host = document.getElementById('w-patchify');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="ie-body">
      <div class="ie-canvas"><canvas id="pfCanvas" width="380" height="330"></canvas></div>
      <div class="ie-side">
        <label class="ie-label">image side length <span id="pfResVal" class="ie-num">224</span> px</label>
        <input type="range" id="pfRes" min="0" max="5" step="1" value="1"/>
        <label class="ie-label">patch size <span id="pfPatchVal" class="ie-num">16</span> px</label>
        <input type="range" id="pfPatch" min="0" max="3" step="1" value="2"/>
        <div class="ie-readout" id="pfReadout"></div>
      </div>
    </div>
  `);

  const RESOLUTIONS = [112, 224, 336, 448, 672, 896];
  const PATCHES = [8, 14, 16, 32];

  const cv = host.querySelector('#pfCanvas');
  const ctx = devicePx(cv, 380, 330);
  const resIn = host.querySelector('#pfRes');
  const patchIn = host.querySelector('#pfPatch');
  const out = host.querySelector('#pfReadout');
  const W = 380, H = 330;

  function draw() {
    const res = RESOLUTIONS[+resIn.value];
    const patch = PATCHES[+patchIn.value];
    host.querySelector('#pfResVal').textContent = res;
    host.querySelector('#pfPatchVal').textContent = patch;

    const grid = Math.floor(res / patch);
    const tokens = grid * grid;

    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), acc = cssVar('--accent');
    const rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);

    // The image square, always drawn at the same on-screen size.
    const box = 250;
    const ox = (W - box) / 2, oy = 22;
    ctx.fillStyle = cssVar('--bg-card');
    ctx.fillRect(ox, oy, box, box);

    // A synthetic scene so patch boundaries are visible: a disc plus a text bar.
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, box, box); ctx.clip();
    ctx.fillStyle = acc; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(ox + box * 0.36, oy + box * 0.38, box * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.arc(ox + box * 0.72, oy + box * 0.68, box * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // "text" — thin bars whose thickness is the detail the patch grid must resolve
    ctx.fillStyle = mute;
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(ox + box * 0.10, oy + box * 0.76 + i * 8, box * (0.55 - i * 0.06), 2.5);
    }
    ctx.restore();

    // The patch grid on top.
    const cell = box / grid;
    ctx.strokeStyle = fg;
    ctx.globalAlpha = grid > 40 ? 0.16 : 0.34;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= grid; i++) {
      ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + box);
      ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + box, oy + i * cell);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = rule; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox, oy, box, box);

    // One highlighted patch, to show what a single token is made of.
    ctx.strokeStyle = acc; ctx.lineWidth = 2.5;
    ctx.strokeRect(ox + 2 * cell, oy + 2 * cell, cell, cell);

    ctx.font = '12px ' + cssVar('--sans');
    ctx.fillStyle = mute;
    ctx.textAlign = 'center';
    ctx.fillText(`${grid} x ${grid} grid  =  ${commas(tokens)} tokens`, W / 2, oy + box + 22);
    ctx.textAlign = 'left';
    ctx.fillStyle = acc;
    ctx.fillText('one patch = one token', ox, 14);

    // Costs, all relative to the 224/16 baseline of 196 tokens.
    const base = 196;
    const attnRel = Math.pow(tokens / base, 2);
    const mlpRel = tokens / base;
    const perPatchNums = patch * patch * 3;

    out.innerHTML = `
      <div class="ie-kv"><span>patches</span><b>${grid} &times; ${grid} = ${commas(tokens)}</b></div>
      <div class="ie-kv"><span>pixels per patch</span><b>${patch}&times;${patch}&times;3 = ${commas(perPatchNums)}</b></div>
      <div class="ie-kv"><span>feed-forward cost</span><b>${mlpRel.toFixed(1)}&times;</b></div>
      <div class="ie-kv"><span>attention cost</span><b>${attnRel < 100 ? attnRel.toFixed(1) : commas(attnRel)}&times;</b></div>
      <p class="ie-note">Costs are relative to the 224&nbsp;px / patch&nbsp;16 baseline of 196 tokens.
      Feed-forward work grows with the token count; attention grows with its square.</p>
    `;
  }

  resIn.addEventListener('input', draw);
  patchIn.addEventListener('input', draw);
  REDRAWS.push(draw);
  draw();
})();

/* =====================================================================
 * Widget 2: softmax vs sigmoid loss
 * What one device has to hold, and how each pair is scored.
 * ===================================================================== */
(function siglipLoss() {
  const host = document.getElementById('w-siglip-loss');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="ie-body">
      <div class="ie-canvas"><canvas id="slCanvas" width="380" height="330"></canvas></div>
      <div class="ie-side">
        <div class="ie-btnrow">
          <button class="btn active" data-loss="sigmoid">sigmoid (SigLIP)</button>
          <button class="btn" data-loss="softmax">softmax (CLIP)</button>
        </div>
        <label class="ie-label">global batch size <span id="slBatchVal" class="ie-num">32k</span></label>
        <input type="range" id="slBatch" min="0" max="5" step="1" value="4"/>
        <label class="ie-label">devices <span id="slDevVal" class="ie-num">256</span></label>
        <input type="range" id="slDev" min="0" max="5" step="1" value="4"/>
        <div class="ie-readout" id="slReadout"></div>
      </div>
    </div>
  `);

  const BATCHES = [1024, 4096, 8192, 16384, 32768, 98304];
  const DEVICES = [4, 16, 64, 128, 256, 1024];

  const cv = host.querySelector('#slCanvas');
  const ctx = devicePx(cv, 380, 330);
  const batchIn = host.querySelector('#slBatch');
  const devIn = host.querySelector('#slDev');
  const out = host.querySelector('#slReadout');
  const btns = [...host.querySelectorAll('.ie-btnrow .btn')];
  let loss = 'sigmoid';
  let picked = null;
  const W = 380, H = 330;

  // The picture is always a mock 12x12 batch on 3 devices — the real numbers
  // are in the readout. Small enough to see individual cells.
  const N = 12, D = 3, B = N / D;
  const box = 252, ox = (W - box) / 2, oy = 34, cell = box / N;

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * (W / r.width) - ox;
    const y = (e.clientY - r.top) * (H / r.height) - oy;
    if (x < 0 || y < 0 || x > box || y > box) { picked = null; }
    else picked = { i: Math.floor(y / cell), j: Math.floor(x / cell) };
    draw();
  });

  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((o) => o.classList.remove('active'));
    b.classList.add('active');
    loss = b.dataset.loss;
    draw();
  }));

  function draw() {
    const batch = BATCHES[+batchIn.value];
    let devices = DEVICES[+devIn.value];
    if (devices > batch / 16) devices = Math.max(4, Math.pow(2, Math.floor(Math.log2(batch / 16))));
    host.querySelector('#slBatchVal').textContent = batch >= 1024 ? (batch / 1024).toFixed(batch % 1024 ? 1 : 0) + 'k' : batch;
    host.querySelector('#slDevVal').textContent = devices;

    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), acc = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px ' + cssVar('--sans');

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const sameDevice = Math.floor(i / B) === Math.floor(j / B);
        const positive = i === j;
        let fill, alpha;
        if (loss === 'softmax') {
          // Every cell must exist at once: the whole matrix is materialised.
          fill = positive ? acc : fg;
          alpha = positive ? 0.85 : 0.14;
        } else {
          // Only the current b x b block is alive at any instant.
          if (sameDevice) { fill = positive ? acc : fg; alpha = positive ? 0.85 : 0.22; }
          else { fill = mute; alpha = 0.05; }
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.fillRect(ox + j * cell + 0.5, oy + i * cell + 0.5, cell - 1, cell - 1);
      }
    }
    ctx.globalAlpha = 1;

    // Device boundaries.
    ctx.strokeStyle = mute; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let d = 0; d <= D; d++) {
      ctx.moveTo(ox + d * B * cell, oy); ctx.lineTo(ox + d * B * cell, oy + box);
      ctx.moveTo(ox, oy + d * B * cell); ctx.lineTo(ox + box, oy + d * B * cell);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (picked) {
      ctx.strokeStyle = acc; ctx.lineWidth = 2.5;
      ctx.strokeRect(ox + picked.j * cell, oy + picked.i * cell, cell, cell);
    }

    ctx.fillStyle = mute;
    ctx.textAlign = 'left';
    ctx.fillText('texts  →', ox, oy - 12);
    ctx.save();
    ctx.translate(ox - 12, oy + box);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('images  →', 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.fillStyle = mute;
    ctx.fillText(
      loss === 'sigmoid'
        ? 'lit cells = held in memory right now (one b×b block)'
        : 'lit cells = held in memory right now (the whole matrix)',
      W / 2, oy + box + 22);
    ctx.textAlign = 'left';

    // Real numbers for the chosen configuration.
    const b = batch / devices;
    const live = loss === 'sigmoid' ? b * b : batch * batch;
    const bytes = live * 4;
    const pos = batch;
    const neg = batch * batch - batch;

    let pickHtml = '<p class="ie-note">Click a cell in the matrix to see how that pair is scored.</p>';
    if (picked) {
      const positive = picked.i === picked.j;
      const same = Math.floor(picked.i / B) === Math.floor(picked.j / B);
      if (loss === 'sigmoid') {
        pickHtml = `<p class="ie-note"><b>Pair (image ${picked.i + 1}, text ${picked.j + 1})</b> &mdash;
          label z = ${positive ? '+1, a real pair. The loss pushes them together.' : '−1, a mismatch. The loss pushes them apart.'}
          Scored on its own with one sigmoid; no other pair is involved.
          ${same ? 'Both live on the same device, so this block is computed first.' : 'They start on different devices, so this term is computed after the text embeddings rotate around the ring.'}</p>`;
      } else {
        pickHtml = `<p class="ie-note"><b>Pair (image ${picked.i + 1}, text ${picked.j + 1})</b> &mdash;
          ${positive ? 'this is the numerator of row ' + (picked.i + 1) + '.' : 'this is one term in the denominator of row ' + (picked.i + 1) + '.'}
          Scoring it needs <b>all ${N}</b> similarities in that row, which needs every text embedding gathered from every device.</p>`;
      }
    }

    out.innerHTML = `
      <div class="ie-kv"><span>per-device batch b</span><b>${commas(b)}</b></div>
      <div class="ie-kv"><span>live matrix entries</span><b>${fmt(live)}</b></div>
      <div class="ie-kv"><span>memory at fp32</span><b>${bytes > 1e9 ? (bytes / 1e9).toFixed(2) + ' GB' : (bytes / 1e6).toFixed(1) + ' MB'}</b></div>
      <div class="ie-kv"><span>cross-device op</span><b>${loss === 'sigmoid' ? devices + ' small swaps' : '2 all-gathers'}</b></div>
      <div class="ie-kv"><span>positives : negatives</span><b>1 : ${commas(neg / pos)}</b></div>
      ${pickHtml}
    `;
  }

  batchIn.addEventListener('input', draw);
  devIn.addEventListener('input', draw);
  REDRAWS.push(draw);
  draw();
})();

/* =====================================================================
 * Widget 3: resolution strategies
 * The same non-square image under squash / tile / native.
 * ===================================================================== */
(function resolutionStrategies() {
  const host = document.getElementById('w-resolution');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="ie-body">
      <div class="ie-canvas"><canvas id="rsCanvas" width="380" height="235"></canvas></div>
      <div class="ie-side">
        <div class="ie-btnrow" id="rsShapes">
          <button class="btn active" data-shape="0">photo 3:2</button>
          <button class="btn" data-shape="1">page 1:1.4</button>
          <button class="btn" data-shape="2">panorama 4:1</button>
          <button class="btn" data-shape="3">phone 9:19</button>
        </div>
        <div class="ie-btnrow" id="rsStrat">
          <button class="btn active" data-strat="squash">squash</button>
          <button class="btn" data-strat="tile">tile</button>
          <button class="btn" data-strat="native">native</button>
        </div>
        <div class="ie-readout" id="rsReadout"></div>
      </div>
    </div>
  `);

  const SHAPES = [
    { name: 'photo', w: 3000, h: 2000 },
    { name: 'scanned page', w: 2480, h: 3508 },
    { name: 'panorama', w: 4000, h: 1000 },
    { name: 'phone screenshot', w: 1170, h: 2532 },
  ];

  const cv = host.querySelector('#rsCanvas');
  const ctx = devicePx(cv, 380, 235);
  const out = host.querySelector('#rsReadout');
  let shape = 0, strat = 'squash';

  host.querySelectorAll('#rsShapes .btn').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('#rsShapes .btn').forEach((o) => o.classList.remove('active'));
    b.classList.add('active'); shape = +b.dataset.shape; draw();
  }));
  host.querySelectorAll('#rsStrat .btn').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('#rsStrat .btn').forEach((o) => o.classList.remove('active'));
    b.classList.add('active'); strat = b.dataset.strat; draw();
  }));

  // Draw a fake document into an arbitrary rectangle, scaled by sx/sy so that
  // squashing visibly distorts the content.
  function scene(x, y, w, h, sx, sy) {
    const acc = cssVar('--accent'), mute = cssVar('--fg-mute');
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x, y); ctx.scale(sx, sy);
    const uw = w / sx, uh = h / sy;
    ctx.globalAlpha = 0.3; ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(uw * 0.24, uh * 0.26, Math.min(uw, uh) * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = mute;
    for (let i = 0; i < 9; i++) {
      ctx.fillRect(uw * 0.08, uh * 0.5 + i * uh * 0.045, uw * (0.7 - (i % 3) * 0.12), uh * 0.016);
    }
    ctx.restore();
  }

  function draw() {
    const s = SHAPES[shape];
    const ar = s.w / s.h;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), acc = cssVar('--accent');
    const rule = cssVar('--rule');
    ctx.clearRect(0, 0, 380, 235);
    ctx.font = '11px ' + cssVar('--sans');

    // Left: the original, fitted into a 150x150 area.
    const area = 132, lx = 26, ly = 40;
    let ow = area, oh = area;
    if (ar > 1) oh = area / ar; else ow = area * ar;
    const oxx = lx + (area - ow) / 2, oyy = ly + (area - oh) / 2;
    ctx.fillStyle = cssVar('--bg-card'); ctx.fillRect(oxx, oyy, ow, oh);
    scene(oxx, oyy, ow, oh, 1, 1);
    ctx.strokeStyle = rule; ctx.lineWidth = 1.5; ctx.strokeRect(oxx, oyy, ow, oh);
    ctx.fillStyle = mute; ctx.textAlign = 'center';
    ctx.fillText(`original  ${s.w}×${s.h}`, lx + area / 2, ly - 12);

    // Right: what the encoder actually receives.
    const rx = 210, ry = 40;
    let tokens = 0, distortion = 0, detail = 0, caption = '';

    if (strat === 'squash') {
      const side = 132;
      ctx.fillStyle = cssVar('--bg-card'); ctx.fillRect(rx, ry, side, side);
      scene(rx, ry, side, side, side / ow, side / oh);
      ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, side, side);
      tokens = 576;                       // 384/16 = 24 -> 24x24
      distortion = Math.abs(ar - 1) / Math.max(ar, 1) * 100;
      detail = (384 * 384) / (s.w * s.h) * 100;
      caption = 'one 384×384 square';
    } else if (strat === 'tile') {
      // Closest tile layout with at most 12 tiles, 448px each.
      let best = { c: 1, r: 1, err: Infinity };
      for (let c = 1; c <= 12; c++) for (let r = 1; r * c <= 12; r++) {
        const err = Math.abs(Math.log((c / r) / ar));
        if (err < best.err) best = { c, r, err };
      }
      const nT = best.c * best.r;
      const cellMax = 118;
      const cw = Math.min(cellMax / best.c, cellMax / best.r);
      const gw = cw * best.c, gh = cw * best.r;
      const gx = rx + (132 - gw) / 2, gy = ry + (132 - gh) / 2;
      for (let r = 0; r < best.r; r++) for (let c = 0; c < best.c; c++) {
        const tx = gx + c * cw, ty = gy + r * cw;
        ctx.save();
        ctx.beginPath(); ctx.rect(tx + 1, ty + 1, cw - 2, cw - 2); ctx.clip();
        ctx.fillStyle = cssVar('--bg-card'); ctx.fillRect(tx, ty, cw, cw);
        // The tile shows its own slice of the scene at native scale.
        scene(gx, gy, gw, gh, gw / ow, gh / oh);
        ctx.restore();
        ctx.strokeStyle = acc; ctx.lineWidth = 1.5;
        ctx.strokeRect(tx + 1, ty + 1, cw - 2, cw - 2);
      }
      // The thumbnail, drawn small below.
      ctx.fillStyle = cssVar('--bg-card'); ctx.fillRect(rx + 108, ry + 108, 22, 22);
      ctx.strokeStyle = mute; ctx.lineWidth = 1; ctx.strokeRect(rx + 108, ry + 108, 22, 22);
      ctx.fillStyle = mute; ctx.textAlign = 'right';
      ctx.fillText('+thumb', rx + 132, ry + 148);
      ctx.textAlign = 'center';
      tokens = (nT + 1) * 256;            // 448/14 = 32 -> 1024, pixel-shuffled to 256
      distortion = Math.abs(Math.log((best.c / best.r) / ar)) * 100;
      detail = (nT * 448 * 448) / (s.w * s.h) * 100;
      caption = `${best.c}×${best.r} = ${nT} tiles of 448², +1 thumbnail`;
    } else {
      // Native: keep the aspect ratio, cap total patches at 1600 (Qwen-style).
      const cap = 1600, P = 14;
      const scale = Math.sqrt((cap * P * P) / (s.w * s.h));
      const gw = Math.round((s.w * scale) / 28) * 28;
      const gh = Math.round((s.h * scale) / 28) * 28;
      const cols = gw / P, rows = gh / P;
      let dw = 132, dh = 132;
      if (ar > 1) dh = 132 / ar; else dw = 132 * ar;
      const dx = rx + (132 - dw) / 2, dy = ry + (132 - dh) / 2;
      ctx.fillStyle = cssVar('--bg-card'); ctx.fillRect(dx, dy, dw, dh);
      scene(dx, dy, dw, dh, dw / ow, dh / oh);
      ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.strokeRect(dx, dy, dw, dh);
      // A hint of the patch grid.
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.18; ctx.lineWidth = 0.6;
      ctx.beginPath();
      const step = Math.max(dw / Math.min(cols, 24), 4);
      for (let x = dx; x < dx + dw; x += step) { ctx.moveTo(x, dy); ctx.lineTo(x, dy + dh); }
      for (let y = dy; y < dy + dh; y += step) { ctx.moveTo(dx, y); ctx.lineTo(dx + dw, y); }
      ctx.stroke(); ctx.globalAlpha = 1;
      tokens = Math.round((cols * rows) / 4);   // 2x2 merger
      distortion = 0.8;
      detail = (gw * gh) / (s.w * s.h) * 100;
      caption = `${cols}×${rows} patches at native shape`;
    }

    ctx.fillStyle = mute; ctx.textAlign = 'center';
    ctx.fillText('what the encoder sees', rx + 66, ry - 12);
    ctx.fillStyle = acc;
    ctx.fillText(caption, rx + 66, ry + 152);
    ctx.textAlign = 'left';

    // Arrow between the two panels.
    ctx.strokeStyle = mute; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(168, 106); ctx.lineTo(196, 106); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(196, 106); ctx.lineTo(190, 102); ctx.lineTo(190, 110);
    ctx.closePath(); ctx.fillStyle = mute; ctx.fill(); ctx.globalAlpha = 1;

    out.innerHTML = `
      <div class="ie-kv"><span>tokens to the LLM</span><b>${commas(tokens)}</b></div>
      <div class="ie-kv"><span>aspect distortion</span><b>${distortion < 1 ? '&lt;1' : distortion.toFixed(0)}%</b></div>
      <div class="ie-kv"><span>pixels kept</span><b>${detail >= 100 ? '100' : detail < 1 ? detail.toFixed(2) : detail.toFixed(1)}%</b></div>
      <p class="ie-note">${
        strat === 'squash'
          ? 'Cheapest and works with any off-the-shelf encoder. Shapes are wrong and almost all the pixels are gone before the model looks.'
          : strat === 'tile'
          ? 'Keeps far more pixels and needs no change to the encoder, but each tile is a separate forward pass — nothing can be seen across a tile edge except through the thumbnail.'
          : 'Correct shape and a token count that follows the image, but it needs an encoder built for it: packing, a flexible position encoding, and usually window attention.'
      }</p>
    `;
  }

  REDRAWS.push(draw);
  draw();
})();

/* =====================================================================
 * Widget 4: attention cost, full vs window vs hybrid
 * ===================================================================== */
(function attentionCost() {
  const host = document.getElementById('w-attention');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="ie-body">
      <div class="ie-canvas"><canvas id="atCanvas" width="380" height="300"></canvas></div>
      <div class="ie-side">
        <label class="ie-label">image patches <span id="atNVal" class="ie-num">5888</span></label>
        <input type="range" id="atN" min="196" max="16384" step="196" value="5880"/>
        <label class="ie-label">window size <span id="atWVal" class="ie-num">8&times;8 = 64</span> patches</label>
        <input type="range" id="atW" min="0" max="4" step="1" value="1"/>
        <div class="ie-readout" id="atReadout"></div>
      </div>
    </div>
  `);

  const WINDOWS = [16, 64, 144, 256, 1024];
  const WLABEL = ['4&times;4 = 16', '8&times;8 = 64', '12&times;12 = 144', '16&times;16 = 256', '32&times;32 = 1024'];
  const LAYERS = 32, FULL_LAYERS = 4;

  const cv = host.querySelector('#atCanvas');
  const ctx = devicePx(cv, 380, 300);
  const nIn = host.querySelector('#atN');
  const wIn = host.querySelector('#atW');
  const out = host.querySelector('#atReadout');
  const W = 380, H = 300;

  function draw() {
    const n = +nIn.value;
    const win = WINDOWS[+wIn.value];
    host.querySelector('#atNVal').textContent = commas(n);
    host.querySelector('#atWVal').innerHTML = WLABEL[+wIn.value];

    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), acc = cssVar('--accent');
    const rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);

    const L = 46, R = 16, T = 22, Bm = 40;
    const pw = W - L - R, ph = H - T - Bm;
    const NMAX = 16384;
    // Cost unit: pairwise attention terms per layer, summed over 32 layers.
    const fullAt = (m) => m * m * LAYERS;
    const winAt = (m) => m * Math.min(win, m) * LAYERS;
    const hybAt = (m) => m * m * FULL_LAYERS + m * Math.min(win, m) * (LAYERS - FULL_LAYERS);
    const YMAX = fullAt(NMAX);

    const X = (m) => L + (m / NMAX) * pw;
    const Y = (v) => T + ph - (v / YMAX) * ph;

    // Axes.
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.font = '11px ' + cssVar('--sans');
    ctx.fillStyle = mute; ctx.textAlign = 'center';
    ctx.fillText('patches in the image', L + pw / 2, H - 8);
    ctx.textAlign = 'right';
    for (const frac of [0, 0.5, 1]) {
      const v = frac * YMAX;
      ctx.fillText(frac === 0 ? '0' : fmt(v), L - 6, Y(v) + 4);
      ctx.strokeStyle = rule; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + pw, Y(v)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.fillStyle = mute;
    ctx.fillText('attention terms, all 32 layers', 0, 0); ctx.restore();
    ctx.textAlign = 'left';

    const curve = (f, color, width, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (let m = 196; m <= NMAX; m += 128) {
        const x = X(m), y = Y(f(m));
        if (m === 196) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    curve(fullAt, fg, 2);
    curve(hybAt, acc, 2.5);
    curve(winAt, mute, 2, [5, 4]);

    // Marker at the chosen patch count.
    ctx.strokeStyle = acc; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(n), T); ctx.lineTo(X(n), T + ph); ctx.stroke();
    ctx.globalAlpha = 1;
    for (const [f, c] of [[fullAt, fg], [hybAt, acc], [winAt, mute]]) {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(X(n), Y(f(n)), 3.5, 0, Math.PI * 2); ctx.fill();
    }

    // Legend.
    ctx.font = '11px ' + cssVar('--sans');
    const leg = [['full attention, every layer', fg], ['hybrid: 28 window + 4 full', acc], ['window attention, every layer', mute]];
    leg.forEach((e, i) => {
      ctx.fillStyle = e[1];
      ctx.fillRect(L + 10, T + 6 + i * 15, 14, 2.5);
      ctx.fillText(e[0], L + 30, T + 11 + i * 15);
    });

    const f = fullAt(n), h = hybAt(n), w = winAt(n);
    out.innerHTML = `
      <div class="ie-kv"><span>full attention</span><b>${fmt(f)}</b></div>
      <div class="ie-kv"><span>hybrid (Qwen2.5-VL)</span><b>${fmt(h)} &nbsp;<i>${(f / h).toFixed(1)}&times; cheaper</i></b></div>
      <div class="ie-kv"><span>all-window</span><b>${fmt(w)} &nbsp;<i>${(f / w).toFixed(1)}&times; cheaper</i></b></div>
      <p class="ie-note">Counting query-key pairs, summed over 32 layers. Window attention grows
      linearly in patch count because each patch attends to at most ${win} others no matter how
      big the image is. The hybrid line tracks it closely, because only 4 of 32 layers are full —
      enough for information to cross the whole image, cheap enough to afford.</p>
    `;
  }

  nIn.addEventListener('input', draw);
  wIn.addEventListener('input', draw);
  REDRAWS.push(draw);
  draw();
})();

/* =====================================================================
 * Widget 5: end-to-end token and compute budget
 * ===================================================================== */
(function budget() {
  const host = document.getElementById('w-budget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="ie-body">
      <div class="ie-canvas"><canvas id="bgCanvas" width="380" height="300"></canvas></div>
      <div class="ie-side">
        <label class="ie-label">image <span id="bgResVal" class="ie-num">1288&times;896</span></label>
        <input type="range" id="bgRes" min="0" max="5" step="1" value="3"/>
        <label class="ie-label">patch size <span id="bgPVal" class="ie-num">14</span> px</label>
        <input type="range" id="bgP" min="0" max="2" step="1" value="1"/>
        <label class="ie-label">connector compression <span id="bgMVal" class="ie-num">2&times;2 = 4&times;</span></label>
        <input type="range" id="bgM" min="0" max="3" step="1" value="1"/>
        <label class="ie-label">language model <span id="bgLVal" class="ie-num">7B</span></label>
        <input type="range" id="bgL" min="0" max="3" step="1" value="1"/>
        <div class="ie-readout" id="bgReadout"></div>
      </div>
    </div>
  `);

  const IMAGES = [
    [336, 336, 'thumbnail'], [672, 672, 'square photo'], [1024, 768, 'screenshot'],
    [1288, 896, 'wide photo'], [1680, 2380, 'A4 page'], [2464, 3472, 'A4 at 300dpi'],
  ];
  const PATCHES = [16, 14, 32];
  const MERGE = [1, 4, 9, 16];
  const MLABEL = ['none (1&times;1)', '2&times;2 = 4&times;', '3&times;3 = 9&times;', '4&times;4 = 16&times;'];
  // [params (B), encoder params (B)] — encoder held fixed at 0.4B (So400m-scale).
  const LLMS = [[1.5, '1.5B'], [7, '7B'], [32, '32B'], [72, '72B']];
  const ENC_PARAMS = 0.4e9;

  const cv = host.querySelector('#bgCanvas');
  const ctx = devicePx(cv, 380, 300);
  const out = host.querySelector('#bgReadout');
  const ins = ['#bgRes', '#bgP', '#bgM', '#bgL'].map((s) => host.querySelector(s));
  const W = 380, H = 300;

  function draw() {
    const [iw, ih, iname] = IMAGES[+ins[0].value];
    const P = PATCHES[+ins[1].value];
    const M = MERGE[+ins[2].value];
    const [llmB, llmName] = LLMS[+ins[3].value];

    host.querySelector('#bgResVal').textContent = `${iw}×${ih}`;
    host.querySelector('#bgPVal').textContent = P;
    host.querySelector('#bgMVal').innerHTML = MLABEL[+ins[2].value];
    host.querySelector('#bgLVal').textContent = llmName;

    const cols = Math.floor(iw / P), rows = Math.floor(ih / P);
    const patches = cols * rows;
    const tokens = Math.floor(patches / M);

    // FLOPs. Forward pass over T tokens through a model of N params is ~2*N*T,
    // which ignores attention and is the standard first-order estimate.
    const encFlops = 2 * ENC_PARAMS * patches;
    const llmFlops = 2 * llmB * 1e9 * tokens;
    const total = encFlops + llmFlops;
    const encShare = encFlops / total;

    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), acc = cssVar('--accent');
    const rule = cssVar('--rule');
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px ' + cssVar('--sans');

    // Four-stage flow diagram with proportional bars.
    const stages = [
      ['pixels', commas(iw * ih), iw * ih / 1e4],
      ['ViT patches', commas(patches), patches / 100],
      ['LLM tokens', commas(tokens), tokens / 100],
      [`${llmName} prefill`, fmt(llmFlops) + ' FLOPs', 0],
    ];
    const barMax = 216, bx = 96;
    const scale = Math.max(...stages.slice(0, 3).map((s) => s[2]));
    stages.forEach((s, i) => {
      const y = 26 + i * 46;
      ctx.fillStyle = mute; ctx.textAlign = 'right';
      ctx.fillText(s[0], bx - 10, y + 4);
      ctx.textAlign = 'left';
      if (i < 3) {
        const w = Math.max(3, (s[2] / scale) * (barMax - 64));
        ctx.fillStyle = i === 2 ? acc : fg;
        ctx.globalAlpha = i === 2 ? 0.85 : 0.3;
        ctx.fillRect(bx, y - 9, w, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = fg;
        ctx.fillText(s[1], bx + w + 8, y + 4);
      } else {
        ctx.fillStyle = acc;
        ctx.fillText(s[1], bx, y + 4);
      }
      if (i < 3) {
        ctx.strokeStyle = rule; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx - 6, y + 16); ctx.lineTo(bx - 6, y + 30); ctx.stroke();
      }
    });

    // Encoder vs LLM share bar.
    const sy = 226;
    ctx.fillStyle = mute; ctx.textAlign = 'left';
    ctx.fillText('where the compute goes', 24, sy - 8);
    const sw = 330;
    ctx.fillStyle = acc; ctx.fillRect(24, sy, sw * encShare, 20);
    ctx.fillStyle = fg; ctx.globalAlpha = 0.25;
    ctx.fillRect(24 + sw * encShare, sy, sw * (1 - encShare), 20);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rule; ctx.strokeRect(24, sy, sw, 20);
    ctx.font = '11px ' + cssVar('--sans');
    ctx.fillStyle = mute;
    ctx.fillText(`vision encoder ${(encShare * 100).toFixed(0)}%`, 24, sy + 34);
    ctx.textAlign = 'right';
    ctx.fillText(`language model ${((1 - encShare) * 100).toFixed(0)}%`, 354, sy + 34);
    ctx.textAlign = 'left';

    out.innerHTML = `
      <div class="ie-kv"><span>patch grid</span><b>${cols} &times; ${rows}</b></div>
      <div class="ie-kv"><span>ViT tokens</span><b>${commas(patches)}</b></div>
      <div class="ie-kv"><span>LLM tokens</span><b>${commas(tokens)}</b></div>
      <div class="ie-kv"><span>encoder prefill</span><b>${fmt(encFlops)} FLOPs</b></div>
      <div class="ie-kv"><span>LLM prefill</span><b>${fmt(llmFlops)} FLOPs</b></div>
      <p class="ie-note">A ${iname}. FLOPs use the standard estimate of 2 &times; parameters &times;
      tokens for one forward pass, with a 0.4B-parameter encoder. Notice how the encoder's share
      collapses as the language model grows &mdash; and how it dominates for a small one.</p>
    `;
  }

  ins.forEach((el) => el.addEventListener('input', draw));
  REDRAWS.push(draw);
  draw();
})();
