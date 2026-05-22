/* Flow Equivariant World Models blog interactive widgets. Plain JS / Canvas. No deps.
 *
 * Conventions:
 *   - One IIFE per widget.
 *   - Always check `host` exists before doing anything.
 *   - Use `devicePx` for canvases that use fillRect/stroke/text (crisp 2x).
 *   - Read CSS vars via `cssVar('--accent')` so theming follows the user's choice.
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
    // Re-trigger redraws of all widgets that listen.
    window.dispatchEvent(new Event('themechange'));
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
function drawArrow(ctx, x1, y1, x2, y2, color, width = 2, headLen = 6) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-headLen, -headLen * 0.55);
  ctx.lineTo(-headLen, headLen * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function drawDot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

/* =====================================================================
 * Widget 1: flow-composition
 * Two sliders pick the internal flow ν and agent action a_t.
 * Canvas draws ψ_1(ν - a_t) as an arrow field on a grid.
 * When ν = a_t, the field is zero — the channel "doesn't move".
 * ===================================================================== */
(function flowComposition() {
  const host = document.getElementById('flow-composition');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="fcCanvas"></canvas>
      <div class="controls">
        <div>
          <label>Internal flow $\\nu$&nbsp;<span id="fcNuLabel"></span></label>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-family:var(--mono);font-size:11px;color:var(--fg-mute);">x</span>
            <input type="range" id="fcNuX" min="-1" max="1" step="0.05" value="0.6"/>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-family:var(--mono);font-size:11px;color:var(--fg-mute);">y</span>
            <input type="range" id="fcNuY" min="-1" max="1" step="0.05" value="0.0"/>
          </div>
        </div>
        <div>
          <label>Agent action $a_t$&nbsp;<span id="fcAtLabel"></span></label>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-family:var(--mono);font-size:11px;color:var(--fg-mute);">x</span>
            <input type="range" id="fcAtX" min="-1" max="1" step="0.05" value="0.0"/>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-family:var(--mono);font-size:11px;color:var(--fg-mute);">y</span>
            <input type="range" id="fcAtY" min="-1" max="1" step="0.05" value="0.0"/>
          </div>
        </div>
        <div class="readout" id="fcReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#fcCanvas');
  const ctx = devicePx(cv, 440, 440);
  const W = 440, H = 440;
  const nuX = host.querySelector('#fcNuX');
  const nuY = host.querySelector('#fcNuY');
  const atX = host.querySelector('#fcAtX');
  const atY = host.querySelector('#fcAtY');
  const nuLab = host.querySelector('#fcNuLabel');
  const atLab = host.querySelector('#fcAtLabel');
  const readout = host.querySelector('#fcReadout');

  function draw() {
    const accent = cssVar('--accent') || '#c64f24';
    const rule = cssVar('--rule') || '#e6e4dd';
    const fg = cssVar('--fg') || '#222';
    const fgMute = cssVar('--fg-mute') || '#888';
    const bgCard = cssVar('--bg-card') || '#f1f0eb';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    // grid
    const n = 7;
    const pad = 30;
    const stepPx = (W - 2 * pad) / (n - 1);

    // light grid lines
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const x = pad + i * stepPx;
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, x); ctx.lineTo(W - pad, x); ctx.stroke();
    }

    const nx = parseFloat(nuX.value), ny = parseFloat(nuY.value);
    const ax = parseFloat(atX.value), ay = parseFloat(atY.value);
    const cx = nx - ax, cy = ny - ay;

    // arrows everywhere
    const scale = 36;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = pad + i * stepPx;
        const y = pad + j * stepPx;
        const ex = x + cx * scale, ey = y - cy * scale;
        if (Math.hypot(cx, cy) < 0.04) {
          drawDot(ctx, x, y, 2.5, fgMute);
        } else {
          drawArrow(ctx, x, y, ex, ey, accent, 1.6, 5);
        }
      }
    }

    // origin indicator with two component arrows
    const ox = W / 2, oy = H / 2;
    const big = 90;
    // nu (blue)
    drawArrow(ctx, ox, oy, ox + nx * big, oy - ny * big, '#5fa9ff', 3, 8);
    // a_t (green)
    drawArrow(ctx, ox, oy, ox + ax * big, oy - ay * big, '#56c270', 3, 8);
    // combined
    drawArrow(ctx, ox, oy, ox + cx * big, oy - cy * big, accent, 3, 9);

    ctx.font = "600 12px ui-sans-serif, system-ui";
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.fillText("ψ₁(ν − aₜ)", W / 2, H - 9);

    // legend in corner
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5fa9ff'; ctx.fillRect(10, 12, 14, 3); ctx.fillText("ν (internal)", 28, 18);
    ctx.fillStyle = '#56c270'; ctx.fillRect(10, 28, 14, 3); ctx.fillText("aₜ (action)", 28, 34);
    ctx.fillStyle = accent;    ctx.fillRect(10, 44, 14, 3); ctx.fillText("ν − aₜ (combined)", 28, 50);

    nuLab.innerHTML = `= <code>(${nx.toFixed(2)}, ${ny.toFixed(2)})</code>`;
    atLab.innerHTML = `= <code>(${ax.toFixed(2)}, ${ay.toFixed(2)})</code>`;
    const mag = Math.hypot(cx, cy);
    const zero = mag < 0.04 ? ' ← <b style="color:var(--accent);">zero!</b>' : '';
    readout.innerHTML =
      `ν − aₜ = <b>(${cx.toFixed(2)}, ${cy.toFixed(2)})</b>${zero}<br>` +
      `‖flow‖ = <b>${mag.toFixed(3)}</b>`;
  }

  [nuX, nuY, atX, atY].forEach(s => s.addEventListener('input', draw));
  window.addEventListener('themechange', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: velocity-channels-demo
 * A 1D world with a ball moving at true velocity ν*. The hidden state has
 * K velocity channels stacked vertically; each channel shifts its own copy of
 * the ball at its own ν. After many steps only the channel with ν = ν* still
 * has the ball pinned at the true position.
 * ===================================================================== */
(function velocityChannels() {
  const host = document.getElementById('velocity-channels-demo');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="vcCanvas"></canvas>
      <div class="controls">
        <div>
          <label>True object velocity $\\nu^\\star$</label>
          <input type="range" id="vcTrue" min="-3" max="3" step="1" value="2"/>
        </div>
        <div>
          <label>Time step $t$</label>
          <input type="range" id="vcT" min="0" max="20" step="1" value="0"/>
        </div>
        <div class="readout" id="vcReadout"></div>
        <div style="display:flex;gap:6px;">
          <button class="btn" id="vcPlay">▶ play</button>
          <button class="btn" id="vcReset">reset</button>
        </div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#vcCanvas');
  const W = 440, H = 528;
  const ctx = devicePx(cv, W, H);
  const trueSlider = host.querySelector('#vcTrue');
  const tSlider = host.querySelector('#vcT');
  const readout = host.querySelector('#vcReadout');
  const playBtn = host.querySelector('#vcPlay');
  const resetBtn = host.querySelector('#vcReset');

  // channel velocities (7 channels symmetric around 0)
  const channels = [-3, -2, -1, 0, 1, 2, 3];
  let playing = false;

  function wrap(x, lo, hi) {
    const w = hi - lo;
    let v = ((x - lo) % w + w) % w + lo;
    return v;
  }

  function draw() {
    const rule = cssVar('--rule') || '#ddd';
    const fg = cssVar('--fg') || '#222';
    const fgMute = cssVar('--fg-mute') || '#888';
    const bgCard = cssVar('--bg-card') || '#f1f0eb';
    const accent = cssVar('--accent') || '#c64f24';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    const padL = 70, padR = 20, padT = 60, padB = 28;
    const worldW = W - padL - padR;
    const rowH = (H - padT - padB) / (channels.length + 1.5);

    const nuStar = parseInt(trueSlider.value);
    const t = parseInt(tSlider.value);

    // True world ball position at time t (with wrap)
    const worldRangeL = -10, worldRangeR = 10;
    const ballInit = -5;
    const wrapPx = (x) => {
      const xw = wrap(x, worldRangeL, worldRangeR);
      const f = (xw - worldRangeL) / (worldRangeR - worldRangeL);
      return padL + f * worldW;
    };

    // Header: "TRUE WORLD" row at top
    ctx.font = "600 12px ui-sans-serif, system-ui";
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.fillText("True world", 10, padT - 26);
    ctx.fillStyle = fgMute;
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.fillText(`ν⋆ = ${nuStar},  t = ${t}`, 110, padT - 26);

    ctx.fillStyle = fg;
    ctx.font = "600 12px ui-sans-serif, system-ui";
    ctx.fillText("Velocity channels (hidden state)", 10, padT - 7);

    // True world strip
    const worldY = padT;
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(padL, worldY, worldW, rowH * 0.7);
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.strokeRect(padL, worldY, worldW, rowH * 0.7);
    // ball at true position
    const truePos = wrapPx(ballInit + nuStar * t);
    drawDot(ctx, truePos, worldY + rowH * 0.35, 7, '#ffd24a');
    // velocity arrow on ball
    if (nuStar !== 0) {
      const sign = Math.sign(nuStar);
      drawArrow(ctx, truePos + sign * 8, worldY + rowH * 0.35,
                truePos + sign * 22, worldY + rowH * 0.35, '#ffd24a', 1.5, 5);
    }

    // Hidden state: K rows
    const rowsTop = padT + rowH * 1.2;
    for (let k = 0; k < channels.length; k++) {
      const nu = channels[k];
      const y = rowsTop + k * rowH;
      const matches = (nu === nuStar);

      ctx.fillStyle = matches ? '#1f2a1d' : '#0a0c10';
      ctx.fillRect(padL, y, worldW, rowH * 0.7);
      ctx.strokeStyle = matches ? '#56c270' : rule;
      ctx.lineWidth = matches ? 2 : 1;
      ctx.strokeRect(padL, y, worldW, rowH * 0.7);

      // Channel label
      ctx.fillStyle = matches ? '#8be07a' : fgMute;
      ctx.font = (matches ? '700 ' : '') + "11px ui-sans-serif, system-ui";
      ctx.textAlign = 'right';
      ctx.fillText(`ν=${nu >= 0 ? '+' : ''}${nu}`, padL - 6, y + rowH * 0.42);

      // Ball position in this channel:
      // The encoder wrote the ball at the (windowed) position at t=0,
      // then this channel has flowed it by ψ_t(nu) = nu*t per step
      // The ball appears at (ballInit + nu * t)
      const bx = wrapPx(ballInit + nu * t);
      drawDot(ctx, bx, y + rowH * 0.35, 6, matches ? '#ffd24a' : fgMute);

      // Tiny flow arrows along the channel showing direction
      if (nu !== 0) {
        ctx.strokeStyle = matches ? '#56c270' : '#666';
        ctx.lineWidth = 1;
        const sign = Math.sign(nu);
        for (let i = 0; i < 5; i++) {
          const ax = padL + 30 + i * (worldW - 60) / 4;
          drawArrow(ctx, ax - sign * 5, y + rowH * 0.6 + 4,
                        ax + sign * 5, y + rowH * 0.6 + 4,
                        matches ? '#56c270' : '#555', 1, 3);
        }
      }
    }

    // Note at bottom
    ctx.font = "italic 11px ui-sans-serif, system-ui";
    ctx.fillStyle = fgMute;
    ctx.textAlign = 'center';
    ctx.fillText("The channel where ν matches ν⋆ keeps the ball aligned with the world.",
                 W / 2, H - 8);

    // Readout
    const wrong = channels.filter(n => n !== nuStar).length;
    readout.innerHTML =
      `Step <b>${t}</b> &nbsp;|&nbsp; true ν⋆ = <b>${nuStar}</b><br>` +
      `<span style="color:#8be07a">1 channel aligned</span>, ` +
      `<span style="color:var(--fg-mute)">${wrong} drifted</span>`;
  }

  trueSlider.addEventListener('input', draw);
  tSlider.addEventListener('input', draw);
  window.addEventListener('themechange', draw);

  resetBtn.addEventListener('click', () => {
    tSlider.value = 0; draw();
  });

  let intv = null;
  function tickPlay() {
    if (!playing) return;
    let cur = parseInt(tSlider.value);
    cur = (cur + 1) % 21;
    tSlider.value = cur;
    draw();
  }
  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '⏸ pause' : '▶ play';
    if (playing) {
      intv = setInterval(tickPlay, 500);
    } else if (intv) {
      clearInterval(intv); intv = null;
    }
  });

  draw();
})();

/* =====================================================================
 * Widget 3: self-motion-equivariance
 * Two side-by-side latent maps. User drives the agent. Left = naive (writes to
 * a fixed image-frame cell, world fragments). Right = FloWM (map shifts with
 * action, so same world cell always lives at the same place).
 * ===================================================================== */
(function selfMotionEq() {
  const host = document.getElementById('self-motion-equivariance');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <div>
        <div class="panels">
          <div>
            <p class="panel-lbl">Naive memory <span style="color:var(--fg-mute);">(no SME)</span></p>
            <canvas id="smeNaive"></canvas>
          </div>
          <div>
            <p class="panel-lbl">FloWM <span style="color:var(--fg-mute);">(with SME)</span></p>
            <canvas id="smeFlow"></canvas>
          </div>
        </div>
      </div>
      <div class="controls">
        <div>
          <label>Drive the agent</label>
          <div class="dpad" id="smeDpad">
            <button class="blank"></button>
            <button data-dir="up">↑</button>
            <button class="blank"></button>
            <button data-dir="left">←</button>
            <button data-dir="rot">⟳</button>
            <button data-dir="right">→</button>
            <button class="blank"></button>
            <button data-dir="down">↓</button>
            <button class="blank"></button>
          </div>
        </div>
        <div class="readout" id="smeReadout"></div>
        <div style="display:flex;gap:6px;">
          <button class="btn" id="smeAuto">▶ auto-tour</button>
          <button class="btn" id="smeReset">reset</button>
        </div>
        <p style="font-size:11px;color:var(--fg-mute);margin:6px 0 0;">
          Watch each map as you move. The FloWM map shifts so that the same world
          location always lands in the same cell; the naive map fragments because
          it stores whatever pixel the agent currently sees, in whatever slot.
        </p>
      </div>
    </div>
    <div class="dpad" id="smeDpadStyle" style="display:none;">
      <!-- kept for css selector -->
    </div>
  `);

  const Wn = host.querySelector('#smeNaive');
  const Wf = host.querySelector('#smeFlow');
  const W = 260, H = 260;
  const ctxN = devicePx(Wn, W, H);
  const ctxF = devicePx(Wf, W, H);
  const readout = host.querySelector('#smeReadout');
  const dpad = host.querySelector('#smeDpad');
  const autoBtn = host.querySelector('#smeAuto');
  const resetBtn = host.querySelector('#smeReset');

  // True world: a grid with 5 colored objects at fixed positions
  const worldSize = 7;
  const worldObjects = [
    { x: 1, y: 1, c: '#ff7a7a' },
    { x: 5, y: 2, c: '#56c270' },
    { x: 3, y: 4, c: '#ffd24a' },
    { x: 6, y: 6, c: '#5fa9ff' },
    { x: 0, y: 5, c: '#c97bff' },
  ];

  // FoV: 3x3 wedge in front of the agent
  let state = {
    ax: 3, ay: 3,   // agent (in world coords)
    rot: 0,         // 0=up, 1=right, 2=down, 3=left
    // Naive memory: 7x7 grid that gets written to wherever the agent's image
    // FoV lands in a *fixed* image frame (always writes the same 3x3 image patch
    // into the same 3x3 memory cells in the top of the memory grid).
    naive: Array.from({ length: worldSize * worldSize }, () => null),
    // FloWM memory: 7x7 grid (same coords as world). Write to world coords.
    flow:  Array.from({ length: worldSize * worldSize }, () => null),
  };

  function fovCells(s) {
    // Return list of world-cell coords visible to the agent (3x3 wedge in front)
    const cells = [];
    // 3 cells in the "forward" direction, 3 wide
    const fwd = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
    ][s.rot];
    const side = [
      [1, 0], [0, 1], [-1, 0], [0, -1],
    ][s.rot];
    for (let d = 0; d < 3; d++) {
      for (let w = -1; w <= 1; w++) {
        const cx = s.ax + fwd[0] * d + side[0] * w;
        const cy = s.ay + fwd[1] * d + side[1] * w;
        if (cx >= 0 && cx < worldSize && cy >= 0 && cy < worldSize) {
          cells.push([cx, cy]);
        }
      }
    }
    return cells;
  }

  function colorAtWorld(wx, wy) {
    for (const o of worldObjects) {
      if (o.x === wx && o.y === wy) return o.c;
    }
    return null;
  }

  function writeMemories() {
    const cells = fovCells(state);
    for (const [wx, wy] of cells) {
      const c = colorAtWorld(wx, wy);
      // FloWM: store at world coords
      state.flow[wy * worldSize + wx] = c || '#1a1c22';
      // Naive: store at *image-frame* coords. The image-frame coords are
      // computed by walking the FoV "in agent's frame": the agent always
      // sees cell (1,0) in front, (1,1) front-right, etc.
      // We translate the visited cell into image-frame coords and store there
      // (which always lands in the same 3x3 patch of the memory regardless of
      // where the agent is). This is the "no SME" failure mode — overwrite.
    }
    // For naive memory, do it separately for clarity
    // We simulate: naive memory always writes the current observation pixel
    // into the same 3x3 patch at the top-center of the memory grid.
    const naivePatchOffsetX = 2;  // image frame center column for the patch
    const naivePatchOffsetY = 1;
    // Find cells in the FoV expressed in image-frame (agent-relative) coords
    for (let d = 0; d < 3; d++) {
      for (let w = -1; w <= 1; w++) {
        const fwd = [
          [0, -1], [1, 0], [0, 1], [-1, 0],
        ][state.rot];
        const side = [
          [1, 0], [0, 1], [-1, 0], [0, -1],
        ][state.rot];
        const wx = state.ax + fwd[0] * d + side[0] * w;
        const wy = state.ay + fwd[1] * d + side[1] * w;
        if (wx >= 0 && wx < worldSize && wy >= 0 && wy < worldSize) {
          const c = colorAtWorld(wx, wy);
          // image-frame coords: (d, w) in {0,1,2}x{-1,0,1}
          const ix = naivePatchOffsetX + w;
          const iy = naivePatchOffsetY + d;
          if (ix >= 0 && ix < worldSize && iy >= 0 && iy < worldSize) {
            state.naive[iy * worldSize + ix] = c || '#1a1c22';
          }
        }
      }
    }
  }

  function draw() {
    const fg = cssVar('--fg') || '#222';
    const fgMute = cssVar('--fg-mute') || '#888';
    const bgCard = cssVar('--bg-card') || '#f1f0eb';
    const rule = cssVar('--rule') || '#ddd';

    function paint(ctx, mem) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = bgCard;
      ctx.fillRect(0, 0, W, H);
      const cell = W / (worldSize + 1);
      const offsetX = cell / 2, offsetY = cell / 2;
      for (let y = 0; y < worldSize; y++) {
        for (let x = 0; x < worldSize; x++) {
          const px = offsetX + x * cell;
          const py = offsetY + y * cell;
          ctx.fillStyle = '#0a0c10';
          ctx.fillRect(px, py, cell - 2, cell - 2);
          ctx.strokeStyle = rule;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, cell - 2, cell - 2);
          const c = mem[y * worldSize + x];
          if (c && c !== '#1a1c22') {
            drawDot(ctx, px + cell / 2, py + cell / 2, cell * 0.32, c);
          } else if (c === '#1a1c22') {
            ctx.fillStyle = '#1a1c22';
            ctx.fillRect(px + 2, py + 2, cell - 6, cell - 6);
          }
        }
      }
    }

    paint(ctxN, state.naive);
    paint(ctxF, state.flow);

    // Overlay agent + FoV on FloWM canvas (which is in world coords)
    const cell = W / (worldSize + 1);
    const offsetX = cell / 2, offsetY = cell / 2;
    const ax = offsetX + (state.ax + 0.5) * cell - 1;
    const ay = offsetY + (state.ay + 0.5) * cell - 1;
    drawDot(ctxF, ax, ay, cell * 0.18, '#ff6b8a');
    // FoV wedge on FloWM (world coords)
    ctxF.fillStyle = 'rgba(255,107,138,0.18)';
    ctxF.strokeStyle = '#ff6b8a';
    ctxF.lineWidth = 1.2;
    const fovs = fovCells(state);
    for (const [wx, wy] of fovs) {
      const px = offsetX + wx * cell;
      const py = offsetY + wy * cell;
      ctxF.fillRect(px, py, cell - 2, cell - 2);
      ctxF.strokeRect(px, py, cell - 2, cell - 2);
    }

    // Naive: agent always shown at the top-center (image frame)
    const ax2 = offsetX + (3 + 0.5) * cell - 1;
    const ay2 = offsetY + (0 + 0.5) * cell - 1;
    drawDot(ctxN, ax2, ay2, cell * 0.18, '#ff6b8a');
    ctxN.fillStyle = 'rgba(255,107,138,0.18)';
    ctxN.strokeStyle = '#ff6b8a';
    ctxN.lineWidth = 1.2;
    for (let d = 0; d < 3; d++) {
      for (let w = -1; w <= 1; w++) {
        const ix = 3 + w, iy = 1 + d;
        const px = offsetX + ix * cell;
        const py = offsetY + iy * cell;
        ctxN.fillRect(px, py, cell - 2, cell - 2);
        ctxN.strokeRect(px, py, cell - 2, cell - 2);
      }
    }

    const dirLbl = ['up', 'right', 'down', 'left'][state.rot];
    readout.innerHTML =
      `agent at <b>(${state.ax}, ${state.ay})</b> facing <b>${dirLbl}</b><br>` +
      `naive memory filled cells: <b>${state.naive.filter(c => c !== null).length}</b><br>` +
      `flow memory filled cells: <b>${state.flow.filter(c => c !== null).length}</b>`;
  }

  function move(dir) {
    if (dir === 'rot') { state.rot = (state.rot + 1) % 4; }
    else {
      const dx = { up: 0, down: 0, left: -1, right: 1 }[dir];
      const dy = { up: -1, down: 1, left: 0, right: 0 }[dir];
      const nx = state.ax + dx, ny = state.ay + dy;
      if (nx >= 0 && nx < worldSize && ny >= 0 && ny < worldSize) {
        state.ax = nx; state.ay = ny;
      }
    }
    writeMemories();
    draw();
  }

  dpad.querySelectorAll('button[data-dir]').forEach(b => {
    b.addEventListener('click', () => move(b.dataset.dir));
  });
  document.addEventListener('keydown', (e) => {
    // Only act if cursor is over our widget
    const r = host.getBoundingClientRect();
    const inView = r.top < window.innerHeight && r.bottom > 0;
    if (!inView) return;
    const key = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', r: 'rot' }[e.key];
    if (key) { move(key); e.preventDefault(); }
  });

  resetBtn.addEventListener('click', () => {
    state.naive.fill(null);
    state.flow.fill(null);
    state.ax = 3; state.ay = 3; state.rot = 0;
    writeMemories();
    draw();
  });

  let autoInt = null;
  let autoOn = false;
  autoBtn.addEventListener('click', () => {
    autoOn = !autoOn;
    autoBtn.textContent = autoOn ? '⏸ stop tour' : '▶ auto-tour';
    if (autoOn) {
      const seq = ['right', 'right', 'down', 'down', 'rot', 'left', 'left', 'rot',
                   'up', 'up', 'rot', 'right', 'down', 'right', 'rot', 'rot'];
      let i = 0;
      autoInt = setInterval(() => {
        move(seq[i % seq.length]);
        i++;
      }, 420);
    } else if (autoInt) {
      clearInterval(autoInt); autoInt = null;
    }
  });

  window.addEventListener('themechange', draw);

  // initial write
  writeMemories();
  draw();
})();

/* =====================================================================
 * Widget 4: rollout-race
 * MSE-per-timestep plot reproducing the headline result. Toggle which models
 * to show. Slider drags the "current timestep" marker; the readout shows MSE
 * for each model at that step. Dashed line marks training horizon.
 * ===================================================================== */
(function rolloutRace() {
  const host = document.getElementById('rollout-race');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rrCanvas"></canvas>
      <div class="controls">
        <div>
          <label>Timestep $t$</label>
          <input type="range" id="rrT" min="0" max="200" step="1" value="100"/>
        </div>
        <div class="legend" id="rrLegend"></div>
        <div class="toggle-row" id="rrToggle">
          <button class="on" data-key="flowm">FloWM</button>
          <button class="on" data-key="flowm_novc">FloWM (no VC)</button>
          <button class="on" data-key="dfot_ssm">DFoT-SSM</button>
          <button class="on" data-key="dfot">DFoT</button>
          <button class="on" data-key="black">all-black</button>
        </div>
        <div class="readout" id="rrReadout"></div>
        <p style="font-size:11px;color:var(--fg-mute);margin:6px 0 0;">
          Approximated from Table 1 + Figure 5b of the paper. Dashed line is the
          training horizon ($t = 69$); everything to the right is length
          extrapolation.
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#rrCanvas');
  const W = 520, H = 290;
  const ctx = devicePx(cv, W, H);
  const tSlider = host.querySelector('#rrT');
  const readout = host.querySelector('#rrReadout');
  const legendEl = host.querySelector('#rrLegend');
  const toggleEl = host.querySelector('#rrToggle');

  // Anchor MSEs at t=20 and t=150 (from Table 1).
  // Interpolate / extrapolate plausibly to draw smooth curves.
  // anchors: t=0 -> 0, t=69 (training horizon), t=200 cap
  // Use a soft saturation: m(t) = a*(1 - exp(-t/τ)) for each model
  const models = {
    flowm: {
      label: 'FloWM (ours)',
      color: '#56c270',
      m20: 0.0005, m150: 0.0018,
    },
    flowm_novc: {
      label: 'FloWM (no VC)',
      color: '#ffd24a',
      m20: 0.0041, m150: 0.0334,
    },
    dfot_ssm: {
      label: 'DFoT-SSM',
      color: '#9bd3ff',
      m20: 0.1277, m150: 0.1688,
    },
    dfot: {
      label: 'DFoT',
      color: '#ff7a7a',
      m20: 0.1448, m150: 0.2111,
    },
    black: {
      label: 'all-black baseline',
      color: '#7a7a82',
      m20: 0.1656, m150: 0.1654,
    },
  };
  // Fit each curve: m(t) = a*(1 - exp(-t/tau))
  // Given m20 and m150, solve: m150/m20 = (1 - e^{-150/tau}) / (1 - e^{-20/tau})
  // Use a quick numerical solve.
  function fitCurve(m20, m150) {
    const ratio = m150 / m20;
    // search tau in log space
    let bestTau = 30, bestErr = Infinity;
    for (let tau = 5; tau <= 1000; tau *= 1.04) {
      const r = (1 - Math.exp(-150 / tau)) / (1 - Math.exp(-20 / tau));
      const e = Math.abs(r - ratio);
      if (e < bestErr) { bestErr = e; bestTau = tau; }
    }
    const a = m20 / (1 - Math.exp(-20 / bestTau));
    return { a, tau: bestTau };
  }
  for (const k of Object.keys(models)) {
    const f = fitCurve(models[k].m20, models[k].m150);
    models[k].a = f.a; models[k].tau = f.tau;
    models[k].mse = (t) => Math.max(0, f.a * (1 - Math.exp(-t / f.tau)));
  }

  // Render legend
  legendEl.innerHTML = '';
  for (const k of Object.keys(models)) {
    const m = models[k];
    legendEl.insertAdjacentHTML('beforeend',
      `<span><i style="background:${m.color};"></i> ${m.label}</span>`);
  }

  let visible = { flowm: true, flowm_novc: true, dfot_ssm: true, dfot: true, black: true };

  toggleEl.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.key;
      visible[k] = !visible[k];
      b.classList.toggle('on', visible[k]);
      draw();
    });
  });

  function draw() {
    const fg = cssVar('--fg') || '#222';
    const fgMute = cssVar('--fg-mute') || '#888';
    const bgCard = cssVar('--bg-card') || '#f1f0eb';
    const rule = cssVar('--rule') || '#ddd';

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bgCard;
    ctx.fillRect(0, 0, W, H);

    const padL = 50, padR = 20, padT = 14, padB = 32;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const yMax = 0.25;
    const xMax = 200;
    const x2px = (t) => padL + (t / xMax) * plotW;
    const y2px = (m) => padT + (1 - m / yMax) * plotH;

    // y gridlines
    ctx.strokeStyle = rule; ctx.lineWidth = 0.5;
    ctx.fillStyle = fgMute; ctx.font = "10px ui-sans-serif, system-ui"; ctx.textAlign = 'right';
    for (let y = 0; y <= 0.25; y += 0.05) {
      const py = y2px(y);
      ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(W - padR, py); ctx.stroke();
      ctx.fillText(y.toFixed(2), padL - 6, py + 3);
    }
    ctx.textAlign = 'center';
    for (let x = 0; x <= xMax; x += 50) {
      const px = x2px(x);
      ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, padT + plotH); ctx.stroke();
      ctx.fillText(x.toString(), px, padT + plotH + 14);
    }

    // axes labels
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = fg;
    ctx.font = "600 11px ui-sans-serif, system-ui";
    ctx.textAlign = 'center';
    ctx.fillText("MSE per frame", 0, 0);
    ctx.restore();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.fillText("Timestep t", padL + plotW / 2, H - 6);

    // training horizon line (t=69)
    const trainEnd = x2px(69);
    ctx.strokeStyle = fgMute; ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(trainEnd, padT); ctx.lineTo(trainEnd, padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.fillStyle = fgMute;
    ctx.textAlign = 'left';
    ctx.fillText("← train horizon", trainEnd + 4, padT + 12);

    // curves
    for (const k of Object.keys(models)) {
      if (!visible[k]) continue;
      const m = models[k];
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let t = 0; t <= xMax; t += 2) {
        const v = m.mse(t);
        const px = x2px(t), py = y2px(Math.min(v, yMax));
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // current t marker
    const curT = parseInt(tSlider.value);
    const markPx = x2px(curT);
    ctx.strokeStyle = cssVar('--accent') || '#c64f24';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(markPx, padT); ctx.lineTo(markPx, padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
    // dots at intersections
    for (const k of Object.keys(models)) {
      if (!visible[k]) continue;
      const m = models[k];
      const v = Math.min(m.mse(curT), yMax);
      drawDot(ctx, markPx, y2px(v), 4, m.color);
    }

    // readout
    let rows = '';
    for (const k of Object.keys(models)) {
      if (!visible[k]) continue;
      const m = models[k];
      const v = m.mse(curT);
      rows += `<div style="color:${m.color};">${m.label}: <b>${v.toFixed(4)}</b></div>`;
    }
    readout.innerHTML = `t = <b>${curT}</b><br>` + rows;
  }

  tSlider.addEventListener('input', draw);
  window.addEventListener('themechange', draw);
  draw();
})();

/* =====================================================================
 * Widget 5: po-sim
 * Live MNIST-World-style sim. Wrap-around 2D canvas with N moving "digits"
 * (drawn as colored squares with letter labels). Movable FoV; agent can pan
 * with arrow buttons. Toggle to reveal the full world.
 * ===================================================================== */
(function poSim() {
  const host = document.getElementById('po-sim');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="poCanvas"></canvas>
      <div class="controls">
        <div>
          <label>Pan the agent</label>
          <div class="dpad" id="poDpad">
            <button class="blank"></button>
            <button data-d="up">↑</button>
            <button class="blank"></button>
            <button data-d="left">←</button>
            <button data-d="stop">·</button>
            <button data-d="right">→</button>
            <button class="blank"></button>
            <button data-d="down">↓</button>
            <button class="blank"></button>
          </div>
        </div>
        <div class="toggle-row" id="poToggle">
          <button class="on" data-key="play">▶ playing</button>
          <button data-key="reveal">show full world</button>
          <button data-key="vels">show velocities</button>
        </div>
        <div class="readout" id="poReadout"></div>
        <p style="font-size:11px;color:var(--fg-mute);margin:6px 0 0;">
          The agent only sees the highlighted window. The digits keep drifting
          even when they leave the view. The world wraps. This is exactly the
          input setting the paper studies.
        </p>
      </div>
    </div>
  `);

  const cv = host.querySelector('#poCanvas');
  const W = 440, H = 440;
  const ctx = devicePx(cv, W, H);
  const readout = host.querySelector('#poReadout');
  const dpad = host.querySelector('#poDpad');
  const toggleEl = host.querySelector('#poToggle');

  const worldSize = 100;
  const fovSize = 40;
  // digits
  function rng() { return Math.random(); }
  const digits = [
    { label: '3', color: '#ffd24a', x: 20, y: 30, vx:  0.6, vy:  0.3 },
    { label: '7', color: '#5fa9ff', x: 60, y: 70, vx: -0.5, vy: -0.4 },
    { label: '5', color: '#56c270', x: 80, y: 20, vx: -0.3, vy:  0.6 },
    { label: '1', color: '#ff7a7a', x: 30, y: 80, vx:  0.4, vy: -0.5 },
    { label: '9', color: '#c97bff', x: 10, y: 60, vx:  0.7, vy:  0.0 },
  ];

  let state = {
    ax: 30, ay: 30,   // agent center
    avx: 0, avy: 0,   // agent velocity
    reveal: false,
    showVels: false,
    playing: true,
  };

  function wrap(v, m) {
    return ((v % m) + m) % m;
  }

  function tick() {
    if (!state.playing) return;
    for (const d of digits) {
      d.x = wrap(d.x + d.vx, worldSize);
      d.y = wrap(d.y + d.vy, worldSize);
    }
    state.ax = wrap(state.ax + state.avx, worldSize);
    state.ay = wrap(state.ay + state.avy, worldSize);
    draw();
  }

  function draw() {
    const fg = cssVar('--fg') || '#222';
    const fgMute = cssVar('--fg-mute') || '#888';
    const bgCard = cssVar('--bg-card') || '#f1f0eb';

    ctx.clearRect(0, 0, W, H);
    // background: solid world (mute when hidden)
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, W, H);

    const cell = W / worldSize;

    // draw digits — bright if in fov or revealed, faded otherwise
    function inFov(x, y) {
      const dx = Math.min(wrap(x - state.ax + worldSize / 2, worldSize) - worldSize / 2, worldSize / 2);
      const dy = Math.min(wrap(y - state.ay + worldSize / 2, worldSize) - worldSize / 2, worldSize / 2);
      const adx = Math.abs(wrap(x - state.ax + worldSize / 2, worldSize) - worldSize / 2);
      const ady = Math.abs(wrap(y - state.ay + worldSize / 2, worldSize) - worldSize / 2);
      return adx <= fovSize / 2 && ady <= fovSize / 2;
    }

    for (const d of digits) {
      const visible = inFov(d.x, d.y) || state.reveal;
      const px = d.x * cell, py = d.y * cell;
      ctx.fillStyle = visible ? d.color : '#202229';
      ctx.fillRect(px - cell * 2.5, py - cell * 2.5, cell * 5, cell * 5);
      // label
      if (visible) {
        ctx.fillStyle = '#0a0c10';
        ctx.font = "700 14px ui-sans-serif, system-ui";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.label, px, py);
        if (state.showVels) {
          drawArrow(ctx, px, py, px + d.vx * 14, py + d.vy * 14, '#fff', 1.5, 4);
        }
      }
      // wrap copies: if near edge, also draw a copy on the other side
      for (const [ox, oy] of [[worldSize, 0], [-worldSize, 0], [0, worldSize], [0, -worldSize]]) {
        const xw = (d.x + ox) * cell, yw = (d.y + oy) * cell;
        if (xw + cell * 2.5 < 0 || xw - cell * 2.5 > W) continue;
        if (yw + cell * 2.5 < 0 || yw - cell * 2.5 > H) continue;
        const visiblew = inFov(d.x + ox, d.y + oy) || state.reveal;
        ctx.fillStyle = visiblew ? d.color : '#202229';
        ctx.fillRect(xw - cell * 2.5, yw - cell * 2.5, cell * 5, cell * 5);
        if (visiblew) {
          ctx.fillStyle = '#0a0c10';
          ctx.font = "700 14px ui-sans-serif, system-ui";
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(d.label, xw, yw);
        }
      }
    }

    // FoV box (wrapped)
    ctx.strokeStyle = '#ff6b8a';
    ctx.lineWidth = 2.2;
    function drawFov(cx, cy) {
      const x = (cx - fovSize / 2) * cell;
      const y = (cy - fovSize / 2) * cell;
      ctx.strokeRect(x, y, fovSize * cell, fovSize * cell);
    }
    for (const [ox, oy] of [[0, 0], [worldSize, 0], [-worldSize, 0], [0, worldSize], [0, -worldSize]]) {
      drawFov(state.ax + ox, state.ay + oy);
    }
    // tiny agent dot
    drawDot(ctx, state.ax * cell, state.ay * cell, 4, '#ff6b8a');

    readout.innerHTML =
      `Agent at <b>(${Math.round(state.ax)}, ${Math.round(state.ay)})</b><br>` +
      `Agent velocity <b>(${state.avx.toFixed(1)}, ${state.avy.toFixed(1)})</b><br>` +
      `Window: <b>${fovSize}×${fovSize}</b> of <b>${worldSize}×${worldSize}</b>`;
  }

  dpad.querySelectorAll('button[data-d]').forEach(b => {
    b.addEventListener('click', () => {
      const d = b.dataset.d;
      const k = 0.5;
      if (d === 'up')    state.avy = -k;
      if (d === 'down')  state.avy =  k;
      if (d === 'left')  state.avx = -k;
      if (d === 'right') state.avx =  k;
      if (d === 'stop')  { state.avx = 0; state.avy = 0; }
      draw();
    });
  });
  toggleEl.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.key;
      if (k === 'play') {
        state.playing = !state.playing;
        b.textContent = state.playing ? '▶ playing' : '⏸ paused';
        b.classList.toggle('on', state.playing);
      } else if (k === 'reveal') {
        state.reveal = !state.reveal;
        b.textContent = state.reveal ? 'hide world outside FoV' : 'show full world';
        b.classList.toggle('on', state.reveal);
      } else if (k === 'vels') {
        state.showVels = !state.showVels;
        b.classList.toggle('on', state.showVels);
      }
      draw();
    });
  });

  window.addEventListener('themechange', draw);
  setInterval(tick, 80);
  draw();
})();
