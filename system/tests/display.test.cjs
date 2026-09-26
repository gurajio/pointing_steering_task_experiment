const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const P = require('../experiment-core.js');
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../pointing_experiment_spec.json'), 'utf8'));
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../experiment.js'), 'utf8');
class Element {
  constructor(id = '') {
    this.id = id; this.value = ''; this.checked = false; this.disabled = false;
    this.hidden = false; this.children = []; this.dataset = {}; this.listeners = {};
    this.classList = {toggle() {}};
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  async emit(type, event = {}) {
    for (const callback of this.listeners[type] || []) await callback({preventDefault() {}, ...event});
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  getContext() { return Object.fromEntries(['setTransform', 'clearRect', 'beginPath', 'arc', 'fill', 'stroke'].map(name => [name, () => {}])); }
}
async function app(mode = 'pilot') {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element(id)]));
  const sections = [...html.matchAll(/<section id="([^"]+)"/g)].map(([, id]) => elements.get(id));
  const modes = ['main', 'pilot'].map(value => Object.assign(new Element(), {name: 'mode', value, checked: value === mode}));
  const document = Object.assign(new Element(), {
    body: new Element(), documentElement: new Element(), fullscreenElement: null,
    getElementById: id => elements.get(id),
    createElement: () => new Element(), createElementNS: () => new Element(),
    querySelectorAll(selector) {
      if (selector === 'main > section') return sections;
      if (selector === '[data-export]') return [];
      const inputs = selector.includes('name=mode') ? modes : elements.get('condition-cards').children.map(label => label.children[0]);
      return selector.endsWith(':checked') ? inputs.filter(input => input.checked) : inputs;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  });
  const visualViewport = Object.assign(new Element(), {width: 1585, height: 1000, scale: 1});
  const window = Object.assign(new Element(), {
    Pointing: P, innerWidth: 1600, innerHeight: 1000, devicePixelRatio: 1, visualViewport,
    screen: {width: 1600, height: 1000}, scrollTo() {},
    SessionStore: class {
      async open() {}
      async list() { return []; }
      async acquire() { return true; }
      async save() {}
      async flush() {}
      unlock() {}
    }
  });
  document.documentElement.requestFullscreen = async () => {
    document.fullscreenElement = document.documentElement;
    await document.emit('fullscreenchange');
  };
  const intervals = [];
  const sandbox = vm.createContext({window, document, crypto: webcrypto, performance, TextEncoder, Intl,
    navigator: {userAgent: 'test', platform: 'test', language: 'ja'}, location: {protocol: 'http:'},
    fetch: async () => ({ok: true, json: async () => P.copy(spec)}),
    requestAnimationFrame: callback => queueMicrotask(() => callback(performance.now())),
    setInterval: callback => intervals.push(callback), setTimeout() {}});
  vm.runInContext(source, sandbox);
  await new Promise(resolve => setImmediate(resolve));
  const run = code => vm.runInContext(code, sandbox);
  const get = id => elements.get(id);
  get('participant').value = 'TEST_DISPLAY'; get('assignment').value = '1';
  for (const input of document.querySelectorAll('input[name=condition]')) input.checked = input.value === 'C1' || mode === 'pilot' && input.value === 'C3';
  await get('setup-form').emit('submit');
  assert.equal(run('screen'), 'calibration');
  async function checkCalibration() {
    get('measured-mm').value = '125'; await get('measured-mm').emit('input');
    get('calibration-check').checked = true; await get('calibration-check').emit('change');
    assert.equal(get('calibration-done').disabled, false);
  }
  return {run, get, window, document, intervals, checkCalibration};
}
for (const mode of ['main', 'pilot']) test(`${mode}：スクロールバーの変更で校正・教示・課題・再開を取り消さない`, async () => {
  const a = await app(mode);
  await a.checkCalibration();
  a.window.visualViewport.width = 1600;
  await a.window.visualViewport.emit('resize');
  assert.equal(a.get('calibration-check').checked, true);
  assert.equal(a.get('calibration-done').disabled, false);
  await a.get('calibration-done').emit('click');
  await a.window.visualViewport.emit('resize');
  assert.equal(a.run('screen'), 'briefing');
  assert.equal(a.run('calibrated'), true);
  await a.get('start').emit('click');
  assert.equal(a.run('screen'), 'task');
  assert.equal(a.run('engine.session.experimentMode'), mode);
  assert.equal(a.run('engine.session.plannedCounts.total'), mode === 'pilot' ? 520 : 312);
  await a.window.emit('resize');
  await a.window.visualViewport.emit('resize');
  await a.document.emit('fullscreenchange');
  a.intervals[0]();
  assert.equal(a.run('screen'), 'task');
  assert.equal(a.run('engine.state.mode'), 'ready');
  assert.equal(a.run('engine.session.events.filter(event => event.type === "paused").length'), 0);
  a.window.innerWidth = 1500;
  await a.window.emit('resize');
  assert.equal(a.run('screen'), 'pause');
  await a.get('resume').emit('click');
  assert.equal(a.run('screen'), 'calibration');
  await a.checkCalibration();
  await a.get('calibration-done').emit('click');
  assert.equal(a.run('screen'), 'pause');
  await a.window.visualViewport.emit('resize');
  await a.get('resume').emit('click');
  assert.equal(a.run('screen'), 'task');
  assert.equal(a.run('engine.session.calibrations.length'), 2);
});
const changes = {
  width: a => { a.window.innerWidth -= 100; },
  height: a => { a.window.innerHeight -= 100; },
  dpr: a => { a.window.devicePixelRatio += 0.5; },
  zoom: a => { a.window.visualViewport.scale += 0.25; },
  fullscreen: a => { a.document.fullscreenElement = null; }
};
for (const [name, change] of Object.entries(changes)) test(`実際の表示変更（${name}）は再確認と再校正を要求する`, async () => {
  const a = await app();
  await a.checkCalibration();
  change(a);
  const target = name === 'fullscreen' ? a.document : a.window.visualViewport;
  const event = name === 'fullscreen' ? 'fullscreenchange' : 'resize';
  await target.emit(event);
  assert.equal(a.get('calibration-check').checked, false);
  assert.equal(a.get('calibration-done').disabled, true);
  if (name === 'fullscreen') await a.get('calibration-fullscreen').emit('click');
  await a.checkCalibration();
  await a.get('calibration-done').emit('click');
  assert.equal(a.run('screen'), 'briefing');
  change(a); await target.emit(event);
  assert.equal(a.run('screen'), 'calibration');
  assert.equal(a.run('calibrated'), false);
});
test('表示倍率のポーリングでも課題を停止し、重複通知で確認を取り消さない', async () => {
  const a = await app();
  await a.checkCalibration(); await a.get('calibration-done').emit('click');
  await a.get('start').emit('click');
  a.window.devicePixelRatio = 2;
  a.intervals[0]();
  assert.equal(a.run('screen'), 'pause');
  assert.equal(a.run('calibrated'), false);
  await a.get('resume').emit('click');
  await a.checkCalibration();
  await a.window.emit('resize');
  a.intervals[0]();
  assert.equal(a.get('calibration-check').checked, true);
  assert.equal(a.get('calibration-done').disabled, false);
});
