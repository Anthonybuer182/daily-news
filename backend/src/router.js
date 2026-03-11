import express from 'express';
import { getAllNews, getNewsByDate, searchArticles as dbSearchArticles, getAllArticles } from './storage/index.js';
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
  res.json({
    articles,
    total: articles.length,
    tags: TAGS
  });
});

router.get('/news/tags', (req, res) => {
  res.json({ tags: TAGS });
});

router.get('/news/:date', (req, res) => {
  const news = getNewsByDate(req.params.date);
  if (!news || news.articleCount === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(news);
});

router.post('/crawl', async (req, res) => {
  await runCrawl();
  res.json({ success: true });
});

router.get('/config', (req, res) => {
  res.json({
    crawlSources: config.crawlSources,
    schedule: config.schedule,
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

export default router;
