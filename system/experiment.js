'use strict';
const $ = id => document.getElementById(id);
const P = window.Pointing;
const store = new window.SessionStore();
const canvas = $('task-canvas');
const context = canvas.getContext('2d');
const phases = {training: '訓練', post: '事後測定'};
let spec, defaultSpec, engine, options, calibration, screen = 'setup';
let busy = false, boundary = false, pressed = false, calibrated = false, storageFailed = false;
let breakStart = 0, missUntil = 0, renderId = 0, displayKey = '';
const stamp = () => ({t: performance.now(), iso: new Date().toISOString()});
function notice(message = '') {
  $('notice').textContent = message;
  $('notice').hidden = !message;
}
function show(next) {
  const changed = next !== screen;
  screen = next;
  document.querySelectorAll('main > section').forEach(section => { section.hidden = section.id !== next + '-screen'; });
  document.body.classList.toggle('task', next === 'task');
  if (changed) window.scrollTo(0, 0);
}
function viewport() {
  return {width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio,
    visualScale: window.visualViewport?.scale || 1};
}
function displaySignature() {
  return JSON.stringify({...viewport(), fullscreen: !!document.fullscreenElement});
}
function matchesDisplay(value) {
  const current = viewport(), saved = value?.viewport;
  return !!saved && !!document.fullscreenElement && Object.keys(current).every(key => Math.abs(current[key] - saved[key]) < 0.001);
}
function fields() {
  return Object.fromEntries(['resolution', 'os-scale', 'browser-zoom', 'mouse-model', 'mouse-dpi', 'mouse-sensitivity'].map(id => [id, $(id).value.trim() || null]));
}
function environment() {
  return {reported: fields(), userAgent: navigator.userAgent, platform: navigator.platform,
    screenCssWidth: window.screen.width, screenCssHeight: window.screen.height, viewport: viewport(),
    language: navigator.language, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone};
}
function setupOptions() {
  return {participantId: $('participant').value.trim(), mode: document.querySelector('input[name=mode]:checked').value,
    trainingConditions: [...document.querySelectorAll('input[name=condition]:checked')].map(input => input.value),
    enrollmentIndex: Number($('assignment').value)};
}
function summarizePlan() {
  if (!spec) return;
  try {
    const value = setupOptions(), planned = P.buildPlan(spec, value);
    $('plan-summary').textContent = `訓練：${planned.trainingOrder.join(' → ')}を各208試行（13移動×16周）→ 事後4条件×26試行 = 合計${planned.counts.total}試行。事後1巡目：${planned.order[0].join(' → ')}、2巡目：${planned.order[1].join(' → ')}。`;
  } catch (error) { $('plan-summary').textContent = error.message; }
}
function renderConditions() {
  if (!spec) return;
  const pilot = document.querySelector('input[name=mode]:checked').value === 'pilot';
  let selected = [...document.querySelectorAll('input[name=condition]:checked')].map(input => input.value);
  if (!pilot && selected.length > 1) selected = [];
  $('condition-label').textContent = pilot ? '訓練条件（複数選択可・1つ以上）' : '訓練条件（1つ選択）';
  $('mode-description').textContent = pilot ? '選択した各条件を208試行ずつ訓練し、最後に全4条件を事後測定します。' : '1条件を208試行訓練し、最後に全4条件を事後測定します。';
  $('assignment-label').textContent = pilot ? '割当番号' : '訓練群内の割当番号';
  $('assignment-help').textContent = pilot ? '選択した訓練条件の実施順序と、事後測定の順序に反映されます。' : '同じ訓練条件の参加者ごとに1から採番します。事後の順序に反映されます。';
  $('practice-description').textContent = `選択した${pilot ? '各条件' : '1条件'}を208試行（13移動×16周）実施します。一周後も次の円へ続けて移動します。`;
  $('condition-cards').replaceChildren(...spec.conditions.map(c => {
    const label = document.createElement('label'); label.className = 'condition-card';
    const input = document.createElement('input'); input.type = pilot ? 'checkbox' : 'radio'; input.name = 'condition'; input.value = c.id; input.required = !pilot;
    input.checked = selected.includes(c.id);
    const title = document.createElement('strong'); title.textContent = c.id;
    const original = defaultSpec.conditions.find(value => value.id === c.id);
    const name = document.createElement('span');
    name.textContent = c.amplitudeMm === original.amplitudeMm && c.widthMm === original.widthMm ? c.labelJa : 'カスタム設定';
    const values = document.createElement('span'); values.className = 'values';
    values.textContent = `A ${c.amplitudeMm} mm · W ${c.widthMm} mm · ID ${c.nominalIdBits.toFixed(3)}`;
    label.append(input, title, name, values); return label;
  }));
  summarizePlan();
}
function settingsValues() {
  return spec.conditions.map(c => ({id: c.id, amplitudeMm: Number($(`amplitude-${c.id}`).value), widthMm: Number($(`width-${c.id}`).value)}));
}
function previewSettings() {
  const values = settingsValues();
  for (const c of values) {
    const id = Math.log2(c.amplitudeMm / c.widthMm + 1);
    $(`id-${c.id}`).textContent = c.amplitudeMm > 0 && c.widthMm > 0 && Number.isFinite(id) ? id.toFixed(3) : '—';
  }
  try {
    const next = P.configureConditions(defaultSpec, values);
    $('settings-error').hidden = true; $('settings-error').textContent = '';
    $('settings-apply').disabled = false;
    return next;
  } catch (error) {
    $('settings-error').textContent = error.message; $('settings-error').hidden = false;
    $('settings-apply').disabled = true;
    return null;
  }
}
function fillSettings(conditions) {
  $('settings-rows').replaceChildren(...conditions.map(c => {
    const row = document.createElement('tr'), heading = document.createElement('th');
    heading.scope = 'row'; heading.textContent = c.id; row.append(heading);
    for (const [field, key, label] of [['amplitude', 'amplitudeMm', 'A：中心間距離'], ['width', 'widthMm', 'W：円の直径']]) {
      const cell = document.createElement('td'), input = document.createElement('input');
      input.type = 'number'; input.step = 'any'; input.min = '0'; input.required = true;
      input.id = `${field}-${c.id}`; input.value = c[key]; input.setAttribute('aria-label', `${c.id} ${label} (mm)`);
      cell.append(input); row.append(cell);
    }
    const cell = document.createElement('td'), output = document.createElement('output');
    output.id = `id-${c.id}`; output.setAttribute('for', `amplitude-${c.id} width-${c.id}`);
    cell.append(output); row.append(cell); return row;
  }));
  previewSettings();
}
async function fullscreen() {
  if (!document.fullscreenElement) {
    if (!document.documentElement.requestFullscreen) throw Error('全画面表示を利用できません。ChromeまたはEdgeでこのURLを開いてください。');
    await document.documentElement.requestFullscreen();
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (!document.fullscreenElement) throw Error('全画面に切り替えられませんでした。全画面ボタンからもう一度操作してください。');
}
function calibrationPreview(reset = false) {
  if (!spec) return;
  if (reset) $('calibration-check').checked = false;
  const measured = Number($('measured-mm').value), scale = 400 / measured;
  const valid = Number.isFinite(scale) && scale > 0 && measured >= 1;
  const current = viewport();
  $('display-info').textContent = `現在の表示領域：${current.width} × ${current.height} CSS px ／ DPR ${current.dpr}`;
  const ruler = $('verify-ruler');
  if (!valid) {
    ruler.setAttribute('width', '30'); ruler.setAttribute('height', '30'); ruler.replaceChildren();
    $('scale-output').textContent = '線の実測値を入力してください。';
    $('fit-output').textContent = ''; $('calibration-done').disabled = true; return;
  }
  const length = 100 * scale;
  $('scale-output').textContent = `${scale.toFixed(5)} CSS px/mm。横線・縦線はいずれも100 mmです。`;
  ruler.setAttribute('width', String(length + 30)); ruler.setAttribute('height', String(length + 30));
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M15 10V20M15 15H${15 + length}M${15 + length} 10V20M10 15H20M15 15V${15 + length}M10 ${15 + length}H20`);
  path.setAttribute('stroke', '#172033'); path.setAttribute('fill', 'none'); ruler.replaceChildren(path);
  const candidate = {cssPxPerMm: scale, viewport: current};
  const fit = (engine?.session.configSnapshot || spec).conditions.every(c => P.fits(c, candidate));
  $('fit-output').textContent = !document.fullscreenElement ? '全画面にしてから確認してください。'
    : fit ? '4条件とも、実寸と周辺余白を保って画面内に収まります。'
    : '配置が画面内に収まりません。実測値・モニター・表示設定を確認してください。自動縮小はしません。';
  $('calibration-done').disabled = !(fit && document.fullscreenElement && $('calibration-check').checked);
}
function openCalibration() {
  calibrated = false;
  show('calibration');
  $('calibration-back').hidden = !!engine;
  calibrationPreview(true);
}
async function confirmCalibration() {
  calibrationPreview();
  if ($('calibration-done').disabled) return;
  calibration = {id: crypto.randomUUID(), revision: (engine?.session.calibrations.length || 0) + 1,
    cssPxPerMm: 400 / Number($('measured-mm').value), measuredCssPx: 400, measuredMm: Number($('measured-mm').value),
    checked100MmBothAxes: true, createdAtIso: new Date().toISOString(), viewport: viewport(), environment: environment()};
  calibrated = true;
  displayKey = displaySignature();
  notice();
  if (engine) {
    engine.calibrate(calibration, stamp());
    await queueSave();
    renderState();
  } else {
    show('briefing');
    $('instruction').replaceChildren(...spec.instructionJa.split('。').filter(Boolean).map(text => {
      const p = document.createElement('p'); p.textContent = text + '。'; return p;
    }));
  }
}
async function configHash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function startExperiment() {
  if (!calibrated || !matchesDisplay(calibration)) { openCalibration(); return; }
  const id = crypto.randomUUID();
  if (!await store.acquire(id)) throw Error('このセッションは別のタブで実行されています。');
  const snapshot = P.copy(spec);
  const hash = await configHash({spec: snapshot, options});
  if (!calibrated || !matchesDisplay(calibration)) { store.unlock(); openCalibration(); return; }
  engine = new P.Experiment(P.createSession(snapshot, options, calibration, environment(), id, new Date().toISOString(), hash));
  engine.attachSegment(performance.timeOrigin, new Date().toISOString());
  engine.log('session_start', stamp());
  engine.log('sequence_start', stamp(), {sequenceId: engine.sequence.sequenceId, phase: engine.sequence.phase, conditionId: engine.sequence.conditionId});
  await queueSave(true); await store.flush();
  pressed = false;
  renderState();
}
function saveFailure(error) {
  if (!storageFailed) {
    storageFailed = true;
    if (engine) { engine.pause('storage_failure', stamp()); engine.log('storage_failure', stamp(), {message: error.message}); }
  }
  notice('ブラウザ内の保存に失敗しました。CSV・JSONへ退避するか、保存を再試行してください。 ' + error.message);
  if (engine) renderState();
}
function queueSave(full = false) {
  if (!engine) return Promise.resolve();
  if (storageFailed) return Promise.reject(store.failure || Error('保存の再試行が必要です。'));
  const result = store.save(engine.batch(full));
  result.catch(saveFailure);
  return result;
}
function backgroundSave() { queueSave().catch(() => {}); }
function drawTargets() {
  if (!engine) return;
  const cal = engine.session.calibration, g = P.geometry(engine.condition, cal), dpr = cal.viewport.dpr;
  const width = Math.round(cal.viewport.width * dpr), height = Math.round(cal.viewport.height * dpr);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cal.viewport.width, cal.viewport.height);
  const selectable = ['ready', 'reanchor', 'first', 'correcting'].includes(engine.state.mode) && !boundary;
  for (let i = 0; i < 13; i++) {
    const point = g.centers[i], active = selectable && i === engine.targetIndex;
    context.beginPath(); context.arc(point.x, point.y, g.width / 2, 0, Math.PI * 2);
    context.fillStyle = active ? '#1f6feb' : '#eef1f6'; context.fill();
    const line = active ? 2 : 1;
    context.beginPath(); context.arc(point.x, point.y, Math.max(0, g.width / 2 - line / 2), 0, Math.PI * 2);
    context.lineWidth = line;
    context.strokeStyle = active ? performance.now() < missUntil ? '#c43a31' : '#1754b5' : '#abb5c4'; context.stroke();
  }
  $('ready-message').hidden = ['first', 'correcting'].includes(engine.state.mode) && !boundary;
  $('ready-message').textContent = boundary ? '記録を保存しています…' : engine.state.mode === 'reanchor' ? '青い円をクリックして位置を合わせてください' : '青い円をクリックして開始';
  canvas.dataset.phase = engine.sequence.phase;
  canvas.dataset.condition = engine.sequence.conditionId;
  canvas.dataset.state = engine.state.mode;
  canvas.dataset.target = selectable ? String(engine.targetIndex) : '';
  const attemptId = engine.currentTrial?.attemptId;
  if (attemptId && engine.currentTrial.targetPaintAtMonotonicMs === null) requestAnimationFrame(t => {
    if (engine) engine.markPaint(t, attemptId);
  });
}
function renderPause() {
  show('pause');
  const s = engine.session, seq = engine.sequence;
  $('pause-chips').replaceChildren(...[s.experimentMode === 'main' ? '本実験' : '予備実験', s.participantId,
    `訓練条件 ${P.trainingIds(s).join('・')}`, `${phases[seq.phase]} ${seq.conditionId}`, `${s.counts.total} / ${s.sequencePlan.reduce((sum, sequence) => sum + sequence.trialCount, 0)}試行`].map(text => {
    const span = document.createElement('span'); span.className = 'tag'; span.textContent = text; return span;
  }));
  const reason = s.events.filter(event => event.type === 'paused').at(-1)?.reason;
  $('pause-reason').textContent = storageFailed ? '保存を再試行するか、CSV・JSONをファイルへ退避してください。'
    : !calibrated || !matchesDisplay(s.calibration) ? '表示環境を確認し、再校正してから再開してください。' : `停止理由：${reason || '手動停止'}`;
  $('resume').disabled = storageFailed;
  $('resume').textContent = calibrated && matchesDisplay(s.calibration) ? '再開する' : '全画面・再校正へ';
  $('retry-storage').hidden = !storageFailed;
}
function renderComplete() {
  show('complete');
  const s = engine.session;
  $('complete-title').textContent = s.status === 'finished' ? '実験が終了しました' : '実験を途中終了しました';
  $('complete-summary').textContent = `参加者 ${s.participantId} ／ 訓練条件 ${P.trainingIds(s).join('・')} ／ ${s.experimentMode === 'main' ? '本実験' : '予備実験'}`;
  $('complete-stats').replaceChildren(...[['訓練', s.counts.phases.training || 0], ['事後測定', s.counts.phases.post || 0], ['合計', s.counts.total]].map(([label, value]) => {
    const div = document.createElement('div'); div.className = 'stat';
    const strong = document.createElement('strong'); strong.textContent = value;
    const span = document.createElement('span'); span.textContent = label + 'の記録試行数'; div.append(strong, span); return div;
  }));
  $('retry-complete').hidden = !storageFailed;
  $('next-participant').disabled = !$('save-check').checked || storageFailed;
}
function renderState() {
  if (!engine) return;
  const mode = engine.state.mode;
  if (['finished', 'aborted'].includes(mode)) { renderComplete(); return; }
  if (mode === 'paused') { renderPause(); return; }
  if (mode === 'break') {
    if (screen !== 'break') breakStart = performance.now();
    show('break'); $('break-time').textContent = '00:00'; return;
  }
  show('task'); drawTargets();
}
async function finishBoundary() {
  if (boundary || engine?.state.mode !== 'boundary') return;
  boundary = true; drawTargets();
  try {
    await queueSave(); await store.flush();
    if (engine.state.mode !== 'boundary') return;
    engine.nextSequence(stamp());
    await queueSave(); await store.flush();
  } catch (error) { saveFailure(error); }
  finally { boundary = false; renderState(); }
  if (engine.state.mode === 'finished' && !storageFailed) await exportData('csv', true);
}
function pause(reason) {
  if (!engine || ['finished', 'aborted'].includes(engine.state.mode)) return;
  engine.pause(reason, stamp()); pressed = false;
  renderState(); backgroundSave();
}
async function resumeExperiment() {
  if (storageFailed) throw Error('保存を再試行してから再開してください。');
  if (!calibrated || !matchesDisplay(engine.session.calibration)) {
    openCalibration(); await fullscreen(); calibrationPreview(true); return;
  }
  await store.flush();
  engine.resume(stamp());
  await queueSave(); await store.flush();
  pressed = false; renderState();
  if (engine.state.mode === 'boundary') await finishBoundary();
}
function displayChanged(reason) {
  const key = displaySignature();
  if (key === displayKey) return;
  displayKey = key;
  calibrated = false;
  if (screen === 'calibration') { calibrationPreview(true); return; }
  if (engine && !['finished', 'aborted'].includes(engine.state.mode)) pause(reason);
  else if (screen === 'briefing') { notice('表示が変わったため、再度校正してください。'); openCalibration(); }
}
function pointerDown(event) {
  const time = stamp();
  if (!engine || screen !== 'task' || boundary || !['ready', 'reanchor', 'first', 'correcting'].includes(engine.state.mode)) return;
  if (!calibrated || !matchesDisplay(engine.session.calibration)) { displayChanged('display_changed'); return; }
  const rect = canvas.getBoundingClientRect();
  const input = {...time, x: event.clientX - rect.left, y: event.clientY - rect.top, button: event.button,
    buttons: event.buttons, pointerType: event.pointerType, isPrimary: event.isPrimary, rawEventTimestamp: event.timeStamp};
  if (event.pointerType === 'mouse' && event.button === 0) {
    if (pressed) { engine.recordClick('invalid', {...input, reason: 'release_required'}, null); backgroundSave(); return; }
    pressed = true;
  }
  const hit = engine.input(input);
  if (!hit && event.pointerType === 'mouse' && event.button === 0) {
    missUntil = performance.now() + 180;
    const id = ++renderId;
    setTimeout(() => { if (id === renderId && screen === 'task') drawTargets(); }, 190);
  }
  drawTargets(); backgroundSave();
  if (engine.state.mode === 'boundary') finishBoundary();
}
function pointerMove(event) {
  const t = performance.now();
  if (!engine || screen !== 'task' || !['first', 'correcting'].includes(engine.state.mode) || event.pointerType !== 'mouse') return;
  const rect = canvas.getBoundingClientRect();
  const coalesced = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  const samples = coalesced.length ? coalesced : [event];
  for (const sample of samples) engine.sample({t, rawEventTimestamp: sample.timeStamp, x: sample.clientX - rect.left,
    y: sample.clientY - rect.top, buttons: sample.buttons, source: coalesced.length ? 'coalesced' : 'pointermove'});
}
function filename(kind) {
  const s = engine.session, participant = s.participantId.replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 80);
  const time = new Date().toISOString().replace(/[:.]/g, '-');
  return `pointing_${s.experimentMode}_${participant}_${s.sessionId}_${time}_${kind === 'csv' ? 'trials.csv' : 'session.json'}`;
}
async function exportData(kind, automatic = false) {
  if (!engine) return;
  engine.flushSamples();
  const name = filename(kind);
  const record = {kind, filename: name, requestedAtIso: new Date().toISOString(), automatic};
  engine.session.exportHistory.push(record);
  engine.log('export_requested', stamp(), record);
  if (!storageFailed) { try { await queueSave(); await store.flush(); } catch (error) { saveFailure(error); } }
  const content = kind === 'csv' ? P.exportCsv(engine.session) : JSON.stringify({...engine.session,
    archiveState: {storagePending: store.pending, storageError: storageFailed, exportedAtIso: new Date().toISOString()}}, null, 2);
  const blob = new Blob([content], {type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $('save-message').textContent = `${kind.toUpperCase()}の保存を開始しました。保存先を確認してください。必要ならもう一度保存できます。`;
  if (storageFailed) $('save-message').textContent += ' ブラウザ内の保存は未完了です。';
}
async function refreshHistory() {
  const sessions = await store.list();
  const blank = document.createElement('option'); blank.value = ''; blank.textContent = sessions.length ? 'セッションを選択してください' : '保存されたセッションはありません';
  $('history').replaceChildren(blank, ...sessions.map(s => {
    const option = document.createElement('option'); option.value = s.sessionId;
    option.textContent = `${s.participantId} · ${s.experimentMode} · ${P.trainingIds(s).join('・')} · ${s.counts.total}試行 · ${s.status} · ${s.updatedAtIso}`;
    return option;
  }));
  $('restore').disabled = true;
}
async function restoreSession() {
  const id = $('history').value;
  if (!id) return;
  if (!await store.acquire(id)) throw Error('この記録は別のタブで開かれています。そちらを閉じてから再開してください。');
  const session = await store.load(id);
  if (!['1.0.0', '1.1.0', '1.2.0'].includes(session.schemaVersion) ||
      !['pointing-between-28-post104-v1', 'pointing-selected-28-post104-v2', spec.protocolId, spec.protocol.pilot.protocolId].includes(session.protocolId)) {
    store.unlock(); throw Error('この記録の仕様は現在のアプリに対応していません。');
  }
  engine = new P.Experiment(session);
  engine.pause('page_reloaded', {t: null, iso: new Date().toISOString()});
  engine.attachSegment(performance.timeOrigin, new Date().toISOString());
  engine.log('session_restored', stamp());
  calibration = session.calibration; calibrated = false; pressed = false;
  $('measured-mm').value = calibration.measuredMm;
  for (const [id, value] of Object.entries(calibration.environment?.reported || {})) if ($(id)) $(id).value = value || '';
  await queueSave(true); await store.flush();
  renderState(); notice();
}
async function retryStorage() {
  if (!engine) return;
  engine.log('storage_retry', stamp());
  try { await store.retry(engine.batch(true)); storageFailed = false; notice(); renderState(); }
  catch (error) { saveFailure(error); }
}
function action(id, callback) {
  $(id).addEventListener('click', async event => {
    if (busy) return;
    busy = true;
    try { await callback(event); } catch (error) { notice(error.message); }
    finally { busy = false; }
  });
}
async function initialize() {
  try {
    if (location.protocol === 'file:') throw Error('READMEの起動手順でローカルサーバーを起動し、http://127.0.0.1:8766/system/ から開いてください。');
    const response = await fetch('pointing_experiment_spec.json', {cache: 'no-store'});
    if (!response.ok) throw Error('実験設定を読み込めませんでした。');
    defaultSpec = await response.json();
    spec = P.configureConditions(defaultSpec, defaultSpec.conditions);
    if (spec.task.targetCount !== 13 || spec.protocol.main.trainingTrials !== 208 || spec.protocol.main.trainingConditionCount !== 1) throw Error('現在の実装と実験設定が一致しません。');
    await store.open();
    renderConditions(); await refreshHistory();
    $('open-settings').disabled = false;
    $('setup-next').disabled = false;
    displayKey = displaySignature();
  } catch (error) { notice(error.message); }
}
$('setup-form').addEventListener('input', summarizePlan);
document.querySelectorAll('input[name=mode]').forEach(input => input.addEventListener('change', renderConditions));
$('settings-form').addEventListener('input', previewSettings);
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  if (busy || engine) return;
  const next = previewSettings();
  if (!next) return;
  spec = next; calibration = null; calibrated = false;
  renderConditions(); show('setup'); notice();
});
$('setup-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  busy = true;
  try {
    options = setupOptions();
    if (!options.participantId) throw Error('参加者IDを入力してください。');
    P.buildPlan(spec, options);
    openCalibration(); await fullscreen(); calibrationPreview(true); notice();
  } catch (error) { notice(error.message); }
  finally { busy = false; }
});
$('measured-mm').addEventListener('input', () => calibrationPreview(true));
$('calibration-check').addEventListener('change', () => calibrationPreview());
$('history').addEventListener('change', () => { $('restore').disabled = !$('history').value; });
$('save-check').addEventListener('change', () => { $('next-participant').disabled = !$('save-check').checked || storageFailed; });
action('calibration-fullscreen', async () => { await fullscreen(); calibrationPreview(true); });
action('open-settings', () => { if (!engine) { fillSettings(spec.conditions); notice(); show('settings'); } });
action('settings-back', () => { show('setup'); notice(); });
action('settings-defaults', () => fillSettings(defaultSpec.conditions));
action('calibration-back', () => { calibration = null; calibrated = false; show('setup'); });
action('calibration-done', confirmCalibration);
action('start', startExperiment);
action('resume', resumeExperiment);
action('break-resume', resumeExperiment);
action('break-controls', () => pause('researcher_controls'));
action('recalibrate', async () => { openCalibration(); await fullscreen(); calibrationPreview(true); });
action('retry-storage', retryStorage);
action('retry-complete', retryStorage);
action('restore', restoreSession);
action('abort', () => $('abort-dialog').showModal());
action('abort-cancel', () => $('abort-dialog').close());
action('abort-confirm', async () => {
  $('abort-dialog').close(); engine.abort(stamp());
  if (!storageFailed) { try { await queueSave(); await store.flush(); } catch (error) { saveFailure(error); } }
  renderState(); await exportData('csv', true);
});
action('next-participant', async () => {
  if (!$('save-check').checked || storageFailed) return;
  await store.flush();
  store.unlock(); engine = null; options = null; calibration = null; calibrated = false; pressed = false;
  $('participant').value = ''; $('save-check').checked = false; $('next-participant').disabled = true;
  $('save-message').textContent = 'CSVとJSONを保存して、保存先のファイルを確認してください。';
  show('setup'); notice(); await refreshHistory();
});
document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', () => {
  exportData(button.dataset.export).catch(error => notice(error.message));
}));
canvas.addEventListener('pointerdown', pointerDown);
canvas.addEventListener('pointermove', pointerMove);
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('pointerup', event => { if (event.pointerType === 'mouse' && event.button === 0) pressed = false; });
window.addEventListener('pointercancel', () => pause('pointercancel'));
window.addEventListener('blur', () => { if (['task', 'break'].includes(screen)) pause('window_blur'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && engine) pause('document_hidden'); });
document.addEventListener('fullscreenchange', () => displayChanged('fullscreen_changed'));
window.addEventListener('resize', () => displayChanged('viewport_changed'));
window.visualViewport?.addEventListener('resize', () => displayChanged('visual_viewport_changed'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && engine && ['task', 'break'].includes(screen)) { event.preventDefault(); pause('Escape'); }
  if (event.key === 'Enter' && screen === 'break' && !busy) { event.preventDefault(); $('break-resume').click(); }
});
window.addEventListener('beforeunload', event => {
  if (engine && engine.session.status === 'active') { pause('page_unload'); event.preventDefault(); event.returnValue = ''; }
});
setInterval(() => {
  displayChanged('display_changed');
  if (screen === 'break') {
    const seconds = Math.floor((performance.now() - breakStart) / 1000);
    $('break-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
}, 250);
setInterval(() => { if (engine?.samples.length && !storageFailed) backgroundSave(); }, 1000);
initialize();
