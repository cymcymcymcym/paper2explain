/* agent_context_large_codebase — interactive widgets. Plain JS / Canvas. No deps. */

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
    document.dispatchEvent(new CustomEvent('acl-theme'));
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

function fmtTok(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 2) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(Math.round(n));
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(h) / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/* =====================================================================
 * Widget 1: context budget — load the repository vs search it
 * ===================================================================== */
(function budgetWidget() {
  const host = document.getElementById('budget-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="bgCanvas" width="620" height="330"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>repository size: <b id="bgSizeLbl">3,000 files</b></label>
          <input type="range" id="bgFiles" min="100" max="20000" step="100" value="3000"/>
        </div>
        <div class="ctl">
          <label>context window: <b id="bgWinLbl">200K</b></label>
          <input type="range" id="bgWin" min="0" max="3" step="1" value="1"/>
        </div>
        <div class="readout" id="bgReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#bgCanvas');
  const W = 620, H = 330;
  let ctx = devicePx(cv, W, H);
  const fileSlider = host.querySelector('#bgFiles');
  const winSlider = host.querySelector('#bgWin');
  const readout = host.querySelector('#bgReadout');
  const sizeLbl = host.querySelector('#bgSizeLbl');
  const winLbl = host.querySelector('#bgWinLbl');

  const WINDOWS = [128000, 200000, 500000, 1000000];
  const WINLBL = ['128K', '200K', '500K', '1M'];
  const LINES_PER_FILE = 250;
  const TOK_PER_LINE = 10;

  // fixed overhead of a session, in tokens
  const OVERHEAD = { sys: 9000, tools: 6000, memory: 3500, task: 400 };
  const OVER_TOTAL = OVERHEAD.sys + OVERHEAD.tools + OVERHEAD.memory + OVERHEAD.task;

  function draw() {
    const files = parseInt(fileSlider.value, 10);
    const C = WINDOWS[parseInt(winSlider.value, 10)];
    const repoTok = files * LINES_PER_FILE * TOK_PER_LINE;
    const budget = C - OVER_TOTAL;

    sizeLbl.textContent = files.toLocaleString() + ' files';
    winLbl.textContent = WINLBL[parseInt(winSlider.value, 10)];

    const fg = cssVar('--fg') || '#e8e8ee';
    const mute = cssVar('--fg-mute') || '#8a8d99';
    const accent = cssVar('--accent') || '#ff9b6a';
    const line = cssVar('--rule') || '#33363f';

    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // ---- Panel geometry: two window boxes side by side ----
    const boxW = 132, boxH = 214, boxY = 62;
    const leftX = 96, rightX = 372;

    function drawWindowBox(x, title, layers, footNote) {
      ctx.textAlign = 'center';
      ctx.fillStyle = fg;
      ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(title, x + boxW / 2, boxY - 24);

      // frame
      ctx.strokeStyle = mute;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, boxY, boxW, boxH, 6);
      ctx.stroke();

      // layers stack from bottom
      let acc = 0;
      for (const L of layers) {
        const frac = Math.max(0, Math.min(1 - acc, L.frac));
        if (frac <= 0.0005) { acc += L.frac; continue; }
        const h = boxH * frac;
        const y = boxY + boxH - boxH * acc - h;
        ctx.fillStyle = L.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x + 1.5, y, boxW - 3, h);
        ctx.globalAlpha = 1;
        if (h > 15) {
          ctx.fillStyle = '#10121a';
          ctx.font = '11px ui-monospace, monospace';
          ctx.fillText(L.label, x + boxW / 2, y + h / 2);
        }
        acc += L.frac;
      }

      // overflow marker
      if (acc > 1.001) {
        ctx.strokeStyle = '#ff5f6a';
        ctx.lineWidth = 2.5;
        roundRect(ctx, x, boxY, boxW, boxH, 6);
        ctx.stroke();
        ctx.fillStyle = '#ff5f6a';
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText('OVERFLOW', x + boxW / 2, boxY - 8);
      }

      ctx.fillStyle = mute;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(footNote, x + boxW / 2, boxY + boxH + 18);
    }

    // ---- Strategy A: load everything ----
    const fitFrac = Math.min(1, budget / repoTok);
    const repoFrac = repoTok / C; // may exceed 1 wildly
    const loadLayers = [
      { frac: OVER_TOTAL / C, color: '#6a7590', label: 'overhead' },
      { frac: Math.min(repoFrac, 4), color: '#ff5f6a', label: 'repo files' },
    ];
    drawWindowBox(leftX, 'load everything',
      loadLayers,
      (fitFrac * 100).toFixed(fitFrac < 0.01 ? 2 : 1) + '% of repo fits');

    // ---- Strategy B: agentic search ----
    // costs: a directory listing scaled mildly with repo size, grep results,
    // and the files the agent decides to open.
    const listing = Math.min(9000, 300 + files * 1.1);
    const grepHits = 2600;
    const opened = 6;
    const readTok = opened * LINES_PER_FILE * TOK_PER_LINE;
    const searchTotal = OVER_TOTAL + listing + grepHits + readTok;
    const searchLayers = [
      { frac: OVER_TOTAL / C, color: '#6a7590', label: 'overhead' },
      { frac: listing / C, color: '#4a7fbf', label: 'listing' },
      { frac: grepHits / C, color: '#5fa9ff', label: 'grep hits' },
      { frac: readTok / C, color: accent, label: opened + ' files read' },
    ];
    drawWindowBox(rightX, 'agentic search',
      searchLayers,
      (searchTotal / C * 100).toFixed(1) + '% of window used');

    // ---- Divider + repo bar across the top ----
    ctx.textAlign = 'left';
    ctx.fillStyle = mute;
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('the repository: ' + fmtTok(repoTok) + ' tokens', 20, 22);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, 34); ctx.lineTo(W - 20, 34); ctx.stroke();
    ctx.fillStyle = accent;
    const seg = Math.max(2, (W - 40) * Math.min(1, C / repoTok));
    ctx.fillRect(20, 31, seg, 6);
    ctx.fillStyle = mute;
    ctx.fillText('↑ one window', 20, 48);

    // ---- Readout ----
    const ratio = repoTok / searchTotal;
    readout.innerHTML =
      `<div>repository <b>${fmtTok(repoTok)}</b> tokens · window <b>${fmtTok(C)}</b></div>` +
      `<div>load everything: <b style="color:#ff5f6a">${(fitFrac * 100).toFixed(fitFrac < 0.01 ? 2 : 1)}%</b> of the repo fits</div>` +
      `<div>agentic search: <b style="color:${accent}">${fmtTok(searchTotal)}</b> tokens, ${(searchTotal / C * 100).toFixed(1)}% of the window</div>` +
      `<div>the search path touches <b>${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}×</b> less than the repository holds</div>`;
  }

  fileSlider.addEventListener('input', draw);
  winSlider.addEventListener('input', draw);
  document.addEventListener('acl-theme', draw);
  draw();
})();

/* =====================================================================
 * Widget 2: context rot — accuracy vs position, length, distractors
 * ===================================================================== */
(function rotWidget() {
  const host = document.getElementById('rot-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rotCanvas" width="620" height="300"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>input length: <b id="rotLenLbl">32K tokens</b></label>
          <input type="range" id="rotLen" min="0" max="5" step="1" value="2"/>
        </div>
        <div class="ctl">
          <label>distractors: <b id="rotDistLbl">0</b></label>
          <input type="range" id="rotDist" min="0" max="4" step="1" value="0"/>
        </div>
        <div class="ctl">
          <label>haystack</label>
          <div class="seg" id="rotSeg">
            <button data-v="coherent" class="on">coherent prose</button>
            <button data-v="shuffled">shuffled</button>
          </div>
        </div>
        <div class="readout" id="rotReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#rotCanvas');
  const W = 620, H = 300;
  const ctx = devicePx(cv, W, H);
  const lenS = host.querySelector('#rotLen');
  const distS = host.querySelector('#rotDist');
  const seg = host.querySelector('#rotSeg');
  const readout = host.querySelector('#rotReadout');
  const lenLbl = host.querySelector('#rotLenLbl');
  const distLbl = host.querySelector('#rotDistLbl');

  const LENS = [1000, 4000, 32000, 100000, 300000, 1000000];
  const LENLBL = ['1K', '4K', '32K', '100K', '300K', '1M'];
  let haystack = 'coherent';
  let hoverPos = null;

  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    haystack = b.dataset.v;
    [...seg.children].forEach((c) => c.classList.toggle('on', c === b));
    draw();
  });

  /* Model of the reported shapes. Not the papers' raw data — a curve that
   * reproduces their four qualitative findings so they can be seen together. */
  function accuracy(pos, lenIdx, nDist, hay) {
    const L = LENS[lenIdx];
    // 1) overall decay with length (context rot)
    const lengthTerm = 1 - 0.30 * Math.log10(L / 1000) / 3;
    // 2) U-shape over position (lost in the middle), deepening with length
    const depth = 0.10 + 0.30 * (lenIdx / 5);
    const u = 1 - depth * Math.sin(Math.PI * pos) ** 1.4;
    // 3) distractors: compounding, and worse in the middle
    const dist = 1 - nDist * (0.045 + 0.030 * Math.sin(Math.PI * pos));
    // 4) coherent haystacks are harder than shuffled ones
    const coh = hay === 'coherent' ? 0.94 : 1.0;
    return Math.max(0.02, Math.min(0.99, lengthTerm * u * dist * coh));
  }

  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W;
    const P = plot();
    hoverPos = (x >= P.x0 && x <= P.x1) ? (x - P.x0) / (P.x1 - P.x0) : null;
    draw();
  });
  cv.addEventListener('mouseleave', () => { hoverPos = null; draw(); });

  function plot() { return { x0: 58, x1: W - 22, y0: 30, y1: H - 52 }; }

  function draw() {
    const lenIdx = parseInt(lenS.value, 10);
    const nDist = parseInt(distS.value, 10);
    lenLbl.textContent = LENLBL[lenIdx] + ' tokens';
    distLbl.textContent = String(nDist);

    const fg = cssVar('--fg') || '#e8e8ee';
    const mute = cssVar('--fg-mute') || '#8a8d99';
    const accent = cssVar('--accent') || '#ff9b6a';
    const line = cssVar('--rule') || '#33363f';
    const P = plot();

    ctx.clearRect(0, 0, W, H);
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // axes
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    for (let a = 0; a <= 1.0001; a += 0.25) {
      const y = P.y1 - (P.y1 - P.y0) * a;
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(P.x0, y); ctx.lineTo(P.x1, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = mute;
      ctx.textAlign = 'right';
      ctx.fillText((a * 100).toFixed(0) + '%', P.x0 - 8, y);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = mute;
    ctx.fillText('start of input', P.x0 + 46, P.y1 + 20);
    ctx.fillText('middle', (P.x0 + P.x1) / 2, P.y1 + 20);
    ctx.fillText('end of input', P.x1 - 42, P.y1 + 20);
    ctx.save();
    ctx.translate(14, (P.y0 + P.y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('retrieval accuracy', 0, 0);
    ctx.restore();

    // faint reference curve: shortest input, no distractors
    ctx.strokeStyle = mute;
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const a = accuracy(p, 0, 0, 'shuffled');
      const x = P.x0 + (P.x1 - P.x0) * p;
      const y = P.y1 - (P.y1 - P.y0) * a;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // main curve
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const a = accuracy(p, lenIdx, nDist, haystack);
      const x = P.x0 + (P.x1 - P.x0) * p;
      const y = P.y1 - (P.y1 - P.y0) * a;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();

    // fill under
    ctx.lineTo(P.x1, P.y1); ctx.lineTo(P.x0, P.y1); ctx.closePath();
    ctx.fillStyle = accent; ctx.globalAlpha = 0.10; ctx.fill(); ctx.globalAlpha = 1;

    // hover marker
    const hp = hoverPos === null ? 0.5 : hoverPos;
    const ha = accuracy(hp, lenIdx, nDist, haystack);
    const hx = P.x0 + (P.x1 - P.x0) * hp;
    const hy = P.y1 - (P.y1 - P.y0) * ha;
    ctx.strokeStyle = mute; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(hx, P.y0); ctx.lineTo(hx, P.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.font = '600 12px ui-monospace, monospace';
    const lx = Math.max(P.x0 + 34, Math.min(P.x1 - 34, hx));
    ctx.fillText((ha * 100).toFixed(0) + '%', lx, hy - 14);

    // legend
    ctx.textAlign = 'left';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = mute;
    ctx.fillText('dashed = 1K tokens, shuffled, no distractors', P.x0 + 4, P.y0 - 12);

    const best = accuracy(0.02, lenIdx, nDist, haystack);
    const mid = accuracy(0.5, lenIdx, nDist, haystack);
    readout.innerHTML =
      `<div>answer at the <b>start</b>: ${(best * 100).toFixed(0)}% · at the <b>middle</b>: ${(mid * 100).toFixed(0)}%</div>` +
      `<div>the middle costs you <b style="color:${accent}">${((best - mid) * 100).toFixed(0)} points</b> at this length</div>` +
      `<div style="opacity:.75">Shapes follow Liu et al. (2023) and Chroma (2025). Illustrative, not their raw data.</div>`;
  }

  lenS.addEventListener('input', draw);
  distS.addEventListener('input', draw);
  document.addEventListener('acl-theme', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: a session under real compaction rules
 * ===================================================================== */
(function compactionWidget() {
  const host = document.getElementById('compaction-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="cmpCanvas" width="620" height="330"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>turn: <b id="cmpTurnLbl">1</b> of 40</label>
          <input type="range" id="cmpTurn" min="1" max="40" step="1" value="1"/>
        </div>
        <div class="ctl">
          <label>harness</label>
          <div class="seg" id="cmpSeg">
            <button data-v="codex" class="on">Codex CLI</button>
            <button data-v="claude">Claude Code</button>
          </div>
        </div>
        <div class="readout" id="cmpReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#cmpCanvas');
  const W = 620, H = 330;
  const ctx = devicePx(cv, W, H);
  const turnS = host.querySelector('#cmpTurn');
  const seg = host.querySelector('#cmpSeg');
  const readout = host.querySelector('#cmpReadout');
  const turnLbl = host.querySelector('#cmpTurnLbl');
  let harness = 'codex';

  const C = 200000;
  const BASE = 18500;               // system + tools + memory + task
  const CODEX_THRESHOLD = 167000;   // (200000 - 20000) - 13000
  const CLAUDE_THRESHOLD = 0.92 * C;
  const REREAD = 50000;             // 5 files x 10000, capped at 5000/file -> 25000 typical

  // A deterministic session: what each turn adds.
  function turnCost(t) {
    const kinds = [
      { k: 'grep', tok: 2400 },
      { k: 'read', tok: 9000 },
      { k: 'read', tok: 6500 },
      { k: 'edit', tok: 700 },
      { k: 'test', tok: 7200 },
      { k: 'grep', tok: 1800 },
      { k: 'read', tok: 11000 },
      { k: 'edit', tok: 800 },
    ];
    return kinds[(t - 1) % kinds.length];
  }

  /* Simulate up to turn T. Returns the state and the log of events. */
  function simulate(T) {
    let used = BASE;
    let summary = 0;
    let toolTok = 0;      // clearable tool results
    let reasoning = 0;
    const events = [];
    let compactions = 0;

    for (let t = 1; t <= T; t++) {
      const c = turnCost(t);
      reasoning += 450;
      toolTok += c.tok;
      used = BASE + summary + toolTok + reasoning;

      if (harness === 'codex') {
        if (used > CODEX_THRESHOLD) {
          compactions++;
          summary = 6000;
          toolTok = REREAD / 2;   // 5 files, 5000-token cap each
          reasoning = 0;
          used = BASE + summary + toolTok;
          events.push({ t, msg: `compaction at ${fmtTok(CODEX_THRESHOLD)} → summary + 5 files re-read` });
        }
      } else {
        // microcompaction: clear the oldest tool results once they dominate
        if (toolTok > 0.55 * C) {
          const cleared = toolTok - 0.32 * C;
          toolTok -= cleared;
          used = BASE + summary + toolTok + reasoning;
          events.push({ t, msg: `microcompaction cleared ${fmtTok(cleared)} of old tool results` });
        }
        if (used > CLAUDE_THRESHOLD) {
          compactions++;
          summary = 8500;
          toolTok = 12000;
          reasoning = 0;
          used = BASE + summary + toolTok;
          events.push({ t, msg: `auto-compaction → readable summary, history replaced` });
        }
      }
    }
    return { used, summary, toolTok, reasoning, events, compactions };
  }

  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    harness = b.dataset.v;
    [...seg.children].forEach((c) => c.classList.toggle('on', c === b));
    draw();
  });

  function draw() {
    const T = parseInt(turnS.value, 10);
    turnLbl.textContent = String(T);
    const S = simulate(T);

    const fg = cssVar('--fg') || '#e8e8ee';
    const mute = cssVar('--fg-mute') || '#8a8d99';
    const accent = cssVar('--accent') || '#ff9b6a';
    const line = cssVar('--rule') || '#33363f';

    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.font = '11px ui-monospace, monospace';

    // ---- left: history curve over all 40 turns ----
    const px0 = 46, px1 = 350, py0 = 34, py1 = 250;
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px0, py1); ctx.lineTo(px1, py1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px0, py1); ctx.stroke();

    // threshold line
    const thr = harness === 'codex' ? CODEX_THRESHOLD : CLAUDE_THRESHOLD;
    const ty = py1 - (py1 - py0) * (thr / C);
    ctx.strokeStyle = '#ff5f6a'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px0, ty); ctx.lineTo(px1, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff5f6a'; ctx.textAlign = 'left';
    ctx.fillText('compaction at ' + fmtTok(thr), px0 + 4, ty - 9);

    // curve
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let t = 1; t <= 40; t++) {
      const u = simulate(t).used;
      const x = px0 + (px1 - px0) * ((t - 1) / 39);
      const y = py1 - (py1 - py0) * Math.min(1, u / C);
      t === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // current-turn marker
    const cx = px0 + (px1 - px0) * ((T - 1) / 39);
    const cy = py1 - (py1 - py0) * Math.min(1, S.used / C);
    ctx.strokeStyle = mute; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, py0); ctx.lineTo(cx, py1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = mute; ctx.textAlign = 'right';
    ctx.fillText('200K', px0 - 6, py0);
    ctx.fillText('0', px0 - 6, py1);
    ctx.textAlign = 'center';
    ctx.fillText('turn 1', px0 + 16, py1 + 16);
    ctx.fillText('turn 40', px1 - 18, py1 + 16);
    ctx.fillStyle = fg;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('window fill across the session', px0, py0 - 18);

    // ---- right: the stack at this turn ----
    const bx = 430, bw = 130, by = 34, bh = 216;
    ctx.strokeStyle = mute; ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, bw, bh, 6); ctx.stroke();

    const layers = [
      { tok: BASE, color: '#6a7590', label: 'prompt + memory' },
      { tok: S.summary, color: '#5fa9ff', label: 'summary' },
      { tok: S.toolTok, color: accent, label: 'tool results' },
      { tok: S.reasoning, color: '#c9713f', label: 'reasoning' },
    ];
    let acc = 0;
    ctx.textAlign = 'center';
    for (const L of layers) {
      if (L.tok <= 0) continue;
      const frac = L.tok / C;
      const h = bh * frac;
      const y = by + bh - bh * acc - h;
      ctx.fillStyle = L.color; ctx.globalAlpha = 0.85;
      ctx.fillRect(bx + 1.5, y, bw - 3, h);
      ctx.globalAlpha = 1;
      if (h > 14) {
        ctx.fillStyle = '#10121a';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(L.label, bx + bw / 2, y + h / 2);
      }
      acc += frac;
    }
    ctx.fillStyle = fg;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('window at turn ' + T, bx, by - 18);
    ctx.fillStyle = mute;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(fmtTok(S.used) + ' / 200K  (' + (S.used / C * 100).toFixed(0) + '%)',
                 bx + bw / 2, by + bh + 18);

    // ---- event log ----
    ctx.textAlign = 'left';
    ctx.fillStyle = mute;
    ctx.font = '11px ui-monospace, monospace';
    const recent = S.events.slice(-2);
    let ly = 278;
    if (recent.length === 0) {
      ctx.fillText('no compaction yet', 46, ly);
    } else {
      for (const e of recent) {
        ctx.fillStyle = '#5fa9ff';
        ctx.fillText('turn ' + e.t + ': ' + e.msg, 46, ly);
        ly += 17;
      }
    }

    readout.innerHTML =
      `<div>window: <b>${fmtTok(S.used)}</b> of 200K (${(S.used / C * 100).toFixed(0)}%)</div>` +
      `<div>compactions so far: <b>${S.compactions}</b></div>` +
      (harness === 'codex'
        ? `<div style="opacity:.8">Codex: threshold = (200K − 20K) − 13K = <b>167K</b>, then re-reads 5 files at 5K each.</div>`
        : `<div style="opacity:.8">Claude Code: microcompaction clears old tool results first; full auto-compaction produces a summary you can read.</div>`);
  }

  turnS.addEventListener('input', draw);
  document.addEventListener('acl-theme', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: what your context file costs, per turn, forever
 * ===================================================================== */
(function agentsmdWidget() {
  const host = document.getElementById('agentsmd-widget');
  if (!host) return;

  const SECTIONS = [
    { id: 'build', name: 'Build & test commands', tok: 120, keep: true,
      note: 'Not discoverable from source. Agents obey it: uv used 1.6×/task when named, &lt;0.01× when not.' },
    { id: 'danger', name: 'Safety rules and things never to touch', tok: 90, keep: true,
      note: 'Cannot be inferred from code at all. Highest value per token in the file.' },
    { id: 'why', name: 'Decisions with their reasons', tok: 200, keep: true,
      note: 'Invisible in the code. Without it an agent will “fix” a deliberate choice.' },
    { id: 'style', name: 'Code conventions that linters do not catch', tok: 150, keep: true,
      note: 'Partly discoverable by reading neighbours, but cheap and specific.' },
    { id: 'pointer', name: 'Pointers to deeper docs (not their contents)', tok: 80, keep: true,
      note: 'Progressive disclosure: 80 tokens per turn instead of 3,000.' },
    { id: 'overview', name: 'Codebase overview / directory tree', tok: 900, keep: false,
      note: 'Measured: present in 100% of Sonnet-generated files, and did <b>not</b> reduce steps-to-first-relevant-file.' },
    { id: 'arch', name: 'Architecture description in prose', tok: 1200, keep: false,
      note: 'Duplicates what grep finds. In the no-other-docs ablation this was the only condition where it helped.' },
    { id: 'stack', name: 'Tech stack list', tok: 250, keep: false,
      note: 'Readable from package.json / pyproject.toml in one tool call.' },
    { id: 'paste', name: 'Pasted design document', tok: 3000, keep: false,
      note: 'Worst case: costs every turn, and adds distractors that measurably hurt retrieval.' },
    { id: 'contrib', name: 'Contributor guide copied from CONTRIBUTING.md', tok: 700, keep: false,
      note: 'Pure duplication. The agent can read the original file when it needs it.' },
  ];

  host.insertAdjacentHTML('beforeend', `
    <div class="body wide">
      <div class="md-list" id="mdList"></div>
      <div class="md-summary" id="mdSummary"></div>
    </div>
  `);

  const list = host.querySelector('#mdList');
  const summary = host.querySelector('#mdSummary');
  const state = {};
  SECTIONS.forEach((s) => { state[s.id] = true; });

  list.innerHTML = SECTIONS.map((s) => `
    <label class="md-row ${s.keep ? 'good' : 'bad'}" data-id="${s.id}">
      <input type="checkbox" checked data-id="${s.id}"/>
      <span class="md-name">${s.name}</span>
      <span class="md-tok">${s.tok} tok</span>
      <span class="md-note">${s.note}</span>
    </label>
  `).join('');

  list.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    state[cb.dataset.id] = cb.checked;
    render();
  });

  function render() {
    let total = 0, wasted = 0;
    for (const s of SECTIONS) {
      if (!state[s.id]) continue;
      total += s.tok;
      if (!s.keep) wasted += s.tok;
    }
    const TURNS = 40;
    const perSession = total * TURNS;
    const wastedSession = wasted * TURNS;
    // $3 per million input tokens, 40 turns, 200 sessions a month
    const monthly = (perSession * 200 / 1e6) * 3;
    const wastedMonthly = (wastedSession * 200 / 1e6) * 3;

    summary.innerHTML = `
      <div class="md-stat"><b>${total.toLocaleString()}</b><span>tokens, re-sent every turn</span></div>
      <div class="md-stat"><b>${perSession.toLocaleString()}</b><span>tokens per 40-turn session</span></div>
      <div class="md-stat ${wasted > 0 ? 'warn' : 'ok'}"><b>${wasted.toLocaleString()}</b><span>of those are discoverable by the agent anyway</span></div>
      <div class="md-stat"><b>$${monthly.toFixed(0)}</b><span>per month at 200 sessions, $3/M input</span></div>
      <div class="md-foot">
        ${wasted > 0
          ? `<b style="color:#ff5f6a">$${wastedMonthly.toFixed(0)}/month</b> of that is spent telling the agent things it could have found with <code>ls</code> and <code>grep</code>. In the ETH Zurich study, files built mostly from these sections changed success rates by an amount indistinguishable from noise while raising cost 20–23%.`
          : `Everything left is something an agent cannot derive by looking. This is the file the evidence supports: small, specific, and about conventions rather than contents.`}
      </div>`;
  }
  render();
})();

/* =====================================================================
 * Widget 5: a ranked repository map under a token budget
 * ===================================================================== */
(function repomapWidget() {
  const host = document.getElementById('repomap-widget');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="rmCanvas" width="620" height="330"></canvas>
      <div class="controls">
        <div class="ctl">
          <label>map token budget: <b id="rmBudLbl">800</b></label>
          <input type="range" id="rmBud" min="150" max="2000" step="50" value="800"/>
        </div>
        <div class="readout" id="rmReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#rmCanvas');
  const W = 620, H = 330;
  const ctx = devicePx(cv, W, H);
  const budS = host.querySelector('#rmBud');
  const readout = host.querySelector('#rmReadout');
  const budLbl = host.querySelector('#rmBudLbl');

  // A small dependency graph: name, position, cost in map tokens
  const NODES = [
    { id: 'db/session.py',      x: 0.50, y: 0.20, tok: 130 },
    { id: 'models/user.py',     x: 0.24, y: 0.36, tok: 150 },
    { id: 'models/order.py',    x: 0.50, y: 0.42, tok: 160 },
    { id: 'api/routes.py',      x: 0.76, y: 0.36, tok: 220 },
    { id: 'api/auth.py',        x: 0.86, y: 0.62, tok: 140 },
    { id: 'jobs/mailer.py',     x: 0.14, y: 0.66, tok: 110 },
    { id: 'utils/dates.py',     x: 0.36, y: 0.76, tok: 90 },
    { id: 'tests/test_api.py',  x: 0.64, y: 0.80, tok: 180 },
    { id: 'scripts/seed.py',    x: 0.06, y: 0.20, tok: 100 },
  ];
  // edges: [from, to] meaning "from references to"
  const EDGES = [
    ['models/user.py', 'db/session.py'],
    ['models/order.py', 'db/session.py'],
    ['models/order.py', 'models/user.py'],
    ['api/routes.py', 'models/order.py'],
    ['api/routes.py', 'models/user.py'],
    ['api/routes.py', 'api/auth.py'],
    ['api/auth.py', 'models/user.py'],
    ['jobs/mailer.py', 'models/user.py'],
    ['jobs/mailer.py', 'utils/dates.py'],
    ['models/order.py', 'utils/dates.py'],
    ['tests/test_api.py', 'api/routes.py'],
    ['tests/test_api.py', 'models/order.py'],
    ['scripts/seed.py', 'models/user.py'],
  ];

  let focus = null;   // the file the reader says they are editing

  function pagerank() {
    const N = NODES.length;
    const idx = {};
    NODES.forEach((n, i) => { idx[n.id] = i; });
    const out = NODES.map(() => []);
    const inn = NODES.map(() => []);
    for (const [a, b] of EDGES) { out[idx[a]].push(idx[b]); inn[idx[b]].push(idx[a]); }

    // personalization vector: bias toward the focused file's neighbourhood
    const pv = NODES.map((n) => {
      if (!focus) return 1 / N;
      if (n.id === focus) return 0.45;
      const fi = idx[focus];
      const near = out[fi].includes(idx[n.id]) || inn[fi].includes(idx[n.id]);
      return near ? 0.35 / Math.max(1, out[fi].length + inn[fi].length) : 0.20 / N;
    });
    const pvSum = pv.reduce((a, b) => a + b, 0);
    for (let i = 0; i < N; i++) pv[i] /= pvSum;

    let r = NODES.map(() => 1 / N);
    const d = 0.85;
    for (let it = 0; it < 60; it++) {
      const nr = NODES.map((_, i) => (1 - d) * pv[i]);
      for (let u = 0; u < N; u++) {
        if (out[u].length === 0) { for (let i = 0; i < N; i++) nr[i] += d * r[u] / N; continue; }
        for (const v of out[u]) nr[v] += d * r[u] / out[u].length;
      }
      r = nr;
    }
    const max = Math.max(...r);
    return NODES.map((n, i) => ({ ...n, rank: r[i], norm: r[i] / max }));
  }

  cv.addEventListener('click', (e) => {
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * W;
    const my = (e.clientY - rect.top) / rect.height * H;
    let hit = null;
    for (const n of NODES) {
      const p = pos(n);
      if (Math.hypot(p.x - mx, p.y - my) < 26) hit = n.id;
    }
    focus = (hit === focus) ? null : hit;
    draw();
  });

  function pos(n) { return { x: 40 + n.x * (W - 200), y: 34 + n.y * (H - 110) }; }

  function draw() {
    const budget = parseInt(budS.value, 10);
    budLbl.textContent = String(budget);

    const fg = cssVar('--fg') || '#e8e8ee';
    const mute = cssVar('--fg-mute') || '#8a8d99';
    const accent = cssVar('--accent') || '#ff9b6a';
    const line = cssVar('--rule') || '#33363f';

    const ranked = pagerank().sort((a, b) => b.rank - a.rank);
    const included = new Set();
    let spent = 0;
    for (const n of ranked) {
      if (spent + n.tok <= budget) { included.add(n.id); spent += n.tok; }
    }

    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';

    // edges
    for (const [a, b] of EDGES) {
      const na = NODES.find((n) => n.id === a), nb = NODES.find((n) => n.id === b);
      const pa = pos(na), pb = pos(nb);
      const both = included.has(a) && included.has(b);
      ctx.strokeStyle = both ? accent : line;
      ctx.globalAlpha = both ? 0.45 : 0.28;
      ctx.lineWidth = both ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // nodes
    ctx.textAlign = 'center';
    for (const n of ranked) {
      const p = pos(n);
      const inMap = included.has(n.id);
      const r = 7 + 13 * n.norm;
      ctx.fillStyle = inMap ? accent : (cssVar('--bg-alt') || '#1a1c22');
      ctx.strokeStyle = n.id === focus ? '#5fa9ff' : (inMap ? accent : mute);
      ctx.lineWidth = n.id === focus ? 3 : 1.4;
      ctx.globalAlpha = inMap ? 0.9 : 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();

      ctx.fillStyle = inMap ? fg : mute;
      ctx.font = (inMap ? '600 ' : '') + '10px ui-monospace, monospace';
      ctx.fillText(n.id, p.x, p.y + r + 11);
    }

    // side panel
    const sx = W - 148;
    ctx.textAlign = 'left';
    ctx.fillStyle = fg;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('in the map', sx, 26);
    ctx.font = '10px ui-monospace, monospace';
    let y = 46;
    for (const n of ranked) {
      const inMap = included.has(n.id);
      ctx.fillStyle = inMap ? accent : mute;
      ctx.globalAlpha = inMap ? 1 : 0.45;
      const nm = n.id.length > 17 ? n.id.slice(0, 16) + '…' : n.id;
      ctx.fillText((inMap ? '✓ ' : '  ') + nm, sx, y);
      ctx.fillText(n.norm.toFixed(2), sx + 112, y);
      ctx.globalAlpha = 1;
      y += 15;
    }

    ctx.fillStyle = mute;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('click a node to set', sx, y + 8);
    ctx.fillText('the file you are editing', sx, y + 21);

    readout.innerHTML =
      `<div>map uses <b>${spent}</b> of ${budget} tokens · <b>${included.size}</b> of ${NODES.length} files included</div>` +
      `<div>top-ranked: <b style="color:${accent}">${ranked[0].id}</b> — referenced by the files that are themselves referenced most</div>` +
      (focus
        ? `<div>focused on <b style="color:#5fa9ff">${focus}</b>; ranking now favours its neighbours</div>`
        : `<div style="opacity:.75">The map is regenerated from source, so it cannot go stale the way a written overview does.</div>`);
  }

  budS.addEventListener('input', draw);
  document.addEventListener('acl-theme', draw);
  draw();
})();
