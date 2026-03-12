import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

function ArticleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArticle() {
      try {
        const res = await fetch(`/api/article/${id}`);
        if (res.ok) {
          const data = await res.json();
          setArticle(data);
        }
      } catch (error) {
        console.error('获取文章失败:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchArticle();
  }, [id]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleOpenOriginal = () => {
    if (article?.sourceLink) {
      window.open(article.sourceLink, '_blank');
    }
  };

  // 判断是否为本地文件链接 (/articles/xxx.html)
  const isLocalFile = article?.url?.startsWith('/articles/');

  if (loading) {
    return (
      <div className="article-detail">
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="article-detail">
        <div className="empty-state">
          <h3>文章不存在</h3>
          <button className="back-btn" onClick={handleBack}>返回</button>
        </div>
      </div>
    );
  }

  return (
    <div className="article-detail">
      <header className="article-detail-header">
        <button className="back-btn" onClick={handleBack}>
          ← 返回
        </button>
        <div className="header-buttons">
          {isLocalFile && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="original-link-btn"
              style={{ textDecoration: 'none' }}
            >
              新窗口打开
            </a>
          )}
          {article.sourceLink && (
            <button className="original-link-btn" onClick={handleOpenOriginal}>
              查看原文
            </button>
          )}
        </div>
      </header>

      <article className="article-content">
        <h1 className="article-title">{article.title}</h1>

        <div className="article-meta">
          <span className="article-source">{article.source}</span>
          <span className="article-date">{article.date}</span>
        </div>

        {article.summary && (
          <div className="article-summary">
            <strong>摘要：</strong>{article.summary}
          </div>
        )}

        {isLocalFile ? (
          <div className="article-iframe-wrapper">
            <iframe
              src={article.url}
              title={article.title}
              className="article-iframe"
            />
          </div>
        ) : article.contentHtml ? (
          <div
            className="article-body"
            dangerouslySetInnerHTML={{ __html: article.contentHtml }}
          />
        ) : (
          <div className="no-content">
            <p>暂无详细内容</p>
            {article.sourceLink && (
              <button className="original-link-btn" onClick={handleOpenOriginal}>
                查看原文
              </button>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

export default ArticleDetail;
