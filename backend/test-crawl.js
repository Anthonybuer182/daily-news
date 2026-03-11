import puppeteer from 'puppeteer-core';
import OpenAI from 'openai';
import 'dotenv/config';

const openai = new OpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.chat/v1'
});

async function test() {
  console.log('1. 启动浏览器...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log('2. 访问页面...');
  const page = await browser.newPage();
  await page.goto('https://www.36kr.com/information/tech/', { waitUntil: 'networkidle', timeout: 30000 });

  console.log('3. 获取页面内容...');
  const articleText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('页面内容:', articleText.substring(0, 500));

  await browser.close();

  console.log('4. 调用 MiniMax API...');
  try {
    const completion = await openai.chat.completions.create({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'user', content: `提取科技新闻标题，返回前5条，每条一行，格式：1. 标题内容\n\n页面内容：\n${articleText.substring(0, 5000)}` }
      ],
      max_tokens: 1000
    });
    console.log('API 返回:', completion.choices[0]?.message?.content);
  } catch (e) {
    console.error('API 错误:', e.message);
  }
}

test().catch(console.error);
