(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WatchCore = api;
})(globalThis, function () {
  'use strict';

  const WATCH_STORAGE_KEY = 'cast-watch-v1';
  const TIMER_PRESETS = Object.freeze([5, 7, 12]);

  function defaultFloors() {
    return [
      { id: 'floor-1', name: '1階', tables: [1, 2, 3, 4, 5].map(number => ({ id: `table-${number}`, name: `${number}卓` })) },
      { id: 'floor-2', name: '2階', tables: [6, 7, 8, 9, 10].map(number => ({ id: `table-${number}`, name: `${number}卓` })) },
    ];
  }

  function createSeedState(now = Date.now()) {
    return {
      version: 2,
      floors: defaultFloors(),
      casts: [
        {
          id: 'cast-aoi', name: 'あおい',
          nominatedTableIds: ['table-1', 'table-3', 'table-5'],
          currentTableId: 'table-1', nextTableId: 'table-3', destinationTableId: 'table-3',
          undoStack: [],
          history: [{ tableId: 'table-1', tableName: '1卓', at: now - 8 * 60_000, reason: '初期状態' }],
        },
        {
          id: 'cast-yuna', name: 'ゆな',
          nominatedTableIds: ['table-2', 'table-4'],
          currentTableId: 'table-4', nextTableId: 'table-2', destinationTableId: 'table-2',
          undoStack: [],
          history: [{ tableId: 'table-4', tableName: '4卓', at: now - 5 * 60_000, reason: '初期状態' }],
        },
        {
          id: 'cast-riko', name: 'りこ',
          nominatedTableIds: ['table-6', 'table-7', 'table-8', 'table-10'],
          currentTableId: 'table-7', nextTableId: 'table-8', destinationTableId: 'table-8',
          undoStack: [],
          history: [{ tableId: 'table-7', tableName: '7卓', at: now - 3 * 60_000, reason: '初期状態' }],
        },
      ],
      timers: {
        'cast-aoi': { durationMs: 7 * 60_000, startedAt: now - 45_000, endsAt: now + 6 * 60_000 + 15_000, alerted: false },
      },
    };
  }

  function isValidState(value) {
    return value && value.version === 2 && Array.isArray(value.floors) && Array.isArray(value.casts)
      && value.timers && typeof value.timers === 'object';
  }

  function legacyTableId(value) {
    if (typeof value === 'string' && /^table-\d+$/.test(value)) return value;
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? `table-${number}` : null;
  }

  function migrateLegacyState(oldState) {
    const seed = createSeedState();
    const found = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    (oldState.casts ?? []).forEach(cast => {
      [...(cast.nominatedTables ?? []), cast.currentTable, cast.nextTable, cast.destinationTable]
        .forEach(value => { const number = Number(value); if (Number.isInteger(number) && number > 0) found.add(number); });
    });
    const numbers = [...found].sort((a, b) => a - b);
    seed.floors = [
      { id: 'floor-1', name: '1階', tables: numbers.filter(number => number <= 5).map(number => ({ id: `table-${number}`, name: `${number}卓` })) },
      { id: 'floor-2', name: '2階', tables: numbers.filter(number => number > 5).map(number => ({ id: `table-${number}`, name: `${number}卓` })) },
    ];
    seed.casts = (oldState.casts ?? []).map(cast => ({
      id: cast.id,
      name: cast.name ?? 'キャスト',
      nominatedTableIds: (cast.nominatedTables ?? []).map(legacyTableId).filter(Boolean),
      currentTableId: legacyTableId(cast.currentTable),
      nextTableId: legacyTableId(cast.nextTable),
      destinationTableId: legacyTableId(cast.destinationTable),
      history: (cast.history ?? []).map(entry => {
        if (entry.to != null) return {
          fromTableId: legacyTableId(entry.from), fromTableName: `${entry.from}卓`,
          toTableId: legacyTableId(entry.to), toTableName: `${entry.to}卓`, at: entry.at, reason: entry.reason ?? '卓移動',
        };
        const tableId = legacyTableId(entry.table);
        return { tableId, tableName: entry.table == null ? '—卓' : `${entry.table}卓`, at: entry.at, reason: entry.reason ?? '初期状態' };
      }),
      undoStack: (cast.history ?? []).filter(entry => entry.to != null).slice().reverse().map(entry => ({
        fromTableId: legacyTableId(entry.from), toTableId: legacyTableId(entry.to), at: entry.at,
      })),
    }));
    seed.timers = oldState.timers ?? {};
    return seed;
  }

  function makeId(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${random}`;
  }

  function createWatchStore(storage = globalThis.localStorage, now = Date.now()) {
    let memoryValue = null;
    const safeStorage = storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : null;

    function save(state) {
      const raw = JSON.stringify(state);
      memoryValue = raw;
      try { safeStorage?.setItem(WATCH_STORAGE_KEY, raw); } catch { /* Keep using the in-memory copy. */ }
      return state;
    }

    function read() {
      try {
        const raw = safeStorage?.getItem(WATCH_STORAGE_KEY) ?? memoryValue;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (isValidState(parsed)) {
            parsed.casts.forEach(cast => { if (!Array.isArray(cast.undoStack)) cast.undoStack = []; });
            return parsed;
          }
          if (parsed?.version === 1 && Array.isArray(parsed.casts)) return save(migrateLegacyState(parsed));
        }
      } catch { /* Fall back to a fresh local demo state. */ }
      return save(createSeedState(now));
    }

    return { state: read(), save };
  }

  class WatchController {
    constructor(store, onTimerEnd = () => {}) {
      this.store = store;
      this.onTimerEnd = onTimerEnd;
    }

    get state() { return this.store.state; }
    getCast(castId) { return this.state.casts.find(cast => cast.id === castId) ?? null; }
    addCast(name, castId = null, nominatedTableIds = []) {
      const cleanName = String(name ?? '').trim();
      const available = new Set(this.state.floors.flatMap(floor => floor.tables.map(table => table.id)));
      const route = [...new Set(nominatedTableIds)].filter(id => available.has(id));
      if (!cleanName || route.length < 1 || (castId && this.getCast(castId))) return null;
      const firstTable = this.getTable(route[0]);
      const cast = {
        id: castId || makeId('cast'),
        name: cleanName,
        nominatedTableIds: route,
        currentTableId: route[0],
        nextTableId: route[1] ?? null,
        destinationTableId: route[1] ?? null,
        undoStack: [],
        history: [{ tableId: route[0], tableName: `${firstTable.floorName}・${firstTable.name}`, at: Date.now(), reason: '初期状態' }],
      };
      this.state.casts.push(cast);
      this.store.save(this.state);
      return cast.id;
    }
    renameCast(castId, name) {
      const cast = this.getCast(castId), cleanName = String(name ?? '').trim();
      if (!cast || !cleanName) return false;
      cast.name = cleanName;
      this.store.save(this.state);
      return true;
    }
    removeCast(castId) {
      if (!this.getCast(castId)) return false;
      this.state.casts = this.state.casts.filter(cast => cast.id !== castId);
      delete this.state.timers[castId];
      this.store.save(this.state);
      return true;
    }
    getFloor(floorId) { return this.state.floors.find(floor => floor.id === floorId) ?? null; }
    getTable(tableId) {
      for (const floor of this.state.floors) {
        const table = floor.tables.find(item => item.id === tableId);
        if (table) return { ...table, floorId: floor.id, floorName: floor.name };
      }
      return null;
    }
    getTableLabel(tableId) {
      const table = tableId == null ? null : this.getTable(tableId);
      return table ? `${table.floorName}・${table.name}` : '未設定';
    }
    getRemainingMs(castId, now = Date.now()) {
      const timer = this.state.timers[castId];
      if (!timer) return null;
      if (timer.paused) return Math.max(0, timer.pausedRemainingMs ?? 0);
      return Math.max(0, timer.endsAt - now);
    }

    addFloor(name) {
      const cleanName = String(name ?? '').trim();
      if (!cleanName) return null;
      const floor = { id: makeId('floor'), name: cleanName, tables: [] };
      this.state.floors.push(floor);
      this.store.save(this.state);
      return floor.id;
    }
    renameFloor(floorId, name) {
      const floor = this.getFloor(floorId), cleanName = String(name ?? '').trim();
      if (!floor || !cleanName) return false;
      floor.name = cleanName;
      this.store.save(this.state);
      return true;
    }
    removeFloor(floorId) {
      const floor = this.getFloor(floorId);
      if (!floor) return false;
      const removedIds = new Set(floor.tables.map(table => table.id));
      this.state.floors = this.state.floors.filter(item => item.id !== floorId);
      this.#removeTableReferences(removedIds);
      this.store.save(this.state);
      return true;
    }
    addTable(floorId, name) {
      const floor = this.getFloor(floorId), cleanName = String(name ?? '').trim();
      if (!floor || !cleanName) return null;
      const table = { id: makeId('table'), name: cleanName };
      floor.tables.push(table);
      this.store.save(this.state);
      return table.id;
    }
    renameTable(tableId, name) {
      const table = this.getTable(tableId), cleanName = String(name ?? '').trim();
      if (!table || !cleanName) return false;
      const floor = this.getFloor(table.floorId);
      floor.tables.find(item => item.id === tableId).name = cleanName;
      this.store.save(this.state);
      return true;
    }
    removeTable(floorId, tableId) {
      const floor = this.getFloor(floorId);
      if (!floor || !floor.tables.some(table => table.id === tableId)) return false;
      floor.tables = floor.tables.filter(table => table.id !== tableId);
      this.#removeTableReferences(new Set([tableId]));
      this.store.save(this.state);
      return true;
    }
    #removeTableReferences(removedIds) {
      this.state.casts.forEach(cast => {
        cast.undoStack = (cast.undoStack ?? []).filter(move => !removedIds.has(move.fromTableId) && !removedIds.has(move.toTableId));
        cast.nominatedTableIds = cast.nominatedTableIds.filter(id => !removedIds.has(id));
        if (removedIds.has(cast.currentTableId)) cast.currentTableId = null;
        if (removedIds.has(cast.nextTableId)) cast.nextTableId = null;
        if (removedIds.has(cast.destinationTableId)) cast.destinationTableId = null;
        if (cast.destinationTableId == null || !cast.nominatedTableIds.includes(cast.destinationTableId) || cast.destinationTableId === cast.currentTableId) {
          cast.destinationTableId = cast.nominatedTableIds.find(id => id !== cast.currentTableId) ?? null;
        }
        if (cast.nextTableId == null || !cast.nominatedTableIds.includes(cast.nextTableId) || cast.nextTableId === cast.currentTableId) {
          cast.nextTableId = cast.destinationTableId;
        }
      });
    }
    setNominatedTables(castId, tableIds) {
      const cast = this.getCast(castId);
      if (!cast) return false;
      const available = new Set(this.state.floors.flatMap(floor => floor.tables.map(table => table.id)));
      cast.nominatedTableIds = [...new Set(tableIds)].filter(id => available.has(id));
      if (!cast.nominatedTableIds.includes(cast.nextTableId) || cast.nextTableId === cast.currentTableId) {
        cast.nextTableId = cast.nominatedTableIds.find(id => id !== cast.currentTableId) ?? null;
      }
      if (!cast.nominatedTableIds.includes(cast.destinationTableId) || cast.destinationTableId === cast.currentTableId) {
        cast.destinationTableId = cast.nextTableId;
      }
      this.store.save(this.state);
      return true;
    }
    setDestination(castId, tableId) {
      const cast = this.getCast(castId);
      if (!cast || !cast.nominatedTableIds.includes(tableId) || tableId === cast.currentTableId) return false;
      cast.destinationTableId = tableId;
      this.store.save(this.state);
      return true;
    }
    moveToDestination(castId, now = Date.now()) {
      const cast = this.getCast(castId), tableId = cast?.destinationTableId;
      if (!cast || !cast.nominatedTableIds.includes(tableId) || tableId === cast.currentTableId) return false;
      const activeTimer = this.state.timers[castId];
      const tableTimerDuration = tableId => cast.timerHistory?.find(entry => entry.tableId === tableId)?.durationMs;
      const duration = tableTimerDuration(tableId)
        ?? tableTimerDuration(cast.currentTableId)
        ?? activeTimer?.durationMs
        ?? TIMER_PRESETS[0] * 60_000;
      const previousId = cast.currentTableId;
      const before = { timer: activeTimer ? JSON.parse(JSON.stringify(activeTimer)) : null, nextTableId: cast.nextTableId, destinationTableId: cast.destinationTableId };
      const previous = previousId == null ? null : this.getTable(previousId);
      const destination = this.getTable(tableId);
      cast.currentTableId = tableId;
      const index = cast.nominatedTableIds.indexOf(tableId);
      cast.nextTableId = cast.nominatedTableIds[(index + 1) % cast.nominatedTableIds.length] ?? null;
      if (cast.nextTableId === tableId) cast.nextTableId = null;
      cast.destinationTableId = cast.nextTableId;
      cast.undoStack ??= [];
      cast.undoStack.push({ fromTableId: previousId, toTableId: tableId, at: now, before });
      cast.history.unshift({
        fromTableId: previousId, fromTableName: previous?.name ?? '未設定',
        toTableId: tableId, toTableName: destination?.name ?? '削除済み卓',
        at: now, reason: '卓移動',
      });
      this.startTimerDuration(castId, duration, now);
      const resetTimer = this.state.timers[castId];
      resetTimer.paused = true;
      resetTimer.pausedRemainingMs = duration;
      this.store.save(this.state);
      return true;
    }
    undoLastMove(castId, now = Date.now()) {
      const cast = this.getCast(castId);
      if (!cast || !cast.undoStack?.length) return false;
      const previousMove = cast.undoStack[cast.undoStack.length - 1];
      if (cast.currentTableId !== previousMove.toTableId) return false;
      if (previousMove.fromTableId != null && !this.getTable(previousMove.fromTableId)) return false;
      const current = this.getTable(cast.currentTableId);
      const previous = previousMove.fromTableId == null ? null : this.getTable(previousMove.fromTableId);
      cast.undoStack.pop();
      cast.currentTableId = previousMove.fromTableId;
      cast.destinationTableId = cast.nominatedTableIds.includes(previousMove.toTableId) && previousMove.toTableId !== cast.currentTableId
        ? previousMove.toTableId
        : cast.nominatedTableIds.find(id => id !== cast.currentTableId) ?? null;
      cast.nextTableId = cast.destinationTableId;
      if (previousMove.before) {
        const before = previousMove.before;
        if (before.timer) this.state.timers[castId] = JSON.parse(JSON.stringify(before.timer));
        else delete this.state.timers[castId];
        cast.nextTableId = before.nextTableId;
        cast.destinationTableId = before.destinationTableId;
      }
      cast.history.unshift({
        fromTableId: current?.id ?? null, fromTableName: current?.name ?? '未設定',
        toTableId: previous?.id ?? null, toTableName: previous?.name ?? '未設定',
        at: now, reason: '移動取り消し',
      });
      this.store.save(this.state);
      return true;
    }
    startTimer(castId, minutes, now = Date.now()) {
      if (!Number.isFinite(minutes)) return false;
      return this.startTimerDuration(castId, Math.round(minutes * 60_000), now);
    }
    startTimerDuration(castId, durationMs, now = Date.now()) {
      const cast = this.getCast(castId);
      if (!cast || !Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 240 * 60_000) return false;
      const table = cast.currentTableId == null ? null : this.getTable(cast.currentTableId);
      const historyId = makeId('timer');
      cast.timerHistory ??= [];
      cast.timerHistory.unshift({
        id: historyId,
        tableId: table?.id ?? cast.currentTableId ?? null,
        tableName: table ? `${table.floorName}・${table.name}` : '未設定',
        durationMs,
        at: now,
      });
      this.state.timers[castId] = { durationMs, startedAt: now, endsAt: now + durationMs, alerted: false, tableId: table?.id ?? cast.currentTableId ?? null };
      this.store.save(this.state);
      return true;
    }
    stopTimer(castId) {
      if (!this.state.timers[castId]) return false;
      delete this.state.timers[castId];
      this.store.save(this.state);
      return true;
    }
    pauseTimer(castId, now = Date.now()) {
      const timer = this.state.timers[castId];
      if (!timer || timer.paused || timer.endsAt <= now) return false;
      timer.pausedRemainingMs = timer.endsAt - now;
      timer.paused = true;
      this.store.save(this.state);
      return true;
    }
    resumeTimer(castId, now = Date.now()) {
      const timer = this.state.timers[castId];
      if (!timer?.paused) return false;
      const remaining = Math.max(0, timer.pausedRemainingMs ?? 0);
      if (remaining <= 0) return false;
      timer.startedAt = now;
      timer.endsAt = now + remaining;
      timer.paused = false;
      delete timer.pausedRemainingMs;
      timer.alerted = false;
      this.store.save(this.state);
      return true;
    }
    addTimerTime(castId, milliseconds, now = Date.now()) {
      if (!Number.isInteger(milliseconds) || milliseconds <= 0) return false;
      return this.adjustTimerTime(castId, milliseconds, now);
    }
    adjustTimerTime(castId, milliseconds, now = Date.now()) {
      const timer = this.state.timers[castId];
      if (!timer || !Number.isInteger(milliseconds) || milliseconds === 0) return false;
      const remaining = timer.paused
        ? Math.max(0, timer.pausedRemainingMs ?? 0)
        : Math.max(0, timer.endsAt - now);
      const adjustedRemaining = Math.max(0, remaining + milliseconds);
      if (timer.paused) timer.pausedRemainingMs = adjustedRemaining;
      else timer.endsAt = now + adjustedRemaining;
      timer.durationMs = Math.max(1_000, (timer.durationMs ?? remaining) + milliseconds);
      timer.alerted = false;
      this.store.save(this.state);
      return true;
    }
    resetTimer(castId, now = Date.now()) {
      const timer = this.state.timers[castId];
      if (!timer) return false;
      const duration = Math.max(1, timer.durationMs ?? 0);
      timer.startedAt = now;
      timer.endsAt = now + duration;
      timer.paused = true;
      timer.pausedRemainingMs = duration;
      timer.alerted = false;
      this.store.save(this.state);
      return true;
    }
    tick(now = Date.now()) {
      const ended = [];
      for (const [castId, timer] of Object.entries(this.state.timers)) {
        if (timer.paused) continue;
        if (timer.endsAt > now || timer.alerted) continue;
        timer.alerted = true;
        const cast = this.getCast(castId);
        ended.push({ castId, name: cast?.name ?? 'キャスト' });
      }
      if (ended.length) {
        this.store.save(this.state);
        ended.forEach(this.onTimerEnd);
      }
      return ended;
    }
  }

  function formatRemaining(milliseconds) {
    if (milliseconds === null) return '—:—';
    const seconds = Math.ceil(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  return { WATCH_STORAGE_KEY, TIMER_PRESETS, createSeedState, createWatchStore, WatchController, formatRemaining };
});
