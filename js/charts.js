'use strict';
/* ============================================================
   Proof API · SVG 图表引擎(零依赖,浅色主题)
   遵循专业数据可视化规范:细线 2px、2px 表面间隙、选择性端标签、
   十字光标 + 悬浮提示、多系列必有图例、文字使用文本墨色。
   分类色 = 参考色板浅色步(固定顺序);顺序色阶 = 蓝色单色阶。
   ============================================================ */

const INK = {
  primary:   '#0b0b0b',
  secondary: '#52514e',
  muted:     '#898781',
  grid:      '#e1e0d9',
  axis:      '#c3c2b7',
  cross:     'rgba(11,11,11,0.30)',
  surface:   '#ffffff'
};
/* 蓝色顺序色阶(浅→深);顺序用法在浅色底上不浅于 #86b6ef(2.06:1) */
const RAMP_BLUE = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
/* 排行条形图:按名次由深到浅(值大 = 深) */
const RAMP_RANK = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#5598e7', '#6da7ec', '#86b6ef'];
/* 直方图:分数段由低到高,浅→深 */
const RAMP_HIST = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  if(parent) parent.appendChild(e);
  return e;
}
function fmt(v, d){
  if(v == null) return '—';
  return v.toLocaleString(LANG === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: d ?? 1, minimumFractionDigits: 0 });
}
function fmtK(v){
  const a = Math.abs(v);
  if(a >= 10000) return (v / 1000).toFixed(a < 100000 ? 1 : 0) + 'K';
  if(a >= 1000) return (v / 1000).toFixed(1) + 'K';
  return fmt(v, 2);
}
function niceTicks(min, max, count){
  if(!isFinite(min) || !isFinite(max)) return [0];
  if(min === max){ min -= 1; max += 1; }
  const span = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(span)));
  const norm = span / mag;
  let step;
  if(norm <= 1) step = 1; else if(norm <= 2) step = 2;
  else if(norm <= 2.5) step = 2.5; else if(norm <= 5) step = 5; else step = 10;
  step *= mag;
  const out = [];
  for(let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}
function mix(c1, c2, t){
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(c1), b = p(c2), x = Math.min(1, Math.max(0, t));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * x).toString(16).padStart(2, '0')).join('');
}
function lum(hex){
  const L = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * L[0] + 0.7152 * L[1] + 0.0722 * L[2];
}

/* ---- 全局悬浮提示 ---- */
function tipBox(){
  let t = document.getElementById('chart-tip');
  if(!t){
    t = document.createElement('div');
    t.id = 'chart-tip';
    t.className = 'tip';
    document.body.appendChild(t);
  }
  return t;
}
function showTip(container, ev, rows){
  const t = tipBox();
  t.innerHTML = '';
  rows.forEach(r => {
    if(r.title){
      const d = document.createElement('div');
      d.className = 'tip-title';
      d.textContent = r.title;
      t.appendChild(d);
      return;
    }
    const row = document.createElement('div');
    row.className = 'tip-row';
    const key = document.createElement('span');
    key.className = 'tip-key';
    key.style.background = r.color;
    const name = document.createElement('span');
    name.className = 'tip-name';
    name.textContent = r.name;
    const val = document.createElement('span');
    val.className = 'tip-val';
    val.textContent = r.value;
    row.appendChild(key); row.appendChild(name); row.appendChild(val);
    t.appendChild(row);
  });
  const cr = container.getBoundingClientRect();
  let x = ev.clientX - cr.left + 14;
  let y = ev.clientY - cr.top - 12;
  t.style.display = 'block';
  const tw = t.offsetWidth, th = t.offsetHeight;
  if(x + tw > cr.width - 4) x = ev.clientX - cr.left - tw - 14;
  if(y + th > cr.height - 4) y = ev.clientY - cr.top - th - 10;
  if(x < 4) x = 4; if(y < 4) y = 4;
  t.style.left = x + 'px';
  t.style.top = y + 'px';
}
function hideTip(){ tipBox().style.display = 'none'; }

/* ---- 折线图(多系列、端标签、十字光标) ---- */
function lineChart(container, cfg){
  container.classList.add('chart-box');
  const H = cfg.height || 280, W = 860, L = 44, R = cfg.right || 96, T = 22, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const n = cfg.x.length;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz' }, container);
  let lo = Infinity, hi = -Infinity;
  const scan = v => { if(v != null){ if(v < lo) lo = v; if(v > hi) hi = v; } };
  cfg.series.forEach(s => s.values.forEach(scan));
  (cfg.hlines || []).forEach(h => scan(h.y));
  const pad = (hi - lo) * 0.1 || 1;
  lo = Math.min(0, lo - pad); hi += pad;
  const X = i => L + pw * (n === 1 ? 0.5 : i / (n - 1));
  const Y = v => T + ph - (v - lo) / (hi - lo) * ph;

  niceTicks(lo, hi, 4).forEach(tk => {
    const y = Y(tk);
    el('line', { x1: L, y1: y, x2: W - R, y2: y, stroke: INK.grid, 'stroke-width': 1 }, svg);
    const tx = el('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: INK.muted }, svg);
    tx.textContent = cfg.fmtY ? cfg.fmtY(tk) : fmtK(tk);
  });
  el('line', { x1: L, y1: Y(lo), x2: W - R, y2: Y(lo), stroke: INK.axis, 'stroke-width': 1 }, svg);

  (cfg.hlines || []).forEach(h => {
    const y = Y(h.y);
    el('line', { x1: L, y1: y, x2: W - R, y2: y, stroke: h.color, opacity: 0.6, 'stroke-width': 1 }, svg);
    const tx = el('text', { x: L + 6, y: y - 6, 'font-size': 11, fill: h.color, opacity: 0.95 }, svg);
    tx.textContent = h.label;
  });

  const every = cfg.xEvery || Math.max(1, Math.round(n / 9));
  for(let i = 0; i < n; i += every){
    const tx = el('text', { x: X(i), y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: INK.muted }, svg);
    tx.textContent = cfg.x[i];
  }

  cfg.series.forEach((s, si) => {
    const pts = [];
    s.values.forEach((v, i) => { if(v != null) pts.push([X(i), Y(v)]); });
    if(pts.length > 1){
      const d = 'M ' + pts.map(p => p.join(',')).join(' L ');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: s.opacity != null ? s.opacity : 1 }, svg);
      if(s.area) el('path', { d: d + ` L ${pts[pts.length - 1][0]},${Y(lo)} L ${pts[0][0]},${Y(lo)} Z`, fill: s.color, opacity: 0.07 }, svg);
    }
    if(cfg.endSeries && !cfg.endSeries.includes(si)) return;
    let li = -1;
    for(let i = s.values.length - 1; i >= 0; i--) if(s.values[i] != null){ li = i; break; }
    if(li >= 0){
      const v = s.values[li], x = X(li), y = Y(v), onRight = li === n - 1;
      const tx = el('text', {
        x: onRight ? W - R + 8 : x - 8, y: y + 4,
        'text-anchor': onRight ? 'start' : 'end',
        'font-size': 12, 'font-weight': 600, fill: INK.primary
      }, svg);
      tx.textContent = cfg.fmtY ? cfg.fmtY(v) : fmt(v, 2);
      if(!onRight) el('line', { x1: x, y1: y, x2: x - 8, y2: y, stroke: INK.muted, 'stroke-width': 1, opacity: 0.5 }, svg);
      el('circle', { cx: x, cy: y, r: 4, fill: s.color, stroke: INK.surface, 'stroke-width': 2 }, svg);
    }
  });

  const cross = el('line', { y1: T, y2: T + ph, stroke: INK.cross, 'stroke-width': 1, style: 'display:none' }, svg);
  const hit = el('rect', { x: L, y: T, width: pw, height: ph, fill: 'transparent' }, svg);
  hit.addEventListener('mousemove', ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / pw * (n - 1))));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i));
    cross.setAttribute('style', 'display:block');
    const rows = [{ title: String(cfg.x[i]) }];
    cfg.series.forEach(s => {
      if(s.values[i] != null) rows.push({ name: s.name, color: s.color, value: cfg.fmtY ? cfg.fmtY(s.values[i]) : fmt(s.values[i], 2) });
    });
    showTip(container, ev, rows);
  });
  hit.addEventListener('mouseleave', () => { cross.setAttribute('style', 'display:none'); hideTip(); });
}

/* ---- 堆叠柱状图(2px 段间隙、顶部圆角、段内占比标签) ---- */
function stackedBars(container, cfg){
  const H = cfg.height || 300, W = 860, L = 44, R = 110, T = 22, B = 32;
  const pw = W - L - R, ph = H - T - B;
  const n = cfg.categories.length;
  const totals = cfg.categories.map((_, i) => cfg.series.reduce((a, s) => a + s.values[i], 0));
  const maxT = Math.max(1, ...totals);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz' }, container);
  const Y = v => T + ph - (v / maxT) * ph;
  const X = i => L + pw * (n === 1 ? 0.5 : i / (n - 1));
  const bw = Math.min(26, pw / n * 0.5);
  niceTicks(0, maxT, 4).forEach(tk => {
    const y = Y(tk);
    el('line', { x1: L, y1: y, x2: W - R, y2: y, stroke: INK.grid, 'stroke-width': 1 }, svg);
    const tx = el('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: INK.muted }, svg);
    tx.textContent = cfg.fmtY ? cfg.fmtY(tk) : fmtK(tk);
  });
  el('line', { x1: L, y1: Y(0), x2: W - R, y2: Y(0), stroke: INK.axis, 'stroke-width': 1 }, svg);
  cfg.categories.forEach((c, i) => {
    const tx = el('text', { x: X(i), y: H - 9, 'text-anchor': 'middle', 'font-size': 11, fill: INK.muted }, svg);
    tx.textContent = c;
    let cum = 0;
    const x0 = X(i) - bw / 2, x1 = X(i) + bw / 2;
    cfg.series.forEach((s, si) => {
      const v = s.values[i];
      const yTop = Y(cum + v), yBot = Y(cum);
      const first = si === 0, last = si === cfg.series.length - 1;
      const a = yTop + (last ? 0 : 1);   /* 2px 表面间隙 */
      const b = yBot - (first ? 0 : 1);
      const d = `M ${x0},${b} L ${x0},${a + 4} Q ${x0},${a} ${x0 + 4},${a} L ${x1 - 4},${a} Q ${x1},${a} ${x1},${a + 4} L ${x1},${b} Z`;
      el('path', { d, fill: s.color }, svg);
      const share = v / totals[i];
      if(share >= 0.1 && (b - a) >= 16){
        const tx2 = el('text', {
          x: (x0 + x1) / 2, y: (a + b) / 2 + 4,
          'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600,
          fill: lum(s.color) > 0.5 ? '#0b0b0b' : '#ffffff'
        }, svg);
        tx2.textContent = Math.round(share * 100) + '%';
      }
      cum += v;
    });
  });
  const cross = el('line', { y1: T, y2: T + ph, stroke: INK.cross, 'stroke-width': 1, style: 'display:none' }, svg);
  const hit = el('rect', { x: L, y: T, width: pw, height: ph, fill: 'transparent' }, svg);
  hit.addEventListener('mousemove', ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / pw * (n - 1))));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i));
    cross.setAttribute('style', 'display:block');
    const rows = [{ title: String(cfg.categories[i]) }];
    cfg.series.slice().reverse().forEach(s => {
      rows.push({ name: s.name, color: s.color, value: fmt(s.values[i], 1) + (cfg.unit || '') + ' · ' + Math.round(s.values[i] / totals[i] * 100) + '%' });
    });
    showTip(container, ev, rows);
  });
  hit.addEventListener('mouseleave', () => { cross.setAttribute('style', 'display:none'); hideTip(); });
}

/* ---- 排名横向条形图(蓝色顺序色阶,值大=深) ---- */
function rankedBars(container, cfg){
  const items = cfg.items.slice().sort((a, b) => b.value - a.value);
  const H = items.length * 44 + 16, W = 860;
  const labelW = 170, x0 = labelW + 16, xmax = W - 100;
  const maxV = Math.max(1, ...items.map(i => i.value));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz' }, container);
  items.forEach((it, i) => {
    const y = i * 44 + 8, h = 24;
    const w = Math.max(2, (xmax - x0) * (it.value / maxV));
    const tx = el('text', { x: labelW - 8, y: y + h - 7, 'text-anchor': 'end', 'font-size': 13, fill: INK.secondary }, svg);
    tx.textContent = it.label;
    const d = `M ${x0},${y} h ${Math.max(0, w - 4)} q 4,0 4,4 v ${h - 8} q 0,4 -4,4 h ${-(Math.max(0, w - 4))} z`;
    const bar = el('path', { d, fill: RAMP_RANK[Math.min(i, RAMP_RANK.length - 1)], opacity: 0.94 }, svg);
    const vx = el('text', { x: x0 + w + 8, y: y + h - 7, 'font-size': 13, 'font-weight': 600, fill: INK.primary }, svg);
    vx.textContent = cfg.fmtY ? cfg.fmtY(it.value) : fmt(it.value, 1);
    const hit = el('rect', { x: 0, y: i * 44, width: W, height: 44, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', ev => {
      bar.setAttribute('opacity', 1);
      showTip(container, ev, [{ name: it.label, color: RAMP_RANK[Math.min(i, RAMP_RANK.length - 1)], value: (cfg.fmtY ? cfg.fmtY(it.value) : fmt(it.value, 1)) + (cfg.unit || '') }]);
    });
    hit.addEventListener('mouseleave', () => { bar.setAttribute('opacity', 0.94); hideTip(); });
  });
}

/* ---- 增减对比条形图(蓝=增加 / 红=减少,中线为零) ---- */
function divergingBars(container, cfg){
  const items = cfg.items.slice().sort((a, b) => b.value - a.value);
  const H = items.length * 44 + 16, W = 860;
  const cx = W * 0.44, xmax = W - 120, xmin = 64;
  const maxAbs = Math.max(1, ...items.map(i => Math.abs(i.value)));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz' }, container);
  el('line', { x1: cx, y1: 8, x2: cx, y2: H - 28, stroke: INK.axis, 'stroke-width': 1 }, svg);
  const tx0 = el('text', { x: cx, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: INK.muted }, svg);
  tx0.textContent = '0';
  items.forEach((it, i) => {
    const y = i * 44 + 8, h = 24;
    const w = (it.value >= 0 ? xmax - cx : cx - xmin) * (Math.abs(it.value) / maxAbs);
    const x0 = it.value >= 0 ? cx : cx - w;
    const tx = el('text', {
      x: it.value >= 0 ? cx - 8 : cx + 8,
      y: y + h - 7,
      'text-anchor': it.value >= 0 ? 'end' : 'start',
      'font-size': 13, fill: INK.secondary
    }, svg);
    tx.textContent = it.label;
    const d = `M ${x0},${y} h ${Math.max(0, w - 4)} q 4,0 4,4 v ${h - 8} q 0,4 -4,4 h ${-(Math.max(0, w - 4))} z`;
    const color = it.value >= 0 ? '#2a78d6' : '#e34948';
    const bar = el('path', { d, fill: color, opacity: 0.94 }, svg);
    const vx = el('text', {
      x: it.value >= 0 ? x0 + w + 8 : x0 - 8,
      y: y + h - 7,
      'text-anchor': it.value >= 0 ? 'start' : 'end',
      'font-size': 13, 'font-weight': 600, fill: INK.primary
    }, svg);
    vx.textContent = (it.value > 0 ? '+' : '') + fmt(it.value, 1) + (cfg.unit || '');
    const hit = el('rect', { x: 0, y: i * 44, width: W, height: 44, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', ev => {
      bar.setAttribute('opacity', 1);
      showTip(container, ev, [{ name: it.label, color, value: (it.value > 0 ? '+' : '') + fmt(it.value, 1) + (cfg.unit || '') }]);
    });
    hit.addEventListener('mouseleave', () => { bar.setAttribute('opacity', 0.94); hideTip(); });
  });
}

/* ---- 直方图(顺序色阶,每柱直接标注) ---- */
function histogram(container, cfg){
  const H = 240, W = 860, L = 44, R = 20, T = 24, B = 34;
  const pw = W - L - R, ph = H - T - B;
  const n = cfg.buckets.length;
  const maxV = Math.max(1, ...cfg.buckets.map(b => b.value));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz' }, container);
  niceTicks(0, maxV, 4).forEach(tk => {
    const y = T + ph - (tk / maxV) * ph;
    el('line', { x1: L, y1: y, x2: W - R, y2: y, stroke: INK.grid, 'stroke-width': 1 }, svg);
    const tx = el('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: INK.muted }, svg);
    tx.textContent = fmtK(tk);
  });
  el('line', { x1: L, y1: T + ph, x2: W - R, y2: T + ph, stroke: INK.axis, 'stroke-width': 1 }, svg);
  const bw = pw / n * 0.62;
  const X = i => L + pw * (i + 0.5) / n;
  cfg.buckets.forEach((b, i) => {
    const x0 = X(i) - bw / 2, h = Math.max(2, (b.value / maxV) * ph);
    const y0 = T + ph - h;
    const d = `M ${x0},${T + ph} L ${x0},${y0 + 4} Q ${x0},${y0} ${x0 + 4},${y0} L ${x0 + bw - 4},${y0} Q ${x0 + bw},${y0} ${x0 + bw},${y0 + 4} L ${x0 + bw},${T + ph} Z`;
    const bar = el('path', { d, fill: RAMP_HIST[Math.min(i, RAMP_HIST.length - 1)], opacity: 0.94 }, svg);
    const tx = el('text', { x: X(i), y: y0 - 8, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 600, fill: INK.primary }, svg);
    tx.textContent = b.value;
    const tx2 = el('text', { x: X(i), y: H - 12, 'text-anchor': 'middle', 'font-size': 11.5, fill: INK.muted }, svg);
    tx2.textContent = b.label;
    const hit = el('rect', { x: x0 - 8, y: T, width: bw + 16, height: ph, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', ev => {
      bar.setAttribute('opacity', 1);
      showTip(container, ev, [{ title: String(b.label) }, { name: cfg.name || 'count', color: RAMP_HIST[Math.min(i, RAMP_HIST.length - 1)], value: b.value + (cfg.unit || '') }]);
    });
    hit.addEventListener('mouseleave', () => { bar.setAttribute('opacity', 0.94); hideTip(); });
  });
}

/* ---- 评分圆环(0–100,状态色,中心数值) ---- */
function scoreRing(container, value, color, size){
  size = size || 64;
  const r = size / 2 - 5.5, c = 2 * Math.PI * r;
  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, style: 'display:block' }, container);
  el('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: '#e6e6e2', 'stroke-width': 5.5 }, svg);
  el('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': 5.5,
    'stroke-linecap': 'round',
    'stroke-dasharray': `${(c * clamp01(value / 100)).toFixed(1)} ${c.toFixed(1)}`,
    transform: `rotate(-90 ${size / 2} ${size / 2})`
  }, svg);
  const tx = el('text', { x: size / 2, y: size / 2 + 1, 'text-anchor': 'middle', 'font-size': size > 60 ? 15 : 13, 'font-weight': 700, fill: INK.primary }, svg);
  tx.textContent = Math.round(value);
  if(size >= 64){
    const tx2 = el('text', { x: size / 2, y: size / 2 + 14, 'text-anchor': 'middle', 'font-size': 8, fill: INK.muted }, svg);
    tx2.textContent = '/ 100';
  }
}
function clamp01(v){ return Math.max(0, Math.min(1, v)); }

/* ---- 迷你趋势线 ---- */
function sparkline(container, values, color){
  const W = 110, H = 30;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark' }, container);
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = (hi - lo) || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * (W - 6) + 3).toFixed(1)},${(H - 5 - (v - lo) / span * (H - 10)).toFixed(1)}`);
  el('polyline', { points: pts.join(' '), fill: 'none', stroke: '#898781', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  const lx = W - 3, ly = H - 5 - (values[values.length - 1] - lo) / span * (H - 10);
  el('circle', { cx: lx, cy: ly, r: 2.6, fill: color, stroke: INK.surface, 'stroke-width': 1.5 }, svg);
}

/* ---- 图例(多系列必备) ---- */
function legend(container, series, opts){
  opts = opts || {};
  const box = document.createElement('div');
  box.className = 'legend';
  series.forEach(s => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const key = document.createElement('i');
    if(opts.type === 'bar'){ key.className = 'legend-swatch'; key.style.background = s.color; }
    else { key.className = 'legend-key'; key.style.background = s.color; }
    const nm = document.createElement('span');
    nm.className = 'legend-name';
    nm.textContent = s.name;
    item.appendChild(key); item.appendChild(nm);
    box.appendChild(item);
  });
  container.appendChild(box);
  return box;
}
