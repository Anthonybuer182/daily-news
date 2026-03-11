# 每日晨报实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现每日晨报产品，支持定时抓取科技/车联网/IoT资讯，推送到飞书群聊并通过Web页面展示

**Architecture:** 前后端分离架构，后端使用 Node.js + Express + Stagehand 抓取，前端使用 React + Vite 展示，JSON文件存储

**Tech Stack:** Node.js, Express, Stagehand, React, Vite, node-cron

---

## Task 1: 初始化项目结构

**Files:**
- Create: `backend/package.json`
- Create: `backend/src/index.js`
- Create: `backend/src/config.js`
- Create: `backend/src/router.js`
- Create: `backend/src/crawler/index.js`
- Create: `backend/src/scheduler/index.js`
- Create: `backend/src/feishu/index.js`
- Create: `backend/src/storage/index.js`
- Create: `backend/data/news/.gitkeep`
- Create: `backend/config.json`
- Create: `backend/.env.example`

**Step 1: 创建 backend 目录结构和 package.json**

```bash
mkdir -p backend/src/crawler backend/src/scheduler backend/src/feishu backend/src/storage backend/data/news
```

```json
{
  "name": "daily-news-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.0",
    "node-cron": "^3.0.3",
    "@anthropic-ai/sdk": "^0.24.0",
    "@anthropic-ai/claude-code": "^1.0.0"
  }
}
```

**Step 2: 创建配置文件**

`backend/config.json`:
```json
{
  "feishuWebhook": "",
  "crawlSources": [
    {
      "name": "36Kr",
      "url": "https://www.36kr.com/information/tech/",
      "prompt": "提取科技新闻，返回标题和摘要，每条不超过30字"
    }
  ],
  "schedule": "0 0 8 * * *",
  "port": 3000
}
```

`backend/.env.example`:
```
ANTHROPIC_API_KEY=your_api_key_here
```

**Step 3: 创建入口文件和基础模块**

`backend/src/config.js`:
```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

export default config;
```

`backend/src/index.js`:
```javascript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import config from './config.js';
import router from './router.js';
import { startScheduler } from './scheduler/index.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', router);

const PORT = config.port || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});
```

**Step 4: Commit**

```bash
git add backend/
git commit -m "feat: 初始化后端项目结构"
```

---

## Task 2: 实现存储模块

**Files:**
- Modify: `backend/src/storage/index.js`

**Step 1: 创建存储模块**

`backend/src/storage/index.js`:
```javascript
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data/news');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function saveNews(date, articles) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${date}.json`);
  const data = {
    id: date,
    date,
    articles,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

export function getNewsByDate(date) {
  const filePath = path.join(DATA_DIR, `${date}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function getAllNews() {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR);
  const newsList = files
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf-8'));
      return { id: data.id, date: data.date, createdAt: data.createdAt, articleCount: data.articles.length };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return newsList;
}
```

**Step 2: Commit**

```bash
git add backend/src/storage/index.js
git commit -feat: 实现存储模块"
```

---

## Task 3: 实现飞书推送模块

**Files:**
- Modify: `backend/src/feishu/index.js`

**Step 1: 创建飞书推送模块**

`backend/src/feishu/index.js`:
```javascript
import config from '../config.js';

export async function sendToFeishu(articles) {
  if (!config.feishuWebhook) {
    console.log('飞书 WebHook 未配置，跳过推送');
    return;
  }

  const message = buildMessage(articles);

  try {
    const response = await fetch(config.feishuWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    console.log('飞书推送成功');
  } catch (error) {
    console.error('飞书推送失败:', error.message);
  }
}

function buildMessage(articles) {
  const date = new Date().toLocaleDateString('zh-CN');
  const articleList = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');

  return {
    msg_type: 'text',
    content: {
      text: `📰 每日晨报 ${date}\n\n${articleList}\n\n查看详情: http://localhost:5173`
    }
  };
}
```

**Step 2: Commit**

```bash
git add backend/src/feishu/index.js
git commit -"feat: 实现飞书推送模块"
```

---

## Task 4: 实现抓取模块

**Files:**
- Modify: `backend/src/crawler/index.js`

**Step 1: 创建抓取模块**

`backend/src/crawler/index.js`:
```javascript
import { getEditor } from '@anthropic-ai/claude-code';
import config from '../config.js';

export async function crawlAll() {
  const allArticles = [];

  for (const source of config.crawlSources) {
    try {
      const articles = await crawlSource(source);
      allArticles.push(...articles);
    } catch (error) {
      console.error(`抓取 ${source.name} 失败:`, error.message);
    }
  }

  return allArticles;
}

async function crawlSource(source) {
  const browser = await getEditor({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(source.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const result = await page.ask(source.prompt);

    return parseResult(result, source.name);
  } finally {
    await page.close();
  }
}

function parseResult(text, sourceName) {
  const articles = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const match = line.match(/^\d+\.?\s*(.+)/);
    if (match) {
      articles.push({
        title: match[1].trim(),
        summary: '',
        url: '',
        source: sourceName
      });
    }
  }

  return articles;
}
```

**Step 2: Commit**

```bash
git add backend/src/crawler/index.js
git commit -"feat: 实现抓取模块"
```

---

## Task 5: 实现定时任务和路由

**Files:**
- Modify: `backend/src/scheduler/index.js`
- Modify: `backend/src/router.js`

**Step 1: 创建定时任务模块**

`backend/src/scheduler/index.js`:
```javascript
import cron from 'node-cron';
import config from '../config.js';
import { crawlAll } from '../crawler/index.js';
import { sendToFeishu } from '../feishu/index.js';
import { saveNews } from '../storage/index.js';

export function startScheduler() {
  cron.schedule(config.schedule, async () => {
    console.log('开始执行定时抓取任务...');
    await runCrawl();
  });
  console.log(`定时任务已启动: ${config.schedule}`);
}

export async function runCrawl() {
  try {
    const articles = await crawlAll();
    const today = new Date().toISOString().split('T')[0];
    saveNews(today, articles);
    await sendToFeishu(articles);
    console.log(`抓取完成，共 ${articles.length} 条资讯`);
  } catch (error) {
    console.error('抓取任务失败:', error.message);
  }
}
```

**Step 2: 创建路由模块**

`backend/src/router.js`:
```javascript
import express from 'express';
import { getAllNews, getNewsByDate } from './storage/index.js';
import { runCrawl } from './scheduler/index.js';
import config from './config.js';

const router = express.Router();

router.get('/news', (req, res) => {
  const news = getAllNews();
  res.json(news);
});

router.get('/news/:date', (req, res) => {
  const news = getNewsByDate(req.params.date);
  if (!news) {
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
    schedule: config.schedule
  });
});

export default router;
```

**Step 3: Commit**

```bash
git add backend/src/scheduler/index.js backend/src/router.js
git commit -"feat: 实现定时任务和API路由"
```

---

## Task 6: 初始化前端项目

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/api.js`
- Create: `frontend/src/pages/Home.jsx`
- Create: `frontend/src/pages/Detail.jsx`
- Create: `frontend/src/index.css`

**Step 1: 创建前端项目结构**

```bash
mkdir -p frontend/src/pages
```

`frontend/package.json`:
```json
{
  "name": "daily-news-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

`frontend/vite.config.js`:
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
```

`frontend/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>每日晨报</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

**Step 2: 创建前端源码**

`frontend/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

`frontend/src/App.jsx`:
```jsx
import { Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import Detail from './pages/Detail';

function App() {
  return (
    <div class="container">
      <header>
        <h1><Link to="/">每日晨报</Link></h1>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/news/:date" element={<Detail />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
```

`frontend/src/api.js`:
```javascript
const API_BASE = '/api';

export async function getNewsList() {
  const res = await fetch(`${API_BASE}/news`);
  return res.json();
}

export async function getNewsDetail(date) {
  const res = await fetch(`${API_BASE}/news/${date}`);
  if (!res.ok) return null;
  return res.json();
}

export async function triggerCrawl() {
  const res = await fetch(`${API_BASE}/crawl`, { method: 'POST' });
  return res.json();
}
```

`frontend/src/pages/Home.jsx`:
```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getNewsList } from '../api';

function Home() {
  const [news, setNews] = useState([]);

  useEffect(() => {
    getNewsList().then(setNews);
  }, []);

  return (
    <div>
      <h2>简报列表</h2>
      {news.length === 0 ? (
        <p>暂无数据</p>
      ) : (
        <ul class="news-list">
          {news.map(item => (
            <li key={item.id}>
              <Link to={`/news/${item.date}`}>
                {item.date} ({item.articleCount} 条资讯)
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Home;
```

`frontend/src/pages/Detail.jsx`:
```jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getNewsDetail } from '../api';

function Detail() {
  const { date } = useParams();
  const [news, setNews] = useState(null);

  useEffect(() => {
    getNewsDetail(date).then(setNews);
  }, [date]);

  if (!news) return <p>加载中...</p>;

  return (
    <div>
      <Link to="/">返回列表</Link>
      <h2>{news.date} 晨报</h2>
      <ul class="article-list">
        {news.articles.map((article, i) => (
          <li key={i}>
            <span class="source">[{article.source}]</span>
            <strong>{article.title}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Detail;
```

`frontend/src/index.css`:
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

header {
  margin-bottom: 20px;
}

header h1 a {
  color: #333;
  text-decoration: none;
}

h2 {
  margin: 20px 0;
  color: #333;
}

ul {
  list-style: none;
}

.news-list li {
  background: white;
  margin-bottom: 10px;
  padding: 15px;
  border-radius: 8px;
}

.news-list a {
  color: #333;
  text-decoration: none;
}

.article-list li {
  background: white;
  margin-bottom: 10px;
  padding: 15px;
  border-radius: 8px;
}

.source {
  color: #666;
  margin-right: 8px;
}
```

**Step 3: Commit**

```bash
git add frontend/
git commit -"feat: 初始化前端项目"
```

---

## Task 7: 创建 Docker 配置

**Files:**
- Create: `backend/Dockerfile`
- Create: `frontend/Dockerfile`
- Create: `docker-compose.yml`

**Step 1: 创建 Dockerfile**

`backend/Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

`frontend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`docker-compose.yml`:
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    volumes:
      - ./backend/data:/app/data
      - ./backend/config.json:/app/config.json
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

  frontend:
    build: ./frontend
    ports:
      - "5173:80"
```

**Step 2: Commit**

```bash
git add docker-compose.yml backend/Dockerfile frontend/Dockerfile
git commit -"feat: 添加Docker配置"
```

---

## Task 8: 安装依赖并验证

**Step 1: 安装后端依赖**

```bash
cd backend
npm install
```

**Step 2: 安装前端依赖**

```bash
cd frontend
npm install
```

**Step 3: 配置 API Key 并启动后端**

```bash
cp backend/.env.example backend/.env
# 编辑 .env 填入 ANTHROPIC_API_KEY
cd backend
npm run dev
```

**Step 4: 启动前端**

```bash
cd frontend
npm run dev
```

**Step 5: 验证**

- 访问 http://localhost:5173 查看前端
- 访问 http://localhost:3000/api/config 查看配置
- 手动触发抓取: POST http://localhost:3000/api/crawl

---

## 实现完成

所有任务已完成，项目结构如下：

```
daily-news/
├── backend/
│   ├── src/
│   │   ├── index.js
│   │   ├── config.js
│   │   ├── router.js
│   │   ├── crawler/index.js
│   │   ├── scheduler/index.js
│   │   ├── feishu/index.js
│   │   └── storage/index.js
│   ├── data/news/
│   ├── config.json
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── index.css
│   │   └── pages/
│   │       ├── Home.jsx
│   │       └── Detail.jsx
│   ├── index.html
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── docs/plans/
```
