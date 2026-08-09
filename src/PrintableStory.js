import React from 'react';

function PrintableStory({ story, studentName, onCancel }) {
  if (!story) return null;

  const formatDate = (timestamp) => {
    if (!timestamp) return '日付不明';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay printable-story-overlay">
      <div className="modal-content printable-story-modal">
        <div className="printable-story-header">
          <h3>{studentName} の長文作品</h3>
          <div className="story-actions">
            <button onClick={handlePrint} className="print-btn">印刷</button>
            <button onClick={onCancel} className="cancel-btn">閉じる</button>
          </div>
        </div>
        
        <div className="printable-story-content">
          <div className="story-meta">
            <p><strong>作成日:</strong> {formatDate(story.createdAt)}</p>
            <p><strong>タイトル:</strong> {story.title || 'タイトルなし'}</p>
          </div>
          
          <div className="story-text">
            <h4>英文</h4>
            <div className="english-text">
              {story.english && story.english.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            
            <h4>日本語訳</h4>
            <div className="japanese-text">
              {story.japanese && story.japanese.split('\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </div>
          
          {story.sentences && story.sentences.length > 0 && (
            <div className="story-sentences">
              <h4>一文ずつ表示</h4>
              <div className="sentence-pairs">
                {story.sentences.map((sentence, index) => (
                  <div key={index} className="sentence-pair">
                    <div className="english-sentence">
                      <strong>{index + 1}.</strong> {sentence.english}
                    </div>
                    <div className="japanese-sentence">
                      {sentence.japanese}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {story.reviewWords && story.reviewWords.length > 0 && (
            <div className="story-vocabulary">
              <h4>使用した復習単語</h4>
              <div className="vocabulary-list">
                {story.reviewWords.map((word, index) => (
                  <span key={index} className="vocabulary-item">
                    <strong>{word.word}</strong>: {word.meaning}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {story.unusedWords && story.unusedWords.length > 0 && (
            <div className="story-unused-vocabulary">
              <h4>未使用の復習単語</h4>
              <div className="vocabulary-list">
                {story.unusedWords.map((word, index) => (
                  <span key={index} className="vocabulary-item unused">
                    <strong>{word.word}</strong>: {word.meaning}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PrintableStory;
