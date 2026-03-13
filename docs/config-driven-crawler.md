# 配置驱动爬虫引擎 - 配置文件格式

## 完整配置示例

```json
{
  "id": "example-news",
  "name": "某新闻网",
  "enabled": true,
  "domain": "example-news.com",
  "entry_urls": ["https://example-news.com/tech"],
  "prompt": "提取汽车相关重要新闻，返回标题和摘要，每条不超过30字",
  "flow": [
    {
      "step_name": "获取列表页",
      "type": "list_extraction",
      "action": {
        "wait_for": ".article-list",
        "item_selector": ".article-list .item",
        "title_selector": "h3 a",
        "link_selector": "h3 a",
        "summary_selector": ".desc",
        "cover_selector": "img"
      },
      "pagination": {
        "type": "click_next",
        "next_button_selector": ".pagination .next",
        "max_pages": 3
      }
    },
    {
      "step_name": "获取详情页",
      "type": "detail_extraction",
      "use_readability": true,
      "fallback_selector": "article"
    }
  ],
  "transform": {
    "title": {
      "type": "llm-translate",
      "from": "en",
      "to": "zh-CN"
    },
    "summary": {
      "type": "llm-extract",
      "max_length": 50
    }
  },
  "filters": {
    "url_exclude": ["/login", "/register", "/about", "/contact", "/page/"],
    "url_include": ["/news/", "/article/", "/post/"],
    "min_content_length": 200
  }
}
```

## 字段说明

### 基础配置

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 唯一标识 |
| name | string | 是 | 数据源名称 |
| enabled | boolean | 否 | 是否启用，默认 true |
| domain | string | 否 | 域名，用于过滤链接 |
| entry_urls | array | 是 | 入口 URL 列表 |
| prompt | string | 否 | LLM 提取提示词 |

### 流程配置 (flow)

#### 步骤类型

**1. list_extraction - 列表页提取**

```json
{
  "step_name": "获取列表页",
  "type": "list_extraction",
  "action": {
    "wait_for": ".article-list",
    "item_selector": ".article-list .item",
    "title_selector": "h3 a",
    "link_selector": "h3 a",
    "summary_selector": ".desc",
    "date_selector": ".time",
    "cover_selector": "img"
  },
  "pagination": {
    "type": "click_next",
    "next_button_selector": ".pagination .next",
    "max_pages": 3
  }
}
```

| 字段 | 说明 |
|------|------|
| wait_for | 等待元素出现 |
| item_selector | 文章列表项选择器 |
| title_selector | 标题选择器 |
| link_selector | 链接选择器 |
| summary_selector | 摘要选择器 |
| date_selector | 日期选择器 |
| cover_selector | 封面图选择器 |
| pagination | 分页配置 |

**分页类型**

| 类型 | 说明 |
|------|------|
| click_next | 点击下一页按钮 |
| scroll | 滚动加载更多 |
| url_pattern | URL 规律替换，如 page_1 → page_2 |

**2. detail_extraction - 详情页提取**

```json
{
  "step_name": "获取详情页",
  "type": "detail_extraction",
  "use_readability": true,
  "fallback_selector": "article"
}
```

| 字段 | 说明 |
|------|------|
| use_readability | 使用 Readability 自动提取 |
| fallback_selector | 自定义选择器备用 |

**3. navigation - 导航操作**

```json
{
  "step_name": "进入科技频道",
  "type": "navigation",
  "action": {
    "url": "https://example.com/tech",
    "wait_for": 2000,
    "click": ".nav-tech",
    "scroll": 500,
    "remove": ".popup,.ad"
  }
}
```

### 数据转换 (transform)

```json
{
  "transform": {
    "title": {
      "type": "llm-translate",
      "from": "en",
      "to": "zh-CN"
    },
    "summary": {
      "type": "llm-extract",
      "max_length": 50
    },
    "date": {
      "type": "date_format",
      "input_format": "YYYY-MM-DD",
      "output_format": "YYYY-MM-DD"
    }
  }
}
```

| 类型 | 说明 |
|------|------|
| llm-translate | LLM 翻译 |
| llm-extract | LLM 提取摘要 |
| date_format | 日期格式化 |
| string_ops | 字符串操作 |

### 过滤规则 (filters)

```json
{
  "filters": {
    "url_exclude": ["/login", "/register"],
    "url_include": ["/news/", "/article/"],
    "min_content_length": 200,
    "exclude_keywords": ["广告", "免责声明"]
  }
}
```

## 简单配置示例

### 1. 单页列表 + Readability 详情

```json
{
  "id": "simple-news",
  "name": "简易新闻",
  "entry_urls": ["https://example.com/news"],
  "flow": [
    {
      "step_name": "提取列表",
      "type": "list_extraction",
      "action": {
        "item_selector": "article",
        "title_selector": "h2",
        "link_selector": "a"
      }
    },
    {
      "step_name": "提取详情",
      "type": "detail_extraction",
      "use_readability": true
    }
  ]
}
```

### 2. 多步导航

```json
{
  "id": "multi-step-news",
  "name": "多步新闻",
  "entry_urls": ["https://example.com"],
  "flow": [
    {
      "step_name": "首页",
      "type": "navigation",
      "action": {
        "click": ".nav-tech"
      }
    },
    {
      "step_name": "列表页",
      "type": "list_extraction",
      "action": {
        "item_selector": ".news-list li",
        "title_selector": "h3",
        "link_selector": "a"
      }
    }
  ]
}
```

### 3. 滚动加载列表

```json
{
  "id": "scroll-news",
  "name": "滚动新闻",
  "entry_urls": ["https://example.com/feed"],
  "flow": [
    {
      "step_name": "滚动加载",
      "type": "list_extraction",
      "action": {
        "item_selector": ".feed-item",
        "title_selector": ".title",
        "link_selector": "a"
      },
      "pagination": {
        "type": "scroll",
        "max_pages": 5,
        "scroll_distance": 1000,
        "wait_after": 2000
      }
    }
  ]
}
```

## 后台管理界面配置

在后台管理页面添加数据源时，会提供以下配置选项：

1. **基本信息**: ID、名称、域名、入口URL
2. **流程配置**: 可视化添加步骤，选择类型（列表/详情/导航）
3. **分页设置**: 选择分页方式，配置相关参数
4. **数据转换**: 选择需要转换的字段和转换方式
5. **过滤规则**: 配置 URL 过滤和内容过滤
