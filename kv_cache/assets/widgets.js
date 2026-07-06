/* kv_cache blog interactive widgets. Plain JS / Canvas. No deps. */

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
    window.dispatchEvent(new Event('kv-theme'));
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
function onTheme(fn) { window.addEventListener('kv-theme', fn); }
const BLUE = '#5fa9ff';
const RED = '#e05555';
const GOLD = '#e8b93c';
const GREEN = '#4caf7d';
function fmtBytes(gb) {
  if (gb >= 1024) return (gb / 1024).toFixed(1) + ' TB';
  if (gb >= 1) return gb.toFixed(gb >= 100 ? 0 : 1) + ' GB';
  return (gb * 1024).toFixed(0) + ' MB';
}

/* =====================================================================
 * Widget 1: cache-replay — with-cache vs without-cache generation.
 * Cumulative K/V computations: quadratic vs linear.
 * ===================================================================== */
(function cacheReplay() {
  const host = document.getElementById('cache-replay');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="crCanvas"></canvas>
      <div class="controls">
        <button id="crRun" class="primary">run</button>
        <div class="readout" id="crReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#crCanvas');
  const W = 680, H = 330;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#crReadout');
  const N = 36, PROMPT = 6;
  let t = 0, timer = null;
  let workNo = 0, workYes = 0;
  const histNo = [], histYes = [];

  function drawLane(y, label, count, color, recomputing) {
    const mute = cssVar('--fg-mute');
    ctx.fillStyle = mute; ctx.font = '12.5px sans-serif';
    ctx.fillText(label, 14, y - 14);
    const w = 14, gap = 3;
    for (let i = 0; i < count; i++) {
      const isPrompt = i < PROMPT;
      const isNew = i === count - 1;
      ctx.fillStyle = isNew ? GOLD : (isPrompt ? BLUE : cssVar('--accent'));
      ctx.globalAlpha = recomputing && !isNew ? 0.9 : 1;
      ctx.fillRect(14 + i * (w + gap), y, w, 18);
      if (recomputing && !isNew) {   // hatch = being recomputed this step
        ctx.strokeStyle = RED; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(14 + i * (w + gap), y + 18);
        ctx.lineTo(14 + i * (w + gap) + w, y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute'), line = cssVar('--line');
    drawLane(34, `no cache — every step recomputes ALL ${Math.max(0, t - 1)} previous K/V (red slashes)`, t, accent, true);
    drawLane(92, 'with cache — every step computes exactly 1 new K/V', t, accent, false);

    // cumulative work plot
    const px = 60, py = 140, pw = W - 90, ph = 168;
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.strokeRect(px, py, pw, ph);
    const maxW = (N * (N + 1)) / 2;
    const plot = (hist, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.2;
      ctx.beginPath();
      hist.forEach((v, i) => {
        const x = px + (i / (N - 1)) * pw;
        const y = py + ph * (1 - v / maxW);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    plot(histNo, RED);
    plot(histYes, GREEN);
    ctx.font = '12.5px sans-serif';
    ctx.fillStyle = RED; ctx.fillText('cumulative K/V computed — no cache: O(t²)', px + 12, py + 20);
    ctx.fillStyle = GREEN; ctx.fillText('with cache: O(t)', px + 12, py + 38);
    ctx.fillStyle = mute;
    ctx.fillText('tokens generated →', px + pw - 120, py + ph - 8);
    readout.innerHTML = `token <b>${t}</b>/${N} &nbsp;·&nbsp; K/V vectors computed — no cache: <b>${workNo}</b> · with cache: <b>${workYes}</b>` +
      (t >= N ? ` &nbsp;·&nbsp; ratio <b>${(workNo / workYes).toFixed(1)}×</b> (grows with length)` : '');
  }

  function run() {
    if (timer) { clearInterval(timer); timer = null; }
    t = PROMPT; workNo = PROMPT; workYes = PROMPT;
    histNo.length = 0; histYes.length = 0;
    for (let i = 0; i < PROMPT; i++) { histNo.push(0); histYes.push(0); }
    timer = setInterval(() => {
      t++;
      workNo += t;          // recompute everything + the new one
      workYes += 1;         // just the new one
      histNo.push(workNo); histYes.push(workYes);
      draw();
      if (t >= N) { clearInterval(timer); timer = null; }
    }, 170);
  }

  host.querySelector('#crRun').addEventListener('click', run);
  onTheme(draw);
  draw();
  readout.innerHTML = 'press run';
})();

/* =====================================================================
 * Widget 2: cache-calculator — model presets × context × batch × dtype.
 * Weights vs cache bars, H100 count, bandwidth-implied decode ceiling.
 * ===================================================================== */
(function cacheCalculator() {
  const host = document.getElementById('cache-calculator');
  if (!host) return;

  // kvPerTokenElems = elements cached per token per layer (K+V combined)
  const MODELS = {
    'llama2-7b':  { name: 'Llama-2-7B (MHA)',        layers: 32, kvElems: 2 * 32 * 128, params: 6.7e9,  window: 0 },
    'gpt3-175b':  { name: 'GPT-3-class 175B (MHA)',  layers: 96, kvElems: 2 * 96 * 128, params: 175e9,  window: 0 },
    'llama2-70b': { name: 'Llama-2-70B (GQA-8)',     layers: 80, kvElems: 2 * 8 * 128,  params: 70e9,   window: 0 },
    'mistral-7b': { name: 'Mistral-7B (GQA-8 + sliding window)', layers: 32, kvElems: 2 * 8 * 128, params: 7.2e9, window: 4096 },
    'deepseek-v2': { name: 'DeepSeek-V2 236B (MLA)', layers: 60, kvElems: 576,          params: 236e9,  window: 0 },
  };
  const DTYPES = { fp16: 2, fp8: 1, int4: 0.5 };

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="ccCanvas"></canvas>
      <div class="controls">
        <div><label>model</label>
          <select id="ccModel">
            ${Object.entries(MODELS).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}
          </select></div>
        <div><label>context: <span id="ccCtxV"></span></label>
          <input type="range" id="ccCtx" min="9" max="20" step="0.25" value="12"/></div>
        <div><label>batch (concurrent users): <span id="ccBatchV"></span></label>
          <input type="range" id="ccBatch" min="0" max="8" step="0.25" value="4"/></div>
        <div><label>cache dtype</label>
          <select id="ccDtype">
            <option value="fp16">fp16 (2 B)</option>
            <option value="fp8">fp8 (1 B)</option>
            <option value="int4">int4 (0.5 B)</option>
          </select></div>
        <div class="readout" id="ccReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#ccCanvas');
  const W = 680, H = 240;
  const ctx = devicePx(cv, W, H);
  const selM = host.querySelector('#ccModel'), sCtx = host.querySelector('#ccCtx');
  const sB = host.querySelector('#ccBatch'), selD = host.querySelector('#ccDtype');
  const vCtx = host.querySelector('#ccCtxV'), vB = host.querySelector('#ccBatchV');
  const readout = host.querySelector('#ccReadout');

  function draw() {
    const m = MODELS[selM.value];
    const ctxLen = Math.round(Math.pow(2, parseFloat(sCtx.value)));
    const batch = Math.round(Math.pow(2, parseFloat(sB.value)));
    const bytesElem = DTYPES[selD.value];
    vCtx.textContent = ctxLen >= 1024 ? (ctxLen / 1024) + 'k tokens' : ctxLen + ' tokens';
    vB.textContent = batch;

    const cachedLen = m.window ? Math.min(ctxLen, m.window) : ctxLen;
    const perTokKB = m.layers * m.kvElems * bytesElem / 1024;
    const perSeqGB = perTokKB * cachedLen / (1024 * 1024);
    const cacheGB = perSeqGB * batch;
    const weightsGB = m.params * 2 / 1e9;   // weights held in fp16/bf16
    const totalGB = weightsGB + cacheGB;
    const h100 = Math.ceil(totalGB / 80);

    // decode ceiling: per step each sequence reads weights/batch + its cache
    const bwGBs = 3350; // H100 SXM HBM3
    const bytesPerTok = weightsGB / batch + perSeqGB;
    const tokS = bwGBs / bytesPerTok;

    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute'), fg = cssVar('--fg');
    const maxGB = Math.max(weightsGB, cacheGB) * 1.15;
    const bar = (y, label, gb, color) => {
      const w = Math.max(2, (gb / maxGB) * (W - 220));
      ctx.fillStyle = color; ctx.fillRect(150, y, w, 34);
      ctx.fillStyle = fg; ctx.font = '13px sans-serif';
      ctx.textAlign = 'right'; ctx.fillText(label, 140, y + 22); ctx.textAlign = 'left';
      ctx.fillStyle = mute; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(fmtBytes(gb), 158 + w, y + 22);
    };
    bar(30, 'weights (fp16)', weightsGB, BLUE);
    bar(84, 'KV cache', cacheGB, accent);
    ctx.fillStyle = mute; ctx.font = '12.5px sans-serif';
    ctx.fillText(`per token: ${perTokKB.toFixed(1)} KiB · per sequence @ ${cachedLen >= 1024 ? (cachedLen / 1024) + 'k' : cachedLen}${m.window && ctxLen > m.window ? ' (window-capped)' : ''}: ${fmtBytes(perSeqGB)}`, 150, 146);
    ctx.fillText(`total ${fmtBytes(totalGB)} → ${h100} × H100-80GB`, 150, 168);
    ctx.fillText(`decode ceiling (3.35 TB/s HBM): ~${tokS >= 100 ? tokS.toFixed(0) : tokS.toFixed(1)} tok/s per request`, 150, 190);
    // cache > weights flag
    if (cacheGB > weightsGB) {
      ctx.fillStyle = RED; ctx.font = 'bold 12.5px sans-serif';
      ctx.fillText('cache now outweighs the model itself', 150, 214);
    }
    readout.innerHTML = `KV cache <b>${fmtBytes(cacheGB)}</b> vs weights <b>${fmtBytes(weightsGB)}</b> &nbsp;·&nbsp; ${(cacheGB / totalGB * 100).toFixed(0)}% of footprint is cache`;
  }

  [selM, sCtx, sB, selD].forEach(el => el.addEventListener('input', draw));
  onTheme(draw);
  draw();
})();

/* =====================================================================
 * Widget 3: heads-slider — MHA → GQA → MQA regrouping diagram.
 * ===================================================================== */
(function headsSlider() {
  const host = document.getElementById('heads-slider');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="hsCanvas"></canvas>
      <div class="controls">
        <div><label>KV heads: <span id="hsV">8</span> (of 8 query heads)</label>
          <input type="range" id="hsSlider" min="0" max="3" step="1" value="0"/></div>
        <div class="readout" id="hsReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#hsCanvas');
  const W = 680, H = 300;
  const ctx = devicePx(cv, W, H);
  const slider = host.querySelector('#hsSlider');
  const vLbl = host.querySelector('#hsV');
  const readout = host.querySelector('#hsReadout');
  const OPTS = [8, 4, 2, 1];

  function draw() {
    const nkv = OPTS[parseInt(slider.value, 10)];
    vLbl.textContent = nkv;
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute'), fg = cssVar('--fg'), line = cssVar('--line');
    const nq = 8, qw = 44, qgap = 28;
    const totalW = nq * qw + (nq - 1) * qgap;
    const x0 = (W - totalW) / 2;
    // query heads (bottom)
    ctx.font = '12px sans-serif';
    for (let i = 0; i < nq; i++) {
      const x = x0 + i * (qw + qgap);
      ctx.fillStyle = BLUE; ctx.globalAlpha = 0.85;
      ctx.fillRect(x, 196, qw, 30);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fg; ctx.fillText('Q' + i, x + 14, 216);
    }
    // kv heads (top), centered per group
    const group = nq / nkv;
    for (let g = 0; g < nkv; g++) {
      const firstQ = g * group, lastQ = firstQ + group - 1;
      const cx = x0 + ((firstQ + lastQ) / 2) * (qw + qgap) + qw / 2;
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 26, 44, 52, 30);
      ctx.fillRect(cx - 26, 80, 52, 30);
      ctx.fillStyle = '#fff'; ctx.fillText('K' + g, cx - 10, 64);
      ctx.fillText('V' + g, cx - 10, 100);
      // arrows to the group's queries
      ctx.strokeStyle = mute; ctx.lineWidth = 1.4;
      for (let q = firstQ; q <= lastQ; q++) {
        const qx = x0 + q * (qw + qgap) + qw / 2;
        ctx.beginPath();
        ctx.moveTo(cx, 112);
        ctx.lineTo(qx, 194);
        ctx.stroke();
      }
    }
    // cache bar
    const frac = nkv / 8;
    ctx.strokeStyle = line; ctx.strokeRect(x0, 254, totalW, 18);
    ctx.fillStyle = accent;
    ctx.fillRect(x0, 254, totalW * frac, 18);
    ctx.fillStyle = mute; ctx.font = '12.5px sans-serif';
    ctx.fillText(`KV cache size: ${frac === 1 ? '1×  (baseline)' : (1 / frac) + '× smaller'}`, x0 + totalW * frac + 10, 268);
    const names = { 8: ['MHA — every head private', 'full quality, full cache'], 4: ['GQA-4', 'quality ≈ MHA'], 2: ['GQA-2', 'quality ≈ MHA (Llama-70B uses GQA-8 of 64)'], 1: ['MQA — one shared K/V', 'measurable quality drop; fastest'] };
    ctx.fillStyle = fg; ctx.font = 'bold 14px sans-serif';
    ctx.fillText(names[nkv][0], x0, 26);
    readout.innerHTML = `${names[nkv][0]} &nbsp;·&nbsp; ${names[nkv][1]} &nbsp;·&nbsp; GQA paper: uptrain an MHA checkpoint with <b>5%</b> of pretraining compute`;
  }

  slider.addEventListener('input', draw);
  onTheme(draw);
  draw();
})();

/* =====================================================================
 * Widget 4: paged-race — contiguous max-length reservation vs 16-token
 * pages, same request stream. Live utilization.
 * ===================================================================== */
(function pagedRace() {
  const host = document.getElementById('paged-race');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="prCanvas"></canvas>
      <div class="controls">
        <button id="prRun" class="primary">run</button>
        <div class="readout" id="prReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#prCanvas');
  const W = 680, H = 360;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#prReadout');

  const SLOTS = 512, COLS = 64, ROWS = SLOTS / COLS;
  const MAXLEN = 128, BLOCK = 16;
  const PALETTE = ['#5fa9ff', '#4caf7d', '#e8b93c', '#b085e8', '#e05555', '#4dc4c4', '#e88bb1', '#95a840'];
  let timer = null;
  let S;

  function fresh() {
    return {
      tick: 0, nextId: 0, done: 0,
      cont: { mem: new Array(SLOTS).fill(-1), reqs: [], served: 0, rejected: 0 },
      paged: { mem: new Array(SLOTS).fill(-1), reqs: [], served: 0, rejected: 0 },
    };
  }

  function newLen() { return 8 + Math.floor(Math.random() * (MAXLEN - 8)); }

  function contAdmit(sys, req) {
    // find a contiguous run of MAXLEN free slots
    let run = 0;
    for (let i = 0; i < SLOTS; i++) {
      run = sys.mem[i] === -1 ? run + 1 : 0;
      if (run === MAXLEN) {
        const start = i - MAXLEN + 1;
        for (let j = start; j <= i; j++) sys.mem[j] = req.id;
        req.start = start;
        return true;
      }
    }
    return false;
  }
  function pagedAdmit(sys, req) {
    req.blocks = [];
    return pagedGrow(sys, req);   // grab the first block
  }
  function pagedGrow(sys, req) {
    for (let b = 0; b < SLOTS / BLOCK; b++) {
      if (sys.mem[b * BLOCK] === -1) {
        for (let j = 0; j < BLOCK; j++) sys.mem[b * BLOCK + j] = req.id;
        req.blocks.push(b);
        return true;
      }
    }
    return false;
  }

  function step() {
    S.tick++;
    // arrivals: one candidate request every 2 ticks, same stream for both
    if (S.tick % 2 === 0) {
      const len = newLen();
      const idc = S.nextId++;
      const rc = { id: idc, len, t: 0 };
      const rp = { id: idc, len, t: 0 };
      if (contAdmit(S.cont, rc)) S.cont.reqs.push(rc); else S.cont.rejected++;
      if (pagedAdmit(S.paged, rp)) S.paged.reqs.push(rp); else S.paged.rejected++;
    }
    // progress + completion
    const finish = (sys, freeFn) => {
      for (const r of sys.reqs) {
        r.t++;
        if (sys === S.paged && r.t % BLOCK === 0 && r.t < r.len) pagedGrow(sys, r);
      }
      sys.reqs = sys.reqs.filter(r => {
        if (r.t >= r.len) { freeFn(r); sys.served++; return false; }
        return true;
      });
    };
    finish(S.cont, r => { for (let j = r.start; j < r.start + MAXLEN; j++) S.cont.mem[j] = -1; });
    finish(S.paged, r => { for (const b of r.blocks) for (let j = 0; j < BLOCK; j++) S.paged.mem[b * BLOCK + j] = -1; });
    draw();
    if (S.tick > 400) { clearInterval(timer); timer = null; }
  }

  function utilization(sys) {
    let allocated = 0, used = 0;
    for (const r of sys.reqs) {
      allocated += (sys === S.cont) ? MAXLEN : r.blocks.length * BLOCK;
      used += r.t;
    }
    return allocated ? used / allocated : 0;
  }

  function drawGrid(x0, y0, sys, title, util) {
    const mute = cssVar('--fg-mute'), line = cssVar('--line'), fg = cssVar('--fg');
    ctx.fillStyle = fg; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(title, x0, y0 - 26);
    ctx.fillStyle = mute; ctx.font = '12px sans-serif';
    ctx.fillText(`utilization ${(util * 100).toFixed(0)}% · active ${sys.reqs.length} · done ${sys.served} · rejected ${sys.rejected}`, x0, y0 - 9);
    const cw = 9.6, ch = 12;
    const usedByReq = {};
    for (const r of sys.reqs) usedByReq[r.id] = r.t;
    // per-request slot ordering so "used so far" renders solid, reservation faded
    const seen = {};
    for (let i = 0; i < SLOTS; i++) {
      const id = sys.mem[i];
      const x = x0 + (i % COLS) * (cw + 0.6), y = y0 + Math.floor(i / COLS) * (ch + 1.2);
      if (id === -1) {
        ctx.fillStyle = line; ctx.globalAlpha = 0.45;
        ctx.fillRect(x, y, cw, ch);
        ctx.globalAlpha = 1;
      } else {
        seen[id] = (seen[id] || 0) + 1;
        const solid = seen[id] <= (usedByReq[id] || 0);
        ctx.fillStyle = PALETTE[id % PALETTE.length];
        ctx.globalAlpha = solid ? 0.95 : 0.28;
        ctx.fillRect(x, y, cw, ch);
        ctx.globalAlpha = 1;
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const uc = utilization(S.cont), up = utilization(S.paged);
    drawGrid(14, 44, S.cont, 'contiguous reservations (pre-vLLM)', uc);
    drawGrid(14, 224, S.paged, 'PagedAttention: 16-token blocks', up);
    readout.innerHTML = `faded = allocated but unused. served <b>${S.paged.served}</b> vs ${S.cont.served} · turned away <b>${S.cont.rejected}</b> vs ${S.paged.rejected}`;
  }

  function run() {
    if (timer) { clearInterval(timer); timer = null; }
    S = fresh();
    timer = setInterval(step, 60);
  }

  host.querySelector('#prRun').addEventListener('click', run);
  onTheme(() => S && draw());
  S = fresh();
  draw();
  readout.innerHTML = 'press run — same random request stream hits both allocators';
})();

/* =====================================================================
 * Widget 5: evict-explorer — window / window+sinks / H2O policies on a
 * synthetic attention-mass profile; retained mass readout.
 * ===================================================================== */
(function evictExplorer() {
  const host = document.getElementById('evict-explorer');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="eeCanvas"></canvas>
      <div class="controls">
        <div class="seg">
          <button id="eeWin" class="active">window only</button>
          <button id="eeSink">window + 4 sinks</button>
          <button id="eeH2O">H2O (heavy hitters)</button>
        </div>
        <div><label>cache budget: <span id="eeBv">24</span> / 48 tokens</label>
          <input type="range" id="eeB" min="8" max="48" step="1" value="24"/></div>
        <div class="readout" id="eeReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#eeCanvas');
  const W = 680, H = 300;
  const ctx = devicePx(cv, W, H);
  const sB = host.querySelector('#eeB'), vB = host.querySelector('#eeBv');
  const readout = host.querySelector('#eeReadout');
  let policy = 'win';

  // synthetic per-token attention mass: sinks huge, a few heavy hitters,
  // recency ramp, low background
  const N = 48;
  const mass = new Array(N).fill(0);
  (function build() {
    let seed = 42;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < N; i++) mass[i] = 0.15 + 0.25 * rnd();
    mass[0] = 6.0; mass[1] = 2.2; mass[2] = 1.4; mass[3] = 1.0;      // sinks
    [11, 19, 27, 33, 38].forEach(i => { mass[i] = 1.6 + rnd(); });    // heavy hitters
    for (let i = 0; i < N; i++) mass[i] += Math.max(0, (i - (N - 12)) * 0.09); // recency
  })();
  const total = mass.reduce((a, b) => a + b, 0);
  const HH = [11, 19, 27, 33, 38];

  function kept(budget) {
    const keep = new Array(N).fill(false);
    if (policy === 'win') {
      for (let i = N - budget; i < N; i++) keep[i] = true;
    } else if (policy === 'sink') {
      const s = Math.min(4, budget);
      for (let i = 0; i < s; i++) keep[i] = true;
      for (let i = N - (budget - s); i < N; i++) keep[i] = true;
    } else {
      const recent = Math.floor(budget / 2);
      for (let i = N - recent; i < N; i++) keep[i] = true;
      const rest = budget - recent;
      const idx = [...Array(N).keys()].filter(i => !keep[i]).sort((a, b) => mass[b] - mass[a]);
      for (let k = 0; k < rest && k < idx.length; k++) keep[idx[k]] = true;
    }
    return keep;
  }

  function draw() {
    const budget = parseInt(sB.value, 10);
    vB.textContent = budget;
    const keep = kept(budget);
    ctx.clearRect(0, 0, W, H);
    const accent = cssVar('--accent') || '#c2571f';
    const mute = cssVar('--fg-mute'), fg = cssVar('--fg'), line = cssVar('--line');
    const bw = (W - 60) / N, base = H - 70, maxM = 6.0;
    let retained = 0;
    for (let i = 0; i < N; i++) {
      const h = Math.max(3, (mass[i] / maxM) * 170);
      const x = 30 + i * bw;
      const isSink = i < 4, isHH = HH.includes(i);
      let color = isSink ? GOLD : isHH ? accent : BLUE;
      ctx.fillStyle = color;
      ctx.globalAlpha = keep[i] ? 0.95 : 0.15;
      ctx.fillRect(x, base - h, bw - 2, h);
      ctx.globalAlpha = 1;
      if (!keep[i]) {
        ctx.strokeStyle = RED; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 1, base + 4); ctx.lineTo(x + bw - 3, base + 4); ctx.stroke();
      }
      if (keep[i]) retained += mass[i];
    }
    ctx.fillStyle = mute; ctx.font = '12px sans-serif';
    ctx.fillText('token 0 (sequence start)', 30, base + 22);
    ctx.textAlign = 'right'; ctx.fillText('most recent →', W - 30, base + 22); ctx.textAlign = 'left';
    ctx.fillStyle = GOLD; ctx.fillText('■ attention sinks', 30, 24);
    ctx.fillStyle = accent; ctx.fillText('■ heavy hitters', 150, 24);
    ctx.fillStyle = BLUE; ctx.fillText('■ ordinary (height = attention mass received)', 255, 24);
    ctx.fillStyle = mute; ctx.fillText('faded + red underline = evicted', 30, 42);

    const pct = retained / total * 100;
    const sinksGone = policy === 'win' && budget < N - 3;
    const bar = (W - 60) * (pct / 100);
    ctx.strokeStyle = line; ctx.strokeRect(30, H - 32, W - 60, 14);
    ctx.fillStyle = pct > 85 ? GREEN : pct > 65 ? GOLD : RED;
    ctx.fillRect(30, H - 32, bar, 14);
    ctx.fillStyle = fg; ctx.font = 'bold 12.5px sans-serif';
    ctx.fillText(`retained attention mass: ${pct.toFixed(0)}%`, 34, H - 36);
    readout.innerHTML = sinksGone
      ? `<b style="color:#e05555">sinks evicted</b> — in a real model this is where perplexity detonates (5 → 5000+), whatever the % says`
      : `budget <b>${budget}</b>/${N} · retained mass <b>${pct.toFixed(0)}%</b>` +
        (policy === 'sink' ? ' · 4 gold columns pinned forever — StreamingLLM' :
         policy === 'h2o' ? ' · keeps whoever mattered, wherever they are' : '');
  }

  [['eeWin', 'win'], ['eeSink', 'sink'], ['eeH2O', 'h2o']].forEach(([id, name]) => {
    host.querySelector('#' + id).addEventListener('click', (e) => {
      policy = name;
      host.querySelectorAll('.seg button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      draw();
    });
  });
  sB.addEventListener('input', draw);
  onTheme(draw);
  draw();
})();
