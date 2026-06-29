/* sparse_attention blog interactive widgets. Plain JS / Canvas. No deps. */

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

/* =====================================================================
 * Widget 1: cost-curve
 * Full attention O(n^2) vs sparse near-linear, in two regimes (FLOPs / KV bytes).
 * ===================================================================== */
(function costCurve() {
  const host = document.getElementById('cost-curve');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="cc-canvas"></canvas>
      <div class="controls">
        <div class="sa-row"><label>context length n <span id="cc-nv"></span></label>
          <input type="range" id="cc-n" min="2048" max="131072" step="2048" value="65536"/></div>
        <div class="sa-toggle">
          <button id="cc-flops" class="active">compute (FLOPs)</button>
          <button id="cc-bytes">KV bytes (decode)</button>
        </div>
        <div class="readout" id="cc-readout"></div>
      </div>
    </div>
  `);

  const W = 460, H = 300;
  const cv = host.querySelector('#cc-canvas');
  const ctx = devicePx(cv, W, H);
  const nS = host.querySelector('#cc-n');
  const readout = host.querySelector('#cc-readout');
  let mode = 'flops';

  // NSA-ish sparse budget at length n: compressed (n/16) + selected (16*64) + window 512
  function sparseTokens(n) { return Math.min(n, n / 16 + 16 * 64 + 512); }

  function draw() {
    const n = parseInt(nS.value, 10);
    host.querySelector('#cc-nv').textContent = (n / 1024).toFixed(0) + 'k';
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const x0 = 46, x1 = W - 16, y0 = 24, y1 = H - 42;
    const nmax = 131072;
    const px = v => x0 + (v / nmax) * (x1 - x0);

    // cost function per mode (normalized to full @ nmax = 1)
    const full = mode === 'flops' ? (v => v * v) : (v => v);
    const sparse = mode === 'flops'
      ? (v => v * sparseTokens(v))      // per-query sparse tokens summed over queries
      : (v => sparseTokens(v));         // bytes loaded per decode step
    const fmax = full(nmax);
    const py = val => y1 - (val / fmax) * (y1 - y0);

    // axes
    ctx.strokeStyle = '#2a2c34'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif';
    ctx.fillText('cost', x0 - 38, y0 + 8);
    ctx.fillText('context length →', x1 - 110, y1 + 22);

    // full curve
    ctx.strokeStyle = '#ff6a8a'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const v = i / 120 * nmax; i === 0 ? ctx.moveTo(px(v), py(full(v))) : ctx.lineTo(px(v), py(full(v))); }
    ctx.stroke();
    // sparse curve
    ctx.strokeStyle = '#6adfb8'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const v = i / 120 * nmax; i === 0 ? ctx.moveTo(px(v), py(sparse(v))) : ctx.lineTo(px(v), py(sparse(v))); }
    ctx.stroke();

    // marker at current n
    const ratio = full(n) / Math.max(sparse(n), 1e-9);
    [['#ff6a8a', full(n)], ['#6adfb8', sparse(n)]].forEach(([c, val]) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(px(n), py(val), 4.5, 0, Math.PI * 2); ctx.fill();
    });
    ctx.strokeStyle = '#555'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px(n), y0); ctx.lineTo(px(n), y1); ctx.stroke();
    ctx.setLineDash([]);

    // legend
    ctx.fillStyle = '#ff6a8a'; ctx.fillText('full O(n²)' , x1 - 150, y0 + 6);
    ctx.fillStyle = '#6adfb8'; ctx.fillText('sparse', x1 - 64, y0 + 6);

    readout.innerHTML =
      `at n = <b>${(n / 1024).toFixed(0)}k</b>, ${mode === 'flops' ? 'compute' : 'KV bytes'}: ` +
      `sparse is <b>${ratio.toFixed(1)}×</b> cheaper than full<br/>` +
      (mode === 'flops'
        ? 'compute-bound regime (training / prefill) — cut FLOPs'
        : 'memory-bound regime (decoding) — cut bytes moved');
  }

  nS.addEventListener('input', draw);
  host.querySelector('#cc-flops').addEventListener('click', () => {
    mode = 'flops';
    host.querySelector('#cc-flops').classList.add('active');
    host.querySelector('#cc-bytes').classList.remove('active');
    draw();
  });
  host.querySelector('#cc-bytes').addEventListener('click', () => {
    mode = 'bytes';
    host.querySelector('#cc-bytes').classList.add('active');
    host.querySelector('#cc-flops').classList.remove('active');
    draw();
  });
  draw();
})();

/* =====================================================================
 * Widget 2: pattern-explorer
 * Canonical sparsity patterns on a 32x32 causal attention matrix.
 * ===================================================================== */
(function patternExplorer() {
  const host = document.getElementById('pattern-explorer');
  if (!host) return;

  const N = 32;
  const PATTERNS = {
    full:    { label: 'full', fn: (q, k) => k <= q },
    window:  { label: 'sliding window', fn: (q, k) => k <= q && q - k < 5 },
    strided: { label: 'strided', fn: (q, k) => k <= q && ((q - k) % 4 === 0 || q - k < 2) },
    bigbird: { label: 'global + local', fn: (q, k) => k <= q && (q - k < 3 || k < 2 || k % 8 === 0) },
    block:   { label: 'block-sparse', fn: (q, k) => {
                if (k > q) return false;
                const qb = Math.floor(q / 4), kb = Math.floor(k / 4);
                return kb === qb || kb === 0 || (qb - kb) % 2 === 0;
              } },
    nsa:     { label: 'NSA (cmp+slc+win)', fn: (q, k) => {
                if (k > q) return false;
                if (q - k < 5) return true;             // sliding window
                const kb = Math.floor(k / 4);
                if (kb === 0) return true;               // initial block (compression+global)
                // two "selected" blocks per query, pseudo-importance by hash
                const sel = (q * 7 + 3) % 8;
                const sel2 = (q * 5 + 1) % 8;
                return kb === sel || kb === sel2;
              } },
  };

  const chips = Object.entries(PATTERNS).map(([k, v], i) =>
    `<button class="sa-chip${i === 0 ? ' active' : ''}" data-k="${k}">${v.label}</button>`).join('');
  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="pe-canvas"></canvas>
      <div class="controls">
        <div class="sa-chips">${chips}</div>
        <div class="readout" id="pe-readout"></div>
      </div>
    </div>
  `);

  const S = 300;
  const cv = host.querySelector('#pe-canvas');
  const ctx = devicePx(cv, S, S);
  const readout = host.querySelector('#pe-readout');
  let cur = 'full';

  function draw() {
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, S, S);
    const pad = 24, grid = S - pad * 2, cell = grid / N;
    const fn = PATTERNS[cur].fn;
    let computed = 0, causal = 0;
    const accent = cssVar('--accent') || '#ff9b6a';
    for (let q = 0; q < N; q++) {
      for (let k = 0; k < N; k++) {
        if (k <= q) causal++;
        const x = pad + k * cell, y = pad + q * cell;
        if (k > q) {
          ctx.fillStyle = '#16171c';   // masked (future)
        } else if (fn(q, k)) {
          ctx.fillStyle = accent; computed++;
        } else {
          ctx.fillStyle = '#23252e';   // skipped
        }
        ctx.fillRect(x, y, cell - 0.5, cell - 0.5);
      }
    }
    // labels
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif';
    ctx.fillText('keys →', pad, pad - 8);
    ctx.save(); ctx.translate(pad - 10, pad + 30); ctx.rotate(-Math.PI / 2);
    ctx.fillText('queries →', 0, 0); ctx.restore();

    const density = 100 * computed / causal;
    readout.innerHTML = `<b>${PATTERNS[cur].label}</b> · computes <b>${computed}</b> of ${causal} causal cells ` +
      `= <b>${density.toFixed(0)}%</b> density` +
      (cur === 'full' ? '<br/>every causal pair — the O(n²) baseline' :
       cur === 'nsa' ? '<br/>local window + initial/compressed + selected blocks' :
       '<br/>' + (density < 40 ? 'most compute skipped' : 'partial savings'));
  }

  host.querySelectorAll('.sa-chip').forEach(c => {
    c.addEventListener('click', () => {
      host.querySelectorAll('.sa-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      cur = c.dataset.k;
      draw();
    });
  });
  draw();
})();

/* =====================================================================
 * Widget 3: timeline-explorer
 * Filterable, expandable map of the sparse-attention literature.
 * ===================================================================== */
(function timelineExplorer() {
  const host = document.getElementById('timeline-explorer');
  if (!host) return;

  const TRACKS = {
    foundations: { label: 'Foundations', color: '#e8d56a' },
    fixed: { label: 'Fixed patterns', color: '#ff9b4a' },
    learned: { label: 'Learned selection', color: '#caa7ff' },
    kvcache: { label: 'KV-cache / inference', color: '#5fa9ff' },
    hardware: { label: 'Hardware / IO-aware', color: '#6adfb8' },
    native: { label: 'Native sparse', color: '#e76a6a' },
  };

  const PAPERS = [
    { t: 'Attention Is All You Need', a: 'Vaswani et al.', v: 'NeurIPS 2017', d: '2017-06', tr: 'foundations', x: '1706.03762',
      b: 'The Transformer. Defines the O(n²) softmax attention every sparse method tries to approximate — and whose natural sparsity they exploit. The starting point for the whole story.' },
    { t: 'Generating Long Sequences with Sparse Transformers', a: 'Child, Gray, Radford, Sutskever', v: 'OpenAI 2019', d: '2019-04', tr: 'fixed', x: '1904.10509',
      b: 'The paper that started sparse attention. Factorizes attention into strided + local fixed patterns, cutting cost to O(n√n) and enabling sequences of length 12k+. Introduced the block/strided vocabulary everything later builds on.' },
    { t: 'Reformer: The Efficient Transformer', a: 'Kitaev, Kaiser, Levskaya', v: 'ICLR 2020', d: '2020-01', tr: 'learned', x: '2001.04451',
      b: 'Locality-sensitive hashing buckets similar queries and keys so attention runs only within a bucket — O(n log n), content-aware. Elegant, but the hashing is discrete and hard to make hardware-efficient or smoothly trainable.' },
    { t: 'Longformer', a: 'Beltagy, Peters, Cohan', v: 'arXiv 2020', d: '2020-04', tr: 'fixed', x: '2004.05150',
      b: 'Sliding-window local attention plus a few task-specific global tokens, scaling linearly to 4k+ tokens. The local+global recipe became the default for long-document encoders.' },
    { t: 'Routing Transformer', a: 'Roy, Saffar, Vaswani, Grangier', v: 'TACL 2021', d: '2020-03', tr: 'learned', x: '2003.05997',
      b: 'Online k-means clusters tokens; each query attends only within its cluster. Content-based routing gives O(n^1.5) with strong quality — but clustering is non-differentiable, foreshadowing the trainability problem NSA names explicitly.' },
    { t: 'BigBird', a: 'Zaheer et al.', v: 'NeurIPS 2020', d: '2020-07', tr: 'fixed', x: '2007.14062',
      b: 'Combines random + window + global attention and proves the result is a universal approximator and Turing-complete — sparse attention need not sacrifice expressivity. Theoretical backbone of the fixed-pattern era.' },
    { t: 'StreamingLLM', a: 'Xiao et al.', v: 'ICLR 2024', d: '2023-09', tr: 'kvcache', x: '2309.17453',
      b: 'Discovers "attention sinks": keeping the first few tokens plus a recent window lets a model stream indefinitely with a fixed cache. A minimal, training-free KV scheme that shaped later eviction methods.' },
    { t: 'H2O', a: 'Zhang et al.', v: 'NeurIPS 2023', d: '2023-06', tr: 'kvcache', x: '2306.14048',
      b: 'Heavy-Hitter Oracle: keep only the tokens that have historically received the most attention, evicting the rest from the KV cache. Cheap decode-time memory savings, but evicted tokens are gone — and prefill stays expensive.' },
    { t: 'FlashAttention', a: 'Dao, Fu, Ermon, Rudra, Ré', v: 'NeurIPS 2022', d: '2022-05', tr: 'hardware', x: '2205.14135',
      b: 'Not sparse, but the reason sparse must be block-structured: exact attention made IO-optimal by tiling and never materializing the n×n matrix. Establishes that on GPUs the algorithm and the memory hierarchy must be co-designed.' },
    { t: 'Quest', a: 'Tang et al.', v: 'ICML 2024', d: '2024-06', tr: 'kvcache', x: '2406.10774',
      b: 'Query-aware block selection at inference: estimate each KV block\'s relevance to the current query and load only the top blocks. Block structure is hardware-friendly — but per-head selection breaks GQA\'s shared-cache savings.' },
    { t: 'InfLLM', a: 'Xiao et al.', v: 'NeurIPS 2024', d: '2024-02', tr: 'kvcache', x: '2402.04617',
      b: 'Training-free long-context via a memory of evicted KV blocks, retrieving relevant ones on demand. Extends pretrained models to very long contexts without fine-tuning — an inference-side block-retrieval approach.' },
    { t: 'MInference', a: 'Jiang et al.', v: 'NeurIPS 2024', d: '2024-07', tr: 'kvcache', x: '2407.02490',
      b: 'Accelerates the prefill of long prompts by classifying each head\'s sparse pattern (A-shape, vertical-slash, block) and computing only those. Big prefill speedups, but leaves decoding at full cost — the "phase-restricted" limitation NSA critiques.' },
    { t: 'Native Sparse Attention (NSA)', a: 'Yuan et al. (DeepSeek)', v: 'ACL 2025 (best paper)', d: '2025-02', tr: 'native', x: '2502.11089', hot: true,
      b: 'The anchor of this post. Compression + blockwise selection + sliding window, gated together, trained from scratch and run on a GQA-aware Triton kernel. Fast in all stages (11.6× decode, 9× forward at 64k) and beats full attention on accuracy.' },
    { t: 'MoBA: Mixture of Block Attention', a: 'Lu et al. (Moonshot AI)', v: 'arXiv 2025', d: '2025-02', tr: 'native', x: '2502.13189',
      b: 'A contemporary of NSA: route each query to a small set of key blocks with a top-k gate, MoE-style, switching seamlessly between full and sparse. Deployed in Kimi; shows native trainable block-sparsity arriving from two labs at once.' },
  ];

  const chips = ['all', ...Object.keys(TRACKS)].map(k =>
    `<button class="tl-chip${k === 'all' ? ' active' : ''}" data-k="${k}"
       ${k !== 'all' ? `style="--chip:${TRACKS[k].color}"` : ''}>
       ${k === 'all' ? 'All (' + PAPERS.length + ')' : TRACKS[k].label}</button>`).join('');

  host.insertAdjacentHTML('beforeend', `
    <div class="tl-chips">${chips}</div>
    <div class="tl-cards" id="tl-cards"></div>
  `);

  const box = host.querySelector('#tl-cards');

  function render(filter) {
    box.innerHTML = '';
    PAPERS.filter(p => filter === 'all' || p.tr === filter).forEach(p => {
      const tr = TRACKS[p.tr];
      const card = document.createElement('div');
      card.className = 'tl-card' + (p.hot ? ' hot' : '');
      card.style.setProperty('--chip', tr.color);
      card.innerHTML = `
        <div class="tl-head">
          <span class="tl-date">${p.d}</span>
          <span class="tl-track" style="color:${tr.color}">${tr.label}</span>
        </div>
        <div class="tl-title">${p.t}</div>
        <div class="tl-meta">${p.a} · ${p.v}${p.x ? ` · <a href="https://arxiv.org/abs/${p.x}" target="_blank" rel="noopener">arXiv ${p.x}</a>` : ''}</div>
        <div class="tl-blurb">${p.b}</div>`;
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        card.classList.toggle('open');
      });
      box.appendChild(card);
    });
  }

  host.querySelectorAll('.tl-chip').forEach(c => {
    c.addEventListener('click', () => {
      host.querySelectorAll('.tl-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      render(c.dataset.k);
    });
  });
  render('all');
})();

/* =====================================================================
 * Widget 4: branch-builder
 * NSA's three branches over a token sequence; sliders set the budget; the
 * query position changes which blocks are "important" (selected).
 * ===================================================================== */
(function branchBuilder() {
  const host = document.getElementById('branch-builder');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="bb-canvas"></canvas>
      <div class="controls">
        <div class="sa-row"><label>compression block l <span id="bb-lv"></span></label>
          <input type="range" id="bb-l" min="2" max="8" step="1" value="4"/></div>
        <div class="sa-row"><label>selected blocks n <span id="bb-nv"></span></label>
          <input type="range" id="bb-n" min="0" max="6" step="1" value="2"/></div>
        <div class="sa-row"><label>window w <span id="bb-wv"></span></label>
          <input type="range" id="bb-w" min="0" max="12" step="1" value="4"/></div>
        <div class="readout" id="bb-readout">drag the canvas to move the query →</div>
      </div>
    </div>
  `);

  const T = 48;          // sequence length (tokens)
  const W = 460, H = 250;
  const cv = host.querySelector('#bb-canvas');
  const ctx = devicePx(cv, W, H);
  const lS = host.querySelector('#bb-l'), nS = host.querySelector('#bb-n'), wS = host.querySelector('#bb-w');
  const readout = host.querySelector('#bb-readout');
  let qpos = 40;

  // a fixed pseudo-importance per block (varies a bit with query position)
  function importance(blk, nblk) {
    return 0.5 + 0.5 * Math.sin(blk * 1.7 + qpos * 0.05) * Math.cos(blk * 0.9 + 1.3);
  }

  function draw() {
    const l = parseInt(lS.value, 10), n = parseInt(nS.value, 10), w = parseInt(wS.value, 10);
    host.querySelector('#bb-lv').textContent = l;
    host.querySelector('#bb-nv').textContent = n;
    host.querySelector('#bb-wv').textContent = w;
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const x0 = 20, x1 = W - 20;
    const cw = (x1 - x0) / T;
    const tx = i => x0 + i * cw;
    const nblk = Math.ceil((qpos + 1) / l);

    // importance over blocks → top-n selected (excluding window + block 0 which are always on)
    const imps = [];
    for (let b = 0; b < nblk; b++) imps.push({ b, v: importance(b, nblk) });
    const winStart = Math.max(0, qpos - w + 1);
    const selectable = imps.filter(o => o.b !== 0 && (o.b + 1) * l - 1 < winStart);
    selectable.sort((a, b) => b.v - a.v);
    const selected = new Set(selectable.slice(0, n).map(o => o.b));
    selected.add(0); // initial block always on

    // draw token row
    const rowY = 96;
    const attended = new Set();
    for (let i = 0; i <= qpos; i++) {
      const b = Math.floor(i / l);
      let color = '#23252e', label = null;
      if (i >= winStart) { color = '#5fa9ff'; attended.add(i); }        // window
      else if (selected.has(b)) { color = '#caa7ff'; attended.add(i); } // selected fine
      ctx.fillStyle = color;
      ctx.fillRect(tx(i) + 0.5, rowY, cw - 1, 22);
    }
    // future (masked)
    for (let i = qpos + 1; i < T; i++) {
      ctx.fillStyle = '#16171c';
      ctx.fillRect(tx(i) + 0.5, rowY, cw - 1, 22);
    }
    // query marker
    ctx.fillStyle = cssVar('--accent') || '#ff9b6a';
    ctx.fillRect(tx(qpos) + 0.5, rowY - 4, cw - 1, 30);

    // compressed tokens row (one per block, always attended coarsely)
    const compY = 50;
    ctx.fillStyle = '#888'; ctx.font = '11px sans-serif';
    ctx.fillText('compressed tokens (coarse, all blocks)', x0, compY - 8);
    for (let b = 0; b < nblk; b++) {
      ctx.fillStyle = '#6adfb8';
      ctx.fillRect(tx(b * l) + 1, compY, cw * l - 2, 16);
    }

    // importance bars under each block
    const impY = 150;
    ctx.fillStyle = '#888';
    ctx.fillText('block importance → top-n selected (purple)', x0, impY - 4);
    for (let b = 0; b < nblk; b++) {
      const v = Math.max(0.05, importance(b, nblk));
      ctx.fillStyle = selected.has(b) ? '#caa7ff' : '#3a3d48';
      const bh = v * 34;
      ctx.fillRect(tx(b * l) + 1, impY + 36 - bh, cw * l - 2, bh);
    }

    // labels
    ctx.fillStyle = '#888';
    ctx.fillText('keys / values  (query in orange)', x0, rowY + 40);

    // counts
    const compCount = nblk;
    const Nt = compCount + attended.size;
    const full = qpos + 1;
    readout.innerHTML =
      `query at position <b>${qpos}</b> of ${T}<br/>` +
      `attended: <span style="color:#6adfb8">${compCount} compressed</span> + ` +
      `<span style="color:#caa7ff">${[...attended].filter(i => i < winStart).length} selected</span> + ` +
      `<span style="color:#5fa9ff">${[...attended].filter(i => i >= winStart).length} window</span> ` +
      `= <b>N_t = ${Nt}</b> vs full <b>${full}</b> ` +
      `→ <b>${(100 * Nt / full).toFixed(0)}%</b>`;
  }

  function setQ(e) {
    const r = cv.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width * W - 20) / ((W - 40) / T));
    qpos = Math.min(T - 1, Math.max(8, i));
    draw();
  }
  let drag = false;
  cv.addEventListener('pointerdown', (e) => { drag = true; cv.setPointerCapture(e.pointerId); setQ(e); });
  cv.addEventListener('pointermove', (e) => { if (drag) setQ(e); });
  cv.addEventListener('pointerup', () => { drag = false; });
  [lS, nS, wS].forEach(s => s.addEventListener('input', draw));
  draw();
})();
