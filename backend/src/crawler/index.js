import puppeteer from 'puppeteer-core';
import OpenAI from 'openai';
import config from '../config.js';

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.chat/v1'
});

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

  // 生成深度分析报告
  const deepAnalysis = await generateDeepAnalysis(allArticles, analysisResults);

  return { articles: allArticles, analysis: deepAnalysis };
}

async function crawlSource(source) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const articleText = await page.evaluate(() => document.body.innerText);

    // 提取新闻标题
    const extractPrompt = `${source.prompt}\n\n页面内容：\n${articleText.substring(0, 8000)}`;

    const extractResult = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: extractPrompt }
      ],
      max_tokens: 2000
    });

    const titles = parseResult(extractResult.choices[0]?.message?.content || '', source.name);

    // 检测并翻译英文标题为中文
    const translatedTitles = await translateTitles(titles);

    // 对该来源进行简要分析
    const analysisPrompt = `作为科技资讯分析师，请对以下新闻进行简要分析（2-3句话）：\n\n${titles.map(t => `- ${t.title}`).join('\n')}`;

    const analysisResult = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: analysisPrompt }
      ],
      max_tokens: 500
    });

    console.log(`[${source.name}] 抓取完成: ${translatedTitles.length} 条`);

    return {
      articles: translatedTitles,
      analysis: analysisResult.choices[0]?.message?.content || ''
    };
  } finally {
    await browser.close();
  }
}

async function generateDeepAnalysis(allArticles, analysisResults) {
  const articlesSummary = allArticles.map(a => `- [${a.source}] ${a.title}`).join('\n');

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

function parseResult(text, sourceName) {
  const articles = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const match = line.match(/^\d+\.?\s*(.+)/);
    if (match) {
      articles.push({
        source_title: match[1].trim(),    // 原始来源标题
        source_summary: '',               // 原始来源摘要
        source_name: sourceName,          // 来源名称（媒体/网站名称）
        source_link: '',                  // 原文链接
        source_date: '',                  // 原文发布日期
        source_cover: '',                 // 封面图片URL
        url: '',                          // 跳转链接
        score: 0.5,                      // 热度评分 (0-1)
        hot: 0,                           // 热度指数
        category: '',                     // 新闻分类
        date: new Date().toISOString().split('T')[0]  // 数据日期 (格式: YYYY-MM-DD)
      });
    }
  }

  return articles;
}

// 检测文本是否为英文（包含超过50%的英文字符）
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
  console.log(`[翻译] 英文标题: ${englishArticles.map(a => a.source_title).join(', ')}`);

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

    // 替换英文标题为中文
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
