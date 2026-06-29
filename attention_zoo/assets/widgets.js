/* attention_zoo blog interactive widgets. Plain JS / Canvas. No deps. */

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
 * Widget 1: taxonomy
 * Families -> methods, with expandable tutorial cards.
 * ===================================================================== */
(function taxonomy() {
  const host = document.getElementById('taxonomy');
  if (!host) return;

  const FAMILIES = {
    sparse: { label: 'Sparse', color: '#caa7ff',
      methods: [
        ['Sparse Transformer (2019)', 'Fixed strided + local factorization of the attention matrix — the first sparse attention, O(n√n).'],
        ['Longformer / BigBird (2020)', 'Sliding-window local attention plus a few global tokens; BigBird adds random links and proves universality.'],
        ['Adaptive Attention Span (2019)', 'Each head learns how far back to attend, so depth-appropriate heads stay cheap.'],
        ['Reformer (2020)', 'Locality-sensitive hashing buckets similar queries/keys; attend within buckets. O(n log n), content-aware.'],
        ['NSA / MoBA (2025)', 'Native, trainable blockwise selection aligned to GPU memory. Fast in all stages and matches full attention. See the dedicated post.'],
      ]},
    lowrank: { label: 'Low-rank / Linear', color: '#6adfb8',
      methods: [
        ['Linformer (2020)', 'Project keys & values to a small fixed length k (the matrix is low-rank), giving O(nk) ≈ O(n).'],
        ['Linear Transformer (2020)', 'Replace softmax with a feature map so QK^T·V reorders to Q·(K^T V); O(n) and expressible as a recurrence.'],
        ['Performer (2020)', 'FAVOR+ random features provably approximate the softmax kernel — unbiased, O(n), drop-in.'],
        ['cosFormer / others', 'Re-weighted linear attention restoring some of softmax\'s locality and concentration.'],
      ]},
    ssm: { label: 'SSM / Linear-RNN', color: '#5fa9ff',
      methods: [
        ['S4 (2021)', 'Structured state-space model: a linear recurrence trainable as a global convolution. Excellent on very long signals.'],
        ['Mamba / S6 (2023)', 'Input-dependent ("selective") SSM + hardware-aware scan. Matches Transformers on language with O(1) decode.'],
        ['Mamba-2 (2024)', 'The SSD framework shows SSMs and attention are two views of one structured operation; faster, simpler.'],
        ['RWKV (2023)', '"Reinventing RNNs for the Transformer era": parallel training, recurrent constant-memory inference. Open, multilingual, edge-friendly.'],
        ['RetNet (2023)', 'Retention with three equivalent forms — parallel (train), recurrent (decode), chunkwise (long).'],
      ]},
    hardware: { label: 'Hardware / Distributed', color: '#ff9b4a',
      methods: [
        ['FlashAttention (2022)', 'Exact attention, tiled to stay in SRAM, never materializing the n×n matrix. The universal default. See the dedicated post.'],
        ['Blockwise Attention', 'Compute attention in blocks to bound memory — the tiling principle behind FlashAttention.'],
        ['Ring Attention (2023)', 'Shard the sequence across GPUs in a ring, passing KV blocks while overlapping compute → context scales with device count.'],
      ]},
    hybrid: { label: 'Hybrid', color: '#e76a6a',
      methods: [
        ['Jamba (2024)', 'Interleaves Mamba, attention, and MoE blocks — recall of attention, cheap bulk from Mamba.'],
        ['MiniMax-01 (2025)', 'Lightning (linear) attention scaled to 456B params and 4M context, with periodic full-attention layers.'],
        ['Griffin / Hawk (2024)', 'Gated linear recurrences mixed with local attention; matches Transformers at lower cost.'],
        ['Samba / Zamba / Codestral Mamba', 'Production Mamba-attention hybrids — a few attention layers for exact recall, recurrence for the rest.'],
      ]},
  };

  const tabs = Object.entries(FAMILIES).map(([k, v], i) =>
    `<button class="az-tab${i === 0 ? ' active' : ''}" data-k="${k}" style="--chip:${v.color}">${v.label}</button>`).join('');
  host.insertAdjacentHTML('beforeend', `
    <div class="az-tabs">${tabs}</div>
    <div class="az-cards" id="az-cards"></div>
  `);
  const box = host.querySelector('#az-cards');

  function render(fam) {
    const v = FAMILIES[fam];
    box.innerHTML = '';
    v.methods.forEach(([name, blurb]) => {
      const card = document.createElement('div');
      card.className = 'az-card';
      card.style.setProperty('--chip', v.color);
      card.innerHTML = `<div class="az-name">${name}</div><div class="az-blurb">${blurb}</div>`;
      card.addEventListener('click', () => card.classList.toggle('open'));
      box.appendChild(card);
    });
  }
  host.querySelectorAll('.az-tab').forEach(t => {
    t.addEventListener('click', () => {
      host.querySelectorAll('.az-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      render(t.dataset.k);
    });
  });
  render('sparse');
})();

/* =====================================================================
 * Widget 2: reorder
 * Linear attention associativity: (QK^T)V vs Q(K^T V), with cost.
 * ===================================================================== */
(function reorder() {
  const host = document.getElementById('reorder');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="ro-canvas"></canvas>
      <div class="controls">
        <div class="az-toggle">
          <button id="ro-soft" class="active">(QKᵀ)V — softmax order</button>
          <button id="ro-lin">Q(KᵀV) — linear order</button>
        </div>
        <div class="sa-row"><label>sequence length n <span id="ro-nv"></span></label>
          <input type="range" id="ro-n" min="8" max="64" step="1" value="24"/></div>
        <div class="readout" id="ro-readout"></div>
      </div>
    </div>
  `);

  const W = 460, H = 280;
  const cv = host.querySelector('#ro-canvas');
  const ctx = devicePx(cv, W, H);
  const nS = host.querySelector('#ro-n');
  const readout = host.querySelector('#ro-readout');
  const d = 8; // feature dim (fixed, small)
  let mode = 'soft';

  function box(x, y, w, h, color, label, op) {
    ctx.fillStyle = color; ctx.globalAlpha = op;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, w, h);
    if (label) {
      ctx.fillStyle = '#e8e8ee'; ctx.font = '12px monospace';
      ctx.fillText(label, x + 4, y + 16);
    }
  }

  function draw() {
    const n = parseInt(nS.value, 10);
    host.querySelector('#ro-nv').textContent = n;
    ctx.fillStyle = '#0e0f12'; ctx.fillRect(0, 0, W, H);
    const sc = 1.7;              // px per "unit"
    const nN = n * sc / 4, dN = d * sc;
    const accent = cssVar('--accent') || '#ff9b6a';
    const pink = '#ff6a8a', green = '#6adfb8';

    ctx.fillStyle = '#888'; ctx.font = '12px sans-serif';
    if (mode === 'soft') {
      // form QK^T first: an n x n matrix (big), then * V
      ctx.fillText('step 1:  Q · Kᵀ  →  n×n matrix', 20, 30);
      box(20, 45, nN, nN, pink, 'n×n', 0.25);
      ctx.fillText('step 2:  (n×n) · V', 20, 70 + nN);
      box(20, 85 + nN, nN, dN, accent, '', 0.3);
      readout.innerHTML = `forms the full <b style="color:#ff6a8a">n×n</b> matrix first ` +
        `→ cost ∝ <b>n² = ${ (n*n).toLocaleString() }</b><br/>memory ∝ n² — the quadratic term`;
    } else {
      // form K^T V first: a d x d matrix (small), then Q * that
      ctx.fillText('step 1:  Kᵀ · V  →  d×d state', 20, 30);
      box(20, 45, dN, dN, green, 'd×d', 0.35);
      ctx.fillText('step 2:  Q · (d×d)', 20, 70 + dN);
      box(20, 85 + dN, nN, dN, accent, '', 0.3);
      readout.innerHTML = `forms only a small <b style="color:#6adfb8">d×d</b> state first ` +
        `→ cost ∝ <b>n·d² = ${(n*d*d).toLocaleString()}</b><br/>linear in n — the n² term is gone`;
    }
  }

  host.querySelector('#ro-soft').addEventListener('click', () => {
    mode = 'soft';
    host.querySelector('#ro-soft').classList.add('active');
    host.querySelector('#ro-lin').classList.remove('active');
    draw();
  });
  host.querySelector('#ro-lin').addEventListener('click', () => {
    mode = 'lin';
    host.querySelector('#ro-lin').classList.add('active');
    host.querySelector('#ro-soft').classList.remove('active');
    draw();
  });
  nS.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: comparator
 * Qualitative scores per family across 5 dimensions; sortable.
 * ===================================================================== */
(function comparator() {
  const host = document.getElementById('comparator');
  if (!host) return;

  // scores 1..5, higher = better
  const FAM = [
    { name: 'Full attention', color: '#ff9b6a', s: { train: 3, decmem: 1, parallel: 5, recall: 5, simple: 5 } },
    { name: 'Sparse', color: '#caa7ff', s: { train: 4, decmem: 3, parallel: 4, recall: 4, simple: 3 } },
    { name: 'Low-rank / linear', color: '#6adfb8', s: { train: 5, decmem: 5, parallel: 5, recall: 2, simple: 4 } },
    { name: 'SSM / linear-RNN', color: '#5fa9ff', s: { train: 4, decmem: 5, parallel: 4, recall: 3, simple: 3 } },
    { name: 'Hardware / distributed', color: '#ff9b4a', s: { train: 4, decmem: 2, parallel: 5, recall: 5, simple: 4 } },
    { name: 'Hybrid', color: '#e76a6a', s: { train: 4, decmem: 4, parallel: 4, recall: 4, simple: 2 } },
  ];
  const DIMS = [
    ['train', 'train speed'], ['decmem', 'decode memory'], ['parallel', 'parallelism'],
    ['recall', 'exact recall'], ['simple', 'simplicity'],
  ];

  const tabs = DIMS.map((d, i) =>
    `<button class="az-sort${i === 3 ? ' active' : ''}" data-k="${d[0]}">${d[1]}</button>`).join('');
  host.insertAdjacentHTML('beforeend', `
    <div class="az-sortrow">sort by: ${tabs}</div>
    <div class="az-bars" id="az-bars"></div>
  `);
  const box = host.querySelector('#az-bars');
  let sortKey = 'recall';

  function render() {
    const fams = [...FAM].sort((a, b) => b.s[sortKey] - a.s[sortKey]);
    box.innerHTML = '';
    fams.forEach(f => {
      const row = document.createElement('div');
      row.className = 'az-bar-row';
      const bars = DIMS.map(([k, lbl]) =>
        `<div class="az-bcol">
           <div class="az-btrack"><div class="az-bfill${k === sortKey ? ' hot' : ''}" style="height:${f.s[k] * 20}%;background:${f.color}"></div></div>
           <div class="az-blab">${lbl.split(' ')[0]}</div>
         </div>`).join('');
      row.innerHTML = `<div class="az-bname" style="border-color:${f.color}">${f.name}</div><div class="az-bgrid">${bars}</div>`;
      box.appendChild(row);
    });
  }
  host.querySelectorAll('.az-sort').forEach(t => {
    t.addEventListener('click', () => {
      host.querySelectorAll('.az-sort').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      sortKey = t.dataset.k;
      render();
    });
  });
  render();
})();

/* =====================================================================
 * Widget 4: adoption-bars
 * Hype (research interest) vs real production deployment, toggleable.
 * ===================================================================== */
(function adoptionBars() {
  const host = document.getElementById('adoption-bars');
  if (!host) return;

  const DATA = [
    { name: 'FlashAttention / GQA', color: '#ff9b4a', hype: 3, prod: 5 },
    { name: 'Full attention', color: '#ff9b6a', hype: 2, prod: 5 },
    { name: 'Native sparse (NSA/MoBA)', color: '#caa7ff', hype: 5, prod: 3 },
    { name: 'Hybrids (Jamba/MiniMax)', color: '#e76a6a', hype: 4, prod: 3 },
    { name: 'SSM / Mamba', color: '#5fa9ff', hype: 5, prod: 2 },
    { name: 'RWKV / linear-RNN', color: '#6adfb8', hype: 3, prod: 2 },
    { name: 'Linformer/Performer/Reformer', color: '#888888', hype: 4, prod: 1 },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="az-toggle">
      <button id="ab-prod" class="active">production deployment</button>
      <button id="ab-hype">research interest</button>
    </div>
    <canvas id="ab-canvas"></canvas>
    <div class="readout" id="ab-readout"></div>
  `);

  const W = 620, H = 250;
  const cv = host.querySelector('#ab-canvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#ab-readout');
  let mode = 'prod';

  function draw() {
    ctx.fillStyle = '#0e0f12'; ctx.fillRect(0, 0, W, H);
    const data = [...DATA].sort((a, b) => b[mode] - a[mode]);
    const left = 200, top = 14, rowH = (H - top - 10) / data.length;
    ctx.font = '12px sans-serif';
    data.forEach((d, i) => {
      const y = top + i * rowH;
      ctx.fillStyle = '#bbb'; ctx.textAlign = 'right';
      ctx.fillText(d.name, left - 10, y + rowH / 2 + 4);
      ctx.textAlign = 'left';
      const bw = (d[mode] / 5) * (W - left - 50);
      ctx.fillStyle = d.color;
      ctx.fillRect(left, y + 4, bw, rowH - 12);
      ctx.fillStyle = '#888';
      ctx.fillText('★'.repeat(d[mode]), left + bw + 6, y + rowH / 2 + 4);
    });
    ctx.textAlign = 'left';
    readout.innerHTML = mode === 'prod'
      ? 'In shipped models, <b>FlashAttention, GQA and full attention dominate</b>; native sparse and hybrids are the rising real users.'
      : 'By research buzz, <b>SSMs and native sparse lead</b> — but buzz ≠ deployment. Linformer-era methods are studied far more than they ship.';
  }

  host.querySelector('#ab-prod').addEventListener('click', () => {
    mode = 'prod';
    host.querySelector('#ab-prod').classList.add('active');
    host.querySelector('#ab-hype').classList.remove('active');
    draw();
  });
  host.querySelector('#ab-hype').addEventListener('click', () => {
    mode = 'hype';
    host.querySelector('#ab-hype').classList.add('active');
    host.querySelector('#ab-prod').classList.remove('active');
    draw();
  });
  draw();
})();
