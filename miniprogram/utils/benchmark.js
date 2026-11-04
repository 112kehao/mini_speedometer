const { todoPatch } = require('./todo');
const { createRunControl, waitForCallback, updatePage, runSuite } = require('./runner');

const ITEM_COUNT = 100;
const TITLES = Array.from({ length: ITEM_COUNT }, (_, i) =>
  `Benchmark todo ${String(i + 1).padStart(3, '0')}`
);
const STEPS = [
  { id: 'Adding100Items', label: '新增 100 项', action: 'add', size: ITEM_COUNT, remaining: ITEM_COUNT },
  { id: 'CompletingAllItems', label: '完成全部', action: 'toggle', size: ITEM_COUNT, remaining: 0 },
  { id: 'DeletingAllItems', label: '删除全部', action: 'remove', size: 0, remaining: 0 }
];

function utf8Size(text) {
  let bytes = 0;
  for (const char of text) {
    const point = char.codePointAt(0);
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

async function verifyStep(page, run, step) {
  const { items, remaining } = page.data;
  const done = step.action === 'toggle';
  if (items.length !== step.size || remaining !== step.remaining ||
      items.some((item, i) => item.id !== i + 1 || item.title !== TITLES[i] || item.done !== done)) {
    throw new Error('逻辑层待办状态与预期不符');
  }

  const [rows, count, empty] = await waitForCallback(run, '读取待办视图', (finish) => {
    const query = wx.createSelectorQuery();
    query.selectAll('.todo-row').fields({ dataset: true });
    query.select('.todo-count').fields({ dataset: true });
    query.select('.todo-empty').fields({ id: true });
    query.exec(finish);
  });
  if (!Array.isArray(rows) || rows.length !== step.size ||
      !count || Number(count.dataset.remaining) !== step.remaining ||
      Boolean(empty) !== (step.size === 0) ||
      rows.some((row, i) => Number(row.dataset.id) !== i + 1 ||
        row.dataset.state !== (done ? 'done' : 'open'))) {
    throw new Error('视图层待办状态与预期不符');
  }
}

async function measureStep(page, run, step, now) {
  const operations = [];
  const patches = [];
  let phaseStart;
  let phaseEnd;

  for (let i = 0; i < ITEM_COUNT; i++) {
    let value = i + 1;
    if (step.action === 'add') value = TITLES[i];
    if (step.action === 'remove') value = ITEM_COUNT - i;

    let started;
    let submitted;
    let returned;
    let patch;
    const acknowledged = await waitForCallback(run, '等待 setData 回调', (finish) => {
      started = now();
      patch = todoPatch(page, step.action, value);
      if (!patch) throw new Error(`第 ${i + 1} 次操作无法更新待办`);
      submitted = now();
      page.setData(patch, () => finish(now()));
      returned = now();
    });

    if ((i > 0 && started < phaseEnd) ||
        !(started <= submitted && submitted <= returned && returned <= acknowledged)) {
      throw new Error('计时时钟或回调顺序异常');
    }
    if (i === 0) phaseStart = started;
    phaseEnd = acknowledged;
    operations.push([submitted - started, returned - submitted, acknowledged - returned, acknowledged - started]);
    patches.push(patch);
  }

  await verifyStep(page, run, step);
  return {
    id: step.id,
    elapsedMs: phaseEnd - phaseStart,
    setDataCalls: operations.length,
    estimatedPayloadBytes: patches.reduce((total, patch) => total + utf8Size(JSON.stringify(patch)), 0),
    operations: operations.map((row) => row.map((ms) => Number(ms.toFixed(3))))
  };
}

function runBenchmark(page, run) {
  return runSuite(page, run, {
    protocol: 'native-todo-v1',
    metadata: () => ({ itemCount: ITEM_COUNT }),
    operationColumns: ['logicMs', 'setDataCallMs', 'callbackWaitMs', 'responseMs'],
    steps: STEPS,
    measure: measureStep,
    prepare(target, control, progress) {
      target.nextTodoId = 0;
      return updatePage(target, control, { draft: '', items: [], remaining: 0, progress });
    }
  });
}

module.exports = { createRunControl, runBenchmark };
