import React from 'react';
import { FaMagic } from 'react-icons/fa';
import { splitHighlightTokens } from '../../logic/storyView';
import logger from '../../logic/logger';

/**
 * 「長文」タブ。学習した単語で作った月1本のストーリーを出す。
 *
 * StudentDashboard から切り出した。データの取得と生成は親が持ち、
 * ここは表示だけを受け持つ。
 */
/**
 * 復習単語をハイライトする。生成物のHTMLを実行しないよう、
 * 区間に分けて React の <mark> として組み立てる（計画書12.4）。
 */
const highlightReviewWords = (text, usedWords) => {
  const tokens = splitHighlightTokens(text, usedWords);
  if (tokens.length === 0) return null;
  return (
    <>
      {tokens.map((token, index) =>
        token.highlight
          ? <mark key={index} className="story-highlight">{token.text}</mark>
          : <React.Fragment key={index}>{token.text}</React.Fragment>
      )}
    </>
  );
};

export default function StoryPanel({
  monthlyStory,
  pastStories,
  storiesLoading,
  isGeneratingStory,
  storyError,
  onGenerate,
}) {
  return (
    <div className="story-tab-content">
      <div className="section-card">
        <h2 className="section-title">君が世界で最も嫌いな長文</h2>
        <p className="section-description">英文とその和訳を交互に表示する長文学習機能です。</p>
              
              {storyError && !isGeneratingStory && (
          <p className="message-box message-box-error" role="alert">{storyError}</p>
        )}
        {storiesLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>長文データを読み込み中...</p>
          </div>
        ) : isGeneratingStory ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>長文を生成しています...</p>
          </div>
        ) : monthlyStory && monthlyStory.sentences && Array.isArray(monthlyStory.sentences) && monthlyStory.sentences.length > 0 ? (
          <div className="story-content">
            <div className="story-header">
              <h3>{monthlyStory.title || '長文'}</h3>
              <p className="story-date">
                {monthlyStory.createdAt ? 
                  (typeof monthlyStory.createdAt === 'object' && monthlyStory.createdAt.seconds ? 
                    new Date(monthlyStory.createdAt.seconds * 1000).toLocaleDateString('ja-JP') :
                    monthlyStory.createdAt.toString()
                  ) : ''
                }
              </p>
            </div>
            <div className="story-text">
              {monthlyStory.sentences.map((sentence, index) => (
                <div key={index} className="sentence-pair">
                  <div className="english-sentence">
                    {sentence.english ? highlightReviewWords(sentence.english, monthlyStory.usedWords || []) : ''}
                  </div>
                  <div className="japanese-sentence">{sentence.japanese || ''}</div>
                </div>
              ))}
            </div>
            
            {/* 使用できなかった復習単語の表示 */}
            {monthlyStory.unusedWords && monthlyStory.unusedWords.length > 0 && (
              <div className="unused-words-section" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#6c757d', fontSize: '0.9rem' }}>使用できなかった復習単語</h4>
                <div className="unused-words-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {monthlyStory.unusedWords.map((word, index) => (
                    <span key={index} className="unused-word-tag" style={{
                      backgroundColor: '#e9ecef',
                      color: '#6c757d',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      border: '1px solid #dee2e6'
                    }}>
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
                <button 
              className="story-generate-btn"
                  onClick={onGenerate} 
            >
              <FaMagic /> 新しい長文を生成
            </button>
            </div>
        ) : (
          <div className="no-story">
            <p>まだ長文が生成されていません。</p>
            <button 
                  className="story-generate-btn"
              onClick={onGenerate}
                >
              <FaMagic /> 長文を生成する
                </button>
              </div>
        )}
              
        {/* 過去の長文一覧 */}
        {logger.debug('長文タブ - pastStories:', pastStories, 'storiesLoading:', storiesLoading, 'pastStories.length:', pastStories.length)}
        {pastStories.length > 0 && (
          <div className="section-card" style={{ marginTop: '20px' }}>
            <h3 className="section-title">過去の長文一覧</h3>
              {storiesLoading ? (
              <div className="loading-container" style={{height: '50px'}}>
                <div className="loading-spinner"></div>
              </div>
            ) : (
                  <div className="past-stories-list">
                {pastStories.map(story => {
                  logger.debug('長文データ詳細:', story.id, story);
                  return (
                          <details key={story.id} className="past-story-item">
                      <summary style={{ 
                        padding: '1rem', 
                        backgroundColor: '#f8f9fa', 
                        cursor: 'pointer', 
                        fontWeight: '600',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        border: '1px solid #e9ecef'
                      }}>
                        {story.id} の長文 {story.sentences ? `(${story.sentences.length}文)` : '(文なし)'}
                      </summary>
                      <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '8px' }}>
                        <div className="story-text">
                          {story.sentences && story.sentences.length > 0 ? (
                            <>
                              {story.sentences.map((sentence, index) => (
                                <div key={index} className="sentence-pair">
                                  <div className="english-sentence">
                                    {sentence.english ? highlightReviewWords(sentence.english, story.usedWords || []) : ''}
                                  </div>
                                  <div className="japanese-sentence">{sentence.japanese || ''}</div>
                                </div>
                              ))}
                              
                              {/* 使用できなかった復習単語の表示 */}
                              {story.unusedWords && story.unusedWords.length > 0 && (
                                <div className="unused-words-section" style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                                  <h5 style={{ margin: '0 0 8px 0', color: '#6c757d', fontSize: '0.8rem' }}>使用できなかった復習単語</h5>
                                  <div className="unused-words-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {story.unusedWords.map((word, index) => (
                                      <span key={index} className="unused-word-tag" style={{
                                        backgroundColor: '#e9ecef',
                                        color: '#6c757d',
                                        padding: '3px 6px',
                                        borderRadius: '3px',
                                        fontSize: '0.75rem',
                                        border: '1px solid #dee2e6'
                                      }}>
                                        {word}
                                      </span>
                      ))}
                  </div>
                                </div>
                              )}
                </>
              ) : (
                            <p style={{ color: '#64748b', fontStyle: 'italic' }}>
                              この長文には文が含まれていません。
                </p>
              )}
            </div>
                      </div>
                          </details>
                  );
                })}
                  </div>
              )}
            </div>
        )}
        
        {/* 長文データが存在しない場合の表示 */}
        {!storiesLoading && pastStories.length === 0 && (
          <div className="section-card" style={{ marginTop: '20px' }}>
            <h3 className="section-title">過去の長文一覧</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
              過去に生成された長文はありません。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
