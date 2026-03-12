import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchNews, getTags } from '../api';

const TAGS = ['科技', '车联网', 'IoT'];

function Home() {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [days, setDays] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  const DAYS = ['1', '3', '7', '14', '30'];

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await searchNews(keyword || null, days || null, selectedTag || null);
    setArticles(result.articles || []);
    setTotal(result.total || 0);
    setLoading(false);
  }, [keyword, days, selectedTag]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    getTags().then(result => {
      if (result.tags) {
        TAGS.length = 0;
        TAGS.push(...result.tags);
      }
    });
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData();
  };

  const handleArticleClick = (article) => {
    navigate(`/article/${article.id}`);
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return '今天';
    } else if (dateStr === yesterday.toISOString().split('T')[0]) {
      return '昨天';
    } else {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
  };

  const getSourceColor = (source) => {
    const colors = {
      '36Kr': { bg: '#FFE4E6', color: '#BE123C' },
      '新华网': { bg: '#DBEAFE', color: '#1E40AF' },
      'IoT商业新闻': { bg: '#D1FAE5', color: '#065F46' },
    };
    return colors[source] || { bg: '#F3F4F6', color: '#374151' };
  };

  return (
    <div className="search-page">
      <header className="search-header">
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-row">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="搜索关键词..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            
            <div className="result-count">
              <span className="count-number">{total}</span> 条资讯
            </div>
          </div>
          
          <div className="filter-row">
            <div className="filter-options">
              <button
                type="button"
                className={`filter-btn ${days === '' ? 'active' : ''}`}
                onClick={() => setDays('')}
              >
                全部
              </button>
              {DAYS.map(d => (
                <button
                  key={d}
                  type="button"
                  className={`filter-btn ${days === d ? 'active' : ''}`}
                  onClick={() => setDays(d)}
                >
                  {d} 天
                </button>
              ))}
            </div>
          </div>
          
          <div className="filter-row">
            <div className="filter-options">
              <button
                type="button"
                className={`filter-btn ${selectedTag === '' ? 'active' : ''}`}
                onClick={() => setSelectedTag('')}
              >
                全部
              </button>
              {TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`filter-btn ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </form>
      </header>

      <main className="search-results">
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : articles.length === 0 ? (
          <div className="empty-state">
            <h3>暂无搜索结果</h3>
            <p>试试调整搜索条件或清除筛选</p>
          </div>
        ) : (
          <ul className="article-list">
            {articles.map((article, i) => {
              const sourceStyle = getSourceColor(article.source);
              return (
                <li key={i} className="article-item" onClick={() => handleArticleClick(article)}>
                  <div className="article-meta">
                    <span
                      className="source-tag"
                      style={{ background: sourceStyle.bg, color: sourceStyle.color }}
                    >
                      {article.source}
                    </span>
                    <span className="article-date">{formatDate(article.date)}</span>
                  </div>
                  <h3 className="article-title">{article.title}</h3>
                  {article.tags && article.tags.length > 0 && (
                    <div className="article-tags">
                      {article.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default Home;
