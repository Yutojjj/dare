const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.hidden = false;
    this.disabled = false;
    this.className = '';
    this._text = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !classes.has(name);
        if (enabled) classes.add(name); else classes.delete(name);
        return enabled;
      },
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; this._text = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  click() { this.listeners.click?.({ currentTarget: this, target: this }); this.onclick?.({ currentTarget: this, target: this }); }
  change() { this.listeners.change?.({ currentTarget: this, target: this }); }
}

function launchWatch(storage, now) {
  const elements = new Map();
  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement());
      return elements.get(id);
    },
    createElement: tag => new FakeElement(tag),
    addEventListener() {},
  };
  const context = {
    document,
    navigator: {},
    localStorage: storage,
    Date: class extends Date { static now() { return now; } },
    Intl, console,
    addEventListener() {},
    setInterval() { return 1; },
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('watch/watch-core.js', 'utf8'), context);
  vm.runInContext(fs.readFileSync('watch/watch-app.js', 'utf8'), context);
  return { elements, $: id => elements.get(id) };
}

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('watch UI buttons open a cast, move tables, start a timer, and restore state', () => {
  const now = 1_800_000_000_000;
  const storage = memoryStorage();
  const first = launchWatch(storage, now);
  assert.equal(first.$('castList').children.length, 3);
  assert.equal(first.$('detailScreen').hidden, true);

  first.$('castList').children[0].click();
  assert.equal(first.$('detailScreen').hidden, false);
  assert.equal(first.$('currentTable').textContent, '1階・1卓');
  assert.equal(first.$('watchTitle').textContent, 'あおい');
  assert.equal(first.$('tablePicker').hidden, true);
  first.$('nextTableLabel').click();
  assert.equal(first.$('tablePicker').hidden, false);
  assert.equal(first.$('tableChoices').children.length, 1);
  assert.equal(first.$('tableChoices').children[0].children.length, 4);
  first.$('tableChoices').children[0].children[3].click();
  assert.equal(first.$('tablePicker').hidden, true);
  first.$('nextTableAction').click();
  assert.equal(first.$('currentTable').textContent, '1階・5卓');
  assert.equal(first.$('moveHistory').children[0].textContent.includes('1卓 → 5卓'), true);
  first.$('undoMoveButton').click();
  assert.equal(first.$('currentTable').textContent, '1階・1卓');
  first.$('nextTableLabel').click();
  first.$('tableChoices').children[0].children[3].click();
  first.$('nextTableAction').click();
  assert.equal(first.$('currentTable').textContent, '1階・5卓');

  assert.equal(first.$('timerPresets').children.length, 1);
  first.$('timerPresets').children[0].click();
  assert.equal(first.$('timerDialog').hidden, false);
  first.$('minuteWheel').children[5].click();
  first.$('saveTimerChoice').click();
  assert.equal(first.$('timerPresets').children[0].textContent, '5分');
  first.$('timerPresets').children[0].click();
  assert.equal(first.$('timerDisplay').textContent, '5:00');
  assert.equal(first.$('pauseTimerButton').attributes['aria-label'], '再開');
  first.$('addTenSeconds').click();
  assert.equal(first.$('timerDisplay').textContent, '5:10');
  first.$('pauseTimerButton').click();
  assert.equal(first.$('pauseTimerButton').attributes['aria-label'], '一時停止');
  first.$('resetTimerButton').click();
  assert.equal(first.$('timerDisplay').textContent, '5:10');
  assert.equal(first.$('pauseTimerButton').attributes['aria-label'], '再開');
  first.$('pauseTimerButton').click();
  assert.equal(first.$('pauseTimerButton').attributes['aria-label'], '一時停止');
  first.$('backButton').click();
  const restored = launchWatch(storage, now + 60_000);
  restored.$('castList').children[0].click();
  assert.equal(restored.$('currentTable').textContent, '1階・5卓');
  assert.equal(restored.$('timerDisplay').textContent, '4:10');
});

test('watch timer supports a free duration and manages saved time choices', () => {
  const app = launchWatch(memoryStorage(), 1_800_000_000_000);
  app.$('castList').children[0].click();
  app.$('timerPresets').children[0].click();
  app.$('minuteWheel').children[17].click();
  app.$('secondWheel').children[35].click();
  app.$('startCustomTimer').click();
  assert.equal(app.$('timerDisplay').textContent, '17:35');
  assert.equal(app.$('timerDialog').hidden, true);
  assert.equal(app.$('pauseTimerButton').attributes['aria-label'], '再開');
});

test('floor settings screen adds a floor and a named table', () => {
  const app = launchWatch(memoryStorage(), 1_800_000_000_000);
  app.$('manageButton').click();
  assert.equal(app.$('homeScreen').hidden, true);
  assert.equal(app.$('manageScreen').hidden, false);
  app.$('addFloorButton').click();
  assert.equal(app.$('floorList').children.length, 3);
  let newFloor = app.$('floorList').children[2];
  newFloor.children[2].click();
  newFloor = app.$('floorList').children[2];
  assert.equal(newFloor.children[1].children.length, 1);
  const newTableName = newFloor.children[1].children[0].children[0];
  newTableName.value = '個室A';
  newTableName.change();
  assert.equal(app.$('floorList').children[2].children[1].children[0].children[0].value, '個室A');
  app.$('backButton').click();
  assert.equal(app.$('homeScreen').hidden, false);
});
