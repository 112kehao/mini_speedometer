const { benchmarkPage } = require('../../utils/benchmark-page');
const { createRunControl, measureSeries, updatePage, waitForCallback } = require('../../utils/runner');
const { rendererPage } = require('../../utils/renderer-page');

const CODE_LINES = 240;
const RICH_PARAGRAPHS = 160;
const CODE = Array.from({ length: CODE_LINES }, (_, i) => {
  const number = i + 1;
  return `const record${String(number).padStart(3, '0')} = { status: "ready", visits: ${number} };`;
}).join('\n') + '\n';
const RICH_TEXT = Array.from({ length: RICH_PARAGRAPHS }, (_, i) =>
  `第 ${i + 1} 段。城市观察记录了交通、社区活动与公共服务的变化。每一段都是固定样稿，用于测量原生编辑器载入长文和应用格式的耗时。`
).join('\n') + '\n';

const STEPS = [
  { id: 'CodeEditor/Long', label: '代码 · 载入 240 行', document: 'code' },
  { id: 'CodeEditor/Highlight', label: '代码 · 应用语法着色', document: 'code', format: 'color' },
  { id: 'RichEditor/Long', label: '富文本 · 载入 160 段', document: 'rich' },
  { id: 'RichEditor/Highlight', label: '富文本 · 加粗全文', document: 'rich', format: 'bold' }
];

function documentDelta(step) {
  const source = step.document === 'code' ? CODE : RICH_TEXT;
  if (step.format === 'bold') {
    return { ops: [{ insert: source, attributes: { bold: true } }] };
  }
  if (step.format !== 'color') return { ops: [{ insert: source }] };

  const ops = [];
  const tokens = /\bconst\b|"ready"|\b\d+\b/g;
  let end = 0;
  for (let match = tokens.exec(source); match; match = tokens.exec(source)) {
    if (end < match.index) ops.push({ insert: source.slice(end, match.index) });
    const token = match[0];
    const color = token === 'const' ? '#7042b8' : token[0] === '"' ? '#097852' : '#a34619';
    ops.push({ insert: token, attributes: { color } });
    end = match.index + token.length;
  }
  if (end < source.length) ops.push({ insert: source.slice(end) });
  return { ops };
}

function setDocument(page, delta, finish, fail) {
  page.editor.setContents({ delta, success: finish, fail: (error) => fail(error.errMsg) });
}

function readDocument(page, run) {
  return waitForCallback(run, '读取编辑器内容', (finish, fail) => {
    page.editor.getContents({ success: finish, fail: (error) => fail(error.errMsg) });
  });
}

const suite = {
  protocol: 'native-editor-v1',
  metadata: () => ({ completion: 'EditorContext.setContents.success', codeLines: CODE_LINES, richParagraphs: RICH_PARAGRAPHS }),
  steps: STEPS,
  async capture(page, run) {
    const result = await readDocument(page, run);
    if (!result.delta || !Array.isArray(result.delta.ops)) throw new Error('无法保存当前编辑内容');
    return result.delta;
  },
  restore(page, run, delta) {
    return waitForCallback(run, '恢复编辑器内容', (finish, fail) => setDocument(page, delta, finish, fail));
  },
  async prepare(page, run, progress) {
    await updatePage(page, run, { progress });
    await this.restore(page, run, { ops: [{ insert: '\n' }] });
  },
  async measure(page, run, step, now) {
    const result = await measureSeries(run, now, 1, (_, finish, fail) => {
      setDocument(page, documentDelta(step), finish, fail);
    });
    const content = await readDocument(page, run);
    const expected = step.document === 'code' ? CODE : RICH_TEXT;
    const ops = content.delta && content.delta.ops;
    if (typeof content.text !== 'string' || content.text.trimEnd() !== expected.trimEnd() ||
        !Array.isArray(ops) ||
        (step.format && !ops.some((op) => op.attributes && op.attributes[step.format]))) {
      throw new Error('编辑器文本或格式校验失败');
    }
    return result;
  }
};

Page(rendererPage({
  ...benchmarkPage(suite, { loadingExample: false }),

  onEditorReady() {
    wx.createSelectorQuery().select('#native-editor').context((result) => {
      if (this.unloaded) return;
      if (result && result.context) {
        this.editor = result.context;
        this.setData({ ready: true });
      } else {
        this.setData({ progress: '无法初始化原生编辑器' });
      }
    }).exec();
  },

  async onExample(event) {
    if (!this.data.ready || this.run || this.data.loadingExample) return;
    const step = STEPS[Number(event.currentTarget.dataset.step)];
    if (!step) return;
    this.setData({ ready: false, loadingExample: true });
    try {
      await waitForCallback(createRunControl(), '载入样稿', (finish, fail) => {
        setDocument(this, documentDelta(step), finish, fail);
      });
    } catch (error) {
      if (!this.unloaded) wx.showToast({ title: '载入样稿失败', icon: 'none' });
    } finally {
      if (!this.unloaded) this.setData({ ready: true, loadingExample: false });
    }
  }
}, 'editor', 'webview'));
