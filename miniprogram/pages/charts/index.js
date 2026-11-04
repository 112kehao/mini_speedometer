const { benchmarkPage } = require('../../utils/benchmark-page');
const { measureSeries, updatePage, waitForCallback, createRunControl } = require('../../utils/runner');
const { paintChart } = require('../../utils/chart-drawing');

const GROUPS = [
  { id: 'plot', label: '柱状与点图' },
  { id: 'scatter', label: '散点图' },
  { id: 'stock', label: '股票图' },
  { id: 'dashboard', label: '指标图' }
];

const STEPS = [
  { id: 'Plot/StackedBy6', label: '堆叠柱状图 · 6 组', actionLabel: '堆叠 6 组', group: 'plot', action: 'bars6', count: 1 },
  { id: 'Plot/StackedBy20', label: '堆叠柱状图 · 20 组', actionLabel: '堆叠 20 组', group: 'plot', action: 'bars20', count: 1 },
  { id: 'Plot/Dotted', label: '绘制点图', actionLabel: '点图', group: 'plot', action: 'dots', count: 1 },
  { id: 'Scatter/Draw', label: '绘制散点图', actionLabel: '散点图', group: 'scatter', action: 'scatter', count: 1 },
  { id: 'Scatter/ShowTooltip', label: '显示散点提示', actionLabel: '提示', group: 'scatter', action: 'tooltip', count: 1 },
  { id: 'Scatter/DrawOpaque', label: '绘制不透明散点图', actionLabel: '不透明散点', group: 'scatter', action: 'opaque', count: 1 },
  { id: 'Stock/Render', label: '绘制股票图', actionLabel: '绘制', group: 'stock', action: 'stock', count: 1 },
  { id: 'Stock/Pan', label: '平移股票图', actionLabel: '平移', group: 'stock', action: 'pan', count: 50 },
  { id: 'Stock/Zoom', label: '缩放股票图', actionLabel: '缩放', group: 'stock', action: 'zoom', count: 15 },
  { id: 'Dashboard/Render', label: '绘制指标图', actionLabel: '绘制', group: 'dashboard', action: 'dashboard', count: 1 },
  { id: 'Dashboard/SelectingPoints', label: '移动指标图选点', actionLabel: '选点', group: 'dashboard', action: 'point', count: 20 },
  { id: 'Dashboard/SelectingRange', label: '拖动指标图区间', actionLabel: '选区', group: 'dashboard', action: 'range', count: 21 }
];

function selectGroup(group) {
  return { activeGroup: group, actions: STEPS.filter((step) => step.group === group) };
}

function changePlot(page, action, index = 0) {
  const plot = page.plot;
  switch (action) {
    case 'bars6':
    case 'bars20':
      Object.assign(plot, { mode: 'bars', groups: action === 'bars6' ? 6 : 20 });
      break;
    case 'dots':
    case 'scatter':
    case 'opaque':
      Object.assign(plot, { mode: action, tooltip: false });
      break;
    case 'tooltip':
      Object.assign(plot, { mode: 'scatter', tooltip: true });
      break;
    case 'stock':
      Object.assign(plot, { mode: 'stock', offset: 70, visible: 100 });
      break;
    case 'pan': {
      const direction = Math.floor(index / 10) % 2 === 0 ? 1 : -1;
      plot.offset = Math.max(0, Math.min(240 - plot.visible, plot.offset + direction));
      break;
    }
    case 'zoom':
      plot.visible = Math.max(25, plot.visible - 4);
      break;
    case 'dashboard':
      Object.assign(plot, { mode: 'dashboard', point: -1, rangeEnd: 35 });
      break;
    case 'point':
      plot.point = (plot.point + 1) % 240;
      break;
    case 'range':
      plot.rangeEnd = Math.min(239, plot.rangeEnd + 3);
      break;
  }
  paintChart(page.surface, plot);
}

const suite = {
  protocol: 'native-canvas-v1',
  metadata(page) {
    const { width, height, pixelRatio } = page.surface;
    return { completion: 'Canvas.requestAnimationFrame', canvas: { width, height, pixelRatio } };
  },
  steps: STEPS,
  async prepare(page, run, progress) {
    await updatePage(page, run, { ...selectGroup('plot'), progress });
    const { ctx, width, height, canvas } = page.surface;
    page.plot = {};
    ctx.clearRect(0, 0, width, height);
    await waitForCallback(run, '等待 Canvas 初始帧', (finish) => canvas.requestAnimationFrame(finish));
  },
  async measure(page, run, step, now) {
    if (page.data.activeGroup !== step.group) await updatePage(page, run, selectGroup(step.group));
    return measureSeries(run, now, step.count, (index, finish) => {
      changePlot(page, step.action, index);
      page.surface.canvas.requestAnimationFrame(finish);
    });
  }
};

Page({
  ...benchmarkPage(suite, { groups: GROUPS, ...selectGroup('plot') }),

  async onReady() {
    try {
      const result = await waitForCallback(createRunControl(), '获取 Canvas 节点', (finish) => {
        wx.createSelectorQuery().select('#native-canvas').fields({ node: true, size: true }, finish).exec();
      });
      if (this.unloaded) return;
      if (!result || !result.node || !result.width || !result.height ||
          typeof result.node.requestAnimationFrame !== 'function') {
        throw new Error('当前环境不支持所需的 Canvas 2D 接口');
      }
      const { node: canvas, width, height } = result;
      const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const pixelRatio = windowInfo.pixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const ctx = canvas.getContext('2d');
      ctx.scale(canvas.width / width, canvas.height / height);
      this.surface = { canvas, ctx, width, height, pixelRatio };
      this.plot = {};
      changePlot(this, 'bars6');
      this.setData({ ready: true });
    } catch (error) {
      if (!this.unloaded) this.setData({ progress: error.message });
    }
  },

  onGroup(event) {
    if (!this.data.ready || this.run) return;
    const group = event.currentTarget.dataset.group;
    const patch = selectGroup(group);
    changePlot(this, patch.actions[0].action);
    this.setData(patch);
  },

  onAction(event) {
    if (!this.data.ready || this.run) return;
    const action = event.currentTarget.dataset.action;
    if (this.data.actions.some((step) => step.action === action)) changePlot(this, action);
  }
});
