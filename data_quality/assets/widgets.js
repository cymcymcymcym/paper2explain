/* data_quality blog interactive widgets. Plain JS / Canvas. No deps. */

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

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function lerp(a, b, t) { return a + (b - a) * t; }

function randn() {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* =====================================================================
 * Widget 1: Distribution sandbox
 * Two draggable point clouds (reference vs. candidate). Three live
 * statistics answer three different questions about the same data:
 * how far apart are the distributions (MMD²), how diverse is the
 * candidate set on its own (Vendi Score), and can a simple classifier
 * tell the two sets apart at all (1-NN two-sample test)?
 * ===================================================================== */
(function distributionSandbox() {
  const host = document.getElementById('distribution-sandbox');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="dsCanvas" width="420" height="380"></canvas>
      <div class="controls">
        <div>
          <label class="ctl-label">Shift between reference and candidate</label>
          <input type="range" id="dsShift" min="0" max="3.5" step="0.05" value="0"/>
        </div>
        <div>
          <label class="ctl-label">Spread of candidate set</label>
          <input type="range" id="dsSpread" min="0.25" max="2.5" step="0.05" value="1"/>
        </div>
        <div class="toggle-row">
          <button class="btn active" data-mode="unique">unique points</button>
          <button class="btn" data-mode="dup">duplicate-heavy candidate</button>
        </div>
        <button class="btn" id="dsReroll" style="margin-top:2px;">↻ resample</button>
        <div class="readout" id="dsReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#dsCanvas');
  const ctx = devicePx(cv, 420, 380);
  const shiftSlider = host.querySelector('#dsShift');
  const spreadSlider = host.querySelector('#dsSpread');
  const toggleRow = host.querySelector('.toggle-row');
  const reroll = host.querySelector('#dsReroll');
  const readout = host.querySelector('#dsReadout');
  const N = 22, SIGMA = 1.0;
  const W = 420, H = 380;
  let mode = 'unique';
  let refPts = [];

  function gk(p, q) {
    const dx = p[0] - q[0], dy = p[1] - q[1];
    return Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
  }

  function computeMMD2(A, B) {
    const n = A.length, m = B.length;
    let sumAA = 0, sumBB = 0, sumAB = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) sumAA += gk(A[i], A[j]);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i !== j) sumBB += gk(B[i], B[j]);
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) sumAB += gk(A[i], B[j]);
    return sumAA / (n * (n - 1)) + sumBB / (m * (m - 1)) - 2 * sumAB / (n * m);
  }

  function jacobiEigenvalues(A, sweeps) {
    const n = A.length;
    let M = A.map(row => row.slice());
    for (let s = 0; s < sweeps; s++) {
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = M[p][q];
          if (Math.abs(apq) < 1e-14) continue;
          const theta = (M[q][q] - M[p][p]) / (2 * apq);
          const sgn = theta >= 0 ? 1 : -1;
          const t = sgn / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const sn = t * c;
          const app = M[p][p], aqq = M[q][q];
          M[p][p] = app - t * apq;
          M[q][q] = aqq + t * apq;
          M[p][q] = 0; M[q][p] = 0;
          for (let i = 0; i < n; i++) {
            if (i === p || i === q) continue;
            const aip = M[i][p], aiq = M[i][q];
            M[i][p] = c * aip - sn * aiq; M[p][i] = M[i][p];
            M[i][q] = sn * aip + c * aiq; M[q][i] = M[i][q];
          }
        }
      }
    }
    const eigs = [];
    for (let i = 0; i < n; i++) eigs.push(M[i][i]);
    return eigs;
  }

  function vendiScore(pts) {
    const m = pts.length;
    const K = [];
    for (let i = 0; i < m; i++) K.push(new Array(m));
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) K[i][j] = gk(pts[i], pts[j]) / m;
    const eigs = jacobiEigenvalues(K, 22);
    let ent = 0;
    eigs.forEach(l => { if (l > 1e-10) ent -= l * Math.log(l); });
    return Math.exp(ent);
  }

  function nnDistinguishability(A, B) {
    const pts = A.map(p => ({ p, label: 'A' })).concat(B.map(p => ({ p, label: 'B' })));
    let match = 0;
    pts.forEach((pi, i) => {
      let best = -1, bestD = Infinity;
      pts.forEach((pj, j) => {
        if (i === j) return;
        const dx = pi.p[0] - pj.p[0], dy = pi.p[1] - pj.p[1];
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = j; }
      });
      if (pts[best].label === pi.label) match++;
    });
    return match / pts.length;
  }

  function rerollRef() {
    refPts = Array.from({ length: N }, () => [randn(), randn()]);
  }
  rerollRef();

  function candidatePts() {
    const shift = parseFloat(shiftSlider.value);
    const spread = parseFloat(spreadSlider.value);
    if (mode === 'unique') {
      return Array.from({ length: N }, () => [shift + randn() * spread, randn() * spread]);
    }
    const bases = Array.from({ length: 5 }, () => [shift + randn() * spread, randn() * spread]);
    return Array.from({ length: N }, (_, i) => {
      const b = bases[i % bases.length];
      return [b[0] + randn() * 0.04, b[1] + randn() * 0.04];
    });
  }

  function toPx(p) {
    const cx = W * 0.42, cy = H * 0.5, scale = 42;
    return [cx + p[0] * scale, cy - p[1] * scale];
  }

  function draw() {
    const A = refPts;
    const B = candidatePts();
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = cssVar('--rule');
    ctx.lineWidth = 1;
    const [ox, oy] = toPx([0, 0]);
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W * 0.86, oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();

    A.forEach(p => {
      const [x, y] = toPx(p);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#5fa9ff'; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    });
    B.forEach(p => {
      const [x, y] = toPx(p);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff9b4a'; ctx.globalAlpha = mode === 'dup' ? 0.55 : 0.85; ctx.fill(); ctx.globalAlpha = 1;
    });

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#5fa9ff'; ctx.textAlign = 'left';
    ctx.fillText('● reference set', 12, 18);
    ctx.fillStyle = '#ff9b4a';
    ctx.fillText('● candidate set', 12, 34);

    const mmd = Math.max(0, computeMMD2(A, B));
    const vs = vendiScore(B);
    const nn = nnDistinguishability(A, B);

    readout.innerHTML = `
      <div>Distribution shift &mdash; MMD&sup2;: <b>${mmd.toFixed(3)}</b> <span class="tag">0 = identical distributions</span></div>
      <div>Diversity of candidate &mdash; Vendi Score: <b>${vs.toFixed(1)} / ${N}</b> <span class="tag">low = redundant, high = diverse</span></div>
      <div>Distinguishability &mdash; 1-NN test accuracy: <b>${(nn * 100).toFixed(0)}%</b> <span class="tag">50% = can't tell apart, 100% = perfectly separable</span></div>
    `;
  }

  shiftSlider.addEventListener('input', draw);
  spreadSlider.addEventListener('input', draw);
  reroll.addEventListener('click', () => { rerollRef(); draw(); });
  toggleRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    mode = btn.dataset.mode;
    toggleRow.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });
  draw();
})();

/* =====================================================================
 * Widget 2: MinHash near-duplicate detector
 * Pick a real-world-flavored document pair, see the true Jaccard
 * similarity of their word-shingle sets, and watch a MinHash estimate
 * converge to it as the number of hash functions grows.
 * ===================================================================== */
(function minhashWidget() {
  const host = document.getElementById('minhash-dedup');
  if (!host) return;

  const PAIRS = {
    template: {
      label: 'Template product pages',
      a: "Buy the Aurora Desk Lamp today. Free shipping on orders over $50. In stock, ships within 2 business days. Rated 4.8 out of 5 by 1,204 customers. Add to cart now and save 15% with code SPRING15.",
      b: "Buy the Halo Table Lamp today. Free shipping on orders over $50. In stock, ships within 2 business days. Rated 4.6 out of 5 by 812 customers. Add to cart now and save 15% with code SPRING15.",
      note: "Same storefront template, different product — this is the single largest source of near-duplicates in a raw web crawl.",
    },
    mirror: {
      label: 'Syndicated news article',
      a: "Home | News | Tech >> Scientists announced Tuesday that a new battery chemistry could double electric-vehicle range without added weight, according to a peer-reviewed study published this week. Researchers said the material remains stable after 2,000 charge cycles. (c) 2026 DailyWire News Network",
      b: "TechDaily.io — Trending Now >> Scientists announced Tuesday that a new battery chemistry could double electric-vehicle range without added weight, according to a peer-reviewed study published this week. Researchers said the material remains stable after 2,000 charge cycles. Follow us on social media for more updates.",
      note: "The same wire-service copy, re-hosted with different navigation chrome and a different footer.",
    },
    distinct: {
      label: 'Genuinely different pages',
      a: "The city council voted 6-2 Thursday to approve the downtown rezoning plan, which supporters say will add 400 units of affordable housing over the next five years.",
      b: "Marinating the chicken for at least four hours makes a noticeable difference — the acid in the buttermilk tenderizes the meat while the spices have time to penetrate past the surface.",
      note: "Unrelated topics. A good near-dup detector should leave this pair alone.",
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="mhPicker"></div>
    <div class="body">
      <canvas id="mhCanvas" width="440" height="260"></canvas>
      <div class="controls">
        <div>
          <label class="ctl-label">Number of hash functions (H)</label>
          <input type="range" id="mhSlider" min="1" max="200" step="1" value="5"/>
        </div>
        <div class="readout" id="mhReadout"></div>
      </div>
    </div>
    <p class="widget-note" id="mhNote"></p>
  `);

  const picker = host.querySelector('#mhPicker');
  const cv = host.querySelector('#mhCanvas');
  const ctx = devicePx(cv, 440, 260);
  const slider = host.querySelector('#mhSlider');
  const readout = host.querySelector('#mhReadout');
  const note = host.querySelector('#mhNote');
  const W = 440, H = 260;
  const MAXH = 200;

  Object.keys(PAIRS).forEach((key, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' active' : '');
    b.textContent = PAIRS[key].label;
    b.dataset.key = key;
    picker.appendChild(b);
  });

  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shingles(text, k) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
    const set = new Set();
    for (let i = 0; i + k <= words.length; i++) set.add(words.slice(i, i + k).join(' '));
    return set;
  }
  function jaccard(setA, setB) {
    let inter = 0;
    setA.forEach(x => { if (setB.has(x)) inter++; });
    const union = setA.size + setB.size - inter;
    return union === 0 ? 1 : inter / union;
  }

  const HASH_COEFFS = Array.from({ length: MAXH }, () => [
    (Math.floor(Math.random() * 2000000000) * 2) + 1,
    Math.floor(Math.random() * 4294967295),
  ]);
  function minhashCurve(setA, setB) {
    const listA = Array.from(setA).map(strHash);
    const listB = Array.from(setB).map(strHash);
    const out = [];
    let matches = 0;
    for (let h = 0; h < MAXH; h++) {
      const [a, b] = HASH_COEFFS[h];
      let minA = Infinity, minB = Infinity;
      for (const x of listA) { const v = (Math.imul(a, x) + b) >>> 0; if (v < minA) minA = v; }
      for (const x of listB) { const v = (Math.imul(a, x) + b) >>> 0; if (v < minB) minB = v; }
      if (minA === minB) matches++;
      out.push(matches / (h + 1));
    }
    return out;
  }

  let current = Object.keys(PAIRS)[0];
  let curve = [], trueJ = 0;
  const THRESHOLD = 0.75;

  function recompute(key) {
    current = key;
    const p = PAIRS[key];
    const sA = shingles(p.a, 3), sB = shingles(p.b, 3);
    trueJ = jaccard(sA, sB);
    curve = minhashCurve(sA, sB);
    note.textContent = p.note;
  }

  function draw() {
    const H_now = parseInt(slider.value, 10);
    const padL = 42, padR = 14, padT = 16, padB = 26;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule'), accent = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);

    const xPix = (h) => padL + (Math.log(h) / Math.log(MAXH)) * (W - padL - padR);
    const yPix = (v) => padT + (1 - v) * (H - padT - padB);

    ctx.strokeStyle = rule; ctx.fillStyle = fg; ctx.font = '11px sans-serif'; ctx.lineWidth = 1;
    [0, 0.25, 0.5, 0.75, 1].forEach(v => {
      const y = yPix(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(v.toFixed(2), padL - 6, y + 3);
    });

    // threshold line
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(padL, yPix(THRESHOLD)); ctx.lineTo(W - padR, yPix(THRESHOLD)); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = accent; ctx.textAlign = 'left'; ctx.globalAlpha = 0.8;
    ctx.fillText('flag as duplicate above here', padL + 4, yPix(THRESHOLD) - 5);
    ctx.globalAlpha = 1;

    // true Jaccard dashed line
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = fg;
    ctx.beginPath(); ctx.moveTo(padL, yPix(trueJ)); ctx.lineTo(W - padR, yPix(trueJ)); ctx.stroke();
    ctx.restore();

    // estimate curve
    ctx.beginPath();
    ctx.strokeStyle = '#5fa9ff'; ctx.lineWidth = 2;
    for (let h = 1; h <= MAXH; h++) {
      const x = xPix(h), y = yPix(curve[h - 1]);
      if (h === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // current H marker
    const curEst = curve[H_now - 1];
    const mx = xPix(H_now), my = yPix(curEst);
    ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#5fa9ff'; ctx.fill();
    ctx.strokeStyle = cssVar('--fg'); ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(mx, padT); ctx.lineTo(mx, H - padB); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center'; ctx.fillStyle = fg;
    ctx.fillText('H (hash functions, log scale)', (padL + W - padR) / 2, H - 6);

    const flagged = curEst >= THRESHOLD;
    readout.innerHTML = `
      <div>true Jaccard similarity: <b>${trueJ.toFixed(3)}</b></div>
      <div>MinHash estimate at H=${H_now}: <b>${curEst.toFixed(3)}</b></div>
      <div>verdict: <b style="color:${flagged ? accent : fg}">${flagged ? 'flagged as near-duplicate' : 'kept, not a duplicate'}</b></div>
    `;
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    picker.querySelectorAll('.btn').forEach(b => b.classList.toggle('active', b === btn));
    recompute(btn.dataset.key);
    draw();
  });
  slider.addEventListener('input', draw);

  recompute(current);
  draw();
})();

/* =====================================================================
 * Widget 3: Perplexity quality-filter histogram
 * A synthetic (but realistically shaped) distribution of per-document
 * perplexities under a small reference LM. Drag the head/tail cutoffs
 * (CCNet-style bucketing) and watch what survives.
 * ===================================================================== */
(function perplexityWidget() {
  const host = document.getElementById('perplexity-filter');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="ppCanvas" width="640" height="280"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">Head cutoff (reject below — repetitive/boilerplate)</label>
        <input type="range" id="ppLo" min="0" max="90" step="1" value="22"/>
      </div>
      <div>
        <label class="ctl-label">Tail cutoff (reject above — garbled/non-language)</label>
        <input type="range" id="ppHi" min="120" max="550" step="5" value="260"/>
      </div>
      <div class="readout" id="ppReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#ppCanvas');
  const ctx = devicePx(cv, 640, 280);
  const loSlider = host.querySelector('#ppLo');
  const hiSlider = host.querySelector('#ppHi');
  const readout = host.querySelector('#ppReadout');
  const W = 640, H = 280;
  const MAXPPL = 600;

  const SAMPLES = [];
  const N_TOTAL = 3000;
  for (let i = 0; i < N_TOTAL; i++) {
    const r = Math.random();
    let v;
    if (r < 0.13) v = Math.exp(randn() * 0.32 + Math.log(14));       // repetitive / boilerplate
    else if (r < 0.83) v = Math.exp(randn() * 0.38 + Math.log(85));  // clean prose
    else v = Math.exp(randn() * 0.55 + Math.log(340));                // garbled / non-language
    SAMPLES.push(Math.min(MAXPPL - 1, v));
  }

  const NBINS = 60;
  const bins = new Array(NBINS).fill(0);
  SAMPLES.forEach(v => { bins[Math.min(NBINS - 1, Math.floor((v / MAXPPL) * NBINS))]++; });
  const maxBin = Math.max(...bins);

  const EXAMPLES = {
    low: "click here click here click here — buy now — limited time offer — buy now — click here — act now act now",
    mid: "The committee reviewed the proposal and voted to postpone the decision until next quarter, citing the need for additional budget analysis.",
    high: "âχλμ #!@ %%3f0x1A qwky_zzrpl — xn--p1ai â",
  };

  function draw() {
    const lo = parseFloat(loSlider.value);
    const hi = parseFloat(hiSlider.value);
    const padL = 14, padR = 14, padT = 14, padB = 34;
    const fg = cssVar('--fg-mute'), rule = cssVar('--rule'), accent = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);

    const xPix = (v) => padL + (v / MAXPPL) * (W - padL - padR);
    const barW = (W - padL - padR) / NBINS;

    let kept = 0;
    bins.forEach((count, i) => {
      const v0 = (i / NBINS) * MAXPPL, v1 = ((i + 1) / NBINS) * MAXPPL;
      const isKept = v0 >= lo && v1 <= hi;
      if (isKept) kept += count;
      const bh = (count / maxBin) * (H - padT - padB);
      ctx.fillStyle = isKept ? accent : rule;
      ctx.globalAlpha = isKept ? 0.85 : 0.55;
      ctx.fillRect(xPix(v0), H - padB - bh, barW - 1, bh);
      ctx.globalAlpha = 1;
    });

    [lo, hi].forEach(cut => {
      ctx.strokeStyle = cssVar('--fg'); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xPix(cut), padT); ctx.lineTo(xPix(cut), H - padB); ctx.stroke();
    });

    ctx.fillStyle = fg; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('per-document perplexity under reference LM →', (padL + W - padR) / 2, H - 8);

    const keptPct = (kept / N_TOTAL) * 100;
    readout.innerHTML = `
      <div>kept: <b>${keptPct.toFixed(0)}%</b> of documents (head=${lo.toFixed(0)}, tail=${hi.toFixed(0)})</div>
      <div class="example"><span class="tag">head example (rejected)</span><br><code>${EXAMPLES.low}</code></div>
      <div class="example"><span class="tag">kept example</span><br><code>${EXAMPLES.mid}</code></div>
      <div class="example"><span class="tag">tail example (rejected)</span><br><code>${EXAMPLES.high}</code></div>
    `;
  }

  loSlider.addEventListener('input', () => { if (parseFloat(loSlider.value) > parseFloat(hiSlider.value) - 20) loSlider.value = parseFloat(hiSlider.value) - 20; draw(); });
  hiSlider.addEventListener('input', () => { if (parseFloat(hiSlider.value) < parseFloat(loSlider.value) + 20) hiSlider.value = parseFloat(loSlider.value) + 20; draw(); });
  draw();
})();

/* =====================================================================
 * Widget 4: Importance resampling (DSIR-style)
 * A broad "raw pool" and a tight "target domain" cluster, both in a
 * simplified 2D feature space. Drag the resampling temperature from
 * uniform toward fully importance-weighted and watch which raw points
 * get selected.
 * ===================================================================== */
(function importanceResamplingWidget() {
  const host = document.getElementById('dsir-resampling');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <canvas id="irCanvas" width="440" height="360"></canvas>
    <div class="controls">
      <div>
        <label class="ctl-label">Resampling temperature (0 = uniform, 1 = fully importance-weighted)</label>
        <input type="range" id="irTemp" min="0" max="1" step="0.02" value="0"/>
      </div>
      <div class="readout" id="irReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#irCanvas');
  const ctx = devicePx(cv, 440, 360);
  const tempSlider = host.querySelector('#irTemp');
  const readout = host.querySelector('#irReadout');
  const W = 440, H = 360;
  const BUDGET = 40;

  const TARGET = Array.from({ length: 16 }, () => [2.1 + randn() * 0.4, 1.5 + randn() * 0.4]);
  const BLOBS = [
    { c: [2.0, 1.3], s: 0.6, n: 26 },   // near target: genuinely good pages
    { c: [-2.4, 1.8], s: 0.7, n: 30 },  // spam blob
    { c: [-0.5, -2.3], s: 0.9, n: 34 }, // forum chat blob
    { c: [1.6, -1.9], s: 0.8, n: 30 },  // product listings
    { c: [-2.0, -0.6], s: 1.1, n: 30 }, // misc scatter
  ];
  const RAW = [];
  BLOBS.forEach(b => {
    for (let i = 0; i < b.n; i++) RAW.push([b.c[0] + randn() * b.s, b.c[1] + randn() * b.s]);
  });
  // Fixed random tie-breaker so T=0 selects a genuine uniform-random subset
  // (not just "the first 40 points in array order", which a plain stable
  // sort on all-equal scores would otherwise produce).
  const TIE_BREAK = RAW.map(() => Math.random());

  const SIGMA = 0.9;
  function kde(pt, pool) {
    let s = 0;
    pool.forEach(p => {
      const dx = pt[0] - p[0], dy = pt[1] - p[1];
      s += Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA));
    });
    return s / pool.length;
  }

  const weights = RAW.map(p => {
    const num = kde(p, TARGET);
    const den = kde(p, RAW) + 1e-6;
    return num / den;
  });
  const maxW = Math.max(...weights);
  const normW = weights.map(w => w / maxW);

  function toPx(p) {
    const cx = W * 0.5, cy = H * 0.5, scale = 62;
    return [cx + p[0] * scale, cy - p[1] * scale];
  }

  function draw() {
    const T = parseFloat(tempSlider.value);
    ctx.clearRect(0, 0, W, H);

    const score = RAW.map((p, i) => (1 - T) * TIE_BREAK[i] + T * normW[i] * 10);
    const ranked = score.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const selected = new Set(ranked.slice(0, BUDGET).map(x => x[1]));

    RAW.forEach((p, i) => {
      const [x, y] = toPx(p);
      const isSel = selected.has(i);
      ctx.beginPath(); ctx.arc(x, y, isSel ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? cssVar('--accent') : cssVar('--fg-mute');
      ctx.globalAlpha = isSel ? 0.95 : 0.35;
      ctx.fill();
      if (isSel) { ctx.lineWidth = 1.4; ctx.strokeStyle = cssVar('--accent'); ctx.globalAlpha = 1; ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
    TARGET.forEach(p => {
      const [x, y] = toPx(p);
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#8a5cff'; ctx.fill();
    });

    ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#8a5cff'; ctx.fillText('● target domain (e.g. Wikipedia-like text)', 10, 18);
    ctx.fillStyle = cssVar('--accent'); ctx.fillText('● selected for training set', 10, 34);
    ctx.fillStyle = cssVar('--fg-mute'); ctx.fillText('○ raw pool, not selected', 10, 50);

    let nearTarget = 0;
    selected.forEach(i => { if (kde(RAW[i], TARGET) > 0.05) nearTarget++; });

    readout.innerHTML = `
      <div>temperature: <b>${T.toFixed(2)}</b></div>
      <div>selected budget: <b>${BUDGET}</b> of ${RAW.length} raw documents</div>
      <div>selected docs near target domain: <b>${nearTarget} / ${BUDGET}</b> ${T < 0.05 ? '<span class="tag">uniform sampling — no domain match</span>' : ''}</div>
    `;
  }

  tempSlider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 5: The filtering pipeline funnel
 * Toggle real filtering stages on and off and watch what fraction of a
 * raw Common Crawl dump survives to the final training corpus, based
 * on approximate published stage-by-stage retention figures.
 * ===================================================================== */
(function pipelineFunnelWidget() {
  const host = document.getElementById('pipeline-funnel');
  if (!host) return;

  // Real stage-by-stage retention from RefinedWeb (Penedo et al. 2023,
  // arXiv:2306.01116): language ID leaves 48% of raw CC; document+line-wise
  // quality filtering leaves 23% of the ORIGINAL; combined MinHash + exact-
  // substring dedup removes 45% more of what remains. `keep` below is
  // relative to the previous stage: 0.48 -> ×0.479=0.23 -> ×0.55=0.1265.
  const STAGES = [
    { key: 'lang', label: 'Language ID', keep: 0.48, desc: 'fastText language classifier — keeps 48% of raw Common Crawl.' },
    { key: 'heur', label: 'Quality filtering', keep: 0.479, desc: 'Gopher + C4-style document- and line-wise heuristic rules — down to 23% of the original.' },
    { key: 'dedup', label: 'Deduplication', keep: 0.55, desc: 'MinHash (9,000 hashes) + exact-substring dedup — removes 45% of what remained.' },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="toggle-row" id="pfToggles"></div>
    <canvas id="pfCanvas" width="640" height="300"></canvas>
    <div class="readout" id="pfReadout"></div>
  `);

  const toggles = host.querySelector('#pfToggles');
  const cv = host.querySelector('#pfCanvas');
  const ctx = devicePx(cv, 640, 300);
  const readout = host.querySelector('#pfReadout');
  const W = 640, H = 300;
  const active = {};
  STAGES.forEach(s => { active[s.key] = true; });

  STAGES.forEach(s => {
    const b = document.createElement('button');
    b.className = 'btn active';
    b.textContent = s.label;
    b.dataset.key = s.key;
    toggles.appendChild(b);
  });

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const padL = 20, padR = 20, padT = 40, padB = 20;
    const stageW = (W - padL - padR) / (STAGES.length + 1);
    let frac = 1.0;
    const levels = [1.0];
    STAGES.forEach(s => { if (active[s.key]) frac *= s.keep; levels.push(frac); });

    const barMaxH = H - padT - padB;
    for (let i = 0; i < levels.length; i++) {
      const x0 = padL + i * stageW;
      const bh = levels[i] * barMaxH;
      const y0 = H - padB - bh;
      ctx.fillStyle = i === levels.length - 1 ? cssVar('--accent') : cssVar('--fg-mute');
      ctx.globalAlpha = i === levels.length - 1 ? 0.9 : 0.55;
      ctx.fillRect(x0 + 6, y0, stageW - 12, bh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar('--fg'); ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((levels[i] * 100).toFixed(0) + '%', x0 + stageW / 2, y0 - 8);

      ctx.fillStyle = cssVar('--fg-mute'); ctx.font = '10.5px sans-serif';
      const label = i === 0 ? 'raw crawl' : STAGES[i - 1].label;
      const words = label.split(' ');
      words.forEach((w, wi) => ctx.fillText(w, x0 + stageW / 2, H - padB + 14 + wi * 11));
    }

    readout.innerHTML = `
      <div>final yield: <b>${(levels[levels.length - 1] * 100).toFixed(1)}%</b> of the raw crawl survives to the training corpus</div>
      ${STAGES.map(s => `<div>${active[s.key] ? '✓' : '✗'} ${s.label} — ${s.desc}</div>`).join('')}
    `;
  }

  toggles.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    active[btn.dataset.key] = !active[btn.dataset.key];
    btn.classList.toggle('active', active[btn.dataset.key]);
    draw();
  });

  draw();
})();
