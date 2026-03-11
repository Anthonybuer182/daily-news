# 每日晨报产品设计文档

**日期**: 2026-03-09
**项目**: 每日晨报 (Daily News)

## 1. 项目概述

每日晨报是一个自动化资讯抓取和分发系统，每天早上8点定时从多个科技/车联网/IoT相关网站抓取资讯，推送到飞书群聊，并通过Web页面展示历史简报。

## 2. 系统架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Stagehand     │    │  Node.js Backend │    │  React Frontend │
│  (抓取引擎)     │───▶│  (定时任务+API)   │◀───│  (Web展示)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  飞书WebHook     │
                        │  (消息推送)       │
                        └──────────────────┘
```

## 3. 技术栈

| 层级 | 技术选择 |
|------|----------|
| 后端 | Node.js + Express |
| 抓取 | Stagehand |
| 存储 | JSON文件 |
| 前端 | React + Vite |
| 部署 | Docker |

## 4. 核心功能

### 4.1 定时抓取
- 使用 node-cron 实现定时任务
- 默认每天 8:00 自动运行
- 支持手动API触发抓取

### 4.2 内容抓取
- 通过 Stagehand 访问配置的多URL
- 每个URL可配置独立的提示词
- 提取标题、摘要、原文链接

### 4.3 飞书推送
- 使用飞书机器人 WebHook
- 格式化消息卡片推送到群聊

### 4.4 Web展示
- 简报列表页面
- 简报详情页面

## 5. 数据结构

### 5.1 配置文件 (config.json)
```json
{
  "feishuWebhook": "飞书机器人WebHook地址",
  "crawlSources": [
    {
      "name": "新华网",
      "url": "https://www.news.cn/",
      "prompt": "提取重要新闻，返回标题和摘要，每条不超过50字"
    },
    {
      "name": "IoT商业新闻",
      "url": "https://iotbusinessnews.com/",
      "prompt": "提取IoT和车联网相关新闻，返回标题和摘要"
    },
    {
      "name": "36Kr",
      "url": "https://www.36kr.com/information/tech/",
      "prompt": "提取科技新闻，返回标题和摘要"
    }
  ],
  "schedule": "0 0 8 * * *"
}
```

### 5.2 简报数据 (data/news/YYYY-MM-DD.json)
```json
{
  "id": "2026-03-09",
  "date": "2026-03-09",
  "articles": [
    {
      "title": "文章标题",
      "summary": "文章摘要",
      "url": "原文链接",
      "source": "36Kr"
    }
  ],
  "createdAt": "2026-03-09T08:00:00Z"
}
```

## 6. API 设计

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/news | 获取简报列表 |
| GET | /api/news/:date | 获取指定日期简报 |
| POST | /api/crawl | 手动触发抓取 |
| GET | /api/config | 获取配置（不包含WebHook密钥） |

## 7. 目录结构

```
daily-news/
├── backend/
│   ├── src/
│   │   ├── index.js          # 入口文件
│   │   ├── config.js         # 配置管理
│   │   ├── router.js         # 路由
│   │   ├── crawler/
│   │   │   └── index.js      # 抓取逻辑
│   │   ├── scheduler/
│   │   │   └── index.js      # 定时任务
│   │   ├── feishu/
│   │   │   └── index.js      # 飞书推送
│   │   └── storage/
│   │       └── index.js      # JSON存储
│   ├── data/
│   │   └── news/             # 简报数据存储
│   ├── config.json           # 配置文件
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx      # 简报列表
│   │   │   └── Detail.jsx    # 简报详情
│   │   └── api.js            # API调用
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
└── docker-compose.yml
```

## 8. 错误处理

- 抓取失败：记录错误日志，跳过失败的URL，继续处理其他URL
- 飞书推送失败：记录错误，不中断流程
- 存储失败：抛出异常，上层捕获处理

## 9. 后续优化

- [ ] 添加日志系统
- [ ] 添加重试机制
- [ ] 添加通知告警
- [ ] 支持更多数据源类型
