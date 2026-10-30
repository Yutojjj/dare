const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  let state = { members: [{ id: 'member', name: '確認用', months: { '2026-10': { keep: true } }, dailyMetrics: { '2026-10-29': { nominations: '9' }, '2026-10-30': { nominations: '3', freebacks: '1', untouched: 'keep' } } }], monthlyMetricFields: [{ id: 'metric_extra', name: '追加' }] };
  const ref = { get: async () => ({ exists: true, data: () => ({ state: structuredClone(state) }) }) };
  const db = { collection: () => ({ doc: () => ref }), runTransaction: async callback => callback({ get: ref.get, update: (target, update) => { assert.equal(target, ref); state = update.state; } }) };
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => 'server-time' };
  const context = { window: {}, firebase: { firestore } };
  vm.runInNewContext(fs.readFileSync('watch/watch-firebase.js', 'utf8'), context);
  return { api: context.window.WatchFirebase, state: () => state };
}
test('daily performance transaction preserves other days, fields and monthly data', async () => {
  const { api, state } = setup();
  await api.savePerformance('member', '2026-10-30', { nominations: 2, freebacks: -5, metric_extra: 1 });
  const m = state().members[0];
  assert.equal(m.dailyMetrics['2026-10-30'].nominations, '5');
  assert.equal(m.dailyMetrics['2026-10-30'].freebacks, '0');
  assert.equal(m.dailyMetrics['2026-10-30'].metric_extra, '1');
  assert.equal(m.dailyMetrics['2026-10-30'].untouched, 'keep');
  assert.equal(m.dailyMetrics['2026-10-29'].nominations, '9');
  assert.equal(m.months['2026-10'].keep, true);
  await api.savePerformance('member', '2026-10-30', { nominations: 1 });
  assert.equal(state().members[0].dailyMetrics['2026-10-30'].nominations, '6');
});
test('missing member and removed metric fail without updating the document', async () => {
  const { api, state } = setup(); const before = JSON.stringify(state());
  await assert.rejects(api.savePerformance('missing', '2026-10-30', { nominations: 1 }));
  await assert.rejects(api.savePerformance('member', '2026-10-30', { removed: 1 }));
  assert.equal(JSON.stringify(state()), before);
});
