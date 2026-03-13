import express from 'express';
import { getAllNews, getNewsByDate, searchArticles as dbSearchArticles, getAllArticles, updateArticle, deleteArticle, deleteArticles, getArticlesByDate, getArticleById, getAllSources, getEnabledSources, getSourceById, createSource, updateSource, deleteSource, toggleSource } from './storage/index.js';
import { runCrawl } from './scheduler/index.js';
import config from './config.js';

const router = express.Router();

const TAGS = ['科技', '车联网', 'IoT'];

const configPath = './config.json';
import fs from 'fs';

// 简单认证中间件
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权' });
  }

  const token = authHeader.substring(7);
  if (token !== config.adminPassword) {
    return res.status(401).json({ error: '密码错误' });
  }
  next();
};

router.get('/news', (req, res) => {
  const news = getAllNews();
  res.json(news);
});

router.get('/news/search', (req, res) => {
  const { keyword, days, tag } = req.query;
  const articles = dbSearchArticles(keyword || null, days || null, tag || null);
  // 转换字段名，适配前端
  const mappedArticles = articles.map(a => ({
    title: a.source_title,
    source: a.source_name,
    summary: a.source_summary,
    url: a.url || a.source_link,
    date: a.date,
    tags: a.category ? [a.category] : [],
    id: a.id
  }));
  res.json({
    articles: mappedArticles,
    total: mappedArticles.length,
    tags: TAGS
  });
});

router.get('/news/tags', (req, res) => {
  res.json({ tags: TAGS });
});

// 获取文章详情
router.get('/article/:id', (req, res) => {
  const article = getArticleById(parseInt(req.params.id));
  if (!article) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({
    id: article.id,
    title: article.source_title,
    source: article.source_name,
    summary: article.source_summary,
    url: article.url || article.source_link,
    sourceLink: article.source_link,
    date: article.date,
    category: article.category,
    contentHtml: article.content_html,
    createdAt: article.createdAt
  });
});

router.get('/news/:date', (req, res) => {
  const news = getNewsByDate(req.params.date);
  if (!news || news.articleCount === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(news);
});

// 资讯管理 API（需要认证）
router.put('/articles/:id', requireAuth, express.json(), (req, res) => {
  const result = updateArticle(parseInt(req.params.id), req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true });
});

router.delete('/articles/:id', requireAuth, (req, res) => {
  const result = deleteArticle(parseInt(req.params.id));
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true });
});

router.post('/articles/batch-delete', requireAuth, express.json(), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请选择要删除的资讯' });
  }
  const result = deleteArticles(ids.map(id => parseInt(id)));
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, count: result.count });
});

router.post('/crawl', async (req, res) => {
  await runCrawl();
  res.json({ success: true });
});

router.get('/config', (req, res) => {
  res.json({
    crawlSources: config.crawlSources,
    schedule: config.schedule,
    feishuEnabled: config.feishuEnabled !== false,
    feishuConfigured: !!config.feishuWebhook
  });
});

// 需要认证的 API
router.post('/config/save', requireAuth, express.json(), (req, res) => {
  try {
    const newConfig = { ...config };

    if ('feishuWebhook' in req.body) {
      newConfig.feishuWebhook = req.body.feishuWebhook || '';
    }
    if ('feishuEnabled' in req.body) {
      newConfig.feishuEnabled = req.body.feishuEnabled;
    }
    if (req.body.schedule) {
      newConfig.schedule = req.body.schedule;
    }
    if (req.body.crawlSources) {
      newConfig.crawlSources = req.body.crawlSources;
    }
    if (req.body.adminPassword) {
      newConfig.adminPassword = req.body.adminPassword;
    }

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
    Object.assign(config, newConfig);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 数据源管理 API ============

// 获取所有数据源
router.get('/sources', (req, res) => {
  const sources = getAllSources();
  res.json({ sources });
});

// 获取启用的数据源
router.get('/sources/enabled', (req, res) => {
  const sources = getEnabledSources();
  res.json({ sources });
});

// 获取单个数据源
router.get('/sources/:id', (req, res) => {
  const source = getSourceById(req.params.id);
  if (!source) {
    return res.status(404).json({ error: '数据源不存在' });
  }
  res.json(source);
});

// 创建数据源
router.post('/sources', requireAuth, express.json(), (req, res) => {
  const { id, name, enabled, domain, entry_urls, flow, transform, filters, prompt, sort_order } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'ID 和名称不能为空' });
  }

  // 检查是否已存在
  const existing = getSourceById(id);
  if (existing) {
    return res.status(400).json({ error: 'ID 已存在' });
  }

  const result = createSource({
    id, name, enabled, domain, entry_urls, flow, transform, filters, prompt, sort_order
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true, id });
});

// 更新数据源
router.put('/sources/:id', requireAuth, express.json(), (req, res) => {
  const result = updateSource(req.params.id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true });
});

// 删除数据源
router.delete('/sources/:id', requireAuth, (req, res) => {
  const result = deleteSource(req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true });
});

// 切换数据源启用状态
router.post('/sources/:id/toggle', requireAuth, (req, res) => {
  const result = toggleSource(req.params.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true });
});

// 导入数据源
router.post('/sources/import', requireAuth, express.json(), (req, res) => {
  const { sources } = req.body;
  if (!Array.isArray(sources) || sources.length === 0) {
    return res.status(400).json({ error: '请提供数据源列表' });
  }

  let successCount = 0;
  const errors = [];

  for (const source of sources) {
    if (!source.id || !source.name) {
      errors.push(`缺少 ID 或名称: ${JSON.stringify(source)}`);
      continue;
    }

    const existing = getSourceById(source.id);
    if (existing) {
      const result = updateSource(source.id, source);
      if (result.success) successCount++;
      else errors.push(`更新失败: ${source.id} - ${result.error}`);
    } else {
      const result = createSource(source);
      if (result.success) successCount++;
      else errors.push(`创建失败: ${source.id} - ${result.error}`);
    }
  }

  res.json({ success: true, count: successCount, errors });
});

// 导出数据源
router.get('/sources/export', (req, res) => {
  const sources = getAllSources();
  res.json({ sources });
});

export default router;
