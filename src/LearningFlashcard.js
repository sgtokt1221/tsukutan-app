import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import { FaUndo, FaArrowLeft, FaBook, FaLayerGroup } from 'react-icons/fa';
import { initialize, speak } from './logic/speechUtils';

// 忘却曲線に基づき、単語の習熟度を更新するロジック
import { updateUserWordProgress } from './logic/reviewLogic';

// 配列をシャッフルするヘルパー関数
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export default function LearningFlashcard({ words, onBack, initialIndex = 0, sessionInfo, onSaveLog, onFirstCompletion }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [incorrectWords, setIncorrectWords] = useState([]);
  const [shuffledWords, setShuffledWords] = useState([]);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);
  const [viewMode, setViewMode] = useState('flashcard'); // 'flashcard' or 'wordbook'
  const [revealedCards, setRevealedCards] = useState(new Set()); // 赤シート機能で表示中のカード
  const [longPressCards, setLongPressCards] = useState(new Set()); // 長押し中のカード（復習モード用）
  const [wordbookProgress, setWordbookProgress] = useState(0); // 単語帳モードの進捗
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0); // スマホでのダブルタップ検出用
  
  const auth = getAuth();
  const sessionStartTime = useRef(new Date());

  // 音声合成の初期化
  useEffect(() => {
    initialize().catch(error => console.error("Speech initialization failed:", error));
  }, []);


  // 単語帳モードの進捗を保存・復元
  useEffect(() => {
    if (viewMode === 'wordbook' && shuffledWords.length > 0) {
      const progressKey = `wordbook_progress_${sessionInfo?.filterType || 'default'}_${sessionInfo?.filterValue || 'all'}`;
      const savedProgress = localStorage.getItem(progressKey);
      if (savedProgress) {
        const progress = parseInt(savedProgress);
        if (progress < shuffledWords.length) {
          setWordbookProgress(progress);
        }
      }
    }
  }, [viewMode, shuffledWords, sessionInfo]);


  // 赤シート機能のハンドラー
  const handleRevealStart = (cardIndex) => {
    setRevealedCards(prev => new Set([...prev, cardIndex]));
  };

  const handleRevealEnd = (cardIndex) => {
    setRevealedCards(prev => {
      const newSet = new Set(prev);
      newSet.delete(cardIndex);
      return newSet;
    });
  };

  // 復習モードかどうかを判定
  const isReviewMode = sessionInfo?.filterType === '復習単語';
  
  // デバッグ: 復習モード判定
  console.log('🔍 LearningFlashcard復習モード判定:', {
    sessionInfo,
    filterType: sessionInfo?.filterType,
    isReviewMode,
    viewMode
  });


  // 長押し状態の管理
  const handleLongPressStart = (cardIndex) => {
    setLongPressCards(prev => new Set([...prev, cardIndex]));
  };

  const handleLongPressEnd = (cardIndex) => {
    setLongPressCards(prev => {
      const newSet = new Set(prev);
      newSet.delete(cardIndex);
      return newSet;
    });
  };

  useEffect(() => {
    console.log('LearningFlashcard words受信:', {
      wordsLength: words?.length,
      sessionInfo: !!sessionInfo,
      sampleWords: words?.slice(0, 3)?.map(w => ({ word: w.word, level: w.level }))
    });
    

    // 自由学習モード（sessionInfoがある）の場合はシャッフルしない
    if (sessionInfo) {
      setShuffledWords(words);
    } else {
      setShuffledWords(shuffleArray(words));
    }
    
    // currentIndexをリセット
    setCurrentIndex(initialIndex);
    
    console.log('LearningFlashcard shuffledWords設定後:', {
      shuffledWordsLength: words?.length,
      sessionInfo: !!sessionInfo,
      initialIndex
    });
    
    sessionStartTime.current = new Date();
  }, [words, sessionInfo, initialIndex]);

  // shuffledWordsの状態変化を監視
  useEffect(() => {
    console.log('LearningFlashcard shuffledWords状態変化:', {
      shuffledWordsLength: shuffledWords?.length,
      currentIndex,
      currentWord: shuffledWords?.[currentIndex]?.word
    });
  }, [shuffledWords, currentIndex]);

  // initialIndexが変更された時にcurrentIndexを更新（無限ループを防ぐため、currentIndexを依存配列から除外）
  useEffect(() => {
    console.log('LearningFlashcard initialIndex変更:', {
      initialIndex: initialIndex,
      shuffledWordsLength: shuffledWords.length
    });
    setCurrentIndex(initialIndex);
  }, [initialIndex, shuffledWords.length]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#fecaca", "#ffffff", "#d9f99d"]);

  const currentWord = shuffledWords?.[currentIndex];

  const handleBackButtonClick = useCallback(() => {
    console.log('LearningFlashcard: 戻るボタンがクリックされました');
    
    const sessionEndTime = new Date();
    const sessionDuration = sessionEndTime - sessionStartTime.current;
    
    // セッション情報を保存（途中終了の場合）
    if (currentIndex < shuffledWords.length - 1 && sessionInfo && onSaveLog) {
      const sessionData = {
        ...sessionInfo,
        index: currentIndex,
        timestamp: new Date(),
        duration: sessionDuration
      };
      onSaveLog(sessionData);
    }
    
    // 親コンポーネントの戻る処理を呼び出し
    onBack(incorrectWords);
  }, [currentIndex, shuffledWords, sessionInfo, onSaveLog, incorrectWords, onBack]);


  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    }
  }, [currentIndex, x, y]);

  // 正解・不正解処理関数
  const handleCorrect = useCallback(() => {
    const currentWord = shuffledWords?.[currentIndex];
    const user = auth.currentUser;
    
    if (user && currentWord) {
      updateUserWordProgress(user.uid, currentWord, true);
    }
    
    // 次の単語へ
    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    } else {
      // 最後の単語に到達
      if (!hasCompletedOnce && onFirstCompletion) {
        onFirstCompletion();
        setHasCompletedOnce(true);
      }
      
      // セッション情報を保存（完了時）
      const sessionEndTime = new Date();
      const sessionDuration = sessionEndTime - sessionStartTime.current;
      
      if (sessionInfo && onSaveLog) {
        const sessionData = {
          ...sessionInfo,
          index: currentIndex,
          timestamp: new Date(),
          duration: sessionDuration
        };
        onSaveLog(sessionData);
      }
      
      // 親コンポーネントの戻る処理を呼び出し
      onBack(incorrectWords);
    }
  }, [currentIndex, shuffledWords, x, y, hasCompletedOnce, onFirstCompletion, sessionInfo, onSaveLog, incorrectWords, onBack, auth.currentUser]);

  const handleIncorrect = useCallback(() => {
    const currentWord = shuffledWords?.[currentIndex];
    const user = auth.currentUser;
    
    // 不正解の場合、復習リストに追加
    if (currentWord) {
      if (user) {
        updateUserWordProgress(user.uid, currentWord, false);
      }
      setIncorrectWords(prev => [...prev.filter(w => w.id !== currentWord.id), currentWord]);
    }
    
    // 次の単語へ
    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    } else {
      // 最後の単語に到達
      if (!hasCompletedOnce && onFirstCompletion) {
        onFirstCompletion();
        setHasCompletedOnce(true);
      }
      
      // セッション情報を保存（完了時）
      const sessionEndTime = new Date();
      const sessionDuration = sessionEndTime - sessionStartTime.current;
      
      if (sessionInfo && onSaveLog) {
        const sessionData = {
          ...sessionInfo,
          index: currentIndex,
          timestamp: new Date(),
          duration: sessionDuration
        };
        onSaveLog(sessionData);
      }
      
      // 親コンポーネントの戻る処理を呼び出し
      onBack(incorrectWords);
    }
  }, [currentIndex, shuffledWords, x, y, hasCompletedOnce, onFirstCompletion, sessionInfo, onSaveLog, incorrectWords, onBack, auth.currentUser]);

  // ネイティブドラッグイベントハンドラー
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    console.log('🔥 Mouse down:', { x: e.clientX, y: e.clientY });
    
    // 単語帳モードの場合、カードの位置をリセット
    if (viewMode === 'wordbook' && e.currentTarget) {
      e.currentTarget.style.transform = 'translate(0px, 0px)';
    }
  }, [viewMode]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    console.log('🔥 Mouse move:', { deltaX, deltaY });
    
    if (viewMode === 'flashcard') {
      // フラッシュカードモードの場合、motion valueを使用
      x.set(deltaX);
      y.set(deltaY);
      
      // フラッシュカードの背景色を変更
      const flashcard = document.getElementById('flashcard');
      if (flashcard) {
        let backgroundColor = 'white';
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > 30) {
            backgroundColor = "#4ade80"; // Green for right swipe
          } else if (deltaX < -30) {
            backgroundColor = "#ef4444"; // Red for left swipe
          }
        }
        flashcard.style.setProperty('background-color', backgroundColor, 'important');
      }
    } else if (viewMode === 'wordbook') {
      // 単語帳モードの場合、直接DOM操作でカードの位置を更新
      // 現在ドラッグ中のカードを特定
      const allCards = document.querySelectorAll('[data-card-index]');
      let activeCard = null;
      
      // ドラッグ開始位置に最も近いカードを特定
      for (let card of allCards) {
        const rect = card.getBoundingClientRect();
        if (dragStart.x >= rect.left && dragStart.x <= rect.right &&
            dragStart.y >= rect.top && dragStart.y <= rect.bottom) {
          activeCard = card;
          break;
        }
      }
      
      // カードが見つからない場合、最初のカードを使用
      if (!activeCard && allCards.length > 0) {
        activeCard = allCards[0];
      }
      
      if (activeCard) {
        // 単語帳モードでは左右スワイプで評価、上下スワイプで削除
        let limitedDeltaX = 0;
        let limitedDeltaY = 0;
        
        console.log('🔥 LearningFlashcard Wordbook mode movement:', { deltaX, deltaY, absDeltaX: Math.abs(deltaX), absDeltaY: Math.abs(deltaY) });
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // 左右スワイプ（評価）の場合
          limitedDeltaX = Math.max(-150, Math.min(150, deltaX));
          console.log('🔥 LearningFlashcard Allowing horizontal movement for evaluation:', limitedDeltaX);
        } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
          // 上下スワイプ（削除）の場合
          limitedDeltaY = Math.max(-150, Math.min(150, deltaY));
          console.log('🔥 LearningFlashcard Allowing vertical movement for deletion:', limitedDeltaY);
        }
        
        activeCard.style.transform = `translate(${limitedDeltaX}px, ${limitedDeltaY}px)`;
        
        // 単語帳モードでの視覚的フィードバック
        let cardBackgroundColor = 'white';
        let boxShadow = 'none';
        
        if (limitedDeltaY < -15) {
          cardBackgroundColor = "#facc15"; // Yellow for swipe up (deletion)
          boxShadow = '0 4px 12px rgba(250, 204, 21, 0.3)';
          console.log('🔥 LearningFlashcard Yellow highlight for upward swipe (deletion)');
        } else if (limitedDeltaX > 30) {
          cardBackgroundColor = "#4ade80"; // Green for right swipe (correct)
          boxShadow = '0 4px 12px rgba(74, 222, 128, 0.3)';
          console.log('🔥 LearningFlashcard Green highlight for right swipe (correct)');
        } else if (limitedDeltaX < -30) {
          cardBackgroundColor = "#ef4444"; // Red for left swipe (incorrect)
          boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
          console.log('🔥 LearningFlashcard Red highlight for left swipe (incorrect)');
        }
        
        activeCard.style.setProperty('background-color', cardBackgroundColor, 'important');
        activeCard.style.setProperty('box-shadow', boxShadow, 'important');
      }
    }
  }, [isDragging, dragStart, x, y, viewMode]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsDragging(false);
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    console.log('🔥 Mouse up:', { deltaX, deltaY });
    
    // カードの色をリセット
    const flashcard = document.getElementById('flashcard');
    if (flashcard) {
      flashcard.style.setProperty('background-color', 'white', 'important');
    }
    
    // スワイプ判定
    const threshold = 100;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        // 右スワイプ（正解）
        handleCorrect();
      } else {
        // 左スワイプ（不正解）
        handleIncorrect();
      }
    }
    
    setDragStart({ x: 0, y: 0 });
    
    if (viewMode === 'flashcard') {
      // フラッシュカードモードの場合、motion valueをリセット
      x.set(0);
      y.set(0);
    } else if (viewMode === 'wordbook') {
      // 単語帳モードの場合、カードの位置をリセット
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      // スワイプ判定
      const threshold = 50;
      const isSwipe = Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;
      
      // 現在ドラッグ中のカードを特定
      const allCards = document.querySelectorAll('[data-card-index]');
      let activeCard = null;
      
      // ドラッグ開始位置に最も近いカードを特定
      for (let card of allCards) {
        const rect = card.getBoundingClientRect();
        if (dragStart.x >= rect.left && dragStart.x <= rect.right &&
            dragStart.y >= rect.top && dragStart.y <= rect.bottom) {
          activeCard = card;
          break;
        }
      }
      
      if (activeCard) {
        if (isSwipe) {
          // スワイプが完了した場合、カードを画面外に移動
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 左右スワイプ
            const direction = deltaX > 0 ? 300 : -300;
            activeCard.style.transform = `translate(${direction}px, 0px)`;
            activeCard.style.opacity = '0';
          } else {
            // 上下スワイプ（上スワイプの場合のみ処理）
            if (deltaY < -15) { // 上スワイプ（負の値）
              activeCard.style.transform = `translate(0px, -300px)`;
              activeCard.style.opacity = '0';
            }
          }
          
          // アニメーション後にカードを非表示にして次のカードに進む
          setTimeout(() => {
            activeCard.style.display = 'none';
            // 次のカードに進む
            setWordbookProgress(prev => prev + 1);
          }, 300);
        } else {
          // スワイプが不十分な場合、元の位置に戻す
          activeCard.style.transform = 'translate(0px, 0px)';
          activeCard.style.setProperty('background-color', 'white', 'important');
          activeCard.style.setProperty('box-shadow', 'none', 'important');
        }
      }
    }
  }, [isDragging, dragStart, x, y, viewMode, handleCorrect, handleIncorrect]);

  // グローバルマウスイベントリスナーを設定
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        handleMouseMove(e);
      }
    };

    const handleGlobalMouseUp = (e) => {
      if (isDragging) {
        handleMouseUp(e);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleDoubleClick = useCallback(() => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && shuffledWords.length > 0 && shuffledWords[currentIndex]) {
      const wordToSpeak = shuffledWords[currentIndex]?.word;
      if (wordToSpeak) {
        speak(wordToSpeak);
      }
    }
  }, [isFlipped, currentIndex, shuffledWords]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // マルチタッチの場合は無視
    if (e.touches.length > 1) {
      console.log('🔥 LearningFlashcard Multi-touch detected, ignoring');
      return;
    }
    
    // ダブルタップ検出（スマホ用）
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 500 && tapLength > 0) {
      console.log('🔥 Double tap detected on mobile!');
      handleDoubleClick(e);
      setLastTap(0);
      return;
    }
    setLastTap(currentTime);
    
    setIsDragging(true);
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX, y: touch.clientY });
    console.log('🔥 LearningFlashcard Touch start:', { 
      x: touch.clientX, 
      y: touch.clientY,
      target: e.target.tagName,
      viewMode 
    });
  }, [lastTap, handleDoubleClick, viewMode]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    
    const deltaX = touch.clientX - dragStart.x;
    const deltaY = touch.clientY - dragStart.y;
    
    console.log('🔥 Touch move:', { deltaX, deltaY, viewMode });
    
    if (viewMode === 'flashcard') {
      console.log('🔥 LearningFlashcard Touch move in flashcard mode:', { deltaX, deltaY });
      // motion valueを更新
      x.set(deltaX);
      y.set(deltaY);
      console.log('🔥 LearningFlashcard Motion values updated:', { xValue: x.get(), yValue: y.get() });
      
      // フラッシュカードの背景色を変更
      const flashcard = document.getElementById('flashcard');
      if (flashcard) {
        let backgroundColor = 'white';
        let boxShadow = 'none';
        
        if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -15) {
          backgroundColor = "#facc15"; // Yellow for swipe up
          boxShadow = '0 4px 12px rgba(250, 204, 21, 0.3)';
        } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > 30) {
            backgroundColor = "#4ade80"; // Green for right swipe
            boxShadow = '0 4px 12px rgba(74, 222, 128, 0.3)';
          } else if (deltaX < -30) {
            backgroundColor = "#ef4444"; // Red for left swipe
            boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
          }
        }
        
        flashcard.style.setProperty('background-color', backgroundColor, 'important');
        flashcard.style.setProperty('box-shadow', boxShadow, 'important');
      }
    } else if (viewMode === 'wordbook') {
      // 単語帳モードでは上下の動きのみ許可（左右は固定）
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        let backgroundColor = 'white';
        if (deltaY < -15) {
          backgroundColor = "#facc15"; // Yellow for swipe up
        }
        
        if (e.currentTarget) {
          e.currentTarget.style.setProperty('background-color', backgroundColor, 'important');
          e.currentTarget.style.setProperty('box-shadow', deltaY < -15 ? '0 4px 12px rgba(250, 204, 21, 0.3)' : 'none', 'important');
        }
      }
    }
  }, [isDragging, dragStart, viewMode, x, y]);

  const handleTouchEnd = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - dragStart.x;
    const deltaY = touch.clientY - dragStart.y;
    
    console.log('🔥 Touch end:', { deltaX, deltaY });
    
    // カードの色をリセット
    if (e.currentTarget) {
      e.currentTarget.style.setProperty('background-color', 'white', 'important');
    }
    
    // スワイプ判定
    const threshold = 100;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        // 右スワイプ（正解）
        handleCorrect();
      } else {
        // 左スワイプ（不正解）
        handleIncorrect();
      }
    }
    
    setDragStart({ x: 0, y: 0 });
    
    if (viewMode === 'flashcard') {
      // フラッシュカードモードの場合、motion valueをリセット
      x.set(0);
      y.set(0);
    } else if (viewMode === 'wordbook') {
      // 単語帳モードの場合、カードの位置をリセット
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      // スワイプ判定
      const threshold = 50;
      const isSwipe = Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;
      
      // 現在ドラッグ中のカードを特定
      const allCards = document.querySelectorAll('[data-card-index]');
      let activeCard = null;
      
      // ドラッグ開始位置に最も近いカードを特定
      for (let card of allCards) {
        const rect = card.getBoundingClientRect();
        if (dragStart.x >= rect.left && dragStart.x <= rect.right &&
            dragStart.y >= rect.top && dragStart.y <= rect.bottom) {
          activeCard = card;
          break;
        }
      }
      
      if (activeCard) {
        if (isSwipe) {
          // スワイプが完了した場合、カードを画面外に移動
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 左右スワイプ
            const direction = deltaX > 0 ? 300 : -300;
            activeCard.style.transform = `translate(${direction}px, 0px)`;
            activeCard.style.opacity = '0';
          } else {
            // 上下スワイプ（上スワイプの場合のみ処理）
            if (deltaY < -15) { // 上スワイプ（負の値）
              activeCard.style.transform = `translate(0px, -300px)`;
              activeCard.style.opacity = '0';
            }
          }
          
          // アニメーション後にカードを非表示にして次のカードに進む
          setTimeout(() => {
            activeCard.style.display = 'none';
            // 次のカードに進む
            setWordbookProgress(prev => prev + 1);
          }, 300);
        } else {
          // スワイプが不十分な場合、元の位置に戻す
          activeCard.style.transform = 'translate(0px, 0px)';
          activeCard.style.setProperty('background-color', 'white', 'important');
          activeCard.style.setProperty('box-shadow', 'none', 'important');
        }
      }
    }
  }, [isDragging, dragStart, x, y, viewMode, handleCorrect, handleIncorrect]);

  // スマホでのタッチイベント処理を改善（単語帳モードのみ）
  useEffect(() => {
    const handleTouchStartPassive = (e) => {
      // 単語帳モードのカード要素内でのタッチのみ処理
      if (viewMode === 'wordbook' && e.target.closest('[data-card-index]')) {
        handleTouchStart(e);
      }
    };

    const handleTouchMovePassive = (e) => {
      if (isDragging && viewMode === 'wordbook') {
        handleTouchMove(e);
      }
    };

    const handleTouchEndPassive = (e) => {
      if (isDragging && viewMode === 'wordbook') {
        handleTouchEnd(e);
      }
    };

    // 単語帳モードの場合のみ直接イベントリスナーを使用
    if (viewMode === 'wordbook') {
      document.addEventListener('touchstart', handleTouchStartPassive, { passive: false });
      document.addEventListener('touchmove', handleTouchMovePassive, { passive: false });
      document.addEventListener('touchend', handleTouchEndPassive, { passive: false });
      document.addEventListener('touchcancel', handleTouchEndPassive, { passive: false });
    }

    return () => {
      document.removeEventListener('touchstart', handleTouchStartPassive);
      document.removeEventListener('touchmove', handleTouchMovePassive);
      document.removeEventListener('touchend', handleTouchEndPassive);
      document.removeEventListener('touchcancel', handleTouchEndPassive);
    };
  }, [isDragging, handleTouchStart, handleTouchMove, handleTouchEnd, viewMode]);

  if (!shuffledWords || shuffledWords.length === 0 || currentIndex >= shuffledWords.length || currentIndex < 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
        <div className="test-header">
          <h3>新規学習</h3>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>学習する単語がありません。</p>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <button onClick={handleBackButtonClick} style={{
            padding: '12px 24px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer'
          }}>
            <FaArrowLeft /> 前の画面に戻る
          </button>
        </div>
      </div>
    );
  }

  // リアル単語帳モードのレンダリング
  const renderWordbookMode = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#f8fafc',
      overflow: 'auto'
    }}>
      {/* ページトップ用のアンカー */}
      <div id="page-top" style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px' }}></div>
      {/* ヘッダー */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '16px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#1f2937'
          }}>
            リアル単語帳モード ({shuffledWords.length}語)
          </h2>
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            {isReviewMode ? 
              '📖 右側を長押し → 上スワイプで復習完了 🎯' : 
              '📖 右側を長押しで答えを表示 | 👆 右スワイプ=正解 / 左スワイプ=不正解'
            }
          </p>
          <div style={{
            margin: '8px 0 0 0',
            fontSize: '0.75rem',
            color: '#10b981',
            fontWeight: '600'
          }}>
            進捗: {wordbookProgress} / {shuffledWords.length} 語
            {wordbookProgress > 0 && (
              <span style={{ marginLeft: '8px' }}>
                ({Math.round((wordbookProgress / shuffledWords.length) * 100)}%)
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setViewMode('flashcard')}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FaLayerGroup /> フラッシュカード
          </button>
          <button
            onClick={handleBackButtonClick}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FaArrowLeft /> 戻る
          </button>
        </div>
      </div>

      {/* 単語帳コンテンツ */}
      <div style={{
        flex: 1,
        padding: '20px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
        minHeight: 'calc(100vh - 200px)'
      }}>
        <div style={{
          display: 'grid',
          gap: '16px'
        }}>
          {shuffledWords.slice(wordbookProgress).map((word, index) => {
            const actualIndex = wordbookProgress + index;
            return (
            <motion.div
              key={actualIndex}
              data-card-index={actualIndex}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                position: 'relative',
                cursor: 'grab',
                transition: 'transform 0.1s ease-out, background-color 0.2s ease-out',
                touchAction: 'none' // ブラウザのデフォルトタッチ動作を無効化
              }}
            >
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  minHeight: window.innerWidth <= 768 ? '80px' : '120px' // スマホでは高さを小さく
                }}>
                {/* 左側：英単語 */}
                <div style={{
                  padding: window.innerWidth <= 768 ? '12px' : '24px', // スマホではパディングを小さく
                  borderRight: '1px solid #e5e7eb',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  backgroundColor: '#fafafa'
                }}>
                  <div style={{
                    fontSize: window.innerWidth <= 768 ? '1.5rem' : '2rem', // スマホではフォントサイズを小さく
                    fontWeight: 'bold',
                    color: '#1f2937',
                    marginBottom: '8px',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  onClick={() => speak(word.word)}
                  >
                    {word.word}
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    [{word.pronunciation || ''}]
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    marginTop: '4px'
                  }}>
                    {index + 1} / {shuffledWords.length}
                  </div>
                </div>

                {/* 右側：和訳・例文（赤シート機能付き + 復習モード長押し機能） */}
                <div 
                  style={{
                    padding: window.innerWidth <= 768 ? '12px' : '24px', // スマホではパディングを小さく
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: isReviewMode && longPressCards.has(actualIndex) ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                  }}
                  onMouseDown={() => {
                    if (isReviewMode) {
                      handleLongPressStart(actualIndex);
                    } else {
                      handleRevealStart(actualIndex);
                    }
                  }}
                  onMouseUp={() => {
                    if (isReviewMode) {
                      handleLongPressEnd(actualIndex);
                    } else {
                      handleRevealEnd(actualIndex);
                    }
                  }}
                  onMouseLeave={() => {
                    if (isReviewMode) {
                      handleLongPressEnd(actualIndex);
                    } else {
                      handleRevealEnd(actualIndex);
                    }
                  }}
                  onTouchStart={() => {
                    if (isReviewMode) {
                      handleLongPressStart(actualIndex);
                    } else {
                      handleRevealStart(actualIndex);
                    }
                  }}
                  onTouchEnd={() => {
                    if (isReviewMode) {
                      handleLongPressEnd(actualIndex);
                    } else {
                      handleRevealEnd(actualIndex);
                    }
                  }}
                >
                  {/* 赤シートオーバーレイ（通常モード）または復習モード指示 */}
                  {!isReviewMode && !revealedCards.has(actualIndex) && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(220, 38, 38, 0.8)', // 赤シート色
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '0 12px 12px 0',
                      zIndex: 1
                    }}>
                      <div style={{
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: '500',
                        textAlign: 'center',
                        padding: '8px'
                      }}>
                        📖 長押しで答えを表示
                      </div>
                    </div>
                  )}
                  
                  {/* 復習モード用オーバーレイ */}
                  {isReviewMode && longPressCards.has(actualIndex) && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(245, 158, 11, 0.8)', // 黄色オーバーレイ
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '0 12px 12px 0',
                      zIndex: 1
                    }}>
                      <div style={{
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: '500',
                        textAlign: 'center',
                        padding: '8px'
                      }}>
                        🎯 上にスワイプで復習完了
                      </div>
                    </div>
                  )}
                  
                  {/* 実際のコンテンツ */}
                  <div style={{
                    opacity: revealedCards.has(index) ? 1 : 0.3,
                    transition: 'opacity 0.2s ease'
                  }}>
                    <div style={{
                      fontSize: window.innerWidth <= 768 ? '1rem' : '1.25rem', // スマホではフォントサイズを小さく
                      fontWeight: '600',
                      color: '#1f2937',
                      marginBottom: window.innerWidth <= 768 ? '8px' : '16px', // スマホではマージンを小さく
                      lineHeight: '1.4'
                    }}>
                      {word.meaning}
                    </div>
                    
                    {word.example && (
                      <div style={{
                        marginBottom: '8px'
                      }}>
                        <div style={{
                          fontSize: '0.95rem',
                          color: '#4b5563',
                          fontStyle: 'italic',
                          marginBottom: '4px',
                          lineHeight: '1.4'
                        }}>
                          {word.example}
                        </div>
                        {word.exampleTranslation && (
                          <div style={{
                            fontSize: '0.875rem',
                            color: '#6b7280',
                            lineHeight: '1.4'
                          }}>
                            {word.exampleTranslation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
          })}
        </div>
      </div>

      {/* 上に戻るボタン */}
      <div style={{
        position: 'fixed',
        bottom: '100px',
        right: '20px',
        zIndex: 1000
      }}>
        <button
          onClick={() => {
            console.log('上に戻るボタンがクリックされました');
            
            // 単語帳モードのコンテナ要素を取得
            const wordbookContainer = document.querySelector('[style*="height: 100vh"][style*="overflow: auto"]');
            console.log('単語帳コンテナ:', wordbookContainer);
            
            if (wordbookContainer) {
              console.log('コンテナのスクロール位置:', wordbookContainer.scrollTop);
              
              // コンテナ要素にスクロール
              wordbookContainer.scrollTo({ top: 0, behavior: 'smooth' });
              
              // フォールバック
              setTimeout(() => {
                wordbookContainer.scrollTop = 0;
                console.log('フォールバック後の位置:', wordbookContainer.scrollTop);
              }, 100);
            } else {
              // フォールバック: ウィンドウスクロール
              console.log('ウィンドウスクロール実行');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = '#2563eb';
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = '#3b82f6';
            e.target.style.transform = 'translateY(0px)';
            e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );

  // モードに応じてレンダリング
  if (viewMode === 'wordbook') {
    return renderWordbookMode();
  }

  // デバッグ: フラッシュカードモードのレンダリング
  console.log('🎴 フラッシュカードモードレンダリング:', {
    isReviewMode,
    sessionInfo: sessionInfo?.filterType,
    ボタン表示予定: true
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* モード切り替えボタン */}
      <div style={{
        position: 'fixed',
        top: '120px',
        right: '20px',
        zIndex: 99999
      }}>
        <button
          onClick={() => setViewMode('wordbook')}
          style={{
            padding: '10px 18px',
            backgroundColor: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
            transition: 'all 0.2s ease',
            fontWeight: '600'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = '#d97706';
            e.target.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = '#f59e0b';
            e.target.style.transform = 'translateY(0px)';
          }}
        >
          <FaBook /> 単語帳モード
        </button>
      </div>

      <div className="test-header">
        <h3>{isReviewMode ? '復習単語' : '新規学習'}</h3>
      </div>
      
      <div id="flashcard-container">
        <motion.div
          key={currentIndex}
          id="flashcard"
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.7}
          dragMomentum={false}
          style={{ 
            x, 
            y, 
            rotate, 
            backgroundColor: cardColor,
            rotateY: isFlipped ? 180 : 0,
            transition: { duration: 0.4 }
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
          <div className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
            <p id="card-front-text">{currentWord?.word || 'Loading...'}</p>
          </div>
          <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord?.word || 'Loading...'}</h3>
            <p id="card-back-meaning">{currentWord?.japanese || currentWord?.meaning || 'Loading...'}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example || ''}</p>
            <p className="example-text-ja">{currentWord?.exampleJa || ''}</p>
          </div>
        </motion.div>
      </div>
      
      {/* プログレスバー */}
      <div style={{ 
        margin: '20px auto', 
        maxWidth: '90vw',
        padding: '0 20px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '10px'
        }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
            {currentIndex + 1} / {shuffledWords.length}
          </span>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
            新規学習
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#e5e7eb',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${((currentIndex + 1) / shuffledWords.length) * 100}%`,
            height: '100%',
            backgroundColor: '#3b82f6',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* ナビゲーションボタン */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0 20px',
        marginTop: '20px',
        gap: '15px'
      }}>
        <button 
          onClick={handlePrev} 
          disabled={currentIndex === 0}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: currentIndex === 0 ? '#f3f4f6' : '#6b7280',
            color: currentIndex === 0 ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => {
            if (currentIndex > 0) {
              e.target.style.backgroundColor = '#4b5563';
            }
          }}
          onMouseOut={(e) => {
            if (currentIndex > 0) {
              e.target.style.backgroundColor = '#6b7280';
            }
          }}
        >
          <FaUndo /> 前の単語
        </button>
        
        <button 
          onClick={handleBackButtonClick}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = '#b91c1c';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = '#dc2626';
          }}
        >
          <FaArrowLeft /> 前の画面に戻る
        </button>
      </div>
    </div>
  );
}

