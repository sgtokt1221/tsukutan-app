import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import { FaArrowUp, FaUndo, FaArrowLeft, FaPlay, FaStop, FaCheck } from 'react-icons/fa';

import AnswerControls from './components/learning/AnswerControls';
import PeekNudge from './components/learning/PeekNudge';
import SessionHeader from './components/learning/SessionHeader';
import ModeTabs from './components/learning/ModeTabs';
import WordbookZoomSlider from './components/learning/WordbookZoomSlider';
import DirectionToggle from './components/learning/DirectionToggle';
import AutoPlaySpeed from './components/learning/AutoPlaySpeed';
import BookmarkButton from './components/learning/BookmarkButton';
import CardFace from './components/learning/CardFace';
import WordbookList from './components/learning/WordbookList';
import { studyModePolicy, sessionTitle } from './logic/studyMode';
import { finishedLog, leftLog } from './logic/studyLog';
import { flashcardGesture, wordbookGesture, findCardAtPoint } from './logic/cardGestures';
import { usePendingWrites } from './logic/usePendingWrites';
// 勉強時間を測るのは**ここ1か所だけ**（→ `logic/studySession.js`）。
// 自前で `new Date()` の差を取ると、つくばホームへ送る値と食い違う
import { startStudySession, endStudySession, noteActivity } from './logic/studySession.js';
import { initialize, speak, speakWordThenMeaning } from './logic/speechUtils';
import { prefetchClips } from './logic/audioLibrary';
// 忘却曲線に基づき、単語の習熟度を更新するロジック
import { updateUserWordProgress, undoWordProgress } from './logic/reviewLogic';
import logger from './logic/logger';
import { usePronunciation } from './logic/usePronunciation';
import { swipeFeedbackFor, paintSwipeFeedback, clearSwipeFeedback, cardColorAt } from './logic/swipeFeedback';
import { scrollWordbookToTop } from './logic/scrollHelpers';
import { useWordbookZoom } from './logic/useWordbookZoom';
import { useCardDirection } from './logic/useCardDirection';
import { useAutoPlaySpeed } from './logic/useAutoPlaySpeed';
import { useAutoPlay } from './logic/useAutoPlay';
import { useBookmarks } from './logic/useBookmarks';

/**
 * 単語カード。**新規（今日の新規・おかわり・自由学習・毎日みる単語）と復習の両方がこれ1つ。**
 *
 * 2026-09-23 まで新規（LearningFlashcard）と復習（ReviewFlashcard）の2本があり、
 * 片方だけ直して食い違うことを繰り返した（上スワイプ・ボタンの言葉・1回タップ）。
 * **モードごとの違いは `logic/studyMode.js` の表だけに置く。** ここに「復習なら」を書かない。
 *
 * 見せ方は2つ：フラッシュカード（1枚ずつ）と単語帳（一覧）。
 */

/** 並びを混ぜる（Fisher-Yates） */
const shuffleArray = (array) => {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** 読み上げる意味。単語の出どころ（マスター / Firestore / 復習の写し）で欄の名前が違う */
const spokenMeaning = (word) => word?.meaning || word?.japanese || word?.translation;

/** 採点の色・赤シートを覚える鍵。**番号で覚えない**（1語外すと隣へずれる） */
const keyOf = (word) => word?.id || word?.word;

export default function StudyFlashcard({
  words, onBack, initialIndex = 0, sessionInfo, onSaveLog,
  // どの入口から来たか（'daily' | 'extra' | 'free' | 'bookmark' | 'review'）。
  // 上スワイプ・「外す」・見出し・記録の形はここから決まる（→ logic/studyMode.js）
  learningMode,
  // 今日の新規だけ渡る。初めて最後まで終えたときに今日のタスクを済みにする
  onFirstCompletion,
  // 今日の新規・おかわりだけ渡る。1語ずつ記録して、途中で閉じても再開できるようにする
  onWordAnswered,
}) {
  const policy = studyModePolicy(learningMode);
  const allowSwipeUp = policy.swipeUp;
  const title = sessionTitle(learningMode, sessionInfo);

  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [viewMode, setViewMode] = useState('flashcard'); // 'flashcard' | 'wordbook'
  // 単語帳：赤シートを開いている語・採点した語（どちらも単語の鍵で持つ）
  const [revealed, setRevealed] = useState(() => new Set());
  const [judgements, setJudgements] = useState({});
  const [wordbookProgress, setWordbookProgress] = useState(0);
  // 答えを見たまま「わかった」を押した回数。吹き出しの発火に使う
  const [peekCount, setPeekCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  /*
    **閉じている最中の掛け金。** 最後の1語のあと書き込みを待つあいだに、
    もう一度「わかった」や「終了」を押されると、記録と onBack が2回走る
    （電波が悪いと待ちは数秒ある）。画面も「保存しています」に替える。
  */
  const finishingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  // 描画に使わない数は ref で持つ。state だと最後の1語を答えた瞬間の値が古い
  const hasCompletedRef = useRef(false);
  const incorrectRef = useRef([]);
  // 復習の記録に載せる数（「わかった」「迷った」と「もう覚えた」）。→ logic/studyLog.js
  const graduatedRef = useRef(0);
  // このセッションで初めて記録した単語のID。習得語数はここから数える。
  // 画面のインデックス数だと、戻る・再回答で二重に数えてしまう
  const newlyLearnedIdsRef = useRef(new Set());
  // 採点する前の状態。単語帳で同じ向きにもう一度振ったときに戻す先
  const undoStateRef = useRef({});
  // 1回のスワイプを1回だけ処理するための掛け金。カード自身の onMouseUp と
  // document の mouseup が両方走るので、無いと卒業が2回動き隣の単語まで消えていた
  const swipeHandledRef = useRef(false);
  // 掴んだカード。動かすと矩形もずれるので、指を置いた時点で覚える
  const grabbedCardRef = useRef(null);
  const wordbookShellRef = useRef(null);
  // 親から毎回新しい関数が来るので、依存に入れずに最新を参照する
  const onWordAnsweredRef = useRef(onWordAnswered);
  onWordAnsweredRef.current = onWordAnswered;

  const auth = getAuth();
  const uid = auth.currentUser?.uid || null;
  const { isBookmarked, toggle: toggleBookmarkRaw } = useBookmarks(uid);
  const { trackWrite, flushWrites } = usePendingWrites();
  /*
    **★の付け外しも、閉じる前に待つ書き込みに入れる。** 待たずに閉じると、
    ホームが読み直す「毎日みる単語」の数が付け外しの前の数になる（エラーは出ない）。
  */
  const toggleBookmark = useCallback((word) => trackWrite(toggleBookmarkRaw(word)), [trackWrite, toggleBookmarkRaw]);
  // 文字サイズ・出題の向き・自動再生の速さは、どのモードでも同じ設定を使う
  const [wordbookZoom, setWordbookZoom] = useWordbookZoom();
  const [direction, setDirection] = useCardDirection();
  const isJaToEn = direction === 'ja-en';
  const [autoPlaySpeed, setAutoPlaySpeed, autoPlayGapMs] = useAutoPlaySpeed();
  const getPronunciation = usePronunciation();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform([x, y], ([lx, ly]) => cardColorAt(lx, ly, allowSwipeUp));

  const resetCard = useCallback(() => {
    setIsFlipped(false);
    x.set(0);
    y.set(0);
  }, [x, y]);

  const { autoPlay, start: startAutoPlay, stop: stopAutoPlay } = useAutoPlay({
    words: cards,
    currentIndex,
    direction,
    gapMs: autoPlayGapMs,
    enabled: viewMode === 'flashcard',
    onRevealMeaning: () => setIsFlipped(true),
    onAdvance: (nextIndex) => {
      setCurrentIndex(nextIndex);
      resetCard();
    },
  });

  /*
    **単語帳の自動再生**（2026-09-23 に足した）。画面に見えている一番上のカードから順に読み、
    答えを読み始めたところでそのカードの赤シートをめくり、次のカードへスクロールする。
    フラッシュカードと同じ部品（useAutoPlay）を、見せ方ごとに1つずつ持つ。
  */
  const [wordbookPlayIndex, setWordbookPlayIndex] = useState(-1);
  const wordbookPlayRef = useRef(-1);
  const scrollToCard = useCallback((index) => {
    const el = wordbookShellRef.current?.querySelector(`[data-card-index="${index}"]`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, []);
  const playWordbookAt = useCallback((index) => {
    wordbookPlayRef.current = index;
    setWordbookPlayIndex(index);
    scrollToCard(index);
  }, [scrollToCard]);
  const {
    autoPlay: wordbookAutoPlay, start: startWordbookAuto, stop: stopWordbookAutoPlay,
  } = useAutoPlay({
    words: cards,
    currentIndex: 0,
    direction,
    gapMs: autoPlayGapMs,
    enabled: viewMode === 'wordbook',
    // 答えを読み始めたら、そのカードの赤シートをめくる（読み上げは useAutoPlay がしている）
    onRevealMeaning: () => {
      const word = cards[wordbookPlayRef.current];
      if (word) setRevealed((prev) => new Set([...prev, keyOf(word)]));
    },
    onAdvance: (nextIndex) => playWordbookAt(nextIndex),
  });
  // 止まったら（最後まで読んだ・止めた・見せ方を替えた）枠を外す
  useEffect(() => {
    if (!wordbookAutoPlay) {
      wordbookPlayRef.current = -1;
      setWordbookPlayIndex(-1);
    }
  }, [wordbookAutoPlay]);

  useEffect(() => {
    initialize().catch((error) => console.error('Speech initialization failed:', error));
  }, []);

  /*
    **開始位置は words / sessionInfo / initialIndex が変わったときだけ入れる。**
    以前は並びの長さが変わるたびにも入れ直していたので、1語外すと
    開始位置（自由学習の前回の続き）へ戻っていた（2026-09-23 に直した）。
  */
  useEffect(() => {
    const list = Array.isArray(words) ? words : [];
    setCards(policy.shuffle ? shuffleArray(list) : list);
    setCurrentIndex(initialIndex);
    graduatedRef.current = 0;
    // **裏に回っているあいだは数えない。** 測り方は1か所にまとめてある
    startStudySession();
    // policy.shuffle はモードで決まり、セッション中に変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, sessionInfo, initialIndex]);

  // このセッションで使う音声を先に取っておく。1語目から待たずに鳴らすため
  useEffect(() => {
    const head = cards.slice(0, 40);
    if (head.length === 0) return;
    prefetchClips(head.flatMap((word) => [
      { text: word.word, lang: 'en-US' },
      { text: spokenMeaning(word), lang: 'ja-JP' },
    ]));
  }, [cards]);

  // 単語帳の続き位置を読む（書く側は今どこにも無い。→ 報告済み）
  useEffect(() => {
    if (viewMode !== 'wordbook' || cards.length === 0) return;
    const key = `${policy.storageKey}_${sessionInfo?.filterType || 'default'}_${sessionInfo?.filterValue || 'all'}`;
    const saved = parseInt(localStorage.getItem(key), 10);
    if (Number.isFinite(saved) && saved < cards.length) setWordbookProgress(saved);
  }, [viewMode, cards, sessionInfo, policy.storageKey]);

  const currentWord = cards[currentIndex];

  // ---- 閉じる ----

  const exit = useCallback(() => {
    onBack(incorrectRef.current, newlyLearnedIdsRef.current.size);
  }, [onBack]);

  /** 最後の1語まで終えた。**答えたときも、最後の1語を外したときもここを通る** */
  const finishSession = useCallback(async (lastIndex) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    if (!hasCompletedRef.current && onFirstCompletion) {
      hasCompletedRef.current = true;
      onFirstCompletion();
    }
    const { activeMs } = endStudySession();
    if (sessionInfo && onSaveLog) {
      onSaveLog(finishedLog(policy.logSchema, {
        sessionInfo, index: lastIndex, activeMs, graduatedCount: graduatedRef.current,
      }));
    }
    // 書き込みを取りこぼさないよう、画面を閉じる前に待つ
    await flushWrites();
    exit();
  }, [onFirstCompletion, sessionInfo, onSaveLog, policy.logSchema, flushWrites, exit]);

  /** 「終了」。**どの画面の「終了」もここを通る**（以前は新規のフラッシュカードだけ記録を飛ばしていた） */
  const handleLeave = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const { activeMs } = endStudySession();
    const log = leftLog(policy.logSchema, {
      sessionInfo, index: currentIndex, total: cards.length, activeMs, graduatedCount: graduatedRef.current,
    });
    if (log && onSaveLog) onSaveLog(log);
    exit();
  }, [policy.logSchema, sessionInfo, currentIndex, cards.length, onSaveLog, exit]);

  // ---- 答える ----

  /** 採点を書く。新しく覚えた語と、今日の新規の進み具合もここで拾う */
  const recordAnswer = useCallback((word, quality, wasRevealed) => {
    if (!uid || !word) return null;
    return trackWrite(
      updateUserWordProgress(uid, word, quality, false, undefined, { revealed: wasRevealed })
        .then((result) => {
          if (result?.created) newlyLearnedIdsRef.current.add(word.id);
          onWordAnsweredRef.current?.(word.id);
          return result;
        })
        // 電波が無いときは失敗する。画面は止めない（閉じる前の flushWrites は待つ）
        .catch((error) => {
          logger.warn('採点を記録できませんでした', error);
          return null;
        }),
    );
  }, [uid, trackWrite]);

  /** フラッシュカードで答えた（わかった / 迷った / もう一度） */
  const handleAnswer = useCallback(async (quality) => {
    // **手を動かした印。** 放置の判定と、つくばホームへ送る新規語数／復習語数の分かれ目
    noteActivity(policy.activity);
    const word = cards[currentIndex];
    // 答えを見たまま「わかった」を押したら、止めはしないが気づかせる
    if (isFlipped && quality === 'good') setPeekCount((prev) => prev + 1);

    recordAnswer(word, quality, isFlipped);
    if (word && quality === 'again') {
      incorrectRef.current = [...incorrectRef.current.filter((w) => w.id !== word.id), word];
    } else if (word && uid) {
      graduatedRef.current += 1;
    }

    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      resetCard();
    } else {
      await finishSession(currentIndex);
    }
  }, [policy.activity, cards, currentIndex, isFlipped, recordAnswer, uid, resetCard, finishSession]);

  const handleCorrect = useCallback(() => handleAnswer('good'), [handleAnswer]);
  const handleHard = useCallback(() => handleAnswer('hard'), [handleAnswer]);
  const handleIncorrect = useCallback(() => handleAnswer('again'), [handleAnswer]);

  // ---- 外す ----

  /**
   * 「外す」。モードで中身が違う（→ logic/studyMode.js）。
   * 毎日みる単語では★を外すだけで、覚えた記録にはしない。
   * **どのモードでも一覧から取り除く**（以前の復習は進むだけで、「前の単語」で戻ると出てきた）。
   */
  const removeWord = useCallback((word) => {
    if (!word) return;
    if (policy.remove === 'unbookmark') {
      if (isBookmarked(word)) toggleBookmark(word);
    } else {
      if (uid) {
        trackWrite(updateUserWordProgress(uid, word, true, true)
          .catch((error) => logger.warn('もう覚えたを記録できませんでした', error)));
      }
      graduatedRef.current += 1;
    }
    // 取り除くのは番号ではなく単語そのもの。同じスワイプで2回走っても2枚目が消えない
    setCards((prev) => prev.filter((entry) => entry !== word));
    /*
      **フラッシュカードの位置を合わせる。** 単語帳で手前の語を外すと後ろが繰り上がり、
      フラッシュカードへ戻ったときに1語飛ぶ。末尾より先を指すと何も描けない。
    */
    const pos = cards.indexOf(word);
    if (pos === -1) return;
    const lastAfter = Math.max(0, cards.length - 2);
    setCurrentIndex((i) => Math.min(pos < i ? i - 1 : i, lastAfter));
  }, [policy.remove, isBookmarked, toggleBookmark, uid, trackWrite, cards]);

  /**
   * フラッシュカードで外す（ボタン、または上スワイプが効くモードの上スワイプ）。
   * 後ろの語が繰り上がってくるので位置はそのまま。**最後の1語なら終える**
   * （以前は新規だと「単語がありません」の画面に落ち、復習だと記録を飛ばして閉じていた）。
   */
  const handleRemoveCurrent = useCallback(async () => {
    const word = cards[currentIndex];
    if (!word) return;
    removeWord(word);
    resetCard();
    if (currentIndex >= cards.length - 1) await finishSession(currentIndex);
  }, [cards, currentIndex, removeWord, resetCard, finishSession]);

  // ---- めくる・戻る ----

  const handleFlip = useCallback(() => {
    const word = cards[currentIndex];
    if (!word) return;
    setIsFlipped((prev) => !prev);
    // 英語を読んでから意味を読む。音だけで確認できるようにする
    if (!isFlipped) speakWordThenMeaning(word.word, spokenMeaning(word), direction);
  }, [cards, currentIndex, isFlipped, direction]);

  const handlePrev = useCallback(() => {
    if (currentIndex === 0) return;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    resetCard();
  }, [currentIndex, resetCard]);

  // ---- 単語帳 ----

  const judgementOf = useCallback((word) => judgements[keyOf(word)], [judgements]);
  const isRevealed = useCallback((word) => revealed.has(keyOf(word)), [revealed]);

  const revealWord = useCallback((word) => {
    const key = keyOf(word);
    if (revealed.has(key)) return;
    // 意味が見えるのと同時に英語→日本語で読み上げる
    speakWordThenMeaning(word.word, spokenMeaning(word), direction);
    setRevealed((prev) => new Set([...prev, key]));
  }, [revealed, direction]);

  const hideWord = useCallback((word) => {
    const key = keyOf(word);
    setRevealed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  /**
   * 単語帳での左右スワイプ。その単語を採点し、結果を色で残す。
   * 同じ向きにもう一度振ったら取り消す（色だけでなく間隔と繰り返し回数も戻す）。
   */
  const judgeWord = useCallback((word, quality) => {
    if (!word) return;
    const key = keyOf(word);
    const mark = quality === 'again' ? 'incorrect' : 'correct';

    if (judgements[key] === mark) {
      const previous = undoStateRef.current[word.id];
      if (uid && previous) trackWrite(undoWordProgress(uid, word.id, previous));
      delete undoStateRef.current[word.id];
      setJudgements((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    const write = recordAnswer(word, quality, revealed.has(key));
    write?.then((result) => {
      // 1回目の採点の前の状態だけ覚える。戻る先は「触る前」
      if (result?.previous && !undoStateRef.current[word.id]) undoStateRef.current[word.id] = result.previous;
    }).catch((error) => logger.warn('単語帳の採点を記録できませんでした', error));
    setJudgements((prev) => ({ ...prev, [key]: mark }));
  }, [judgements, uid, trackWrite, recordAnswer, revealed]);

  /** 単語帳の自動再生を始める。**画面に見えている一番上のカードから** */
  const startWordbookAutoPlay = useCallback(() => {
    const shell = wordbookShellRef.current;
    const cardsEls = shell ? [...shell.querySelectorAll('[data-card-index]')] : [];
    const headerBottom = shell?.querySelector('.wordbook-header')?.getBoundingClientRect().bottom ?? 0;
    const firstVisible = cardsEls.find((el) => el.getBoundingClientRect().bottom > headerBottom + 8);
    const from = firstVisible ? Number(firstVisible.dataset.cardIndex) : wordbookProgress;
    playWordbookAt(from);
    startWordbookAuto(from);
  }, [wordbookProgress, playWordbookAt, startWordbookAuto]);

  const speakWordbookWord = useCallback((word) => (
    isJaToEn ? speak(word.meaning, 'ja-JP') : speak(word.word, 'en-US')
  ), [isJaToEn]);

  // ---- 指の動き ----
  // 判定は logic/cardGestures.js。ここは座標を集めて、判定の結果を実行するだけ

  /** 指（またはマウス）を離した。フラッシュカードと単語帳で分ける */
  const endGesture = useCallback((dx, dy) => {
    if (viewMode === 'flashcard') {
      const action = flashcardGesture(dx, dy, allowSwipeUp);
      if (action === 'good') handleCorrect();
      else if (action === 'again') handleIncorrect();
      else if (action === 'remove') handleRemoveCurrent();
      else if (action === 'flip') handleFlip();
      x.set(0);
      y.set(0);
      return;
    }
    // 単語帳。同じスワイプで2回処理しない（卒業が2回動くと隣の単語まで消える）
    if (swipeHandledRef.current) return;
    swipeHandledRef.current = true;
    const card = grabbedCardRef.current || findCardAtPoint(dragStart.x, dragStart.y);
    if (!card) return;
    const action = wordbookGesture(dx, dy);
    if (action) judgeWord(cards[Number(card.dataset.cardIndex)], action);
    card.style.transform = 'translate(0px, 0px)';
    clearSwipeFeedback(card);
  }, [viewMode, allowSwipeUp, handleCorrect, handleIncorrect, handleRemoveCurrent, handleFlip, x, y, dragStart, judgeWord, cards]);

  /** 動かしている最中。フラッシュカードはカードごと、単語帳は横にだけ控えめについてくる */
  const moveGesture = useCallback((dx, dy) => {
    if (viewMode === 'flashcard') {
      x.set(dx);
      y.set(dy);
      paintSwipeFeedback(document.getElementById('flashcard'), swipeFeedbackFor(dx, dy, allowSwipeUp));
      return;
    }
    const card = grabbedCardRef.current || findCardAtPoint(dragStart.x, dragStart.y);
    if (!card) return;
    // 押せている手応えが無いと、スワイプが効いているのか分からない。横だけ、控えめに
    const followX = Math.max(-60, Math.min(60, dx));
    card.style.transform = `translate(${followX}px, 0px)`;
    paintSwipeFeedback(card, swipeFeedbackFor(dx, dy, false));
  }, [viewMode, x, y, allowSwipeUp, dragStart]);

  const beginGesture = useCallback((target, clientX, clientY) => {
    swipeHandledRef.current = false;
    setIsDragging(true);
    grabbedCardRef.current = target?.closest?.('[data-card-index]') || findCardAtPoint(clientX, clientY);
    setDragStart({ x: clientX, y: clientY });
  }, []);

  const finishGesture = useCallback((dx, dy) => {
    setIsDragging(false);
    const flashcard = document.getElementById('flashcard');
    if (flashcard) clearSwipeFeedback(flashcard);
    endGesture(dx, dy);
    grabbedCardRef.current = null;
    setDragStart({ x: 0, y: 0 });
  }, [endGesture]);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    beginGesture(e.target, e.clientX, e.clientY);
  }, [beginGesture]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    // 単語帳では縦はスクロール。カードを動かさない
    if (viewMode === 'wordbook' && Math.abs(dx) <= Math.abs(dy)) return;
    moveGesture(dx, dy);
  }, [isDragging, dragStart, viewMode, moveGesture]);

  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    e.preventDefault();
    finishGesture(e.clientX - dragStart.x, e.clientY - dragStart.y);
  }, [isDragging, dragStart, finishGesture]);

  const handleTouchStart = useCallback((e) => {
    // 単語帳では既定の動作を止めない。preventDefault すると
    // 「答えを見る」のタップが click まで届かず、縦スクロールも殺される
    if (viewMode !== 'wordbook') {
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.touches.length > 1) return; // マルチタッチは無視
    const touch = e.touches[0];
    // めくるのは指を離したとき。ほとんど動かなければタップとみなす
    beginGesture(e.target, touch.clientX, touch.clientY);
  }, [viewMode, beginGesture]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging || e.touches.length > 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - dragStart.x;
    const dy = touch.clientY - dragStart.y;
    // 単語帳で縦に振っているなら一覧のスクロール。ブラウザに任せる
    if (viewMode === 'wordbook' && Math.abs(dx) <= Math.abs(dy)) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    moveGesture(dx, dy);
  }, [isDragging, dragStart, viewMode, moveGesture]);

  const handleTouchEnd = useCallback((e) => {
    if (!isDragging) return;
    // 単語帳では既定の動作を止めない。touchend で preventDefault すると、
    // そのあとの click が作られず「隠す」が押しても何も起きないボタンになる
    if (viewMode !== 'wordbook') {
      e.preventDefault();
      e.stopPropagation();
    }
    const touch = e.changedTouches[0];
    finishGesture(touch.clientX - dragStart.x, touch.clientY - dragStart.y);
  }, [isDragging, viewMode, dragStart, finishGesture]);

  // マウスはカードの外で離すことがあるので、掴んでいるあいだは document で受ける
  useEffect(() => {
    if (!isDragging) return undefined;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 単語帳の指は document で受ける（passive: false でないと横スワイプ中に一覧が動く）
  useEffect(() => {
    if (viewMode !== 'wordbook') return undefined;
    const onStart = (e) => { if (e.target.closest('[data-card-index]')) handleTouchStart(e); };
    const onMove = (e) => { if (isDragging) handleTouchMove(e); };
    const onEnd = (e) => { if (isDragging) handleTouchEnd(e); };
    document.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [viewMode, isDragging, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ---- 描く ----

  if (finishing) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <p role="status">保存しています…</p>
      </div>
    );
  }

  if (cards.length === 0 || !currentWord) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
        <div className="test-header">
          <h3>{title}</h3>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>{policy.emptyText}</p>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <button onClick={handleLeave} style={{
            padding: '12px 24px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}>
            <FaArrowLeft /> 前の画面に戻る
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'wordbook') {
    return (
      <div
        className="wordbook-shell"
        ref={wordbookShellRef}
        style={{ '--wordbook-zoom': wordbookZoom / 100 }}
      >
        <div className="wordbook-header">
          <SessionHeader
            title={`${title}（${cards.length}語）`}
            current={wordbookProgress}
            total={cards.length}
            onBack={handleLeave}
            backLabel="終了"
            actions={(
              <button
                type="button"
                className={wordbookAutoPlay ? 'session-header__icon-btn is-active' : 'session-header__icon-btn'}
                onClick={wordbookAutoPlay ? stopWordbookAutoPlay : startWordbookAutoPlay}
                aria-pressed={wordbookAutoPlay}
                aria-label={wordbookAutoPlay ? '自動読み上げを止める' : '自動読み上げを始める'}
              >
                {wordbookAutoPlay ? <FaStop aria-hidden="true" /> : <FaPlay aria-hidden="true" />}
              </button>
            )}
          />
          <ModeTabs value="wordbook" onChange={setViewMode}>
            <div className="mode-tabs__controls">
              {/* 速さは自動再生中だけ出す（フラッシュカードと同じ） */}
              {wordbookAutoPlay && <AutoPlaySpeed value={autoPlaySpeed} onChange={setAutoPlaySpeed} />}
              <DirectionToggle value={direction} onChange={setDirection} />
              <WordbookZoomSlider value={wordbookZoom} onChange={setWordbookZoom} />
            </div>
          </ModeTabs>
        </div>

        <WordbookList
          words={cards}
          startIndex={wordbookProgress}
          isJaToEn={isJaToEn}
          policy={policy}
          getPronunciation={getPronunciation}
          judgementOf={judgementOf}
          isRevealed={isRevealed}
          onReveal={revealWord}
          onHide={hideWord}
          onRemove={removeWord}
          onSpeak={speakWordbookWord}
          isBookmarked={isBookmarked}
          onToggleBookmark={toggleBookmark}
          playingIndex={wordbookPlayIndex}
          gestureHandlers={{
            onMouseDown: handleMouseDown,
            onMouseMove: handleMouseMove,
            onMouseUp: handleMouseUp,
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
          }}
        />

        {/* 上に戻るボタン。カードに被らないよう右下の余白へ寄せる */}
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
  }

  const pronunciation = currentWord?.pronunciation || getPronunciation(currentWord?.word);
  // カードに出す意味。表示は japanese を先に見る（2本とも同じだった）
  const shownMeaning = currentWord?.japanese || currentWord?.meaning;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* 戻る・セッション名・現在数・進捗をヘッダーにまとめる（計画書7.3 / 7.7）。
          モード切替はヘッダー直下のアンダータブに置く。 */}
      <SessionHeader
        title={title}
        current={currentIndex + 1}
        total={cards.length}
        onBack={handleLeave}
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
            transition: { duration: 0.4 },
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <CardFace className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
            {/* 和→英のときは意味が問題になる。発音記号は答えを教えてしまうので出さない。 */}
            <p id="card-front-text" className={isJaToEn ? 'card-front-text--ja' : undefined}>
              {isJaToEn ? shownMeaning : currentWord.word}
            </p>
            {!isJaToEn && pronunciation && (
              <p className="card-pronunciation">[{pronunciation}]</p>
            )}
          </CardFace>
          <CardFace className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord.word}</h3>
            {pronunciation && <p className="card-pronunciation">[{pronunciation}]</p>}
            <p id="card-back-meaning">{shownMeaning}</p>
            {(currentWord.example || currentWord.exampleJa) && <hr />}
            <p className="example-text">{currentWord.example || ''}</p>
            <p className="example-text-ja">{currentWord.exampleJa || ''}</p>
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
          「前の画面に戻る」は置かない。ヘッダーの「終了」と同じ行き先で、
          同じ画面に戻る道が2つあると、どちらが本当か迷う。 */}
      <div className="session-footer">
        <button
          type="button"
          className="ghost-button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          <FaUndo aria-hidden="true" /> 前の単語
        </button>
        {/* 外す。何をするか・上スワイプが効くかはモードで決まる（→ logic/studyMode.js） */}
        <button
          type="button"
          className="ghost-button"
          onClick={handleRemoveCurrent}
          title={policy.removeHint}
        >
          <FaCheck aria-hidden="true" /> {policy.removeLabel}
        </button>
      </div>
    </div>
  );
}
