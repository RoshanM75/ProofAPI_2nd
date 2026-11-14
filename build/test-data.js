'use strict';
/* ============================================================
   Proof API · 数据模型校验(require 包装,Node 运行)
   用法: node build/test-data.js
   校验:提交数、id 唯一、状态派生一致性、重复组引用、
         日序列/直方图与总量守恒、KPI 汇总、
         组织-大类-城市分层聚合、缺口分析结构、
         行动地图数据交叉(mjs/静态数据)。
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
const mapSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'map-data.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + '\n' + mapSrc + '\n;globalThis.__P = PROOF; globalThis.__M = MAP_DATA;', ctx);
const PROOF = ctx.__P;
const MAP_DATA = ctx.__M;
if(!PROOF){ console.error('FAIL: data.js 未能导出 PROOF'); process.exit(1); }
if(!MAP_DATA || !MAP_DATA.countries){ console.error('FAIL: map-data.js 未能导出 MAP_DATA'); process.exit(1); }

const S = PROOF.submissions;
const TOTAL = 66;
let fail = 0;
const assert = (cond, msg) => { if(!cond){ console.error('FAIL: ' + msg); fail++; } else console.log('PASS: ' + msg); };

assert(S.length === TOTAL, TOTAL + ' submissions, got ' + S.length);
assert(new Set(S.map(s => s.id)).size === TOTAL, 'unique ids');
S.forEach(s => {
  assert(/^PA-\d{4}$/.test(s.id), 'id format ' + s.id);
  assert(s.score >= 0 && s.score <= 100, 'score range ' + s.id);
  assert(['verified', 'pending', 'rejected', 'flagged'].includes(s.status), 'status valid ' + s.id);
  assert(Number.isInteger(s.city) && s.city >= 0 && s.city < PROOF.cities.length, 'city valid ' + s.id);
  assert(s.org === null || !!PROOF.org(s.org), 'org valid ' + s.id + ' (' + (s.org || 'individual') + ')');
  assert(!!PROOF.action(s.action), 'action valid ' + s.id);
  assert(!!PROOF.category(PROOF.action(s.action).cat), 'category valid ' + s.id);
  if(s.dup){
    assert(s.status === 'flagged', 'dup => flagged ' + s.id);
    assert(!!PROOF.byId(s.dup.base), 'dup base exists ' + s.id + ' -> ' + s.dup.base);
    assert(/^G-\d{2}$/.test(s.dup.group), 'dup group format ' + s.id);
    assert(s.dup.sim >= 0.85, 'dup sim >= 0.85 ' + s.id);
  }
  assert(s.time >= new Date(2026, 9, 31) && s.time <= new Date(2026, 10, 13, 23, 59), 'time in window ' + s.id);
});
assert(S.some(s => !s.org), 'at least one individual submission exists');

const flow = PROOF.dailyFlow();
assert(flow.length === 14, 'flow 14 rows');
const sumFlow = flow.reduce((a, r) => a + r.verified + r.pending + r.rejected + r.flagged, 0);
assert(sumFlow === TOTAL, 'flow sums to ' + TOTAL + ', got ' + sumFlow);
const hist = PROOF.scoreHist();
assert(hist.reduce((a, b) => a + b.value, 0) === TOTAL, 'hist sums to ' + TOTAL + ', got ' + hist.reduce((a, b) => a + b.value, 0));
const groups = PROOF.dupGroups();
assert(groups.length === 5, '5 dup groups, got ' + groups.length);
assert(S.filter(s => s.dup).length === 7, '7 dup members, got ' + S.filter(s => s.dup).length);
const K = PROOF.kpis();
assert(K.total === TOTAL && K.today > 0, 'kpis total=' + TOTAL + ' & today>0');
assert(Math.abs(K.verifiedRate + K.dupRate + (S.filter(s => s.status === 'pending').length + S.filter(s => s.status === 'rejected').length) / TOTAL * 100 - 100) < 0.01, 'status shares sum to 100%');

/* ---- 分层聚合 ---- */
const countries = PROOF.countryRows();
assert(countries.length === 8, '8 countries with data, got ' + countries.length);
assert(countries.reduce((a, r) => a + r.count, 0) === TOTAL, 'countryRows sums to ' + TOTAL);
countries.forEach(r => {
  assert(PROOF.cities.some(c => c.country.en === r.key), 'country key matches a city country ' + r.key);
  const cities = PROOF.cityRows(r.key);
  assert(cities.length > 0, r.key + ' has cities');
  assert(cities.reduce((a, c) => a + c.count, 0) === r.count, r.key + ' cityRows sum matches country count');
  cities.forEach(c => {
    const orgs = PROOF.orgRows(c.key);
    assert(orgs.reduce((a, o) => a + o.count, 0) === c.count, r.key + '/' + c.name.en + ' orgRows sum matches city count');
    orgs.forEach(o => {
      assert(o.key === 'individual' || !!PROOF.org(o.key), 'org row key valid ' + o.key);
      assert(PROOF.scopeSubs(r.key, c.key, o.key).length === o.count, 'scopeSubs matches org row count');
    });
  });
});
assert(PROOF.scopeSubs(null, null, null).length === TOTAL, 'scopeSubs() returns all');

/* ---- 缺口分析结构 ---- */
PROOF.gapScopes().forEach(sc => {
  assert(sc.key === 'global' || countries.some(r => r.key === sc.key), 'gap scope valid ' + sc.key);
  assert(sc.verified >= 4, 'gap scope has >= 4 verified ' + sc.key);
});
let totalCards = 0;
PROOF.gapScopes().forEach(sc => {
  const cards = PROOF.gapAnalysis(sc.key);
  totalCards += cards.length;
  cards.forEach(cd => {
    assert(cd.kind === 'cat' || cd.kind === 'action', 'gap card kind valid');
    assert(cd.d >= 0 && cd.d <= 100 && cd.w >= 0 && cd.w <= 100, 'gap card share range');
    assert(!!PROOF.action(cd.suggest), 'gap card suggest action valid ' + cd.suggest);
    if(cd.kind === 'cat'){
      assert(!!PROOF.category(cd.domCat) && !!PROOF.category(cd.weakCat), 'gap cat keys valid');
    } else {
      assert(!!PROOF.category(cd.cat), 'gap cat valid');
      assert(!!PROOF.action(cd.dom) && !!PROOF.action(cd.weak), 'gap action keys valid');
    }
  });
});
assert(totalCards >= 4, 'gap analysis yields >= 4 cards across scopes, got ' + totalCards);

/* ---- 行动地图数据交叉 ---- */
const mapNames = new Set(MAP_DATA.countries.map(c => c.name));
countries.forEach(r => assert(mapNames.has(r.key), 'map has country ' + r.key));
PROOF.cities.forEach(c => assert(mapNames.has(c.country.en), 'map has city country ' + c.country.en));
assert(MAP_DATA.countries.every(c => typeof c.d === 'string' && c.d.startsWith('M') && c.d.endsWith('Z')), 'map paths well-formed');

console.log('\n===== 汇总 =====');
console.log(JSON.stringify({
  kpis: { total: K.total, today: K.today, yest: K.yest, pending: K.pending, verifiedRate: +K.verifiedRate.toFixed(1), dupRate: +K.dupRate.toFixed(1), avg: +K.avg.toFixed(1) },
  hist,
  byAction: PROOF.byAction().map(a => ({ k: a.key, cat: a.cat, count: a.count, avg: +a.avg.toFixed(1), dupRate: +a.dupRate.toFixed(1) })),
  byCategory: PROOF.byCategory().map(c => ({ k: c.key, count: c.count })),
  countries: countries.map(r => ({ k: r.key, count: r.count, v: r.verified, f: r.flagged, rj: r.rejected, p: r.pending })),
  gapScopes: PROOF.gapScopes().map(s => s.key),
  groups: groups.map(g => ({ id: g.id, type: g.type, sim: +g.sim.toFixed(3), base: g.base.id, dups: g.dups.map(d => d.id) })),
  subModels: PROOF.subModels()
}, null, 1));
process.exit(fail ? 1 : 0);
