/* Gated DeltaNet & cousins — interactive widgets. Plain JS / Canvas. No deps.
 *   1. taxonomy-lab   — pick a linear-attention variant; see its transition matrix + a retention test
 *   2. recall-race    — associative recall: additive linear attention vs the delta rule (overwrite a key)
 *   3. gate-explorer  — Gated DeltaNet memory: forget gate alpha + write strength beta over a noisy stream
 *   4. sink-gate      — softmax attention with/without the sigmoid output gate (attention sinks)
 *   5. model-stack    — real hybrid stacks (Qwen3-Next, Qwen3.5, Kimi Linear, MiniMax) + KV-cache vs context
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
    if (dark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('vb-theme', 'light'); }
    else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('vb-theme', 'dark'); }
    setLabel();
    document.dispatchEvent(new CustomEvent('themechange'));
  });
})();

/* ---------- helpers ---------- */
function devicePx(canvas, cssW, cssH) {
  canvas.width = cssW * 2; canvas.height = cssH * 2;
  const ctx = canvas.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); return ctx;
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randnFrom(rng) {
  const u = 1 - rng(), v = 1 - rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function randUnit(d, rng) {
  const x = new Array(d); let n = 0;
  for (let i = 0; i < d; i++) { x[i] = randnFrom(rng); n += x[i] * x[i]; }
  n = Math.sqrt(n) || 1; for (let i = 0; i < d; i++) x[i] /= n; return x;
}
// S is d×d row-major (d_v × d_k). Returns S·x (length d).
function matVec(S, x, d) {
  const o = new Array(d).fill(0);
  for (let i = 0; i < d; i++) { let s = 0; const r = i * d; for (let j = 0; j < d; j++) s += S[r + j] * x[j]; o[i] = s; }
  return o;
}
function cos(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
// re-render all widgets on theme change (each registers a redraw)
const _redraws = [];
document.addEventListener('themechange', () => _redraws.forEach(f => { try { f(); } catch (e) {} }));

/* =====================================================================
 * Widget 1: taxonomy-lab — pick a variant, see its transition + retention
 * ===================================================================== */
(function taxonomyLab() {
  const host = document.getElementById('taxonomy-lab');
  if (!host) return;

  const D = 8;
  const VARIANTS = [
    { key: 'la',  name: 'Linear Attn', form: 'S += v kᵀ', forgets: 'no', corrects: 'no' },
    { key: 'ret', name: 'RetNet',      form: 'S = γ·S + v kᵀ', forgets: 'fixed', corrects: 'no' },
    { key: 'm2',  name: 'Mamba2',      form: 'S = αₜ·S + v kᵀ', forgets: 'scalar', corrects: 'no' },
    { key: 'gla', name: 'GLA',         form: 'S = S·diag(αₜ) + v kᵀ', forgets: 'vector', corrects: 'no' },
    { key: 'dn',  name: 'DeltaNet',    form: 'S = S(I − β kkᵀ) + β v kᵀ', forgets: 'no', corrects: 'YES' },
    { key: 'gdn', name: 'Gated DeltaNet', form: 'S = S·αₜ(I − β kkᵀ) + β v kᵀ', forgets: 'scalar', corrects: 'YES' },
  ];
  let sel = 'gdn';

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="taxPicker"></div>
    <div class="body">
      <div class="tax-left">
        <canvas id="taxMat"></canvas>
        <p class="cap" id="taxForm"></p>
      </div>
      <div class="tax-right">
        <canvas id="taxPlot"></canvas>
        <div class="readout" id="taxRead"></div>
      </div>
    </div>`);

  const picker = host.querySelector('#taxPicker');
  VARIANTS.forEach(v => {
    const b = document.createElement('button');
    b.className = 'btn' + (v.key === sel ? ' active' : '');
    b.textContent = v.name; b.dataset.k = v.key;
    b.onclick = () => { sel = v.key; [...picker.children].forEach(c => c.classList.toggle('active', c.dataset.k === sel)); draw(); };
    picker.appendChild(b);
  });

  const matC = host.querySelector('#taxMat'), plotC = host.querySelector('#taxPlot');
  const mctx = devicePx(matC, 250, 250), pctx = devicePx(plotC, 300, 250);
  const formEl = host.querySelector('#taxForm'), readEl = host.querySelector('#taxRead');

  // fixed random data so the picture is stable
  const rng = mulberry32(42);
  const kFix = randUnit(D, rng);                // the "delta" key for the transition picture
  const glaVec = Array.from({ length: D }, () => 0.80 + 0.19 * rng());
  // retention test data: one target fact, then a stream of noise writes
  const rng2 = mulberry32(99);
  const kA = randUnit(D, rng2), vA = randUnit(D, rng2);
  const T = 60;
  const stream = [];
  for (let t = 0; t < T; t++) stream.push({ k: randUnit(D, rng2), v: randUnit(D, rng2) });

  function transition(key) {
    // returns d×d matrix (row-major) mapping S_{t-1}->S_t (pre-write)
    const M = new Array(D * D).fill(0);
    const set = (i, j, x) => { M[i * D + j] = x; };
    if (key === 'la') { for (let i = 0; i < D; i++) set(i, i, 1); }
    else if (key === 'ret') { for (let i = 0; i < D; i++) set(i, i, 0.95); }
    else if (key === 'm2') { for (let i = 0; i < D; i++) set(i, i, 0.90); }
    else if (key === 'gla') { for (let i = 0; i < D; i++) set(i, i, glaVec[i]); }
    else if (key === 'dn' || key === 'gdn') {
      const a = key === 'gdn' ? 0.92 : 1.0, b = 0.9;
      for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
        const id = i === j ? 1 : 0;
        set(i, j, a * (id - b * kFix[i] * kFix[j]));
      }
    }
    return M;
  }

  function step(key, S, k, v) {
    const b = 0.9;
    if (key === 'la') { for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) S[i * D + j] += v[i] * k[j]; }
    else if (key === 'ret' || key === 'm2') {
      const g = key === 'ret' ? 0.95 : 0.90;
      for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) S[i * D + j] = g * S[i * D + j] + v[i] * k[j];
    } else if (key === 'gla') {
      for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) S[i * D + j] = glaVec[j] * S[i * D + j] + v[i] * k[j];
    } else if (key === 'dn' || key === 'gdn') {
      const a = key === 'gdn' ? 0.92 : 1.0;
      const Sk = matVec(S, k, D);
      for (let i = 0; i < D; i++) for (let j = 0; j < D; j++)
        S[i * D + j] = a * (S[i * D + j] - b * Sk[i] * k[j]) + b * v[i] * k[j];
    }
  }

  function retentionCurve(key) {
    const S = new Array(D * D).fill(0);
    step(key, S, kA, vA);                 // store the target at t=0
    const rec = [Math.max(0, cos(matVec(S, kA, D), vA))];
    for (let t = 0; t < T; t++) { step(key, S, stream[t].k, stream[t].v); rec.push(Math.max(0, cos(matVec(S, kA, D), vA))); }
    return rec;
  }

  function diverging(x) { // x in [-1,1]
    const acc = cssVar('--accent'), blu = '#5fa9ff';
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    if (x >= 0) { const a = hex('#ffffff'), b = hex(acc.length === 7 ? acc : '#c64f24'); const t = clamp(x, 0, 1); return `rgb(${a.map((c, i) => Math.round(lerp(c, b[i], t)))})`; }
    const a = hex('#ffffff'), b = hex(blu); const t = clamp(-x, 0, 1); return `rgb(${a.map((c, i) => Math.round(lerp(c, b[i], t)))})`;
  }

  function draw() {
    const v = VARIANTS.find(x => x.key === sel);
    // --- transition heatmap ---
    const M = transition(sel);
    const W = 250, H = 250, pad = 28, cell = (Math.min(W, H) - pad * 2) / D;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule');
    mctx.clearRect(0, 0, W, H);
    mctx.fillStyle = mute; mctx.font = '11px ui-monospace, monospace';
    mctx.fillText('transition  Sₜ₋₁ → Sₜ', pad, 16);
    let mx = 0; for (const z of M) mx = Math.max(mx, Math.abs(z)); mx = mx || 1;
    for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
      mctx.fillStyle = diverging(M[i * D + j] / mx);
      mctx.fillRect(pad + j * cell, pad + i * cell, cell - 1, cell - 1);
    }
    mctx.strokeStyle = rule; mctx.strokeRect(pad, pad, cell * D, cell * D);
    formEl.innerHTML = `<b>${v.name}</b> &nbsp; <code>${v.form}</code>`;

    // --- retention plot ---
    const PW = 300, PH = 250, lp = 38, rp = 10, tp = 22, bp = 30;
    pctx.clearRect(0, 0, PW, PH);
    pctx.strokeStyle = rule; pctx.lineWidth = 1;
    pctx.strokeRect(lp, tp, PW - lp - rp, PH - tp - bp);
    pctx.fillStyle = mute; pctx.font = '11px ui-monospace, monospace';
    pctx.fillText('recall of one fact', lp, 14);
    pctx.fillText('1.0', 14, tp + 6); pctx.fillText('0', 22, PH - bp);
    pctx.fillText('writes →', PW - 70, PH - 8);
    const px = (t) => lp + t / T * (PW - lp - rp);
    const py = (r) => tp + (1 - r) * (PH - tp - bp);
    // faint reference: all six
    VARIANTS.forEach(vr => {
      const rec = retentionCurve(vr.key);
      pctx.strokeStyle = vr.key === sel ? cssVar('--accent') : rule;
      pctx.lineWidth = vr.key === sel ? 2.6 : 1;
      pctx.globalAlpha = vr.key === sel ? 1 : 0.55;
      pctx.beginPath();
      rec.forEach((r, t) => { const X = px(t), Y = py(r); t ? pctx.lineTo(X, Y) : pctx.moveTo(X, Y); });
      pctx.stroke();
    });
    pctx.globalAlpha = 1;
    const rec = retentionCurve(sel);
    const fin = rec[rec.length - 1];
    const badge = (label, val, good) => `<span class="bdg ${good}">${label}: <b>${val}</b></span>`;
    const fg2 = v.forgets === 'no' ? 'bad' : 'ok', cr = v.corrects === 'YES' ? 'ok' : 'bad';
    readEl.innerHTML =
      badge('forgets', v.forgets, fg2) + badge('overwrites', v.corrects, cr) +
      `<div class="mt">recall after ${T} noisy writes: <b>${(fin * 100).toFixed(0)}%</b></div>` +
      `<div class="hint2">${sel === 'dn' ? 'delta-rule edits are orthogonal to old facts → the target survives interference.' :
        sel === 'gdn' ? 'corrects precisely AND can forget noise — the best of both.' :
        sel === 'la' ? 'blind additive writes pile onto the target and smear it.' :
        (sel === 'ret' || sel === 'm2') ? 'global decay forgets the noise — but also the target.' :
        'a per-channel gate decays each feature at its own rate.'}</div>`;
  }
  _redraws.push(draw);
  draw();
})();

/* =====================================================================
 * Widget 2: recall-race — additive linear attention vs the delta rule
 * orthonormal keys A..D, RGB values; overwrite a key and query it.
 * ===================================================================== */
(function recallRace() {
  const host = document.getElementById('recall-race');
  if (!host) return;
  const KEYS = ['A', 'B', 'C', 'D'];
  const PAL = { red: [220, 70, 60], green: [70, 180, 95], blue: [70, 140, 230], yellow: [235, 190, 60], purple: [165, 95, 210] };
  const PNAMES = Object.keys(PAL);

  // default program: A=red, B=green, C=blue, then overwrite A=yellow
  let writes = [
    { k: 'A', c: 'red' }, { k: 'B', c: 'green' }, { k: 'C', c: 'blue' }, { k: 'A', c: 'yellow' },
  ];
  let query = 'A';

  host.insertAdjacentHTML('beforeend', `
    <div class="rr-time" id="rrTime"></div>
    <div class="rr-controls">
      <div class="rr-q">query key:
        <span id="rrKeys"></span>
      </div>
      <button class="btn" id="rrAdd">+ overwrite a key</button>
      <button class="btn" id="rrReset">reset</button>
    </div>
    <div class="rr-out">
      <div class="rr-card"><p class="rr-h">Linear attention <span>S += v kᵀ</span></p><div class="rr-sw" id="rrLA"></div><p class="rr-v" id="rrLAv"></p></div>
      <div class="rr-card"><p class="rr-h">Delta rule <span>S += β(v−Sk) kᵀ</span></p><div class="rr-sw" id="rrDN"></div><p class="rr-v" id="rrDNv"></p></div>
    </div>`);

  const timeEl = host.querySelector('#rrTime'), keysEl = host.querySelector('#rrKeys');
  const laSw = host.querySelector('#rrLA'), dnSw = host.querySelector('#rrDN');
  const laV = host.querySelector('#rrLAv'), dnV = host.querySelector('#rrDNv');

  function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
  function compute() {
    // additive: sum of all values written to query key. delta: last value written to query key.
    const writesToQ = writes.filter(w => w.k === query);
    const sum = [0, 0, 0];
    writesToQ.forEach(w => { const c = PAL[w.c]; sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; });
    const la = sum.map(x => clamp(Math.round(x), 0, 255));
    const dn = writesToQ.length ? PAL[writesToQ[writesToQ.length - 1].c] : [120, 120, 120];
    return { la, dn, n: writesToQ.length };
  }
  function render() {
    timeEl.innerHTML = writes.map((w, i) =>
      `<span class="chip"><b>${w.k}</b> ← <span class="dot" style="background:${rgb(PAL[w.c])}"></span>${w.c}</span>` +
      (i < writes.length - 1 ? '<span class="arr">›</span>' : '')).join('');
    keysEl.innerHTML = KEYS.map(k => `<button class="btn sm ${k === query ? 'active' : ''}" data-k="${k}">${k}</button>`).join('');
    keysEl.querySelectorAll('button').forEach(b => b.onclick = () => { query = b.dataset.k; render(); });

    const { la, dn, n } = compute();
    laSw.style.background = rgb(la); dnSw.style.background = rgb(dn);
    const multi = n > 1;
    laV.innerHTML = multi
      ? `key <b>${query}</b> was written <b>${n}×</b> → returns the <b>sum</b> (a smear). <span class="wrong">wrong</span>`
      : `key <b>${query}</b> written once → fine.`;
    dnV.innerHTML = multi
      ? `returns the <b>latest</b> value only — old binding erased. <span class="right">correct</span>`
      : `key <b>${query}</b> written once → fine.`;
  }
  host.querySelector('#rrAdd').onclick = () => {
    // overwrite a random existing key with a fresh color
    const k = KEYS[Math.floor((writes.length * 2654435761 % 4))]; // deterministic-ish
    const used = new Set(writes.map(w => w.c));
    const c = PNAMES.find(x => !used.has(x)) || PNAMES[(writes.length) % PNAMES.length];
    writes.push({ k: 'A', c });          // always overwrite A to make the point
    query = 'A'; render();
  };
  host.querySelector('#rrReset').onclick = () => {
    writes = [{ k: 'A', c: 'red' }, { k: 'B', c: 'green' }, { k: 'C', c: 'blue' }, { k: 'A', c: 'yellow' }];
    query = 'A'; render();
  };
  render();
})();

/* =====================================================================
 * Widget 3: gate-explorer — alpha (forget) + beta (write) over a noisy stream
 * ===================================================================== */
(function gateExplorer() {
  const host = document.getElementById('gate-explorer');
  if (!host) return;
  const D = 10, T = 90;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="geCanvas"></canvas>
      <div class="controls">
        <div class="ctl"><label>forget gate α <span id="geA">0.95</span></label>
          <input type="range" id="geAlpha" min="0.80" max="1.00" step="0.005" value="0.95"></div>
        <div class="ctl"><label>write strength β <span id="geB">0.90</span></label>
          <input type="range" id="geBeta" min="0.10" max="1.00" step="0.02" value="0.90"></div>
        <div class="readout" id="geRead"></div>
        <p class="hint2">A stream of mostly-noise writes with one important fact refreshed every 15 steps. α=1 means never forget.</p>
      </div>
    </div>`);

  const cv = host.querySelector('#geCanvas'); const ctx = devicePx(cv, 360, 250);
  const aS = host.querySelector('#geAlpha'), bS = host.querySelector('#geBeta');
  const aL = host.querySelector('#geA'), bL = host.querySelector('#geB'), read = host.querySelector('#geRead');

  // stable data
  const rng = mulberry32(7);
  const kImp = randUnit(D, rng), vImp = randUnit(D, rng);
  const stream = [];
  for (let t = 0; t < T; t++) {
    if (t % 15 === 7) stream.push({ k: kImp, v: vImp, imp: true });
    else stream.push({ k: randUnit(D, rng), v: randUnit(D, rng), imp: false });
  }

  function run(alpha, beta) {
    const S = new Array(D * D).fill(0);
    const recall = [], norm = []; let lastImp = -1;
    for (let t = 0; t < T; t++) {
      const { k, v, imp } = stream[t];
      const Sk = matVec(S, k, D);
      for (let i = 0; i < D; i++) for (let j = 0; j < D; j++)
        S[i * D + j] = alpha * (S[i * D + j] - beta * Sk[i] * k[j]) + beta * v[i] * k[j];
      if (imp) lastImp = t;
      let n = 0; for (const z of S) n += z * z; norm.push(Math.sqrt(n));
      recall.push(lastImp >= 0 ? Math.max(0, cos(matVec(S, kImp, D), vImp)) : 0);
    }
    return { recall, norm };
  }

  function draw() {
    const alpha = parseFloat(aS.value), beta = parseFloat(bS.value);
    aL.textContent = alpha.toFixed(3); bL.textContent = beta.toFixed(2);
    const { recall, norm } = run(alpha, beta);
    const W = 360, H = 250, lp = 36, rp = 36, tp = 20, bp = 28;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule'), acc = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = rule; ctx.strokeRect(lp, tp, W - lp - rp, H - tp - bp);
    const px = (t) => lp + t / (T - 1) * (W - lp - rp);
    const pyR = (r) => tp + (1 - r) * (H - tp - bp);
    const maxN = Math.max(...norm, 1);
    const pyN = (n) => tp + (1 - n / maxN) * (H - tp - bp);
    // important-fact refresh markers
    stream.forEach((s, t) => { if (s.imp) { ctx.strokeStyle = 'rgba(95,169,255,0.35)'; ctx.beginPath(); ctx.moveTo(px(t), tp); ctx.lineTo(px(t), H - bp); ctx.stroke(); } });
    // state norm (saturation) — blue
    ctx.strokeStyle = '#5fa9ff'; ctx.lineWidth = 1.6; ctx.beginPath();
    norm.forEach((n, t) => { const X = px(t), Y = pyN(n); t ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
    // recall — accent
    ctx.strokeStyle = acc; ctx.lineWidth = 2.6; ctx.beginPath();
    recall.forEach((r, t) => { const X = px(t), Y = pyR(r); t ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
    // labels
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = acc; ctx.fillText('recall of the fact', lp + 4, tp + 12);
    ctx.fillStyle = '#5fa9ff'; ctx.fillText('‖S‖ (memory load)', W - rp - 118, tp + 12);
    ctx.fillStyle = mute; ctx.fillText('time →', W - 50, H - 8);

    const fin = recall[recall.length - 1];
    const sat = norm[norm.length - 1] / maxN;
    const state = alpha > 0.995 ? 'saturating — noise never clears' : (sat < 0.7 ? 'stable — sheds noise' : 'filling up');
    read.innerHTML = `recall now: <b>${(fin * 100).toFixed(0)}%</b><br>memory: <b>${state}</b><br>` +
      `<span class="hint2">${alpha > 0.995 ? 'No forgetting: a finite memory collides with itself.' :
        beta < 0.35 ? 'Weak writes: facts barely register.' :
        'Forgetting + strong delta writes: the fact stays sharp.'}</span>`;
  }
  aS.oninput = draw; bS.oninput = draw; _redraws.push(draw); draw();
})();

/* =====================================================================
 * Widget 4: sink-gate — attention sink with/without the output gate
 * ===================================================================== */
(function sinkGate() {
  const host = document.getElementById('sink-gate');
  if (!host) return;
  const N = 12; // tokens

  host.insertAdjacentHTML('beforeend', `
    <div class="picker">
      <button class="btn active" id="sgBase">vanilla softmax</button>
      <button class="btn" id="sgGate">+ output gate</button>
    </div>
    <div class="body">
      <canvas id="sgCanvas"></canvas>
      <div class="controls">
        <div class="ctl"><label>query relevance <span id="sgRelV">0.15</span></label>
          <input type="range" id="sgRel" min="0" max="1" step="0.01" value="0.15"></div>
        <div class="readout" id="sgRead"></div>
        <p class="hint2">Low relevance = this head has nothing useful to attend to. Watch where its softmax mass goes, and what the gate does about it.</p>
      </div>
    </div>`);

  const cv = host.querySelector('#sgCanvas'); const ctx = devicePx(cv, 360, 250);
  const relS = host.querySelector('#sgRel'), relV = host.querySelector('#sgRelV'), read = host.querySelector('#sgRead');
  let gated = false;
  const bBase = host.querySelector('#sgBase'), bGate = host.querySelector('#sgGate');
  bBase.onclick = () => { gated = false; bBase.classList.add('active'); bGate.classList.remove('active'); draw(); };
  bGate.onclick = () => { gated = true; bGate.classList.add('active'); bBase.classList.remove('active'); draw(); };

  // a "relevant" token at position 8
  const REL_POS = 8;
  function weights(rel) {
    // base logits: small noise; relevant token gets +rel*strong; token0 is a learned sink with a bias
    const logits = [];
    const sinkBias = 4.0 * (1 - rel);   // when nothing relevant, sink bias dominates (vanilla must park mass)
    for (let i = 0; i < N; i++) {
      let l = Math.sin(i * 1.7) * 0.2;
      if (i === REL_POS) l += rel * 6.0;
      if (i === 0) l += sinkBias;
      logits.push(l);
    }
    const m = Math.max(...logits); const e = logits.map(x => Math.exp(x - m));
    const z = e.reduce((a, b) => a + b, 0); return e.map(x => x / z);
  }

  function draw() {
    const rel = parseFloat(relS.value); relV.textContent = rel.toFixed(2);
    const w = weights(rel);
    // output gate value ~ sigmoid of relevance: closed when nothing relevant
    const g = gated ? sigmoid(8 * (rel - 0.30)) : 1.0;
    const W = 360, H = 250, lp = 28, rp = 12, tp = 22, bp = 40;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule'), acc = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('attention weights over 12 tokens', lp, 14);
    const bw = (W - lp - rp) / N;
    const maxW = Math.max(...w, 0.001);
    for (let i = 0; i < N; i++) {
      const h = (w[i] / 1.0) * (H - tp - bp);
      const x = lp + i * bw, y = H - bp - h;
      const isSink = i === 0, isRel = i === REL_POS;
      ctx.fillStyle = isSink ? '#5fa9ff' : (isRel ? acc : (cssVar('--bg-card')));
      ctx.globalAlpha = isSink || isRel ? 1 : 0.85;
      ctx.fillRect(x + 2, y, bw - 4, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rule; ctx.strokeRect(x + 2, y, bw - 4, h);
      ctx.fillStyle = mute; ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(i === 0 ? 'sink' : (i === REL_POS ? 'rel' : i), x + 3, H - bp + 12);
    }
    // gate overlay: scale the whole head output (dim everything by g)
    if (gated && g < 0.98) {
      ctx.fillStyle = 'rgba(20,20,25,' + (0.55 * (1 - g)) + ')';
      ctx.fillRect(lp, tp, W - lp - rp, H - tp - bp);
      ctx.fillStyle = acc; ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.fillText('head silenced  (gate σ ≈ ' + g.toFixed(2) + ')', lp + 50, tp + 70);
    }
    const sink = (w[0] * 100);
    read.innerHTML =
      `attention on token 0 (sink): <b>${sink.toFixed(1)}%</b><br>` +
      `output gate σ: <b>${g.toFixed(2)}</b><br>` +
      `head contribution: <b>${(g * 100).toFixed(0)}%</b><br>` +
      `<span class="hint2">${!gated
        ? (rel < 0.3 ? 'Softmax must sum to 1, so an idle head dumps its mass on the sink token.' : 'A relevant token is present — attention sharpens onto it.')
        : (rel < 0.3 ? 'The gate closes (σ≈0): the head emits ~nothing, so no sink is needed.' : 'Relevant token present → gate opens, head speaks normally.')}</span>`;
  }
  relS.oninput = draw; _redraws.push(draw); draw();
})();

/* =====================================================================
 * Widget 5: model-stack — real hybrid layer stacks + KV-cache vs context
 * ===================================================================== */
(function modelStack() {
  const host = document.getElementById('model-stack');
  if (!host) return;

  // layer block types: L=linear/recurrent (gated delta/KDA/lightning), A=full attention, M=MLA
  const MODELS = {
    qwen3next: {
      name: 'Qwen3-Next', pattern: ['L', 'L', 'L', 'A'], reps: 3, linName: 'Gated DeltaNet', attName: 'gated attn',
      attFrac: 0.25, params: '80B / 3B active', ctx: '262K → 1M', head: '>10× throughput @ >32K vs Qwen3-32B',
    },
    qwen35: {
      name: 'Qwen3.5-397B', pattern: ['L', 'L', 'L', 'A'], reps: 3, linName: 'Gated DeltaNet', attName: 'gated attn',
      attFrac: 0.25, params: '397B / 17B active', ctx: '262K → 1M', head: '~8–19× faster decode (vendor-reported)',
    },
    kimi: {
      name: 'Kimi Linear', pattern: ['L', 'L', 'L', 'M'], reps: 3, linName: 'KDA (gated delta)', attName: 'MLA',
      attFrac: 0.18, params: '48B / 3B active', ctx: '1M', head: '75% smaller KV cache · 6× decode @ 1M',
    },
    minimax: {
      name: 'MiniMax-01', pattern: ['L', 'L', 'L', 'L', 'L', 'L', 'L', 'A'], reps: 1, linName: 'Lightning attn', attName: 'softmax',
      attFrac: 0.125, params: '456B / 45.9B active', ctx: '1M → 4M', head: '7:1 — softmax every 8th layer',
    },
    dense: {
      name: 'Dense Transformer', pattern: ['A'], reps: 4, linName: '', attName: 'full attention',
      attFrac: 1.0, params: 'reference', ctx: 'grows with L', head: 'KV cache ∝ context length',
    },
  };
  const ORDER = ['qwen3next', 'qwen35', 'kimi', 'minimax', 'dense'];
  let sel = 'qwen3next';

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="msPick"></div>
    <div class="body">
      <div class="ms-stack" id="msStack"></div>
      <div class="ms-right">
        <canvas id="msCanvas"></canvas>
        <div class="readout" id="msRead"></div>
      </div>
    </div>`);

  const pick = host.querySelector('#msPick');
  ORDER.forEach(k => {
    const b = document.createElement('button'); b.className = 'btn' + (k === sel ? ' active' : '');
    b.textContent = MODELS[k].name; b.dataset.k = k;
    b.onclick = () => { sel = k; [...pick.children].forEach(c => c.classList.toggle('active', c.dataset.k === sel)); draw(); };
    pick.appendChild(b);
  });
  const stackEl = host.querySelector('#msStack');
  const cv = host.querySelector('#msCanvas'); const ctx = devicePx(cv, 320, 230);
  const read = host.querySelector('#msRead');

  function blocks(m) {
    const out = []; for (let r = 0; r < m.reps; r++) for (const p of m.pattern) out.push(p);
    return out.slice(0, 16);
  }

  function draw() {
    const m = MODELS[sel];
    // --- stack column (top = output) ---
    const bl = blocks(m);
    stackEl.innerHTML = bl.slice().reverse().map(p => {
      const lin = p === 'L', mla = p === 'M';
      const cls = lin ? 'lin' : (mla ? 'mla' : 'att');
      const label = lin ? m.linName : (mla ? m.attName : m.attName);
      return `<div class="ms-block ${cls}">${label}</div>`;
    }).join('') + `<div class="ms-axis">↑ ${bl.length} of N layers (repeats)</div>`;

    // --- KV memory vs context curve ---
    const W = 320, H = 230, lp = 38, rp = 12, tp = 18, bp = 34;
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), rule = cssVar('--rule'), acc = cssVar('--accent');
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = rule; ctx.strokeRect(lp, tp, W - lp - rp, H - tp - bp);
    ctx.fillStyle = mute; ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('KV memory vs context', lp, 12);
    ctx.fillText('context →', W - 70, H - 8);
    // x: log context 4K..1M ; y: relative memory (dense @1M = 1)
    const Lmin = 4096, Lmax = 1048576;
    const lx = (L) => lp + (Math.log(L) - Math.log(Lmin)) / (Math.log(Lmax) - Math.log(Lmin)) * (W - lp - rp);
    const ly = (mem) => tp + (1 - clamp(mem, 0, 1)) * (H - tp - bp);
    const memOf = (frac, L) => frac * (L / Lmax); // linear in L, scaled by attention fraction
    // dense reference (faint)
    ctx.strokeStyle = rule; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]); ctx.beginPath();
    for (let L = Lmin; L <= Lmax; L *= 1.2) { const X = lx(L), Y = ly(memOf(1, L)); L === Lmin ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); } ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = mute; ctx.fillText('dense', lx(Lmax) - 60, ly(memOf(1, Lmax / 1.4)) - 4);
    // selected model
    ctx.strokeStyle = acc; ctx.lineWidth = 2.6; ctx.beginPath();
    for (let L = Lmin; L <= Lmax; L *= 1.2) { const X = lx(L), Y = ly(memOf(m.attFrac, L)); L === Lmin ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); } ctx.stroke();
    // x ticks
    ctx.fillStyle = mute; ctx.font = '9px ui-monospace, monospace';
    [['4K', 4096], ['128K', 131072], ['1M', 1048576]].forEach(([t, L]) => ctx.fillText(t, lx(L) - 8, H - bp + 12));

    const saved = m.attFrac < 1 ? `${Math.round((1 - m.attFrac) * 100)}% less KV` : '—';
    read.innerHTML =
      `<b>${m.name}</b><br>params: <b>${m.params}</b><br>context: <b>${m.ctx}</b><br>` +
      `full-attention layers: <b>${Math.round(m.attFrac * 100)}%</b> → <b>${saved}</b> at long context<br>` +
      `<span class="hint2">${m.head}</span>`;
  }
  _redraws.push(draw); draw();
})();
