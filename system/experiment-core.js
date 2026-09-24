(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const order = Array.from({length: 14}, (_, i) => i * 6 % 13);
  const trainingIds = value => value.trainingConditions ?? (value.trainingCondition ? [value.trainingCondition] : []);
  function configureConditions(spec, values) {
    if (!Array.isArray(values) || values.length !== spec.conditions.length) throw Error('4条件すべてのA・Wを入力してください。');
    const next = copy(spec);
    next.conditions = spec.conditions.map(original => {
      const matches = values.filter(c => c.id === original.id);
      if (matches.length !== 1) throw Error('条件IDが一致しません。');
      const {amplitudeMm, widthMm} = matches[0];
      if (![amplitudeMm, widthMm].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
        throw Error(`${original.id}：A・Wには0より大きい数値を入力してください。`);
      }
      const layoutDiameterMm = amplitudeMm / Math.cos(Math.PI / 26);
      const spacing = layoutDiameterMm * Math.sin(Math.PI / 13);
      const nominalIdBits = Math.log2(amplitudeMm / widthMm + 1);
      if (![layoutDiameterMm, nominalIdBits].every(Number.isFinite)) throw Error(`${original.id}：入力値が大きすぎます。`);
      if (widthMm >= spacing) throw Error(`${original.id}：隣接する円が接触・重複します。Wを${spacing.toFixed(3)} mm未満にするか、Aを大きくしてください。`);
      const unchanged = amplitudeMm === original.amplitudeMm && widthMm === original.widthMm;
      return {...original, labelJa: unchanged ? original.labelJa : 'カスタム設定',
        amplitudeMm, widthMm, nominalIdBits, layoutDiameterMm, predictionMs: 171.5 + 180 * nominalIdBits};
    });
    next.prediction.equalConditionMeanMs = next.conditions.reduce((sum, c) => sum + c.predictionMs, 0) / next.conditions.length;
    return next;
  }
  function buildPlan(spec, options) {
    const ids = spec.conditions.map(c => c.id);
    const selected = trainingIds(options);
    if (!Array.isArray(selected) || !selected.length) throw Error('訓練条件を1つ以上選択してください。');
    const selectionCount = (options.mode === 'pilot' ? spec.protocol.pilot?.trainingConditionCount : null) ?? spec.protocol.main.trainingConditionCount;
    if (selectionCount === 1 && selected.length !== 1) throw Error('訓練条件は1つ選択してください。');
    if (new Set(selected).size !== selected.length || selected.some(id => !ids.includes(id))) throw Error('訓練条件の選択が不正です。');
    if (!Number.isInteger(options.enrollmentIndex) || options.enrollmentIndex < 1) throw Error('割当番号は1以上の整数です。');
    if (!['main', 'pilot'].includes(options.mode)) throw Error('実験種別が不正です。');
    const row = (options.enrollmentIndex - 1) % 4;
    const plan = [], phaseCount = {}, conditionCount = {}, sequenceCount = {};
    function add(phase, conditionId, trialCount, round = null, conditionOrder = 1) {
      const key = `${phase}:${conditionId}`;
      plan.push({sequenceId: `s${plan.length + 1}`, phase, conditionId, conditionOrder, trialCount, round,
        sequenceIndexInCondition: (sequenceCount[key] || 0) + 1, conditionTrialOffset: conditionCount[key] || 0,
        phaseTrialOffset: phaseCount[phase] || 0});
      sequenceCount[key] = (sequenceCount[key] || 0) + 1;
      conditionCount[key] = (conditionCount[key] || 0) + trialCount;
      phaseCount[phase] = (phaseCount[phase] || 0) + trialCount;
    }
    const trainingOrder = spec.assignment.rows[row].filter(id => selected.includes(id));
    trainingOrder.forEach((id, index) => {
      for (const count of spec.protocol.main.trainingSequenceLengths) add('training', id, count, null, index + 1);
    });
    const postOrder = spec.assignment.postRoundRowOffsets.map(offset => spec.assignment.rows[(row + offset) % 4]);
    postOrder.forEach((conditions, round) => conditions.forEach((id, index) => add('post', id, 13, round + 1, index + 1)));
    return {row, trainingOrder, order: postOrder, plan, counts: {...phaseCount, total: phaseCount.training + phaseCount.post}};
  }
  function geometry(condition, calibration) {
    const scale = calibration.cssPxPerMm;
    if (!(scale > 0 && Number.isFinite(scale))) throw Error('校正係数が不正です。');
    const diameter = condition.amplitudeMm / Math.cos(Math.PI / 26) * scale;
    return {diameter, width: condition.widthMm * scale, centers: Array.from({length: 13}, (_, i) => {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / 13;
      return {x: calibration.viewport.width / 2 + diameter / 2 * Math.cos(angle), y: calibration.viewport.height / 2 + diameter / 2 * Math.sin(angle)};
    })};
  }
  function fits(condition, calibration, marginMm = 20) {
    const g = geometry(condition, calibration);
    const extent = g.diameter + g.width + marginMm * 2 * calibration.cssPxPerMm;
    return extent <= Math.min(calibration.viewport.width, calibration.viewport.height);
  }
  function createSession(spec, options, calibration, environment, id, iso, hash) {
    const assignment = buildPlan(spec, options);
    return {schemaVersion: '1.2.0', appVersion: '1.3.0', sessionId: id, participantId: options.participantId,
      experimentMode: options.mode, protocolId: options.mode === 'pilot' ? spec.protocol.pilot?.protocolId || spec.protocolId : spec.protocolId,
      trainingCondition: assignment.trainingOrder.length === 1 ? assignment.trainingOrder[0] : null,
      trainingConditions: [...assignment.trainingOrder], plannedCounts: assignment.counts,
      createdAtIso: iso, updatedAtIso: iso, status: 'active', configHash: hash, configSnapshot: copy(spec), options: copy(options),
      calibration: copy(calibration), calibrations: [copy(calibration)], environment: copy(environment),
      assignment: {enrollmentIndex: options.enrollmentIndex, row: assignment.row, trainingOrder: assignment.trainingOrder, order: assignment.order}, sequencePlan: assignment.plan,
      state: {mode: 'ready', sequencePos: 0, moveIndex: 0, activeTrial: null, recoveryTrial: null, resumeMode: null},
      counts: {total: 0, conditions: {}, phases: {}}, trials: [], clicks: [], trajectoryChunks: [], events: [], segments: [], checkpoints: [], exportHistory: []};
  }
  class Experiment {
    constructor(session) {
      this.session = session;
      this.dirty = new Set();
      this.cursors = {clicks: 0, events: 0, trajectoryChunks: 0};
      this.samples = [];
      this.segmentId = session.segments.at(-1)?.segmentId || null;
    }
    get state() { return this.session.state; }
    get sequence() { return this.session.sequencePlan[this.state.sequencePos]; }
    get condition() { return this.session.configSnapshot.conditions.find(c => c.id === this.sequence.conditionId); }
    get targetIndex() { return this.state.mode === 'reanchor' ? order[this.state.moveIndex + 1] : order[this.state.moveIndex + (['first', 'correcting'].includes(this.state.mode) ? 1 : 0)]; }
    get currentTrial() { return this.state.activeTrial === null ? null : this.session.trials[this.state.activeTrial]; }
    plannedId() { return `${this.session.sessionId}:${this.sequence.sequenceId}:t${this.state.moveIndex + 1}`; }
    log(type, input = {}, detail = {}) {
      const eventIndex = this.session.events.length + 1;
      this.session.events.push({eventId: `${this.session.sessionId}:e${eventIndex}`, sessionId: this.session.sessionId, eventIndex,
        segmentId: this.segmentId, type, t: input.t ?? null, iso: input.iso || new Date().toISOString(), ...detail});
    }
    attachSegment(timeOrigin, iso) {
      this.segmentId = `${this.session.sessionId}:segment${this.session.segments.length + 1}`;
      this.session.segments.push({segmentId: this.segmentId, performanceTimeOrigin: timeOrigin, startedAtIso: iso});
      this.log('segment_start', {iso});
    }
    hit(input, index = this.targetIndex) {
      const g = geometry(this.condition, this.session.calibration);
      return Math.hypot(input.x - g.centers[index].x, input.y - g.centers[index].y) <= g.width / 2;
    }
    recordClick(role, input, hit) {
      const clickIndex = this.session.clicks.length + 1;
      this.session.clicks.push({clickId: `${this.session.sessionId}:c${clickIndex}`, sessionId: this.session.sessionId, clickIndex,
        segmentId: this.segmentId, plannedTrialId: this.plannedId(), attemptId: this.currentTrial?.attemptId || null,
        calibrationId: this.session.calibration.id, geometryRevision: this.session.calibration.revision,
        role, hit, ...input});
    }
    beginTrial(input) {
      const s = this.session, seq = this.sequence, c = this.condition, g = geometry(c, s.calibration);
      const plannedTrialId = this.plannedId();
      const attemptIndex = s.trials.filter(t => t.plannedTrialId === plannedTrialId).length + 1;
      const from = g.centers[order[this.state.moveIndex]], to = g.centers[order[this.state.moveIndex + 1]];
      const row = {schemaVersion: s.schemaVersion, sessionId: s.sessionId, participantId: s.participantId, experimentMode: s.experimentMode,
        protocolId: s.protocolId, configHash: s.configHash, trainingCondition: s.trainingCondition, trainingConditions: [...trainingIds(s)],
        rowIndex: s.trials.length, phase: seq.phase, conditionId: c.id,
        conditionOrder: seq.conditionOrder, sequenceId: seq.sequenceId, sequenceIndexInCondition: seq.sequenceIndexInCondition,
        trialInSequence: this.state.moveIndex + 1, trialInCondition: seq.conditionTrialOffset + this.state.moveIndex + 1,
        trialInPhase: seq.phaseTrialOffset + this.state.moveIndex + 1, countedTotal: null,
        priorSameConditionFirstClicks: s.counts.conditions[c.id] || 0, priorAllConditionFirstClicks: s.counts.total,
        plannedTrialId, attemptId: `${plannedTrialId}:a${attemptIndex}`, attemptIndex, segmentId: this.segmentId,
        amplitudeMm: c.amplitudeMm, widthMm: c.widthMm, nominalId: Math.log2(c.amplitudeMm / c.widthMm + 1),
        amplitudeCssPx: c.amplitudeMm * s.calibration.cssPxPerMm, widthCssPx: g.width, layoutDiameterCssPx: g.diameter,
        calibrationId: s.calibration.id, geometryRevision: s.calibration.revision, fromTargetIndex: order[this.state.moveIndex],
        toTargetIndex: order[this.state.moveIndex + 1], fromCenterX: from.x, fromCenterY: from.y, toCenterX: to.x, toCenterY: to.y,
        startClickX: input.x, startClickY: input.y, startAtMonotonicMs: input.t, startedAtIso: input.iso,
        firstClickX: null, firstClickY: null, firstClickAtMonotonicMs: null, firstClickAtIso: null, mtFirstMs: null, firstHit: null,
        countedAsTrial: false, correctionClickCount: 0, completionX: null, completionY: null, completedAtIso: null,
        mtCompletionMs: null, correctionDurationMs: null, completionStatus: 'pending', interruptionReason: null, interruptedAtIso: null,
        trajectorySampleCount: 0, targetPaintAtMonotonicMs: null};
      s.trials.push(row);
      this.state.activeTrial = row.rowIndex;
      this.state.mode = 'first';
      this.dirty.add(row.rowIndex);
      this.log('trial_start', input, {attemptId: row.attemptId, sequenceId: seq.sequenceId});
    }
    input(input) {
      if (!['ready', 'reanchor', 'first', 'correcting'].includes(this.state.mode)) return false;
      if (input.pointerType !== 'mouse' || input.button !== 0 || input.isPrimary === false) {
        this.recordClick('invalid', input, null); return false;
      }
      const hit = this.hit(input);
      if (this.state.mode === 'ready' || this.state.mode === 'reanchor') {
        const recovery = this.state.mode === 'reanchor';
        this.recordClick(recovery ? 'reanchor' : 'start', input, hit);
        if (hit) {
          if (recovery) {
            const row = this.session.trials[this.state.recoveryTrial];
            row.recoveredAtIso = input.iso;
            this.dirty.add(row.rowIndex);
            this.state.recoveryTrial = null;
            this.advanceMove(input);
          } else this.beginTrial(input);
        }
        return hit;
      }
      const row = this.currentTrial;
      const first = this.state.mode === 'first';
      this.recordClick(first ? 'first' : 'correction', input, hit);
      if (first) {
        row.firstClickX = input.x; row.firstClickY = input.y; row.firstClickAtMonotonicMs = input.t; row.firstClickAtIso = input.iso;
        row.mtFirstMs = input.t - row.startAtMonotonicMs; row.firstHit = hit; row.countedAsTrial = true;
        row.countedTotal = ++this.session.counts.total;
        this.session.counts.conditions[row.conditionId] = (this.session.counts.conditions[row.conditionId] || 0) + 1;
        this.session.counts.phases[row.phase] = (this.session.counts.phases[row.phase] || 0) + 1;
        this.log('first_click_committed', input, {attemptId: row.attemptId, hit, mtFirstMs: row.mtFirstMs});
      } else row.correctionClickCount++;
      this.dirty.add(row.rowIndex);
      if (hit) {
        row.completionX = input.x; row.completionY = input.y; row.completedAtIso = input.iso;
        row.mtCompletionMs = input.t - row.startAtMonotonicMs;
        row.correctionDurationMs = input.t - row.firstClickAtMonotonicMs;
        row.completionStatus = 'completed';
        this.log('trial_completed', input, {attemptId: row.attemptId});
        this.advanceMove(input);
      } else this.state.mode = 'correcting';
      return hit;
    }
    advanceMove(input) {
      this.flushSamples();
      this.state.activeTrial = null;
      this.state.moveIndex++;
      if (this.state.moveIndex === this.sequence.trialCount) {
        this.state.mode = 'boundary';
        this.log('sequence_end', input, {sequenceId: this.sequence.sequenceId, phase: this.sequence.phase, conditionId: this.sequence.conditionId});
        const next = this.session.sequencePlan[this.state.sequencePos + 1];
        if (this.session.configSnapshot.protocol.betweenSequences.continueSameCondition && this.state.moveIndex === 13 &&
            next?.phase === this.sequence.phase && next.conditionId === this.sequence.conditionId) {
          this.nextSequence(input);
          this.log('sequence_continued', input, {sequenceId: this.sequence.sequenceId});
          this.beginTrial(input);
        }
      } else this.beginTrial(input);
    }
    nextSequence(input) {
      if (this.state.mode !== 'boundary') throw Error('系列の終了前には進めません。');
      const previous = this.sequence;
      if (++this.state.sequencePos === this.session.sequencePlan.length) {
        this.state.sequencePos--;
        this.state.mode = 'finished'; this.session.status = 'finished';
        this.session.finishedAtIso = input.iso;
        this.log('session_finished', input);
        return;
      }
      this.state.moveIndex = 0;
      const changed = previous.conditionId !== this.sequence.conditionId || previous.phase !== this.sequence.phase;
      this.state.mode = changed ? 'break' : 'ready';
      this.log('sequence_start', input, {sequenceId: this.sequence.sequenceId, phase: this.sequence.phase, conditionId: this.sequence.conditionId});
      if (this.state.mode === 'break') this.log('break_start', input);
    }
    pause(reason, input) {
      if (['paused', 'finished', 'aborted'].includes(this.state.mode)) return;
      const oldMode = this.state.mode;
      const row = this.currentTrial;
      if (row) {
        row.interruptionReason = reason; row.interruptedAtIso = input.iso; row.completionStatus = 'interrupted';
        row.mtCompletionMs = null; row.correctionDurationMs = null;
        this.dirty.add(row.rowIndex);
      }
      this.state.resumeMode = oldMode === 'correcting' ? 'reanchor' : oldMode === 'first' ? 'ready' : oldMode;
      if (oldMode === 'correcting') this.state.recoveryTrial = this.state.activeTrial;
      this.state.activeTrial = null;
      this.state.mode = 'paused';
      this.flushSamples();
      this.log('paused', input, {reason, previousMode: oldMode});
    }
    resume(input) {
      if (this.state.mode === 'paused') { this.state.mode = this.state.resumeMode || 'ready'; this.state.resumeMode = null; this.log('resumed', input); }
      else if (this.state.mode === 'break') { this.state.mode = 'ready'; this.log('break_end', input); }
    }
    abort(input) {
      if (['finished', 'aborted'].includes(this.state.mode)) return;
      this.pause('session_aborted', input);
      this.state.mode = 'aborted'; this.session.status = 'aborted'; this.session.finishedAtIso = input.iso;
      this.log('session_aborted', input);
    }
    calibrate(calibration, input) {
      this.session.calibration = copy(calibration);
      this.session.calibrations.push(copy(calibration));
      this.log('calibration_changed', input, {calibrationId: calibration.id});
    }
    sample(sample) {
      if (!['first', 'correcting'].includes(this.state.mode)) return;
      const row = this.currentTrial;
      this.samples.push({...sample, attemptId: row.attemptId, segmentId: this.segmentId, stage: this.state.mode === 'first' ? 'primary' : 'correction'});
      row.trajectorySampleCount++;
      this.dirty.add(row.rowIndex);
      if (this.samples.length >= 512) this.flushSamples();
    }
    flushSamples() {
      if (!this.samples.length) return;
      const chunkIndex = this.session.trajectoryChunks.length;
      this.session.trajectoryChunks.push({chunkId: `${this.session.sessionId}:path${chunkIndex}`, sessionId: this.session.sessionId,
        chunkIndex, samples: this.samples});
      this.samples = [];
    }
    markPaint(t, attemptId) {
      const row = this.currentTrial;
      if (row && row.attemptId === attemptId && row.targetPaintAtMonotonicMs === null) {
        row.targetPaintAtMonotonicMs = t;
        this.dirty.add(row.rowIndex);
      }
    }
    batch(full = false) {
      this.flushSamples();
      this.session.updatedAtIso = new Date().toISOString();
      const {trials, clicks, events, trajectoryChunks, ...meta} = this.session;
      const batch = {meta: copy(meta), trials: copy(full ? trials : [...this.dirty].map(i => trials[i]))};
      this.dirty.clear();
      for (const key of ['clicks', 'events', 'trajectoryChunks']) {
        batch[key] = copy(this.session[key].slice(full ? 0 : this.cursors[key]));
        this.cursors[key] = this.session[key].length;
      }
      return batch;
    }
  }
  const csvColumns = ('schemaVersion sessionId participantId experimentMode protocolId configHash trainingCondition trainingConditions phase conditionId conditionOrder sequenceId sequenceIndexInCondition trialInSequence trialInCondition trialInPhase countedTotal priorSameConditionFirstClicks priorAllConditionFirstClicks plannedTrialId attemptId attemptIndex segmentId amplitudeMm widthMm nominalId amplitudeCssPx widthCssPx layoutDiameterCssPx calibrationId geometryRevision fromTargetIndex toTargetIndex fromCenterX fromCenterY toCenterX toCenterY startClickX startClickY startAtMonotonicMs firstClickX firstClickY firstClickAtMonotonicMs mtFirstMs firstHit countedAsTrial correctionClickCount completionX completionY mtCompletionMs correctionDurationMs completionStatus interruptionReason interruptedAtIso startedAtIso firstClickAtIso completedAtIso recoveredAtIso trajectorySampleCount targetPaintAtMonotonicMs').split(' ');
  function csvCell(value) {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (typeof value === 'string' && /^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  }
  function exportCsv(session) {
    return '\uFEFF' + [csvColumns.join(','), ...session.trials.map(row => csvColumns.map(key =>
      csvCell(key === 'trainingConditions' ? JSON.stringify(trainingIds(row)) : row[key])).join(','))].join('\r\n') + '\r\n';
  }
  const api = {copy, order, trainingIds, configureConditions, buildPlan, geometry, fits, createSession, Experiment, csvColumns, csvCell, exportCsv};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Pointing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
