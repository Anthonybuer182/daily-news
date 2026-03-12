import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import OpenAI from 'openai';
import config from '../config.js';

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.chat/v1'
});

// 复用浏览器实例
let browser = null;

async function getBrowser() {
  if (!browser) {
    // 使用系统安装的 Chrome 浏览器
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

export async function crawlAll() {
  const allArticles = [];
  const analysisResults = {};

  for (const source of config.crawlSources) {
    try {
      const result = await crawlSource(source);
      if (result) {
        allArticles.push(...result.articles);
        analysisResults[source.name] = result.analysis;
      }
    } catch (error) {
      console.error(`抓取 ${source.name} 失败:`, error.message);
    }
  }

  // 关闭浏览器
  if (browser) {
    await browser.close();
    browser = null;
  }

  // 生成深度分析报告
  const deepAnalysis = await generateDeepAnalysis(allArticles, analysisResults);

  return { articles: allArticles, analysis: deepAnalysis };
}

async function crawlSource(source) {
  const chromiumBrowser = await getBrowser();
  const page = await chromiumBrowser.newPage();

  try {
    // 访问列表页
    console.log(`[${source.name}] 访问列表页: ${source.url}`);
    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 获取页面中所有链接
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map(a => a.href)
        .filter(href => href && !href.startsWith('javascript:') && !href.startsWith('mailto:'))
        .filter(href => {
          // 过滤掉无效链接
          if (!href.startsWith('http')) return false;
          if (href.includes('#')) return false;
          if (href.endsWith('/')) return false;

          // 过滤掉可能是分页、登录、联系我们、广告等链接
          const excludePatterns = [
            /login/i, /register/i, /about/i, /contact/i,
            /privacy/i, /terms/i, /policy/i, /sitemap/i,
            /page\/\d+/i, /index_\d+/i,
            /advertise/i, /signup/i, /newsletter/i, /subscribe/i,
            /search/i, /tag\//i, /author\//i,
            /\/amp\//i, /\/embed\//i
          ];
          return !excludePatterns.some(pattern => pattern.test(href));
        });
    });

    // 去重
    const uniqueLinks = [...new Set(links)];

    console.log(`[${source.name}] 发现 ${uniqueLinks.length} 个链接，去重后: ${uniqueLinks.length} 个`);

    // 取前 10 个链接作为新闻详情页（可根据需要调整）
    const articleLinks = uniqueLinks.slice(0, 10);
    const articles = [];

    // 逐个访问详情页并提取正文
    for (let i = 0; i < articleLinks.length; i++) {
      const link = articleLinks[i];
      try {
        console.log(`[${source.name}] 抓取详情页 ${i + 1}/${articleLinks.length}: ${link.substring(0, 50)}...`);

        const articlePage = await chromiumBrowser.newPage();
        await articlePage.goto(link, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await articlePage.waitForTimeout(2000);

        // 使用 JSDOM + Readability 提取正文
        const html = await articlePage.content();
        const dom = new JSDOM(html, { url: link });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();
        const articleText = article ? article.textContent : '';

        await articlePage.close();

        if (articleText && articleText.trim().length > 200) {
          // 使用 LLM 从正文中提取标题和摘要
          const extractPrompt = `${source.prompt}\n\n文章正文：\n${articleText.substring(0, 8000)}`;

          const extractResult = await openai.chat.completions.create({
            model: 'abab6.5s-chat',
            messages: [
              { role: 'user', content: extractPrompt }
            ],
            max_tokens: 500
          });

          const extracted = parseArticleResult(
            extractResult.choices[0]?.message?.content || '',
            source.name,
            link
          );

          if (extracted) {
            articles.push(extracted);
          }
        }
      } catch (error) {
        console.error(`[${source.name}] 抓取详情页失败: ${error.message}`);
      }
    }

    // 如果没有提取到任何文章，或者有效文章太少，回退到列表页全文提取
    if (articles.length < 3) {
      console.log(`[${source.name}] 详情页抓取有效文章不足(${articles.length}条)，回退到列表页全文提取`);

      const articleText = await page.evaluate(() => document.body.innerText);
      const extractPrompt = `${source.prompt}\n\n页面内容：\n${articleText.substring(0, 8000)}`;

      const extractResult = await openai.chat.completions.create({
        model: 'abab6.5s-chat',
        messages: [
          { role: 'user', content: extractPrompt }
        ],
        max_tokens: 2000
      });

      const parsedArticles = parseResult(extractResult.choices[0]?.message?.content || '', source.name);
      // 如果列表页提取到了更多文章，则使用列表页的结果
      if (parsedArticles.length > articles.length) {
        articles.length = 0;
        const translatedTitles = await translateTitles(parsedArticles);
        articles.push(...translatedTitles);
      }
    } else {
      // 翻译英文标题
      const translatedArticles = await translateArticles(articles);
      articles.length = 0;
      articles.push(...translatedArticles);
    }

    // 对该来源进行简要分析
    const analysisPrompt = `作为科技资讯分析师，请对以下新闻进行简要分析（2-3句话）：\n\n${articles.map(a => `- ${a.source_title}`).join('\n')}`;

    const analysisResult = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: analysisPrompt }
      ],
      max_tokens: 500
    });

    console.log(`[${source.name}] 抓取完成: ${articles.length} 条`);

    return {
      articles: articles,
      analysis: analysisResult.choices[0]?.message?.content || ''
    };
  } finally {
    await page.close();
  }
}

async function generateDeepAnalysis(allArticles, analysisResults) {
  const articlesSummary = allArticles.map(a => `- [${a.source_name}] ${a.source_title}`).join('\n');

  const prompt = `你是一位资深的科技行业分析师。请对以下车联网和IoT领域的最新资讯进行深度分析：

## 新闻汇总
${articlesSummary}

## 分析要求
请从以下几个维度进行分析：

1. **行业趋势**: 这些新闻反映了什么行业趋势？
2. **关键技术**: 哪些技术值得关注？
3. **市场洞察**: 有什么市场机会？
4. **重点关注**: 哪些新闻最重要，为什么？

请用专业但易懂的语言进行分析，篇幅适中。`;

  try {
    const result = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 3000
    });

    return result.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('深度分析失败:', error.message);
    return '';
  }
}

// 解析详情页提取结果
function parseArticleResult(text, sourceName, sourceLink) {
  const lines = text.split('\n').filter(l => l.trim());

  // 尝试提取标题和摘要
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

    // 如果没有明确标记，尝试从第一行提取标题
    if (!title && line.length > 5 && line.length < 100) {
      title = line.trim();
    }
  }

  if (!title) {
    return null;
  }

  return {
    source_title: title,
    source_summary: summary,
    source_name: sourceName,
    source_link: sourceLink,
    source_date: '',
    source_cover: '',
    url: sourceLink,
    score: 0.5,
    hot: 0,
    category: '',
    date: new Date().toISOString().split('T')[0]
  };
}

function parseResult(text, sourceName) {
  const articles = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const match = line.match(/^\d+\.?\s*(.+)/);
    if (match) {
      articles.push({
        source_title: match[1].trim(),
        source_summary: '',
        source_name: sourceName,
        source_link: '',
        source_date: '',
        source_cover: '',
        url: '',
        score: 0.5,
        hot: 0,
        category: '',
        date: new Date().toISOString().split('T')[0]
      });
    }
  }

  return articles;
}

// 检测文本是否为英文
function isEnglish(text) {
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  const totalChars = text.replace(/[\s\d]/g, '').length;
  return totalChars > 0 && englishChars / totalChars > 0.5;
}

// 翻译英文标题为中文
async function translateTitles(articles) {
  if (!articles || articles.length === 0) {
    return articles;
  }

  const englishArticles = articles.filter(a => a.source_title && isEnglish(a.source_title));

  if (englishArticles.length === 0) {
    console.log(`[翻译] 没有检测到英文标题`);
    return articles;
  }

  console.log(`[翻译] 检测到 ${englishArticles.length} 条英文标题，开始翻译...`);

  const titlesToTranslate = englishArticles.map(a => a.source_title).join('\n');

  const translatePrompt = `请将以下英文科技新闻标题翻译成中文。只返回翻译后的标题，每行一个，不要添加任何解释或编号：

${titlesToTranslate}`;

  try {
    const result = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: translatePrompt }
      ],
      max_tokens: 2000
    });

    const translatedText = result.choices[0]?.message?.content || '';
    const translatedTitles = translatedText.split('\n').map(t => t.replace(/^\d+\.?\s*/, '').trim()).filter(t => t);

    const translatedMap = new Map();
    englishArticles.forEach((article, index) => {
      if (translatedTitles[index]) {
        translatedMap.set(article.source_title, translatedTitles[index]);
      }
    });

    return articles.map(article => {
      if (translatedMap.has(article.source_title)) {
        return {
          ...article,
          source_title: translatedMap.get(article.source_title)
        };
      }
      return article;
    });
  } catch (error) {
    console.error('翻译失败:', error.message);
    return articles;
  }
}

// 翻译详情页提取的文章
async function translateArticles(articles) {
  if (!articles || articles.length === 0) {
    return articles;
  }

  const englishArticles = articles.filter(a => a.source_title && isEnglish(a.source_title));

  if (englishArticles.length === 0) {
    return articles;
  }

  console.log(`[翻译] 检测到 ${englishArticles.length} 条英文标题，开始翻译...`);

  const titlesToTranslate = englishArticles.map(a => a.source_title).join('\n');

  const translatePrompt = `请将以下英文科技新闻标题翻译成中文。只返回翻译后的标题，每行一个，不要添加任何解释或编号：

${titlesToTranslate}`;

  try {
    const result = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: translatePrompt }
      ],
      max_tokens: 2000
    });

    const translatedText = result.choices[0]?.message?.content || '';
    const translatedTitles = translatedText.split('\n').map(t => t.replace(/^\d+\.?\s*/, '').trim()).filter(t => t);

    const translatedMap = new Map();
    englishArticles.forEach((article, index) => {
      if (translatedTitles[index]) {
        translatedMap.set(article.source_title, translatedTitles[index]);
      }
    });

    return articles.map(article => {
      if (translatedMap.has(article.source_title)) {
        return {
          ...article,
          source_title: translatedMap.get(article.source_title)
        };
      }
      return article;
    });
  } catch (error) {
    console.error('翻译失败:', error.message);
    return articles;
  }
}
