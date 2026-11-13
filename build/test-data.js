'use strict';
/* ============================================================
   Proof API · 数据模型校验(require 包装,Node 运行)
   用法: node build/test-data.js
   校验:提交数、id 唯一、状态派生一致性、重复组引用、
         日序列/直方图与总量守恒、KPI 汇总。
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + '\n;globalThis.__P = PROOF;', ctx);
const PROOF = ctx.__P;
if(!PROOF){ console.error('FAIL: data.js 未能导出 PROOF'); process.exit(1); }

const S = PROOF.submissions;
let fail = 0;
const assert = (cond, msg) => { if(!cond){ console.error('FAIL: ' + msg); fail++; } else console.log('PASS: ' + msg); };

assert(S.length === 48, '48 submissions, got ' + S.length);
assert(new Set(S.map(s => s.id)).size === 48, 'unique ids');
S.forEach(s => {
  assert(/^PA-\d{4}$/.test(s.id), 'id format ' + s.id);
  assert(s.score >= 0 && s.score <= 100, 'score range ' + s.id);
  assert(['verified', 'pending', 'rejected', 'flagged'].includes(s.status), 'status valid ' + s.id);
  if(s.dup){
    assert(s.status === 'flagged', 'dup => flagged ' + s.id);
    assert(!!PROOF.byId(s.dup.base), 'dup base exists ' + s.id + ' -> ' + s.dup.base);
    assert(/^G-\d{2}$/.test(s.dup.group), 'dup group format ' + s.id);
    assert(s.dup.sim >= 0.85, 'dup sim >= 0.85 ' + s.id);
  }
  assert(s.time >= new Date(2026, 9, 31) && s.time <= new Date(2026, 10, 13, 23, 59), 'time in window ' + s.id);
});
const flow = PROOF.dailyFlow();
assert(flow.length === 14, 'flow 14 rows');
const sumFlow = flow.reduce((a, r) => a + r.verified + r.pending + r.rejected + r.flagged, 0);
assert(sumFlow === 48, 'flow sums to 48, got ' + sumFlow);
const hist = PROOF.scoreHist();
assert(hist.reduce((a, b) => a + b.value, 0) === 48, 'hist sums to 48, got ' + hist.reduce((a, b) => a + b.value, 0));
const groups = PROOF.dupGroups();
assert(groups.length === 5, '5 dup groups, got ' + groups.length);
assert(S.filter(s => s.dup).length === 7, '7 dup members, got ' + S.filter(s => s.dup).length);
const K = PROOF.kpis();
assert(K.total === 48 && K.today > 0, 'kpis total=48 & today>0');
assert(Math.abs(K.verifiedRate + K.dupRate + (S.filter(s => s.status === 'pending').length + S.filter(s => s.status === 'rejected').length) / 48 * 100 - 100) < 0.01, 'status shares sum to 100%');

console.log('\n===== 汇总 =====');
console.log(JSON.stringify({
  kpis: { total: K.total, today: K.today, yest: K.yest, pending: K.pending, verifiedRate: +K.verifiedRate.toFixed(1), dupRate: +K.dupRate.toFixed(1), avg: +K.avg.toFixed(1) },
  hist,
  byAction: PROOF.byAction().map(a => ({ k: a.key, count: a.count, avg: +a.avg.toFixed(1), dupRate: +a.dupRate.toFixed(1) })),
  groups: groups.map(g => ({ id: g.id, type: g.type, sim: +g.sim.toFixed(3), base: g.base.id, dups: g.dups.map(d => d.id) })),
  subModels: PROOF.subModels()
}, null, 1));
process.exit(fail ? 1 : 0);
