import config from '../config.js';

export async function sendToFeishu(articles) {
  if (!config.feishuWebhook) {
    console.log('飞书 WebHook 未配置，跳过推送');
    return;
  }

  const message = buildMessage(articles);

  try {
    const response = await fetch(config.feishuWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    console.log('飞书推送成功');
  } catch (error) {
    console.error('飞书推送失败:', error.message);
  }
}

function buildMessage(articles) {
  const date = new Date().toLocaleDateString('zh-CN');
  const articleList = articles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');

  return {
    msg_type: 'text',
    content: {
      text: `📰 每日晨报 ${date}\n\n${articleList}\n\n查看详情: http://localhost:5173`
    }
  };
}
