import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import OpenAI from 'openai';
import 'dotenv/config';

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.chat/v1'
});

async function test() {
  console.log('1. 启动浏览器...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log('2. 访问列表页...');
  const page = await browser.newPage();
  await page.goto('https://www.36kr.com/information/tech/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  console.log('3. 获取新闻链接...');
  // 获取新闻列表中的链接
  const links = await page.evaluate(() => {
    const articleLinks = [];
    // 尝试多种选择器获取新闻链接
    const selectors = [
      '.article-item a',
      '.news-item a',
      '.feed-item a',
      '.kr-seed-news a',
      'a[href*="/p/"]'
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      if (elements.length > 0) {
        elements.forEach(el => {
          const href = el.href;
          if (href && href.includes('/p/') && !articleLinks.includes(href)) {
            articleLinks.push(href);
          }
        });
        if (articleLinks.length > 0) break;
      }
    }

    // 如果上面的选择器没找到，用通用方法
    if (articleLinks.length === 0) {
      const anchors = document.querySelectorAll('a');
      anchors.forEach(a => {
        const href = a.href;
        if (href && href.includes('36kr.com/p/') && !articleLinks.includes(href)) {
          articleLinks.push(href);
        }
      });
    }

    return articleLinks.slice(0, 5);
  });

  console.log(`发现 ${links.length} 个新闻链接:`);
  links.forEach((l, i) => console.log(`  ${i+1}. ${l}`));

  if (links.length === 0) {
    console.log('未找到新闻链接，测试结束');
    await browser.close();
    return;
  }

  console.log('4. 访问详情页并提取正文...');
  const articlePage = await browser.newPage();
  await articlePage.goto(links[0], { waitUntil: 'domcontentloaded', timeout: 30000 });
  await articlePage.waitForTimeout(2000);

  // 获取页面 HTML 并在外部使用 Readability
  const html = await articlePage.content();

  // 使用 Readability 解析（需要在 Node 环境中）
  const articleText = await articlePage.evaluate(() => {
    // 使用浏览器原生的 Reader API 或者手动提取
    // 这里简单提取文章主要内容
    const article = document.querySelector('article');
    if (article) {
      return article.innerText;
    }
    // 尝试获取主要内容区域
    const main = document.querySelector('main');
    if (main) {
      return main.innerText;
    }
    return document.body.innerText;
  });

  console.log('正文长度:', articleText.length);
  console.log('正文前500字:', articleText.substring(0, 500));

  await browser.close();

  console.log('5. 调用 MiniMax API 提取标题...');
  try {
    const completion = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: `从以下文章中提取新闻标题和简要摘要（标题不超过30字，摘要不超过50字）：

文章正文：
${articleText.substring(0, 5000)}` }
      ],
      max_tokens: 500
    });
    console.log('\n=== API 返回结果 ===');
    console.log(completion.choices[0]?.message?.content);
  } catch (e) {
    console.error('API 错误:', e.message);
  }
}

test().catch(console.error);
