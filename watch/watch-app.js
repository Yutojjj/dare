const { createWatchStore, WatchController, formatRemaining } = window.WatchCore;

const $ = id => document.getElementById(id);
const storage = safeLocalStorage();
const ALERT_SETTINGS_KEY = 'watch-alert-settings-v1';
const ADVANCE_ALERT_CHOICES = [10,20,30,60,120,180];
let alertSettings = { advanceSecondsList: [], endEnabled: true, vibration: true };
try { const saved = JSON.parse(storage?.getItem(ALERT_SETTINGS_KEY) ?? 'null'); if (saved) alertSettings = { advanceSecondsList: [...new Set((Array.isArray(saved.advanceSecondsList) ? saved.advanceSecondsList : [saved.advanceSeconds]).filter(value => ADVANCE_ALERT_CHOICES.includes(value)))], endEnabled: saved.endEnabled !== false, vibration: saved.vibration !== false }; } catch {}
const advanceAlertsSent = new Map();
const previousRemaining = new Map();
const DAY_ROLLOVER_KEY = 'watch-day-rollover-v1';
let rolloverTime = storage?.getItem(DAY_ROLLOVER_KEY) || '06:00';
let lastAppliedDay = '';
const store = createWatchStore(storage);
const HOME_VIEW_KEY = 'watch-home-view-v2';
const savedHomeView = readHomeViewSettings();
let selectedCastId = null;
let managerOpen = false;
let homeSearchQuery = '';
let homeCardSize = savedHomeView.cardSize;
let homeSortMode = savedHomeView.sortMode;
let expandedFloorId = null;
let routeEditorOpen = false;
let routeEditorCastId = null;
let pendingMemberCandidate = null;
let routeDraft = [];
let timerDialogOpen = false;
let historyDialogOpen = false;
let undoConfirmOpen = false;
let pendingUndoCastId = null;
let pendingActionConfirm = null;
let pendingMemberActionCastId = null;
let timerChoices = loadTimerChoices();
let selectedMinutes = 0;
let selectedSeconds = 0;
const wheelOptions = { minutes: [], seconds: [] };
const WHEEL_ROW_HEIGHT = 42;
let toastTimer = 0;
const controller = new WatchController(store, showTimerAlert);
const MEMBER_DIRECTORY_KEY = 'member-management-v1';
let appMembers = readAppMembers();

function readHomeViewSettings() {
  try {
    const current = storage?.getItem(HOME_VIEW_KEY);
    const saved = JSON.parse(current ?? storage?.getItem('watch-home-view-v1') ?? 'null');
    return {
      cardSize: current
        ? (['small', 'medium', 'large'].includes(saved?.cardSize) ? saved.cardSize : 'small')
        : (({ standard: 'small', large: 'medium', xlarge: 'large' })[saved?.cardSize] ?? 'small'),
      sortMode: ['tables', 'name', 'time'].includes(saved?.sortMode) ? saved.sortMode : 'time',
    };
  } catch { return { cardSize: 'small', sortMode: 'time' }; }
}

function saveHomeViewSettings() {
  try { storage?.setItem(HOME_VIEW_KEY, JSON.stringify({ cardSize: homeCardSize, sortMode: homeSortMode })); }
  catch { /* Local display preferences are optional. */ }
}

function readAppMembers() {
  try {
    const saved = JSON.parse(storage?.getItem(MEMBER_DIRECTORY_KEY) ?? 'null');
    return Array.isArray(saved?.members)
      ? saved.members.filter(member => member && member.id != null && String(member.name ?? '').trim())
        .map(member => ({ id: String(member.id), name: String(member.name).trim() }))
      : [];
  } catch { return []; }
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readCalendarMemberIds(date) {
  try {
    const saved = JSON.parse(storage?.getItem(MEMBER_DIRECTORY_KEY) ?? 'null');
    const members = Array.isArray(saved?.members) ? saved.members : [];
    return new Set(members.filter(member => {
      const metrics = member?.dailyMetrics?.[date] ?? {};
      const hasMetrics = Object.values(metrics).some(value => value !== '' && value !== null && value !== undefined);
      const memo = member?.dayMemos?.[date];
      return hasMetrics || (typeof memo === 'string' && memo.trim().length > 0);
    }).map(member => String(member.id)));
  } catch { return new Set(); }
}

function syncWatchCastNames(members = appMembers) {
  const names = new Map(members.map(member => [member.id, member.name]));
  let changed = false;
  controller.state.casts.forEach(cast => {
    const name = names.get(String(cast.id));
    if (name && cast.name !== name) { cast.name = name; changed = true; }
  });
  if (changed) store.save(controller.state);
}

function safeLocalStorage() {
  try { return window.localStorage; } catch { return null; }
}

function loadTimerChoices() {
  try {
    const current = storage?.getItem('watchTimerChoicesV2');
    if (current != null) {
      const saved = JSON.parse(current);
      return Array.isArray(saved) ? [...new Set(saved.filter(value => Number.isInteger(value) && value >= 1 && value <= 240 * 60))].slice(0, 4) : [];
    }
    const legacy = JSON.parse(storage?.getItem('watchTimerChoices') ?? '[]');
    const migrated = Array.isArray(legacy) ? [...new Set(legacy.filter(value => Number.isInteger(value) && value >= 1 && value <= 240).map(minutes => minutes * 60))].slice(0, 4) : [];
    if (migrated.length) storage?.setItem('watchTimerChoicesV2', JSON.stringify(migrated));
    return migrated;
  } catch { return []; }
}

function saveTimerChoices() {
  try { storage?.setItem('watchTimerChoicesV2', JSON.stringify(timerChoices)); } catch { /* Saving optional shortcuts must not block timer use. */ }
}

function formatTimerChoice(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest}秒`;
  return rest ? `${minutes}分${String(rest).padStart(2, '0')}秒` : `${minutes}分`;
}

function setWheelValue(type, value, scroll = false) {
  if (type === 'minutes') selectedMinutes = Math.max(0, Math.min(240, value));
  else selectedSeconds = selectedMinutes === 240 ? 0 : Math.max(0, Math.min(50, Math.round(value / 10) * 10));
  if (type === 'minutes' && selectedMinutes === 240) {
    selectedSeconds = 0;
    $('secondWheel').scrollTop = 0;
  }
  if (type === 'seconds' && selectedMinutes === 240) $('secondWheel').scrollTop = 0;
  const selected = type === 'minutes' ? selectedMinutes : selectedSeconds / 10;
  wheelOptions[type].forEach((option, index) => {
    option.setAttribute('aria-selected', String(index === selected));
    option.classList.toggle('selected', index === selected);
  });
  if (scroll) $(type === 'minutes' ? 'minuteWheel' : 'secondWheel').scrollTop = selected * WHEEL_ROW_HEIGHT;
  const total = selectedMinutes * 60 + selectedSeconds;
  $('wheelTimeReadout').textContent = `${selectedMinutes}分${String(selectedSeconds).padStart(2, '0')}秒`;
  $('timerConfigMessage').textContent = total ? '' : '分・秒を選んでください';
}

function buildTimeWheel(type, count, label) {
  const wheel = $(type === 'minutes' ? 'minuteWheel' : 'secondWheel');
  wheel.replaceChildren();
  wheelOptions[type] = [];
  for (let index = 0; index < count; index += 1) {
    const value = type === 'seconds' ? index * 10 : index;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'wheel-option';
    option.textContent = String(value).padStart(2, '0');
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.setAttribute('aria-label', `${value}${label}`);
    option.addEventListener('click', () => setWheelValue(type, value, true));
    wheelOptions[type].push(option);
    wheel.append(option);
  }
  wheel.addEventListener('scroll', () => {
    const index = Math.round((wheel.scrollTop ?? 0) / WHEEL_ROW_HEIGHT);
    const value = type === 'seconds' ? index * 10 : index;
    setWheelValue(type, value);
  });
}

function initializeTimeWheels() {
  buildTimeWheel('minutes', 241, '分');
  buildTimeWheel('seconds', 6, '秒');
  setWheelValue('minutes', 0, true);
  setWheelValue('seconds', 0, true);
}

function closeTimerDialog() {
  timerDialogOpen = false;
  $('timerDialog').hidden = true;
  $('openTimerDialogButton').setAttribute('aria-expanded', 'false');
}

function closeHistoryDialog() {
  historyDialogOpen = false;
  $('historyDialog').hidden = true;
}

function closeUndoConfirmation() {
  undoConfirmOpen = false;
  pendingUndoCastId = null;
  $('undoConfirmDialog').hidden = true;
}

function closeActionConfirmation() {
  pendingActionConfirm = null;
  $('actionConfirmDialog').hidden = true;
}

function requestTableMove(cast) {
  const from = cast.currentTableId, to = cast.destinationTableId;
  openActionConfirmation('卓移動の確認', `${cast.name}：${currentTableLabel(cast)} → ${nextTableLabel(cast)}`, () => {
    const latest = controller.getCast(cast.id);
    if (latest?.currentTableId === from && latest?.destinationTableId === to && controller.moveToDestination(cast.id)) render();
  }, '移動する');
}
function openActionConfirmation(title, message, action, label = '削除') {
  $('approveActionConfirm').textContent = label;
  $('actionConfirmTitle').textContent = title;
  $('actionConfirmMessage').textContent = message;
  pendingActionConfirm = action;
  $('actionConfirmDialog').hidden = false;
}

function closeMemberActions() {
  pendingMemberActionCastId = null;
  $('memberActionsDialog').hidden = true;
}

function openMemberActions(castId) {
  const cast = controller.getCast(castId);
  if (!cast) return;
  pendingMemberActionCastId = cast.id;
  $('memberActionsTitle').textContent = cast.name;
  $('memberActionsDialog').hidden = false;
}

function formatClock(timestamp) {
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp);
}

function currentTableLabel(cast) {
  return controller.getTableLabel(cast.currentTableId);
}

function nextTableLabel(cast) {
  return controller.getTableLabel(cast.destinationTableId ?? cast.nextTableId);
}

function castTimerLabel(castId) {
  const remaining = controller.getRemainingMs(castId);
  return remaining === null ? '未開始' : remaining === 0 ? '終了' : formatRemaining(remaining);
}

function updateTimerColor(element, remaining) {
  element.classList.toggle('timer-warning', remaining !== null && remaining >= 30_000 && remaining < 60_000);
  element.classList.toggle('timer-urgent', remaining !== null && remaining > 0 && remaining < 30_000);
  element.classList.toggle('expired', remaining === 0);
}

function renderHome() {
  syncWatchCastNames();
  const list = $('castList');
  const casts = controller.state.casts
    .filter(cast => !homeSearchQuery || cast.name.toLocaleLowerCase('ja').includes(homeSearchQuery))
    .map(cast => ({ cast, remaining: controller.getRemainingMs(cast.id) }))
    .sort((a, b) => {
      if (homeSortMode === 'name') return a.cast.name.localeCompare(b.cast.name, 'ja');
      if (homeSortMode === 'tables') return b.cast.nominatedTableIds.length - a.cast.nominatedTableIds.length
        || a.cast.name.localeCompare(b.cast.name, 'ja');
      return (a.remaining ?? Infinity) - (b.remaining ?? Infinity) || a.cast.name.localeCompare(b.cast.name, 'ja');
    });
  const previousPositions = new Map([...list.querySelectorAll('.cast-card')]
    .map(card => [card.dataset.castId, card.getBoundingClientRect().top]));
  const cards = new Map([...list.querySelectorAll('.cast-card')].map(card => [card.dataset.castId, card]));
  if (!casts.length) {
    list.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'demo-note';
    empty.textContent = homeSearchQuery ? '該当するメンバーはいません' : '本指名キャストはいません';
    list.append(empty);
    return;
  }
  const visibleIds = new Set(casts.map(({ cast }) => cast.id));
  cards.forEach((card, id) => { if (!visibleIds.has(id)) (card._row ?? card).remove(); });
  casts.forEach(({ cast, remaining }) => {
    let button = cards.get(cast.id);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'cast-card';
      button.dataset.castId = cast.id;
      button._row = document.createElement('div');
      button._row.className = 'cast-list-row';
      button._next = document.createElement('button');
      button._next.type = 'button';
      button._next.className = 'cast-next-button';
      button._next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h11M10 7l5 5-5 5M19 6v12"/></svg>';
      button._next.addEventListener('click', () => {
        const cast = controller.getCast(button.dataset.castId);
        if (!cast) return;
        if (cast.destinationTableId == null || cast.destinationTableId === cast.currentTableId) openRouteEditor(cast);
        else requestTableMove(cast);
      });
      button._timerAction = document.createElement('button');
      button._timerAction.type = 'button';
      button._timerAction.className = 'cast-timer-action';
      button._timerAction.addEventListener('click', () => {
        const cast = controller.getCast(button.dataset.castId);
        if (!cast) return;
        const timer = controller.state.timers[cast.id];
        if (timer?.paused) controller.resumeTimer(cast.id);
        else if (timer) controller.pauseTimer(cast.id);
        else {
          const duration = cast.timerHistory?.[0]?.durationMs ?? ((timerChoices[0] ?? 300) * 1000);
          controller.startTimerDuration(cast.id, duration);
        }
        render();
      });
      button._row.append(button, button._timerAction, button._next);
      button._parts = {
        name: document.createElement('strong'),
        timer: document.createElement('span'),
        route: document.createElement('span'),
      };
      button._parts.name.className = 'cast-card-name';
      button._parts.timer.className = 'cast-card-timer';
      button._parts.route.className = 'cast-card-route';
      button.append(button._parts.name, button._parts.timer, button._parts.route);
      button._longPressTimer = 0;
      button._longPressActive = false;
      button._suppressNextClick = false;
      button.addEventListener('pointerdown', () => {
        button._longPressActive = true;
        window.clearTimeout(button._longPressTimer);
        button._longPressTimer = window.setTimeout(() => {
          if (!button._longPressActive) return;
          button._suppressNextClick = true;
          openMemberActions(button.dataset.castId);
        }, 600);
      });
      const cancelLongPress = () => {
        button._longPressActive = false;
        window.clearTimeout(button._longPressTimer);
      };
      button.addEventListener('pointerup', cancelLongPress);
      button.addEventListener('pointerleave', cancelLongPress);
      button.addEventListener('pointercancel', cancelLongPress);
      button.addEventListener('contextmenu', event => event.preventDefault());
      button.addEventListener('click', () => {
        if (button._suppressNextClick) { button._suppressNextClick = false; return; }
        openCast(button.dataset.castId);
      });
    }
    const { name, timer, route } = button._parts;
    name.textContent = cast.name;
    timer.textContent = castTimerLabel(cast.id);
    updateTimerColor(timer, remaining);
    const activeTimer = controller.state.timers[cast.id];
    const timerActionLabel = activeTimer?.paused ? '再開' : activeTimer ? '一時停止' : 'タイマー開始';
    button._timerAction.textContent = activeTimer && !activeTimer.paused ? 'Ⅱ' : '▶';
    button._timerAction.setAttribute('aria-label', `${cast.name}のタイマー${timerActionLabel}`);
    button._timerAction.title = `${timerActionLabel}${!activeTimer ? '（前回の時間）' : ''}`;
    button._timerAction.disabled = Boolean(activeTimer && !activeTimer.paused && remaining === 0);
    button._next.disabled = false;
    const hasNextTable = cast.destinationTableId != null && cast.destinationTableId !== cast.currentTableId;
    button._next.setAttribute('aria-label', hasNextTable ? `${cast.name}を${nextTableLabel(cast)}へ移動` : `${cast.name}の推移卓を設定`);
    button._next.title = hasNextTable ? `${nextTableLabel(cast)}へ移動` : '推移卓を設定';
    const routeIds = [...new Set(cast.nominatedTableIds)];
    if (cast.currentTableId && !routeIds.includes(cast.currentTableId)) routeIds.unshift(cast.currentTableId);
    const routeTables = routeIds.map(tableId => controller.getTable(tableId)).filter(Boolean);
    const routeLabels = routeTables.map(table => controller.getTableLabel(table.id));
    const routeSignature = `${cast.currentTableId ?? ''}|${routeTables.map(table => `${table.id}:${table.floorName}:${table.name}`).join('|')}`;
    if (button.dataset.routeSignature !== routeSignature) {
      route.replaceChildren();
      routeTables.forEach((table, index) => {
        const stop = document.createElement('span');
        stop.className = 'cast-card-route-stop';
        if (index === routeTables.length - 1) stop.classList.add('last');
        if (table.id === cast.currentTableId) stop.classList.add('current');
        stop.setAttribute('aria-label', `${table.floorName} ${table.name}${table.id === cast.currentTableId ? '、現在の卓' : ''}`);
        const tableName = document.createElement('strong');
        tableName.textContent = table.name;
        stop.append(tableName);
        route.append(stop);
      });
      button.dataset.routeSignature = routeSignature;
    }
    button.setAttribute('aria-label', `${cast.name}、現在${currentTableLabel(cast)}、卓の順番${routeLabels.join('から')}、タイマー${castTimerLabel(cast.id)}`);
    list.append(button._row);
  });
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
    list.querySelectorAll('.cast-card').forEach(card => {
      const previousTop = previousPositions.get(card.dataset.castId);
      if (previousTop == null) return;
      const offset = previousTop - card.getBoundingClientRect().top;
      const row = card._row ?? card;
      if (Math.abs(offset) < 2 || typeof row.animate !== 'function') return;
      row.animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], {
        duration: 280,
        easing: 'cubic-bezier(.2,.75,.25,1)',
      });
    });
  }
}

function allWatchTables() {
  return controller.state.floors.flatMap(floor => floor.tables.map(table => ({ ...table, floorName: floor.name })));
}

function renderRouteEditor() {
  const dialog = $('routeEditorDialog');
  dialog.hidden = !routeEditorOpen;
  if (!routeEditorOpen) return;
  const isAdding = Boolean(pendingMemberCandidate);
  const cast = isAdding ? null : controller.getCast(routeEditorCastId);
  $('routeEditorTitle').textContent = isAdding ? `${pendingMemberCandidate.name} の推移卓` : '推移卓を設定';
  $('routeEditorHint').textContent = isAdding
    ? '卓を押した順に番号が付き、その順で推移します（1卓から追加できます）'
    : '卓を押した順が推移順です。選択を外すと番号が詰まります。';
  const tables = allWatchTables();
  const choices = $('routeEditorChoices');
  choices.replaceChildren();
  controller.state.floors.forEach(floor => {
    if (!floor.tables.length) return;
    const heading = document.createElement('h3'); heading.className = 'route-editor-floor'; heading.textContent = floor.name; choices.append(heading);
    const grid = document.createElement('div'); grid.className = 'route-editor-table-grid';
    floor.tables.forEach(table => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'route-editor-choice';
      const order = routeDraft.indexOf(table.id);
      const included = order >= 0;
      const isCurrent = table.id === (cast?.currentTableId ?? routeDraft[0]);
      button.classList.toggle('selected', included);
      button.classList.toggle('current', included && isCurrent);
      button.innerHTML = `<span class="route-choice-number">${included ? order + 1 : '＋'}</span><span class="route-choice-name"></span>`;
      button.querySelector('.route-choice-name').textContent = table.name;
      if (isCurrent) button.querySelector('.route-choice-name').textContent += '（現在）';
      button.setAttribute('aria-pressed', String(included));
      button.setAttribute('aria-label', included ? `${order + 1}番目、${floor.name} ${table.name}${isCurrent ? '、現在の卓' : ''}。押すと選択解除` : `${floor.name} ${table.name}を推移卓に追加、${routeDraft.length + 1}番目`);
      button.addEventListener('click', () => {
        if (included) {
          routeDraft = routeDraft.filter(id => id !== table.id);
        } else routeDraft.push(table.id);
        renderRouteEditor();
      });
      grid.append(button);
    });
    choices.append(grid);
  });
  $('saveRouteEditor').textContent = isAdding ? 'この推移で追加' : '推移を保存';
  $('saveRouteEditor').disabled = routeDraft.length < 1 || (!isAdding && !cast);
}

function openRouteEditor(cast = null, candidate = null) {
  routeEditorCastId = cast?.id ?? null;
  pendingMemberCandidate = candidate;
  routeDraft = candidate ? [] : [...(cast?.nominatedTableIds ?? [])];
  routeEditorOpen = true;
  renderRouteEditor();
}

function defaultRouteDestination(cast, route) {
  if (!cast || route.length < 2) return null;
  const index = route.indexOf(cast.currentTableId);
  return route[(index < 0 ? 0 : index + 1) % route.length] ?? null;
}

function closeRouteEditor() {
  routeEditorOpen = false;
  routeEditorCastId = null;
  routeDraft = [];
  $('routeEditorDialog').hidden = true;
  if (pendingMemberCandidate) $('memberPickerDialog').hidden = false;
  pendingMemberCandidate = null;
}

function saveRouteEditor() {
  if (routeDraft.length < 1) return;
  if (pendingMemberCandidate) {
    const candidate = pendingMemberCandidate;
    const id = controller.addCast(candidate.name, candidate.id, routeDraft);
    if (!id) return;
    const added = controller.getCast(id);
    added.dayAdded = true;
    added.dayAddedOn = localDateKey();
    store.save(controller.state);
    pendingMemberCandidate = null;
    routeEditorOpen = false;
    $('routeEditorDialog').hidden = true;
    $('memberPickerDialog').hidden = true;
    render();
    return;
  }
  const cast = controller.getCast(routeEditorCastId);
  if (!cast || !controller.setNominatedTables(cast.id, routeDraft)) return;
  const destination = defaultRouteDestination(cast, routeDraft);
  if (destination && destination !== cast.currentTableId) controller.setDestination(cast.id, destination);
  routeEditorOpen = false;
  $('routeEditorDialog').hidden = true;
  render();
}

function renderHistory(cast) {
  $('historyDialog').hidden = !historyDialogOpen;
  const history = $('moveHistory');
  history.replaceChildren();
  const entries = [
    ...(cast.history ?? []).map(entry => ({ ...entry, entryType: 'move' })),
    ...(cast.timerHistory ?? []).map(entry => ({ ...entry, entryType: 'timer' })),
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  let previousDay = '';
  entries.forEach(entry => {
    const date = new Date(entry.at);
    const day = Number.isNaN(date.getTime()) ? '日付不明' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (day !== previousDay) {
      const heading = document.createElement('li');
      heading.className = 'history-day-heading';
      heading.textContent = Number.isNaN(date.getTime())
        ? day
        : new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
      history.append(heading);
      previousDay = day;
    }
    const item = document.createElement('li');
    if (entry.entryType === 'timer') {
      item.textContent = `${formatClock(entry.at)}　${entry.tableName ?? controller.getTableLabel(entry.tableId)}　${formatTimerChoice(Math.ceil(entry.durationMs / 1_000))}`;
    } else if (entry.toTableName != null) {
      item.textContent = `${formatClock(entry.at)}　${entry.fromTableName ?? '未設定'} → ${entry.toTableName}${entry.reason === '移動取り消し' ? '（取消）' : ''}`;
    } else {
      item.textContent = `${formatClock(entry.at)}　${entry.tableName ?? '未設定'}から開始`;
    }
    history.append(item);
  });
  if (!history.children.length) {
    const item = document.createElement('li');
    item.textContent = '履歴はありません';
    history.append(item);
  }
}

function renderTimer(cast) {
  const remaining = controller.getRemainingMs(cast.id);
  const timer = controller.state.timers[cast.id];
  const display = $('timerDisplay');
  display.textContent = remaining === null ? '—:—' : formatRemaining(remaining);
  updateTimerColor(display, remaining);
  $('timerNotice').hidden = remaining !== 0 && !timer?.paused;
  $('timerNotice').textContent = remaining === 0 ? '時間です' : '一時停止中';
  $('timerControls').hidden = remaining === null;
  $('timerAdjustActions').hidden = remaining === null;
  $('timerSubtractActions').hidden = remaining === null;
  $('pauseTimerButton').textContent = timer?.paused ? '▶' : 'Ⅱ';
  $('pauseTimerButton').setAttribute('aria-label', timer?.paused ? '再開' : '一時停止');
  $('pauseTimerButton').title = timer?.paused ? '再開' : '一時停止';
  $('pauseTimerButton').disabled = remaining === 0 && !timer?.paused;
  const presets = $('timerPresets');
  presets.replaceChildren();
  presets.setAttribute('data-count', String(Math.min(5, timerChoices.length + 1)));
  timerChoices.forEach(durationSeconds => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timer-preset';
    button.textContent = formatTimerChoice(durationSeconds);
    button.setAttribute('aria-label', `${formatTimerChoice(durationSeconds)}タイマーを開始`);
    button.addEventListener('click', () => startTimerDuration(cast, durationSeconds));
    presets.append(button);
  });
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'timer-preset timer-add-button';
  addButton.id = 'openTimerDialogButton';
  addButton.textContent = '＋';
  addButton.setAttribute('aria-label', 'タイマー候補の追加・自由設定');
  addButton.setAttribute('aria-expanded', String(timerDialogOpen));
  addButton.addEventListener('click', openTimerDialog);
  presets.append(addButton);
  $('timerDialog').hidden = !timerDialogOpen;
  const savedChoices = $('timerSavedChoices');
  if (savedChoices) {
    savedChoices.replaceChildren();
    timerChoices.forEach(durationSeconds => {
      const row = document.createElement('div');
      row.className = 'timer-saved-choice';
      const label = document.createElement('span');
      label.textContent = formatTimerChoice(durationSeconds);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '削除';
      remove.setAttribute('aria-label', `${formatTimerChoice(durationSeconds)}候補を削除`);
      remove.addEventListener('click', () => {
        timerChoices = timerChoices.filter(value => value !== durationSeconds);
        saveTimerChoices();
        renderTimer(cast);
      });
      row.append(label, remove);
      savedChoices.append(row);
    });
  }
  $('saveTimerChoice').onclick = () => {
    const durationSeconds = selectedMinutes * 60 + selectedSeconds;
    if (!durationSeconds || durationSeconds > 240 * 60) {
      $('timerConfigMessage').textContent = '0秒以外、秒は10秒刻みで設定してください';
      return;
    }
    if (timerChoices.includes(durationSeconds)) {
      $('timerConfigMessage').textContent = 'この候補は追加済みです';
      return;
    }
    if (timerChoices.length >= 4) {
      $('timerConfigMessage').textContent = '候補は4つまでです。不要な候補を削除してください';
      return;
    }
    timerChoices.push(durationSeconds);
    saveTimerChoices();
    $('timerConfigMessage').textContent = `${formatTimerChoice(durationSeconds)}を候補に追加しました`;
    renderTimer(cast);
  };
  $('startCustomTimer').onclick = () => {
    const durationSeconds = selectedMinutes * 60 + selectedSeconds;
    if (!durationSeconds || durationSeconds > 240 * 60) {
      $('timerConfigMessage').textContent = '0秒以外、秒は10秒刻みで設定してください';
      return;
    }
    closeTimerDialog();
    startTimerDuration(cast, durationSeconds);
  };
  $('pauseTimerButton').onclick = () => {
    if (timer?.paused) controller.resumeTimer(cast.id);
    else controller.pauseTimer(cast.id);
    $('watchFace').classList.remove('timer-alert');
    $('watchToast').hidden = true;
    render();
  };
  $('resetTimerButton').onclick = () => {
    controller.resetTimer(cast.id);
    $('watchFace').classList.remove('timer-alert');
    $('watchToast').hidden = true;
    render();
  };
  $('addTenSeconds').onclick = () => addTimeToTimer(cast, 10_000);
  $('addOneMinute').onclick = () => addTimeToTimer(cast, 60_000);
  $('subtractTenSeconds').onclick = () => addTimeToTimer(cast, -10_000);
  $('subtractOneMinute').onclick = () => addTimeToTimer(cast, -60_000);
}

function startTimerDuration(cast, durationSeconds) {
  if (!controller.startTimerDuration(cast.id, durationSeconds * 1_000)) return;
  controller.pauseTimer(cast.id);
  closeTimerDialog();
  $('watchFace').classList.remove('timer-alert');
  $('watchToast').hidden = true;
  render();
}

function openTimerDialog() {
  timerDialogOpen = true;
  $('openTimerDialogButton').setAttribute('aria-expanded', 'true');
  $('timerConfigMessage').textContent = selectedMinutes || selectedSeconds ? '' : '分・秒を選んでください';
  $('timerDialog').hidden = false;
  $('minuteWheel').focus?.();
}

function addTimeToTimer(cast, milliseconds) {
  if (!controller.adjustTimerTime(cast.id, milliseconds)) return;
  $('watchFace').classList.remove('timer-alert');
  $('watchToast').hidden = true;
  render();
}

function renderDetail() {
  const cast = controller.getCast(selectedCastId);
  if (!cast) return showHome();
  $('watchTitle').textContent = cast.name;
  $('currentTable').textContent = currentTableLabel(cast);
  $('nextTableLabel').textContent = nextTableLabel(cast);
  $('nextTableLabel').onclick = () => openRouteEditor(cast);
  $('nextTableAction').disabled = cast.destinationTableId == null || cast.destinationTableId === cast.currentTableId;
  $('nextTableAction').setAttribute('aria-label', `${nextTableLabel(cast)}へ移動`);
  $('nextTableAction').onclick = () => {
    requestTableMove(cast);
  };
  $('performanceInputButton').onclick = () => openPerformanceInput(cast);
  renderTimer(cast);
  renderHistory(cast);
  $('watchFace').classList.toggle('timer-alert', controller.getRemainingMs(cast.id) === 0);
}

function makeTextInput(className, value, ariaLabel, onCommit) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = className;
  input.value = value;
  input.maxLength = 24;
  input.setAttribute('aria-label', ariaLabel);
  input.addEventListener('change', () => {
    const next = input.value.trim();
    if (!next) input.value = value;
    else if (onCommit(next)) renderManager();
  });
  return input;
}

function renderMemberPicker() {
  appMembers = readAppMembers();
  syncWatchCastNames();
  const list = $('memberPickerList');

  const date = localDateKey();
  const dayOnly = $('memberPickerDayToggle').getAttribute('aria-pressed') === 'true';
  const selectedCasts = new Map(controller.state.casts.map(cast => [String(cast.id), cast]));
  const candidates = [...appMembers];
  const candidateIds = new Set(candidates.map(member => member.id));
  selectedCasts.forEach((cast, id) => {
    if (!candidateIds.has(id)) candidates.push({ id, name: cast.name, watchOnly: true });
  });
  const calendarIds = dayOnly ? readCalendarMemberIds(date) : null;
  const visible = candidates.filter(member => !calendarIds || calendarIds.has(member.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja', { sensitivity: 'base' }));
  const selectedCount = controller.state.casts.length;
  const tableCount = controller.state.floors.reduce((count, floor) => count + floor.tables.length, 0);
  $('memberPickerStatus').textContent = !appMembers.length
    ? (selectedCount ? `ウォッチ登録済み ${selectedCount}人 / キャスト候補を読み込めません` : 'キャスト候補を読み込めません')
    : `選択中 ${selectedCount}人${dayOnly ? `・今日の該当メンバー ${visible.length}人` : ''}${tableCount < 1 ? '・追加には卓が必要です' : ''}`;
  list.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'member-picker-empty';
    empty.textContent = dayOnly && !calendarIds.size ? '今日カレンダーに登録されたメンバーはいません'
        : dayOnly ? '今日に該当するメンバーはいません' : 'キャストが登録されていません';
    list.append(empty);
    return;
  }
  visible.forEach(member => {
    const selected = selectedCasts.has(member.id);
    const row = document.createElement('div');
    row.className = `member-picker-row${selected ? ' selected' : ''}`;
    const name = document.createElement('span');
    name.className = 'member-picker-name';
    name.textContent = member.name;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = `member-picker-action${selected ? ' remove' : ''}`;
    action.textContent = selected ? '削除' : '追加';
    action.disabled = !selected && tableCount < 1;
    action.setAttribute('aria-label', `${member.name}をウォッチから${selected ? '削除' : '追加'}`);
    action.addEventListener('click', () => {
      if (selected) {
        openActionConfirmation('メンバーを削除', `${member.name}をウォッチ一覧から削除しますか？`, () => {
          controller.removeCast(member.id);
          renderHome();
          renderMemberPicker();
        });
        return;
      } else {
        pendingMemberCandidate = member;
        $('memberPickerDialog').hidden = true;
        openRouteEditor(null, member);
        return;
      }
      renderHome();
      renderMemberPicker();
    });
    row.append(name, action);
    list.append(row);
  });
}

function renderManager() {
  $('watchTitle').textContent = '設定';
  const list = $('floorList');
  list.replaceChildren();
  controller.state.floors.forEach(floor => {
    const expanded = expandedFloorId === floor.id;
    const card = document.createElement('section');
    card.className = `floor-card${expanded ? ' expanded' : ''}`;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'floor-accordion-toggle';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-controls', `floor-content-${floor.id}`);
    const floorTitle = document.createElement('span');
    floorTitle.className = 'floor-accordion-name';
    floorTitle.textContent = floor.name;
    const count = document.createElement('span');
    count.className = 'floor-accordion-count';
    count.textContent = `${floor.tables.length}卓`;
    const chevron = document.createElement('span');
    chevron.className = 'floor-accordion-chevron';
    chevron.textContent = expanded ? '−' : '+';
    toggle.append(floorTitle, count, chevron);
    toggle.addEventListener('click', () => {
      expandedFloorId = expanded ? null : floor.id;
      renderManager();
    });
    const content = document.createElement('div');
    content.className = 'floor-accordion-content';
    content.id = `floor-content-${floor.id}`;
    content.hidden = !expanded;
    const heading = document.createElement('div');
    heading.className = 'floor-heading';
    const headingMain = document.createElement('div');
    headingMain.className = 'floor-heading-main';
    const floorLabel = document.createElement('span');
    floorLabel.className = 'floor-kind-label';
    floorLabel.textContent = 'フロア';
    const floorName = makeTextInput('floor-name-input', floor.name, 'フロア名', name => controller.renameFloor(floor.id, name));
    const removeFloor = document.createElement('button');
    removeFloor.type = 'button';
    removeFloor.className = 'small-danger-button';
    removeFloor.textContent = 'フロア削除';
    removeFloor.setAttribute('aria-label', `${floor.name}と中の卓を削除`);
    removeFloor.addEventListener('click', () => {
      openActionConfirmation('フロアを削除', `${floor.name}と中の卓を削除しますか？`, () => {
        controller.removeFloor(floor.id);
        expandedFloorId = null;
        renderManager();
      });
    });
    headingMain.append(floorLabel, floorName);
    heading.append(headingMain, removeFloor);
    const tableList = document.createElement('div');
    tableList.className = 'table-list';
    const tableHeading = document.createElement('div');
    tableHeading.className = 'table-section-heading';
    const tableHeadingLabel = document.createElement('span');
    tableHeadingLabel.textContent = '卓';
    const tableCount = document.createElement('span');
    tableCount.textContent = `${floor.tables.length}件`;
    tableHeading.append(tableHeadingLabel, tableCount);
    tableList.append(tableHeading);
    floor.tables.forEach((table, index) => {
      const row = document.createElement('div');
      row.className = 'managed-table-row';
      const tableIndex = document.createElement('span');
      tableIndex.className = 'table-index-label';
      tableIndex.textContent = String(index + 1);
      const tableName = makeTextInput('table-name-input', table.name, `${floor.name}の卓名`, name => controller.renameTable(table.id, name));
      const removeTable = document.createElement('button');
      removeTable.type = 'button';
      removeTable.className = 'small-danger-button';
      removeTable.textContent = '削除';
      removeTable.setAttribute('aria-label', `${floor.name} ${table.name}を削除`);
      removeTable.addEventListener('click', () => {
        openActionConfirmation('卓を削除', `${floor.name} ${table.name}を削除しますか？`, () => {
          controller.removeTable(floor.id, table.id);
          renderManager();
        });
      });
      row.append(tableIndex, tableName, removeTable);
      tableList.append(row);
    });
    const addTable = document.createElement('button');
    addTable.type = 'button';
    addTable.className = 'add-table-button';
    addTable.textContent = '＋ 卓を追加';
    addTable.addEventListener('click', () => {
      controller.addTable(floor.id, `${floor.tables.length + 1}卓`);
      renderManager();
    });
    content.append(heading, tableList, addTable);
    card.append(toggle, content);
    list.append(card);
  });
}

function render() {
  const detailOpen = selectedCastId !== null && !managerOpen;
  $('homeScreen').hidden = detailOpen || managerOpen;
  $('detailScreen').hidden = !detailOpen;
  $('manageScreen').hidden = !managerOpen;
  $('watchFace').classList.toggle('home-open', !detailOpen && !managerOpen);
  $('watchFace').classList.toggle('manage-open', managerOpen);
  $('backButton').hidden = !detailOpen && !managerOpen;
  $('openHistoryDialog').hidden = !detailOpen;
  $('manageButton').hidden = detailOpen || managerOpen;
  $('homeClock').hidden = detailOpen || managerOpen;
  $('homeClock').textContent = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  $('homeSearchButton').hidden = detailOpen || managerOpen;
  $('homeSizeButton').hidden = detailOpen || managerOpen;
  $('homeFilterButton').hidden = detailOpen || managerOpen;
  $('homeSearchButton').classList.toggle('active', Boolean(homeSearchQuery));
  $('homeSizeButton').dataset.size = homeCardSize;
  $('homeSizeButton').textContent = ({ small: '小', medium: '中', large: '大' })[homeCardSize];
  $('homeSizeButton').setAttribute('aria-label', `メンバー表示サイズを変更（現在${({ small: '小', medium: '中', large: '大' })[homeCardSize]}）`);
  $('watchFace').classList.toggle('home-medium', homeCardSize === 'medium');
  $('watchFace').classList.toggle('home-large', homeCardSize === 'large');
  if (detailOpen) renderDetail();
  else if (managerOpen) renderManager();
  else renderHome();
}

function openCast(castId) {
  selectedCastId = castId;
  managerOpen = false;
  routeEditorOpen = false;
  timerDialogOpen = false;
  $('watchTitle').textContent = '付け回し';
  render();
}

function showHome() {
  selectedCastId = null;
  managerOpen = false;
  routeEditorOpen = false;
  timerDialogOpen = false;
  historyDialogOpen = false;
  $('historyDialog').hidden = true;
  $('homeSearchDialog').hidden = true;
  closeUndoConfirmation();
  $('watchTitle').textContent = '付け回し';
  $('watchFace').classList.remove('timer-alert');
  render();
}

function showTimerAlert({ name }) {
  if (!alertSettings.endEnabled) return;
  $('watchFace').classList.add('timer-alert');
  $('watchToast').textContent = `${name}　時間です`;
  $('watchToast').hidden = false;
  try {
    if (alertSettings.vibration && typeof navigator.vibrate === 'function') navigator.vibrate([220, 100, 220]);
  } catch { /* Vibration is optional and unavailable on some devices. */ }
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { $('watchToast').hidden = true; }, 6_000);
}

$('backButton').addEventListener('click', showHome);
$('homeSearchButton').addEventListener('click', () => {
  $('homeSearchInput').value = homeSearchQuery;
  $('homeSearchDialog').hidden = false;
  $('homeSearchInput').focus();
});
$('homeFilterButton').addEventListener('click', () => {
  homeSortMode = ({ time: 'tables', tables: 'name', name: 'time' })[homeSortMode];
  saveHomeViewSettings();
  render();
});
$('homeSizeButton').addEventListener('click', () => {
  homeCardSize = ({ small: 'medium', medium: 'large', large: 'small' })[homeCardSize];
  saveHomeViewSettings();
  render();
});
$('homeSearchInput').addEventListener('input', event => {
  homeSearchQuery = event.target.value.trim().toLocaleLowerCase('ja');
  renderHome();
  $('homeSearchButton').classList.toggle('active', Boolean(homeSearchQuery));
});
$('clearHomeSearch').addEventListener('click', () => {
  $('homeSearchInput').value = '';
  homeSearchQuery = '';
  render();
});
const closeHomeControls = () => { $('homeSearchDialog').hidden = true; };
$('closeHomeSearch').addEventListener('click', closeHomeControls);
$('homeSearchDialog').addEventListener('click', event => { if (event.target === $('homeSearchDialog')) closeHomeControls(); });
$('closeTimerDialog').addEventListener('click', closeTimerDialog);
$('openHistoryDialog').addEventListener('click', () => {
  historyDialogOpen = true;
  renderHistory(controller.getCast(selectedCastId));
});
$('closeHistoryDialog').addEventListener('click', closeHistoryDialog);
$('closeUndoConfirm').addEventListener('click', closeUndoConfirmation);
$('cancelUndoMove').addEventListener('click', closeUndoConfirmation);
$('closeActionConfirm').addEventListener('click', closeActionConfirmation);
$('cancelActionConfirm').addEventListener('click', closeActionConfirmation);
$('closeMemberActions').addEventListener('click', closeMemberActions);
$('memberActionsDialog').addEventListener('click', event => {
  if (event.target === $('memberActionsDialog')) closeMemberActions();
});
$('editMemberTables').addEventListener('click', () => {
  const castId = pendingMemberActionCastId;
  closeMemberActions();
  const cast = controller.getCast(castId);
  if (!cast) return;
  openCast(cast.id);
  openRouteEditor(cast);
});
$('removeMemberFromWatch').addEventListener('click', () => {
  const cast = controller.getCast(pendingMemberActionCastId);
  closeMemberActions();
  if (!cast) return;
  openActionConfirmation('メンバーを削除', `${cast.name}をウォッチ一覧から削除しますか？`, () => {
    controller.removeCast(cast.id);
    renderHome();
  });
});
$('approveActionConfirm').addEventListener('click', () => {
  const action = pendingActionConfirm;
  closeActionConfirmation();
  action?.();
});
$('actionConfirmDialog').addEventListener('click', event => {
  if (event.target === $('actionConfirmDialog')) closeActionConfirmation();
});
$('confirmUndoMove').addEventListener('click', () => {
  const castId = pendingUndoCastId;
  closeUndoConfirmation();
  if (castId && controller.undoLastMove(castId)) render();
});
$('undoConfirmDialog').addEventListener('click', event => {
  if (event.target === $('undoConfirmDialog')) closeUndoConfirmation();
});
$('historyDialog').addEventListener('click', event => {
  if (event.target === $('historyDialog')) closeHistoryDialog();
});
$('timerDialog').addEventListener('click', event => {
  if (event.target === $('timerDialog')) closeTimerDialog();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('homeSearchDialog').hidden) { closeHomeControls(); return; }
  if (event.key === 'Escape' && routeEditorOpen) { closeRouteEditor(); return; }
  if (event.key === 'Escape' && timerDialogOpen) closeTimerDialog();
  if (event.key === 'Escape' && historyDialogOpen) closeHistoryDialog();
  if (event.key === 'Escape' && undoConfirmOpen) closeUndoConfirmation();
  if (event.key === 'Escape' && !$('actionConfirmDialog').hidden) closeActionConfirmation();
  if (event.key === 'Escape' && !$('memberActionsDialog').hidden) closeMemberActions();
  if (event.key === 'Escape' && !$('memberPickerDialog').hidden) $('memberPickerDialog').hidden = true;
});
$('manageButton').addEventListener('click', () => {
  appMembers = readAppMembers();
  syncWatchCastNames();
  selectedCastId = null;
  managerOpen = true;
  render();
});
$('openMemberAddButton').addEventListener('click', () => {

  $('memberPickerDayToggle').setAttribute('aria-pressed', 'false');
  $('memberPickerDialog').hidden = false;
  renderMemberPicker();
});
$('closeRouteEditor').addEventListener('click', closeRouteEditor);
$('cancelRouteEditor').addEventListener('click', closeRouteEditor);
$('saveRouteEditor').addEventListener('click', saveRouteEditor);
$('routeEditorDialog').addEventListener('click', event => { if (event.target === $('routeEditorDialog')) closeRouteEditor(); });
$('closeMemberPickerDialog').addEventListener('click', () => { $('memberPickerDialog').hidden = true; });

$('memberPickerDayToggle').addEventListener('click', () => {
  const button = $('memberPickerDayToggle');
  const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  renderMemberPicker();
});
$('memberPickerDialog').addEventListener('click', event => {
  if (event.target === $('memberPickerDialog')) $('memberPickerDialog').hidden = true;
});
$('addFloorButton').addEventListener('click', () => {
  const name = `フロア ${controller.state.floors.length + 1}`;
  expandedFloorId = controller.addFloor(name);
  renderManager();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { controller.tick(); render(); }
});
window.addEventListener('focus', () => { controller.tick(); render(); });
window.addEventListener('storage', event => {
  if (event.key !== MEMBER_DIRECTORY_KEY) return;
  appMembers = readAppMembers();
  syncWatchCastNames();
  renderHome();
  if (!$('memberPickerDialog').hidden) renderMemberPicker();
});

initializeTimeWheels();
for (const seconds of ADVANCE_ALERT_CHOICES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = seconds < 60 ? `${seconds}秒前` : `${seconds / 60}分前`;
  button.setAttribute('aria-pressed', String(alertSettings.advanceSecondsList.includes(seconds)));
  button.addEventListener('click', () => {
    alertSettings.advanceSecondsList = alertSettings.advanceSecondsList.includes(seconds)
      ? alertSettings.advanceSecondsList.filter(value => value !== seconds)
      : [...alertSettings.advanceSecondsList, seconds].sort((a,b) => a-b);
    button.setAttribute('aria-pressed', String(alertSettings.advanceSecondsList.includes(seconds)));
    saveAlertSettings();
  });
  $('advanceAlertOptions').append(button);
}
$('endAlertEnabled').checked = alertSettings.endEnabled;
$('alertVibrationEnabled').checked = alertSettings.vibration;
$('alertPlatformNote').textContent = window.DareWatchNative ? '時計の通知・アラーム許可を有効にしてください。' : 'ブラウザでは画面を開いている間にお知らせします。';
if (window.DareWatchNative?.testNotification) {
  for (const [label, action] of [['通知の許可', () => window.DareWatchNative.requestPermissions()], ['通知をテスト', () => window.DareWatchNative.testNotification()]]) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'home-control-clear'; button.textContent = label;
    button.onclick = action; $('alertSettingsPanel').append(button);
  }
}
for (const [tabId, panelId] of [['floorSettingsTab', 'floorSettingsPanel'], ['alertSettingsTab', 'alertSettingsPanel'], ['dayRolloverTab', 'dayRolloverPanel']]) {
  $(tabId).addEventListener('click', () => {
    for (const [tab, panel] of [['floorSettingsTab','floorSettingsPanel'],['alertSettingsTab','alertSettingsPanel'],['dayRolloverTab','dayRolloverPanel']]) {
      $(tab).setAttribute('aria-selected', String(tab === tabId));
      $(panel).hidden = panel !== panelId;
    }
  });
}
$('dayRolloverTime').value = rolloverTime;
$('dayRolloverTime').addEventListener('change', () => { rolloverTime = $('dayRolloverTime').value || '06:00'; storage?.setItem(DAY_ROLLOVER_KEY, rolloverTime); lastAppliedDay = ''; applyDailyMembers(); render(); });
function saveAlertSettings() {
  try { storage?.setItem(ALERT_SETTINGS_KEY, JSON.stringify(alertSettings)); } catch {}
  if (window.DareWatchNative) window.DareWatchNative.syncTimers(JSON.stringify({ ...controller.state, notificationSettings: alertSettings }));
}
for (const id of ['endAlertEnabled', 'alertVibrationEnabled']) {
  $(id).addEventListener('change', () => {
    alertSettings.endEnabled = $('endAlertEnabled').checked;
    alertSettings.vibration = $('alertVibrationEnabled').checked;
    saveAlertSettings();
  });
}
function checkAdvanceAlerts() {
  for (const cast of controller.state.casts) {
    const timer = controller.state.timers[cast.id];
    if (!timer || timer.paused) { previousRemaining.delete(cast.id); continue; }
    const remaining = timer.endsAt - Date.now();
    const previous = previousRemaining.get(cast.id);
    const before = previous?.end === timer.endsAt ? previous.remaining : Math.min(timer.durationMs, remaining + 1100);
    previousRemaining.set(cast.id, { end: timer.endsAt, remaining });
    let due = false;
    for (const seconds of alertSettings.advanceSecondsList) {
      const key = `${cast.id}|${seconds}`;
      if (remaining > 0 && before > seconds * 1000 && remaining <= seconds * 1000 && advanceAlertsSent.get(key) !== timer.endsAt) {
        advanceAlertsSent.set(key, timer.endsAt);
        due = true;
      }
    }
    if (!due) continue;
    $('watchToast').textContent = `${cast.name}　残り${Math.ceil(remaining / 1000)}秒`;
    $('watchToast').hidden = false;
    if (!window.DareWatchNative && alertSettings.vibration && navigator.vibrate) navigator.vibrate([150, 100, 150]);
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { $('watchToast').hidden = true; }, 6000);
  }
}
function applyDailyMembers() {
  const now = new Date();
  const [hour, minute] = rolloverTime.split(':').map(Number);
  const day = new Date(now);
  if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) day.setDate(day.getDate() - 1);
  const date = localDateKey(day);
  if (date === lastAppliedDay) return;
  lastAppliedDay = date;
  const expired = controller.state.casts.filter(cast => cast.dayAdded && cast.dayAddedOn !== date).map(cast => cast.id);
  if (!expired.length) return;
  controller.state.dayMemberHistory ??= [];
  for (const id of expired) {
    const cast = controller.getCast(id);
    if (!cast) continue;
    const prior = controller.state.dayMemberHistory.some(entry => entry.castId === id && entry.date === cast.dayAddedOn);
    if (!prior) controller.state.dayMemberHistory.unshift({
      castId: id,
      name: cast.name,
      date: cast.dayAddedOn,
      movementHistory: structuredClone(cast.history ?? []),
      timerHistory: structuredClone(cast.timerHistory ?? []),
      archivedAt: Date.now(),
    });
    controller.removeCast(id);
  }
  store.save(controller.state);
}
function startWatchScreen() {
  applyDailyMembers();
  controller.tick();
  render();
  window.setInterval(() => { applyDailyMembers(); checkAdvanceAlerts(); controller.tick(); render(); }, 1_000);
}
window.WatchFirebase.start(store, () => {
  if (window.DareWatchNative) window.DareWatchNative.syncTimers(JSON.stringify({ ...controller.state, notificationSettings: alertSettings }));
  render();
}).then(startWatchScreen).catch(error => {
  console.error('Firebase共有へ接続できませんでした', error);
  startWatchScreen();
});


let performanceDraft = null, performanceBusy = false;
function performanceDay() {
  const date = new Date(), [hour, minute] = rolloverTime.split(':').map(Number);
  if (date.getHours() * 60 + date.getMinutes() < hour * 60 + minute) date.setDate(date.getDate() - 1);
  return localDateKey(date);
}
async function openPerformanceInput(cast) {
  if (performanceBusy) return;
  performanceBusy = true;
  $('performanceTitle').textContent = `${cast.name} 実績入力`;
  $('performanceDate').textContent = performanceDay();
  $('performanceRows').replaceChildren();
  $('performanceStatus').textContent = '読み込み中…';
  $('savePerformance').disabled = true;
  $('performanceDialog').hidden = false;
  try {
    const state = await window.WatchFirebase.readPerformance();
    const member = state.members.find(item => String(item.id) === String(cast.id));
    if (!member) throw new Error('管理アプリに登録されたキャストを選んでください');
    const date = $('performanceDate').textContent;
    const fields = [{ id: 'nominations', name: '本指名数' }, { id: 'freebacks', name: 'フリーバック数' }, ...(state.monthlyMetricFields ?? []).filter(item => /^metric_[a-z0-9-]+$/.test(item.id))];
    const base = {}, values = {};
    performanceDraft = { memberId: cast.id, date, fields, base, values };
    for (const field of fields) {
      const raw = Number(member.dailyMetrics?.[date]?.[field.id] || 0);
      base[field.id] = values[field.id] = Number.isFinite(raw) ? Math.max(0, raw) : 0;
      const row = document.createElement('div'); row.className = 'performance-row';
      const label = document.createElement('strong'); label.textContent = field.name;
      const controls = document.createElement('div'); controls.className = 'performance-stepper';
      const output = document.createElement('output'); output.textContent = String(values[field.id]); output.setAttribute('aria-label', field.name);
      const minus = document.createElement('button'), plus = document.createElement('button');
      for (const [button, delta] of [[minus, -1], [plus, 1]]) {
        button.type = 'button'; button.textContent = delta < 0 ? '−' : '＋';
        button.setAttribute('aria-label', `${field.name}を1${delta < 0 ? '減らす' : '増やす'}`);
        button.onclick = () => { if (performanceBusy) return; values[field.id] = Math.max(0, values[field.id] + delta); output.textContent = String(values[field.id]); };
      }
      controls.append(minus, output, plus); row.append(label, controls); $('performanceRows').append(row);
    }
    $('performanceStatus').textContent = ''; $('savePerformance').disabled = false;
  } catch (error) { $('performanceStatus').textContent = error.message || '読み込めませんでした'; }
  finally { performanceBusy = false; }
}
function closePerformance() { if (!performanceBusy) { $('performanceDialog').hidden = true; performanceDraft = null; } }
$('closePerformance').onclick = closePerformance;
$('cancelPerformance').onclick = closePerformance;
$('savePerformance').onclick = async () => {
  if (performanceBusy || !performanceDraft) return;
  performanceBusy = true; $('savePerformance').disabled = true; $('performanceStatus').textContent = '保存中…';
  try {
    const draft = performanceDraft, deltas = Object.fromEntries(draft.fields.map(field => [field.id, draft.values[field.id] - draft.base[field.id]]));
    const saved = await window.WatchFirebase.savePerformance(draft.memberId, draft.date, deltas);
    storage?.setItem(MEMBER_DIRECTORY_KEY, JSON.stringify(saved));
    performanceBusy = false; closePerformance();
  } catch (error) { $('performanceStatus').textContent = error.message || '保存できませんでした'; }
  finally { performanceBusy = false; $('savePerformance').disabled = false; }
};
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePerformance(); });


