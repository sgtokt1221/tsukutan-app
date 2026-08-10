import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { updateUserWordProgress } from './logic/reviewLogic';
import { getAuth } from 'firebase/auth';
import { FaUndo, FaArrowLeft, FaArrowUp, FaPlay, FaStop } from 'react-icons/fa';
import AnswerControls from './components/learning/AnswerControls';
import PeekNudge from './components/learning/PeekNudge';
import SessionHeader from './components/learning/SessionHeader';
import ModeTabs from './components/learning/ModeTabs';
import WordbookZoomSlider from './components/learning/WordbookZoomSlider';
import DirectionToggle from './components/learning/DirectionToggle';
import BookmarkButton from './components/learning/BookmarkButton';
import { useBookmarks } from './logic/useBookmarks';
import { useWordbookZoom } from './logic/useWordbookZoom';
import { useCardDirection } from './logic/useCardDirection';
import { useAutoPlay } from './logic/useAutoPlay';
import { initialize, speak, speakWordThenMeaning } from './logic/speechUtils';
import logger from './logic/logger';
import { usePronunciation, inlinePronunciation } from './logic/usePronunciation';
import { SWIPE_FEEDBACK, swipeFeedbackFor, paintSwipeFeedback, clearSwipeFeedback } from './logic/swipeFeedback';

/** その座標にある単語帳カードを返す。掴んだカードを特定するのに使う。 */
const findCardAtPoint = (x, y) => {
  for (const card of document.querySelectorAll('[data-card-index]')) {
    const rect = card.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return card;
  }
  return null;
};

function ReviewFlashcard({ words, onBack, onSaveLog, sessionInfo }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionWords, setSessionWords] = useState([]);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [viewMode, setViewMode] = useState('flashcard'); // 'flashcard' or 'wordbook'
  const [revealedCards, setRevealedCards] = useState(new Set());
  const [wordbookProgress, setWordbookProgress] = useState(0); // 単語帳モードの進捗
  // 単語帳モードで左右スワイプした結果。どこまで進んだかを色で残す。
  const [wordbookJudgements, setWordbookJudgements] = useState({});
  // 答えを見たまま「わかった」を押した回数。吹き出しの発火に使う。
  const [peekCount, setPeekCount] = useState(0);
  // 出題の向き（英→和 / 和→英）は学習カードと共有する
  const [direction, setDirection] = useCardDirection();
  const isJaToEn = direction === 'ja-en';
  // 自動読み上げ。学習カードと同じ実装を共有する。
  const { autoPlay, start: startAutoPlay, stop: stopAutoPlay } = useAutoPlay({
    words: sessionWords,
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
  // 単語の出どころ（マスター / Firestore / 復習の写し）によらず発音を出す
  const getPronunciation = usePronunciation();
  // 文字サイズは学習カードと共有する
  const [wordbookZoom, setWordbookZoom] = useWordbookZoom();
  // 先頭へ戻るのスクロール対象
  const wordbookShellRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0); // スマホでのダブルタップ検出用

  const auth = getAuth();
  // 毎日みたい単語の登録状態
  const { isBookmarked, toggle: toggleBookmark } = useBookmarks(auth.currentUser?.uid);
  const userId = auth.currentUser ? auth.currentUser.uid : null;
  const sessionStartTime = useRef(new Date());

  // Motion values must be defined before any useCallback that uses them
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Initialize speech synthesis
  useEffect(() => {
    initialize().catch(error => console.error("Speech initialization failed:", error));
  }, []);


  // 単語帳モードの進捗を保存・復元
  useEffect(() => {
    if (viewMode === 'wordbook' && sessionWords.length > 0) {
      const progressKey = `wordbook_progress_review_${sessionInfo?.filterType || 'default'}_${sessionInfo?.filterValue || 'all'}`;
      const savedProgress = localStorage.getItem(progressKey);
      if (savedProgress) {
        const progress = parseInt(savedProgress);
        if (progress < sessionWords.length) {
          setWordbookProgress(progress);
        }
      }
    }
  }, [viewMode, sessionWords, sessionInfo]);


  useEffect(() => {
    // Shuffle words for variety each session
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setSessionWords(shuffled);
    setCurrentIndex(0);
    setGraduatedCount(0);
    sessionStartTime.current = new Date();
  }, [words]);

  // 自動読み上げ機能


  // 復習モード用のハンドラー関数
  const handleRevealStart = (cardIndex) => {
    if (revealedCards.has(cardIndex)) return;
    // 学習カードと同じく、意味が見えるのと同時に英語→日本語で読み上げる
    const word = sessionWords[cardIndex];
    if (word) speakWordThenMeaning(word.word, word.meaning || word.japanese || word.translation, direction);
    setRevealedCards(prev => new Set([...prev, cardIndex]));
  };

  const handleRevealEnd = (cardIndex) => {
    setRevealedCards(prev => {
      const newSet = new Set(prev);
      newSet.delete(cardIndex);
      return newSet;
    });
  };


  /**
   * 上スワイプ。その単語を復習リストから卒業させる。
   *
   * 受け取るのは単語そのもの。以前は引数名が cardIndex で、
   * フラッシュカードからは番号、単語帳からは綴りの文字列が渡っていた。
   * 文字列で sessionWords[...] を引くと undefined になり、
   * 画面上は消えたのに記録されない沈黙失敗になっていた。
   */
  const handleReviewRemove = useCallback(async (word) => {
    if (!userId || !word) return;
    try {
      await updateUserWordProgress(userId, word, true, true);
    } catch (error) {
      console.error('Error removing word from review list:', error);
    }
  }, [userId]);


  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const cardColor = useTransform(
    [x, y],
    ([latestX, latestY]) => {
      if (latestY < -40) return SWIPE_FEEDBACK.graduate.color;

      const xRange = [-100, 0, 100];
      const colorRange = [
        SWIPE_FEEDBACK.incorrect.color,
        SWIPE_FEEDBACK.neutral.color,
        SWIPE_FEEDBACK.correct.color,
      ];

      const N = colorRange.length;
      const xAsNumber = typeof latestX === 'number' ? latestX : 0;

      if (xAsNumber <= xRange[0]) return colorRange[0];
      if (xAsNumber >= xRange[N - 1]) return colorRange[N - 1];

      let i = 0;
      while (xAsNumber > xRange[i+1]) i++;

      const range = xRange[i+1] - xRange[i];
      const proportion = (xAsNumber - xRange[i]) / range;

      const fromColor = colorRange[i];
      const toColor = colorRange[i+1];

      const r = Math.round(parseInt(fromColor.slice(1, 3), 16) * (1 - proportion) + parseInt(toColor.slice(1, 3), 16) * proportion);
      const g = Math.round(parseInt(fromColor.slice(3, 5), 16) * (1 - proportion) + parseInt(toColor.slice(3, 5), 16) * proportion);
      const b = Math.round(parseInt(fromColor.slice(5, 7), 16) * (1 - proportion) + parseInt(toColor.slice(5, 7), 16) * proportion);

      return `rgb(${r}, ${g}, ${b})`;
    }
  );

  const handleBackButtonClick = useCallback(() => {
    const sessionEndTime = new Date();
    const durationInSeconds = (sessionEndTime - sessionStartTime.current) / 1000;

    if (onSaveLog && durationInSeconds > 5 && (currentIndex > 0 || graduatedCount > 0)) {
      onSaveLog({
        ...sessionInfo,
        wordsReviewed: currentIndex + 1,
        wordsGraduated: graduatedCount,
        durationInSeconds: Math.round(durationInSeconds),
        timestamp: new Date(),
      });
    }
    
    onBack();
  }, [onBack, onSaveLog, sessionInfo, currentIndex, graduatedCount, sessionStartTime]);


  const handleDoubleClick = useCallback((e) => {
    logger.debug('🔥 Double click detected!', { viewMode, isFlipped, currentIndex });
    e.preventDefault();
    e.stopPropagation();
    
    setIsFlipped(prev => {
      logger.debug('🔥 Setting isFlipped to:', !prev);
      return !prev;
    });
    if (!isFlipped && sessionWords.length > 0) {
      // 英語を読んでから意味を読む
      const word = sessionWords[currentIndex];
      speakWordThenMeaning(word.word, word.meaning || word.japanese || word.translation, direction);
    }
  }, [isFlipped, currentIndex, sessionWords, viewMode, direction]);

  const handlePrev = useCallback(() => {
    if (currentIndex === 0) return;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setIsFlipped(false);
    x.set(0);
    y.set(0);
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
    // 答えを見たまま「わかった」を押したら、止めはしないが気づかせる
    if (isFlipped && quality === 'good') setPeekCount((prev) => prev + 1);

    const currentWord = sessionWords?.[currentIndex];
    
    if (userId && currentWord) {
      trackWrite(updateUserWordProgress(userId, currentWord, quality, false, undefined, { revealed: isFlipped }));
      setGraduatedCount(prev => prev + 1);
    }
    
    // 次の単語へ
    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    } else {
      // 復習完了
      const sessionEndTime = new Date();
      const sessionDuration = sessionEndTime - sessionStartTime.current;
      
      if (sessionInfo && onSaveLog) {
        const sessionData = {
          ...sessionInfo,
          index: currentIndex,
          timestamp: new Date(),
          duration: sessionDuration,
          graduatedCount: graduatedCount + 1
        };
        onSaveLog(sessionData);
      }

      await flushWrites();
      onBack();
    }
  }, [currentIndex, sessionWords, x, y, userId, graduatedCount, sessionInfo, onSaveLog, onBack, trackWrite, flushWrites, isFlipped]);

  const handleCorrect = useCallback(() => handleAnswer('good'), [handleAnswer]);
  const handleHard = useCallback(() => handleAnswer('hard'), [handleAnswer]);

  /**
   * 単語帳での左右スワイプ。その単語を採点する。
   *
   * 以前はここが「評価処理をここに追加」というコメントだけで、
   * 押しても記録されず、カードも元に戻るだけだった。どこまでやったか
   * 分からなくなるのはそのため。採点を記録し、結果を色で残す。
   */
  const judgeWordAt = useCallback((actualIndex, quality) => {
    const word = sessionWords[actualIndex];
    if (!word) return;

    if (userId) {
      trackWrite(updateUserWordProgress(
        userId, word, quality, false, undefined,
        { revealed: revealedCards.has(actualIndex) },
      ));
    }
    setWordbookJudgements(prev => ({
      ...prev,
      [actualIndex]: quality === 'again' ? 'incorrect' : 'correct',
    }));
  }, [sessionWords, userId, trackWrite, revealedCards]);

  /** 単語帳での上スワイプ。その単語を卒業させ、一覧から取り除く。 */
  const graduateWordAt = useCallback((actualIndex) => {
    const word = sessionWords[actualIndex];
    if (!word) return;

    trackWrite(handleReviewRemove(word));
    setGraduatedCount(prev => prev + 1);
    setSessionWords(prev => prev.filter((_, index) => index !== actualIndex));
  }, [sessionWords, handleReviewRemove, trackWrite]);

  /**
   * フラッシュカードでの上スワイプ。卒業させて次のカードへ進む。
   * 以前は記録だけして進まず、同じ単語が残り続けていた。
   */
  const handleGraduateCurrent = useCallback(() => {
    const currentWord = sessionWords?.[currentIndex];
    if (!currentWord) return;

    trackWrite(handleReviewRemove(currentWord));
    setGraduatedCount(prev => prev + 1);

    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    } else {
      flushWrites().then(onBack);
    }
  }, [currentIndex, sessionWords, handleReviewRemove, trackWrite, flushWrites, onBack, x, y]);

  const handleIncorrect = useCallback(async () => {
    const currentWord = sessionWords?.[currentIndex];
    
    if (userId && currentWord) {
      trackWrite(updateUserWordProgress(userId, currentWord, 'again', false, undefined, { revealed: isFlipped }));
    }
    
    // 次の単語へ
    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    } else {
      // 復習完了
      const sessionEndTime = new Date();
      const sessionDuration = sessionEndTime - sessionStartTime.current;
      
      if (sessionInfo && onSaveLog) {
        const sessionData = {
          ...sessionInfo,
          index: currentIndex,
          timestamp: new Date(),
          duration: sessionDuration,
          graduatedCount: graduatedCount
        };
        onSaveLog(sessionData);
      }

      await flushWrites();
      onBack();
    }
  }, [currentIndex, sessionWords, x, y, userId, graduatedCount, sessionInfo, onSaveLog, onBack, trackWrite, flushWrites, isFlipped]);

  // ネイティブドラッグイベントハンドラー
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    logger.debug('🔥 ReviewFlashcard Mouse down:', { x: e.clientX, y: e.clientY });
    
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
    
    logger.debug('🔥 ReviewFlashcard Mouse move:', { deltaX, deltaY, viewMode });
    
    if (viewMode === 'flashcard') {
      // フラッシュカードモードの場合、motion valueを使用
      x.set(deltaX);
      y.set(deltaY);
      
      // フラッシュカードの背景色を変更
      paintSwipeFeedback(
        document.getElementById('flashcard'),
        swipeFeedbackFor(deltaX, deltaY),
      );
    } else if (viewMode === 'wordbook') {
      // 単語帳モードの場合、直接DOM操作でカードの位置を更新
      const activeCard = findCardAtPoint(dragStart.x, dragStart.y);
      
      if (activeCard) {
        // 単語帳モードでは左右スワイプで評価、上下スワイプで削除
        let limitedDeltaX = 0;
        let limitedDeltaY = 0;
        
        logger.debug('🔥 Wordbook mode movement:', { deltaX, deltaY, absDeltaX: Math.abs(deltaX), absDeltaY: Math.abs(deltaY) });
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // 左右スワイプ（評価）の場合
          limitedDeltaX = Math.max(-150, Math.min(150, deltaX));
          logger.debug('🔥 Allowing horizontal movement for evaluation:', limitedDeltaX);
        } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
          // 上下スワイプ（削除）の場合
          limitedDeltaY = Math.max(-150, Math.min(150, deltaY));
          logger.debug('🔥 Allowing vertical movement for deletion:', limitedDeltaY);
        }
        
        activeCard.style.transform = `translate(${limitedDeltaX}px, ${limitedDeltaY}px)`;
        
        // 単語帳モードでの視覚的フィードバック
        paintSwipeFeedback(activeCard, swipeFeedbackFor(limitedDeltaX, limitedDeltaY));
      }
    }
  }, [isDragging, dragStart, x, y, viewMode]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsDragging(false);
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    // カードの色をリセット
    const flashcard = document.getElementById('flashcard');
    if (flashcard) {
      flashcard.style.setProperty('background-color', 'white', 'important');
    }
    
    // 単語帳モードの場合、スワイプ完了後のアニメーションを処理
    if (viewMode === 'wordbook') {
      // スワイプ判定
      const threshold = 50;
      const isSwipe = Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;
      
      const activeCard = findCardAtPoint(dragStart.x, dragStart.y);
      
      if (activeCard) {
        if (isSwipe) {
          if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -15) {
            // 上スワイプ（卒業）。掴んでいたカードの単語を外す。
            // 以前は「先頭の単語を消して wordbookProgress を1進める」
            // だったので、途中のカードを上げると別の単語が消えていた。
            activeCard.style.transform = `translate(0px, -300px)`;
            activeCard.style.opacity = '0';

            const swipedIndex = Number(activeCard.dataset.cardIndex);
            setTimeout(() => graduateWordAt(swipedIndex), 300);
          } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 左右スワイプ（採点）。カードは一覧に残し、色で結果を示す。
            const swipedIndex = Number(activeCard.dataset.cardIndex);
            if (deltaX > 30) {
              judgeWordAt(swipedIndex, 'good');
            } else if (deltaX < -30) {
              judgeWordAt(swipedIndex, 'again');
            }

            activeCard.style.transform = 'translate(0px, 0px)';
            clearSwipeFeedback(activeCard);
          }
        } else {
          // スワイプが不十分な場合、元の位置に戻す
          activeCard.style.transform = 'translate(0px, 0px)';
          clearSwipeFeedback(activeCard);
        }
      }
    } else {
      // フラッシュカードモードの場合、従来のスワイプ判定
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
    }
    
    setDragStart({ x: 0, y: 0 });
  }, [isDragging, dragStart, viewMode, handleCorrect, handleIncorrect, graduateWordAt, judgeWordAt]);

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

  const handleTouchStart = useCallback((e) => {
    // スマホでのタッチイベントを確実に処理するため、passive: falseで登録
    e.preventDefault();
    e.stopPropagation();
    
    // マルチタッチの場合は無視
    if (e.touches.length > 1) {
      logger.debug('🔥 Multi-touch detected, ignoring');
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
    logger.debug('🔥 ReviewFlashcard Touch start:', { 
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

    // マルチタッチの場合は無視
    if (e.touches.length > 1) {
      return;
    }

    const touch = e.touches[0];
    const deltaX = touch.clientX - dragStart.x;
    const deltaY = touch.clientY - dragStart.y;
    
    logger.debug('🔥 ReviewFlashcard Touch move:', { 
      deltaX, 
      deltaY, 
      viewMode,
      touchX: touch.clientX,
      touchY: touch.clientY,
      dragStartX: dragStart.x,
      dragStartY: dragStart.y
    });
    
    // 単語帳モードでは左右スワイプで評価、上下スワイプで削除
    if (viewMode === 'wordbook') {
      paintSwipeFeedback(e.currentTarget, swipeFeedbackFor(deltaX, deltaY));
      return;
    }
    
    // フラッシュカードモードでは全方向の動きを許可
    if (viewMode === 'flashcard') {
      logger.debug('🔥 Touch move in flashcard mode:', { deltaX, deltaY });
      // motion valueを更新
      x.set(deltaX);
      y.set(deltaY);
      logger.debug('🔥 Motion values updated:', { xValue: x.get(), yValue: y.get() });
      
      // フラッシュカードの背景色を変更
      paintSwipeFeedback(
        document.getElementById('flashcard'),
        swipeFeedbackFor(deltaX, deltaY),
      );
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
    
    logger.debug('🔥 ReviewFlashcard Touch end:', { deltaX, deltaY });
    
    // カードの色をリセット
    const flashcard = document.getElementById('flashcard');
    if (flashcard) {
      flashcard.style.setProperty('background-color', 'white', 'important');
    }
    
    // モードに応じたスワイプ判定
    if (viewMode === 'flashcard') {
      const threshold = 100;
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // 右スワイプ（正解）
          handleCorrect();
        } else {
          // 左スワイプ（不正解）
          handleIncorrect();
        }
      } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > threshold && deltaY < -15) {
        // 上スワイプ（復習リストから卒業）。次のカードへも進む。
        handleGraduateCurrent();
      }
    } else if (viewMode === 'wordbook') {
      // 単語帳モードでのスワイプ判定。
      // 以前はここがログだけで、採点も卒業も handleMouseUp 頼みだった。
      // スマホにはマウスイベントが来ないので、実機では何も起きていなかった。
      const threshold = 50;
      const activeCard = findCardAtPoint(dragStart.x, dragStart.y);

      if (activeCard) {
        const swipedIndex = Number(activeCard.dataset.cardIndex);

        if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -threshold) {
          activeCard.style.transform = 'translate(0px, -300px)';
          activeCard.style.opacity = '0';
          setTimeout(() => graduateWordAt(swipedIndex), 300);
        } else {
          if (Math.abs(deltaX) > threshold) {
            judgeWordAt(swipedIndex, deltaX > 0 ? 'good' : 'again');
          }
          activeCard.style.transform = 'translate(0px, 0px)';
          clearSwipeFeedback(activeCard);
        }
      }
    }
    
    setDragStart({ x: 0, y: 0 });
    
  }, [isDragging, dragStart, viewMode, handleCorrect, handleIncorrect, handleGraduateCurrent, graduateWordAt, judgeWordAt]);

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

  if (!sessionWords || sessionWords.length === 0) {
    return (
        <div className="loading-container">
            <p>復習する単語がありません。</p>
            <button onClick={onBack}>ダッシュボードに戻る</button>
        </div>
    );
  }

  const currentWord = sessionWords[currentIndex];

  // 単語帳モードのレンダリング
  const renderWordbookMode = () => (
    <div
      className="wordbook-shell"
      ref={wordbookShellRef}
      style={{ '--wordbook-zoom': wordbookZoom / 100 }}
    >
      {/* 学習カードと同じ骨格にする。以前はここだけ独自のヘッダー・
          独自の色・独自のボタンだった。 */}
      <div className="wordbook-header">
        <SessionHeader
          title={`復習単語帳（${sessionWords.length}語）`}
          current={wordbookProgress}
          total={sessionWords.length}
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

      <div className="wordbook-list">
        <div className="wordbook-list__grid">
          {sessionWords.slice(wordbookProgress).map((word, index) => {
            const actualIndex = wordbookProgress + index;
            
            return (
            <motion.div
              key={actualIndex}
              data-card-index={actualIndex}
              className={`wordbook-card${wordbookJudgements[actualIndex] ? ` wordbook-card--${wordbookJudgements[actualIndex]}` : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
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
                    onClick={() => (isJaToEn ? speak(word.meaning, 'ja-JP') : speak(word.word, 'en-US'))}
                    aria-label={`${isJaToEn ? word.meaning : word.word} を読み上げる`}
                  >
                    <span className="wordbook-word__text">
                      {isJaToEn ? word.meaning : word.word}
                    </span>
                    {/* 発音記号は英単語の手がかりになるので、和→英では隠す。
                        英→和でも、行が増える長い語では出さない。 */}
                    {!isJaToEn && inlinePronunciation(
                      word.word, word.pronunciation || getPronunciation(word.word),
                    ) && (
                      <span className="wordbook-pronunciation">
                        [{word.pronunciation || getPronunciation(word.word)}]
                      </span>
                    )}
                  </button>
                </div>

                {/* 右側：和訳・例文（復習モード長押し機能 + 赤シート機能） */}
                <div className="wordbook-card__side wordbook-card__right">
                  {/* 赤シート。長押しを必須にせず、押せば開くボタンにする。
                      キーボードでも開ける（計画書7.5）。 */}
                  {!revealedCards.has(index) && (
                    <button
                      type="button"
                      className="wordbook-veil"
                      onClick={(e) => { e.stopPropagation(); handleRevealStart(index); }}
                      aria-label={`${word.word} の答えを見る`}
                    >
                      答えを見る
                    </button>
                  )}
                  {revealedCards.has(index) && (
                    <button
                      type="button"
                      className="wordbook-veil-hide"
                      onClick={(e) => { e.stopPropagation(); handleRevealEnd(index); }}
                    >
                      隠す
                    </button>
                  )}

                  <div className={revealedCards.has(index) ? 'wordbook-answer' : 'wordbook-answer wordbook-answer--hidden'}>
                    {isJaToEn ? (
                      <div className="wordbook-answer-word">
                        <span className="wordbook-meaning wordbook-meaning--en">{word.word}</span>
                        {inlinePronunciation(
                          word.word, word.pronunciation || getPronunciation(word.word),
                        ) && (
                          <span className="wordbook-pronunciation">
                            [{word.pronunciation || getPronunciation(word.word)}]
                          </span>
                        )}
                      </div>
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* 戻る・セッション名・現在数・進捗をヘッダーにまとめる。
          モード切替はヘッダー直下のアンダータブに置く。
          以前は画面右上に浮かせた原色のボタン2つだった。 */}
      <SessionHeader
        title="復習"
        current={currentIndex + 1}
        total={sessionWords.length}
        onBack={handleBackButtonClick}
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
              {isJaToEn ? (currentWord?.japanese || currentWord?.meaning) : currentWord?.word}
            </p>
            {!isJaToEn && (currentWord?.pronunciation || getPronunciation(currentWord?.word)) && (
              <p className="card-pronunciation">[{currentWord.pronunciation || getPronunciation(currentWord.word)}]</p>
            )}
          </div>
          <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord?.word}</h3>
            {(currentWord?.pronunciation || getPronunciation(currentWord?.word)) && (
              <p className="card-pronunciation">[{currentWord.pronunciation || getPronunciation(currentWord.word)}]</p>
            )}
            <p id="card-back-meaning">{currentWord?.japanese || currentWord?.meaning}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
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

      {/* 進捗はヘッダーに出しているので、ここでは操作だけ置く */}
      <div className="session-footer">
        <button
          type="button"
          className="ghost-button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          <FaUndo aria-hidden="true" /> 前の単語
        </button>
        <button type="button" className="secondary-action" onClick={handleBackButtonClick}>
          <FaArrowLeft aria-hidden="true" /> 前の画面に戻る
        </button>
      </div>
    </div>
  );
}

export default ReviewFlashcard;