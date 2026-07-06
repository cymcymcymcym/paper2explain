/* benchmarking_ml blog interactive widgets. Plain JS / Canvas. No deps. */

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

function lerp(a, b, t) { return a + (b - a) * t; }

/* =====================================================================
 * Widget 1: Benchmark X-ray
 * Pick a real benchmark, see a 5-axis radar chart of how it scores on
 * construct validity, discriminative power, statistical power,
 * reproducibility, and contamination resistance, plus a short why.
 * ===================================================================== */
(function benchmarkXray() {
  const host = document.getElementById('benchmark-xray');
  if (!host) return;

  const AXES = ['Construct validity', 'Discriminative power', 'Statistical power', 'Reproducibility', 'Contamination resistance'];

  const BENCHMARKS = {
    mmlu: {
      label: 'MMLU',
      scores: [3, 1, 4, 5, 1],
      why: 'Broad and well-calibrated at launch, but saturated near its human ceiling and the easiest of the five to have seen in pretraining — by 2024 it barely separates frontier models.',
    },
    gpqa: {
      label: 'GPQA Diamond',
      scores: [5, 4, 3, 4, 3],
      why: 'Difficulty is validated by the gap between PhD experts and skilled non-experts with web access, not just item count — a stronger validity argument than most multiple-choice tests, though it is now also approaching its ceiling.',
    },
    fid: {
      label: 'FID (image gen.)',
      scores: [1, 3, 2, 2, 5],
      why: "Prompt-blind by construction — it can't fail from contamination because it never reads the prompt, but for the same reason it doesn't actually measure whether the image matches what was asked for.",
    },
    sweb: {
      label: 'SWE-bench Verified',
      scores: [5, 4, 4, 3, 2],
      why: 'Real GitHub issues make this one of the most realistic coding benchmarks built, which is exactly why labs use it heavily — and exactly why it leaked: models can reproduce gold patches from the task ID alone.',
    },
    frontiermath: {
      label: 'FrontierMath',
      scores: [5, 5, 4, 2, 5],
      why: 'Expert-authored, deliberately kept private, with early frontier scores under 2% — about as strong a validity and contamination story as exists. Reproducibility suffers because almost nobody outside the grading team can rerun it.',
    },
    minif2f: {
      label: 'miniF2F',
      scores: [4, 4, 5, 5, 5],
      why: "A proof either type-checks or it doesn't, so grading is exact and contamination is structurally irrelevant — memorizing an informal theorem statement doesn't help you produce a machine-checked proof.",
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="xrayPicker"></div>
    <div class="body">
      <canvas id="xrayCanvas" width="360" height="360"></canvas>
      <div class="controls">
        <div class="readout" id="xrayReadout"></div>
      </div>
    </div>
  `);

  const picker = host.querySelector('#xrayPicker');
  const cv = host.querySelector('#xrayCanvas');
  const ctx = devicePx(cv, 360, 360);
  const readout = host.querySelector('#xrayReadout');

  Object.keys(BENCHMARKS).forEach((key, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' active' : '');
    b.textContent = BENCHMARKS[key].label;
    b.dataset.key = key;
    picker.appendChild(b);
  });

  let current = Object.keys(BENCHMARKS)[0];

  function drawRadar(key) {
    const W = 360, H = 360;
    const cx = W / 2, cy = H / 2 - 6, R = 130;
    const n = AXES.length;
    const fg = cssVar('--fg-mute');
    const accent = cssVar('--accent');
    const accentSoft = cssVar('--accent-soft');
    const rule = cssVar('--rule');

    ctx.clearRect(0, 0, W, H);

    // rings
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const r = (R * ring) / 5;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // spokes + labels
    ctx.fillStyle = fg;
    ctx.font = '11px sans-serif';
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = rule;
      ctx.stroke();

      const lx = cx + Math.cos(a) * (R + 14), ly = cy + Math.sin(a) * (R + 14);
      ctx.textAlign = Math.cos(a) > 0.3 ? 'left' : Math.cos(a) < -0.3 ? 'right' : 'center';
      const words = AXES[i].split(' ');
      const mid = Math.ceil(words.length / 2);
      ctx.fillText(words.slice(0, mid).join(' '), lx, ly - 4);
      ctx.fillText(words.slice(mid).join(' '), lx, ly + 8);
    }

    // data polygon
    const scores = BENCHMARKS[key].scores;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const idx = i % n;
      const a = (Math.PI * 2 * idx) / n - Math.PI / 2;
      const r = (R * scores[idx]) / 5;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = accentSoft;
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (R * scores[i]) / 5;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }
  }

  function render(key) {
    current = key;
    drawRadar(key);
    const b = BENCHMARKS[key];
    const rows = AXES.map((axis, i) => `<div class="axis-row"><span>${axis}</span><span class="score">${b.scores[i]}/5</span></div>`).join('');
    readout.innerHTML = `<strong>${b.label}</strong>${rows}<div class="why">${b.why}</div>`;
    picker.querySelectorAll('.btn').forEach(btn => btn.classList.toggle('active', btn.dataset.key === key));
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    render(btn.dataset.key);
  });

  render(current);
})();

/* =====================================================================
 * Widget 2: The real staircase
 * Scrub through 2012-2026 and watch four real benchmarks rise toward
 * (and past) their human/ceiling reference points.
 * ===================================================================== */
(function saturationTimeline() {
  const host = document.getElementById('saturation-timeline');
  if (!host) return;

  // Approximate published scores, normalized 0-100. Sparse points, linearly
  // interpolated for the scrubber; flat-lines after each benchmark's last
  // reported point (it stopped being usefully reported, not that it froze).
  const SERIES = {
    imagenet: {
      label: 'ImageNet top-5 acc.', color: '#5fa9ff', ceiling: 94.9, ceilingLabel: 'human (94.9)',
      points: [[2012, 84.7], [2014, 93.0], [2015, 96.4], [2017, 97.7]],
    },
    squad: {
      label: 'SQuAD 1.1 F1', color: '#ff9b4a', ceiling: 91.2, ceilingLabel: 'human (91.2)',
      points: [[2016, 51.0], [2017, 67.7], [2018, 91.2], [2018.5, 93.0]],
    },
    mmlu: {
      label: 'MMLU acc.', color: '#c64f24', ceiling: 89.8, ceilingLabel: 'human expert (89.8)',
      points: [[2020, 43.9], [2022, 70.0], [2023, 86.4], [2024, 88.5], [2026, 90.0]],
    },
    gsm8k: {
      label: 'GSM8K acc.', color: '#66bb6a', ceiling: 100, ceilingLabel: 'ceiling (100)',
      points: [[2021, 55.0], [2022, 78.5], [2023, 92.0], [2024, 96.4]],
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <canvas id="satCanvas" width="680" height="360"></canvas>
    <div class="controls">
      <input type="range" id="satSlider" min="2012" max="2026" step="0.1" value="2026"/>
      <div class="legend" id="satLegend"></div>
      <div class="readout" id="satReadout"></div>
    </div>
  `);

  const cv = host.querySelector('#satCanvas');
  const ctx = devicePx(cv, 680, 360);
  const slider = host.querySelector('#satSlider');
  const legend = host.querySelector('#satLegend');
  const readout = host.querySelector('#satReadout');

  legend.innerHTML = Object.values(SERIES).map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');

  function valueAt(points, year) {
    if (year <= points[0][0]) return points[0][1];
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[i + 1];
      if (year >= x0 && year <= x1) return lerp(y0, y1, (year - x0) / (x1 - x0));
    }
    return points[points.length - 1][1];
  }

  function draw() {
    const W = 680, H = 360;
    const padL = 46, padR = 16, padT = 16, padB = 34;
    const x0 = 2012, x1 = 2026;
    const year = parseFloat(slider.value);
    const fg = cssVar('--fg-mute');
    const rule = cssVar('--rule');

    ctx.clearRect(0, 0, W, H);

    const xPix = (yr) => padL + ((yr - x0) / (x1 - x0)) * (W - padL - padR);
    const yPix = (v) => padT + (1 - v / 100) * (H - padT - padB);

    // grid
    ctx.strokeStyle = rule;
    ctx.fillStyle = fg;
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 1;
    for (let v = 0; v <= 100; v += 25) {
      const y = yPix(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(v + '%', padL - 8, y + 3);
    }
    for (let yr = 2012; yr <= 2026; yr += 2) {
      const x = xPix(yr);
      ctx.textAlign = 'center';
      ctx.fillText(String(yr), x, H - padB + 16);
    }

    // series
    Object.values(SERIES).forEach(s => {
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.2;
      s.points.forEach(([yr, v], i) => {
        const x = xPix(yr), y = yPix(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      // extend flat to chart edge after last point
      const last = s.points[s.points.length - 1];
      ctx.lineTo(xPix(Math.min(x1, 2026)), yPix(last[1]));
      ctx.stroke();

      // ceiling dashed line
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(padL, yPix(s.ceiling));
      ctx.lineTo(W - padR, yPix(s.ceiling));
      ctx.stroke();
      ctx.restore();

      // current value dot
      const v = valueAt(s.points, Math.min(year, s.points[s.points.length - 1][0]));
      const cx = xPix(Math.min(year, x1)), cy = yPix(v);
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    });

    // current year marker
    const mx = xPix(year);
    ctx.strokeStyle = cssVar('--fg');
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(mx, padT);
    ctx.lineTo(mx, H - padB);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const rows = Object.values(SERIES).map(s => {
      const v = valueAt(s.points, Math.min(year, s.points[s.points.length - 1][0]));
      const sat = v >= s.ceiling - 1.5 ? ' (saturated)' : '';
      return `<div>${s.label}: <b>${v.toFixed(1)}%</b>${sat}</div>`;
    }).join('');
    readout.innerHTML = `<div>year = <b>${year.toFixed(1)}</b></div>${rows}`;
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 3: Why the gap opens (Goodhart's Law toy)
 * Slider = optimization pressure aimed specifically at the metric.
 * Measured score and true capability diverge as pressure rises.
 * ===================================================================== */
(function goodhartSim() {
  const host = document.getElementById('goodhart-sim');
  if (!host) return;

  host.insertAdjacentHTML('beforeend', `
    <div class="body">
      <canvas id="goodhartCanvas" width="440" height="300"></canvas>
      <div class="controls">
        <div>
          <label style="font-family:var(--sans);font-size:13px;color:var(--fg-mute);">Optimization pressure aimed at the metric</label>
          <input type="range" id="goodhartSlider" min="0" max="1" step="0.01" value="0.0"/>
        </div>
        <div class="readout" id="goodhartReadout"></div>
      </div>
    </div>
  `);

  const cv = host.querySelector('#goodhartCanvas');
  const ctx = devicePx(cv, 440, 300);
  const slider = host.querySelector('#goodhartSlider');
  const readout = host.querySelector('#goodhartReadout');
  const W = 440, H = 300;
  const padL = 40, padR = 14, padT = 16, padB = 28;
  const N = 60;

  function measured(x, p) {
    // Saturating curve whose steepness/ceiling grows with pressure p:
    // higher p means the metric gets exploited faster and harder.
    const k = lerp(1.6, 6.5, p);
    const ceil = lerp(70, 99, p);
    return ceil * (1 - Math.exp(-k * x));
  }
  function trueCapability(x, p) {
    // True capability barely cares about metric-targeted pressure.
    const k = 1.4;
    const ceil = lerp(70, 76, p);
    return ceil * (1 - Math.exp(-k * x));
  }

  function draw() {
    const p = parseFloat(slider.value);
    const fg = cssVar('--fg-mute');
    const rule = cssVar('--rule');
    const accent = cssVar('--accent');
    const mute2 = cssVar('--fg');

    ctx.clearRect(0, 0, W, H);
    const xPix = (t) => padL + t * (W - padL - padR);
    const yPix = (v) => padT + (1 - v / 100) * (H - padT - padB);

    ctx.strokeStyle = rule;
    ctx.fillStyle = fg;
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 1;
    for (let v = 0; v <= 100; v += 25) {
      const y = yPix(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(String(v), padL - 8, y + 3);
    }
    ctx.textAlign = 'center';
    ctx.fillText('training time →', (padL + W - padR) / 2, H - 6);

    function plot(fn, color, dashed) {
      ctx.beginPath();
      ctx.setLineDash(dashed ? [5, 4] : []);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const v = fn(t, p);
        const x = xPix(t), y = yPix(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    plot(trueCapability, fg, true);
    plot(measured, accent, false);

    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.fillText('measured score', padL + 6, yPix(measured(1, p)) - 8);
    ctx.fillStyle = fg;
    ctx.fillText('true capability', padL + 6, yPix(trueCapability(1, p)) + 16);

    const gap = measured(1, p) - trueCapability(1, p);
    readout.innerHTML = `
      <div>pressure = <b>${p.toFixed(2)}</b></div>
      <div>measured score → <b>${measured(1, p).toFixed(0)}</b></div>
      <div>true capability → <b>${trueCapability(1, p).toFixed(0)}</b></div>
      <div>gap → <b style="color:${accent}">${gap.toFixed(0)} pts</b></div>
    `;
  }

  slider.addEventListener('input', draw);
  draw();
})();

/* =====================================================================
 * Widget 4: Which fix, for which job?
 * Domain picker -> dot plot of metrics on human-agreement vs gameability.
 * ===================================================================== */
(function metricReliability() {
  const host = document.getElementById('metric-reliability');
  if (!host) return;

  const DOMAINS = {
    language: {
      label: 'Language',
      metrics: [
        { name: 'Static multiple-choice (MMLU)', agreement: 0.55, gameability: 0.8 },
        { name: 'Expert-validated (GPQA)', agreement: 0.75, gameability: 0.4 },
        { name: 'Live human arena (Chatbot Arena)', agreement: 0.85, gameability: 0.5 },
      ],
    },
    image: {
      label: 'Image generation',
      metrics: [
        { name: 'FID', agreement: 0.35, gameability: 0.6 },
        { name: 'GenEval (detector-graded)', agreement: 0.65, gameability: 0.3 },
        { name: 'Human preference model (HPSv2)', agreement: 0.8, gameability: 0.45 },
      ],
    },
    video: {
      label: 'Video generation',
      metrics: [
        { name: 'FVD', agreement: 0.3, gameability: 0.65 },
        { name: 'VBench (16 dimensions)', agreement: 0.6, gameability: 0.35 },
        { name: 'Human arena', agreement: 0.85, gameability: 0.45 },
      ],
    },
    math: {
      label: 'Math',
      metrics: [
        { name: 'Final-answer match (GSM8K)', agreement: 0.9, gameability: 0.85 },
        { name: 'Yearly-fresh exam (AIME)', agreement: 0.9, gameability: 0.25 },
        { name: 'Formal proof check (miniF2F)', agreement: 0.95, gameability: 0.05 },
      ],
    },
    robotics: {
      label: 'Robotics',
      metrics: [
        { name: 'Simulation task suite', agreement: 0.45, gameability: 0.55 },
        { name: 'Sim validated for real-world (SIMPLER)', agreement: 0.7, gameability: 0.35 },
        { name: 'Real-robot trial, standardized rig (ALOHA)', agreement: 0.95, gameability: 0.15 },
      ],
    },
  };

  host.insertAdjacentHTML('beforeend', `
    <div class="picker" id="mrPicker"></div>
    <canvas id="mrCanvas" width="640" height="320"></canvas>
    <div class="controls">
      <div class="readout" id="mrReadout">Higher and further left is better: tracks human judgment well, and is hard to game.</div>
    </div>
  `);

  const picker = host.querySelector('#mrPicker');
  const cv = host.querySelector('#mrCanvas');
  const ctx = devicePx(cv, 640, 320);
  const readout = host.querySelector('#mrReadout');

  Object.keys(DOMAINS).forEach((key, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' active' : '');
    b.textContent = DOMAINS[key].label;
    b.dataset.key = key;
    picker.appendChild(b);
  });

  const COLORS = ['#5fa9ff', '#ff9b4a', '#66bb6a'];

  function draw(key) {
    const W = 640, H = 320;
    const padL = 130, padR = 30, padT = 20, padB = 40;
    const fg = cssVar('--fg-mute');
    const rule = cssVar('--rule');

    ctx.clearRect(0, 0, W, H);
    const xPix = (g) => padL + g * (W - padL - padR);
    const yPix = (a) => padT + (1 - a) * (H - padT - padB);

    ctx.strokeStyle = rule;
    ctx.fillStyle = fg;
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(g => {
      const x = xPix(g);
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    });
    [0, 0.5, 1].forEach(a => {
      const y = yPix(a);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    });
    ctx.textAlign = 'center';
    ctx.fillText('gameability → (low to high)', (padL + W - padR) / 2, H - 12);
    ctx.save();
    ctx.translate(20, (padT + H - padB) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('agreement with human judgment →', 0, 0);
    ctx.restore();

    const metrics = DOMAINS[key].metrics;
    metrics.forEach((m, i) => {
      const x = xPix(m.gameability), y = yPix(m.agreement);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.fillStyle = cssVar('--fg');
      ctx.font = '12px sans-serif';
      ctx.textAlign = x > W - 170 ? 'right' : 'left';
      ctx.fillText(m.name, x > W - 170 ? x - 12 : x + 12, y + 4);
    });

    readout.innerHTML = metrics.map((m, i) =>
      `<span style="color:${COLORS[i % COLORS.length]}">●</span> ${m.name} — agreement ${(m.agreement * 100).toFixed(0)}%, gameability ${(m.gameability * 100).toFixed(0)}%`
    ).join('<br>');

    picker.querySelectorAll('.btn').forEach(btn => btn.classList.toggle('active', btn.dataset.key === key));
  }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    draw(btn.dataset.key);
  });

  draw(Object.keys(DOMAINS)[0]);
})();
