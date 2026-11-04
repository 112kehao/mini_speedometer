const PALETTE = ['#2457c5', '#138477', '#d77738', '#9459b5', '#496eb6', '#d24c73', '#75a83c'];

let seed = 9137;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

const BARS = Array.from({ length: 24 }, () => Array.from({ length: 20 }, () => 0.3 + random()));
const POINTS = Array.from({ length: 1200 }, () => [random(), 0.1 + 0.55 * random()]);
const STOCK = Array.from({ length: 240 }, (_, i) => {
  const open = 0.46 + Math.sin(i / 22) * 0.18 + (random() - 0.5) * 0.1;
  const close = open + (random() - 0.5) * 0.15;
  return { open, close, low: Math.min(open, close) - 0.04, high: Math.max(open, close) + 0.04 };
});
const SERIES = Array.from({ length: 240 }, (_, i) => 0.5 + Math.sin(i / 19) * 0.24 + (random() - 0.5) * 0.14);

function plotBounds(width, height) {
  const left = 34;
  const top = 20;
  const right = width - 14;
  const bottom = height - 28;
  return {
    left, top, right, bottom,
    x: (fraction) => left + fraction * (right - left),
    y: (fraction) => bottom - fraction * (bottom - top)
  };
}

function drawAxes(ctx, bounds) {
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';
  ctx.strokeStyle = '#dde5f2';
  ctx.fillStyle = '#5a6a81';
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const y = bounds.y(i / 4);
    ctx.moveTo(bounds.left, y);
    ctx.lineTo(bounds.right, y);
    ctx.fillText(String(i * 25), 8, y + 3);
  }
  ctx.stroke();
}

function drawBars(ctx, bounds, groups) {
  const column = (bounds.right - bounds.left) / BARS.length;
  BARS.forEach((bar, i) => {
    let bottom = 0;
    for (let j = 0; j < groups; j++) {
      const height = bar[j] / (groups * 1.3);
      ctx.fillStyle = PALETTE[j % PALETTE.length];
      ctx.fillRect(bounds.left + column * i + 1, bounds.y(bottom + height),
        Math.max(1, column - 2), bounds.y(bottom) - bounds.y(bottom + height));
      bottom += height;
    }
  });
}

function drawPoints(ctx, bounds, mode, tooltip) {
  ctx.fillStyle = mode === 'scatter' ? 'rgba(36, 87, 197, 0.24)' : '#2457c5';
  const radius = mode === 'dots' ? 1.4 : 2.7;
  POINTS.forEach(([x, y], i) => {
    const px = mode === 'dots' ? ((i % 24) + 0.5) / 24 : x;
    ctx.beginPath();
    ctx.arc(bounds.x(px), bounds.y(y + x * 0.27), radius, 0, Math.PI * 2);
    ctx.fill();
  });
  if (tooltip) {
    const [x, y] = POINTS[42];
    const left = Math.min(bounds.x(x), bounds.right - 84);
    const top = bounds.y(y + x * 0.27) - 28;
    ctx.fillStyle = '#172338';
    ctx.fillRect(left, top, 84, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('POINT 043', left + 10, top + 15);
  }
}

function drawStock(ctx, bounds, plot) {
  const visible = STOCK.slice(plot.offset, plot.offset + plot.visible);
  const width = (bounds.right - bounds.left) / visible.length;
  visible.forEach(({ open, close, low, high }, i) => {
    const x = bounds.left + width * (i + 0.5);
    ctx.fillStyle = ctx.strokeStyle = close >= open ? '#138477' : '#c44f63';
    ctx.beginPath();
    ctx.moveTo(x, bounds.y(low));
    ctx.lineTo(x, bounds.y(high));
    ctx.stroke();
    ctx.fillRect(x - width / 3, bounds.y(Math.max(open, close)),
      Math.max(1, width * 2 / 3), Math.max(1, Math.abs(bounds.y(open) - bounds.y(close))));
  });
}

function drawSeries(ctx, bounds, plot) {
  const x = (index) => bounds.x(index / (SERIES.length - 1));
  if (plot.rangeEnd > 35) {
    ctx.fillStyle = 'rgba(36, 87, 197, 0.14)';
    ctx.fillRect(x(35), bounds.top, x(plot.rangeEnd) - x(35), bounds.bottom - bounds.top);
  }
  ctx.strokeStyle = '#2457c5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x(0), bounds.y(SERIES[0]));
  for (let i = 1; i < SERIES.length; i++) ctx.lineTo(x(i), bounds.y(SERIES[i]));
  ctx.stroke();
  if (plot.point >= 0) {
    ctx.fillStyle = '#c44f63';
    ctx.beginPath();
    ctx.arc(x(plot.point), bounds.y(SERIES[plot.point]), 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintChart(surface, plot) {
  const { ctx, width, height } = surface;
  ctx.fillStyle = '#f8faff';
  ctx.fillRect(0, 0, width, height);
  const bounds = plotBounds(width, height);
  drawAxes(ctx, bounds);
  switch (plot.mode) {
    case 'bars':
      drawBars(ctx, bounds, plot.groups);
      break;
    case 'dots':
    case 'scatter':
    case 'opaque':
      drawPoints(ctx, bounds, plot.mode, plot.tooltip);
      break;
    case 'stock':
      drawStock(ctx, bounds, plot);
      break;
    case 'dashboard':
      drawSeries(ctx, bounds, plot);
      break;
  }
}

module.exports = { paintChart };
