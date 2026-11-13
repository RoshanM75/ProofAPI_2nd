'use strict';
/* ============================================================
   Proof API · 应用层(Team P05)
   总览 / 审核队列 / 重复检测 / 分析 / SNOOP 智能体
   演示交互:通过/驳回实时更新状态与总览;SNOOP 规则引擎调查。
   ============================================================ */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const ACT = Object.fromEntries(PROOF.actions.map(a => [a.key, a]));
const pad2 = n => String(n).padStart(2, '0');
const fmtTime = d => (d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());

/* ---- 通用组件 ---- */
function card(parent, title, sub, tools){
  const root = document.createElement('div');
  root.className = 'card';
  const head = document.createElement('div');
  head.className = 'card-head';
  const tl = document.createElement('div');
  const h3 = document.createElement('h3');
  h3.textContent = title;
  tl.appendChild(h3);
  if(sub){
    const p = document.createElement('p');
    p.className = 'card-sub';
    p.textContent = sub;
    tl.appendChild(p);
  }
  head.appendChild(tl);
  if(tools){ const tw = document.createElement('div'); tw.className = 'card-tools'; tools.forEach(x => tw.appendChild(x)); head.appendChild(tw); }
  root.appendChild(head);
  const body = document.createElement('div');
  body.className = 'card-body';
  root.appendChild(body);
  parent.appendChild(root);
  return { root, body };
}

function statTile(o){
  const s = document.createElement('div');
  s.className = 'stat';
  s.innerHTML = '<div class="stat-label">' + o.label + (o.hint ? ' <span class="stat-hint">' + o.hint + '</span>' : '') + '</div>' +
    '<div class="stat-value">' + o.value + '</div>' +
    '<div class="stat-delta ' + (o.deltaCls || 'plain') + '"><b>' + (o.deltaIcon || '') + '</b><span>' + (o.delta || '') + '</span></div>';
  if(o.spark){ const sp = document.createElement('div'); sp.className = 'stat-spark'; s.appendChild(sp); sparkline(sp, o.spark, o.sparkColor || '#2a78d6'); }
  return s;
}

function lvBadge(status){
  const st = PROOF.statuses[status];
  const b = document.createElement('span');
  b.className = 'lv lv-' + status;
  b.innerHTML = '<i>' + st.icon + '</i>' + t('status.' + status);
  b.style.color = st.text;
  return b;
}

function actTag(key){
  const a = ACT[key];
  const b = document.createElement('span');
  b.className = 'cat';
  b.textContent = a.icon + ' ' + t('act.' + key);
  b.style.color = a.color;
  b.style.background = a.color + '14';
  b.style.borderColor = a.color + '4d';
  return b;
}

function photoEl(sub, cls){
  const d = document.createElement('div');
  d.className = 'photo' + (cls ? ' ' + cls : '');
  d.innerHTML = photoSvg(sub);
  return d;
}

function subBars(subs){
  const box = document.createElement('div');
  box.className = 'subbars';
  [['auth', 'qc.auth'], ['action', 'qc.action'], ['loc', 'qc.loc']].forEach(([k, key]) => {
    const v = subs[k];
    const color = v < 60 ? PROOF.statuses.rejected.color : (v < 85 ? PROOF.statuses.pending.color : PROOF.statuses.verified.color);
    const row = document.createElement('div');
    row.className = 'subbar';
    row.innerHTML = '<span class="subbar-label">' + t(key) + '</span>' +
      '<i class="subbar-track"><em style="width:' + v + '%;background:' + color + '"></em></i>' +
      '<b>' + v + '</b>';
    box.appendChild(row);
  });
  return box;
}

function photoThumb(sub, w){
  const d = photoEl(sub, 'thumb');
  d.style.width = w + 'px';
  d.style.height = Math.round(w * 0.625) + 'px';
  return d;
}

function animateNumber(el, target, decimals){
  const t0 = performance.now(), dur = 900;
  function step(now){
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * e).toLocaleString(LANG === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: decimals ?? 0, minimumFractionDigits: 0 });
    if(p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ============================================================
   总览
   ============================================================ */
function buildOverview(){
  const sec = $('#tab-overview');
  sec.innerHTML = '';

  /* 英雄区 */
  const hero = document.createElement('div');
  hero.className = 'card hero';
  const k = PROOF.kpis();
  hero.innerHTML =
    '<div class="hero-kicker"><i class="pulse"></i>' + t('hero.kicker') + '</div>' +
    '<div class="hero-num" id="ov-total">0</div>' +
    '<div class="hero-label">' + t('hero.label') + '</div>' +
    '<div class="hero-sub">' + t('hero.sub') + '</div>' +
    '<div class="hero-badges">' +
      '<span class="badge badge-info">◈ ' + t('hero.badge1') + '</span>' +
      '<span class="badge"># ' + t('hero.badge2') + '</span>' +
      '<span class="badge">✦ ' + t('hero.badge3') + '</span>' +
    '</div>';
  sec.appendChild(hero);

  /* KPI 行 */
  const kpi = document.createElement('div');
  kpi.className = 'kpi-grid';
  kpi.id = 'ov-kpis';
  sec.appendChild(kpi);

  const renderKpis = () => {
    const K = PROOF.kpis();
    const flow = PROOF.dailyFlow();
    const sparkIn = flow.map(r => r.verified + r.pending + r.rejected + r.flagged);
    const sparkOk = flow.map(r => r.verified);
    kpi.innerHTML = '';
    const tiles = [
      { label: t('kpi.today'), value: fmtNum(K.today, 0), delta: t('kpi.todayNote'), deltaIcon: K.todayDelta > 0 ? '▲' : '▽', deltaCls: K.todayDelta >= 0 ? 'good' : 'bad', deltaVal: (K.todayDelta > 0 ? '+' : '') + K.todayDelta, spark: sparkIn },
      { label: t('kpi.pending'), value: fmtNum(K.pending, 0), delta: t('kpi.pendingNote'), deltaIcon: '⏳', deltaCls: K.pending > 0 ? 'warn' : 'plain', deltaVal: K.pending, spark: null },
      { label: t('kpi.rate'), value: fmtNum(K.verifiedRate, 1) + '%', delta: t('kpi.rateNote'), deltaIcon: '✓', deltaCls: 'good', deltaVal: '', spark: sparkOk },
      { label: t('kpi.dup'), value: fmtNum(K.dupRate, 1) + '%', delta: t('kpi.dupNote'), deltaIcon: '⚠', deltaCls: 'warn', deltaVal: '', spark: null },
      { label: t('kpi.avg'), value: fmtNum(K.avg, 1), delta: t('kpi.avgNote'), deltaIcon: '◈', deltaCls: 'plain', deltaVal: '', spark: null }
    ];
    tiles.forEach(o => {
      const el = statTile(o);
      const d = el.querySelector('.stat-delta span');
      if(d && o.deltaVal !== '') d.textContent = o.deltaVal + ' ' + o.delta;
      kpi.appendChild(el);
    });
    const heroNum = $('#ov-total');
    animateNumber(heroNum, K.total, 0);
    kpi.querySelectorAll('.stat-value').forEach((n, i) => { n.textContent = tiles[i].value; });
  };

  /* 图表区 */
  const g1 = document.createElement('div');
  g1.className = 'grid-2-1';
  sec.appendChild(g1);

  const flowCard = card(g1, t('ov.flow.title'), t('ov.flow.sub'));
  const histCard = card(g1, t('ov.hist.title'), t('ov.hist.sub'));

  const renderFlow = () => {
    const flow = PROOF.dailyFlow();
    flowCard.body.innerHTML = '';
    const series = ['verified', 'pending', 'rejected', 'flagged'].map(st => ({
      name: t('status.' + st), color: PROOF.statuses[st].color,
      values: flow.map(r => r[st])
    }));
    stackedBars(flowCard.body, { categories: flow.map(r => r.label), series });
    legend(flowCard.body, series.slice().reverse(), { type: 'bar' });
  };
  const renderHist = () => {
    histCard.body.innerHTML = '';
    histogram(histCard.body, { buckets: PROOF.scoreHist(), name: t('table.count') });
  };

  /* 行动类型 */
  const g2 = document.createElement('div');
  g2.className = 'grid-2';
  sec.appendChild(g2);
  const rankCard = card(g2, t('ov.rank.title'), t('ov.rank.sub'));
  const actCard = card(g2, t('ov.act.title'), t('ov.act.sub'));

  const renderRank = () => {
    rankCard.body.innerHTML = '';
    rankedBars(rankCard.body, {
      items: PROOF.byAction().map(a => ({ label: a.icon + ' ' + t('act.' + a.key), value: a.count })),
      fmtY: v => fmtNum(v, 0)
    });
  };
  const renderAct = () => {
    actCard.body.innerHTML = '';
    const tb = document.createElement('div');
    tb.className = 'chart-table';
    tb.innerHTML = '<table><thead><tr><th>' + t('table.action') + '</th><th>' + t('table.count') + '</th><th>' + t('table.avg') + '</th><th>' + t('table.dupRate') + '</th></tr></thead><tbody></tbody></table>';
    const tbody = tb.querySelector('tbody');
    PROOF.byAction().forEach(a => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + a.icon + ' ' + t('act.' + a.key) + '</td>' +
        '<td>' + a.count + '</td><td>' + fmtNum(a.avg, 1) + '</td><td>' + fmtNum(a.dupRate, 1) + '%</td>';
      tbody.appendChild(tr);
    });
    actCard.body.appendChild(tb);
  };

  /* 动态列表 */
  const g3 = document.createElement('div');
  g3.className = 'grid-2';
  sec.appendChild(g3);
  const feedCard = card(g3, t('ov.feed.title'), t('ov.feed.sub'));
  const dupCard = card(g3, t('ov.dupAlert.title'), t('ov.dupAlert.sub'));

  const renderFeeds = () => {
    feedCard.body.innerHTML = '';
    PROOF.recent(7).forEach(s => {
      const row = document.createElement('div');
      row.className = 'feed-row';
      const th = photoThumb(s, 64);
      const info = document.createElement('div');
      info.className = 'feed-info';
      const c = PROOF.city(s.city);
      const top = document.createElement('div');
      top.className = 'feed-top';
      const idEl = document.createElement('b');
      idEl.textContent = s.id;
      top.appendChild(idEl);
      top.appendChild(lvBadge(s.status));
      const meta = document.createElement('div');
      meta.className = 'feed-meta';
      meta.textContent = ACT[s.action].icon + ' ' + s.submitter + ' · ' + lb(c) + ' · ' + fmtTime(s.time);
      info.appendChild(top); info.appendChild(meta);
      row.appendChild(th); row.appendChild(info);
      row.addEventListener('click', () => switchTab('queue'));
      feedCard.body.appendChild(row);
    });
    dupCard.body.innerHTML = '';
    const groups = PROOF.dupGroups();
    if(!groups.length){ dupCard.body.innerHTML = '<p class="muted-text">—</p>'; return; }
    groups.slice(0, 2).forEach(g => {
      const row = document.createElement('div');
      row.className = 'insight';
      const isExact = g.type === 'exact';
      row.innerHTML = '<div class="insight-icon">' + (isExact ? '⛔' : '⚠') + '</div>' +
        '<p>' + t(isExact ? 'ov.dupAlert.item2' : 'ov.dupAlert.item1', { g: g.id, n: g.dups.length + 1, s: Math.round(g.sim * 100) }) + '</p>' +
        '<span class="lv lv-flagged" style="color:' + PROOF.statuses.flagged.text + '">' + (g.dups.length + 1) + t('dup.members') + '</span>';
      dupCard.body.appendChild(row);
    });
    const more = document.createElement('button');
    more.className = 'link-btn';
    more.textContent = t('ov.dupAlert.more');
    more.addEventListener('click', () => switchTab('dup'));
    dupCard.body.appendChild(more);
  };

  renderKpis(); renderFlow(); renderHist(); renderRank(); renderAct(); renderFeeds();
  /* 供状态变化后刷新 */
  window.__refreshOverview = () => { renderKpis(); renderFlow(); renderHist(); renderRank(); renderAct(); renderFeeds(); };
}

/* ============================================================
   审核队列
   ============================================================ */
let QS = { status: 'all', action: 'all' };

function buildQueue(){
  const sec = $('#tab-queue');
  sec.innerHTML = '';

  const head = card(sec, t('queue.title'), t('queue.sub'));
  head.root.classList.add('queue-head');

  const fRow = document.createElement('div');
  fRow.className = 'filter-row';
  fRow.innerHTML = '<span class="filter-label">' + t('queue.filter.status') + '</span><span class="chip-row" id="qc-f-status"></span>' +
    '<span class="filter-label">' + t('queue.filter.action') + '</span><span class="chip-row" id="qc-f-action"></span>';
  head.body.appendChild(fRow);

  const buildChips = () => {
    const sRow = $('#qc-f-status');
    sRow.innerHTML = '';
    [['all', 'queue.all'], ['verified', 'status.verified'], ['pending', 'status.pending'], ['flagged', 'status.flagged'], ['rejected', 'status.rejected']].forEach(([v, k]) => {
      const b = document.createElement('button');
      b.className = 'chip' + (QS.status === v ? ' active' : '');
      b.innerHTML = '<i style="background:' + (v === 'all' ? '#c3c2b7' : PROOF.statuses[v].color) + '"></i>' + t(k);
      b.addEventListener('click', () => { QS.status = v; buildChips(); renderQueue(); });
      sRow.appendChild(b);
    });
    const aRow = $('#qc-f-action');
    aRow.innerHTML = '';
    [['all', 'queue.all']].concat(PROOF.actions.map(a => [a.key, 'act.' + a.key])).forEach(([v, k]) => {
      const b = document.createElement('button');
      b.className = 'chip' + (QS.action === v ? ' active' : '');
      if(v === 'all') b.innerHTML = t(k);
      else b.innerHTML = '<span>' + ACT[v].icon + '</span>' + t(k);
      b.addEventListener('click', () => { QS.action = v; buildChips(); renderQueue(); });
      aRow.appendChild(b);
    });
  };

  const countEl = document.createElement('p');
  countEl.className = 'qc-count';
  sec.appendChild(countEl);

  const list = document.createElement('div');
  list.className = 'qc-list';
  list.id = 'qc-list';
  sec.appendChild(list);

  const hint = document.createElement('p');
  hint.className = 'qc-hint';
  hint.textContent = t('qc.hint.low');
  sec.appendChild(hint);

  function renderQueue(){
    const filtered = PROOF.submissions
      .filter(s => (QS.status === 'all' || s.status === QS.status) && (QS.action === 'all' || s.action === QS.action))
      .slice().sort((a, b) => b.score - a.score);
    countEl.textContent = t('queue.count', { n: PROOF.submissions.length, m: filtered.length });
    list.innerHTML = '';
    if(!filtered.length){ list.innerHTML = '<p class="muted-text">' + t('queue.empty') + '</p>'; return; }
    filtered.forEach(s => {
      const c = PROOF.city(s.city);
      const item = document.createElement('div');
      item.className = 'qc-card';
      if(s.status === 'flagged') item.classList.add('is-flag');

      const th = photoThumb(s, 132);
      const mid = document.createElement('div');
      mid.className = 'qc-mid';
      const top = document.createElement('div');
      top.className = 'qc-top';
      const idEl = document.createElement('b');
      idEl.className = 'qc-id';
      idEl.textContent = s.id;
      top.appendChild(idEl);
      top.appendChild(lvBadge(s.status));
      top.appendChild(actTag(s.action));
      const meta = document.createElement('div');
      meta.className = 'qc-meta';
      meta.textContent = s.submitter + ' · ' + lb(c) + ' · ' + fmtTime(s.time);
      mid.appendChild(top); mid.appendChild(meta);
      mid.appendChild(subBars(s.subs));
      if(s.dup){
        const d = document.createElement('div');
        d.className = 'qc-dup';
        d.innerHTML = '<b>⚠ ' + t('qc.dup') + '</b><span>' + t('qc.dup.group', { g: s.dup.group, s: Math.round(s.dup.sim * 100), base: s.dup.base }) + '</span>';
        mid.appendChild(d);
      }

      const right = document.createElement('div');
      right.className = 'qc-right';
      const ringBox = document.createElement('div');
      ringBox.className = 'qc-ring';
      scoreRing(ringBox, s.score, PROOF.statuses[s.status].color, 58);
      const ringLabel = document.createElement('div');
      ringLabel.className = 'qc-ring-label';
      ringLabel.textContent = t('qc.score');
      ringBox.appendChild(ringLabel);
      right.appendChild(ringBox);
      const btns = document.createElement('div');
      btns.className = 'qc-btns';
      if(s.status === 'pending' || s.status === 'flagged'){
        const ok = document.createElement('button');
        ok.className = 'btn btn-ok';
        ok.textContent = t('qc.approve');
        ok.addEventListener('click', ev => { ev.stopPropagation(); setVerdict(s.id, 'verified'); });
        const no = document.createElement('button');
        no.className = 'btn btn-no';
        no.textContent = t('qc.reject');
        no.addEventListener('click', ev => { ev.stopPropagation(); setVerdict(s.id, 'rejected'); });
        btns.appendChild(ok); btns.appendChild(no);
      } else {
        const view = document.createElement('button');
        view.className = 'btn btn-ghost';
        view.textContent = t('qc.view');
        view.addEventListener('click', ev => { ev.stopPropagation(); openDrawer(s.id); });
        btns.appendChild(view);
      }
      right.appendChild(btns);

      item.appendChild(th); item.appendChild(mid); item.appendChild(right);
      item.addEventListener('click', () => openDrawer(s.id));
      list.appendChild(item);
    });
  }

  function setVerdict(id, st){
    const s = PROOF.byId(id);
    s.status = st;
    closeDrawer();
    renderQueue();
    if(window.__refreshOverview) window.__refreshOverview();
  }
  window.__setVerdict = setVerdict;
  window.__renderQueue = renderQueue;

  buildChips();
  renderQueue();
}

/* ---- 明细抽屉 ---- */
let DRAWER = null;
function openDrawer(id){
  const s = PROOF.byId(id);
  if(!s) return;
  closeDrawer();
  const c = PROOF.city(s.city);
  const st = PROOF.statuses[s.status];

  const bd = document.createElement('div');
  bd.className = 'drawer-backdrop';
  bd.addEventListener('click', closeDrawer);
  const pn = document.createElement('div');
  pn.className = 'drawer';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeDrawer);

  const head = document.createElement('div');
  head.className = 'drawer-head';
  const hL = document.createElement('div');
  const hId = document.createElement('b');
  hId.textContent = s.id;
  hL.appendChild(hId);
  const hMeta = document.createElement('div');
  hMeta.className = 'drawer-head-meta';
  hMeta.textContent = s.submitter + ' · ' + lb(c) + ', ' + lb(c.country);
  hL.appendChild(hMeta);
  head.appendChild(hL);
  head.appendChild(lvBadge(s.status));
  head.appendChild(closeBtn);
  pn.appendChild(head);

  const photo = photoEl(s, 'big');
  photo.style.height = '230px';
  pn.appendChild(photo);

  const tags = document.createElement('div');
  tags.className = 'drawer-tags';
  tags.appendChild(actTag(s.action));
  if(s.dup){
    const d = document.createElement('span');
    d.className = 'badge badge-warn';
    d.innerHTML = '<b>⚠</b> ' + t('qc.dup.group', { g: s.dup.group, s: Math.round(s.dup.sim * 100), base: s.dup.base });
    tags.appendChild(d);
  }
  pn.appendChild(tags);

  const meta = document.createElement('div');
  meta.className = 'summary-meta';
  meta.innerHTML =
    '<div><span>' + t('drawer.time') + '</span><b>' + fmtTime(s.time) + '</b></div>' +
    '<div><span>' + t('drawer.device') + '</span><b>' + s.device + '</b></div>' +
    '<div><span>' + t('drawer.gps') + '</span><b style="color:' + (s.gpsOk ? PROOF.statuses.verified.text : PROOF.statuses.rejected.text) + '">' + t(s.gpsOk ? 'drawer.gps.ok' : 'drawer.gps.bad') + '</b></div>' +
    '<div><span>' + t('drawer.hash') + '</span><b>' + s.hash + '</b></div>';
  pn.appendChild(meta);

  const scores = document.createElement('div');
  scores.className = 'drawer-scores';
  const sHead = document.createElement('div');
  sHead.className = 'drawer-sub-title';
  sHead.textContent = t('drawer.scores');
  scores.appendChild(sHead);
  const sBody = document.createElement('div');
  sBody.className = 'drawer-scores-body';
  const ringBox = document.createElement('div');
  scoreRing(ringBox, s.score, st.color, 76);
  sBody.appendChild(ringBox);
  const bars = document.createElement('div');
  bars.className = 'drawer-subbars';
  bars.appendChild(subBars(s.subs));
  sBody.appendChild(bars);
  scores.appendChild(sBody);
  pn.appendChild(scores);

  const verdict = document.createElement('div');
  verdict.className = 'drawer-verdict';
  const vHead = document.createElement('div');
  vHead.className = 'drawer-sub-title';
  vHead.textContent = t('drawer.verdict');
  verdict.appendChild(vHead);
  const vBtns = document.createElement('div');
  vBtns.className = 'drawer-vbtns';
  if(s.status === 'pending' || s.status === 'flagged'){
    const ok = document.createElement('button');
    ok.className = 'btn btn-ok';
    ok.textContent = t('qc.approve');
    ok.addEventListener('click', () => window.__setVerdict(s.id, 'verified'));
    const no = document.createElement('button');
    no.className = 'btn btn-no';
    no.textContent = t('qc.reject');
    no.addEventListener('click', () => window.__setVerdict(s.id, 'rejected'));
    vBtns.appendChild(ok); vBtns.appendChild(no);
  } else {
    const state = document.createElement('p');
    state.className = 'drawer-state';
    state.innerHTML = '<b>' + t(s.status === 'verified' ? 'drawer.approved' : 'drawer.rejected') + '</b>';
    vBtns.appendChild(state);
  }
  verdict.appendChild(vBtns);
  pn.appendChild(verdict);

  if(s.status !== 'verified'){
    const snoopBtn = document.createElement('button');
    snoopBtn.className = 'btn btn-snoop';
    snoopBtn.textContent = '✦ ' + t('qc.snoop');
    snoopBtn.addEventListener('click', () => {
      closeDrawer();
      switchTab('snoop');
      setTimeout(() => snoopAsk(t('snoop.investigating', { id: s.id })), 350);
    });
    pn.appendChild(snoopBtn);
    const hintP = document.createElement('p');
    hintP.className = 'drawer-hint';
    hintP.textContent = t('drawer.snoop.hint');
    pn.appendChild(hintP);
  }
  const noteP = document.createElement('p');
  noteP.className = 'drawer-note';
  noteP.textContent = t('drawer.note');
  pn.appendChild(noteP);

  document.body.appendChild(bd);
  document.body.appendChild(pn);
  DRAWER = { bd, pn };
  window.addEventListener('keydown', escClose);
}
function escClose(ev){ if(ev.key === 'Escape') closeDrawer(); }
function closeDrawer(){
  if(DRAWER){ DRAWER.bd.remove(); DRAWER.pn.remove(); DRAWER = null; window.removeEventListener('keydown', escClose); }
}

/* ============================================================
   重复检测
   ============================================================ */
let DUP_STATE = {};

function buildDup(){
  const sec = $('#tab-dup');
  sec.innerHTML = '';
  DUP_STATE = {};

  const kpi = document.createElement('div');
  kpi.className = 'kpi-grid';
  const K = PROOF.kpis();
  const groups = PROOF.dupGroups();
  const dups = PROOF.submissions.filter(s => s.dup);
  const dupRate = fmtNum(dups.length / PROOF.submissions.length * 100, 1);
  const tiles = [
    { label: t('dup.kpi.groups'), value: fmtNum(groups.length, 0), delta: t('dup.kpi.groupsNote'), deltaIcon: '⚠', deltaCls: 'warn' },
    { label: t('dup.kpi.involved'), value: fmtNum(dups.length, 0), delta: t('dup.kpi.involvedNote', { p: dupRate }), deltaIcon: '⏳', deltaCls: 'warn' },
    { label: t('dup.kpi.blocked'), value: fmtNum(dups.length, 0), delta: t('dup.kpi.blockedNote'), deltaIcon: '⛔', deltaCls: 'bad' },
    { label: t('dup.kpi.precision'), value: '96.2%', delta: t('dup.kpi.precisionNote'), deltaIcon: '✓', deltaCls: 'good' }
  ];
  tiles.forEach(o => kpi.appendChild(statTile(o)));
  sec.appendChild(kpi);

  const list = document.createElement('div');
  list.className = 'dup-list';
  sec.appendChild(list);

  const render = () => {
    list.innerHTML = '';
    groups.forEach(g => {
      const state = DUP_STATE[g.id];
      const item = document.createElement('div');
      item.className = 'dup-card' + (state ? ' done' : '');
      const head = document.createElement('div');
      head.className = 'dup-card-head';
      const hL = document.createElement('div');
      const title = document.createElement('b');
      title.textContent = t('dup.group.title', { g: g.id });
      hL.appendChild(title);
      const type = document.createElement('span');
      type.className = 'dup-type';
      type.textContent = t('dup.type.' + g.type);
      hL.appendChild(type);
      head.appendChild(hL);
      const sim = document.createElement('div');
      sim.className = 'sim';
      sim.innerHTML = '<span>' + t('dup.sim') + '</span><i class="sim-track"><em style="width:' + Math.round(g.sim * 100) + '%"></em></i><b>' + fmtNum(g.sim * 100, 0) + '%</b>';
      head.appendChild(sim);
      item.appendChild(head);

      const cmp = document.createElement('div');
      cmp.className = 'cmp';
      const members = [g.base].concat(g.dups.slice().sort((a, b) => a.time - b.time));
      members.forEach(m => {
        const cell = document.createElement('div');
        cell.className = 'cmp-cell' + (m.id === g.base.id ? ' is-base' : '');
        const ph = photoEl(m, 'cmp-photo');
        const tag = document.createElement('div');
        tag.className = 'cmp-tag';
        tag.textContent = m.id === g.base.id ? t('dup.original') : t('dup.duplicate');
        const meta = document.createElement('div');
        meta.className = 'cmp-meta';
        const c = PROOF.city(m.city);
        const gap = m.id === g.base.id ? '' : (() => {
          const ms = m.time - g.base.time, h = Math.floor(ms / 3600e3);
          return h < 24 ? t('dup.gap.h', { h, m: Math.floor(ms / 60e3) % 60 }) : t('dup.gap.d', { d: Math.floor(h / 24), h: h % 24 });
        })();
        meta.innerHTML = '<span><b>' + m.id + '</b> · ' + m.submitter + '</span>' +
          '<span>' + lb(c) + ' · ' + fmtTime(m.time) + '</span>' +
          '<span>' + m.device + ' · hash ' + m.hash + (gap ? ' · ' + t('dup.timegap') + ' ' + gap : '') + '</span>';
        cell.appendChild(ph);
        cell.appendChild(tag);
        cell.appendChild(meta);
        cmp.appendChild(cell);
      });
      item.appendChild(cmp);

      const act = document.createElement('div');
      act.className = 'dup-actions';
      if(state){
        const chip = document.createElement('span');
        chip.className = 'lv lv-' + (state === 'confirmed' ? 'flagged' : 'verified');
        chip.style.color = state === 'confirmed' ? PROOF.statuses.flagged.text : PROOF.statuses.verified.text;
        chip.innerHTML = '<i>' + (state === 'confirmed' ? '⛔' : '✓') + '</i>' + t(state === 'confirmed' ? 'dup.confirmed' : 'dup.dismissed');
        act.appendChild(chip);
      } else {
        const ok = document.createElement('button');
        ok.className = 'btn btn-no';
        ok.textContent = t('dup.confirm');
        ok.addEventListener('click', () => { DUP_STATE[g.id] = 'confirmed'; render(); });
        const fp = document.createElement('button');
        fp.className = 'btn btn-ghost';
        fp.textContent = t('dup.false');
        fp.addEventListener('click', () => {
          DUP_STATE[g.id] = 'dismissed';
          g.dups.forEach(d => { d.status = 'pending'; });
          render();
          if(window.__renderQueue) window.__renderQueue();
          if(window.__refreshOverview) window.__refreshOverview();
        });
        act.appendChild(ok); act.appendChild(fp);
      }
      item.appendChild(act);
      list.appendChild(item);
    });

    const how = card(sec, t('dup.how'), t('dup.how.text'));
    how.root.style.marginTop = '14px';
    how.body.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'summary-text';
    p.textContent = t('dup.how.text');
    how.body.appendChild(p);
  };
  render();
}

/* ============================================================
   分析
   ============================================================ */
function buildAnalytics(){
  const sec = $('#tab-analytics');
  sec.innerHTML = '';

  const g1 = document.createElement('div');
  g1.className = 'grid-2-1';
  sec.appendChild(g1);
  const thruCard = card(g1, t('an.thru.title'), t('an.thru.sub'));
  const devCard = card(g1, t('an.dev.title'), t('an.dev.sub'));

  const tp = PROOF.throughput();
  thruCard.body.innerHTML = '';
  const s1 = { name: t('an.series.in'), color: '#2a78d6', values: tp.in };
  const s2 = { name: t('an.series.ok'), color: '#eb6834', values: tp.ok };
  lineChart(thruCard.body, { x: tp.labels, series: [s1, s2], fmtY: v => fmtNum(v, 0) });
  legend(thruCard.body, [s1, s2]);

  const globalAvg = PROOF.kpis().avg;
  devCard.body.innerHTML = '';
  divergingBars(devCard.body, {
    items: PROOF.byAction().map(a => ({ label: a.icon + ' ' + t('act.' + a.key), value: Math.round((a.avg - globalAvg) * 10) / 10 })),
    fmtY: v => fmtNum(v, 1)
  });

  const g2 = document.createElement('div');
  g2.className = 'grid-2';
  sec.appendChild(g2);
  const modelCard = card(g2, t('an.model.title'), t('an.model.sub'));
  const thCard = card(g2, t('an.th.title'), t('an.th.sub'));

  const sm = PROOF.subModels();
  modelCard.body.innerHTML = '';
  const tb = document.createElement('div');
  tb.className = 'chart-table';
  tb.innerHTML = '<table><thead><tr><th>' + t('table.model') + '</th><th>' + t('table.mean') + '</th><th>' + t('table.floor') + '</th></tr></thead><tbody></tbody></table>';
  [['auth', 'qc.auth'], ['action', 'qc.action'], ['loc', 'qc.loc']].forEach(([k, key]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + t(key) + '</td><td>' + fmtNum(sm[k].mean, 1) + '</td><td>' + fmtNum(sm[k].floor, 1) + '%</td>';
    tb.querySelector('tbody').appendChild(tr);
  });
  modelCard.body.appendChild(tb);

  thCard.body.innerHTML = '';
  const thBox = document.createElement('div');
  thBox.className = 'th-box';
  [['an.th.1', 'lv-verified'], ['an.th.2', 'lv-pending'], ['an.th.3', 'lv-rejected'], ['an.th.4', 'lv-flagged']].forEach(([k, cls]) => {
    const row = document.createElement('div');
    row.className = 'th-row';
    const b = document.createElement('span');
    b.className = 'lv ' + cls;
    const stMap = { 'lv-verified': 'verified', 'lv-pending': 'pending', 'lv-rejected': 'rejected', 'lv-flagged': 'flagged' };
    const st = PROOF.statuses[stMap[cls]];
    b.style.color = st.text;
    b.innerHTML = '<i>' + st.icon + '</i>';
    row.appendChild(b);
    const p = document.createElement('p');
    p.textContent = t(k);
    row.appendChild(p);
    thBox.appendChild(row);
  });
  thCard.body.appendChild(thBox);

  const g3 = document.createElement('div');
  g3.className = 'grid-2';
  sec.appendChild(g3);
  const reviewed = PROOF.submissions.filter(s => s.status === 'pending' || s.status === 'flagged').length;
  const agree = Math.max(0, reviewed - 1);
  const agreeRate = reviewed > 0 ? agree / reviewed * 100 : 0;
  const flipRate = 100 - agreeRate;
  const mCard = card(g3, t('an.matrix.title'), t('an.matrix.sub', { p: fmtNum(agreeRate, 1) }));
  mCard.body.innerHTML = '';
  const mg = document.createElement('div');
  mg.className = 'sim-out';
  mg.style.marginTop = '6px';
  mg.innerHTML =
    '<div class="sim-tile"><span>' + t('an.matrix.total') + '</span><b>' + reviewed + '</b><i>' + t('kpi.pendingNote') + '</i></div>' +
    '<div class="sim-tile"><span>' + t('an.matrix.agree') + '</span><b style="color:#006300">' + agree + '</b><i>' + fmtNum(agreeRate, 1) + '%</i></div>' +
    '<div class="sim-tile"><span>' + t('an.matrix.flip') + '</span><b style="color:#b3261e">1</b><i>' + fmtNum(flipRate, 1) + '%</i></div>';
  mCard.body.appendChild(mg);
  const mNote = document.createElement('p');
  mNote.className = 'summary-note';
  mNote.textContent = t('drawer.snoop.hint');
  mCard.body.appendChild(mNote);
}

/* ============================================================
   SNOOP 智能体
   ============================================================ */
function snoopSteps(sub){
  const dup = sub.dup;
  const city = PROOF.city(sub.city);
  const steps = [];

  steps.push({
    icon: '📋', title: 'snoop.step.read', chips: ['EXIF.read', 'GPS.resolve', 'SHA-256'],
    text: (LANG === 'zh' ? '读取 ' : 'Reading ') + sub.id + ':设备 ' + sub.device + ',GPS ' + t(sub.gpsOk ? 'drawer.gps.ok' : 'drawer.gps.bad') + ',指纹 ' + sub.hash + ',申报地点 ' + lb(city) + '(' + lb(city.country) + ')。'
  });

  steps.push({
    icon: '🔬', title: 'snoop.step.forensics', chips: ['ELA.analyze', 'NoiseMap.diff', 'JpegQC.probe'],
    text: sub.subs.auth < 70
      ? (LANG === 'zh' ? 'ELA 误差级分析检出重压缩痕迹,噪声分布与设备型号特征不一致;真实性得分 ' + sub.subs.auth + ',低于 70,存在后期加工风险。' : 'ELA analysis detects re-compression artifacts; noise distribution mismatches the device profile. Authenticity ' + sub.subs.auth + ' (< 70) — manipulation risk.')
      : (LANG === 'zh' ? 'ELA 与噪声谱分析未发现合成或重压缩痕迹,边缘梯度连续;真实性得分 ' + sub.subs.auth + '。' : 'ELA and noise-spectrum analysis show no compositing or re-compression; edge gradients are continuous. Authenticity ' + sub.subs.auth + '.')
  });

  let geoTxt;
  if(dup){
    geoTxt = LANG === 'zh'
      ? '坐标与原始提交 ' + dup.base + ' 一致(网格 ' + city.grid + '),但提交时间不同 — 支持"同一现场多次申报"假设。'
      : 'Coordinates match original ' + dup.base + ' (grid ' + city.grid + ') but the timestamp differs — consistent with a resubmission.';
  } else if(!sub.gpsOk || sub.subs.loc < 60){
    geoTxt = LANG === 'zh'
      ? 'GPS ' + (sub.gpsOk ? '有效但坐标' : '缺失/异常,坐标') + ' 落在 ' + city.grid + ' 边缘,与申报登记网格一致性得分 ' + sub.subs.loc + '(< 60),建议实地复核。'
      : 'GPS ' + (sub.gpsOk ? 'valid but coordinates fall' : 'missing/suspicious; coordinates fall') + ' at the edge of ' + city.grid + '; geolocation consistency ' + sub.subs.loc + ' (< 60) — field re-check advised.';
  } else {
    geoTxt = LANG === 'zh'
      ? '坐标位于 ' + lb(city) + ' 已登记行动区域(' + city.grid + '),地理一致性得分 ' + sub.subs.loc + ',与申报位置吻合。'
      : 'Coordinates sit inside ' + lb(city) + '\'s registered action zone (' + city.grid + '); geolocation consistency ' + sub.subs.loc + ' — matches the claim.';
  }
  steps.push({ icon: '📍', title: 'snoop.step.geo', chips: ['GeoRegistry.lookup', 'GridMatch.score', 'MapTiles.probe'], text: geoTxt });

  const regN = 40 + (strHash(sub.id) % 160);
  let regTxt;
  if(dup){
    regTxt = LANG === 'zh'
      ? '登记库 pHash 索引命中:与 ' + dup.base + ' 汉明距离 ' + (dup.type === 'exact' ? '0(哈希一致)' : '≤ 4') + ',相似度 ' + fmtNum(dup.sim * 100, 0) + '%。同一行动已存在有效登记,本次申报构成重复。'
      : 'Registry pHash index hit: Hamming distance vs ' + dup.base + ' = ' + (dup.type === 'exact' ? '0 (exact hash)' : '≤ 4') + ', similarity ' + fmtNum(dup.sim * 100, 0) + '%. A valid registration already exists — this submission is a duplicate.';
  } else {
    regTxt = LANG === 'zh'
      ? '登记库本季度该网格已登记 ' + regN + ' 个同类行动;本次提交与既有条目不重叠,未见重复登记。'
      : 'The registry shows ' + regN + ' similar actions registered in this grid this quarter; this submission overlaps none of them.';
  }
  steps.push({ icon: '🗂️', title: 'snoop.step.registry', chips: ['ClimateRegistry.query', 'pHash.search'], text: regTxt });

  let verdict;
  if(dup){
    verdict = {
      status: 'rejected', conf: Math.min(97, Math.round(88 + dup.sim * 10)),
      rationale: dup.type === 'exact'
        ? (LANG === 'zh' ? '哈希一致,同一文件重复提交。建议驳回并拦截碳积分发放。' : 'Exact hash — the same file was submitted twice. Recommend rejecting and blocking credit issuance.')
        : (LANG === 'zh' ? 'pHash 与视觉嵌入双通道命中,判定为同一照片经变换后重传。建议驳回并拦截积分发放。' : 'Both pHash and visual embeddings match — the same photo re-uploaded after transformation. Recommend rejecting and blocking credit issuance.'),
      evidence: [
        'pHash 64-bit · Hamming ' + (dup.type === 'exact' ? '0' : '3'),
        'similarity ' + fmtNum(dup.sim * 100, 0) + '% vs ' + dup.base,
        'same device · ' + sub.device,
        'ClimateRegistry: valid entry exists'
      ]
    };
  } else if(sub.subs.auth < 70 || sub.score < 60){
    verdict = {
      status: 'rejected', conf: 82,
      rationale: LANG === 'zh' ? '图像取证与综合评分均不达标,建议驳回。' : 'Forensics and composite score both fail the bar — recommend rejecting.',
      evidence: ['ELA re-compression artifacts', 'authenticity ' + sub.subs.auth, 'composite ' + sub.score + ' < 60']
    };
  } else if(!sub.gpsOk || sub.subs.loc < 60){
    verdict = {
      status: 'pending', conf: 68,
      rationale: LANG === 'zh' ? '地理一致性存疑,建议保留待复核并安排实地核验。' : 'Geolocation consistency is questionable — recommend holding for review with a field check.',
      evidence: ['GPS ' + (sub.gpsOk ? 'valid but outside registered grid' : 'missing/suspicious'), 'geolocation score ' + sub.subs.loc]
    };
  } else {
    verdict = {
      status: 'verified', conf: Math.min(96, Math.round(78 + sub.score / 5)),
      rationale: LANG === 'zh' ? '三维验证均通过,登记库无重复,建议通过。' : 'All three models pass and the registry shows no duplicate — recommend approving.',
      evidence: ['composite ' + sub.score, 'auth ' + sub.subs.auth + ' · action ' + sub.subs.action + ' · loc ' + sub.subs.loc, 'GeoRegistry grid match']
    };
  }
  return { steps, verdict };
}

let SNOOP_BUSY = false;

function buildSnoop(){
  const sec = $('#tab-snoop');
  sec.innerHTML = '';

  /* 流水线 */
  const pipeCard = card(sec, t('snoop.pipe.title'), t('snoop.pipe.sub'));
  const pipe = document.createElement('div');
  pipe.className = 'pipe';
  const nodes = ['snoop.pipe.1', 'snoop.pipe.2', 'snoop.pipe.3', 'snoop.pipe.4', 'snoop.pipe.5', 'snoop.pipe.6'];
  nodes.forEach((k, i) => {
    const n = document.createElement('div');
    n.className = 'pipe-node' + (i === 4 ? ' snoop-node' : '');
    n.innerHTML = '<span class="pipe-step">' + (i + 1) + '</span><b>' + t(k) + '</b>' +
      (i === 4 ? '<em>' + t('snoop.pipe.tag') + '</em>' : '');
    pipe.appendChild(n);
    if(i < nodes.length - 1){
      const arr = document.createElement('div');
      arr.className = 'pipe-arrow';
      arr.textContent = '→';
      pipe.appendChild(arr);
    }
  });
  pipeCard.body.appendChild(pipe);

  /* 对话区 */
  const grid = document.createElement('div');
  grid.className = 'chat-grid';
  sec.appendChild(grid);

  const chatCard = card(grid, t('snoop.chat.title'), t('snoop.chat.sub'));
  chatCard.root.classList.add('chat-panel');
  const log = document.createElement('div');
  log.className = 'chat-log';
  log.id = 'snoop-log';
  chatCard.body.appendChild(log);
  const input = document.createElement('div');
  input.className = 'chat-input';
  input.innerHTML = '<input id="snoop-in" type="text" placeholder="' + t('snoop.placeholder') + '"><button id="snoop-send">' + t('snoop.send') + '</button>';
  chatCard.body.appendChild(input);
  grid.appendChild(chatCard.root);

  const side = document.createElement('div');
  side.className = 'chat-side';
  const capCard = card(side, t('snoop.cap.title'), null);
  const caps = ['snoop.cap.1t', 'snoop.cap.2t', 'snoop.cap.3t', 'snoop.cap.4t'];
  capCard.body.innerHTML = '<ul class="cap-list">' + caps.map((k, i) =>
    '<li><b>' + t(k) + '</b>' + t(k.replace('t', 'd')) + '</li>').join('') + '</ul>';
  side.appendChild(capCard.root);

  const qCard = card(side, t('snoop.quick.title'), null);
  qCard.body.innerHTML = '<div class="chat-chips" style="padding:0">' +
    ['snoop.q1', 'snoop.q2', 'snoop.q3', 'snoop.q4', 'snoop.q5'].map((k, i) =>
      '<button data-q="' + i + '">' + t(k) + '</button>').join('') + '</div>';
  side.appendChild(qCard.root);
  grid.appendChild(side);

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const addUser = text => {
    const m = document.createElement('div');
    m.className = 'msg msg-user';
    m.innerHTML = '<div class="msg-avatar">U</div><div class="bubble"><div class="bubble-body"></div></div>';
    m.querySelector('.bubble-body').textContent = text;
    log.appendChild(m);
    scroll();
  };
  const addAIText = text => {
    const m = document.createElement('div');
    m.className = 'msg msg-ai';
    m.innerHTML = '<div class="msg-avatar">S</div><div class="bubble"><div class="bubble-body"></div></div>';
    m.querySelector('.bubble-body').textContent = text;
    log.appendChild(m);
    scroll();
    return m;
  };
  const addTyping = () => {
    const m = document.createElement('div');
    m.className = 'msg msg-ai';
    m.innerHTML = '<div class="msg-avatar">S</div><div class="bubble typing"><i></i><i></i><i></i></div>';
    log.appendChild(m);
    scroll();
    return m;
  };
  const addStep = stp => {
    const m = document.createElement('div');
    m.className = 'msg msg-ai';
    const chips = (stp.chips || []).map(c => '<span>' + c + '</span>').join('');
    m.innerHTML = '<div class="msg-avatar">S</div><div class="bubble snoop-step">' +
      '<div class="step-title">' + stp.icon + ' ' + t(stp.title) + '</div>' +
      '<div class="bubble-body"></div>' +
      (chips ? '<div class="bubble-src">' + chips + '</div>' : '') +
      '</div>';
    m.querySelector('.bubble-body').textContent = stp.text;
    log.appendChild(m);
    scroll();
  };
  const addVerdict = v => {
    const st = PROOF.statuses[v.status];
    const m = document.createElement('div');
    m.className = 'msg msg-ai';
    m.innerHTML = '<div class="msg-avatar">S</div><div class="bubble snoop-verdict">' +
      '<div class="step-title">📄 ' + t('snoop.verdict') + '</div>' +
      '<div class="verdict-row"><span class="lv lv-' + v.status + '" style="color:' + st.text + '"><i>' + st.icon + '</i>' + t('status.' + v.status) + '</span>' +
      '<span class="verdict-conf">' + t('snoop.conf') + ' <b>' + v.conf + '%</b></span></div>' +
      '<p class="verdict-why"></p>' +
      '<div class="evidence"><b>' + t('snoop.evidence') + '</b><ul>' + v.evidence.map(e => '<li>' + e + '</li>').join('') + '</ul></div>' +
      '</div>';
    m.querySelector('.verdict-why').textContent = v.rationale;
    log.appendChild(m);
    scroll();
  };

  function runInvestigation(id){
    const sub = PROOF.byId(id);
    if(SNOOP_BUSY) return;
    if(!sub){ addAIText(LANG === 'zh' ? '未找到提交 ' + id + '。试试 PA-1082。' : 'Submission ' + id + ' not found. Try PA-1082.'); return; }
    SNOOP_BUSY = true;
    const { steps, verdict } = snoopSteps(sub);
    const typing = addTyping();
    let delay = 950;
    steps.forEach((stp, i) => {
      setTimeout(() => {
        if(i === 0) typing.remove();
        addStep(stp);
        if(i === steps.length - 1) setTimeout(() => { addVerdict(verdict); SNOOP_BUSY = false; }, 700);
      }, delay);
      delay += 1100;
    });
  }

  function snoopAsk(text){
    addUser(text);
    const idMatch = text.match(/PA-\d+/i);
    if(idMatch){
      setTimeout(() => runInvestigation(idMatch[0].toUpperCase()), 420);
      return;
    }
    setTimeout(() => {
      const q = text.toLowerCase();
      let ans;
      if(/(重复|duplicate|dedup)/.test(q) && !/(如何|怎么|原理|how|work)/.test(q)){
        ans = t('dup.how.text');
      } else if(/(重复|duplicate|dedup|哈希|hash)/.test(q)){
        ans = t('dup.how.text');
      } else if(/(待复核|pending|awaiting)/.test(q)){
        const K = PROOF.kpis();
        ans = (LANG === 'zh' ? '当前有 ' + K.pending + ' 条提交待人工复核,另有 ' + (PROOF.submissions.filter(s => s.status === 'flagged').length) + ' 条重复待查。可在审核队列中处理。' : 'Currently ' + K.pending + ' submissions await human review, plus ' + (PROOF.submissions.filter(s => s.status === 'flagged').length) + ' duplicate flags. You can handle them in the Review Queue.');
      } else if(/(低于|below|< ?60|60 分)/.test(q)){
        ans = t('an.th.3') + ';' + t('an.th.4') + '。';
      } else if(/(角色|role|pipeline|流水线)/.test(q)){
        ans = LANG === 'zh' ? '我在验证流水线中位于"重复检测"之后、"结果发布"之前:对重复待查与低分提交做证据核查,输出可引用的判定建议,拦截误判与重复积分发放。' : 'I sit between duplicate detection and result publishing: I run evidence checks on duplicate flags and low-score submissions, and output citable verdict suggestions that intercept misjudgements and double credit issuance.';
      } else if(/(评分|score|模型|model)/.test(q)){
        ans = LANG === 'zh' ? '综合分 = 图像真实性 × 40% + 行动匹配度 × 35% + 地理一致性 × 25%。≥85 自动通过,60–85 人工复核,<60 自动驳回。' : 'Composite = authenticity × 40% + action match × 35% + geolocation × 25%. ≥85 auto-approved, 60–85 human review, <60 auto-rejected.';
      } else {
        ans = LANG === 'zh' ? '我可以调查具体提交(输入编号,如 PA-1082)、汇报待复核数量、解释重复检测原理与评分模型。' : 'I can investigate a specific submission (type an ID, e.g. PA-1082), report pending counts, and explain dedupe or scoring.';
      }
      addAIText(ans);
    }, 420);
  }
  window.__snoopAsk = snoopAsk;

  /* 欢迎语 */
  const wel = addAIText(t('snoop.welcome'));
  wel.querySelector('.bubble-body').style.whiteSpace = 'pre-line';

  $('#snoop-send').addEventListener('click', () => {
    const inp = $('#snoop-in');
    const v = inp.value.trim();
    if(!v) return;
    inp.value = '';
    snoopAsk(v);
  });
  $('#snoop-in').addEventListener('keydown', ev => { if(ev.key === 'Enter') $('#snoop-send').click(); });
  $$('#tab-snoop [data-q]').forEach(b => {
    b.addEventListener('click', () => snoopAsk(t('snoop.q' + (Number(b.dataset.q) + 1))));
  });
}

/* ============================================================
   导航 / 语言 / 启动
   ============================================================ */
function switchTab(id){
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  $$('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function applyStaticLabels(){
  document.title = LANG === 'zh' ? 'Proof API · 气候行动验证看板 — Team P05 高保真原型' : 'Proof API · Climate Action Verification Dashboard — Team P05 prototype';
  $('#top-ai').innerHTML = '<i class="pulse"></i>' + t('top.ai');
  $('#top-ver').textContent = t('top.ver');
  $('#lang-toggle').textContent = LANG === 'zh' ? 'EN' : '中文';
  $$('.tabs button').forEach(b => b.textContent = t('nav.' + b.dataset.tab));
  $$('.tabs button').forEach(b => {
    const dot = document.createElement('i');
    dot.className = 'tab-dot';
    dot.style.background = { overview: '#2a78d6', queue: '#eb6834', dup: '#ec835a', analytics: '#1baf7a', snoop: '#6250d6' }[b.dataset.tab];
    b.prepend(dot);
  });
  $('#footer-1').textContent = t('footer.1');
  $('#footer-2').textContent = t('footer.2');
  $('#footer-3').textContent = t('footer.3');
  $('#intro-sub').textContent = t('intro.sub');
  $('#intro-hint').textContent = t('intro.hint');
  const introTitle = document.querySelector('.intro-box h2');
  if(introTitle) introTitle.textContent = 'Proof API';
}

function buildAll(){
  buildOverview();
  buildQueue();
  buildDup();
  buildAnalytics();
  buildSnoop();
}

document.addEventListener('DOMContentLoaded', () => {
  applyStaticLabels();
  buildAll();

  $$('.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#lang-toggle').addEventListener('click', () => {
    LANG = LANG === 'zh' ? 'en' : 'zh';
    try { localStorage.setItem('proof-lang', LANG); } catch(e) {}
    applyStaticLabels();
    buildAll();
  });

  /* 启动画面 */
  const intro = $('#intro');
  const bar = $('#intro-bar');
  let p = 0;
  const timer = setInterval(() => {
    p = Math.min(100, p + 6 + Math.random() * 12);
    bar.style.width = p + '%';
    if(p >= 100){
      clearInterval(timer);
      setTimeout(() => intro.classList.add('done'), 260);
    }
  }, 70);
  intro.addEventListener('click', () => { clearInterval(timer); intro.classList.add('done'); });

  /* URL 参数:?tab=queue 直达页签 · ?nosplash 跳过启动画面 · ?drawer=PA-xxxx 打开明细 · ?snoop=PA-xxxx 自动发起调查(截图/调试用) */
  try {
    const qp = new URLSearchParams(location.search);
    const tab = qp.get('tab');
    if(tab && document.getElementById('tab-' + tab)) switchTab(tab, true);
    if(qp.get('nosplash')){ clearInterval(timer); intro.classList.add('done'); }
    const did = qp.get('drawer');
    if(did) setTimeout(() => openDrawer(did), 300);
    const sid = qp.get('snoop');
    if(sid){
      switchTab('snoop', true);
      setTimeout(() => window.__snoopAsk(t('snoop.investigating', { id: sid })), 500);
    }
  } catch(e) {}
});
