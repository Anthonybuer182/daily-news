import cron from 'node-cron';
import config from '../config.js';
import { sendToFeishu } from '../feishu/index.js';
import { saveNews, getEnabledSources } from '../storage/index.js';

export function startScheduler() {
  cron.schedule(config.schedule, async () => {
    console.log('开始执行定时抓取任务...');
    await runCrawl();
  });
  console.log(`定时任务已启动: ${config.schedule}`);
}

export async function runCrawl() {
  try {
    // 检查是否配置了数据库数据源
    const dbSources = getEnabledSources();
    const hasDbSources = dbSources && dbSources.length > 0;

    if (hasDbSources) {
      // 使用新的配置驱动引擎
      console.log('使用数据库配置的数据源进行抓取');
      const { crawlAllSources } = await import('../engine/index.js');
      const result = await crawlAllSources();
      const today = new Date().toISOString().split('T')[0];

      // 保存文章
      saveNews(today, result.articles);

      // 推送到飞书
      await sendToFeishu(result.articles);

      console.log(`抓取完成，共 ${result.articles.length} 条资讯`);
    } else {
      // 使用旧的配置文件方式（向后兼容）
      console.log('使用配置文件的数据源进行抓取');
      const { crawlAll } = await import('../crawler/index.js');
      const result = await crawlAll();
      const today = new Date().toISOString().split('T')[0];

      // 保存文章和分析结果
      saveNews(today, result.articles, result.analysis);

      // 推送到飞书（只推送文章标题）
      await sendToFeishu(result.articles);

      console.log(`抓取完成，共 ${result.articles.length} 条资讯`);
    }
  } catch (error) {
    console.error('抓取任务失败:', error.message);
  }
}
