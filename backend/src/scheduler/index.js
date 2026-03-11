import cron from 'node-cron';
import config from '../config.js';
import { sendToFeishu } from '../feishu/index.js';
import { saveNews } from '../storage/index.js';

export function startScheduler() {
  cron.schedule(config.schedule, async () => {
    console.log('开始执行定时抓取任务...');
    await runCrawl();
  });
  console.log(`定时任务已启动: ${config.schedule}`);
}

export async function runCrawl() {
  try {
    const { crawlAll } = await import('../crawler/index.js');
    const result = await crawlAll();
    const today = new Date().toISOString().split('T')[0];

    // 保存文章和分析结果
    saveNews(today, result.articles, result.analysis);

    // 推送到飞书（只推送文章标题）
    await sendToFeishu(result.articles);

    console.log(`抓取完成，共 ${result.articles.length} 条资讯`);
  } catch (error) {
    console.error('抓取任务失败:', error.message);
  }
}
