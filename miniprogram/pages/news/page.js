const { benchmarkPage } = require('../../utils/benchmark-page');
const { measureSeries, updatePage, waitForCallback } = require('../../utils/runner');

const TOGGLE_PAIRS = 25;
const STORY_COUNT = 16;
const SECTIONS = [
  { id: 'home', label: '首页', topics: ['编辑精选', '今日观察', '城市现场', '周末阅读'] },
  { id: 'us', label: '美国', topics: ['美国城市试点社区巴士', '国家公园公布春季开放计划', '社区图书馆延长周末开放时间', '公共市场测试本地配送'] },
  { id: 'world', label: '世界', topics: ['跨境铁路开通新线路', '沿海城市联合研究海水变化', '国际手工艺展开放参观', '区域能源合作计划进入试点'] },
  { id: 'politics', label: '政治', topics: ['议会举行公开预算听证', '地方政府公布公共采购草案', '委员会讨论交通投资方案', '城市发布社区协商日程'] }
];
const ARTICLES = {};
for (const section of SECTIONS) {
  ARTICLES[section.id] = Array.from({ length: STORY_COUNT }, (_, index) => ({
    id: `${section.id}-${index + 1}`,
    title: `${section.topics[index % section.topics.length]} · ${String(index + 1).padStart(2, '0')}`,
    category: section.label,
    edition: `第 ${index + 1} 条`,
    summary: '本地固定样稿，用于比较新闻栏目切换时的模板更新与列表布局。',
    body: '这是一篇离线测试文章。页面以固定结构展示标题、导语、栏目和正文。在自动测试中，新闻列表随栏目变化重新生成，便于在相同输入下比较不同设备上的更新耗时。'
  }));
}

function sectionPatch(id) {
  const section = SECTIONS.find((item) => item.id === id);
  return {
    channel: id,
    sectionTitle: section.label,
    articles: ARTICLES[id],
    menuOpen: false,
    selectedArticle: null
  };
}

const suite = {
  protocol: 'native-news-v1',
  metadata: () => ({ completion: 'setDataCallback', togglePairsPerStep: TOGGLE_PAIRS, storiesPerSection: STORY_COUNT }),
  steps: [
    { id: 'NavigateToUS', label: '切换到美国', channel: 'us' },
    { id: 'NavigateToWorld', label: '切换到世界', channel: 'world' },
    { id: 'NavigateToPolitics', label: '切换到政治', channel: 'politics' }
  ],
  prepare(page, run, progress) {
    return updatePage(page, run, { ...sectionPatch('home'), progress });
  },
  async measure(page, run, step, now) {
    const menuUpdates = TOGGLE_PAIRS * 2;
    const result = await measureSeries(run, now, menuUpdates + 1, (i, finish) => {
      const patch = i === menuUpdates ? sectionPatch(step.channel) : { menuOpen: !page.data.menuOpen };
      page.setData(patch, finish);
    });
    const [feed, stories, menu] = await waitForCallback(run, '校验新闻视图', (finish) => {
      const query = wx.createSelectorQuery();
      query.select('.news-feed').fields({ dataset: true });
      query.selectAll('.story').fields({ dataset: true });
      query.select('#news-menu').fields({ id: true });
      query.exec(finish);
    });
    if (!feed || feed.dataset.channel !== step.channel || menu ||
        !Array.isArray(stories) || stories.length !== STORY_COUNT ||
        stories.some((story, i) => story.dataset.story !== ARTICLES[step.channel][i].id)) {
      throw new Error('新闻栏目或文章列表校验失败');
    }
    return result;
  }
};

module.exports = () => ({
  ...benchmarkPage(suite, { ...sectionPatch('home'), sections: SECTIONS.map(({ id, label }) => ({ id, label })) }),

  onReady() {
    this.setData({ ready: true });
  },

  onToggleMenu() {
    if (!this.run) this.setData({ menuOpen: !this.data.menuOpen });
  },

  onSection(event) {
    if (!this.run) this.setData(sectionPatch(event.currentTarget.dataset.channel));
  },

  onStory(event) {
    if (this.run) return;
    const selectedArticle = this.data.articles.find((item) => item.id === event.currentTarget.dataset.story);
    if (selectedArticle) this.setData({ selectedArticle, menuOpen: false });
  },

  onCloseStory() {
    if (!this.run) this.setData({ selectedArticle: null });
  }
});
