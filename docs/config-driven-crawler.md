# 配置驱动爬虫引擎设计方案

## 核心思路

创建一个通用的 Playwright 爬虫引擎，通过 **后台管理界面** 可视化配置每个网站的抓取流程，实现"一个引擎，千种配置"，无需编写代码。

## 特性

- **可视化配置**: 所有配置通过后台管理界面完成
- **所见即所得**: 在线测试配置，实时预览抓取结果
- **零代码添加源**: 新增数据源只需点点鼠标
- **配置复用**: 支持模板配置，快速创建相似数据源

## 配置 Schema 设计

### 1. 基础配置结构

```json
{
  "sources": [
    {
      "id": "unique_source_id",
      "name": "数据源名称",
      "enabled": true,
      "baseUrl": "https://example.com",
      "siteType": "news|blog|forum|social",

      "navigation": {
        "type": "single-page|multi-step|api",
        "steps": []
      },

      "content": {
        "list": {},
        "detail": {}
      },

      "extraction": {
        "list": {},
        "detail": {}
      },

      "transform": {}
    }
  ]
}
```

### 2. 导航类型 (Navigation Types)

#### 类型 A: 单页列表 (single-page)
主页直接是文章列表，一步到位。

```json
{
  "navigation": {
    "type": "single-page",
    "url": "https://news.example.com/tech"
  }
}
```

#### 类型 B: 多步导航 (multi-step)
需要先进入分类页，再进入列表页，最后进详情页。

```json
{
  "navigation": {
    "type": "multi-step",
    "steps": [
      {
        "name": "home",
        "url": "https://example.com",
        "waitFor": 2000,
        "actions": [
          {
            "type": "click",
            "selector": ".menu-tech a"
          }
        ]
      },
      {
        "name": "category",
        "waitFor": 3000,
        "actions": [
          {
            "type": "click",
            "selector": ".news-list a.first"
          }
        ]
      },
      {
        "name": "list",
        "waitFor": 2000
      }
    ]
  }
}
```

#### 类型 C: 列表+详情模式 (list-detail)
从列表页获取链接，再逐个访问详情页。

```json
{
  "navigation": {
    "type": "list-detail",
    "listUrl": "https://news.example.com/list",
    "detailAction": "click-into",
    "listSelector": "article a",
    "maxItems": 10,
    "backToList": true
  }
}
```

### 3. 内容提取配置 (Extraction)

#### 3.1 列表页提取

```json
{
  "content": {
    "list": {
      "selector": "article.item, .news-list li",
      "fields": {
        "title": {
          "selector": "h2, .title",
          "attribute": "text"
        },
        "link": {
          "selector": "a",
          "attribute": "href"
        },
        "summary": {
          "selector": ".desc, .summary",
          "attribute": "text"
        },
        "date": {
          "selector": ".time, .date",
          "attribute": "text"
        },
        "cover": {
          "selector": "img",
          "attribute": "src"
        }
      }
    }
  }
}
```

#### 3.2 详情页提取

```json
{
  "content": {
    "detail": {
      "useReadability": true,
      "fallback": {
        "selector": "article, .article-content, main",
        "fields": {
          "title": {
            "selector": "h1",
            "attribute": "text"
          },
          "content": {
            "selector": ".content, .article-body",
            "attribute": "html"
          },
          "publishedDate": {
            "selector": ".publish-date",
            "attribute": "text"
          }
        }
      }
    }
  }
}
```

### 4. 页面行为配置 (Actions)

```json
{
  "navigation": {
    "steps": [
      {
        "name": "category",
        "waitFor": 3000,
        "actions": [
          {
            "type": "click",
            "selector": ".nav-item[data-category='tech']",
            "waitAfter": 2000
          },
          {
            "type": "scroll",
            "distance": 500,
            "repeat": 3
          },
          {
            "type": "wait-for-selector",
            "selector": ".article-list"
          },
          {
            "type": "evaluate",
            "script": "document.querySelector('.popup')?.remove()"
          },
          {
            "type": "iframe",
            "selector": "iframe[name='content']",
            "action": "switch-to-frame"
          }
        ]
      }
    ]
  }
}
```

### 5. 数据转换配置 (Transform)

```json
{
  "transform": {
    "title": {
      "type": "string",
      "operations": [
        { "method": "trim" },
        { "method": "replace", "pattern": "\\s+", "replacement": " " },
        { "method": "slice", "start": 0, "end": 100 }
      ]
    },
    "date": {
      "type": "date",
      "inputFormat": "YYYY-MM-DD",
      "outputFormat": "YYYY-MM-DD",
      "timezone": "Asia/Shanghai"
    },
    "content": {
      "type": "html",
      "operations": [
        { "method": "remove", "selector": "script, style, .ad" },
        { "method": "cleanWhitespace": true }
      ]
    },
    "summary": {
      "type": "llm-extract",
      "prompt": "从文章中提取50字摘要",
      "maxLength": 50,
      "field": "content"
    }
  }
}
```

### 6. 过滤规则配置 (Filters)

```json
{
  "filters": {
    "url": {
      "excludePatterns": [
        "/login", "/register", "/about", "/contact",
        "/page/", "/tag/", "/author/"
      ],
      "includePatterns": [
        "/news/", "/article/", "/post/"
      ]
    },
    "content": {
      "minLength": 200,
      "excludeKeywords": ["广告", "免责声明", "联系我们"]
    }
  }
}
```

### 7. 完整配置示例

#### 示例 1: 新华网 (多步导航 + Readability)

```json
{
  "id": "xinhuanet",
  "name": "新华网",
  "enabled": true,
  "baseUrl": "https://www.news.cn",
  "siteType": "news",

  "navigation": {
    "type": "multi-step",
    "steps": [
      {
        "name": "home",
        "url": "https://www.news.cn/",
        "waitFor": 2000
      },
      {
        "name": "auto",
        "actions": [
          {
            "type": "click",
            "selector": ".nav a[href*='auto']"
          }
        ],
        "waitFor": 3000
      }
    ]
  },

  "content": {
    "list": {
      "selector": ".news_list li a",
      "fields": {
        "title": { "selector": "h3", "attribute": "text" },
        "link": { "selector": "a", "attribute": "href" }
      }
    },
    "detail": {
      "useReadability": true
    }
  },

  "transform": {
    "title": { "type": "string", "operations": [{ "method": "trim" }] }
  }
}
```

#### 示例 2: 36Kr (列表+详情模式)

```json
{
  "id": "36kr",
  "name": "36Kr",
  "enabled": true,
  "baseUrl": "https://36kr.com",
  "siteType": "news",

  "navigation": {
    "type": "list-detail",
    "listUrl": "https://36kr.com/newsflashes",
    "listSelector": ".article-item a",
    "maxItems": 15
  },

  "content": {
    "detail": {
      "useReadability": true,
      "fallback": {
        "selector": ".article-content"
      }
    }
  },

  "transform": {
    "summary": {
      "type": "llm-extract",
      "prompt": "提取30字新闻摘要",
      "maxLength": 30
    }
  }
}
```

#### 示例 3: IoT Business News (列表直接提取)

```json
{
  "id": "iotbusiness",
  "name": "IoT商业新闻",
  "enabled": true,
  "baseUrl": "https://iotbusinessnews.com",
  "siteType": "news",

  "navigation": {
    "type": "single-page",
    "url": "https://iotbusinessnews.com/"
  },

  "content": {
    "list": {
      "selector": ".post-item, article",
      "fields": {
        "title": { "selector": "h2, .title", "attribute": "text" },
        "link": { "selector": "a.more", "attribute": "href" },
        "summary": { "selector": ".excerpt", "attribute": "text" }
      }
    },
    "detail": {
      "useReadability": true
    }
  },

  "transform": {
    "title": {
      "type": "llm-translate",
      "from": "en",
      "to": "zh-CN"
    }
  }
}
```

## 引擎架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Configuration Loader                      │
│                 (YAML/JSON Config Parser)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core Engine                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Navigator   │  │ Extractor   │  │ Transformer         │  │
│  │ - single    │  │ - CSS       │  │ - String ops        │  │
│  │ - multi     │  │ - XPath     │  │ - Date parse        │  │
│  │ - list-det  │  │ - Readability│ │ - LLM extract       │  │
│  │ - api       │  │ - API       │  │ - Translate         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Output                                   │
│            (Articles + Analysis + Errors)                   │
└─────────────────────────────────────────────────────────────┘
```

## 核心实现类

### 1. ConfigurationLoader
- 加载并验证配置文件
- 支持配置继承和覆盖
- 支持环境变量替换

### 2. NavigationEngine
```javascript
class NavigationEngine {
  async navigate(config, page) {
    switch (config.type) {
      case 'single-page':
        return await this.singlePage(config, page);
      case 'multi-step':
        return await this.multiStep(config, page);
      case 'list-detail':
        return await this.listDetail(config, page);
      case 'api':
        return await this.apiFetch(config, page);
    }
  }
}
```

### 3. ContentExtractor
```javascript
class ContentExtractor {
  extractList(page, config) { /* CSS/XPath 提取 */ }
  extractDetail(page, config) { /* Readability 或自定义 */ }
}
```

### 4. DataTransformer
```javascript
class DataTransformer {
  transform(data, transformRules) {
    // 字符串操作、日期转换、LLM提取/翻译
  }
}
```

## 使用方式

### 1. 新增数据源
只需在 `config.json` 的 `sources` 数组中添加新配置：

```json
{
  "sources": [
    {
      "id": "new_source",
      "name": "新数据源",
      "enabled": true,
      "navigation": { ... },
      "content": { ... },
      "transform": { ... }
    }
  ]
}
```

### 2. 后台管理界面
- 可视化配置编辑器
- 配置测试功能
- 实时预览提取结果

## 后台管理界面设计

### 功能模块

1. **数据源列表** - 查看所有配置的数据源
2. **数据源配置** - 可视化编辑导航、提取、转换规则
3. **配置测试** - 在线测试配置，实时预览提取结果
4. **导入/导出** - 支持 JSON 格式导入导出配置

### 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  资讯管理系统                    [用户名] [退出]   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 系统配置  │ │ 数据源   │ │ 资讯管理  │ │ 抓取日志  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 数据源列表                                           │   │
│  │ ┌───────────────────────────────────────────────┐  │   │
│  │ │ + 新建数据源                                     │  │   │
│  │ └───────────────────────────────────────────────┘  │   │
│  │                                                       │   │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │   │
│  │ │ 新华网       │ │ 36Kr       │ │ IoT新闻    │    │   │
│  │ │ ✓ 启用       │ │ ✓ 启用     │ │ ✗ 禁用     │    │   │
│  │ │ [编辑][测试] │ │ [编辑][测试]│ │ [编辑][测试]│    │   │
│  │ └─────────────┘ └─────────────┘ └─────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 数据源配置表单

```
┌─────────────────────────────────────────────────────────────┐
│  编辑数据源                              [保存] [取消]       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  基本信息                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 名称: [____________________]  ID: [______________] │   │
│  │ 启用: [○ 是 ○ 否]  网站类型: [新闻 ▼]                 │   │
│  │ URL:  [_________________________________________]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  导航配置                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 导航类型: (●) 单页列表  ( ) 多步导航  ( ) 列表+详情  │   │
│  │                                                      │   │
│  │ ● 单页列表                                           │   │
│  │   URL: [_________________________________________]  │   │
│  │                                                      │   │
│  │ ○ 多步导航                                           │   │
│  │   步骤1: [访问 ___] → [等待 __ms] → [点击 ___]      │   │
│  │   步骤2: [等待 __ms] → [滚动 __px]                  │   │
│  │                                                      │   │
│  │ ○ 列表+详情                                          │   │
│  │   列表页URL: [_________________________________]   │   │
│  │   列表选择器: [__________]  最大条目: [__]           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  内容提取                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [●] 列表页提取  [ ] 详情页提取                       │   │
│  │                                                      │   │
│  │ 列表选择器: [____________________________________]   │   │
│  │                                                      │   │
│  │ 字段映射:                                            │   │
│  │   标题   → 选择器: [________] 属性: [text ▼]         │   │
│  │   链接   → 选择器: [________] 属性: [href ▼]         │   │
│  │   摘要   → 选择器: [________] 属性: [text ▼]        │   │
│  │   日期   → 选择器: [________] 属性: [text ▼]        │   │
│  │   封面   → 选择器: [________] 属性: [src ▼]         │   │
│  │                                                      │   │
│  │ [▼] 详情页提取配置                                   │   │
│  │   (●) 使用 Readability 自动提取                      │   │
│  │   ( ) 自定义选择器: [_________________________]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  数据转换                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 标题: [▼] 去除首尾空白                               │   │
│  │       [▼] 截断到指定长度: [100] 字符                 │   │
│  │       [ ] LLM翻译 (英文→中文)                       │   │
│  │                                                      │   │
│  │ 摘要: [ ] LLM提取摘要                               │   │
│  │       提示词: [__________________________________]  │   │
│  │       最大长度: [50] 字符                           │   │
│  │                                                      │   │
│  │ 日期:  [▼] 自动解析日期                              │   │
│  │       输入格式: [__________] 输出格式: [YYYY-MM-DD] │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  过滤规则                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ URL排除: [/login, /register, /page/, /tag/]         │   │
│  │ URL包含: [/news, /article, /post]                   │   │
│  │ 内容最小长度: [200] 字符                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  提取提示                                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ LLM提示词: [_____________________________________]  │   │
│  │ (用于从文章内容中提取标题、摘要等关键信息)            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 配置测试功能

```
┌─────────────────────────────────────────────────────────────┐
│  测试数据源配置                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  当前配置: 新华网 - 多步导航                                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 步骤1: 访问 https://www.news.cn                     │   │
│  │   ✓ 页面加载成功                                     │   │
│  │                                                      │   │
│  │ 步骤2: 点击 .nav a[href*='auto']                   │   │
│  │   ✓ 点击成功                                         │   │
│  │                                                      │   │
│  │ 提取列表:                                            │   │
│  │   1. 新能源汽车销量突破... | /news/12345            │   │
│  │   2. 智能网联汽车发展...    | /news/12346           │   │
│  │   3. 车联网安全标准...      | /news/12347           │   │
│  │   ...                                               │   │
│  │                                                      │   │
│  │ 提取详情 (第1条):                                    │   │
│  │   ✓ 标题: 新能源汽车销量突破200万辆                 │   │
│  │   ✓ 摘要: 根据中汽协最新数据...                     │   │
│  │   ✓ 内容: (1250字)                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  测试结果: ✓ 配置正确                                        │
│  预计抓取: 15 条内容                                         │
│                                                             │
│                         [重新测试] [保存配置]               │
└─────────────────────────────────────────────────────────────┘
```

### API 接口设计

```javascript
// 获取所有数据源配置
GET /api/sources

// 获取单个数据源配置
GET /api/sources/:id

// 创建数据源
POST /api/sources
{
  "name": "新华网",
  "id": "xinhuanet",
  "enabled": true,
  "navigation": { ... },
  "content": { ... },
  "transform": { ... },
  "filters": { ... }
}

// 更新数据源
PUT /api/sources/:id
{ ... }

// 删除数据源
DELETE /api/sources/:id

// 测试数据源配置
POST /api/sources/test
{
  "navigation": { ... },
  "content": { ... }
}
// 返回: { success: true, items: [...], errors: [] }

// 导入配置
POST /api/sources/import
{ "sources": [...] }

// 导出配置
GET /api/sources/export
// 返回: JSON 配置内容
```

## 数据存储

配置存储在数据库中，通过后台管理界面 CRUD：

```sql
-- 数据源配置表
CREATE TABLE sources (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  site_type VARCHAR(20) DEFAULT 'news',
  base_url VARCHAR(500),

  -- 导航配置 (JSON)
  navigation JSON,

  -- 内容提取配置 (JSON)
  content JSON,

  -- 数据转换配置 (JSON)
  transform JSON,

  -- 过滤规则 (JSON)
  filters JSON,

  -- LLM 提示词
  prompt TEXT,

  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## 引擎文件结构

```
backend/src/
├── engine/
│   ├── index.js           # 引擎入口，调度各模块
│   ├── navigator.js       # 导航引擎（单页/多步/列表+详情）
│   ├── extractor.js       # 内容提取（CSS/Readability）
│   ├── transformer.js     # 数据转换（字符串/LLM）
│   └── filter.js          # 过滤规则
├── routes/
│   └── sources.js         # 数据源管理 API
└── admin/
    └── index.html         # 后台管理界面（数据源配置页）
```

## 后台管理界面功能

### 1. 数据源管理
- 列表展示所有数据源（启用/禁用状态）
- 可视化配置表单（导航+提取+转换+过滤）
- 克隆/复制已有配置
- 导入/导出 JSON 配置

### 2. 配置模板
预设常用网站模板，快速创建：
- 36Kr、虎嗅、极客公园
- 新华网、人民网
- IoT Business News
- 自定义模板

### 3. 在线测试
- 选择要测试的数据源
- 执行抓取流程
- 实时显示每步结果
- 预览提取的数据

### 4. 抓取日志
- 显示每次抓取的详细日志
- 记录成功/失败条目
- 错误信息追溯
```

## 配置管理策略

1. **版本控制**: 每个源独立 JSON 文件，便于版本管理和协作
2. **配置继承**: 支持基础配置模板，子配置继承后覆盖
3. **环境变量**: 支持 `${ENV_VAR}` 形式的变量替换
4. **热更新**: 支持运行时重新加载配置，无需重启服务
5. **配置验证**: 启动时校验 Schema，确保配置正确

## 配置调试技巧

1. **dryRun 模式**: 不保存数据，只打印提取结果
2. **单步执行**: 可指定只执行某个步骤
3. **截图保存**: 每个步骤后自动截图
4. **Selector 测试**: 在线测试 CSS/XPath 选择器
