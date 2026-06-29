/* gaussian_splatting blog interactive widgets. Plain JS / Canvas. No deps. */

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

function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/* Draw one anisotropic Gaussian splat with a soft radial falloff. */
function drawSplat(ctx, g) {
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.theta);
  ctx.scale(g.sx, g.sy);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  const [r, gg, b] = hexToRgb(g.color);
  grad.addColorStop(0, `rgba(${r},${gg},${b},${g.alpha})`);
  grad.addColorStop(0.5, `rgba(${r},${gg},${b},${g.alpha * 0.55})`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* =====================================================================
 * Widget 1: splat-playground
 * Click to place anisotropic 2D Gaussians; sliders shape the next (or
 * the selected) splat. The reader feels the primitive: a few anisotropic
 * blobs paint a coherent image.
 * ===================================================================== */
(function splatPlayground() {
  const host = document.getElementById('splat-playground');
  if (!host) return;

  const COLORS = ['#5fa9ff', '#ff9b4a', '#6adfb8', '#e76a6a', '#caa7ff', '#e8d56a', '#8b6a4a', '#8fb56a'];

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="sp-canvas"></canvas>
      <div class="controls">
        <div class="sp-row"><label>scale x <span id="sp-sx-v"></span></label>
          <input type="range" id="sp-sx" min="6" max="120" step="1" value="42"/></div>
        <div class="sp-row"><label>scale y <span id="sp-sy-v"></span></label>
          <input type="range" id="sp-sy" min="6" max="120" step="1" value="14"/></div>
        <div class="sp-row"><label>rotation <span id="sp-th-v"></span></label>
          <input type="range" id="sp-th" min="0" max="180" step="1" value="0"/></div>
        <div class="sp-row"><label>opacity α <span id="sp-al-v"></span></label>
          <input type="range" id="sp-al" min="0.05" max="1" step="0.05" value="0.8"/></div>
        <div class="sp-swatches" id="sp-swatches"></div>
        <div class="sp-buttons">
          <button id="sp-preset">load preset scene</button>
          <button id="sp-undo">undo</button>
          <button id="sp-clear">clear</button>
        </div>
        <div class="readout" id="sp-readout"></div>
      </div>
    </div>
  `);

  const W = 460, H = 320;
  const cv = host.querySelector('#sp-canvas');
  const ctx = devicePx(cv, W, H);
  const sxS = host.querySelector('#sp-sx'), syS = host.querySelector('#sp-sy');
  const thS = host.querySelector('#sp-th'), alS = host.querySelector('#sp-al');
  const readout = host.querySelector('#sp-readout');
  const swatchBox = host.querySelector('#sp-swatches');

  let color = COLORS[0];
  let splats = [];
  let selected = -1;
  let dragging = false;

  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sp-swatch' + (i === 0 ? ' active' : '');
    b.style.background = c;
    b.addEventListener('click', () => {
      color = c;
      swatchBox.querySelectorAll('.sp-swatch').forEach(s => s.classList.remove('active'));
      b.classList.add('active');
      if (selected >= 0) { splats[selected].color = c; draw(); }
    });
    swatchBox.appendChild(b);
  });

  function params() {
    return {
      sx: parseFloat(sxS.value), sy: parseFloat(syS.value),
      theta: parseFloat(thS.value) * Math.PI / 180, alpha: parseFloat(alS.value),
    };
  }

  function preset() {
    splats = [
      // sky
      { x: 230, y: 50, sx: 280, sy: 70, theta: 0, alpha: 0.85, color: '#5fa9ff' },
      { x: 110, y: 95, sx: 150, sy: 40, theta: 0.05, alpha: 0.5, color: '#caa7ff' },
      // sun
      { x: 385, y: 55, sx: 26, sy: 26, theta: 0, alpha: 0.95, color: '#e8d56a' },
      { x: 385, y: 55, sx: 48, sy: 48, theta: 0, alpha: 0.35, color: '#ff9b4a' },
      // ground
      { x: 230, y: 295, sx: 290, sy: 70, theta: 0, alpha: 0.9, color: '#8fb56a' },
      { x: 90, y: 268, sx: 130, sy: 26, theta: 0.08, alpha: 0.6, color: '#6adfb8' },
      // tree trunk + canopy
      { x: 150, y: 205, sx: 9, sy: 52, theta: 0, alpha: 0.9, color: '#8b6a4a' },
      { x: 150, y: 140, sx: 52, sy: 38, theta: 0, alpha: 0.85, color: '#6adfb8' },
      { x: 118, y: 158, sx: 30, sy: 22, theta: 0.5, alpha: 0.7, color: '#8fb56a' },
      { x: 184, y: 156, sx: 30, sy: 22, theta: -0.5, alpha: 0.7, color: '#8fb56a' },
      // distant hill
      { x: 360, y: 235, sx: 110, sy: 30, theta: -0.06, alpha: 0.55, color: '#6adfb8' },
      // a needle-thin splat: the kind that represents a wire or spoke
      { x: 300, y: 180, sx: 90, sy: 3, theta: -0.25, alpha: 0.8, color: '#e76a6a' },
    ];
    selected = -1;
    draw();
  }

  function hit(mx, my) {
    for (let i = splats.length - 1; i >= 0; i--) {
      const g = splats[i];
      const dx = mx - g.x, dy = my - g.y;
      const c = Math.cos(-g.theta), s = Math.sin(-g.theta);
      const lx = (dx * c - dy * s) / g.sx, ly = (dx * s + dy * c) / g.sy;
      if (lx * lx + ly * ly <= 1) return i;
    }
    return -1;
  }

  function mpos(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
  }

  cv.addEventListener('pointerdown', (e) => {
    const [mx, my] = mpos(e);
    const i = hit(mx, my);
    if (i >= 0) {
      selected = i;
      dragging = true;
      const g = splats[i];
      sxS.value = g.sx; syS.value = g.sy;
      thS.value = (g.theta * 180 / Math.PI + 180) % 180;
      alS.value = g.alpha;
    } else {
      const p = params();
      splats.push({ x: mx, y: my, color, ...p });
      selected = splats.length - 1;
      dragging = true;
    }
    cv.setPointerCapture(e.pointerId);
    draw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging || selected < 0) return;
    const [mx, my] = mpos(e);
    splats[selected].x = mx;
    splats[selected].y = my;
    draw();
  });
  cv.addEventListener('pointerup', () => { dragging = false; });

  [sxS, syS, thS, alS].forEach(s => s.addEventListener('input', () => {
    if (selected >= 0) {
      const g = splats[selected];
      g.sx = parseFloat(sxS.value); g.sy = parseFloat(syS.value);
      g.theta = parseFloat(thS.value) * Math.PI / 180;
      g.alpha = parseFloat(alS.value);
    }
    draw();
  }));

  host.querySelector('#sp-preset').addEventListener('click', preset);
  host.querySelector('#sp-undo').addEventListener('click', () => {
    splats.pop(); selected = -1; draw();
  });
  host.querySelector('#sp-clear').addEventListener('click', () => {
    splats = []; selected = -1; draw();
  });

  function draw() {
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    splats.forEach(g => drawSplat(ctx, g));
    if (selected >= 0) {
      const g = splats[selected];
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.theta);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(0, 0, g.sx, g.sy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    host.querySelectorAll('#sp-sx-v, #sp-sy-v, #sp-th-v, #sp-al-v').forEach((el, i) => {
      el.textContent = [sxS.value, syS.value, thS.value + '°', alS.value][i];
    });
    readout.innerHTML = `<b>${splats.length}</b> splats · each one = (μ, Σ=RSSᵀRᵀ, α, c)` +
      (selected >= 0 ? ` · <span style="color:var(--accent)">selected #${selected + 1}</span>` : '');
  }

  preset();
})();

/* =====================================================================
 * Widget 2: blend-ray
 * Four splats along a ray. Sliders set each α; the widget draws the
 * transmittance staircase and the final blended pixel color.
 * ===================================================================== */
(function blendRay() {
  const host = document.getElementById('blend-ray');
  if (!host) return;

  const SPLATS = [
    { name: '1 (front)', color: '#ff9b4a', alpha: 0.6 },
    { name: '2', color: '#5fa9ff', alpha: 0.5 },
    { name: '3', color: '#6adfb8', alpha: 0.7 },
    { name: '4 (back)', color: '#e76a6a', alpha: 0.8 },
  ];

  let slidersHtml = SPLATS.map((s, i) => `
    <div class="br-row">
      <span class="br-dot" style="background:${s.color}"></span>
      <label>α${i + 1} <span id="br-v${i}">${s.alpha.toFixed(2)}</span></label>
      <input type="range" id="br-s${i}" min="0" max="0.95" step="0.05" value="${s.alpha}"/>
    </div>`).join('');

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="br-canvas"></canvas>
      <div class="controls">${slidersHtml}<div class="readout" id="br-readout"></div></div>
    </div>
  `);

  const W = 460, H = 320;
  const cv = host.querySelector('#br-canvas');
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#br-readout');

  function draw() {
    const alphas = SPLATS.map((_, i) => parseFloat(host.querySelector('#br-s' + i).value));
    alphas.forEach((a, i) => host.querySelector('#br-v' + i).textContent = a.toFixed(2));

    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const fg = '#e8e8ee', mute = '#888';

    // --- top: the ray with splats ---
    const y0 = 56;
    const xs = [120, 200, 280, 360];
    ctx.strokeStyle = mute;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(20, y0); ctx.lineTo(W - 14, y0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = fg;
    ctx.font = '11px sans-serif';
    ctx.fillText('camera', 16, y0 - 24);
    ctx.fillText('depth →', W - 64, y0 - 24);
    ctx.beginPath(); ctx.moveTo(20, y0 - 8); ctx.lineTo(34, y0); ctx.lineTo(20, y0 + 8); ctx.closePath(); ctx.fill();
    SPLATS.forEach((s, i) => {
      drawSplat(ctx, { x: xs[i], y: y0, sx: 16, sy: 30, theta: 0, alpha: Math.max(alphas[i], 0.12), color: s.color });
      ctx.fillStyle = mute;
      ctx.fillText(String(i + 1), xs[i] - 3, y0 + 48);
    });

    // --- middle: transmittance staircase ---
    const py0 = 130, ph = 92, px0 = 60, pw = 360;
    ctx.strokeStyle = '#2a2c34';
    ctx.strokeRect(px0, py0, pw, ph);
    ctx.fillStyle = mute;
    ctx.fillText('T = 1', px0 - 36, py0 + 10);
    ctx.fillText('T = 0', px0 - 36, py0 + ph);
    ctx.fillText('transmittance after each splat', px0 + 4, py0 - 8);

    let T = 1;
    const Ts = [1];
    const contribs = [];
    alphas.forEach(a => { contribs.push(a * T); T *= (1 - a); Ts.push(T); });

    ctx.strokeStyle = cssVar('--accent') || '#ff9b6a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < Ts.length; i++) {
      const x1 = px0 + (i / 4) * pw, x2 = px0 + ((i + 1) / 4) * pw;
      const y = py0 + (1 - Ts[i]) * ph;
      if (i === 0) ctx.moveTo(x1, y);
      ctx.lineTo(Math.min(x2, px0 + pw), y);
      if (i < Ts.length - 1) {
        const yn = py0 + (1 - Ts[i + 1]) * ph;
        ctx.lineTo(Math.min(x2, px0 + pw), yn);
      }
    }
    ctx.stroke();

    // --- bottom: contributions + final color ---
    const by = 252;
    ctx.fillStyle = mute;
    ctx.fillText('contribution  cᵢ·αᵢ·Tᵢ', 60, by - 8);
    let C = [14, 15, 18];
    SPLATS.forEach((s, i) => {
      const [r, g, b] = hexToRgb(s.color);
      const w = contribs[i] * 120;
      ctx.fillStyle = s.color;
      ctx.fillRect(60 + i * 85, by, Math.max(w, 1), 16);
      ctx.fillStyle = mute;
      ctx.fillText((contribs[i] * 100).toFixed(0) + '%', 60 + i * 85, by + 30);
      C = [C[0] + contribs[i] * r, C[1] + contribs[i] * g, C[2] + contribs[i] * b];
    });
    ctx.fillStyle = `rgb(${C.map(v => Math.round(Math.min(v, 255))).join(',')})`;
    ctx.fillRect(W - 60, by - 14, 44, 44);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1;
    ctx.strokeRect(W - 60, by - 14, 44, 44);
    ctx.fillStyle = mute;
    ctx.fillText('pixel C', W - 58, by + 44);

    readout.innerHTML =
      `T after all splats = <b>${(T * 100).toFixed(1)}%</b><br/>` +
      `light reaching splat 4: <b>${(Ts[3] * 100).toFixed(0)}%</b> of the ray` +
      (Ts[3] < 0.05 ? ' — <span style="color:var(--accent)">nearly occluded: tiny gradient too</span>' : '');
  }

  SPLATS.forEach((_, i) => host.querySelector('#br-s' + i).addEventListener('input', draw));
  draw();
})();

/* =====================================================================
 * Widget 3: sh-viewer
 * Orbit a camera around one splat; its color is a (circular) harmonics
 * expansion of the view angle. Degree toggle shows what each band adds.
 * ===================================================================== */
(function shViewer() {
  const host = document.getElementById('sh-viewer');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="sh-canvas"></canvas>
      <div class="controls">
        <div class="sp-row"><label>camera angle <span id="sh-av"></span></label>
          <input type="range" id="sh-angle" min="0" max="360" step="1" value="30"/></div>
        <div class="sh-degrees" id="sh-degrees">
          <button data-d="0">degree 0</button>
          <button data-d="1">degree 1</button>
          <button data-d="2">degree 2</button>
          <button data-d="3" class="active">degree 3</button>
        </div>
        <div class="readout" id="sh-readout"></div>
      </div>
    </div>
  `);

  const W = 460, H = 300;
  const cv = host.querySelector('#sh-canvas');
  const ctx = devicePx(cv, W, H);
  const angleS = host.querySelector('#sh-angle');
  const readout = host.querySelector('#sh-readout');
  let maxDeg = 3;

  // circular-harmonics coefficients per channel: [dc, c1,s1, c2,s2, c3,s3]
  // hand-tuned to look like a glossy reddish-brown splat with a cyan sheen
  const COEF = {
    r: [0.62, 0.22, 0.10, -0.14, 0.06, 0.05, -0.04],
    g: [0.38, -0.06, 0.16, 0.10, -0.10, -0.05, 0.06],
    b: [0.34, -0.18, 0.06, 0.16, 0.12, 0.07, 0.05],
  };

  function shEval(coef, th, deg) {
    let v = coef[0];
    if (deg >= 1) v += coef[1] * Math.cos(th) + coef[2] * Math.sin(th);
    if (deg >= 2) v += coef[3] * Math.cos(2 * th) + coef[4] * Math.sin(2 * th);
    if (deg >= 3) v += coef[5] * Math.cos(3 * th) + coef[6] * Math.sin(3 * th);
    return Math.max(0, Math.min(1, v));
  }

  function colorAt(th, deg) {
    return [shEval(COEF.r, th, deg), shEval(COEF.g, th, deg), shEval(COEF.b, th, deg)];
  }

  function draw() {
    const a = parseFloat(angleS.value) * Math.PI / 180;
    host.querySelector('#sh-av').textContent = angleS.value + '°';
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, W, H);
    const cx = 175, cyy = H / 2, orbitR = 108;

    // color ring: what the splat looks like from each direction
    for (let i = 0; i < 180; i++) {
      const t0 = i / 180 * Math.PI * 2, t1 = (i + 1.5) / 180 * Math.PI * 2;
      const [r, g, b] = colorAt(t0, maxDeg);
      ctx.strokeStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(cx, cyy, orbitR, t0, t1);
      ctx.stroke();
    }

    // the splat itself, colored as seen from current camera angle
    const [r, g, b] = colorAt(a, maxDeg);
    const col = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    drawSplat(ctx, { x: cx, y: cyy, sx: 56, sy: 34, theta: -0.4, alpha: 0.95, color: hex });

    // camera marker on the orbit
    const camX = cx + Math.cos(a) * orbitR, camY = cyy + Math.sin(a) * orbitR;
    ctx.fillStyle = '#e8e8ee';
    ctx.beginPath(); ctx.arc(camX, camY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(232,232,238,0.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(camX, camY); ctx.lineTo(cx, cyy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.fillText('camera', camX + 10, camY + 4);
    ctx.fillText('ring = color seen from each direction', 60, 22);

    // big swatch: what the camera sees
    ctx.fillStyle = col;
    ctx.fillRect(345, 70, 80, 80);
    ctx.strokeStyle = '#e8e8ee';
    ctx.strokeRect(345, 70, 80, 80);
    ctx.fillStyle = '#888';
    ctx.fillText('seen color', 360, 168);

    const nCoef3D = [1, 4, 9, 16][maxDeg];
    readout.innerHTML = `max degree <b>${maxDeg}</b> → ${nCoef3D} coeffs/channel in 3D (${nCoef3D * 3} floats)` +
      (maxDeg === 0 ? '<br/><span style="color:var(--accent)">degree 0 = matte: same color everywhere</span>' : '');
  }

  host.querySelectorAll('#sh-degrees button').forEach(b => {
    b.addEventListener('click', () => {
      host.querySelectorAll('#sh-degrees button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      maxDeg = parseInt(b.dataset.d, 10);
      draw();
    });
  });
  angleS.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: render-race
 * NeRF-style ray marching vs splat rasterization on the same toy scene,
 * with live work counters. Rasterization touches each covered pixel a
 * handful of times; ray marching queries an MLP at every sample of every
 * ray, mostly in empty space.
 * ===================================================================== */
(function renderRace() {
  const host = document.getElementById('render-race');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body rr-body">
      <div class="rr-panel">
        <p class="rr-label">NeRF: ray marching</p>
        <canvas id="rr-left"></canvas>
        <div class="rr-counter" id="rr-lcount">MLP queries: 0</div>
      </div>
      <div class="rr-panel">
        <p class="rr-label">3DGS: rasterization</p>
        <canvas id="rr-right"></canvas>
        <div class="rr-counter" id="rr-rcount">splat·pixel blends: 0</div>
      </div>
      <div class="rr-controls">
        <button id="rr-go">restart race</button>
        <div class="readout" id="rr-readout"></div>
      </div>
    </div>
  `);

  const GW = 64, GH = 44;             // logical pixel grid
  const SAMPLES = 32;                  // ray samples per pixel (NeRF side)
  const SPLATS = [
    { x: 18, y: 30, sx: 16, sy: 7, theta: 0.1, alpha: 0.85, color: '#8fb56a' },
    { x: 46, y: 32, sx: 13, sy: 6, theta: -0.12, alpha: 0.8, color: '#6adfb8' },
    { x: 32, y: 10, sx: 26, sy: 7, theta: 0, alpha: 0.7, color: '#5fa9ff' },
    { x: 52, y: 8, sx: 5, sy: 5, theta: 0, alpha: 0.9, color: '#e8d56a' },
    { x: 14, y: 18, sx: 4, sy: 9, theta: 0.3, alpha: 0.8, color: '#ff9b4a' },
    { x: 30, y: 22, sx: 9, sy: 3, theta: -0.4, alpha: 0.75, color: '#e76a6a' },
    { x: 40, y: 18, sx: 3, sy: 8, theta: 0.15, alpha: 0.8, color: '#caa7ff' },
    { x: 56, y: 24, sx: 7, sy: 4, theta: 0.5, alpha: 0.7, color: '#6adfb8' },
  ];

  // final image, computed once by splatting (both sides converge to this)
  const img = [];
  for (let y = 0; y < GH; y++) {
    img.push([]);
    for (let x = 0; x < GW; x++) {
      let C = [14, 15, 18], T = 1;
      SPLATS.forEach(g => {
        const dx = x - g.x, dy = y - g.y;
        const c = Math.cos(-g.theta), s = Math.sin(-g.theta);
        const lx = (dx * c - dy * s) / g.sx, ly = (dx * s + dy * c) / g.sy;
        const w = Math.exp(-2.2 * (lx * lx + ly * ly));
        const a = g.alpha * w;
        if (a > 0.01) {
          const [r, gg, b] = hexToRgb(g.color);
          C = [C[0] + a * T * r, C[1] + a * T * gg, C[2] + a * T * b];
          T *= (1 - a);
        }
      });
      img[y].push(C.map(v => Math.round(Math.min(v, 255))));
    }
  }
  // pixels covered by each splat (for the raster side)
  const coverage = SPLATS.map(g => {
    const px = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const dx = x - g.x, dy = y - g.y;
      const c = Math.cos(-g.theta), s = Math.sin(-g.theta);
      const lx = (dx * c - dy * s) / g.sx, ly = (dx * s + dy * c) / g.sy;
      if (lx * lx + ly * ly <= 1.6) px.push([x, y]);
    }
    return px;
  });
  const totalBlends = coverage.reduce((a, c) => a + c.length, 0);
  const totalQueries = GW * GH * SAMPLES;

  const SC = 7; // canvas scale
  const lcv = host.querySelector('#rr-left'), rcv = host.querySelector('#rr-right');
  const lctx = devicePx(lcv, GW * SC / 2, GH * SC / 2);
  const rctx = devicePx(rcv, GW * SC / 2, GH * SC / 2);
  const P = SC / 2; // logical px size after devicePx transform
  const lcount = host.querySelector('#rr-lcount'), rcount = host.querySelector('#rr-rcount');
  const readout = host.querySelector('#rr-readout');

  let raf = null;

  function reset(ctx) {
    ctx.fillStyle = '#0e0f12';
    ctx.fillRect(0, 0, GW * P, GH * P);
  }

  function putPixel(ctx, x, y) {
    const [r, g, b] = img[y][x];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(x * P, y * P, P + 0.5, P + 0.5);
  }

  function start() {
    if (raf) cancelAnimationFrame(raf);
    reset(lctx); reset(rctx);
    let li = 0;                 // pixel index for the NeRF side
    let ri = 0;                 // splat index for the raster side
    let rDone = false, lDone = false;
    let rFrames = 0;

    function tick() {
      // raster side: one splat per ~5 frames so the win is visible but not instant
      if (!rDone) {
        rFrames++;
        if (rFrames % 5 === 0 && ri < SPLATS.length) {
          coverage[ri].forEach(([x, y]) => putPixel(rctx, x, y));
          ri++;
          rcount.textContent = 'splat·pixel blends: ' +
            coverage.slice(0, ri).reduce((a, c) => a + c.length, 0).toLocaleString();
          if (ri === SPLATS.length) {
            rDone = true;
            rcount.textContent += ' — DONE';
          }
        }
      }
      // nerf side: a few pixels per frame, each costing SAMPLES queries
      if (!lDone) {
        for (let k = 0; k < 6 && li < GW * GH; k++, li++) {
          const x = li % GW, y = Math.floor(li / GW);
          putPixel(lctx, x, y);
        }
        lcount.textContent = 'MLP queries: ' + (li * SAMPLES).toLocaleString();
        if (li >= GW * GH) {
          lDone = true;
          lcount.textContent += ' — DONE';
        }
      }
      if (!lDone || !rDone) raf = requestAnimationFrame(tick);
      else readout.innerHTML =
        `same image. <b>${totalQueries.toLocaleString()}</b> network queries vs ` +
        `<b>${totalBlends.toLocaleString()}</b> blend ops — ` +
        `<b>${(totalQueries / totalBlends).toFixed(0)}×</b> less work, and each op is ` +
        `a multiply-add instead of an MLP evaluation.`;
    }
    readout.textContent = '';
    raf = requestAnimationFrame(tick);
  }

  host.querySelector('#rr-go').addEventListener('click', start);

  // start when scrolled into view
  const io = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) { start(); io.disconnect(); }
  }, { threshold: 0.3 });
  io.observe(host);
})();

/* =====================================================================
 * Widget 5: timeline-explorer
 * Filterable, expandable map of the key Gaussian-splatting literature.
 * ===================================================================== */
(function timelineExplorer() {
  const host = document.getElementById('timeline-explorer');
  if (!host) return;

  const TRACKS = {
    foundations: { label: 'Foundations', color: '#e8d56a' },
    quality: { label: 'Quality & rendering', color: '#ff9b4a' },
    geometry: { label: 'Geometry & surfaces', color: '#6adfb8' },
    optimization: { label: 'Optimization', color: '#caa7ff' },
    dynamics: { label: 'Dynamics & video', color: '#5fa9ff' },
    generation: { label: 'Generation & feed-forward', color: '#e76a6a' },
    applications: { label: 'Applications', color: '#8fb56a' },
    compression: { label: 'Compression', color: '#a0a4b8' },
  };

  const PAPERS = [
    { t: 'EWA Volume Splatting', a: 'Zwicker, Pfister, van Baar, Gross', v: 'IEEE Vis 2001', d: '2001', tr: 'foundations',
      b: 'The mathematical bedrock: shows how a 3D Gaussian maps to a 2D Gaussian on screen through the affine approximation Σ\' = JWΣWᵀJᵀ, with correct anti-aliasing filtering. 3DGS lifts its projection formula directly from this 22-year-old point-graphics paper.' },
    { t: 'NeRF', a: 'Mildenhall et al.', v: 'ECCV 2020', d: '2020-03', tr: 'foundations', x: '2003.08934',
      b: 'Defined the problem 3DGS would later win: photorealistic novel view synthesis by optimizing a representation through differentiable volume rendering. Its alpha-compositing equation is exactly the one splatting reuses — only the sampling strategy differs.' },
    { t: 'Point-Based Neural Rendering', a: 'Kopanas, Philip, Leimkühler, Drettakis', v: 'EGSR 2021', d: '2021-06', tr: 'foundations',
      b: 'The same Inria group\'s earlier differentiable point-splatting work — 2D splats with per-view optimization. 3DGS is in a direct line of descent: replace planar splats needing normals with full 3D Gaussians, and remove the neural network from the loop.' },
    { t: 'Plenoxels', a: 'Fridovich-Keil, Yu et al.', v: 'CVPR 2022', d: '2021-12', tr: 'foundations', x: '2112.05131',
      b: 'Proved a radiance field needs no neural network: a sparse voxel grid with SH colors, optimized directly, trains in minutes. 3DGS borrows the no-network philosophy and the SH color model, swapping the rigid grid for free-floating anisotropic primitives.' },
    { t: 'Instant-NGP', a: 'Müller, Evans, Schied, Keller', v: 'SIGGRAPH 2022', d: '2022-01', tr: 'foundations', x: '2201.05989',
      b: 'Multiresolution hash grids + tiny MLP: NeRF training in seconds-to-minutes. Set the speed bar 3DGS had to beat, and remained the memory-efficiency champion 3DGS could not match (13–48 MB vs hundreds).' },
    { t: '3D Gaussian Splatting', a: 'Kerbl, Kopanas, Leimkühler, Drettakis', v: 'SIGGRAPH 2023', d: '2023-08', tr: 'foundations', x: '2308.04079', hot: true,
      b: 'The anchor of this post. Anisotropic 3D Gaussians + differentiable tile-based rasterizer + adaptive densification = Mip-NeRF360 quality at 134 fps. Became one of the most-cited graphics papers ever within two years.' },
    { t: 'Dynamic 3D Gaussians', a: 'Luiten, Kopanas, Leibe, Ramanan', v: '3DV 2024', d: '2023-08', tr: 'dynamics', x: '2308.09713',
      b: 'Persist the same Gaussians across frames, letting them move and rotate but keeping color/size fixed with local-rigidity losses. Dense 6-DoF tracking emerges for free — points stay attached to surfaces through occlusion. The "splats as particles" view starts here.' },
    { t: 'Deformable 3DGS', a: 'Yang, Gao et al.', v: 'CVPR 2024', d: '2023-09', tr: 'dynamics', x: '2309.13101',
      b: 'Canonical static splat scene + an MLP deformation field conditioned on time: monocular dynamic scenes with real-time playback. The canonical-plus-deformation pattern became the default recipe for splat video.' },
    { t: 'DreamGaussian', a: 'Tang et al.', v: 'ICLR 2024', d: '2023-09', tr: 'generation', x: '2309.16653',
      b: 'Text/image-to-3D via score distillation onto Gaussians instead of NeRF: generation drops from hours to ~2 minutes because each optimization step renders in milliseconds. Made splats the default canvas for 3D generation, with a mesh-extraction stage bolted on for usability.' },
    { t: '4D Gaussian Splatting', a: 'Wu et al.', v: 'CVPR 2024', d: '2023-10', tr: 'dynamics', x: '2310.08528',
      b: 'A shared HexPlane-style deformation field over a canonical splat set: 82 fps dynamic scene rendering. With Dynamic3DGS and Deformable-3DGS, established that volumetric video is a splat workload.' },
    { t: 'PhysGaussian', a: 'Xie et al.', v: 'CVPR 2024', d: '2023-11', tr: 'applications', x: '2311.12198',
      b: '"What you see is what you simulate": the Gaussians double as MPM material points, so physics runs directly on the rendering representation — no mesh, no proxy. Squish, twist, and shatter captured scenes with continuum mechanics.' },
    { t: 'SuGaR', a: 'Guédon, Lepetit', v: 'CVPR 2024', d: '2023-11', tr: 'geometry', x: '2311.12775',
      b: 'First serious answer to "splats have no surface": regularize Gaussians to be flat and aligned, then extract a mesh via Poisson reconstruction and optionally bind splats to its triangles. Made splat scenes editable in Blender-style tooling.' },
    { t: 'Mip-Splatting', a: 'Yu, Chen, Huang, Geiger', v: 'CVPR 2024 (best student paper)', d: '2023-11', tr: 'quality', x: '2311.16493',
      b: 'Vanilla 3DGS aliases badly when you zoom or change resolution: erosion and dilation artifacts. Fix: a 3D smoothing filter bounding each Gaussian\'s frequency by its training-view sampling rate, plus a 2D Mip filter replacing the fixed screen-space dilation. The de-facto standard for multi-scale rendering.' },
    { t: 'LightGaussian', a: 'Fan et al.', v: 'NeurIPS 2024', d: '2023-11', tr: 'compression', x: '2311.17245',
      b: 'Prune low-importance Gaussians, distill SH to lower degree, vector-quantize the rest: ~15× compression and 200+ fps with minimal quality loss. Opened the compression race that closed most of splatting\'s memory gap.' },
    { t: 'Compact 3DGS', a: 'Lee et al.', v: 'CVPR 2024', d: '2023-11', tr: 'compression', x: '2311.13681',
      b: 'Learnable masks to remove redundant Gaussians plus grid-based neural color and codebooks for geometry: ~25× smaller, faster rendering. With LightGaussian, established the standard compression toolbox (prune, quantize, share).' },
    { t: 'Scaffold-GS', a: 'Lu et al.', v: 'CVPR 2024', d: '2023-12', tr: 'optimization', x: '2312.00109',
      b: 'Anchors on a sparse voxel grid spawn local neural Gaussians decoded on the fly per view. Structure instead of anarchy: fewer floaters, better view-dependence, much smaller models — and the backbone for the HAC compression line.' },
    { t: 'SplaTAM', a: 'Keetha et al.', v: 'CVPR 2024', d: '2023-12', tr: 'applications', x: '2312.02126',
      b: 'First dense RGB-D SLAM with a splat map: camera tracking by differentiable rendering against the live map, mapping by densifying it. Silhouette-guided rendering tells the system what it hasn\'t seen yet. Splats enter robotics.' },
    { t: 'GaussianAvatars', a: 'Qian et al.', v: 'CVPR 2024', d: '2023-12', tr: 'applications', x: '2312.02069',
      b: 'Rig Gaussians to FLAME mesh triangles — each splat lives in a triangle\'s local frame and inherits its motion. Photoreal head avatars, reanimatable by expression parameters, at real-time rates. The template for "bind splats to a parametric model" avatar work.' },
    { t: 'Gaussian Splatting SLAM (MonoGS)', a: 'Matsuki, Murai, Kelly, Davison', v: 'CVPR 2024', d: '2023-12', tr: 'applications', x: '2312.06741',
      b: 'Monocular live SLAM at 3 fps directly on Gaussians, with analytic pose Jacobians through the rasterizer. Showed splats work as the sole scene representation for tracking, not just an offline reconstruction product.' },
    { t: 'pixelSplat', a: 'Charatan, Li, Tagliasacchi, Sitzmann', v: 'CVPR 2024', d: '2023-12', tr: 'generation', x: '2312.12337',
      b: 'The feed-forward turn: a network predicts Gaussians directly from two images in one pass — no per-scene optimization. Probabilistic depth prediction dodges local minima. Real-time scene-to-splats opened the door to generative pipelines.' },
    { t: 'LangSplat', a: 'Qin et al.', v: 'CVPR 2024', d: '2023-12', tr: 'applications', x: '2312.16084',
      b: 'Attach compressed CLIP features to each Gaussian: open-vocabulary 3D queries ("find the coffee mug") answered by rendering feature maps, 199× faster than the NeRF equivalent (LERF). The semantic-splats line — and robot-manipulation follow-ups — start here.' },
    { t: 'Self-Organizing Gaussians', a: 'Morgenstern et al.', v: 'ECCV 2024', d: '2023-12', tr: 'compression', x: '2312.13299',
      b: 'Sort the unordered Gaussian list into a 2D grid where neighbors have similar attributes, then compress with off-the-shelf image codecs. Splat scenes become PNGs — a wonderfully lateral take on compression (and the trick behind the .sog format).' },
    { t: 'Street Gaussians', a: 'Yan et al.', v: 'ECCV 2024', d: '2024-01', tr: 'applications', x: '2401.01339',
      b: 'Urban driving scenes as compositional splats: static background plus per-vehicle Gaussian sets on tracked poses (optimized to fix noisy trackers). 135 fps rendering, scene editing by moving cars around — the blueprint for splat-based AV simulation.' },
    { t: 'StopThePop', a: 'Radl et al.', v: 'SIGGRAPH 2024', d: '2024-02', tr: 'quality', x: '2402.00525',
      b: 'Attacks the popping artifact at its root — the per-tile global sort — with hierarchical per-pixel re-sorting that stays real-time. View-consistency restored; rotating the camera no longer makes splats flicker past each other.' },
    { t: 'LGM (Large Gaussian Model)', a: 'Tang et al.', v: 'ECCV 2024', d: '2024-02', tr: 'generation', x: '2402.05054',
      b: 'High-res text/image-to-3D in ~5 seconds: a multi-view diffusion model generates four views, an asymmetric U-Net maps them to Gaussians. The "big model predicts splats" recipe at scale, ancestor of today\'s 3D-native generative models.' },
    { t: 'MVSplat', a: 'Chen et al.', v: 'ECCV 2024 (oral)', d: '2024-03', tr: 'generation', x: '2403.14627',
      b: 'Feed-forward splats done with classical rigor: build cost volumes across views, predict depth + Gaussians with 10× fewer parameters than pixelSplat and better cross-dataset generalization. Geometry priors beat brute force for sparse-view prediction.' },
    { t: 'HAC', a: 'Chen et al.', v: 'ECCV 2024', d: '2024-03', tr: 'compression', x: '2403.14530',
      b: 'Hash-grid assisted context modeling for entropy-coding Scaffold-GS anchors: 75× size reduction over vanilla 3DGS. State-of-the-art rate–distortion; splat scenes now ship in single-digit megabytes.' },
    { t: '2D Gaussian Splatting', a: 'Huang, Yu, Chen, Geiger, Gao', v: 'SIGGRAPH 2024', d: '2024-03', tr: 'geometry', x: '2403.17888',
      b: 'Collapse the ellipsoids into oriented 2D disks (surfels) with exact ray-splat intersection, plus depth-distortion and normal-consistency losses. Slightly softer images, dramatically better surfaces — the geometry-first fork of splatting.' },
    { t: '3DGS-MCMC', a: 'Kheradmand et al.', v: 'NeurIPS 2024', d: '2024-04', tr: 'optimization', x: '2404.09591',
      b: 'Reinterprets training as sampling: Gaussians are SGLD samples from a scene-likelihood distribution, clone/split heuristics become principled state transitions, and exploration comes from injected noise. Cleaner results with a fixed Gaussian budget, and the closest thing to a theory of densification.' },
    { t: 'Gaussian Opacity Fields', a: 'Yu, Sattler, Geiger', v: 'SIGGRAPH Asia 2024', d: '2024-04', tr: 'geometry', x: '2404.10772',
      b: 'Defines a proper opacity field from the splats via ray-Gaussian intersection, enabling direct level-set surface extraction (tetrahedral marching) without Poisson or TSDF. Best-of-both: 3DGS rendering quality with mesh-grade geometry, including unbounded backgrounds.' },
    { t: '3D Gaussian Ray Tracing', a: 'Moenne-Loccoz, Mirzaei et al. (NVIDIA)', v: 'SIGGRAPH Asia 2024', d: '2024-07', tr: 'quality', x: '2407.07090',
      b: 'Replace rasterization with RT-core ray tracing against a BVH of splat proxies: exact per-ray sorting (no popping), plus shadows, reflections, depth-of-field, and sensor distortion — fisheye and rolling-shutter cameras for robotics/AV sim. Splats join the ray-tracing ecosystem.' },
    { t: 'gsplat', a: 'Ye et al. (Nerfstudio team)', v: 'JMLR 2025', d: '2024-09', tr: 'quality', x: '2409.06765',
      b: 'The open-source CUDA/PyTorch library that became the field\'s reference implementation: faster and leaner than the original (up to ~4× less memory), with absgrad densification, Mip-Splatting anti-aliasing, and pose optimization built in. Infrastructure, not a method — and arguably as influential as any method.' },
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
