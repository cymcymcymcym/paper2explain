/* Vision Banana interactive widgets.
 * Author: paper2explain
 * Plain JS / Canvas / SVG. No deps. */

/* ---------- theme toggle ---------- */
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

/* ---------- shared: depth bijection helpers ---------- */
const LAM = -3, C = 10.0 / 3;
const CUBE_PATH = [
  [0, 0, 0],   // black
  [1, 0, 0],   // red
  [1, 1, 0],   // yellow
  [0, 1, 0],   // green
  [0, 1, 1],   // cyan
  [0, 0, 1],   // blue
  [1, 0, 1],   // magenta
  [1, 1, 1],   // white
];
const N_EDGES = CUBE_PATH.length - 1;

function warp(d) {
  return 1 - Math.pow(1 - d / (LAM * C), LAM + 1);
}
function invWarp(t) {
  // inverse of f: given t in [0,1), recover d.
  // t = 1 - (1 - d/(lam*c))^(lam+1) => d = lam*c*(1 - (1-t)^(1/(lam+1)))
  return LAM * C * (1 - Math.pow(1 - t, 1 / (LAM + 1)));
}
function rgbFromWarped(t) {
  t = Math.max(0, Math.min(0.99999, t));
  const seg = t * N_EDGES;
  const i = Math.floor(seg);
  const frac = seg - i;
  const a = CUBE_PATH[i], b = CUBE_PATH[i + 1];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac];
}
function colorForDepth(d) { return rgbFromWarped(warp(d)); }
function rgbToHex(rgb) {
  const ch = (x) => {
    const v = Math.max(0, Math.min(255, Math.round(x * 255)));
    return v.toString(16).padStart(2, '0');
  };
  return '#' + ch(rgb[0]) + ch(rgb[1]) + ch(rgb[2]);
}
function rgbToInts(rgb) {
  return rgb.map(x => Math.max(0, Math.min(255, Math.round(x * 255))));
}

function devicePx(canvas, cssW, cssH) {
  // bitmap at 2x for crisp rendering; CSS controls display size via aspect-ratio
  canvas.width = cssW * 2;
  canvas.height = cssH * 2;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  return ctx;
}

// For widgets that use putImageData (which ignores transforms),
// keep bitmap=logical size; CSS will scale at display time.
function flatPx(canvas, w, h) {
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext('2d');
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* =====================================================================
 * Widget 1: TASK SWITCHER
 * Shows the same image with 4 task outputs by toggling figures from the paper.
 * ===================================================================== */
(function taskSwitcher() {
  const host = document.getElementById('task-switcher');
  if (!host) return;
  const tasks = [
    {
      key: 'semseg',
      label: 'Semantic segmentation',
      input: 'assets/figures/semseg_input.jpg',
      output: 'assets/figures/semseg_output.png',
      prompt: '"Generate a semantic segmentation visualization, using this color mapping: {\'cat\': \'red\', \'lock\': \'pink\', \'exit sign\': \'light purple\', \'background\': \'yellow\'}."',
      cap: 'Each class → its assigned color.',
    },
    {
      key: 'insseg',
      label: 'Instance segmentation',
      input: 'assets/figures/insseg_input.jpg',
      output: 'assets/figures/insseg_pred1.png',
      prompt: '"Generate an instance segmentation visualization of this image. Each piece of garlic is colored differently."',
      cap: 'Each instance → a distinct color the model picks itself.',
    },
    {
      key: 'refseg',
      label: 'Referring expression',
      input: 'assets/figures/refseg_input.jpg',
      output: 'assets/figures/refseg_pred.png',
      prompt: '"A segmentation map image. The area that corresponds to the man in pink t-shirt is rendered solid white; the other man is rendered in green."',
      cap: 'Free-form text → grounded mask.',
    },
    {
      key: 'normal',
      label: 'Surface normals',
      input: 'assets/figures/normal_input.jpg',
      output: 'assets/figures/normal_vb.jpg',
      prompt: '"Estimate the per-pixel surface normal in camera space; encode (x, y, z) as (R, G, B)."',
      cap: 'XYZ vector → directly to RGB.',
    },
  ];
  const row = document.createElement('div');
  row.className = 'switch-row';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const promptBox = document.createElement('div');
  promptBox.className = 'prompt-box';
  host.appendChild(row);
  host.appendChild(panel);
  host.appendChild(promptBox);

  let active = 0;
  function render() {
    row.innerHTML = '';
    tasks.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'btn' + (i === active ? ' active' : '');
      b.textContent = t.label;
      b.onclick = () => { active = i; render(); };
      row.appendChild(b);
    });
    const t = tasks[active];
    panel.innerHTML = `
      <div>
        <img src="${t.input}" alt="${t.label} input"/>
        <div class="lbl">input image</div>
      </div>
      <div>
        <img src="${t.output}" alt="${t.label} output"/>
        <div class="lbl">${t.cap}</div>
      </div>
    `;
    promptBox.textContent = t.prompt;
  }
  render();
})();

/* =====================================================================
 * Widget 2: DEPTH ↔ RGB BIJECTION EXPLORER
 * Slider for depth, draws curve + RGB cube path + cursor + swatch.
 * ===================================================================== */
(function depthExplorer() {
  const host = document.getElementById('depth-explorer');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div>
        <canvas id="depthCurve" width="360" height="220"></canvas>
        <canvas id="depthTube" width="360" height="80" style="margin-top:8px"></canvas>
      </div>
      <div class="controls">
        <div>
          <label style="font-family:var(--sans);font-size:13px;color:var(--fg-mute);">depth (m)</label>
          <input id="depthSlider" type="range" min="0.05" max="30" step="0.05" value="1.2"/>
        </div>
        <div class="readout" id="depthReadout"></div>
        <div class="swatch" id="depthSwatch"></div>
      </div>
    </div>
  `);

  const curveCv = host.querySelector('#depthCurve');
  const tubeCv = host.querySelector('#depthTube');
  const slider = host.querySelector('#depthSlider');
  const readout = host.querySelector('#depthReadout');
  const swatch = host.querySelector('#depthSwatch');

  let CW = 360, CH = 220, TW = 360, TH = 80;
  const ctxCurve = devicePx(curveCv, CW, CH);
  const ctxTube = devicePx(tubeCv, TW, TH);

  function drawCurve(d) {
    const ctx = ctxCurve;
    ctx.clearRect(0, 0, CW, CH);
    const padL = 36, padR = 12, padT = 14, padB = 30;
    const w = CW - padL - padR, h = CH - padT - padB;
    const ruleColor = cssVar('--rule') || '#ccc';
    const fgMute = cssVar('--fg-mute') || '#888';
    // axes
    ctx.strokeStyle = ruleColor; ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, w, h);
    // grid lines
    ctx.strokeStyle = ruleColor; ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
      const y = padT + (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      const x = padL + (i / 6) * w;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + h); ctx.stroke();
    }
    // labels
    ctx.fillStyle = fgMute; ctx.font = '11px var(--sans)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
      const y = padT + h - v * h;
      ctx.fillText(v.toFixed(2), padL - 4, y);
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, 5, 10, 15, 20, 25, 30].forEach(v => {
      const x = padL + (v / 30) * w;
      ctx.fillText(v, x, padT + h + 4);
    });
    ctx.save(); ctx.translate(12, padT + h / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('f(d)', 0, 0); ctx.restore();
    ctx.fillText('depth d (m)', padL + w / 2, padT + h + 18);

    // curve
    ctx.strokeStyle = cssVar('--accent') || '#c64f24'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const dd = (i / 200) * 30;
      const v = warp(dd);
      const x = padL + (dd / 30) * w;
      const y = padT + h - v * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // marker for current d
    const t = warp(d);
    const mx = padL + (d / 30) * w;
    const my = padT + h - t * h;
    // dashed reference lines
    ctx.setLineDash([4, 4]); ctx.strokeStyle = fgMute; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, padT + h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(padL, my); ctx.stroke();
    ctx.setLineDash([]);
    // dot
    ctx.fillStyle = cssVar('--accent') || '#c64f24';
    ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
  }

  function drawTube(d) {
    const ctx = ctxTube;
    ctx.clearRect(0, 0, TW, TH);
    const padL = 36, padR = 12, padT = 8, padB = 18;
    const w = TW - padL - padR, h = TH - padT - padB;
    // gradient strip
    const n = 240;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const rgb = rgbFromWarped(t);
      ctx.fillStyle = rgbToHex(rgb);
      ctx.fillRect(padL + (i / n) * w, padT, w / n + 1, h);
    }
    // border
    ctx.strokeStyle = cssVar('--rule') || '#ccc'; ctx.lineWidth = 1;
    ctx.strokeRect(padL, padT, w, h);
    // depth markers
    const refDs = [0.2, 1, 3, 10, 30];
    ctx.fillStyle = cssVar('--fg-mute') || '#888';
    ctx.font = '10px var(--sans)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    refDs.forEach(dd => {
      const tt = warp(dd);
      const x = padL + tt * w;
      ctx.fillRect(x - 0.5, padT + h, 1, 4);
      ctx.fillText(dd + 'm', x, padT + h + 5);
    });
    // current cursor
    const t = warp(d);
    const cx = padL + t * w;
    ctx.fillStyle = cssVar('--fg') || '#000';
    ctx.beginPath();
    ctx.moveTo(cx, padT - 6);
    ctx.lineTo(cx - 5, padT - 1);
    ctx.lineTo(cx + 5, padT - 1);
    ctx.closePath();
    ctx.fill();
    // tube label
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '11px var(--sans)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('RGB', 6, padT + h / 2);
  }

  function update() {
    const d = parseFloat(slider.value);
    drawCurve(d);
    drawTube(d);
    const rgb = colorForDepth(d);
    const ints = rgbToInts(rgb);
    swatch.style.background = rgbToHex(rgb);
    readout.innerHTML = `
      <div>d = <b>${d.toFixed(2)} m</b></div>
      <div>f(d) = <b>${warp(d).toFixed(3)}</b></div>
      <div>RGB = <b>(${ints[0]}, ${ints[1]}, ${ints[2]})</b></div>
      <div>hex = <b>${rgbToHex(rgb).toUpperCase()}</b></div>
    `;
  }
  slider.addEventListener('input', update);
  window.addEventListener('vb-theme-change', update);
  update();
})();

/* =====================================================================
 * Widget 3: SEGMENTATION ENCODER
 * A simple toy scene, user picks colors for each "class", then sees:
 *   (1) the encoded mask, (2) the decoded mask after nearest-color clustering.
 * ===================================================================== */
(function segEncoder() {
  const host = document.getElementById('seg-encoder');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div>
      <div class="picker-row">Click a class chip to recolor it. The middle canvas is the target image the generator must produce; the right canvas is what the decoder recovers from a slightly noisy version.</div>
      <div class="legend" id="segLegend"></div>
    </div>
    <div class="body">
      <div>
        <canvas id="segInput" width="200" height="200"></canvas>
        <div class="lbl">input "image"</div>
      </div>
      <div>
        <canvas id="segEncoded" width="200" height="200"></canvas>
        <div class="lbl">encoded mask (target)</div>
      </div>
      <div>
        <canvas id="segDecoded" width="200" height="200"></canvas>
        <div class="lbl">decoded (predicted + noise → clustered)</div>
      </div>
    </div>
  `);

  // Simple toy scene with 4 classes: "sky", "ground", "cat", "ball"
  const classes = [
    { name: 'sky',     color: '#7fb6ff' },
    { name: 'ground',  color: '#a5894b' },
    { name: 'cat',     color: '#e84545' },
    { name: 'ball',    color: '#ffd84a' },
  ];

  const legend = host.querySelector('#segLegend');
  const inputCv = host.querySelector('#segInput');
  const encCv = host.querySelector('#segEncoded');
  const decCv = host.querySelector('#segDecoded');
  const SIZE = 200;
  const ctxIn = flatPx(inputCv, SIZE, SIZE);
  const ctxEnc = flatPx(encCv, SIZE, SIZE);
  const ctxDec = flatPx(decCv, SIZE, SIZE);

  // class id at pixel position for our toy scene (deterministic).
  // 0=sky, 1=ground, 2=cat, 3=ball.
  // Decision order: object regions checked first, then horizon split.
  function classAt(x, y) {
    // ball: circle in the right
    const bx = 142, by = 135, br = 24;
    if ((x - bx) * (x - bx) + (y - by) * (y - by) < br * br) return 3;
    // cat: rounded body + two triangular ears (kept tight, not overlapping the ball)
    const cx = 65, cy = 130;
    // body ellipse
    const ex = (x - cx) / 32, ey = (y - cy) / 26;
    if (ex * ex + ey * ey < 1) return 2;
    // ears
    if (y > 96 && y < 120 && x > 40 && x < 60 && (x - 40) > (110 - y) * 0.8) return 2;
    if (y > 96 && y < 120 && x > 70 && x < 90 && (90 - x) > (110 - y) * 0.8) return 2;
    // horizon split for sky / ground
    return y < 118 ? 0 : 1;
  }

  // realistic-ish "photo": shaded version of the same scene
  function drawInput() {
    const img = ctxIn.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const c = classAt(x, y);
        let r, g, b;
        if (c === 0) {
          // sky gradient
          const t = y / 90;
          r = 0.45 + 0.35 * t; g = 0.65 + 0.25 * t; b = 0.9 - 0.1 * t;
        } else if (c === 1) {
          // ground texture
          const t = (y - 150) / 50;
          const n = ((x * 13 + y * 7) % 23) / 23;
          r = 0.42 + 0.18 * t + 0.06 * n; g = 0.32 + 0.12 * t + 0.05 * n; b = 0.18 + 0.05 * t + 0.04 * n;
        } else if (c === 2) {
          // cat: brownish with shading
          const dy = y - 130;
          r = 0.5 + 0.06 * Math.sin(dy * 0.3); g = 0.36 + 0.05 * Math.sin(dy * 0.2); b = 0.28;
        } else {
          // ball: red-orange with a highlight
          const dx = (x - 142), dy = (y - 132);
          const t = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 25);
          r = 0.9 - 0.1 * (1 - t); g = 0.35 + 0.35 * t; b = 0.1 + 0.4 * t;
        }
        const i = (y * SIZE + x) * 4;
        img.data[i]   = Math.round(r * 255);
        img.data[i+1] = Math.round(g * 255);
        img.data[i+2] = Math.round(b * 255);
        img.data[i+3] = 255;
      }
    }
    ctxIn.putImageData(img, 0, 0);
  }

  function parseHex(h) {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function drawEncoded() {
    const img = ctxEnc.createImageData(SIZE, SIZE);
    const colors = classes.map(c => parseHex(c.color));
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const c = classAt(x, y);
        const col = colors[c];
        const i = (y * SIZE + x) * 4;
        img.data[i] = col[0]; img.data[i+1] = col[1]; img.data[i+2] = col[2]; img.data[i+3] = 255;
      }
    }
    ctxEnc.putImageData(img, 0, 0);
  }

  function drawDecoded() {
    // Simulate the model output: encoded image + Gaussian-ish noise + soft blur at borders.
    // Then run nearest-color clustering as the decoder.
    const img = ctxDec.createImageData(SIZE, SIZE);
    const colors = classes.map(c => parseHex(c.color));
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const c = classAt(x, y);
        const target = colors[c];
        // noise
        let r = target[0] + (Math.random() - 0.5) * 30;
        let g = target[1] + (Math.random() - 0.5) * 30;
        let b = target[2] + (Math.random() - 0.5) * 30;
        // at borders, blend with neighbor's class color to simulate fuzzy generation
        const cN = classAt(x, Math.max(0, y - 2));
        const cS = classAt(x, Math.min(SIZE - 1, y + 2));
        const cE = classAt(Math.min(SIZE - 1, x + 2), y);
        const cW = classAt(Math.max(0, x - 2), y);
        if (cN !== c || cS !== c || cE !== c || cW !== c) {
          const other = (cN !== c) ? cN : (cS !== c) ? cS : (cE !== c) ? cE : cW;
          const oc = colors[other];
          r = 0.55 * r + 0.45 * oc[0];
          g = 0.55 * g + 0.45 * oc[1];
          b = 0.55 * b + 0.45 * oc[2];
        }
        // nearest color classification
        let best = 0, bestD = Infinity;
        for (let k = 0; k < colors.length; k++) {
          const dc = colors[k];
          const dd = (dc[0]-r)**2 + (dc[1]-g)**2 + (dc[2]-b)**2;
          if (dd < bestD) { bestD = dd; best = k; }
        }
        const final = colors[best];
        const i = (y * SIZE + x) * 4;
        img.data[i] = final[0]; img.data[i+1] = final[1]; img.data[i+2] = final[2]; img.data[i+3] = 255;
      }
    }
    ctxDec.putImageData(img, 0, 0);
  }

  function renderLegend() {
    legend.innerHTML = '';
    classes.forEach((c, i) => {
      const chip = document.createElement('label');
      chip.className = 'chip';
      chip.innerHTML = `
        <span class="dot" style="background:${c.color}"></span>
        <span class="name">${c.name}</span>
        <input type="color" value="${c.color}" data-i="${i}"/>
      `;
      legend.appendChild(chip);
    });
    legend.querySelectorAll('input[type="color"]').forEach(input => {
      input.addEventListener('input', (e) => {
        const i = parseInt(e.target.dataset.i);
        classes[i].color = e.target.value;
        legend.querySelectorAll('.chip')[i].querySelector('.dot').style.background = e.target.value;
        drawEncoded();
        drawDecoded();
      });
    });
  }

  drawInput();
  renderLegend();
  drawEncoded();
  drawDecoded();
  // re-shuffle noise every 1.5s for visual life
  setInterval(drawDecoded, 1500);
})();

/* =====================================================================
 * Widget 4: SURFACE NORMAL COMPASS
 * Hemisphere with draggable arrow tip → RGB color.
 * ===================================================================== */
(function normalCompass() {
  const host = document.getElementById('normal-compass');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="normalCv" width="320" height="320"></canvas>
      <div>
        <div class="readout" id="normalReadout"></div>
        <div class="swatch" id="normalSwatch"></div>
        <p style="font-family:var(--sans); font-size:12px; color:var(--fg-mute); margin-top:10px;">
          Try the presets: <button class="btn" data-n="0,0,1">camera</button>
          <button class="btn" data-n="0,1,0">up</button>
          <button class="btn" data-n="-1,0,0">left</button>
          <button class="btn" data-n="1,0,0">right</button>
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#normalCv');
  const readout = host.querySelector('#normalReadout');
  const swatch = host.querySelector('#normalSwatch');
  const SIZE = 320;
  const ctx = flatPx(cv, SIZE, SIZE);
  const cx = SIZE / 2, cy = SIZE / 2, R = 130;

  // Current normal vector. Default: pointing toward camera.
  let nx = 0.2, ny = 0.35, nz = 0.91; // will be normalized

  function normalize() {
    const m = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= m; ny /= m; nz /= m;
    if (nz < 0.05) { nz = 0.05; normalize(); }
  }

  function colorOf(x, y, z) {
    // map (-1..1) -> (0..1) for each channel
    return [(x + 1) / 2, (y + 1) / 2, (z + 1) / 2];
  }

  function draw() {
    normalize();
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Hemisphere with color gradient (XYZ→RGB encoding).
    const img = ctx.createImageData(SIZE, SIZE);
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const dx = (px - cx) / R, dy = -(py - cy) / R;
        const d2 = dx * dx + dy * dy;
        const i = (py * SIZE + px) * 4;
        if (d2 <= 1) {
          const z = Math.sqrt(1 - d2);
          const rgb = colorOf(dx, dy, z);
          img.data[i] = Math.round(rgb[0] * 255);
          img.data[i+1] = Math.round(rgb[1] * 255);
          img.data[i+2] = Math.round(rgb[2] * 255);
          img.data[i+3] = 255;
        } else {
          img.data[i+3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // Outline
    ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    // Cross axes
    ctx.strokeStyle = cssVar('--fg-mute');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = cssVar('--fg-mute');
    ctx.font = '12px var(--sans)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+y (up → green)', cx, cy - R - 12);
    ctx.fillText('-y (down)', cx, cy + R + 12);
    ctx.textAlign = 'left';
    ctx.fillText('+x (right → red)', cx + R + 6, cy);
    ctx.textAlign = 'right';
    ctx.fillText('(left → pink) -x', cx - R - 6, cy);

    // Arrow showing the normal
    const ax = cx + nx * R;
    const ay = cy - ny * R;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke();
    // Arrow head (disc with the encoded color)
    const rgbHead = colorOf(nx, ny, nz);
    ctx.fillStyle = rgbToHex(rgbHead);
    ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2); ctx.stroke();

    // Update sidebar
    const rgb = colorOf(nx, ny, nz);
    const ints = rgbToInts(rgb);
    swatch.style.background = rgbToHex(rgb);
    readout.innerHTML = `
      <div>x = <b>${nx.toFixed(2)}</b></div>
      <div>y = <b>${ny.toFixed(2)}</b></div>
      <div>z = <b>${nz.toFixed(2)}</b></div>
      <div style="margin-top:6px;">RGB = <b>(${ints[0]}, ${ints[1]}, ${ints[2]})</b></div>
      <div>hex = <b>${rgbToHex(rgb).toUpperCase()}</b></div>
    `;
  }

  // Drag interactions
  let dragging = false;
  function setFromEvent(e) {
    const rect = cv.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) || e;
    const px = (t.clientX - rect.left) * (SIZE / rect.width);
    const py = (t.clientY - rect.top) * (SIZE / rect.height);
    let dx = (px - cx) / R;
    let dy = -(py - cy) / R;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) {
      const s = 1 / Math.sqrt(d2) * 0.999;
      dx *= s; dy *= s;
    }
    nx = dx; ny = dy;
    nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
    draw();
  }
  cv.addEventListener('mousedown', (e) => { dragging = true; setFromEvent(e); });
  window.addEventListener('mousemove', (e) => { if (dragging) setFromEvent(e); });
  window.addEventListener('mouseup', () => { dragging = false; });
  cv.addEventListener('touchstart', (e) => { dragging = true; setFromEvent(e); e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', (e) => { if (dragging) { setFromEvent(e); e.preventDefault(); } }, { passive: false });
  cv.addEventListener('touchend', () => { dragging = false; });

  host.querySelectorAll('button.btn').forEach(b => {
    b.addEventListener('click', () => {
      const [x, y, z] = b.dataset.n.split(',').map(parseFloat);
      nx = x; ny = y; nz = z;
      draw();
    });
  });

  draw();
})();

/* =====================================================================
 * Widget 5: SPECIALIST vs GENERALIST COMPARISON SLIDER
 * Two images stacked, draggable divider.
 * ===================================================================== */
(function comparisonSlider() {
  const host = document.getElementById('comparison');
  if (!host) return;
  const pairs = [
    {
      key: 'normals',
      label: 'Surface normals: Lotus-2 vs Vision Banana',
      left:  { src: 'assets/figures/normal_lotus.jpg', name: 'Lotus-2' },
      right: { src: 'assets/figures/normal_vb.jpg',    name: 'Vision Banana' },
    },
    {
      key: 'normals2',
      label: 'Surface normals (scene 2): Lotus-2 vs Vision Banana',
      left:  { src: 'assets/figures/normal2_lotus.jpg', name: 'Lotus-2' },
      right: { src: 'assets/figures/normal2_vb.jpg',    name: 'Vision Banana' },
    },
    {
      key: 't2i',
      label: 'Text-to-image: base NBP vs Vision Banana',
      left:  { src: 'assets/figures/t2i_nbp.jpg', name: 'Nano Banana Pro' },
      right: { src: 'assets/figures/t2i_vb.jpg',  name: 'Vision Banana' },
    },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="cmpPicker"></div>
    <div class="slider-wrap" id="cmpWrap">
      <img class="cmp-left" id="cmpLeft" src=""/>
      <img class="cmp-right" id="cmpRight" src=""/>
      <div class="handle" id="cmpHandle"></div>
    </div>
    <div class="labels"><span id="cmpLeftLbl"></span><span id="cmpRightLbl"></span></div>
  `);

  const picker = host.querySelector('#cmpPicker');
  const wrap = host.querySelector('#cmpWrap');
  const leftImg = host.querySelector('#cmpLeft');
  const rightImg = host.querySelector('#cmpRight');
  const handle = host.querySelector('#cmpHandle');
  const leftLbl = host.querySelector('#cmpLeftLbl');
  const rightLbl = host.querySelector('#cmpRightLbl');

  let active = 0;
  let splitPct = 50;
  function applySplit() {
    handle.style.left = splitPct + '%';
    rightImg.style.clipPath = `inset(0 0 0 ${splitPct}%)`;
  }
  function render() {
    picker.innerHTML = '';
    pairs.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'btn' + (i === active ? ' active' : '');
      b.textContent = p.label;
      b.onclick = () => { active = i; render(); applySplit(); };
      picker.appendChild(b);
    });
    const p = pairs[active];
    leftImg.src = p.left.src;
    rightImg.src = p.right.src;
    leftLbl.textContent = '◀ ' + p.left.name;
    rightLbl.textContent = p.right.name + ' ▶';
  }
  render();
  applySplit();

  function setSplit(px) {
    const rect = wrap.getBoundingClientRect();
    splitPct = Math.max(0, Math.min(100, (px / rect.width) * 100));
    applySplit();
  }

  let dragging = false;
  function dragStart(e) { dragging = true; move(e); e.preventDefault(); }
  function move(e) {
    if (!dragging) return;
    const rect = wrap.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) || e;
    setSplit(t.clientX - rect.left);
  }
  function dragEnd() { dragging = false; }
  handle.addEventListener('mousedown', dragStart);
  wrap.addEventListener('mousedown', dragStart);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', dragEnd);
  handle.addEventListener('touchstart', dragStart, { passive: false });
  wrap.addEventListener('touchstart', dragStart, { passive: false });
  window.addEventListener('touchmove', (e) => { if (dragging) { move(e); e.preventDefault(); } }, { passive: false });
  window.addEventListener('touchend', dragEnd);
})();
