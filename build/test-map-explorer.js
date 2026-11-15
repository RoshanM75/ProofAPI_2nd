'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8') + ';this.P=PROOF;', context);
const P = context.P,
  all = P.submissions;
const dates = [...new Set(all.map((s) => P.actionDate(s)))];
for (const date of [...dates, '2000-01-01']) {
  const day = P.scopeSubs(null, null, null, date);
  assert.equal(day.length, all.filter((s) => P.actionDate(s) === date).length);
  assert.equal(
    P.countryRows(day).reduce((a, r) => a + r.count, 0),
    day.length,
  );
  assert.equal(
    Object.values(P.mapCountryStats(day)).reduce((a, r) => a + r.total, 0),
    day.length,
  );
  for (const country of P.countryRows()) {
    const scope = P.scopeSubs(country.key, null, null, date);
    assert.equal(
      P.cityRows(country.key, day).reduce((a, r) => a + r.count, 0),
      scope.length,
    );
    for (const city of P.cityRows(country.key)) {
      const local = P.scopeSubs(country.key, city.key, null, date);
      assert.ok(local.every((s) => P.actionDate(s) === date && s.city === city.key));
      assert.equal(
        P.orgRows(city.key, day).reduce((a, r) => a + r.count, 0),
        local.length,
      );
      const report = P.actionCoverage(local),
        actions = report.groups.flatMap((g) => g.actions);
      assert.equal(actions.length, 6);
      assert.equal(new Set(actions.map((a) => a.key)).size, 6);
      assert.equal(
        actions.reduce((a, r) => a + r.verified, 0),
        report.verified,
      );
      assert.equal(
        actions.reduce((a, r) => a + r.recorded, 0),
        local.length,
      );
      assert.ok(actions.every((a) => a.verified <= a.recorded));
      assert.ok(Math.abs(actions.reduce((a, r) => a + r.share, 0) - (report.verified ? 100 : 0)) < 0.000001);
    }
  }
  assert.ok(P.gapScopes(day).every((s) => s.key === 'global' || s.verified >= 4));
}
const fixture = [...Array(5)].map((_, i) => ({
  ...all[0],
  id: 'test-' + i,
  action: 'cleanup',
  status: i < 4 ? 'verified' : 'pending',
}));
const report = P.actionCoverage(fixture),
  actions = report.groups.flatMap((g) => g.actions);
assert.equal(actions.find((a) => a.key === 'cleanup').verified, 4);
assert.equal(actions.find((a) => a.key === 'cleanup').recorded, 5);
assert.equal(actions.find((a) => a.key === 'cleanup').share, 100);
assert.equal(
  actions.filter((a) => a.verified === 0).length,
  5,
  'cleanup-only records expose five other planning options',
);
assert.equal(
  P.actionCoverage(fixture.map((s) => ({ ...s, status: 'pending' }))).verified,
  0,
  'unverified records cannot imply completed coverage',
);
assert.equal(P.gapAnalysis('global', []).length, 0, 'empty date cannot inherit all-time gaps');
assert.equal(P.scopeSubs('Canada', null, null).length, 0);
const n = P.mapCountryStats().China.total;
const added = { ...all[0], city: 0, action: 'retrofit', status: 'verified', time: new Date(2026, 10, 20) };
P.submissions.push(added);
assert.equal(P.mapCountryStats().China.total, n + 1, 'aggregations remain live after new submissions');
assert.equal(P.scopeSubs('China', 0, null, '2026-11-20').length, 1);
P.submissions.pop();
console.log(
  'PASS: map date/location/org scopes, live aggregations, coverage denominators and empty/small samples',
);
