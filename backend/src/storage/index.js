import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/news.db');

// 初始化数据库
const db = new Database(DB_PATH);

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT DEFAULT '',
    source TEXT DEFAULT '',
    source_link TEXT DEFAULT '',
    source_date TEXT DEFAULT '',
    source_cover TEXT DEFAULT '',
    url TEXT DEFAULT '',
    score REAL DEFAULT 0.5,
    hot INTEGER DEFAULT 0,
    category TEXT DEFAULT '',
    date TEXT NOT NULL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
  CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
`);

export function saveArticles(articles, analysis = '') {
  const insert = db.prepare(`
    INSERT INTO articles (title, summary, source, source_link, source_date, source_cover, url, score, hot, category, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((articles) => {
    for (const article of articles) {
      insert.run(
        article.title,
        article.summary || '',
        article.source || '',
        article.source_link || '',
        article.source_date || '',
        article.source_cover || '',
        article.url || '',
        article.score || 0.5,
        article.hot || 0,
        article.category || '',
        article.date
      );
    }
  });

  insertMany(articles);

  return { success: true, count: articles.length };
}

export function getArticleById(id) {
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
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
    sql += ' AND (title LIKE ? OR summary LIKE ?)';
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
