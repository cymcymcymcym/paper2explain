/* Quantization blog interactive widgets. Plain JS / Canvas. No deps.
 * Conventions:
 *   - One IIFE per widget. Always check `host` exists first.
 *   - devicePx for fillRect/stroke/text canvases (crisp 2x).
 *   - cssVar('--accent') so theming follows the user's choice.
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
    document.dispatchEvent(new CustomEvent('themechange'));
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
function pointerX(canvas, e) {
  const r = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX);
  return (cx - r.left) / r.width * (canvas.width / 2);
}
function randn() {
  const u = 1 - Math.random(), v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* fixed semantic colors (theme-independent so the "sign/exp/mantissa" story
 * is consistent with the SVG teaser and the manim animation) */
const COL = {
  sign: '#ff5a78', exp: '#5fa9ff', mant: '#66bb6a',
  data: '#5fa9ff', err: '#e8554e', good: '#3fb98a', out: '#ffb020',
};

/* ---------- shared float format model ---------- */
const FMT = {
  fp32: { E: 8, M: 23, bias: 127, label: 'fp32' },
  fp16: { E: 5, M: 10, bias: 15, label: 'fp16' },
  bf16: { E: 8, M: 7, bias: 127, label: 'bf16' },
  e4m3: { E: 4, M: 3, bias: 7, label: 'fp8 E4M3', e4m3: true },
  e5m2: { E: 5, M: 2, bias: 15, label: 'fp8 E5M2' },
};

function decodeFloat(sign, eRaw, mRaw, fmt) {
  const { E, M, bias } = fmt;
  const eAll = (1 << E) - 1;
  const s = sign ? -1 : 1;
  if (fmt.e4m3) {
    if (eRaw === eAll && mRaw === (1 << M) - 1) return { val: NaN, kind: 'NaN' };
  } else if (eRaw === eAll) {
    if (mRaw === 0) return { val: s * Infinity, kind: sign ? '−∞' : '+∞' };
    return { val: NaN, kind: 'NaN' };
  }
  if (eRaw === 0) {
    const val = s * Math.pow(2, 1 - bias) * (mRaw / Math.pow(2, M));
    return { val, kind: mRaw === 0 ? (sign ? '−0' : '0') : 'subnormal', e: 1 - bias, mant: mRaw / Math.pow(2, M), implicit: 0, sub: true };
  }
  const val = s * Math.pow(2, eRaw - bias) * (1 + mRaw / Math.pow(2, M));
  return { val, kind: 'normal', e: eRaw - bias, mant: mRaw / Math.pow(2, M), implicit: 1, sub: false };
}

function maxFinite(fmt) {
  const eAll = (1 << fmt.E) - 1;
  if (fmt.e4m3) return decodeFloat(0, eAll, (1 << fmt.M) - 2, fmt).val;
  return decodeFloat(0, eAll - 1, (1 << fmt.M) - 1, fmt).val;
}

/* generic nearest-value encoder (exact enough for presets) */
function encodeFloat(x, fmt) {
  const { E, M, bias } = fmt;
  const eAll = (1 << E) - 1;
  const topExp = fmt.e4m3 ? eAll : eAll - 1;
  if (x === 0 || !isFinite(x)) return { sign: x < 0 ? 1 : 0, eRaw: 0, mRaw: 0 };
  const sign = x < 0 ? 1 : 0;
  let ax = Math.abs(x);
  const mx = maxFinite(fmt);
  if (ax > mx) return { sign, eRaw: topExp, mRaw: fmt.e4m3 ? (1 << M) - 2 : (1 << M) - 1 };
  let e = Math.floor(Math.log2(ax));
  let eRaw = e + bias;
  if (eRaw < 1) {
    let mRaw = Math.round(ax / Math.pow(2, 1 - bias) * Math.pow(2, M));
    if (mRaw >= (1 << M)) return { sign, eRaw: 1, mRaw: 0 };
    return { sign, eRaw: 0, mRaw };
  }
  let frac = ax / Math.pow(2, e) - 1;
  let mRaw = Math.round(frac * Math.pow(2, M));
  if (mRaw >= (1 << M)) { mRaw = 0; eRaw += 1; }
  if (eRaw > topExp) return { sign, eRaw: topExp, mRaw: fmt.e4m3 ? (1 << M) - 2 : (1 << M) - 1 };
  return { sign, eRaw, mRaw };
}

function fmtNum(v) {
  if (Number.isNaN(v)) return 'NaN';
  if (!isFinite(v)) return v > 0 ? '+∞' : '−∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-4) return v.toExponential(4);
  return parseFloat(v.toPrecision(7)).toString();
}

/* =====================================================================
 * Widget 1: Float dissector — flip a bit, watch the number
 * ===================================================================== */
(function bitDissector() {
  const host = document.getElementById('bit-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="bits-fmt picker"></div>
    <div class="bits-value"><span id="bvNum">1.0</span> <span id="bvKind" class="bits-kind"></span></div>
    <div class="bits-grid" id="bitsGrid"></div>
    <div class="bits-legend">
      <span><span class="sw" style="background:${COL.sign}"></span>sign <b id="legS"></b></span>
      <span><span class="sw" style="background:${COL.exp}"></span>exponent <b id="legE"></b></span>
      <span><span class="sw" style="background:${COL.mant}"></span>mantissa <b id="legM"></b></span>
    </div>
    <div class="bits-formula kv" id="bitsFormula"></div>
    <div class="bits-presets">
      <span class="presets-lbl">load:</span>
      <button class="btn sm" data-v="0">0</button>
      <button class="btn sm" data-v="1">1.0</button>
      <button class="btn sm" data-v="0.1">0.1</button>
      <button class="btn sm" data-v="3.14159265">π</button>
      <button class="btn sm" data-v="max">max</button>
      <span class="presets-lbl" style="margin-left:8px;">nudge:</span>
      <button class="btn sm" id="nudgeDown">−</button>
      <button class="btn sm" id="nudgeUp">+</button>
    </div>
  `);

  let key = 'bf16';
  let bits = { sign: 0, exp: [], mant: [] };

  const elNum = host.querySelector('#bvNum');
  const elKind = host.querySelector('#bvKind');
  const elGrid = host.querySelector('#bitsGrid');
  const elFormula = host.querySelector('#bitsFormula');
  const pickerBox = host.querySelector('.bits-fmt');

  Object.keys(FMT).forEach(k => {
    const b = document.createElement('button');
    b.className = 'btn' + (k === key ? ' active' : '');
    b.textContent = FMT[k].label;
    b.dataset.k = k;
    b.onclick = () => { switchFmt(k); };
    pickerBox.appendChild(b);
  });

  function setFromValue(v) {
    const f = FMT[key];
    const { sign, eRaw, mRaw } = encodeFloat(v, f);
    bits.sign = sign;
    bits.exp = toBitArray(eRaw, f.E);
    bits.mant = toBitArray(mRaw, f.M);
  }
  function toBitArray(n, len) {
    const a = [];
    for (let i = len - 1; i >= 0; i--) a.push((n >> i) & 1);
    return a;
  }
  function bitsToInt(arr) { return arr.reduce((acc, b) => acc * 2 + b, 0); }

  function switchFmt(k) {
    const cur = decode().val;
    key = k;
    pickerBox.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.k === k));
    setFromValue(isFinite(cur) ? cur : 1.0);
    render();
  }

  function decode() {
    const f = FMT[key];
    return decodeFloat(bits.sign, bitsToInt(bits.exp), bitsToInt(bits.mant), f);
  }

  function render() {
    const f = FMT[key];
    host.querySelector('#legS').textContent = '(1)';
    host.querySelector('#legE').textContent = `(${f.E}, bias ${f.bias})`;
    host.querySelector('#legM').textContent = `(${f.M})`;
    elGrid.innerHTML = '';
    const make = (val, cls, onClick, title) => {
      const d = document.createElement('button');
      d.className = 'bit ' + cls;
      d.textContent = val;
      d.title = title;
      d.onclick = onClick;
      elGrid.appendChild(d);
    };
    make(bits.sign, 'b-sign', () => { bits.sign ^= 1; update(); }, 'sign bit');
    const sep1 = document.createElement('span'); sep1.className = 'bit-sep'; elGrid.appendChild(sep1);
    bits.exp.forEach((b, i) => make(b, 'b-exp', () => { bits.exp[i] ^= 1; update(); }, 'exponent bit'));
    const sep2 = document.createElement('span'); sep2.className = 'bit-sep'; elGrid.appendChild(sep2);
    bits.mant.forEach((b, i) => make(b, 'b-mant', () => { bits.mant[i] ^= 1; update(); }, 'mantissa bit'));
    update();
  }

  function update() {
    const cells = elGrid.querySelectorAll('.bit');
    cells[0].textContent = bits.sign;
    let idx = 1;
    bits.exp.forEach(b => { cells[idx++].textContent = b; });
    bits.mant.forEach(b => { cells[idx++].textContent = b; });

    const f = FMT[key];
    const d = decode();
    elNum.textContent = fmtNum(d.val);
    elNum.style.color = isFinite(d.val) ? cssVar('--fg') : COL.err;
    elKind.textContent = d.kind;

    if (!isFinite(d.val) || Number.isNaN(d.val)) {
      elFormula.innerHTML = `special pattern → <b>${d.kind}</b>`;
      return;
    }
    const s = bits.sign ? '−1' : '+1';
    if (d.sub) {
      elFormula.innerHTML =
        `${s} × 2<sup>${1 - f.bias}</sup> × (0 + ${(d.mant).toFixed(4)})  =  <b>${fmtNum(d.val)}</b> &nbsp;<span class="muted">(subnormal)</span>`;
    } else {
      elFormula.innerHTML =
        `${s} × 2<sup>${d.e}</sup> × (1 + ${(d.mant).toFixed(4)})  =  <b>${fmtNum(d.val)}</b>`;
    }
  }

  function nudge(dir) {
    const f = FMT[key];
    let code = bitsToInt(bits.exp) * (1 << f.M) + bitsToInt(bits.mant);
    code += dir;
    const maxCode = ((1 << f.E) - 1) * (1 << f.M) + ((1 << f.M) - 1);
    code = Math.max(0, Math.min(maxCode, code));
    bits.exp = toBitArray(Math.floor(code / (1 << f.M)), f.E);
    bits.mant = toBitArray(code % (1 << f.M), f.M);
    update();
  }

  host.querySelectorAll('.bits-presets .btn[data-v]').forEach(b => {
    b.onclick = () => {
      const raw = b.dataset.v;
      const v = raw === 'max' ? maxFinite(FMT[key]) : parseFloat(raw);
      setFromValue(v);
      render();
    };
  });
  host.querySelector('#nudgeUp').onclick = () => nudge(+1);
  host.querySelector('#nudgeDown').onclick = () => nudge(-1);

  setFromValue(1.0);
  render();
  document.addEventListener('themechange', update);
})();

/* =====================================================================
 * Widget 2: representable-value number line
 * ===================================================================== */
(function numberLine() {
  const host = document.getElementById('numberline-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="nl-pickers">
      <div class="picker" id="nlFmt"></div>
      <div class="picker" id="nlAxis">
        <button class="btn active" data-a="lin">linear axis</button>
        <button class="btn" data-a="log">log axis</button>
      </div>
    </div>
    <canvas id="nlCanvas"></canvas>
    <div class="readout" id="nlRead"></div>
  `);

  const cv = host.querySelector('#nlCanvas');
  const W = 680, H = 200;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#nlRead');

  let fmtKey = 'e4m3';
  let axis = 'lin';
  let target = 0.31; // normalized [-1,1]
  let dragging = false;

  const FORMATS = {
    e4m3: { kind: 'float', E: 4, M: 3, bias: 7, e4m3: true, label: 'fp8 E4M3' },
    e5m2: { kind: 'float', E: 5, M: 2, bias: 15, label: 'fp8 E5M2' },
    fp4: { kind: 'float', E: 2, M: 1, bias: 1, label: 'fp4 E2M1' },
    int8: { kind: 'int', bits: 8, label: 'int8' },
    nf4: { kind: 'nf4', label: 'NF4' },
  };
  const NF4 = [-1.0, -0.6961928, -0.5250731, -0.3949175, -0.2844414, -0.1847734,
    -0.0910500, 0.0, 0.0795803, 0.1609302, 0.2461123, 0.3379152, 0.4407098,
    0.5626170, 0.7229568, 1.0];

  function valuesFor(key) {
    const f = FORMATS[key];
    let vals = [];
    if (f.kind === 'float') {
      const fmt = { E: f.E, M: f.M, bias: f.bias, e4m3: f.e4m3 };
      const eAll = (1 << f.E) - 1;
      const set = new Set();
      for (let e = 0; e <= eAll; e++)
        for (let m = 0; m < (1 << f.M); m++) {
          const d = decodeFloat(0, e, m, fmt);
          if (isFinite(d.val)) set.add(d.val);
        }
      const pos = [...set];
      pos.forEach(v => set.add(-v));
      vals = [...set];
    } else if (f.kind === 'int') {
      const q = (1 << (f.bits - 1)) - 1;
      for (let i = -q; i <= q; i++) vals.push(i / q);
    } else if (f.kind === 'nf4') {
      vals = NF4.slice();
    }
    const mx = Math.max(...vals.map(Math.abs)) || 1;
    vals = vals.map(v => v / mx).sort((a, b) => a - b);
    // dedupe
    return vals.filter((v, i) => i === 0 || Math.abs(v - vals[i - 1]) > 1e-9);
  }

  let vals = valuesFor(fmtKey);

  function nearest(t) {
    let best = vals[0], bd = Infinity;
    for (const v of vals) { const d = Math.abs(v - t); if (d < bd) { bd = d; best = v; } }
    return best;
  }

  // coordinate maps
  const padL = 40, padR = 40, axisY = 120;
  function xLin(v) { return padL + (v + 1) / 2 * (W - padL - padR); }
  function xLog(v) {
    // positive side only; map |v| in [minPos, 1] by log2
    const minPos = vals.filter(v => v > 0).reduce((a, b) => Math.min(a, b), 1);
    const lo = Math.log2(minPos), hi = 0; // log2(1)=0
    const lv = Math.log2(Math.max(Math.abs(v), minPos));
    return padL + (lv - lo) / (hi - lo) * (W - padL - padR);
  }
  const X = (v) => axis === 'lin' ? xLin(v) : xLog(v);

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent');
    // axis line
    ctx.strokeStyle = mute; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, axisY); ctx.lineTo(W - padR, axisY); ctx.stroke();

    const showVals = axis === 'log' ? vals.filter(v => v > 0) : vals;
    // ticks
    for (const v of showVals) {
      const x = X(v);
      const isZero = Math.abs(v) < 1e-9;
      ctx.strokeStyle = isZero ? accent : COL.exp;
      ctx.globalAlpha = isZero ? 1 : 0.55;
      ctx.lineWidth = isZero ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, axisY - 14); ctx.lineTo(x, axisY + 14); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // labels
    ctx.fillStyle = mute; ctx.font = '11px ' + cssVar('--mono'); ctx.textAlign = 'center';
    if (axis === 'lin') {
      [-1, -0.5, 0, 0.5, 1].forEach(v => { ctx.fillText(v.toString(), xLin(v), axisY + 32); });
    } else {
      [0.0625, 0.125, 0.25, 0.5, 1].forEach(v => { if (v >= 0) ctx.fillText(v.toString(), xLog(v), axisY + 32); });
      ctx.fillText('|value| (positive side)', W / 2, axisY + 50);
    }

    // target + snap
    if (axis === 'lin') {
      const snapped = nearest(target);
      const tx = X(target), sx = X(snapped);
      // snap connector
      ctx.strokeStyle = COL.err; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, axisY - 40); ctx.lineTo(sx, axisY - 14); ctx.stroke();
      // snapped marker
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(sx, axisY, 5, 0, 7); ctx.fill();
      // target handle
      ctx.fillStyle = COL.data;
      ctx.beginPath(); ctx.arc(tx, axisY - 44, 8, 0, 7); ctx.fill();
      ctx.fillStyle = fg; ctx.font = '12px ' + cssVar('--mono');
      ctx.fillText('drag', tx, axisY - 56);
      const err = Math.abs(snapped - target);
      read.innerHTML =
        `<b>${FORMATS[fmtKey].label}</b> · ${showVals.length} representable values shown` +
        `<br>target <b>${target.toFixed(4)}</b> → nearest <b style="color:${accent}">${snapped.toFixed(4)}</b>` +
        ` · error <b style="color:${COL.err}">${err.toFixed(4)}</b> (${(err * 100).toFixed(2)}% of full-scale)`;
    } else {
      read.innerHTML =
        `<b>${FORMATS[fmtKey].label}</b> · log axis. Floats look <b>evenly spaced</b> here ` +
        `(uniform in log = geometric in linear); the integer grid looks <b>crowded at the top, sparse at the bottom</b>. ` +
        `Switch to linear to drag a target and read the rounding error.`;
    }
  }

  // pickers
  const fmtBox = host.querySelector('#nlFmt');
  Object.keys(FORMATS).forEach(k => {
    const b = document.createElement('button');
    b.className = 'btn' + (k === fmtKey ? ' active' : '');
    b.textContent = FORMATS[k].label; b.dataset.k = k;
    b.onclick = () => {
      fmtKey = k; vals = valuesFor(k);
      fmtBox.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.k === k));
      draw();
    };
    fmtBox.appendChild(b);
  });
  host.querySelector('#nlAxis').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      axis = b.dataset.a;
      host.querySelector('#nlAxis').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      draw();
    };
  });

  function setTarget(e) {
    if (axis !== 'lin') return;
    const x = pointerX(cv, e);
    let t = (x - padL) / (W - padL - padR) * 2 - 1;
    target = Math.max(-1, Math.min(1, t));
    draw();
  }
  cv.addEventListener('mousedown', e => { dragging = true; setTarget(e); });
  window.addEventListener('mousemove', e => { if (dragging) setTarget(e); });
  window.addEventListener('mouseup', () => { dragging = false; });
  cv.addEventListener('touchstart', e => { dragging = true; setTarget(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', e => { if (dragging) { setTarget(e); e.preventDefault(); } }, { passive: false });
  cv.addEventListener('touchend', () => { dragging = false; });

  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 3: affine int8 quantization playground
 * ===================================================================== */
(function affinePlayground() {
  const host = document.getElementById('affine-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div class="aff-left">
        <canvas id="affCanvas"></canvas>
      </div>
      <div class="controls">
        <div class="picker" id="affBits">
          <button class="btn active" data-b="8">int8</button>
          <button class="btn" data-b="4">int4</button>
        </div>
        <div class="picker" id="affSym">
          <button class="btn active" data-s="1">symmetric</button>
          <button class="btn" data-s="0">asymmetric</button>
        </div>
        <label class="ctl-lbl">scale  <span id="affScaleV"></span></label>
        <input type="range" id="affScale" min="0.35" max="1.6" step="0.01" value="1.0"/>
        <button class="btn full" id="affOut">add an outlier</button>
        <div class="readout" id="affRead"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#affCanvas');
  const W = 440, H = 300;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#affRead');

  let bits = 8, sym = true, factor = 1.0, outlier = false;
  let data = [];

  function regen() {
    data = [];
    for (let i = 0; i < 4000; i++) data.push(randn() * 1.0);
    if (outlier) { for (let i = 0; i < 6; i++) data.push((4.5 + Math.random()) * (Math.random() < 0.5 ? 1 : 1)); }
  }
  regen();

  function quantize() {
    const qmaxI = bits === 8 ? 127 : 7;
    let s, z, qmin, qmax;
    if (sym) {
      const absmax = Math.max(...data.map(Math.abs));
      s = (absmax * factor) / qmaxI;
      z = 0; qmin = -qmaxI - 1; qmax = qmaxI;
    } else {
      const lo = Math.min(...data), hi = Math.max(...data);
      const span = (hi - lo) * factor;
      const mid = (hi + lo) / 2;
      const a = mid - span / 2, b = mid + span / 2;
      qmin = 0; qmax = (1 << bits) - 1;
      s = (b - a) / qmax;
      z = Math.round(-a / s);
    }
    let se = 0, sv = 0, clipped = 0;
    const levMin = s * (qmin - z), levMax = s * (qmax - z);
    for (const x of data) {
      let q = Math.round(x / s) + z;
      if (q < qmin) { q = qmin; clipped++; } else if (q > qmax) { q = qmax; clipped++; }
      const xh = s * (q - z);
      se += (xh - x) * (xh - x); sv += x * x;
    }
    const mse = se / data.length;
    const sqnr = 10 * Math.log10(sv / data.length / mse);
    return { s, z, qmin, qmax, levMin, levMax, rmse: Math.sqrt(mse), sqnr, clipped, n: data.length };
  }

  function draw() {
    const r = quantize();
    ctx.clearRect(0, 0, W, H);
    const fg = cssVar('--fg'), mute = cssVar('--fg-mute'), accent = cssVar('--accent'), card = cssVar('--bg-card');
    const A = Math.max(Math.max(...data.map(Math.abs)) * 1.05, Math.abs(r.levMin), Math.abs(r.levMax)) * 1.02;
    const padX = 20, plotW = W - 2 * padX, baseY = H - 50, topY = 30;
    const xOf = v => padX + (v + A) / (2 * A) * plotW;

    // clipped regions
    ctx.fillStyle = 'rgba(232,85,78,0.10)';
    ctx.fillRect(xOf(-A), topY, xOf(r.levMin) - xOf(-A), baseY - topY);
    ctx.fillRect(xOf(r.levMax), topY, xOf(A) - xOf(r.levMax), baseY - topY);

    // histogram
    const NB = 90, hist = new Array(NB).fill(0);
    for (const x of data) {
      let bi = Math.floor((x + A) / (2 * A) * NB);
      if (bi >= 0 && bi < NB) hist[bi]++;
    }
    const hmax = Math.max(...hist);
    ctx.fillStyle = mute;
    for (let i = 0; i < NB; i++) {
      const h = (hist[i] / hmax) * (baseY - topY - 6);
      const x0 = padX + i / NB * plotW;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x0, baseY - h, plotW / NB - 1, h);
    }
    ctx.globalAlpha = 1;

    // quantization grid lines (dequantized levels)
    const nLev = r.qmax - r.qmin + 1;
    const step = nLev > 40 ? Math.ceil(nLev / 40) : 1;
    ctx.strokeStyle = accent; ctx.globalAlpha = nLev > 40 ? 0.25 : 0.6; ctx.lineWidth = 1;
    for (let q = r.qmin; q <= r.qmax; q += step) {
      const lv = r.s * (q - r.z);
      const x = xOf(lv);
      ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, baseY); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // axis
    ctx.strokeStyle = mute; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padX, baseY); ctx.lineTo(W - padX, baseY); ctx.stroke();
    ctx.fillStyle = mute; ctx.font = '11px ' + cssVar('--mono'); ctx.textAlign = 'center';
    ctx.fillText('0', xOf(0), baseY + 16);
    ctx.fillText(fmtNum(r.levMin).slice(0, 6), xOf(r.levMin), baseY + 16);
    ctx.fillText(fmtNum(r.levMax).slice(0, 6), xOf(r.levMax), baseY + 16);
    ctx.textAlign = 'left';
    ctx.fillStyle = accent; ctx.font = '11px ' + cssVar('--sans');
    ctx.fillText(`grid: ${nLev} levels` + (step > 1 ? ` (every ${step}th drawn)` : ''), padX + 2, topY - 12);

    read.innerHTML =
      `scale&nbsp;s = <b>${fmtNum(r.s)}</b><br>` +
      `zero-point&nbsp;z = <b>${r.z}</b><br>` +
      `RMSE = <b>${r.rmse.toFixed(4)}</b><br>` +
      `SQNR = <b style="color:${r.sqnr > 20 ? COL.good : COL.err}">${r.sqnr.toFixed(1)} dB</b><br>` +
      `clipped = <b style="color:${r.clipped > 0 ? COL.err : COL.good}">${(100 * r.clipped / r.n).toFixed(2)}%</b>`;
    host.querySelector('#affScaleV').textContent = '×' + factor.toFixed(2) + ' of absmax';
  }

  host.querySelector('#affBits').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      bits = +b.dataset.b;
      host.querySelector('#affBits').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      draw();
    };
  });
  host.querySelector('#affSym').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      sym = b.dataset.s === '1';
      host.querySelector('#affSym').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      draw();
    };
  });
  host.querySelector('#affScale').addEventListener('input', e => { factor = +e.target.value; draw(); });
  host.querySelector('#affOut').onclick = () => {
    outlier = !outlier;
    host.querySelector('#affOut').classList.toggle('active', outlier);
    host.querySelector('#affOut').textContent = outlier ? 'remove the outlier' : 'add an outlier';
    regen(); draw();
  };

  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 4: SmoothQuant — migrate the difficulty
 * ===================================================================== */
(function smoothQuant() {
  const host = document.getElementById('outlier-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="sqCanvas"></canvas>
      <div class="controls">
        <label class="ctl-lbl">smoothing strength α = <span id="sqAlphaV">0.50</span></label>
        <input type="range" id="sqAlpha" min="0" max="1" step="0.01" value="0.5"/>
        <div class="readout" id="sqRead"></div>
        <p class="ctl-note">α = 0 leaves everything as-is (activations un-quantizable). α = 1 dumps all the
        pain onto the weights. The sweet spot near 0.5 makes <em>both</em> sides quantizable.</p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#sqCanvas');
  const W = 440, H = 300;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#sqRead');

  const NC = 8;
  const Xmax = [0.9, 1.1, 0.8, 16.0, 0.95, 1.05, 0.85, 1.0]; // channel 3 = outlier
  const Wmax = [0.55, 0.62, 0.48, 0.58, 0.51, 0.6, 0.5, 0.57];
  let alpha = 0.5;

  function compute() {
    const sX = [], nX = [], nW = [];
    for (let j = 0; j < NC; j++) {
      const s = Math.pow(Xmax[j], alpha) / Math.pow(Wmax[j], 1 - alpha);
      sX.push(s); nX.push(Xmax[j] / s); nW.push(Wmax[j] * s);
    }
    return { nX, nW, peakX: Math.max(...nX), peakW: Math.max(...nW) };
  }

  function draw() {
    const r = compute();
    ctx.clearRect(0, 0, W, H);
    const mute = cssVar('--fg-mute'), fg = cssVar('--fg');
    const colW = W / 2, pad = 18;
    const scale = 18 / Math.max(16, r.peakX); // px per unit, normalized so original outlier ~ fits

    function panel(x0, label, before, after, color) {
      const baseY = H - 46, topY = 40, bw = (colW - 2 * pad) / NC;
      ctx.fillStyle = fg; ctx.font = '600 13px ' + cssVar('--sans'); ctx.textAlign = 'center';
      ctx.fillText(label, x0 + colW / 2, 22);
      const maxv = 18; // logical units shown
      const yOf = v => baseY - Math.min(v, maxv) / maxv * (baseY - topY);
      // axis
      ctx.strokeStyle = mute; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 + pad, baseY); ctx.lineTo(x0 + colW - pad, baseY); ctx.stroke();
      for (let j = 0; j < NC; j++) {
        const bx = x0 + pad + j * bw + 2;
        // before (faint)
        ctx.fillStyle = mute; ctx.globalAlpha = 0.28;
        ctx.fillRect(bx, yOf(before[j]), bw - 4, baseY - yOf(before[j]));
        // after (solid)
        ctx.globalAlpha = 1; ctx.fillStyle = color;
        ctx.fillRect(bx, yOf(after[j]), bw - 4, baseY - yOf(after[j]));
        if (before[j] > maxv) {
          ctx.fillStyle = COL.err; ctx.font = '9px ' + cssVar('--mono');
          ctx.fillText('▲' + before[j].toFixed(0), bx + bw / 2 - 2, topY - 4);
        }
      }
      ctx.globalAlpha = 1;
    }

    panel(0, 'activations  X', Xmax, r.nX, COL.out);
    panel(colW, 'weights  W', Wmax, r.nW, COL.exp);

    // divider
    ctx.strokeStyle = mute; ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.moveTo(colW, 30); ctx.lineTo(colW, H - 40); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = mute; ctx.font = '10px ' + cssVar('--sans'); ctx.textAlign = 'center';
    ctx.fillText('faint = before · solid = after smoothing', W / 2, H - 14);

    const combined = Math.max(r.peakX, r.peakW);
    const balanced = Math.abs(r.peakX - r.peakW) < 0.6;
    read.innerHTML =
      `activation peak = <b style="color:${COL.out}">${r.peakX.toFixed(2)}</b><br>` +
      `weight peak = <b style="color:${COL.exp}">${r.peakW.toFixed(2)}</b><br>` +
      `worst-case to quantize = <b style="color:${combined < 3 ? COL.good : COL.err}">${combined.toFixed(2)}</b>` +
      (balanced ? ` <span style="color:${COL.good}">⟵ balanced</span>` : '');
  }

  host.querySelector('#sqAlpha').addEventListener('input', e => {
    alpha = +e.target.value;
    host.querySelector('#sqAlphaV').textContent = alpha.toFixed(2);
    draw();
  });

  draw();
  document.addEventListener('themechange', draw);
})();

/* =====================================================================
 * Widget 5: memory & quality calculator
 * ===================================================================== */
(function memoryCalc() {
  const host = document.getElementById('memory-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="memCanvas"></canvas>
      <div class="controls">
        <div class="picker" id="memModel">
          <button class="btn" data-p="7">7B</button>
          <button class="btn" data-p="13">13B</button>
          <button class="btn active" data-p="70">70B</button>
          <button class="btn" data-p="405">405B</button>
        </div>
        <label class="ctl-lbl">your GPU memory: <span id="memGpuV">24</span> GB</label>
        <input type="range" id="memGpu" min="8" max="640" step="1" value="24"/>
        <div class="picker" id="memGpuPick">
          <button class="btn" data-g="24">4090 · 24</button>
          <button class="btn" data-g="80">H100 · 80</button>
          <button class="btn" data-g="141">H200 · 141</button>
          <button class="btn" data-g="640">8×H100 · 640</button>
        </div>
        <div class="readout" id="memRead"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#memCanvas');
  const W = 440, H = 300;
  const ctx = devicePx(cv, W, H);
  const read = host.querySelector('#memRead');

  let params = 70, gpu = 24;
  const FORMATS = [
    { name: 'fp32', bits: 32 },
    { name: 'fp16 / bf16', bits: 16 },
    { name: 'int8 / fp8', bits: 8 },
    { name: 'int4 (group)', bits: 4.25 },
    { name: 'NF4', bits: 4.5 },
  ];

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const mute = cssVar('--fg-mute'), fg = cssVar('--fg'), accent = cssVar('--accent');
    const rows = FORMATS.map(f => ({ ...f, gb: params * f.bits / 8 }));
    const maxGB = Math.max(rows[0].gb, gpu) * 1.08;
    const padL = 96, padR = 16, top = 18, rowH = (H - top - 30) / rows.length;
    const xOf = gb => padL + gb / maxGB * (W - padL - padR);

    rows.forEach((r, i) => {
      const y = top + i * rowH + 6;
      const fits = r.gb <= gpu;
      ctx.fillStyle = fg; ctx.font = '12px ' + cssVar('--sans'); ctx.textAlign = 'right';
      ctx.fillText(r.name, padL - 8, y + rowH / 2 - 2);
      ctx.fillStyle = fits ? COL.good : COL.err;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(padL, y, Math.max(2, xOf(r.gb) - padL), rowH - 12);
      ctx.globalAlpha = 1;
      ctx.fillStyle = fg; ctx.font = '11px ' + cssVar('--mono'); ctx.textAlign = 'left';
      ctx.fillText(`${r.gb.toFixed(0)} GB`, xOf(r.gb) + 6, y + (rowH - 12) / 2 + 4);
    });

    // GPU line
    const gx = xOf(gpu);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(gx, top - 4); ctx.lineTo(gx, H - 26); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent; ctx.font = '600 11px ' + cssVar('--sans'); ctx.textAlign = 'center';
    ctx.fillText(`GPU ${gpu} GB`, gx, H - 12);

    const ok = FORMATS.filter(f => params * f.bits / 8 <= gpu).map(f => f.name);
    read.innerHTML =
      `<b>${params}B</b> model · weights only<br>` +
      `fp16 needs <b>${(params * 2).toFixed(0)} GB</b>, int4 needs <b>${(params * 4.25 / 8).toFixed(0)} GB</b><br>` +
      `fits in ${gpu} GB: <b style="color:${ok.length ? COL.good : COL.err}">${ok.length ? ok.join(', ') : 'nothing — go smaller'}</b>`;
    host.querySelector('#memGpuV').textContent = gpu;
  }

  host.querySelector('#memModel').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      params = +b.dataset.p;
      host.querySelector('#memModel').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      draw();
    };
  });
  host.querySelector('#memGpu').addEventListener('input', e => { gpu = +e.target.value; draw(); });
  host.querySelector('#memGpuPick').querySelectorAll('button').forEach(b => {
    b.onclick = () => { gpu = +b.dataset.g; host.querySelector('#memGpu').value = gpu; draw(); };
  });

  draw();
  document.addEventListener('themechange', draw);
})();
