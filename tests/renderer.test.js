const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { sceneUrl, rendererInfo, rendererPage } = require('../miniprogram/utils/renderer-page');

test('scene URLs preserve the chosen renderer except the WebView-only editor', () => {
  for (const scene of ['todo', 'news', 'charts']) {
    assert.equal(sceneUrl(scene, 'webview'), `/pages/${scene}/index`);
    assert.equal(sceneUrl(scene, 'skyline'), `/pages/${scene}/skyline`);
  }
  assert.equal(sceneUrl('editor', 'skyline'), '/pages/editor/index');
  assert.throws(() => sceneUrl('unknown', 'skyline'));
  assert.throws(() => sceneUrl('todo', 'unknown'));
});

test('actual renderer and fallback are not inferred from requested configuration', () => {
  assert.deepEqual(rendererInfo({ route: 'pages/todo/skyline', renderer: 'webview' }), {
    configuredRenderer: 'skyline', renderer: 'webview', rendererFallback: true
  });
  assert.equal(rendererInfo({ configuredRenderer: 'skyline' }).renderer, 'unknown');
  assert.equal(rendererInfo({ configuredRenderer: 'skyline' }).rendererFallback, false);
  assert.equal(rendererInfo({ configuredRenderer: 'skyline', renderer: 'skyline' }).rendererFallback, false);
});

test('page wrapper preserves initialization and only switches while idle', () => {
  const previousWx = global.wx;
  const navigations = [];
  global.wx = {
    getWindowInfo: () => ({ statusBarHeight: 24 }),
    redirectTo: (options) => navigations.push(options.url)
  };
  try {
    const definition = rendererPage({ data: { running: false }, onLoad() { this.initialized = true; } }, 'todo', 'skyline');
    const page = { ...definition, renderer: 'webview', setData(patch) { Object.assign(this.data, patch); } };
    page.onLoad();
    assert.equal(page.initialized, true);
    assert.equal(page.data.actualRenderer, 'webview');
    assert.equal(page.data.rendererFallback, true);
    assert.equal(page.data.statusBarHeight, 24);
    assert.ok(page.data.sceneLinks.some((item) => item.url === '/pages/news/skyline'));
    page.onRendererChange({ detail: { value: 'webview' } });
    assert.deepEqual(navigations, ['/pages/todo/index']);
    page.run = {};
    page.onRendererChange({ detail: { value: 'webview' } });
    page.onSceneHome();
    assert.equal(navigations.length, 1);
    page.run = null;
    page.data.running = true;
    page.onRendererChange({ detail: { value: 'webview' } });
    assert.equal(navigations.length, 1);
  } finally {
    if (previousWx === undefined) delete global.wx;
    else global.wx = previousWx;
  }
});

test('editor cannot register a Skyline page or navigate to one', () => {
  assert.throws(() => rendererPage({}, 'editor', 'skyline'));
  const definition = rendererPage({ data: {} }, 'editor', 'webview');
  assert.equal(definition.data.supportsSkyline, false);
  definition.onRendererChange.call({ data: {} }, { detail: { value: 'skyline' } });
});

test('both renderer entries register one isolated page from the same factory', () => {
  const previousPage = global.Page;
  const registered = [];
  global.Page = (definition) => registered.push(definition);
  try {
    for (const scene of ['todo', 'news', 'charts']) {
      const createPage = require(`../miniprogram/pages/${scene}/page`);
      assert.equal(typeof createPage, 'function');
      const before = registered.length;
      for (const entry of ['index', 'skyline']) {
        const path = require.resolve(`../miniprogram/pages/${scene}/${entry}`);
        delete require.cache[path];
        require(path);
      }
      assert.equal(registered.length, before + 2);
      const [webview, skyline] = registered.slice(before);
      assert.equal(webview.configuredRenderer, 'webview');
      assert.equal(skyline.configuredRenderer, 'skyline');
      assert.notEqual(webview.data, skyline.data);
      assert.equal(webview.onRun.toString(), skyline.onRun.toString());
    }
  } finally {
    if (previousPage === undefined) delete global.Page;
    else global.Page = previousPage;
  }
});

test('all configured routes have complete resources and correct renderer settings', () => {
  const root = resolve(__dirname, '../miniprogram');
  const config = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
  assert.equal(config.renderer, 'webview');
  assert.equal(config.lazyCodeLoading, 'requiredComponents');
  assert.equal(config.rendererOptions.skyline.disableABTest, true);
  for (const route of config.pages) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(existsSync(resolve(root, `${route}.${extension}`)), `${route}.${extension}`);
    }
    const page = JSON.parse(readFileSync(resolve(root, `${route}.json`), 'utf8'));
    if (route.endsWith('/skyline')) {
      assert.equal(page.renderer, 'skyline');
      assert.equal(page.componentFramework, 'glass-easel');
      assert.equal(page.navigationStyle, 'custom');
      const markup = readFileSync(resolve(root, `${route}.wxml`), 'utf8');
      assert.ok(markup.includes('<include src="./index.wxml" />'));
    } else {
      assert.equal(page.renderer, 'webview');
    }
  }
  assert.ok(!config.pages.includes('pages/editor/skyline'));
});

test('editor entry stays WebView and reports requested and actual engines', () => {
  const { reportEnvironment } = require('../miniprogram/utils/benchmark-page');
  const previousPage = global.Page;
  let page;
  global.Page = (definition) => { page = definition; };
  try {
    const path = require.resolve('../miniprogram/pages/editor/index');
    delete require.cache[path];
    require(path);
    assert.equal(page.configuredRenderer, 'webview');
    assert.equal(page.data.supportsSkyline, false);
    const description = reportEnvironment({ environment: { configuredRenderer: 'skyline', renderer: 'webview' }, clock: 'Date.now' });
    assert.ok(description.includes('skyline'));
    assert.ok(description.includes('webview'));
  } finally {
    if (previousPage === undefined) delete global.Page;
    else global.Page = previousPage;
  }
});