'use strict';
/* ============================================================
   Proof API · 数据模型(纯函数,确定性种子)
   Team P05 — 演示数据集:48 条照片提交(2026-10-31 ~ 2026-11-13)
   - 三模型验证分:图像真实性 / 行动匹配 / 地理一致性
   - 5 个重复组(哈希一致 / 感知哈希 / 裁剪滤镜变体)
   - 状态派生:重复→flagged · ≥85→verified · <60→rejected · 其余 pending
   ============================================================ */

function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

/* ---- 行动类型(分类色 = 参考色板浅色步,固定顺序,芯片均带图标+文字) ---- */
const ACTIONS = [
  { key:'wetland',  icon:'🌿', color:'#2a78d6', w:14, bases:{ auth:0.82, action:0.78, loc:0.80 } },
  { key:'ev',       icon:'⚡', color:'#eb6834', w:15, bases:{ auth:0.86, action:0.84, loc:0.82 } },
  { key:'cleanup',  icon:'♻️', color:'#1baf7a', w:18, bases:{ auth:0.90, action:0.90, loc:0.86 } },
  { key:'solar',    icon:'☀️', color:'#eda100', w:22, bases:{ auth:0.90, action:0.88, loc:0.85 } },
  { key:'retrofit', icon:'🏠', color:'#e87ba4', w:11, bases:{ auth:0.78, action:0.72, loc:0.78 } },
  { key:'afforest', icon:'🌳', color:'#008300', w:20, bases:{ auth:0.88, action:0.86, loc:0.84 } }
];

/* ---- 状态(状态色 = 固定状态色板;文字色为其深色步,浅色底上保证对比度) ---- */
const STATUS = {
  verified:{ color:'#0ca30c', text:'#006300', icon:'✓' },
  pending: { color:'#fab219', text:'#8a5300', icon:'⏳' },
  rejected:{ color:'#d03b3b', text:'#b3261e', icon:'✗' },
  flagged: { color:'#ec835a', text:'#b04a17', icon:'⚠' }
};

const CITIES = [
  { zh:'深圳', en:'Shenzhen', country:{zh:'中国',en:'China'}, grid:'grid-42' },
  { zh:'成都', en:'Chengdu', country:{zh:'中国',en:'China'}, grid:'grid-58' },
  { zh:'昆明', en:'Kunming', country:{zh:'中国',en:'China'}, grid:'grid-51' },
  { zh:'杭州', en:'Hangzhou', country:{zh:'中国',en:'China'}, grid:'grid-37' },
  { zh:'厦门', en:'Xiamen', country:{zh:'中国',en:'China'}, grid:'grid-39' },
  { zh:'青岛', en:'Qingdao', country:{zh:'中国',en:'China'}, grid:'grid-31' },
  { zh:'内罗毕', en:'Nairobi', country:{zh:'肯尼亚',en:'Kenya'}, grid:'grid-KE' },
  { zh:'雅加达', en:'Jakarta', country:{zh:'印度尼西亚',en:'Indonesia'}, grid:'grid-ID' },
  { zh:'麦德林', en:'Medellín', country:{zh:'哥伦比亚',en:'Colombia'}, grid:'grid-CO' }
];

const SUBMITTERS = ['林晓','王梓','陈雨桐','张伟','刘畅','赵一鸣','Amina Wanjiru','黄思远','李楠','Putri Rahma','周子墨','Diego Torres','何雨晴','孙启','Priya Nair','郑浩然','吴悠','徐嘉','Grace Kim','罗伊'];
const DEVICES = ['iPhone 15 Pro','Pixel 9','Redmi K70','Galaxy S24','Mi 14','OnePlus 12'];

/* ---- 生成 ---- */
function pickAction(rnd){
  const total = ACTIONS.reduce((a, x) => a + x.w, 0);
  let v = rnd() * total;
  for(const a of ACTIONS){ v -= a.w; if(v <= 0) return a; }
  return ACTIONS[0];
}
function randHash(rnd){
  let s = '';
  for(let i = 0; i < 8; i++) s += '0123456789abcdef'[Math.floor(rnd() * 16)];
  return s;
}
function mkScores(rnd, b){
  const j = x => clamp(Math.round(100 * (x + (rnd() - 0.5) * 0.16)), 20, 100);
  return { auth: j(b.auth), action: j(b.action), loc: j(b.loc) };
}
function overallOf(subs, jitter){
  return clamp(Math.round(0.4 * subs.auth + 0.35 * subs.action + 0.25 * subs.loc + jitter), 0, 100);
}

function buildSubmissions(){
  const rnd = mulberry32(20261113);
  const subs = [];
  for(let i = 0; i < 41; i++){
    const a = pickAction(rnd);
    const day = 13 - Math.floor(13 * Math.pow(rnd(), 1.55));
    const s = mkScores(rnd, a.bases);
    subs.push({
      id: 'PA-' + (1041 + i),
      submitter: SUBMITTERS[Math.floor(rnd() * SUBMITTERS.length)],
      action: a.key, city: Math.floor(rnd() * CITIES.length),
      time: new Date(2026, 9, 31 + day, 7 + Math.floor(rnd() * 13), Math.floor(rnd() * 60)),
      subs: s, score: overallOf(s, (rnd() - 0.5) * 4),
      device: DEVICES[Math.floor(rnd() * DEVICES.length)],
      gpsOk: rnd() > 0.10, hash: randHash(rnd), dup: null, status: null
    });
  }
  /* 定向构造:4 条低分(驳回演示)+ 2 条地理异常(强制复核 + SNOOP 演示) */
  const craft = [
    { i: 6, low: true },
    { i: 13, low: true, gps: false },
    { i: 21, low: true },
    { i: 32, low: true, gps: false },
    { i: 11, loc: true },
    { i: 27, loc: true, gps: false }
  ];
  craft.forEach(c => {
    const s = subs[c.i];
    if(c.low){
      s.subs = { auth: 38 + Math.round(rnd() * 14), action: 42 + Math.round(rnd() * 12), loc: 35 + Math.round(rnd() * 15) };
    }
    if(c.loc) s.subs.loc = 38 + Math.round(rnd() * 16);
    s.score = overallOf(s.subs, (rnd() - 0.5) * 4);
    if(c.gps !== undefined) s.gpsOk = c.gps;
  });
  /* 重复组:1 哈希一致 + 2 感知哈希 + 2 裁剪变体,共 7 条重复提交 */
  const DUP_PLAN = [
    { type:'exact', sim:0.99, dups:1 },
    { type:'perceptual', sim:0.93, dups:2 },
    { type:'perceptual', sim:0.91, dups:1 },
    { type:'crop', sim:0.88, dups:2 },
    { type:'crop', sim:0.87, dups:1 }
  ];
  const baseIdx = [2, 8, 16, 24, 30];
  baseIdx.forEach((bi, gi) => {
    const plan = DUP_PLAN[gi];
    const base = subs[bi];
    const gid = 'G-' + String(gi + 1).padStart(2, '0');
    for(let d = 0; d < plan.dups; d++){
      const sub = JSON.parse(JSON.stringify(base));
      sub.id = 'PA-' + (1041 + subs.length);
      do { sub.submitter = SUBMITTERS[Math.floor(rnd() * SUBMITTERS.length)]; }
      while(sub.submitter === base.submitter);
      sub.time = new Date(Math.min(TODAY.getTime(), base.time.getTime() + (d + 1) * (5 + Math.floor(rnd() * 40)) * 3600e3));
      if(plan.type !== 'exact') sub.hash = randHash(rnd);
      sub.score = clamp(Math.round(base.score + (rnd() - 0.5) * 4), 0, 100);
      sub.subs = {
        auth: clamp(base.subs.auth + Math.round(rnd() * 4 - 2), 0, 100),
        action: clamp(base.subs.action + Math.round(rnd() * 4 - 2), 0, 100),
        loc: clamp(base.subs.loc + Math.round(rnd() * 4 - 2), 0, 100)
      };
      sub.dup = { group: gid, sim: Math.min(1, plan.sim + rnd() * 0.02 - 0.01), base: base.id, type: plan.type };
      subs.push(sub);
    }
  });
  subs.forEach(s => {
    if(s.dup) s.status = 'flagged';
    else if(s.score >= 85) s.status = 'verified';
    else if(s.score < 60) s.status = 'rejected';
    else s.status = 'pending';
  });
  subs.sort((a, b) => b.time - a.time);
  return subs;
}

/* ============================================================
   聚合统计(纯函数,状态可变后仍可重算)
   ============================================================ */
const TODAY = new Date(2026, 10, 13, 18, 0);
const DAY0 = new Date(2026, 9, 31, 0, 0);
const dayIndex = d => Math.floor((d - DAY0) / 86400e3);
const sameDay = (a, b) => a.toDateString() === b.toDateString();

const PROOF = {
  actions: ACTIONS, statuses: STATUS, cities: CITIES,
  submissions: buildSubmissions(),
  today: TODAY,
  byId(id){ return this.submissions.find(s => s.id === id); },
  city(c){ return this.cities[c]; },
  action(k){ return this.actions.find(a => a.key === k); },

  kpis(){
    const S = this.submissions;
    const today = S.filter(s => sameDay(s.time, TODAY)).length;
    const yest = S.filter(s => sameDay(s.time, new Date(2026, 10, 12, 12, 0))).length;
    const cnt = st => S.filter(s => s.status === st).length;
    const pending = cnt('pending'), verified = cnt('verified'), dup = cnt('flagged');
    return {
      total: S.length, today, yest, todayDelta: today - yest, pending,
      verifiedRate: verified / S.length * 100,
      dupRate: dup / S.length * 100,
      avg: S.reduce((a, s) => a + s.score, 0) / S.length
    };
  },

  dailyFlow(){
    const rows = [];
    for(let i = 0; i < 14; i++){
      const d = new Date(2026, 9, 31 + i, 12, 0);
      rows.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), verified: 0, pending: 0, rejected: 0, flagged: 0 });
    }
    this.submissions.forEach(s => { rows[dayIndex(s.time)][s.status]++; });
    return rows;
  },

  throughput(){
    const labels = [], inV = [], okV = [];
    for(let i = 0; i < 14; i++){
      const d = new Date(2026, 9, 31 + i, 12, 0);
      labels.push((d.getMonth() + 1) + '/' + d.getDate());
      const day = this.submissions.filter(s => dayIndex(s.time) === i);
      inV.push(day.length);
      okV.push(day.filter(s => s.status === 'verified').length);
    }
    return { labels, in: inV, ok: okV };
  },

  scoreHist(){
    const buckets = [
      { label:'<60', min:0, max:59 },
      { label:'60–70', min:60, max:70 },
      { label:'70–80', min:71, max:80 },
      { label:'80–90', min:81, max:89 },
      { label:'≥90', min:90, max:100 }
    ];
    return buckets.map(b => ({ label: b.label, value: this.submissions.filter(s => s.score >= b.min && s.score <= b.max).length }));
  },

  byAction(){
    return this.actions.map(a => {
      const list = this.submissions.filter(s => s.action === a.key);
      const avg = list.length ? list.reduce((x, s) => x + s.score, 0) / list.length : 0;
      return {
        key: a.key, icon: a.icon, color: a.color, count: list.length,
        avg, dupRate: list.length ? list.filter(s => s.status === 'flagged').length / list.length * 100 : 0
      };
    });
  },

  dupGroups(){
    const map = {};
    this.submissions.forEach(s => {
      if(!s.dup) return;
      (map[s.dup.group] = map[s.dup.group] || []).push(s);
    });
    return Object.keys(map).sort().map(gid => {
      const dups = map[gid];
      const base = this.byId(dups[0].dup.base);
      return {
        id: gid,
        type: dups[0].dup.type,
        sim: Math.max(...dups.map(d => d.dup.sim)),
        base, dups
      };
    });
  },

  recent(n){
    return this.submissions.slice(0, n);
  },

  subModels(){
    const m = st => {
      const vals = this.submissions.map(s => s.subs[st]);
      return {
        mean: vals.reduce((a, v) => a + v, 0) / vals.length,
        floor: vals.filter(v => v < 60).length / vals.length * 100
      };
    };
    return { auth: m('auth'), action: m('action'), loc: m('loc') };
  }
};
