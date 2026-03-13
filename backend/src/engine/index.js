import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import OpenAI from 'openai';
import { getEnabledSources, getSourceById } from '../storage/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = path.join(__dirname, '..', '..', 'data', 'articles');

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.chat/v1'
});

// 复用浏览器实例
let browser = null;

async function getBrowser() {
  if (!browser) {
    const executablePath = process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome';

    browser = await chromium.launch({
      headless: true,
      executablePath: executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

// 关闭浏览器
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// 根据配置抓取单个数据源
export async function crawlSourceById(sourceId) {
  const source = getSourceById(sourceId);
  if (!source) {
    throw new Error(`数据源不存在: ${sourceId}`);
  }
  if (!source.enabled) {
    throw new Error(`数据源已禁用: ${sourceId}`);
  }

  return await crawlSource(source);
}

// 根据配置抓取单个数据源
async function crawlSource(source) {
  const chromiumBrowser = await getBrowser();
  const page = await chromiumBrowser.newPage();

  try {
    // 根据导航类型执行不同的抓取策略
    const navType = source.navigation?.type || 'single-page';

    console.log(`[${source.name}] 开始抓取，导航类型: ${navType}`);

    let articles = [];

    switch (navType) {
      case 'single-page':
        articles = await crawlSinglePage(source, page);
        break;
      case 'multi-step':
        articles = await crawlMultiStep(source, page);
        break;
      case 'list-detail':
        articles = await crawlListDetail(source, page);
        break;
      default:
        articles = await crawlSinglePage(source, page);
    }

    // 应用数据转换
    articles = await transformArticles(articles, source);

    console.log(`[${source.name}] 抓取完成: ${articles.length} 条`);

    return {
      articles,
      sourceName: source.name,
      sourceId: source.id
    };
  } finally {
    await page.close();
  }
}

// 单页列表抓取
async function crawlSinglePage(source, page) {
  const url = source.navigation?.url || source.base_url;
  console.log(`[${source.name}] 访问页面: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 执行页面动作（如果有）
  await executeActions(source.navigation?.actions || [], page);

  // 提取列表数据
  return await extractListData(source, page);
}

// 多步导航抓取
async function crawlMultiStep(source, page) {
  const steps = source.navigation?.steps || [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`[${source.name}] 步骤 ${i + 1}: ${step.name || 'unnamed'}`);

    if (step.url) {
      await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    if (step.waitFor) {
      await page.waitForTimeout(step.waitFor);
    }

    // 执行动作
    await executeActions(step.actions || [], page);
  }

  // 提取列表数据
  return await extractListData(source, page);
}

// 列表+详情抓取
async function crawlListDetail(source, page) {
  const listUrl = source.navigation?.listUrl || source.base_url;
  const maxItems = source.navigation?.maxItems || 10;

  console.log(`[${source.name}] 访问列表页: ${listUrl}`);
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 执行动作
  await executeActions(source.navigation?.actions || [], page);

  // 获取文章链接列表
  const listSelector = source.navigation?.listSelector || 'a';
  const links = await page.evaluate((selector) => {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements
      .map(el => el.href)
      .filter(href => href && href.startsWith('http'));
  }, listSelector);

  // 去重并限制数量
  const uniqueLinks = [...new Set(links)].slice(0, maxItems);
  console.log(`[${source.name}] 发现 ${uniqueLinks.length} 个文章链接`);

  const articles = [];

  // 逐个访问详情页
  for (let i = 0; i < uniqueLinks.length; i++) {
    const link = uniqueLinks[i];
    try {
      console.log(`[${source.name}] 抓取详情 ${i + 1}/${uniqueLinks.length}: ${link.substring(0, 50)}...`);

      const detailPage = await page.context().newPage();
      await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await detailPage.waitForTimeout(2000);

      const article = await extractDetailData(source, detailPage, link);
      if (article) {
        articles.push(article);
      }

      await detailPage.close();
    } catch (error) {
      console.error(`[${source.name}] 抓取详情页失败: ${error.message}`);
    }
  }

  // 如果没有提取到详情，回退到列表页提取
  if (articles.length < 3) {
    console.log(`[${source.name}] 详情页抓取有效文章不足，回退到列表页提取`);
    const listArticles = await extractListData(source, page);
    if (listArticles.length > articles.length) {
      return listArticles;
    }
  }

  return articles;
}

// 执行页面动作
async function executeActions(actions, page) {
  for (const action of actions) {
    switch (action.type) {
      case 'click':
        await page.click(action.selector);
        if (action.waitAfter) {
          await page.waitForTimeout(action.waitAfter);
        }
        break;
      case 'scroll':
        for (let i = 0; i < (action.repeat || 1); i++) {
          await page.evaluate((distance) => {
            window.scrollBy(0, distance);
          }, action.distance);
          await page.waitForTimeout(500);
        }
        break;
      case 'wait-for-selector':
        await page.waitForSelector(action.selector, { timeout: 5000 }).catch(() => {});
        break;
      case 'evaluate':
        await page.evaluate(action.script);
        break;
      case 'remove':
        await page.evaluate((selector) => {
          document.querySelectorAll(selector).forEach(el => el.remove());
        }, action.selector);
        break;
    }
  }
}

// 提取列表页数据
async function extractListData(source, page) {
  const listConfig = source.content?.list;
  if (!listConfig?.selector) {
    // 没有配置，使用默认方式
    return await extractLinksAsArticles(source, page);
  }

  const items = await page.evaluate((config) => {
    const elements = Array.from(document.querySelectorAll(config.selector));
    return elements.map(el => {
      const fields = {};
      for (const [fieldName, fieldConfig] of Object.entries(config.fields || {})) {
        const targetEl = el.querySelector(fieldConfig.selector) || el;
        if (fieldConfig.attribute === 'text') {
          fields[fieldName] = targetEl.innerText?.trim() || '';
        } else if (fieldConfig.attribute === 'href') {
          fields[fieldName] = targetEl.href || '';
        } else if (fieldConfig.attribute === 'src') {
          fields[fieldName] = targetEl.src || '';
        } else {
          fields[fieldName] = targetEl.getAttribute(fieldConfig.attribute) || '';
        }
      }
      return fields;
    });
  }, listConfig);

  // 转换为文章格式
  return items.map(item => ({
    source_title: item.title || '',
    source_summary: item.summary || '',
    source_link: item.link || '',
    source_date: item.date || '',
    source_cover: item.cover || '',
    source_name: source.name,
    date: new Date().toISOString().split('T')[0]
  }));
}

// 从链接提取文章（默认方式）
async function extractLinksAsArticles(source, page) {
  const links = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    return anchors
      .map(a => a.href)
      .filter(href => href && !href.startsWith('javascript:') && !href.startsWith('mailto:'))
      .filter(href => {
        if (!href.startsWith('http')) return false;
        if (href.includes('#')) return false;
        const excludePatterns = [
          /login/i, /register/i, /about/i, /contact/i,
          /privacy/i, /terms/i, /policy/i,
          /page\/\d+/i, /index_\d+/i,
          /advertise/i, /signup/i, /newsletter/i, /subscribe/i,
          /search/i, /tag\//i, /author\//i
        ];
        return !excludePatterns.some(pattern => pattern.test(href));
      });
  });

  const uniqueLinks = [...new Set(links)].slice(0, 10);
  const articles = [];

  for (let i = 0; i < uniqueLinks.length; i++) {
    const link = uniqueLinks[i];
    try {
      const detailPage = await page.context().newPage();
      await detailPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await detailPage.waitForTimeout(2000);

      const article = await extractDetailData(source, detailPage, link);
      if (article) {
        articles.push(article);
      }

      await detailPage.close();
    } catch (error) {
      console.error(`[${source.name}] 抓取失败: ${error.message}`);
    }
  }

  return articles;
}

// 提取详情页数据
async function extractDetailData(source, page, url) {
  const detailConfig = source.content?.detail;
  const useReadability = detailConfig?.useReadability !== false;

  let title = '';
  let content = '';
  let summary = '';

  if (useReadability) {
    const html = await page.content();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article) {
      title = article.title || '';
      content = article.textContent || '';
      summary = article.excerpt || '';
    }
  } else if (detailConfig?.fallback?.selector) {
    const data = await page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return {};
      return {
        title: el.querySelector('h1')?.innerText || '',
        content: el.innerText || '',
        summary: el.querySelector('.summary, .desc')?.innerText || ''
      };
    }, detailConfig.fallback.selector);

    title = data.title;
    content = data.content;
    summary = data.summary;
  }

  if (!content || content.length < 200) {
    return null;
  }

  // 使用 LLM 提取标题和摘要
  if (source.prompt) {
    try {
      const extractPrompt = `${source.prompt}\n\n文章正文：\n${content.substring(0, 8000)}`;
      const result = await openai.chat.completions.create({
        model: 'abab6.5s-chat',
        messages: [{ role: 'user', content: extractPrompt }],
        max_tokens: 500
      });

      const extracted = parseLLMResult(result.choices[0]?.message?.content || '', title, url);
      if (extracted) {
        title = extracted.title || title;
        summary = extracted.summary || summary;
      }
    } catch (error) {
      console.error(`[${source.name}] LLM 提取失败: ${error.message}`);
    }
  }

  // 保存 HTML 内容
  const html = await page.content();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const articleFileUrl = saveArticleHtml(title, article?.content || '');

  return {
    source_title: title,
    source_summary: summary,
    source_link: url,
    source_name: source.name,
    source_date: '',
    source_cover: '',
    url: articleFileUrl || url,
    content_html: '',
    score: 0.5,
    hot: 0,
    category: '',
    date: new Date().toISOString().split('T')[0]
  };
}

// 解析 LLM 提取结果
function parseLLMResult(text, defaultTitle, url) {
  const lines = text.split('\n').filter(l => l.trim());
  let title = '';
  let summary = '';

  for (const line of lines) {
    const titleMatch = line.match(/标题[：:]\s*(.+)/i) || line.match(/^标题[：:]\s*(.+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    const summaryMatch = line.match(/摘要[：:]\s*(.+)/i) || line.match(/^摘要[：:]\s*(.+)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
      continue;
    }

    if (!title && line.length > 5 && line.length < 100) {
      title = line.trim();
    }
  }

  if (!title) return null;

  return { title, summary };
}

// 数据转换
async function transformArticles(articles, source) {
  const transform = source.transform || {};

  for (const article of articles) {
    // 标题转换
    if (transform.title) {
      article.source_title = applyTransform(article.source_title, transform.title);
    }

    // 摘要转换
    if (transform.summary?.type === 'llm-extract') {
      try {
        const prompt = `${transform.summary.prompt}\n\n文章内容：\n${article.source_summary || article.source_title}`;
        const result = await openai.chat.completions.create({
          model: 'abab6.5s-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200
        });
        article.source_summary = result.choices[0]?.message?.content?.trim() || article.source_summary;
      } catch (error) {
        console.error(`[${source.name}] 摘要提取失败: ${error.message}`);
      }
    }

    // 翻译
    if (transform.title?.type === 'llm-translate' || transform.summary?.type === 'llm-translate') {
      const textToTranslate = article.source_title;
      if (textToTranslate && /[a-zA-Z]/.test(textToTranslate)) {
        try {
          const prompt = `翻译成中文：${textToTranslate}`;
          const result = await openai.chat.completions.create({
            model: 'abab6.5s-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200
          });
          article.source_title = result.choices[0]?.message?.content?.trim() || textToTranslate;
        } catch (error) {
          console.error(`[${source.name}] 翻译失败: ${error.message}`);
        }
      }
    }
  }

  return articles;
}

// 应用转换规则
function applyTransform(value, config) {
  if (!config.operations) return value;

  for (const op of config.operations) {
    switch (op.method) {
      case 'trim':
        value = value?.trim() || '';
        break;
      case 'replace':
        value = value?.replace(new RegExp(op.pattern, 'g'), op.replacement) || '';
        break;
      case 'slice':
        value = value?.slice(op.start, op.end) || '';
        break;
    }
  }

  return value;
}

// 保存文章 HTML
function saveArticleHtml(title, contentHtml) {
  if (!contentHtml) return '';

  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0, 20);
  const filename = `${safeTitle}_${timestamp}_${random}.html`;
  const filepath = path.join(ARTICLES_DIR, filename);

  const htmlDocument = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.8; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { font-size: 1.5em; margin-bottom: 0.5em; }
    img { max-width: 100%; height: auto; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${contentHtml}
</body>
</html>`;

  fs.writeFileSync(filepath, htmlDocument, 'utf-8');
  return `/articles/${filename}`;
}

// 抓取所有启用的数据源
export async function crawlAllSources() {
  const sources = getEnabledSources();
  const allArticles = [];
  const results = {};

  for (const source of sources) {
    try {
      const result = await crawlSource(source);
      allArticles.push(...result.articles);
      results[source.name] = { success: true, count: result.articles.length };
    } catch (error) {
      console.error(`[${source.name}] 抓取失败: ${error.message}`);
      results[source.name] = { success: false, error: error.message };
    }
  }

  // 关闭浏览器
  await closeBrowser();

  return { articles: allArticles, results };
}

export default { crawlAllSources, crawlSourceById, closeBrowser };
