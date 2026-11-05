const assert = require('node:assert/strict');
const { test } = require('node:test');
const { scoreRound, summarizeScores } = require('../miniprogram/utils/score');
const { createRunControl, runSuite } = require('../miniprogram/utils/runner');

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

test('round score uses the geometric mean of suite totals in milliseconds', () => {
  const result = scoreRound([10, 40]);
  close(result.geomeanMs, 20);
  close(result.score, 50);
  close(scoreRound([20]).score, 50);
  close(scoreRound([5, 20]).score, result.score * 2);
});

test('final score averages round scores, not round times', () => {
  const result = summarizeScores([scoreRound([10]), scoreRound([40])], true);
  close(result.mean, 62.5);
  assert.equal(result.complete, true);
  assert.equal(result.formattedMean, '62.50');
  close(result.delta, 12.706205 * 37.5);
});

test('ten identical rounds have no confidence interval width', () => {
  const result = summarizeScores(Array.from({ length: 10 }, () => scoreRound([20])), true);
  close(result.mean, 50);
  close(result.delta, 0);
  assert.equal(result.sampleCount, 10);
});

test('empty and partial runs do not become complete scores', () => {
  const empty = summarizeScores([], true);
  assert.equal(empty.mean, null);
  assert.equal(empty.delta, null);
  assert.equal(empty.complete, false);
  const partial = summarizeScores([scoreRound([20])]);
  close(partial.mean, 50);
  assert.equal(partial.delta, null);
  assert.equal(partial.complete, false);
});

test('invalid durations and samples cannot produce scores', () => {
  for (const totals of [[], [0], [-1], [NaN], [Infinity], [10, 0]]) {
    assert.throws(() => scoreRound(totals));
  }
  assert.throws(() => summarizeScores([{ score: Infinity }]));
});

async function fixture(measure, stopAtAttempt) {
  const previousWx = global.wx;
  global.wx = {
    getDeviceInfo: () => ({ model: 'test', system: 'test', platform: 'test' }),
    getAppBaseInfo: () => ({ version: 'test', SDKVersion: 'test' })
  };
  const run = createRunControl();
  let attempt = 0;
  try {
    return await runSuite({ renderer: 'webview' }, run, {
      protocol: 'test-v1',
      steps: [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }],
      async prepare() {
        attempt++;
        if (attempt === stopAtAttempt) run.stop('test stop');
      },
      async measure(page, control, step) {
        const elapsedMs = measure(attempt, step.id);
        return { elapsedMs, operations: [[elapsedMs]] };
      }
    });
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }
}

test('runner excludes warmups and sums scene steps before scoring', async () => {
  const report = await fixture((attempt) => attempt <= 2 ? 1000 : 10);
  assert.equal(report.status, 'complete');
  assert.equal(report.warmupCompleted, 2);
  assert.equal(report.rounds.length, 10);
  close(report.rounds[0].scoring.suiteTotalsMs[0], 20);
  close(report.scoring.mean, 50);
  assert.equal(report.scoring.complete, true);
  assert.equal(report.summary[0].sampleCount, 10);
  assert.equal(JSON.parse(JSON.stringify(report)).scoring.sampleCount, 10);
});

test('runner retries invalid times without counting them in the score', async () => {
  for (const invalid of [0, -1, NaN, Infinity]) {
    const report = await fixture((attempt) => attempt === 3 ? invalid : 10);
    assert.equal(report.invalidRounds.length, 1);
    assert.equal(report.invalidRounds[0].attempt, 3);
    assert.equal(report.rounds.length, 10);
    close(report.scoring.mean, 50);
  }
});

test('stopped runs keep only prior valid scores as provisional', async () => {
  const report = await fixture(() => 10, 4);
  assert.equal(report.status, 'stopped');
  assert.equal(report.scoring.sampleCount, 1);
  assert.equal(report.scoring.complete, false);
  close(report.scoring.mean, 50);
});

test('exhausted or immediately stopped runs have no score', async () => {
  const incomplete = await fixture(() => 0);
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.invalidRounds.length, 15);
  assert.equal(incomplete.scoring.mean, null);
  assert.equal(incomplete.scoring.complete, false);
  const stopped = await fixture(() => 10, 1);
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.scoring.mean, null);
});