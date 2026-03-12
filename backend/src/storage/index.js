import Database from 'better-sqlite3';
import path from 'path';

// 使用 process.cwd() 获取当前工作目录 (即 backend/ 目录)
const DB_PATH = path.join(process.cwd(), 'data', 'news.db');

// 初始化数据库
const db = new Database(DB_PATH);

// 创建表（如果不存在）
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    -- 原始数据字段（从抓取来源获取）
    source_title TEXT NOT NULL,      -- 原始来源标题
    source_summary TEXT DEFAULT '',  -- 原始来源摘要
    source_name TEXT DEFAULT '',     -- 来源名称（媒体/网站名称）

    -- 原始数据附加字段
    source_link TEXT DEFAULT '',     -- 原文链接
    source_date TEXT DEFAULT '',     -- 原文发布日期
    source_cover TEXT DEFAULT '',    -- 封面图片URL

    -- 处理后字段
    url TEXT DEFAULT '',             -- 跳转链接
    content_html TEXT DEFAULT '',    -- Readability 处理后的 HTML 内容
    score REAL DEFAULT 0.5,         -- 热度评分 (0-1)
    hot INTEGER DEFAULT 0,          -- 热度指数

    -- 分类字段
    category TEXT DEFAULT '',        -- 新闻分类

    -- 系统字段
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,             -- 数据日期 (YYYY-MM-DD)
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
  CREATE INDEX IF NOT EXISTS idx_articles_source_name ON articles(source_name);
  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
`);

export function saveArticles(articles, analysis = '') {
  // 过滤掉已存在的文章（根据日期和标题判断）
  const existingKeys = new Set(
    db.prepare('SELECT source_title, date FROM articles').all().map(r => `${r.source_title}|${r.date}`)
  );

  // 先对本批次新闻去重
  const seenInBatch = new Set();
  const deduplicated = articles.filter(article => {
    const title = article.source_title || article.title || '';
    const date = article.date || '';
    const key = `${title}|${date}`;
    if (seenInBatch.has(key)) {
      return false;
    }
    seenInBatch.add(key);
    return true;
  });

  // 再过滤掉数据库中已存在的新闻
  const newArticles = deduplicated.filter(article => {
    const title = article.source_title || article.title || '';
    const date = article.date || '';
    const key = `${title}|${date}`;
    return !existingKeys.has(key);
  });

  if (newArticles.length === 0) {
    console.log(`[存储] 今日所有新闻已存在，跳过存储`);
    return { success: true, count: 0, skipped: articles.length };
  }

  const insert = db.prepare(`
    INSERT INTO articles (source_title, source_summary, source_name, source_link, source_date, source_cover, url, content_html, score, hot, category, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((articles) => {
    for (const article of articles) {
      insert.run(
        article.source_title || article.title,      // 兼容旧字段
        article.source_summary || article.summary || '',
        article.source_name || article.source || '',
        article.source_link || '',
        article.source_date || '',
        article.source_cover || '',
        article.url || '',
        article.content_html || '',
        article.score || 0.5,
        article.hot || 0,
        article.category || '',
        article.date
      );
    }
  });

  insertMany(newArticles);

  const skipped = articles.length - newArticles.length;
  if (skipped > 0) {
    console.log(`[存储] 跳过 ${skipped} 条重复新闻，存储 ${newArticles.length} 条新新闻`);
  } else {
    console.log(`[存储] 存储 ${newArticles.length} 条新闻`);
  }

  return { success: true, count: newArticles.length, skipped };
}

export function getArticleById(id) {
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
}

export function updateArticle(id, data) {
  const fields = [];
  const values = [];

  if (data.source_title !== undefined) {
    fields.push('source_title = ?');
    values.push(data.source_title);
  }
  if (data.source_summary !== undefined) {
    fields.push('source_summary = ?');
    values.push(data.source_summary);
  }
  if (data.category !== undefined) {
    fields.push('category = ?');
    values.push(data.category);
  }
  if (data.url !== undefined) {
    fields.push('url = ?');
    values.push(data.url);
  }
  if (data.content_html !== undefined) {
    fields.push('content_html = ?');
    values.push(data.content_html);
  }

  if (fields.length === 0) {
    return { success: false, error: '没有要更新的字段' };
  }

  values.push(id);
  const sql = `UPDATE articles SET ${fields.join(', ')} WHERE id = ?`;

  try {
    db.prepare(sql).run(...values);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function deleteArticle(id) {
  try {
    db.prepare('DELETE FROM articles WHERE id = ?').run(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function deleteArticles(ids) {
  try {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM articles WHERE id IN (${placeholders})`).run(...ids);
    return { success: true, count: ids.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function getArticlesByDate(date) {
  return db.prepare('SELECT * FROM articles WHERE date = ?').all(date);
}

export function getAllArticles(limit = 1000) {
  return db.prepare('SELECT * FROM articles ORDER BY date DESC, id DESC LIMIT ?').all(limit);
}

export function searchArticles(keyword, days, tag, limit = 100) {
  let sql = 'SELECT * FROM articles WHERE 1=1';
  const params = [];

  if (days) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - parseInt(days));
    const targetDateStr = targetDate.toISOString().split('T')[0];
    sql += ' AND date >= ?';
    params.push(targetDateStr);
  }

  if (tag) {
    sql += ' AND category = ?';
    params.push(tag);
  }

  if (keyword) {
    sql += ' AND (source_title LIKE ? OR source_summary LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  sql += ' ORDER BY date DESC, id DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

export function getAllNews() {
  // 返回所有日期的文章统计
  const stats = db.prepare(`
    SELECT date, COUNT(*) as articleCount, MAX(createdAt) as createdAt
    FROM articles
    GROUP BY date
    ORDER BY date DESC
  `).all();

  return stats.map(s => ({
    date: s.date,
    articleCount: s.articleCount,
    createdAt: s.createdAt
  }));
}

export function getNewsByDate(date) {
  const articles = getArticlesByDate(date);
  return {
    date,
    articles,
    articleCount: articles.length
  };
}

// 导出 analysis 相关的占位函数（保持兼容）
export function saveNews(date, articles, analysis = '') {
  return saveArticles(articles, analysis);
}

export default db;
