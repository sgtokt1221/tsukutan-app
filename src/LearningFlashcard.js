import React, { useState, useEffect, useCallback, useRef } from 'react';
import AnswerControls from './components/learning/AnswerControls';
import PeekNudge from './components/learning/PeekNudge';
import SessionHeader from './components/learning/SessionHeader';
import ModeTabs from './components/learning/ModeTabs';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import { FaArrowUp, FaUndo, FaArrowLeft, FaPlay, FaStop } from 'react-icons/fa';
import { initialize, speak, speakWordThenMeaning } from './logic/speechUtils';

// 忘却曲線に基づき、単語の習熟度を更新するロジック
import { updateUserWordProgress } from './logic/reviewLogic';
import logger from './logic/logger';
import { usePronunciation } from './logic/usePronunciation';
import { useWordbookZoom } from './logic/useWordbookZoom';
import { useCardDirection } from './logic/useCardDirection';
import { useFitWordbookText } from './logic/useFitWordbookText';
import { useAutoPlay } from './logic/useAutoPlay';
import WordbookZoomSlider from './components/learning/WordbookZoomSlider';
import DirectionToggle from './components/learning/DirectionToggle';
import BookmarkButton from './components/learning/BookmarkButton';
import { useBookmarks } from './logic/useBookmarks';

// 配列をシャッフルするヘルパー関数
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export default function LearningFlashcard({
  words, onBack, initialIndex = 0, sessionInfo, onSaveLog, onFirstCompletion, title,
  // 日次学習のときだけ渡る。1語ずつ記録して、途中で閉じても再開できるようにする。
  onWordAnswered,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [incorrectWords, setIncorrectWords] = useState([]);
  const [shuffledWords, setShuffledWords] = useState([]);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);
  const [viewMode, setViewMode] = useState('flashcard'); // 'flashcard' or 'wordbook'
  const [revealedCards, setRevealedCards] = useState(new Set()); // 赤シート機能で表示中のカード
  const [longPressCards, setLongPressCards] = useState(new Set()); // 長押し中のカード（復習モード用）
  const [wordbookProgress, setWordbookProgress] = useState(0); // 単語帳モードの進捗
  // 文字サイズは復習カードと共有する
  const [wordbookZoom, setWordbookZoom] = useWordbookZoom();
  // 出題の向き（英→和 / 和→英）も復習カードと共有する
  const [direction, setDirection] = useCardDirection();
  const isJaToEn = direction === 'ja-en';
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
    if (revealedCards.has(cardIndex)) return;
    // 意味が見えるのと同時に読み上げる。
    // 「答えを見る」ボタンの onClick に置くと鳴らない。カード面の
    // onMouseDown が先に走ってボタンが外れ、click まで到達しないため。
    const word = shuffledWords[cardIndex];
    if (word) speakWordThenMeaning(word.word, word.meaning, direction);
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
  logger.debug('🔍 LearningFlashcard復習モード判定:', {
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
    logger.debug('LearningFlashcard words受信:', {
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
    
    logger.debug('LearningFlashcard shuffledWords設定後:', {
      shuffledWordsLength: words?.length,
      sessionInfo: !!sessionInfo,
      initialIndex
    });
    
    sessionStartTime.current = new Date();
  }, [words, sessionInfo, initialIndex]);

  // shuffledWordsの状態変化を監視
  useEffect(() => {
    logger.debug('LearningFlashcard shuffledWords状態変化:', {
      shuffledWordsLength: shuffledWords?.length,
      currentIndex,
      currentWord: shuffledWords?.[currentIndex]?.word
    });
  }, [shuffledWords, currentIndex]);

  // initialIndexが変更された時にcurrentIndexを更新（無限ループを防ぐため、currentIndexを依存配列から除外）
  useEffect(() => {
    logger.debug('LearningFlashcard initialIndex変更:', {
      initialIndex: initialIndex,
      shuffledWordsLength: shuffledWords.length
    });
    setCurrentIndex(initialIndex);
  }, [initialIndex, shuffledWords.length]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#fecaca", "#ffffff", "#d9f99d"]);

  // 単語の出どころ（マスター / Firestore / 復習の写し）によらず発音を出す
  const getPronunciation = usePronunciation();
  // 自動読み上げ。復習カードと同じ実装を共有する。
  const { autoPlay, start: startAutoPlay, stop: stopAutoPlay } = useAutoPlay({
    words: shuffledWords,
    currentIndex,
    direction,
    enabled: viewMode === 'flashcard',
    onRevealMeaning: () => setIsFlipped(true),
    onAdvance: (nextIndex) => {
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    },
  });
  // 毎日みたい単語の登録状態
  const { isBookmarked, toggle: toggleBookmark } = useBookmarks(auth.currentUser?.uid);
  // 先頭へ戻るのスクロール対象。スクロールするのは画面ではなくこの要素。
  const wordbookShellRef = useRef(null);
  // 単語帳モードの問題文字を、カードいっぱいの大きさに合わせる
  const wordbookGridRef = useFitWordbookText([shuffledWords, wordbookProgress, wordbookZoom, direction, viewMode]);
  // このセッションで初めて記録した単語のID。習得語数はここから数える。
  // 画面のインデックス数だと、戻る・再回答で二重に数えてしまう。
  const newlyLearnedIdsRef = useRef(new Set());
  // 答えを見たまま「わかった」を押した回数。吹き出しの発火に使う。
  const [peekCount, setPeekCount] = useState(0);
  // 親から毎回新しい関数が来るので、依存に入れずに最新を参照する
  const onWordAnsweredRef = useRef(onWordAnswered);
  onWordAnsweredRef.current = onWordAnswered;
  const currentWord = shuffledWords?.[currentIndex];

  const handleBackButtonClick = useCallback(() => {
    logger.debug('LearningFlashcard: 戻るボタンがクリックされました');
    
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
    onBack(incorrectWords, newlyLearnedIdsRef.current.size);
  }, [currentIndex, shuffledWords, sessionInfo, onSaveLog, incorrectWords, onBack]);


  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    }
  }, [currentIndex, x, y]);

  // 進行中の Firestore 書き込み。セッションを閉じる前に必ず待つ（計画書10.2.10）。
  const pendingWrites = useRef([]);
  const trackWrite = useCallback((promise) => {
    if (promise && typeof promise.then === 'function') {
      pendingWrites.current.push(promise);
    }
    return promise;
  }, []);
  const flushWrites = useCallback(async () => {
    const inFlight = pendingWrites.current;
    pendingWrites.current = [];
    await Promise.allSettled(inFlight);
  }, []);

  // 正解・不正解処理関数
  // 3段階の回答をまとめて扱う。'good' / 'hard' で次へ進み、
  // 'again' は handleIncorrect が受け持つ。
  const handleAnswer = useCallback(async (quality) => {
    const currentWord = shuffledWords?.[currentIndex];
    const user = auth.currentUser;

    // 答えを見たまま「わかった」を押したら、止めはしないが気づかせる
    if (isFlipped && quality === 'good') setPeekCount((prev) => prev + 1);

    if (user && currentWord) {
      trackWrite(
        updateUserWordProgress(user.uid, currentWord, quality, false, undefined, { revealed: isFlipped })
          .then((result) => {
            if (result?.created) newlyLearnedIdsRef.current.add(currentWord.id);
            onWordAnsweredRef.current?.(currentWord.id);
          })
      );
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
      
      // 書き込みを取りこぼさないよう、画面を閉じる前に待つ
      await flushWrites();
      // 親コンポーネントの戻る処理を呼び出し
      onBack(incorrectWords, newlyLearnedIdsRef.current.size);
    }
  }, [currentIndex, shuffledWords, x, y, hasCompletedOnce, onFirstCompletion, sessionInfo, onSaveLog, incorrectWords, onBack, trackWrite, flushWrites, auth.currentUser, isFlipped]);

  const handleCorrect = useCallback(() => handleAnswer('good'), [handleAnswer]);
  const handleHard = useCallback(() => handleAnswer('hard'), [handleAnswer]);

  const handleIncorrect = useCallback(async () => {
    const currentWord = shuffledWords?.[currentIndex];
    const user = auth.currentUser;
    
    // 不正解の場合、復習リストに追加
    if (currentWord) {
      if (user) {
        trackWrite(
          updateUserWordProgress(user.uid, currentWord, 'again', false, undefined, { revealed: isFlipped })
            .then((result) => {
              if (result?.created) newlyLearnedIdsRef.current.add(currentWord.id);
              onWordAnsweredRef.current?.(currentWord.id);
            })
        );
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
      
      // 書き込みを取りこぼさないよう、画面を閉じる前に待つ
      await flushWrites();
      // 親コンポーネントの戻る処理を呼び出し
      onBack(incorrectWords, newlyLearnedIdsRef.current.size);
    }
  }, [currentIndex, shuffledWords, x, y, hasCompletedOnce, onFirstCompletion, sessionInfo, onSaveLog, incorrectWords, onBack, trackWrite, flushWrites, auth.currentUser, isFlipped]);

  // ネイティブドラッグイベントハンドラー
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    logger.debug('🔥 Mouse down:', { x: e.clientX, y: e.clientY });
    
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
    
    logger.debug('🔥 Mouse move:', { deltaX, deltaY });
    
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
        
        logger.debug('🔥 LearningFlashcard Wordbook mode movement:', { deltaX, deltaY, absDeltaX: Math.abs(deltaX), absDeltaY: Math.abs(deltaY) });
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // 左右スワイプ（評価）の場合
          limitedDeltaX = Math.max(-150, Math.min(150, deltaX));
          logger.debug('🔥 LearningFlashcard Allowing horizontal movement for evaluation:', limitedDeltaX);
        } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
          // 上下スワイプ（削除）の場合
          limitedDeltaY = Math.max(-150, Math.min(150, deltaY));
          logger.debug('🔥 LearningFlashcard Allowing vertical movement for deletion:', limitedDeltaY);
        }
        
        activeCard.style.transform = `translate(${limitedDeltaX}px, ${limitedDeltaY}px)`;
        
        // 単語帳モードでの視覚的フィードバック
        let cardBackgroundColor = 'white';
        let boxShadow = 'none';
        
        if (limitedDeltaY < -15) {
          cardBackgroundColor = "#facc15"; // Yellow for swipe up (deletion)
          boxShadow = '0 4px 12px rgba(250, 204, 21, 0.3)';
          logger.debug('🔥 LearningFlashcard Yellow highlight for upward swipe (deletion)');
        } else if (limitedDeltaX > 30) {
          cardBackgroundColor = "#4ade80"; // Green for right swipe (correct)
          boxShadow = '0 4px 12px rgba(74, 222, 128, 0.3)';
          logger.debug('🔥 LearningFlashcard Green highlight for right swipe (correct)');
        } else if (limitedDeltaX < -30) {
          cardBackgroundColor = "#ef4444"; // Red for left swipe (incorrect)
          boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
          logger.debug('🔥 LearningFlashcard Red highlight for left swipe (incorrect)');
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
    
    logger.debug('🔥 Mouse up:', { deltaX, deltaY });
    
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
      const word = shuffledWords[currentIndex];
      // 英語を読んでから意味を読む。音だけで確認できるようにする。
      speakWordThenMeaning(word?.word, word?.japanese || word?.meaning, direction);
    }
  }, [isFlipped, currentIndex, shuffledWords, direction]);

  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // マルチタッチの場合は無視
    if (e.touches.length > 1) {
      logger.debug('🔥 LearningFlashcard Multi-touch detected, ignoring');
      return;
    }
    
    // ダブルタップ検出（スマホ用）
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 500 && tapLength > 0) {
      logger.debug('🔥 Double tap detected on mobile!');
      handleDoubleClick(e);
      setLastTap(0);
      return;
    }
    setLastTap(currentTime);
    
    setIsDragging(true);
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX, y: touch.clientY });
    logger.debug('🔥 LearningFlashcard Touch start:', { 
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
    
    logger.debug('🔥 Touch move:', { deltaX, deltaY, viewMode });
    
    if (viewMode === 'flashcard') {
      logger.debug('🔥 LearningFlashcard Touch move in flashcard mode:', { deltaX, deltaY });
      // motion valueを更新
      x.set(deltaX);
      y.set(deltaY);
      logger.debug('🔥 LearningFlashcard Motion values updated:', { xValue: x.get(), yValue: y.get() });
      
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
    
    logger.debug('🔥 Touch end:', { deltaX, deltaY });
    
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
    <div
      className="wordbook-shell"
      ref={wordbookShellRef}
      style={{ '--wordbook-zoom': wordbookZoom / 100 }}
    >

      {/* フラッシュカードと同じ骨格にする（計画書7.3 / 12.5）。
          以前はここだけ独自のヘッダー・独自の色・独自のボタンだった。 */}
      <div className="wordbook-header">
        <SessionHeader
          title={title ? `${title}（${shuffledWords.length}語）` : `単語帳モード（${shuffledWords.length}語）`}
          current={wordbookProgress}
          total={shuffledWords.length}
          onBack={handleBackButtonClick}
          backLabel="終了"
        />
        <ModeTabs value="wordbook" onChange={setViewMode}>
          <div className="mode-tabs__controls">
            <DirectionToggle value={direction} onChange={setDirection} />
            <WordbookZoomSlider value={wordbookZoom} onChange={setWordbookZoom} />
          </div>
        </ModeTabs>
      </div>

      {/* 単語帳コンテンツ */}
      <div className="wordbook-list">
        <div className="wordbook-list__grid" ref={wordbookGridRef}>
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
              className="wordbook-card"
            >
                <div className="wordbook-card__grid">
                {/* 左側：問題。英→和なら英単語、和→英なら意味 */}
                <div className="wordbook-card__side wordbook-card__left">
                  <BookmarkButton
                    size="inline"
                    active={isBookmarked(word)}
                    onToggle={() => toggleBookmark(word)}
                    label={word.word}
                  />
                  <button
                    type="button"
                    className={isJaToEn ? 'wordbook-word wordbook-word--ja' : 'wordbook-word'}
                    data-fit-text=""
                    onClick={() => (isJaToEn ? speak(word.meaning, 'ja-JP') : speak(word.word))}
                    aria-label={`${isJaToEn ? word.meaning : word.word} を読み上げる`}
                  >
                    {isJaToEn ? word.meaning : word.word}
                  </button>
                  {/* 発音記号は英単語の手がかりになるので、和→英では隠す */}
                  {!isJaToEn && (word.pronunciation || getPronunciation(word.word)) && (
                    <div className="wordbook-pronunciation">
                      [{word.pronunciation || getPronunciation(word.word)}]
                    </div>
                  )}
                </div>

                {/* 右側：和訳・例文（赤シート機能付き + 復習モード長押し機能） */}
                <div
                  className="wordbook-card__side wordbook-card__right"
                  style={{
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
                    // 通常モードはボタンで開閉するので、離しただけでは閉じない
                    if (isReviewMode) handleLongPressEnd(actualIndex);
                  }}
                  onMouseLeave={() => {
                    if (isReviewMode) handleLongPressEnd(actualIndex);
                  }}
                  onTouchStart={() => {
                    if (isReviewMode) {
                      handleLongPressStart(actualIndex);
                    } else {
                      handleRevealStart(actualIndex);
                    }
                  }}
                  onTouchEnd={() => {
                    if (isReviewMode) handleLongPressEnd(actualIndex);
                  }}
                >
                  {/* 赤シート。長押しを必須にしない（計画書7.5）。
                      ボタンにして、クリックとキーボードでも開けるようにする。 */}
                  {!isReviewMode && !revealedCards.has(actualIndex) && (
                    <button
                      type="button"
                      className="wordbook-veil"
                      onClick={(e) => { e.stopPropagation(); handleRevealStart(actualIndex); }}
                      aria-label={`${word.word} の答えを見る`}
                    >
                      答えを見る
                    </button>
                  )}
                  {!isReviewMode && revealedCards.has(actualIndex) && (
                    <button
                      type="button"
                      className="wordbook-veil-hide"
                      onClick={(e) => { e.stopPropagation(); handleRevealEnd(actualIndex); }}
                    >
                      隠す
                    </button>
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
                        上にスワイプで復習完了
                      </div>
                    </div>
                  )}
                  
                  {/* 実際のコンテンツ */}
                  <div style={{
                    opacity: revealedCards.has(index) ? 1 : 0.3,
                    transition: 'opacity 0.2s ease'
                  }}>
                    {isJaToEn ? (
                      <>
                        <div className="wordbook-meaning wordbook-meaning--en">{word.word}</div>
                        {(word.pronunciation || getPronunciation(word.word)) && (
                          <div className="wordbook-pronunciation">
                            [{word.pronunciation || getPronunciation(word.word)}]
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="wordbook-meaning">{word.meaning}</div>
                    )}

                    {word.example && (
                      <div className="wordbook-example">
                        <div className="wordbook-example__en">{word.example}</div>
                        {word.exampleJa && (
                          <div className="wordbook-example__ja">{word.exampleJa}</div>
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

      {/* 上に戻るボタン。カードに被らないよう右下の余白へ寄せる。 */}
      <div className="wordbook-to-top">
        <button
          type="button"
          onClick={() => wordbookShellRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="wordbook-to-top__button"
          aria-label="先頭へ戻る"
        >
          <FaArrowUp aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  // モードに応じてレンダリング
  if (viewMode === 'wordbook') {
    return renderWordbookMode();
  }

  // デバッグ: フラッシュカードモードのレンダリング
  logger.debug('🎴 フラッシュカードモードレンダリング:', {
    isReviewMode,
    sessionInfo: sessionInfo?.filterType,
    ボタン表示予定: true
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* 戻る・セッション名・現在数・進捗をヘッダーにまとめる（計画書7.3 / 7.7）。
          モード切替はヘッダー直下のアンダータブに置く。 */}
      <SessionHeader
        title={title || (isReviewMode ? '復習単語' : '新規学習')}
        current={currentIndex + 1}
        total={shuffledWords.length}
        onBack={() => onBack(incorrectWords, newlyLearnedIdsRef.current.size)}
        backLabel="終了"
        actions={(
          <>
            {currentWord && (
              <BookmarkButton
                active={isBookmarked(currentWord)}
                onToggle={() => toggleBookmark(currentWord)}
                label={currentWord.word}
              />
            )}
            <button
              type="button"
              className={autoPlay ? 'session-header__icon-btn is-active' : 'session-header__icon-btn'}
              onClick={autoPlay ? stopAutoPlay : startAutoPlay}
              aria-pressed={autoPlay}
              aria-label={autoPlay ? '自動読み上げを止める' : '自動読み上げを始める'}
            >
              {autoPlay ? <FaStop aria-hidden="true" /> : <FaPlay aria-hidden="true" />}
            </button>
          </>
        )}
      />
      <ModeTabs value="flashcard" onChange={setViewMode}>
        <DirectionToggle value={direction} onChange={setDirection} />
      </ModeTabs>

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
            {/* 和→英のときは意味が問題になる。発音記号は答えを教えてしまうので出さない。 */}
            <p id="card-front-text" className={isJaToEn ? 'card-front-text--ja' : undefined}>
              {isJaToEn
                ? (currentWord?.japanese || currentWord?.meaning || 'Loading...')
                : (currentWord?.word || 'Loading...')}
            </p>
            {!isJaToEn && (currentWord?.pronunciation || getPronunciation(currentWord?.word)) && (
              <p className="card-pronunciation">[{currentWord.pronunciation || getPronunciation(currentWord.word)}]</p>
            )}
          </div>
          <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord?.word || 'Loading...'}</h3>
            {(currentWord?.pronunciation || getPronunciation(currentWord?.word)) && (
              <p className="card-pronunciation">[{currentWord.pronunciation || getPronunciation(currentWord.word)}]</p>
            )}
            <p id="card-back-meaning">{currentWord?.japanese || currentWord?.meaning || 'Loading...'}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example || ''}</p>
            <p className="example-text-ja">{currentWord?.exampleJa || ''}</p>
          </div>
        </motion.div>
      </div>

      {/* スワイプを知らなくても完走できるようにする（計画書7.5 / 7.8） */}
      <PeekNudge trigger={peekCount} />
      <AnswerControls
        onCorrect={handleCorrect}
        onIncorrect={handleIncorrect}
        onHard={handleHard}
      />

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

