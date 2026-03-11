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

    // 对该来源进行简要分析
    const analysisPrompt = `作为科技资讯分析师，请对以下新闻进行简要分析（2-3句话）：\n\n${titles.map(t => `- ${t.title}`).join('\n')}`;

    const analysisResult = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: analysisPrompt }
      ],
      max_tokens: 500
    });

    console.log(`[${source.name}] 抓取完成: ${titles.length} 条`);

    return {
      articles: titles,
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
        title: match[1].trim(),           // 标题 - 新闻文章的标题
        summary: '',                       // 摘要 - 新闻内容的简要描述
        source: sourceName,                // 来源 - 新闻发布来源/媒体
        source_link: '',                   // 来源链接 - 新闻原文链接
        source_date: '',                   // 来源日期 - 新闻发布日期
        source_cover: '',                  // 来源封面 - 新闻封面图片URL
        url: '',                           // 文章URL - 跳转链接
        score: 0.5,                       // 评分 - 新闻热度评分 (0-1)
        hot: 0,                            // 热度 - 热度指数
        category: '',                      // 分类 - 新闻分类
        date: new Date().toISOString().split('T')[0]  // 日期 - 数据日期 (格式: YYYY-MM-DD)
      });
    }
  }

  return articles;
}
