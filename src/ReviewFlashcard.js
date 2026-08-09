import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { updateUserWordProgress } from './logic/reviewLogic';
import { getAuth } from 'firebase/auth';
import { FaUndo, FaArrowLeft, FaBook, FaLayerGroup, FaPlay, FaStop } from 'react-icons/fa';
import AnswerControls from './components/learning/AnswerControls';
import { initialize, speak } from './logic/speechUtils';
import logger from './logic/logger';

function ReviewFlashcard({ words, onBack, onSaveLog, sessionInfo }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionWords, setSessionWords] = useState([]);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [viewMode, setViewMode] = useState('flashcard'); // 'flashcard' or 'wordbook'
  const [revealedCards, setRevealedCards] = useState(new Set());
  const [longPressCards] = useState(new Set());
  const [wordbookProgress, setWordbookProgress] = useState(0); // 単語帳モードの進捗
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0); // スマホでのダブルタップ検出用
  const [autoPlay, setAutoPlay] = useState(false); // 自動読み上げ機能
  const autoPlayRef = useRef(null); // 自動読み上げのタイムアウト参照

  const auth = getAuth();
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
  const startAutoPlay = useCallback(() => {
    if (viewMode !== 'flashcard' || sessionWords.length === 0) return;
    
    setAutoPlay(true);
    
    const playWordSequence = (index) => {
      if (index >= sessionWords.length) {
        setAutoPlay(false);
        return;
      }
      
      const word = sessionWords[index];
      if (word) {
        // 1. 英語を読み上げ
        speak(word.word, 'en-US');
        
        // 2. 英語読み上げ完了を待ってからカードをめくる
        const waitForEnglishComplete = () => {
          const synthesis = window.speechSynthesis;
          if (synthesis.speaking) {
            setTimeout(waitForEnglishComplete, 100);
          } else {
            // 英語読み上げ完了後、0.5秒待ってからカードをめくる
            setTimeout(() => {
              setIsFlipped(true);
              
              // 3. カードがめくれた後、0.5秒待ってから日本語を読み上げ
              setTimeout(() => {
                const japaneseText = word.meaning || word.japanese || word.translation;
                if (japaneseText) {
                  logger.debug('Speaking Japanese (meaning):', japaneseText);
                  speak(japaneseText, 'ja-JP');
                }
              }, 500);
            }, 500);
          }
        };
        waitForEnglishComplete();
        
        // 4. 日本語読み上げ完了を待ってから次の単語に進む
        const waitForJapaneseComplete = () => {
          const synthesis = window.speechSynthesis;
          if (synthesis.speaking) {
            setTimeout(waitForJapaneseComplete, 100);
          } else {
            // 日本語読み上げ完了後、1秒待ってから次の単語に進む
            autoPlayRef.current = setTimeout(() => {
              if (index < sessionWords.length - 1) {
                setCurrentIndex(index + 1);
                setIsFlipped(false);
                x.set(0);
                y.set(0);
                playWordSequence(index + 1);
              } else {
                setAutoPlay(false);
              }
            }, 1000);
          }
        };
        
        // 日本語読み上げ開始後、完了を待つ
        setTimeout(waitForJapaneseComplete, 1000);
      }
    };
    
    // 現在のインデックスから開始
    playWordSequence(currentIndex);
  }, [viewMode, sessionWords, currentIndex, x, y]);

  const stopAutoPlay = useCallback(() => {
    setAutoPlay(false);
    if (autoPlayRef.current) {
      clearTimeout(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  // コンポーネントのアンマウント時に自動読み上げを停止
  useEffect(() => {
    return () => {
      if (autoPlayRef.current) {
        clearTimeout(autoPlayRef.current);
      }
    };
  }, []);

  // 復習モード用のハンドラー関数
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


  const handleReviewRemove = useCallback(async (cardIndex) => {
    const word = sessionWords[cardIndex];
    
    // 復習リストから除去
    if (userId && word) {
      try {
        await updateUserWordProgress(userId, word, true, true);
      } catch (error) {
        console.error('Error removing word from review list:', error);
      }
    }
  }, [userId, sessionWords]);


  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const cardColor = useTransform(
    [x, y],
    ([latestX, latestY]) => {
      if (latestY < -40) {
        return "#facc15"; // Yellow for swipe up
      }
      // Interpolate between red, white, and green for horizontal swipe
      const xRange = [-100, 0, 100];
      const colorRange = ["#ef4444", "#ffffff", "#4ade80"];
      
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
      const wordToSpeak = sessionWords[currentIndex].word;
      logger.debug('🔥 Speaking English:', wordToSpeak);
      speak(wordToSpeak, 'en-US'); // 英語音声で読み上げ
    } else if (isFlipped && sessionWords.length > 0) {
      const word = sessionWords[currentIndex];
      const japaneseText = word.meaning || word.japanese || word.translation;
      logger.debug('🔥 Speaking Japanese:', japaneseText);
      if (japaneseText) {
        speak(japaneseText, 'ja-JP'); // 日本語音声で読み上げ
      }
    }
  }, [isFlipped, currentIndex, sessionWords, viewMode]);

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
  const handleCorrect = useCallback(async () => {
    const currentWord = sessionWords?.[currentIndex];
    
    if (userId && currentWord) {
      trackWrite(updateUserWordProgress(userId, currentWord, true));
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
  }, [currentIndex, sessionWords, x, y, userId, graduatedCount, sessionInfo, onSaveLog, onBack, trackWrite, flushWrites]);

  const handleIncorrect = useCallback(async () => {
    const currentWord = sessionWords?.[currentIndex];
    
    if (userId && currentWord) {
      trackWrite(updateUserWordProgress(userId, currentWord, false));
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
  }, [currentIndex, sessionWords, x, y, userId, graduatedCount, sessionInfo, onSaveLog, onBack, trackWrite, flushWrites]);

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
      const flashcard = document.getElementById('flashcard');
      if (flashcard) {
        let backgroundColor = 'white';
        let boxShadow = 'none';
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > 30) {
            backgroundColor = "#4ade80"; // Green for right swipe
            boxShadow = '0 4px 12px rgba(74, 222, 128, 0.3)';
          } else if (deltaX < -30) {
            backgroundColor = "#ef4444"; // Red for left swipe
            boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
          }
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -15) {
          backgroundColor = "#facc15"; // Yellow for swipe up
          boxShadow = '0 4px 12px rgba(250, 204, 21, 0.3)';
        }
        flashcard.style.setProperty('background-color', backgroundColor, 'important');
        flashcard.style.setProperty('box-shadow', boxShadow, 'important');
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
        let backgroundColor = 'white';
        let boxShadow = 'none';
        
        if (limitedDeltaY < -15) {
          backgroundColor = "#facc15"; // Yellow for swipe up (deletion)
          boxShadow = '0 4px 12px rgba(250, 204, 21, 0.3)';
          logger.debug('🔥 Yellow highlight for upward swipe (deletion)');
        } else if (limitedDeltaX > 30) {
          backgroundColor = "#4ade80"; // Green for right swipe (correct)
          boxShadow = '0 4px 12px rgba(74, 222, 128, 0.3)';
          logger.debug('🔥 Green highlight for right swipe (correct)');
        } else if (limitedDeltaX < -30) {
          backgroundColor = "#ef4444"; // Red for left swipe (incorrect)
          boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
          logger.debug('🔥 Red highlight for left swipe (incorrect)');
        }
        
        activeCard.style.setProperty('background-color', backgroundColor, 'important');
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
        if (isSwipe) {
          if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -15) {
            // 上スワイプ（削除）の場合
            activeCard.style.transform = `translate(0px, -300px)`;
            activeCard.style.opacity = '0';
            
            // 復習単語の場合は削除処理を追加
            if (words.length > 0 && wordbookProgress < words.length) {
              const currentWord = words[wordbookProgress];
              handleReviewRemove(currentWord.word);
            }
            
            // アニメーション後にカードを非表示にして次のカードに進む
            setTimeout(() => {
              activeCard.style.display = 'none';
              // 次のカードに進む
              setWordbookProgress(prev => prev + 1);
            }, 300);
          } else if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // 左右スワイプ（評価）の場合
            if (deltaX > 30) {
              // 右スワイプ（正解）
              logger.debug('🔥 Right swipe - correct answer');
              // 評価処理をここに追加
            } else if (deltaX < -30) {
              // 左スワイプ（不正解）
              logger.debug('🔥 Left swipe - incorrect answer');
              // 評価処理をここに追加
            }
            
            // カードを元の位置に戻す
            activeCard.style.transform = 'translate(0px, 0px)';
            activeCard.style.setProperty('background-color', 'white', 'important');
            activeCard.style.setProperty('box-shadow', 'none', 'important');
          }
        } else {
          // スワイプが不十分な場合、元の位置に戻す
          activeCard.style.transform = 'translate(0px, 0px)';
          activeCard.style.setProperty('background-color', 'white', 'important');
          activeCard.style.setProperty('box-shadow', 'none', 'important');
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
  }, [isDragging, dragStart, viewMode, handleCorrect, handleIncorrect, handleReviewRemove, wordbookProgress, words]);

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
      let backgroundColor = 'white';
      let boxShadow = 'none';
      
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // 左右スワイプ（評価）
        if (deltaX > 30) {
          backgroundColor = "#4ade80"; // Green for right swipe (correct)
          boxShadow = '0 4px 12px rgba(74, 222, 128, 0.3)';
        } else if (deltaX < -30) {
          backgroundColor = "#ef4444"; // Red for left swipe (incorrect)
          boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
        }
      } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // 上下スワイプ（削除）
        if (deltaY < -15) {
          backgroundColor = "#facc15"; // Yellow for swipe up (deletion)
          boxShadow = '0 4px 12px rgba(250, 204, 21, 0.3)';
        }
      }
      
      if (e.currentTarget) {
        e.currentTarget.style.setProperty('background-color', backgroundColor, 'important');
        e.currentTarget.style.setProperty('box-shadow', boxShadow, 'important');
      }
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
        // 上スワイプ（復習リストから削除）
        handleReviewRemove(currentIndex);
      }
    } else if (viewMode === 'wordbook') {
      // 単語帳モードでのスワイプ判定
      const threshold = 50;
      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // 左右スワイプ（評価）
          if (deltaX > 30) {
            logger.debug('🔥 Wordbook: Right swipe - correct answer');
            // 評価処理をここに追加
          } else if (deltaX < -30) {
            logger.debug('🔥 Wordbook: Left swipe - incorrect answer');
            // 評価処理をここに追加
          }
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -15) {
          // 上スワイプ（削除）
          logger.debug('🔥 Wordbook: Up swipe - delete from review');
          // 削除処理は既にhandleMouseUpで実装済み
        }
      }
    }
    
    setDragStart({ x: 0, y: 0 });
    
  }, [isDragging, dragStart, viewMode, handleCorrect, handleIncorrect, handleReviewRemove, currentIndex]);

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
            復習単語帳モード ({sessionWords.length}語)
          </h2>
          <p style={{
            margin: '4px 0 0 0',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            右側長押しで表示 • 左右スワイプで評価 • 長押し+上スワイプで復習完了
          </p>
          <div style={{
            margin: '8px 0 0 0',
            fontSize: '0.75rem',
            color: '#10b981',
            fontWeight: '600'
          }}>
            進捗: {wordbookProgress} / {sessionWords.length} 語
            {wordbookProgress > 0 && (
              <span style={{ marginLeft: '8px' }}>
                ({Math.round((wordbookProgress / sessionWords.length) * 100)}%)
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
            onClick={onBack}
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
        width: '100%'
      }}>
        <div style={{
          display: 'grid',
          gap: '16px'
        }}>
          {sessionWords.slice(wordbookProgress).map((word, index) => {
            const actualIndex = wordbookProgress + index;
            
            return (
            <motion.div
              key={actualIndex}
              data-card-index={actualIndex}
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
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
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
                  onClick={() => speak(word.word, 'en-US')}
                  >
                    {word.word}
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    color: '#6b7280',
                    fontStyle: 'italic'
                  }}>
                    {word.pronunciation ? `[${word.pronunciation}]` : ''}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    marginTop: '4px'
                  }}>
                    {index + 1} / {sessionWords.length}
                  </div>
                </div>

                {/* 右側：和訳・例文（復習モード長押し機能 + 赤シート機能） */}
                <div 
                  style={{
                    padding: window.innerWidth <= 768 ? '12px' : '24px', // スマホではパディングを小さく
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: 'pointer',
                    userSelect: 'none',
                    backgroundColor: longPressCards.has(index) ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); // カード全体のイベントを止める
                    handleRevealStart(index);
                  }}
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    handleRevealEnd(index);
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    handleRevealEnd(index);
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleRevealStart(index);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    handleRevealEnd(index);
                  }}
                >
                  {/* 赤シートオーバーレイ */}
                  {!revealedCards.has(index) && !longPressCards.has(index) && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(220, 38, 38, 0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '0 12px 12px 0',
                      zIndex: 2
                    }}>
                      <div style={{
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: '500',
                        textAlign: 'center',
                        padding: '8px'
                      }}>
                        長押しで答えを表示
                      </div>
                    </div>
                  )}

                  {/* 復習モード用オーバーレイ（上部のみ） */}
                  
                  {/* 実際のコンテンツ */}
                  <div style={{
                    opacity: revealedCards.has(index) || longPressCards.has(index) ? 1 : 0.3,
                    transition: 'opacity 0.2s ease'
                  }}>
                    <div style={{
                      fontSize: window.innerWidth <= 768 ? '1rem' : '1.25rem', // スマホではフォントサイズを小さく
                      fontWeight: '600',
                      color: '#1f2937',
                      marginBottom: window.innerWidth <= 768 ? '8px' : '16px', // スマホではマージンを小さく
                      lineHeight: '1.4',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => {
                      const japaneseText = word.meaning || word.japanese || word.translation;
                      if (japaneseText) {
                        speak(japaneseText, 'ja-JP');
                      }
                    }}
                    >
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
                        {word.exampleJa && (
                          <div style={{
                            fontSize: '0.875rem',
                            color: '#6b7280',
                            lineHeight: '1.4'
                          }}>
                            {word.exampleJa}
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
            logger.debug('上に戻るボタンがクリックされました');
            
            // 単語帳モードのコンテナ要素を取得
            const wordbookContainer = document.querySelector('[style*="height: 100vh"][style*="overflow: auto"]');
            logger.debug('単語帳コンテナ:', wordbookContainer);
            
            if (wordbookContainer) {
              logger.debug('コンテナのスクロール位置:', wordbookContainer.scrollTop);
              
              // コンテナ要素にスクロール
              wordbookContainer.scrollTo({ top: 0, behavior: 'smooth' });
              
              // フォールバック
              setTimeout(() => {
                wordbookContainer.scrollTop = 0;
                logger.debug('フォールバック後の位置:', wordbookContainer.scrollTop);
              }, 100);
            } else {
              // フォールバック: ウィンドウスクロール
              logger.debug('ウィンドウスクロール実行');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* モード切り替えボタンと自動読み上げボタン */}
      <div style={{
        position: 'fixed',
        top: '120px',
        right: '20px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {/* 自動読み上げボタン */}
        <button
          onClick={autoPlay ? stopAutoPlay : startAutoPlay}
          style={{
            padding: '10px 18px',
            backgroundColor: autoPlay ? '#dc2626' : '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: autoPlay ? '0 4px 12px rgba(220, 38, 38, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.3)',
            transition: 'all 0.2s ease',
            fontWeight: '600'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = autoPlay ? '#b91c1c' : '#059669';
            e.target.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = autoPlay ? '#dc2626' : '#10b981';
            e.target.style.transform = 'translateY(0px)';
          }}
        >
          {autoPlay ? <FaStop /> : <FaPlay />} 
          {autoPlay ? '停止' : '自動読み上げ'}
        </button>
        
        {/* 単語帳モードボタン */}
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
        <h3>復習モード</h3>
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
            <p id="card-front-text">{currentWord?.word}</p>
          </div>
          <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord?.word}</h3>
            <p id="card-back-meaning">{currentWord?.japanese || currentWord?.meaning}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </div>
        </motion.div>
      </div>

      {/* スワイプを知らなくても完走できるようにする（計画書7.5 / 7.8） */}
      <AnswerControls
        onCorrect={handleCorrect}
        onIncorrect={handleIncorrect}
        hint="スワイプでも回答できます（右: わかった / 左: もう一度）"
      />

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
            {currentIndex + 1} / {sessionWords.length}
          </span>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
            復習モード
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
            width: `${((currentIndex + 1) / sessionWords.length) * 100}%`,
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

export default ReviewFlashcard;