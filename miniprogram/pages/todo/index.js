const { todoPatch } = require('../../utils/todo');
const { createRunControl, runBenchmark } = require('../../utils/benchmark');
const { reportProgress } = require('../../utils/benchmark-page');

Page({
  data: {
    ready: false,
    running: false,
    progress: '',
    draft: '',
    items: [],
    remaining: 0,
    hasReport: false,
    reportDetails: '',
    scoring: null,
    summary: []
  },

  onLoad() {
    this.nextTodoId = 0;
  },

  onReady() {
    this.setData({ ready: true });
  },

  onHide() {
    if (this.run) this.run.stop('页面切入后台');
  },

  onUnload() {
    this.unloaded = true;
    if (this.run) this.run.stop('页面已卸载');
  },

  onInput(event) {
    if (!this.run) this.setData({ draft: event.detail.value });
  },

  onAdd(event) {
    this.updateTodo('add', event.type === 'confirm' ? event.detail.value : this.data.draft);
  },

  onToggle(event) {
    this.updateTodo('toggle', Number(event.currentTarget.dataset.id));
  },

  onRemove(event) {
    this.updateTodo('remove', Number(event.currentTarget.dataset.id));
  },

  updateTodo(action, value) {
    if (this.run) return;
    const patch = todoPatch(this, action, value);
    if (patch) this.setData(patch);
  },

  async onRun() {
    if (this.run || !this.data.ready) return;
    const { items, remaining, draft } = this.data;
    const manualState = { items: items.map((item) => ({ ...item })), remaining, draft };
    const manualNextId = this.nextTodoId;
    const run = createRunControl();
    this.run = run;
    this.report = null;

    let progress;
    try {
      this.setData({ running: true, progress: '准备测试', hasReport: false, summary: [], scoring: null, reportDetails: '' });
      this.report = await runBenchmark(this, run);
      progress = reportProgress(this.report);
    } catch (error) {
      progress = `测试失败 · ${error.message}`;
    } finally {
      this.run = null;
      this.nextTodoId = manualNextId;
      if (!this.unloaded) {
        const report = this.report;
        this.setData({
          ...manualState,
          running: false,
          progress,
          hasReport: Boolean(report),
          summary: report ? report.summary : [],
          scoring: report ? report.scoring : null,
          reportDetails: report ? `${report.environment.renderer} · ${report.clock}` : ''
        });
      }
    }
  },

  onStop() {
    if (this.run) this.run.stop('手动停止');
  },

  onCopyReport() {
    if (!this.report) return;
    wx.setClipboardData({
      data: JSON.stringify(this.report),
      fail: () => wx.showToast({ title: '复制结果失败', icon: 'none' })
    });
  }
});
