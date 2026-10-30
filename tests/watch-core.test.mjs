import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../watch/watch-core.js';
const { createWatchStore, WatchController, WATCH_STORAGE_KEY, formatRemaining } = core;

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('a cast can have nominated tables separate from the current table and move through four tables', () => {
  const now = 1_800_000_000_000;
  const store = createWatchStore(memoryStorage(), now);
  const controller = new WatchController(store);
  const cast = controller.getCast('cast-riko');
  assert.deepEqual(cast.nominatedTableIds, ['table-6', 'table-7', 'table-8', 'table-10']);
  assert.equal(cast.currentTableId, 'table-7');
  assert.equal(controller.setDestination(cast.id, 'table-10'), true);
  assert.equal(controller.moveToDestination(cast.id, now + 2_000), true);
  assert.equal(cast.currentTableId, 'table-10');
  assert.equal(cast.nextTableId, 'table-6');
  assert.deepEqual(cast.nominatedTableIds, ['table-6', 'table-7', 'table-8', 'table-10']);
  assert.equal(cast.history[0].fromTableName, '7卓');
  assert.equal(cast.history[0].toTableName, '10卓');
});

test('floors and named tables can be added, renamed, removed, and assigned as a cast nomination', () => {
  const store = createWatchStore(memoryStorage(), 1_800_000_000_000);
  const controller = new WatchController(store);
  const floorId = controller.addFloor('VIPフロア');
  const tableId = controller.addTable(floorId, '個室A');
  assert.equal(controller.renameTable(tableId, 'VIP卓'), true);
  assert.equal(controller.getTableLabel(tableId), 'VIPフロア・VIP卓');
  assert.equal(controller.setNominatedTables('cast-aoi', ['table-1', tableId]), true);
  assert.deepEqual(controller.getCast('cast-aoi').nominatedTableIds, ['table-1', tableId]);
  assert.equal(controller.removeTable(floorId, tableId), true);
  assert.equal(controller.getTable(tableId), null);
  assert.deepEqual(controller.getCast('cast-aoi').nominatedTableIds, ['table-1']);
});

test('undo reverses the last move without changing the nominated table list', () => {
  const now = 1_800_000_000_000;
  const controller = new WatchController(createWatchStore(memoryStorage(), now));
  const cast = controller.getCast('cast-aoi');
  controller.setDestination(cast.id, 'table-5');
  controller.moveToDestination(cast.id, now + 1_000);
  assert.equal(cast.currentTableId, 'table-5');
  assert.equal(controller.undoLastMove(cast.id, now + 2_000), true);
  assert.equal(cast.currentTableId, 'table-1');
  assert.equal(cast.destinationTableId, 'table-5');
  assert.deepEqual(cast.nominatedTableIds, ['table-1', 'table-3', 'table-5']);
  assert.equal(cast.history[0].reason, '移動取り消し');
  assert.equal(controller.undoLastMove(cast.id, now + 3_000), false);
});

test('legacy table-number data is migrated without losing cast or timer state', () => {
  const storage = memoryStorage();
  const now = 1_800_000_000_000;
  storage.setItem(WATCH_STORAGE_KEY, JSON.stringify({
    version: 1,
    casts: [{
      id: 'old-cast', name: 'みお', nominatedTables: [1, 4], currentTable: 1,
      nextTable: 4, destinationTable: 4, history: [{ table: 1, at: now }],
    }],
    timers: { 'old-cast': { durationMs: 300_000, startedAt: now, endsAt: now + 300_000, alerted: false } },
  }));
  const controller = new WatchController(createWatchStore(storage, now));
  assert.equal(controller.getCast('old-cast').currentTableId, 'table-1');
  assert.deepEqual(controller.getCast('old-cast').nominatedTableIds, ['table-1', 'table-4']);
  assert.equal(controller.getRemainingMs('old-cast', now), 300_000);
  assert.equal(JSON.parse(storage.getItem(WATCH_STORAGE_KEY)).version, 2);
});

test('undo restores the timer snapshot shared with the native watch', () => {
  const now=1_800_000_000_000;
  const controller=new WatchController(createWatchStore(memoryStorage(),now));
  controller.startTimerDuration('cast-aoi',420000,now);
  const before=structuredClone(controller.state.timers['cast-aoi']);
  controller.setDestination('cast-aoi','table-5');
  controller.moveToDestination('cast-aoi',now+1000);
  controller.undoLastMove('cast-aoi',now+2000);
  assert.deepEqual(controller.state.timers['cast-aoi'],before);
});

test('timer stores start and end timestamps and restores remaining time after reload', () => {
  const now = 1_800_000_000_000;
  const storage = memoryStorage();
  const first = new WatchController(createWatchStore(storage, now));
  assert.equal(first.startTimer('cast-aoi', 5, now), true);
  assert.equal(first.getRemainingMs('cast-aoi', now + 60_000), 4 * 60_000);
  const restored = new WatchController(createWatchStore(storage, now + 60_000));
  assert.equal(restored.getRemainingMs('cast-aoi', now + 60_000), 4 * 60_000);
  assert.equal(JSON.parse(storage.getItem(WATCH_STORAGE_KEY)).timers['cast-aoi'].startedAt, now);
});

test('expired timer notifies once and remains visibly ended', () => {
  const now = 1_800_000_000_000;
  const events = [];
  const controller = new WatchController(createWatchStore(memoryStorage(), now), event => events.push(event));
  controller.startTimer('cast-yuna', 5, now);
  assert.equal(controller.tick(now + 5 * 60_000).length, 1);
  assert.equal(controller.tick(now + 6 * 60_000).length, 0);
  assert.equal(events.length, 1);
  assert.equal(controller.getRemainingMs('cast-yuna', now + 6 * 60_000), 0);
});

test('timer accepts a custom whole-minute duration within the supported range', () => {
  const now = 1_800_000_000_000;
  const controller = new WatchController(createWatchStore(memoryStorage(), now));
  assert.equal(controller.startTimer('cast-aoi', 17, now), true);
  assert.equal(controller.getRemainingMs('cast-aoi', now), 17 * 60_000);
  assert.equal(controller.startTimer('cast-aoi', 0, now), false);
  assert.equal(controller.startTimer('cast-aoi', 241, now), false);
});

test('timer can pause, resume, add time, and reset while preserving state', () => {
  const now = 1_800_000_000_000;
  const storage = memoryStorage();
  const controller = new WatchController(createWatchStore(storage, now));
  controller.startTimer('cast-aoi', 5, now);
  assert.equal(controller.pauseTimer('cast-aoi', now + 30_000), true);
  assert.equal(controller.getRemainingMs('cast-aoi', now + 300_000), 270_000);
  assert.deepEqual(controller.tick(now + 600_000), []);
  assert.equal(controller.addTimerTime('cast-aoi', 10_000, now + 600_000), true);
  assert.equal(controller.getRemainingMs('cast-aoi', now + 600_000), 280_000);

  const restored = new WatchController(createWatchStore(storage, now + 600_000));
  assert.equal(restored.getRemainingMs('cast-aoi', now + 900_000), 280_000);
  assert.equal(restored.resumeTimer('cast-aoi', now + 900_000), true);
  assert.equal(restored.getRemainingMs('cast-aoi', now + 910_000), 270_000);
  assert.equal(restored.resetTimer('cast-aoi', now + 910_000), true);
  assert.equal(restored.getRemainingMs('cast-aoi', now + 920_000), 310_000);
  assert.equal(restored.state.timers['cast-aoi'].paused, true);
});

test('remaining time is formatted as a countdown', () => {
  assert.equal(formatRemaining(60_001), '1:01');
  assert.equal(formatRemaining(0), '0:00');
  assert.equal(formatRemaining(null), '—:—');
});
