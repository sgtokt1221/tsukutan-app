import React, { useState, useEffect, useCallback, useRef } from 'react';
import AnswerControls from './components/learning/AnswerControls';
import PeekNudge from './components/learning/PeekNudge';
import SessionHeader from './components/learning/SessionHeader';
import ModeTabs from './components/learning/ModeTabs';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import { FaArrowUp, FaUndo, FaArrowLeft, FaPlay, FaStop, FaCheck } from 'react-icons/fa';
import { initialize, speak, speakWordThenMeaning } from './logic/speechUtils';
import { prefetchClips } from './logic/audioLibrary';

// 忘却曲線に基づき、単語の習熟度を更新するロジック
import { updateUserWordProgress, undoWordProgress } from './logic/reviewLogic';
import logger from './logic/logger';
import { usePronunciation, inlinePronunciation } from './logic/usePronunciation';
import { SWIPE_FEEDBACK, swipeFeedbackFor, paintSwipeFeedback, clearSwipeFeedback } from './logic/swipeFeedback';
import CardFace from './components/learning/CardFace';
import { scrollWordbookToTop } from './logic/scrollHelpers';
import { useWordbookZoom } from './logic/useWordbookZoom';
import { useCardDirection } from './logic/useCardDirection';
import { useAutoPlaySpeed } from './logic/useAutoPlaySpeed';
import { useAutoPlay } from './logic/useAutoPlay';
import WordbookZoomSlider from './components/learning/WordbookZoomSlider';
import DirectionToggle from './components/learning/DirectionToggle';
import AutoPlaySpeed from './components/learning/AutoPlaySpeed';
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

/** その座標にある単語帳カードを返す。掴んだカードを特定するのに使う。 */
const findCardAtPoint = (x, y) => {
  for (const card of document.querySelectorAll('[data-card-index]')) {
    const rect = card.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return card;
  }
  return null;
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
  const [wordbookProgress, setWordbookProgress] = useState(0); // 単語帳モードの進捗
  // 単語帳モードで左右スワイプした結果。どこまで進んだかを色で残す。
  const [wordbookJudgements, setWordbookJudgements] = useState({});
  // 採点する前の状態。同じ向きにもう一度振ったときに戻す先。
  const undoStateRef = useRef({});
  // 文字サイズは復習カードと共有する
  const [wordbookZoom, setWordbookZoom] = useWordbookZoom();
  // 出題の向き（英→和 / 和→英）も復習カードと共有する
  const [direction, setDirection] = useCardDirection();
  const isJaToEn = direction === 'ja-en';
  // 自動再生で次の単語へ進むまでの間。復習カードと共有する。
  const [autoPlaySpeed, setAutoPlaySpeed, autoPlayGapMs] = useAutoPlaySpeed();
  const [isDragging, setIsDragging] = useState(false);
  // 1回のスワイプを1回だけ処理するための掛け金。
  // カード自身の onMouseUp と document の mouseup が両方走るので、
  // 掛け金が無いと卒業が2回動き、隣の単語まで消えていた。
  const swipeHandledRef = useRef(false);
  // 掴んだカード。動かすと矩形もずれるので、指を置いた時点で覚える。
  // 座標から引き直すと、ついてきたぶん指が外へ出て途中で見失う。
  const grabbedCardRef = useRef(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0); // スマホでのダブルタップ検出用
  
  const auth = getAuth();
  const sessionStartTime = useRef(new Date());

  // 音声合成の初期化
  useEffect(() => {
    initialize().catch(error => console.error("Speech initialization failed:", error));
  }, []);

  // このセッションで使う音声を先に取っておく。1語目から待たずに鳴らすため。
  // 用意が無い語は取れないだけで、鳴らすときに端末の読み上げへ戻る。
  useEffect(() => {
    const words = shuffledWords.slice(0, 40);
    if (words.length === 0) return;

    prefetchClips(words.flatMap((word) => [
      { text: word.word, lang: 'en-US' },
      { text: word.meaning || word.japanese || word.translation, lang: 'ja-JP' },
    ]));
  }, [shuffledWords]);


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
  const cardColor = useTransform(
    x,
    [-100, 0, 100],
    [SWIPE_FEEDBACK.incorrect.color, SWIPE_FEEDBACK.neutral.color, SWIPE_FEEDBACK.correct.color],
  );

  // 単語の出どころ（マスター / Firestore / 復習の写し）によらず発音を出す
  const getPronunciation = usePronunciation();
  // 自動読み上げ。復習カードと同じ実装を共有する。
  const { autoPlay, start: startAutoPlay, stop: stopAutoPlay } = useAutoPlay({
    words: shuffledWords,
    currentIndex,
    direction,
    gapMs: autoPlayGapMs,
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
  /**
   * 単語帳での左右スワイプ。その単語を採点し、結果を色で残す。
   *
   * 以前はカードを飛ばして wordbookProgress を1進めるだけで、
   * 記録も残らず、掴んだカードと消えるカードも一致していなかった。
   */
  const judgeWordAt = useCallback((actualIndex, quality) => {
    const word = shuffledWords[actualIndex];
    const user = auth.currentUser;
    if (!word) return;

    const mark = quality === 'again' ? 'incorrect' : 'correct';

    // 同じ向きにもう一度スワイプしたら取り消す。押し間違いを戻せるように、
    // 色だけでなく間隔と繰り返し回数も書き換える前の状態へ返す。
    if (wordbookJudgements[actualIndex] === mark) {
      const previous = undoStateRef.current[word.id];
      if (user && previous) trackWrite(undoWordProgress(user.uid, word.id, previous));
      delete undoStateRef.current[word.id];
      setWordbookJudgements(prev => {
        const next = { ...prev };
        delete next[actualIndex];
        return next;
      });
      return;
    }

    if (user) {
      trackWrite(
        updateUserWordProgress(
          user.uid, word, quality, false, undefined,
          { revealed: revealedCards.has(actualIndex) },
        ).then((result) => {
          // 1回目の採点の前の状態だけ覚える。続けて別の向きに振っても、
          // 戻る先は「触る前」であってほしい。
          if (result?.previous && !undoStateRef.current[word.id]) {
            undoStateRef.current[word.id] = result.previous;
          }
          if (result?.created) newlyLearnedIdsRef.current.add(word.id);
          onWordAnsweredRef.current?.(word.id);
        })
      );
    }
    setWordbookJudgements(prev => ({ ...prev, [actualIndex]: mark }));
  }, [shuffledWords, auth, trackWrite, revealedCards, wordbookJudgements]);

  /**
   * 上スワイプ。もう覚えた語として復習リストから卒業させる。
   *
   * 復習カードと同じ扱いにする。以前は黄色く光ってカードも飛んでいくのに
   * 何も記録していなかった（案内の「上にスワイプで復習完了」も、
   * 表示条件が真にならない死んだ分岐だった）。
   */
  const graduateWordAt = useCallback((actualIndex) => {
    const word = shuffledWords[actualIndex];
    const user = auth.currentUser;
    if (!word) return;

    if (user) trackWrite(updateUserWordProgress(user.uid, word, true, true));
    // 取り除くのは番号ではなく単語そのもの。同じスワイプで2回走っても
    // 2枚目が消えないようにする（番号で消すと後ろが繰り上がって別の語が
    // 巻き添えになる）。
    setShuffledWords(prev => prev.filter((entry) => entry !== word));
  }, [shuffledWords, auth, trackWrite]);

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

  /** フラッシュカードでの上スワイプ。卒業させて次のカードへ進む。 */
  const handleGraduateCurrent = useCallback(() => {
    if (!shuffledWords[currentIndex]) return;

    graduateWordAt(currentIndex);
    setIsFlipped(false);
    x.set(0);
    y.set(0);
    // 取り除いたぶん後ろが繰り上がるので、最後の1枚だけ位置を戻す
    setCurrentIndex(prev => Math.min(prev, shuffledWords.length - 2));
  }, [currentIndex, shuffledWords, graduateWordAt, x, y]);

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
    swipeHandledRef.current = false;
    e.preventDefault();
    setIsDragging(true);
    grabbedCardRef.current = e.target.closest?.('[data-card-index]')
      || findCardAtPoint(e.clientX, e.clientY);
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
      paintSwipeFeedback(
        document.getElementById('flashcard'),
        swipeFeedbackFor(deltaX, deltaY),
      );
    } else if (viewMode === 'wordbook') {
      // 単語帳モードの場合、直接DOM操作でカードの位置を更新
      const activeCard = grabbedCardRef.current || findCardAtPoint(dragStart.x, dragStart.y);
      
      if (activeCard) {
        // 単語帳モードでは左右スワイプで評価、上下スワイプで削除
        let limitedDeltaX = 0;
        let limitedDeltaY = 0;
        
        logger.debug('🔥 LearningFlashcard Wordbook mode movement:', { deltaX, deltaY, absDeltaX: Math.abs(deltaX), absDeltaY: Math.abs(deltaY) });
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // 左右スワイプ（評価）の場合
          limitedDeltaX = Math.max(-60, Math.min(60, deltaX));
          logger.debug('🔥 LearningFlashcard Allowing horizontal movement for evaluation:', limitedDeltaX);
        } else if (Math.abs(deltaY) > Math.abs(deltaX)) {
          // 上下スワイプ（削除）の場合
          limitedDeltaY = Math.max(-150, Math.min(150, deltaY));
          logger.debug('🔥 LearningFlashcard Allowing vertical movement for deletion:', limitedDeltaY);
        }
        
        activeCard.style.transform = `translate(${limitedDeltaX}px, ${limitedDeltaY}px)`;
        
        // 単語帳モードでの視覚的フィードバック。
        // 上スワイプ（復習完了）は復習単語のときだけ使える。
        const feedback = swipeFeedbackFor(limitedDeltaX, limitedDeltaY, false);
        
        paintSwipeFeedback(activeCard, feedback);
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
    
    // スワイプ判定。ここはフラッシュカード（画面に1枚だけのカード）の話。
    // モードを見ずに走らせていたので、単語帳でカードをスワイプすると
    // 掴んだカードに加えて「フラッシュカードの現在の単語」まで処理され、
    // 2語ぶん動いていた（上スワイプなら2語が卒業していた）。
    const threshold = 100;
    if (viewMode === 'flashcard') {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // 右スワイプ（正解）
          handleCorrect();
        } else {
          // 左スワイプ（不正解）
          handleIncorrect();
        }
      } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > threshold && deltaY < 0) {
        // 上スワイプ（もう覚えた）。復習カードと同じ扱い。
        handleGraduateCurrent();
      }
    }
    
    grabbedCardRef.current = null;
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
      
      // 同じスワイプで2回処理しない（卒業が2回動くと隣の単語まで消える）
      if (swipeHandledRef.current) return;
      swipeHandledRef.current = true;

      const activeCard = grabbedCardRef.current || findCardAtPoint(dragStart.x, dragStart.y);
      
      if (activeCard) {
        const swipedIndex = Number(activeCard.dataset.cardIndex);

        // 縦は画面のスクロールに使う。上スワイプ（卒業）はカードの
        // ボタンに移した。一覧をたぐる指の動きと取り合いになるため。
        // 採点してもカードは一覧に残す。消してしまうと、どこまでやったかを
        // 見返せない。結果はカードの色で示す。
        if (isSwipe && Math.abs(deltaX) > Math.abs(deltaY)) {
          judgeWordAt(swipedIndex, deltaX > 0 ? 'good' : 'again');
        }
        activeCard.style.transform = 'translate(0px, 0px)';
        clearSwipeFeedback(activeCard);
      }
    }
  }, [isDragging, dragStart, x, y, viewMode, handleCorrect, handleIncorrect, judgeWordAt, handleGraduateCurrent]);

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
    swipeHandledRef.current = false;
    // 単語帳では既定の動作を止めない。preventDefault すると
    // 「答えを見る」のタップが click まで届かず、縦スクロールも殺される。
    if (viewMode !== 'wordbook') {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // マルチタッチの場合は無視
    if (e.touches.length > 1) {
      logger.debug('🔥 LearningFlashcard Multi-touch detected, ignoring');
      return;
    }
    
    // ダブルタップ検出（スマホ用）。カードをめくる操作なので
    // フラッシュカードだけ。単語帳では1タップで答えを出したい。
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (viewMode !== 'wordbook' && tapLength < 500 && tapLength > 0) {
      logger.debug('🔥 Double tap detected on mobile!');
      handleDoubleClick(e);
      setLastTap(0);
      return;
    }
    setLastTap(currentTime);
    
    setIsDragging(true);
    const touch = e.touches[0];
    // 触れたカードをここで押さえる。document 側のリスナー経由でも
    // e.target からたどれる。
    grabbedCardRef.current = e.target.closest?.('[data-card-index]')
      || findCardAtPoint(touch.clientX, touch.clientY);
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
    const touch = e.touches[0];

    const deltaX = touch.clientX - dragStart.x;
    const deltaY = touch.clientY - dragStart.y;

    if (viewMode === 'wordbook') {
      // 縦に振っているなら一覧のスクロール。ブラウザに任せる。
      // ここで無条件に preventDefault していたので、カードの上では
      // ページが動かなかった。
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
      if (e.cancelable) e.preventDefault();

      // 掴んだカードは指を置いた座標から引く。単語帳では document にも
      // リスナーを張っていて、そちら経由だと e.currentTarget が document に
      // なる。触っているカードを指さないので、色も動きも出ていなかった。
      const activeCard = grabbedCardRef.current || findCardAtPoint(dragStart.x, dragStart.y);
      if (!activeCard) return;

      // 指に少しついてくる。押せている手応えが無いと、スワイプが
      // 効いているのか分からない。横だけ、控えめに。
      const followX = Math.max(-60, Math.min(60, deltaX));
      activeCard.style.transform = `translate(${followX}px, 0px)`;
      paintSwipeFeedback(activeCard, swipeFeedbackFor(deltaX, deltaY, false));
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (viewMode === 'flashcard') {
      logger.debug('🔥 LearningFlashcard Touch move in flashcard mode:', { deltaX, deltaY });
      // motion valueを更新
      x.set(deltaX);
      y.set(deltaY);
      logger.debug('🔥 LearningFlashcard Motion values updated:', { xValue: x.get(), yValue: y.get() });
      
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
    
    logger.debug('🔥 Touch end:', { deltaX, deltaY });
    
    // カードの色をリセット
    if (e.currentTarget) {
      e.currentTarget.style.setProperty('background-color', 'white', 'important');
    }
    
    // スワイプ判定。ここはフラッシュカード（画面に1枚だけのカード）の話。
    // モードを見ずに走らせていたので、単語帳でカードをスワイプすると
    // 掴んだカードに加えて「フラッシュカードの現在の単語」まで処理され、
    // 2語ぶん動いていた（上スワイプなら2語が卒業していた）。
    const threshold = 100;
    if (viewMode === 'flashcard') {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
        if (deltaX > 0) {
          // 右スワイプ（正解）
          handleCorrect();
        } else {
          // 左スワイプ（不正解）
          handleIncorrect();
        }
      } else if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > threshold && deltaY < 0) {
        // 上スワイプ（もう覚えた）。復習カードと同じ扱い。
        handleGraduateCurrent();
      }
    }
    
    grabbedCardRef.current = null;
    setDragStart({ x: 0, y: 0 });
    
    if (viewMode === 'flashcard') {
      // フラッシュカードモードの場合、motion valueをリセット
      x.set(0);
      y.set(0);
    } else if (viewMode === 'wordbook') {
      // タッチイベントには clientX が無い。以前はここで e.clientX を見ていて
      // 差分が NaN になり、スマホでは単語帳のスワイプが全く効かなかった。
      // 上で touch から出した deltaX / deltaY をそのまま使う。
      const threshold = 50;
      const isSwipe = Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;
      
      // 同じスワイプで2回処理しない（卒業が2回動くと隣の単語まで消える）
      if (swipeHandledRef.current) return;
      swipeHandledRef.current = true;

      const activeCard = grabbedCardRef.current || findCardAtPoint(dragStart.x, dragStart.y);
      
      if (activeCard) {
        const swipedIndex = Number(activeCard.dataset.cardIndex);

        // 縦は画面のスクロールに使う。上スワイプ（卒業）はカードの
        // ボタンに移した。一覧をたぐる指の動きと取り合いになるため。
        // 採点してもカードは一覧に残す。消してしまうと、どこまでやったかを
        // 見返せない。結果はカードの色で示す。
        if (isSwipe && Math.abs(deltaX) > Math.abs(deltaY)) {
          judgeWordAt(swipedIndex, deltaX > 0 ? 'good' : 'again');
        }
        activeCard.style.transform = 'translate(0px, 0px)';
        clearSwipeFeedback(activeCard);
      }
    }
  }, [isDragging, dragStart, x, y, viewMode, handleCorrect, handleIncorrect, judgeWordAt, handleGraduateCurrent]);

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
        <div className="wordbook-list__grid">
          {shuffledWords.slice(wordbookProgress).map((word, index) => {
            const actualIndex = wordbookProgress + index;
            return (
            <motion.div
              key={word.id || actualIndex}
              data-card-index={actualIndex}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`wordbook-card${wordbookJudgements[actualIndex] ? ` wordbook-card--${wordbookJudgements[actualIndex]}` : ''}`}
            >
                <div className="wordbook-card__grid">
                {/* 左側：問題。英→和なら英単語、和→英なら意味 */}
                <div className="wordbook-card__side wordbook-card__left">
                  <div className="wordbook-card__tools">
                    <BookmarkButton
                      size="inline"
                      active={isBookmarked(word)}
                      onToggle={() => toggleBookmark(word)}
                      label={word.word}
                    />
                    {/* 卒業。上スワイプだと一覧のスクロールと取り合いになるので
                        ボタンにしている。 */}
                    <button
                      type="button"
                      className="wordbook-graduate"
                      onClick={(e) => { e.stopPropagation(); graduateWordAt(actualIndex); }}
                      aria-label={`${word.word} はもう覚えた。復習から外す`}
                      title="もう覚えた（復習から外す）"
                    >
                      <FaCheck aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={isJaToEn ? 'wordbook-word wordbook-word--ja' : 'wordbook-word'}
                    onClick={() => (isJaToEn ? speak(word.meaning, 'ja-JP') : speak(word.word))}
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

                {/* 右側：和訳・例文（赤シート） */}
                <div
                  className="wordbook-card__side wordbook-card__right"
                  onMouseDown={() => handleRevealStart(actualIndex)}
                  onTouchStart={() => handleRevealStart(actualIndex)}
                >
                  {/* 赤シート。長押しを必須にしない（計画書7.5）。
                      ボタンにして、クリックとキーボードでも開けるようにする。 */}
                  {!revealedCards.has(actualIndex) && (
                    <button
                      type="button"
                      className="wordbook-veil"
                      onClick={(e) => { e.stopPropagation(); handleRevealStart(actualIndex); }}
                      aria-label={`${word.word} の答えを見る`}
                    >
                      答えを見る
                    </button>
                  )}
                  {revealedCards.has(actualIndex) && (
                    <button
                      type="button"
                      className="wordbook-veil-hide"
                      onClick={(e) => { e.stopPropagation(); handleRevealEnd(actualIndex); }}
                    >
                      隠す
                    </button>
                  )}

                  {/* 実際のコンテンツ */}
                  {/* 赤シートの開閉は actualIndex で見る。index（切り出し後の
                      並び）と混ぜていたので、前回の続きから開いたときだけ
                      「答えを見る」を押しても中身が薄いままだった。 */}
                  <div style={{
                    opacity: revealedCards.has(actualIndex) ? 1 : 0.3,
                    transition: 'opacity 0.2s ease'
                  }}>
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

      {/* 上に戻るボタン。カードに被らないよう右下の余白へ寄せる。 */}
      <div className="wordbook-to-top">
        <button
          type="button"
          onClick={() => scrollWordbookToTop(wordbookShellRef.current)}
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
      {/* 戻る・セッション名・現在数・進捗をヘッダーにまとめる（計画書7.3 / 7.7）。
          モード切替はヘッダー直下のアンダータブに置く。 */}
      <SessionHeader
        title={title || '新規学習'}
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
        <div className="mode-tabs__controls">
          {/* 速さは自動再生中だけ出す。止まっているときは関係がない */}
          {autoPlay && <AutoPlaySpeed value={autoPlaySpeed} onChange={setAutoPlaySpeed} />}
          <DirectionToggle value={direction} onChange={setDirection} />
        </div>
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
          <CardFace className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
            {/* 和→英のときは意味が問題になる。発音記号は答えを教えてしまうので出さない。 */}
            <p id="card-front-text" className={isJaToEn ? 'card-front-text--ja' : undefined}>
              {isJaToEn
                ? (currentWord?.japanese || currentWord?.meaning || 'Loading...')
                : (currentWord?.word || 'Loading...')}
            </p>
            {!isJaToEn && (currentWord?.pronunciation || getPronunciation(currentWord?.word)) && (
              <p className="card-pronunciation">[{currentWord.pronunciation || getPronunciation(currentWord.word)}]</p>
            )}
          </CardFace>
          <CardFace className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord?.word || 'Loading...'}</h3>
            {(currentWord?.pronunciation || getPronunciation(currentWord?.word)) && (
              <p className="card-pronunciation">[{currentWord.pronunciation || getPronunciation(currentWord.word)}]</p>
            )}
            <p id="card-back-meaning">{currentWord?.japanese || currentWord?.meaning || 'Loading...'}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example || ''}</p>
            <p className="example-text-ja">{currentWord?.exampleJa || ''}</p>
          </CardFace>
        </motion.div>
      </div>

      {/* スワイプを知らなくても完走できるようにする（計画書7.5 / 7.8） */}
      <PeekNudge trigger={peekCount} />
      <AnswerControls
        onCorrect={handleCorrect}
        onIncorrect={handleIncorrect}
        onHard={handleHard}
      />

      {/* 進捗はヘッダーに出しているので、ここでは操作だけ置く。
          復習カードと同じ .session-footer に揃える（下端の余白と安全領域を持つ）。 */}
      <div className="session-footer">
        <button
          type="button"
          className="ghost-button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          <FaUndo aria-hidden="true" /> 前の単語
        </button>
        {/* 上スワイプと同じ処理。復習カードと同じものを置く。新規学習でも
            上スワイプは「もう覚えた」として同じ扱いになっている。
            「前の画面に戻る」は置かない。ヘッダーの「終了」と同じ行き先で、
            同じ画面に戻る道が2つあると、どちらが本当か迷う。 */}
        <button
          type="button"
          className="ghost-button"
          onClick={handleGraduateCurrent}
          title="上スワイプと同じ。もう出題されなくなります"
        >
          <FaArrowUp aria-hidden="true" /> リストから削除
        </button>
      </div>
    </div>
  );
}

