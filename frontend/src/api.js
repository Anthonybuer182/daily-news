const API_BASE = '/api';

export async function getNewsList() {
  const res = await fetch(`${API_BASE}/news`);
  return res.json();
}

export async function getNewsDetail(date) {
  const res = await fetch(`${API_BASE}/news/${date}`);
  if (!res.ok) return null;
  return res.json();
}

export async function searchNews(keyword, days, tag) {
  const params = new URLSearchParams();
  if (keyword) params.append('keyword', keyword);
  if (days) params.append('days', days);
  if (tag) params.append('tag', tag);
  
  const res = await fetch(`${API_BASE}/news/search?${params}`);
  return res.json();
}

export async function getTags() {
  const res = await fetch(`${API_BASE}/news/tags`);
  return res.json();
}

export async function triggerCrawl() {
  const res = await fetch(`${API_BASE}/crawl`, { method: 'POST' });
  return res.json();
}
