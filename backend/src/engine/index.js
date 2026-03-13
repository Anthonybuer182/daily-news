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
    const flow = source.flow || [];
    const entryUrls = source.entry_urls || [source.domain];

    console.log(`[${source.name}] 开始抓取，流程步骤: ${flow.length}`);

    let allArticles = [];

    // 遍历每个入口 URL
    for (const entryUrl of entryUrls) {
      console.log(`[${source.name}] 访问入口: ${entryUrl}`);

      // 创建新页面
      const flowPage = await chromiumBrowser.newPage();
      await flowPage.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await flowPage.waitForTimeout(3000);

      // 执行流程步骤
      for (const step of flow) {
        console.log(`[${source.name}] 执行步骤: ${step.step_name || step.type}`);
        const articles = await executeStep(step, flowPage, source);
        if (articles && articles.length > 0) {
          allArticles = allArticles.concat(articles);
        }
      }

      await flowPage.close();
    }

    // 去重
    const seen = new Set();
    allArticles = allArticles.filter(a => {
      const key = a.source_title + a.source_link;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 应用数据转换
    allArticles = await transformArticles(allArticles, source);

    console.log(`[${source.name}] 抓取完成: ${allArticles.length} 条`);

    return {
      articles: allArticles,
      sourceName: source.name,
      sourceId: source.id
    };
  } finally {
    await page.close();
  }
}

// 执行单个流程步骤
async function executeStep(step, page, source) {
  switch (step.type) {
    case 'navigation':
      return await executeNavigation(step, page);
    case 'list_extraction':
      return await executeListExtraction(step, page, source);
    case 'detail_extraction':
      return await executeDetailExtraction(step, page, source);
    default:
      console.log(`[${source.name}] 未知步骤类型: ${step.type}`);
      return [];
  }
}

// 执行导航步骤
async function executeNavigation(step, page) {
  const action = step.action || {};

  if (action.click) {
    await page.click(action.click);
    await page.waitForTimeout(action.wait_after || 2000);
  }

  if (action.scroll) {
    await page.evaluate((distance) => {
      window.scrollBy(0, distance);
    }, action.scroll);
  }

  if (action.remove) {
    await page.evaluate((selector) => {
      document.querySelectorAll(selector).forEach(el => el.remove());
    }, action.remove);
  }

  if (action.wait_for) {
    await page.waitForSelector(action.wait_for, { timeout: 5000 }).catch(() => {});
  }

  return [];
}

// 执行列表提取步骤
async function executeListExtraction(step, page, source) {
  const action = step.action || {};
  const pagination = step.pagination || {};

  let allItems = [];

  // 提取当前页
  const items = await extractListItems(page, action);
  allItems = allItems.concat(items);
  console.log(`[${source.name}] 当前页提取: ${items.length} 条`);

  // 处理分页
  if (pagination.type === 'click_next' && pagination.next_button_selector) {
    const maxPages = pagination.max_pages || 3;
    for (let i = 1; i < maxPages; i++) {
      try {
        const nextBtn = await page.$(pagination.next_button_selector);
        if (!nextBtn) break;

        await nextBtn.click();
        await page.waitForTimeout(pagination.wait_after || 2000);

        const pageItems = await extractListItems(page, action);
        allItems = allItems.concat(pageItems);
        console.log(`[${source.name}] 第 ${i + 1} 页: ${pageItems.length} 条`);
      } catch (e) {
        console.log(`[${source.name}] 分页结束: ${e.message}`);
        break;
      }
    }
  } else if (pagination.type === 'scroll') {
    const maxPages = pagination.max_pages || 5;
    for (let i = 1; i < maxPages; i++) {
      await page.evaluate((distance) => {
        window.scrollBy(0, distance);
      }, pagination.scroll_distance || 1000);
      await page.waitForTimeout(pagination.wait_after || 2000);

      const pageItems = await extractListItems(page, action);
      allItems = allItems.concat(pageItems);
      console.log(`[${source.name}] 滚动第 ${i + 1} 次: ${pageItems.length} 条`);
    }
  }

  // 如果有详情页步骤，提取详情
  const detailStep = source.flow?.find(f => f.type === 'detail_extraction');
  if (detailStep && allItems.length > 0) {
    return await extractDetailArticles(allItems, detailStep, page, source);
  }

  // 直接返回列表数据
  return allItems.map(item => ({
    source_title: item.title || '',
    source_summary: item.summary || '',
    source_link: item.link || '',
    source_date: item.date || '',
    source_cover: item.cover || '',
    source_name: source.name,
    date: new Date().toISOString().split('T')[0]
  }));
}

// 从页面提取列表项
async function extractListItems(page, action) {
  const itemSelector = action.item_selector;
  if (!itemSelector) return [];

  return await page.evaluate((config) => {
    const elements = document.querySelectorAll(config.item_selector);
    return Array.from(elements).map(el => {
      const getText = (sel) => {
        const target = el.querySelector(sel);
        return target ? target.innerText?.trim() : '';
      };
      const getAttr = (sel, attr) => {
        const target = el.querySelector(sel);
        return target ? target.getAttribute(attr) || '' : '';
      };
      return {
        title: getText(config.title_selector) || el.innerText?.trim()?.substring(0, 100),
        link: config.link_selector ? getAttr(config.link_selector, 'href') : el.querySelector('a')?.href || '',
        summary: config.summary_selector ? getText(config.summary_selector) : '',
        date: config.date_selector ? getText(config.date_selector) : '',
        cover: config.cover_selector ? getAttr(config.cover_selector, 'src') : ''
      };
    }).filter(item => item.link && item.link.startsWith('http'));
  }, action);
}

// 提取详情页文章
async function extractDetailArticles(listItems, detailStep, page, source) {
  const articles = [];
  const maxItems = 10;

  for (let i = 0; i < Math.min(listItems.length, maxItems); i++) {
    const item = listItems[i];
    try {
      console.log(`[${source.name}] 提取详情 ${i + 1}/${Math.min(listItems.length, maxItems)}: ${item.title?.substring(0, 30)}`);

      const detailPage = await page.context().newPage();
      await detailPage.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await detailPage.waitForTimeout(2000);

      let title = item.title;
      let summary = item.summary || '';
      let content = '';

      // 使用 Readability 提取
      if (detailStep.use_readability) {
        const html = await detailPage.content();
        const dom = new JSDOM(html, { url: item.link });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (article) {
          title = title || article.title || '';
          content = article.textContent || '';
          summary = summary || article.excerpt || '';
        }
      } else if (detailStep.fallback_selector) {
        const data = await detailPage.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el ? { content: el.innerText || '' } : {};
        }, detailStep.fallback_selector);
        content = data.content || '';
      }

      if (!content || content.length < 200) {
        await detailPage.close();
        continue;
      }

      // 使用 LLM 提取
      if (source.prompt) {
        try {
          const extractPrompt = `${source.prompt}\n\n文章正文：\n${content.substring(0, 8000)}`;
          const result = await openai.chat.completions.create({
            model: 'abab6.5s-chat',
            messages: [{ role: 'user', content: extractPrompt }],
            max_tokens: 500
          });

          const extracted = parseLLMResult(result.choices[0]?.message?.content || '');
          if (extracted) {
            title = extracted.title || title;
            summary = extracted.summary || summary;
          }
        } catch (error) {
          console.error(`[${source.name}] LLM 提取失败: ${error.message}`);
        }
      }

      // 保存 HTML
      const articleFileUrl = saveArticleHtml(title, content);

      articles.push({
        source_title: title,
        source_summary: summary,
        source_link: item.link,
        source_date: item.date || '',
        source_cover: item.cover || '',
        source_name: source.name,
        url: articleFileUrl || item.link,
        content_html: '',
        score: 0.5,
        hot: 0,
        category: '',
        date: new Date().toISOString().split('T')[0]
      });

      await detailPage.close();
    } catch (error) {
      console.error(`[${source.name}] 提取详情失败: ${error.message}`);
    }
  }

  return articles;
}

// 执行详情页提取步骤（独立使用）
async function executeDetailExtraction(step, page, source) {
  // 从当前页面提取详情
  let title = '';
  let summary = '';
  let content = '';

  if (step.use_readability) {
    const html = await page.content();
    const dom = new JSDOM(html);
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (article) {
      title = article.title || '';
      content = article.textContent || '';
      summary = article.excerpt || '';
    }
  } else if (step.fallback_selector) {
    const data = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? { title: el.querySelector('h1')?.innerText || '', content: el.innerText || '' } : {};
    }, step.fallback_selector);
    title = data.title || '';
    content = data.content || '';
  }

  if (!content || content.length < 200) {
    return [];
  }

  return [{
    source_title: title,
    source_summary: summary,
    source_link: page.url(),
    source_name: source.name,
    date: new Date().toISOString().split('T')[0]
  }];
}

// 解析 LLM 提取结果
function parseLLMResult(text) {
  const lines = text.split('\n').filter(l => l.trim());
  let title = '';
  let summary = '';

  for (const line of lines) {
    const titleMatch = line.match(/标题[：:]\s*(.+)/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }
    const summaryMatch = line.match(/摘要[：:]\s*(.+)/i);
    if (summaryMatch) {
      summary = summaryMatch[1].trim();
      continue;
    }
    if (!title && line.length > 5 && line.length < 100) {
      title = line.trim();
    }
  }

  return { title, summary };
}

// 数据转换
async function transformArticles(articles, source) {
  const transform = source.transform || {};

  for (const article of articles) {
    // 翻译
    if (transform.title?.type === 'llm-translate') {
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

    // LLM 提取摘要
    if (transform.summary?.type === 'llm-extract') {
      const maxLength = transform.summary.max_length || 50;
      try {
        const prompt = `提取${maxLength}字摘要：${article.source_title} ${article.source_summary || ''}`;
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
  }

  return articles;
}

// 保存文章 HTML
function saveArticleHtml(title, contentHtml) {
  if (!contentHtml) return '';

  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const safeTitle = (title || 'article').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').substring(0, 20);
  const filename = `${safeTitle}_${timestamp}_${random}.html`;
  const filepath = path.join(ARTICLES_DIR, filename);

  const htmlDocument = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Article'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.8; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { font-size: 1.5em; margin-bottom: 0.5em; }
    img { max-width: 100%; height: auto; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  <h1>${title || 'Article'}</h1>
  <div>${contentHtml}</div>
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

  await closeBrowser();

  return { articles: allArticles, results };
}

export default { crawlAllSources, crawlSourceById, closeBrowser };
