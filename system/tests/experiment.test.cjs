const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../experiment-core.js');
const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '../pointing_experiment_spec.json'), 'utf8'));
const calibration = {id: 'cal1', revision: 1, cssPxPerMm: 2, viewport: {width: 1200, height: 800, dpr: 2}};
function make(condition = 'C1', enrollmentIndex = 1, mode = 'pilot') {
  const options = {participantId: 'TEST', ...(Array.isArray(condition) ? {trainingConditions: condition} : {trainingCondition: condition}), enrollmentIndex, mode};
  const e = new P.Experiment(P.createSession(spec, options, calibration, {}, 'test-session', '2026-09-24T00:00:00Z', 'hash'));
  e.attachSegment(10000, '2026-09-24T00:00:00Z'); return e;
}
function click(e, t, hit = true) {
  const center = P.geometry(e.condition, e.session.calibration).centers[e.targetIndex];
  const input = {t, iso: new Date(10000 + t).toISOString(), x: hit ? center.x : 0, y: hit ? center.y : 0,
    pointerType: 'mouse', button: 0, isPrimary: true};
  e.input(input); return input;
}
test('全4群で訓練208・事後26×4、操作確認なし', () => {
  for (const trainingCondition of ['C1', 'C2', 'C3', 'C4']) for (let index = 1; index <= 4; index++) {
    const e = make(trainingCondition, index), plan = e.session.sequencePlan;
    const train = plan.filter(s => s.phase === 'training'), post = plan.filter(s => s.phase === 'post');
    assert.deepEqual(train.map(s => s.trialCount), Array(16).fill(13));
    assert.ok(train.every(s => s.conditionId === trainingCondition));
    assert.equal(plan.reduce((sum, s) => sum + s.trialCount, 0), 312);
    for (const c of spec.conditions) assert.equal(post.filter(s => s.conditionId === c.id).reduce((sum, s) => sum + s.trialCount, 0), 26);
  }
});
test('事後の各ラウンドは群内4順序で位置と直前条件を均衡化', () => {
  for (const round of [1, 2]) {
    const rows = [1, 2, 3, 4].map(index => make('C1', index).session.sequencePlan.filter(s => s.round === round).map(s => s.conditionId));
    for (let pos = 0; pos < 4; pos++) assert.equal(new Set(rows.map(row => row[pos])).size, 4);
    assert.equal(new Set(rows.flatMap(row => row.slice(1).map((c, i) => row[i] + c))).size, 12);
  }
});
test('本実験は訓練1条件だけを許可し、事後を最後に1回実施', () => {
  for (const id of ['C1', 'C2', 'C3', 'C4']) {
    const s = make([id], 3, 'main').session;
    assert.deepEqual(s.trainingConditions, [id]);
    assert.deepEqual(s.plannedCounts, {training: 208, post: 104, total: 312});
    assert.ok(s.sequencePlan.slice(0, 16).every(seq => seq.phase === 'training' && seq.conditionId === id));
    assert.ok(s.sequencePlan.slice(16).every(seq => seq.phase === 'post'));
    assert.deepEqual(s.sequencePlan.slice(0, 16).map(seq => seq.conditionTrialOffset), Array.from({length: 16}, (_, i) => i * 13));
  }
  for (const selected of [[], ['C1', 'C3'], ['C1', 'C1'], ['C5']]) assert.throws(() => make(selected, 1, 'main'), /訓練条件/);
});
test('予備実験は選択した1〜4条件を各208試行、その後に全4条件を各26試行', () => {
  const ids = ['C1', 'C2', 'C3', 'C4'];
  for (let mask = 1; mask < 16; mask++) for (let index = 1; index <= 4; index++) {
    const selected = ids.filter((id, i) => mask & (1 << i));
    const s = make(selected, index).session, train = s.sequencePlan.filter(seq => seq.phase === 'training');
    const post = s.sequencePlan.slice(train.length);
    assert.equal(s.experimentMode, 'pilot');
    assert.equal(s.protocolId, spec.protocol.pilot.protocolId);
    assert.deepEqual(s.plannedCounts, {training: 208 * selected.length, post: 104, total: 208 * selected.length + 104});
    assert.equal(train.length, selected.length * 16); assert.equal(post.length, 8);
    for (const id of ids) {
      assert.equal(train.filter(seq => seq.conditionId === id).reduce((sum, seq) => sum + seq.trialCount, 0), selected.includes(id) ? 208 : 0);
      assert.equal(post.filter(seq => seq.conditionId === id).reduce((sum, seq) => sum + seq.trialCount, 0), 26);
    }
    assert.ok(post.every(seq => seq.phase === 'post'));
  }
  assert.deepEqual(make(['C1', 'C3'], 1).session.trainingConditions, ['C1', 'C3']);
  assert.deepEqual(make(['C1', 'C3'], 3).session.trainingConditions, ['C3', 'C1']);
  for (const selected of [[], ['C1', 'C1'], ['C5']]) assert.throws(() => make(selected), /訓練条件/);
});
test('予備実験2条件の520試行を完了し、条件間休憩とCSVの訓練条件を保持', () => {
  const e = make(['C1', 'C3'], 3), breaks = [];
  let t = 0;
  while (e.state.mode !== 'finished') {
    assert.ok(t < 100000);
    if (e.state.mode === 'boundary') e.nextSequence({t: t += 100, iso: 'boundary'});
    else if (e.state.mode === 'break') {
      breaks.push([e.sequence.phase, e.sequence.conditionId]);
      e.resume({t: t += 100, iso: 'resume'});
    } else click(e, t += 100);
  }
  assert.equal(e.session.counts.total, 520);
  assert.equal(new Set(e.session.trials.map(row => row.plannedTrialId)).size, 520);
  assert.deepEqual(breaks.filter(([phase]) => phase === 'training'), [['training', 'C1']]);
  for (const row of e.session.trials) {
    assert.deepEqual(row.trainingConditions, ['C3', 'C1']); assert.equal(row.trainingCondition, null);
    assert.equal(row.mtFirstMs, 100); assert.notEqual(row.fromTargetIndex, row.toTargetIndex);
    assert.ok(row.trialInCondition <= (row.phase === 'training' ? 208 : 26));
  }
  const restored = new P.Experiment(P.copy(e.session));
  assert.deepEqual(restored.session.sequencePlan, e.session.sequencePlan);
  assert.ok(P.exportCsv(restored.session).includes('"[""C3"",""C1""]"'));
});
test('旧v3の予備実験は保存された単一条件の設定と312試行を保持', () => {
  const oldSpec = P.copy(spec);
  oldSpec.protocol.pilot = {samePlanAsMain: true, exportMode: 'pilot'};
  const options = {participantId: 'OLD', trainingConditions: ['C3'], enrollmentIndex: 1, mode: 'pilot'};
  assert.throws(() => P.buildPlan(oldSpec, {...options, trainingConditions: ['C1', 'C3']}), /訓練条件/);
  const session = P.createSession(oldSpec, options, calibration, {}, 'old', 'start', 'hash');
  assert.equal(session.protocolId, 'pointing-single-208-post104-continuous-v3');
  assert.deepEqual(new P.Experiment(P.copy(session)).session.plannedCounts, {training: 208, post: 104, total: 312});
});
test('13移動目のクリックを次周の開始に使い、再クリック・計時リセット待ちを挟まない', () => {
  const e = make(); click(e, 100);
  for (let i = 1; i <= 13; i++) click(e, 100 + i * 500);
  assert.equal(e.session.counts.total, 13);
  assert.equal(e.state.sequencePos, 1); assert.equal(e.state.moveIndex, 0);
  assert.equal(e.state.mode, 'first'); assert.equal(e.targetIndex, 6);
  const prior = e.session.trials[12], next = e.currentTrial;
  assert.equal(prior.toTargetIndex, 0); assert.equal(next.fromTargetIndex, 0); assert.equal(next.toTargetIndex, 6);
  assert.equal(next.startAtMonotonicMs, prior.firstClickAtMonotonicMs);
  assert.equal(next.startClickX, prior.completionX); assert.equal(next.startClickY, prior.completionY);
  assert.equal(e.session.clicks.filter(c => c.role === 'start').length, 1);
  click(e, 7100); assert.equal(next.mtFirstMs, 500);
  assert.equal(next.trialInCondition, 14); assert.equal(next.trialInSequence, 1);
});
test('周回末尾のミスを修正した時刻から次周を計時する', () => {
  const e = make(); click(e, 100);
  for (let i = 1; i <= 12; i++) click(e, 100 + i * 100);
  click(e, 1400, false); assert.equal(e.state.mode, 'correcting'); assert.equal(e.state.sequencePos, 0);
  click(e, 1900);
  assert.equal(e.state.sequencePos, 1); assert.equal(e.currentTrial.startAtMonotonicMs, 1900);
  click(e, 2400);
  assert.equal(e.session.trials[12].mtFirstMs, 100); assert.equal(e.session.trials[12].mtCompletionMs, 600);
  assert.equal(e.session.trials[13].mtFirstMs, 500); assert.equal(e.session.counts.total, 14);
});
test('周回境界で中断しても前周は確定し、次周の同一試行を再開する', () => {
  const e = make(); click(e, 100);
  for (let i = 1; i <= 13; i++) click(e, 100 + i * 100);
  const interrupted = e.currentTrial;
  e.pause('blur', {t: 1500, iso: 'pause'}); e.resume({t: 10000, iso: 'resume'});
  click(e, 10100); click(e, 10600);
  assert.equal(interrupted.countedAsTrial, false);
  assert.equal(e.session.counts.total, 14);
  const result = e.session.trials.find(t => t.plannedTrialId === interrupted.plannedTrialId && t.countedAsTrial);
  assert.equal(result.attemptIndex, 2); assert.equal(result.mtFirstMs, 500);
});
test('旧28試行・複数条件の保存記録では旧設定と系列開始操作を保持する', () => {
  const legacySpec = P.copy(spec);
  legacySpec.protocolId = 'pointing-selected-28-post104-v2';
  legacySpec.protocol.main.trainingConditionCount = 'selected_1_to_4';
  legacySpec.protocol.main.trainingSequenceLengths = [13, 13, 2];
  legacySpec.protocol.pilot = {samePlanAsMain: true, exportMode: 'pilot'};
  legacySpec.protocol.betweenSequences = {timerStopped: true, unmeasuredTopTargetStartRequired: true};
  const s = P.createSession(legacySpec, {participantId: 'LEGACY', trainingConditions: ['C1', 'C3'], enrollmentIndex: 3, mode: 'pilot'}, calibration, {}, 'legacy', 'start', 'hash');
  s.schemaVersion = '1.1.0'; s.appVersion = '1.1.0';
  const e = new P.Experiment(P.copy(s)); click(e, 100);
  for (let i = 1; i <= 13; i++) click(e, 100 + i * 100);
  assert.equal(e.state.mode, 'boundary'); e.nextSequence({t: 5000, iso: 'next'});
  assert.equal(e.state.mode, 'ready'); assert.equal(e.session.counts.total, 13);
  click(e, 6000); assert.equal(e.session.counts.total, 13);
  click(e, 6500); assert.equal(e.session.trials[13].mtFirstMs, 500);
  assert.equal(e.session.sequencePlan.reduce((sum, seq) => sum + seq.trialCount, 0), 160);
  assert.ok(P.exportCsv(e.session).includes('"[""C3"",""C1""]"'));
  const oldSingle = P.copy(make().session); delete oldSingle.trainingConditions;
  assert.deepEqual(P.trainingIds(oldSingle), ['C1']);
});
test('13方向の中心間距離・ヒット境界・非重複・実寸の収まり', () => {
  for (const c of spec.conditions) {
    const g = P.geometry(c, calibration);
    assert.ok(P.fits(c, calibration));
    for (let i = 0; i < 13; i++) {
      const a = g.centers[P.order[i]], b = g.centers[P.order[i + 1]];
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - c.amplitudeMm * 2) < 1e-9);
      for (let j = 0; j < i; j++) assert.ok(Math.hypot(g.centers[i].x - g.centers[j].x, g.centers[i].y - g.centers[j].y) > g.width);
    }
    const e = make(c.id), target = g.centers[0];
    assert.equal(e.hit({x: target.x + g.width / 2, y: target.y}), true);
    assert.equal(e.hit({x: target.x + g.width / 2 + 0.01, y: target.y}), false);
  }
  assert.equal(P.fits(spec.conditions[2], {...calibration, cssPxPerMm: 10}), false);
});
test('編集したA・WからID・配置を再計算し開始時の寸法を固定する', () => {
  const values = P.copy(spec.conditions);
  values[0].amplitudeMm = 120; values[0].widthMm = 15;
  const configured = P.configureConditions(spec, values), c = configured.conditions[0];
  assert.equal(c.labelJa, 'カスタム設定');
  assert.equal(c.nominalIdBits, Math.log2(9));
  assert.equal(c.predictionMs, 171.5 + 180 * Math.log2(9));
  const e = new P.Experiment(P.createSession(configured, {participantId: 'TEST', trainingCondition: 'C1', enrollmentIndex: 1, mode: 'pilot'}, calibration, {}, 'custom', 'start', 'hash'));
  configured.conditions[0].amplitudeMm = 500;
  click(e, 100); click(e, 800);
  assert.equal(spec.conditions[0].amplitudeMm, 90);
  assert.equal(e.session.configSnapshot.conditions[0].amplitudeMm, 120);
  const trial = e.session.trials[0];
  assert.equal(trial.amplitudeMm, 120); assert.equal(trial.widthMm, 15);
  assert.equal(trial.amplitudeCssPx, 240); assert.equal(trial.widthCssPx, 30);
  assert.equal(trial.nominalId, Math.log2(9));
  assert.ok(Math.abs(Math.hypot(trial.toCenterX - trial.fromCenterX, trial.toCenterY - trial.fromCenterY) - 240) < 1e-9);
});
test('不正な寸法・欠けた条件・接触するターゲットを拒否する', () => {
  for (const key of ['amplitudeMm', 'widthMm']) for (const value of [0, -1, NaN, Infinity, null, '90']) {
    const values = P.copy(spec.conditions); values[0][key] = value;
    assert.throws(() => P.configureConditions(spec, values), /0より大きい/);
  }
  assert.throws(() => P.configureConditions(spec, spec.conditions.slice(1)), /4条件/);
  const duplicate = P.copy(spec.conditions); duplicate[1].id = 'C1';
  assert.throws(() => P.configureConditions(spec, duplicate), /条件ID/);
  const touching = P.copy(spec.conditions);
  touching[0].widthMm = touching[0].amplitudeMm / Math.cos(Math.PI / 26) * Math.sin(Math.PI / 13);
  assert.throws(() => P.configureConditions(spec, touching), /接触・重複/);
  touching[0].widthMm -= 0.01;
  assert.doesNotThrow(() => P.configureConditions(spec, touching));
});
test('初回ミス700ms・修正成功1100msを分離し次のMTへ混入しない', () => {
  const e = make(); click(e, 1000); click(e, 1700, false); click(e, 1900, false); click(e, 2100); click(e, 2800);
  const [first, second] = e.session.trials;
  assert.equal(first.mtFirstMs, 700); assert.equal(first.firstHit, false);
  assert.equal(first.mtCompletionMs, 1100); assert.equal(first.correctionDurationMs, 400);
  assert.equal(first.correctionClickCount, 2); assert.equal(second.mtFirstMs, 700);
  assert.equal(e.session.counts.total, 2);
});
test('初回前の中断は同一論理試行の別attempt・停止時間を除外', () => {
  const e = make(); click(e, 1000); e.pause('blur', {t: 1200, iso: 'pause'}); e.resume({t: 20000, iso: 'resume'});
  click(e, 21000); click(e, 21500);
  const [aborted, result] = e.session.trials;
  assert.equal(aborted.countedAsTrial, false); assert.equal(aborted.mtFirstMs, null);
  assert.equal(result.plannedTrialId, aborted.plannedTrialId); assert.equal(result.attemptIndex, 2);
  assert.equal(result.mtFirstMs, 500); assert.equal(e.session.counts.total, 1);
});
test('初回ミス後の中断と再読込みでエラーを上書き・再カウントしない', () => {
  let e = make(); click(e, 1000); click(e, 1500, false);
  e = new P.Experiment(P.copy(e.session));
  e.pause('reload', {t: null, iso: 'reload'}); e.attachSegment(90000, 'new-clock'); e.resume({t: 100, iso: 'resume'});
  assert.equal(e.state.mode, 'reanchor');
  click(e, 500); click(e, 1200);
  const [error, next] = e.session.trials;
  assert.equal(error.mtFirstMs, 500); assert.equal(error.firstHit, false); assert.equal(error.mtCompletionMs, null);
  assert.equal(next.mtFirstMs, 700); assert.equal(e.session.counts.total, 2);
  assert.notEqual(error.segmentId, next.segmentId);
});
test('208回目のミス修正中に停止しても事後へ正しく進む', () => {
  const e = make(); let t = 0; click(e, t += 100);
  for (let i = 1; i <= 208; i++) click(e, t += 100, i !== 208);
  assert.equal(e.state.mode, 'correcting'); assert.equal(e.session.counts.total, 208);
  e.pause('Escape', {t: t += 100, iso: 'pause'}); e.resume({t: t += 100, iso: 'resume'}); click(e, t += 100);
  assert.equal(e.state.mode, 'boundary'); e.nextSequence({t: t += 100, iso: 'next'});
  assert.equal(e.sequence.phase, 'post'); assert.equal(e.state.mode, 'break'); assert.equal(e.session.counts.total, 208);
});
test('全312移動が重複なく終了し、周回境界でもAとMTを保つ', () => {
  const e = make('C3'); let t = 0, guard = 0;
  while (e.state.mode !== 'finished') {
    assert.ok(++guard < 1000);
    if (e.state.mode === 'boundary') e.nextSequence({t: t += 100, iso: 'boundary'});
    else if (e.state.mode === 'break') e.resume({t: t += 100, iso: 'resume'});
    else click(e, t += 100);
  }
  assert.equal(e.session.counts.total, 312);
  assert.deepEqual(e.session.counts.phases, {training: 208, post: 104});
  assert.equal(e.session.trials.length, 312);
  assert.equal(new Set(e.session.trials.map(row => row.plannedTrialId)).size, 312);
  assert.equal(e.session.clicks.filter(c => c.role === 'start').length, 8);
  assert.equal(e.session.events.filter(event => event.type === 'sequence_continued').length, 16);
  for (const row of e.session.trials) {
    assert.equal(row.mtFirstMs, 100); assert.equal(row.trainingCondition, 'C3');
    assert.notEqual(row.fromTargetIndex, row.toTargetIndex);
    assert.ok(Math.abs(Math.hypot(row.toCenterX - row.fromCenterX, row.toCenterY - row.fromCenterY) - row.amplitudeCssPx) < 1e-9);
  }
  const train = e.session.trials.filter(row => row.phase === 'training');
  assert.equal(train.at(-1).trialInCondition, 208);
  for (let i = 0; i < 13; i++) assert.equal(train.filter(row => row.toTargetIndex === i).length, 16);
  for (const c of spec.conditions) assert.equal(e.session.trials.filter(row => row.phase === 'post' && row.conditionId === c.id).length, 26);
});
test('座標軌跡の初回・修正を分け、保存バッチを後の変更から独立させる', () => {
  const e = make(); click(e, 1000);
  e.sample({t: 1200, x: 100, y: 100}); click(e, 1500, false); e.sample({t: 1600, x: 200, y: 200});
  const batch = e.batch();
  assert.deepEqual(batch.trajectoryChunks[0].samples.map(s => s.stage), ['primary', 'correction']);
  assert.equal(batch.meta.counts.total, 1); assert.equal(batch.trials[0].firstHit, false);
  click(e, 2000);
  assert.equal(batch.trials[0].completionStatus, 'pending');
  assert.equal(e.session.trials[0].completionStatus, 'completed');
  assert.equal(e.batch().clicks.length, 1);
});
test('右クリックは無効、CSVの欠損・日本語・改行・式入力を保持または無害化', () => {
  const e = make(); const point = P.geometry(e.condition, calibration).centers[0];
  e.input({...point, t: 100, iso: 'invalid', pointerType: 'mouse', button: 2});
  assert.equal(e.state.mode, 'ready'); assert.equal(e.session.counts.total, 0);
  assert.equal(P.csvCell(null), ''); assert.equal(P.csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(P.csvCell('参加者,"改行\nあり"'), '"参加者,""改行\nあり"""');
  assert.ok(P.exportCsv(e.session).startsWith('\uFEFFschemaVersion,'));
});
