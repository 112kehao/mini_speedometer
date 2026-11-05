const createPage = require('./page');
const { rendererPage } = require('../../utils/renderer-page');

Page(rendererPage(createPage(), 'news', 'skyline'));