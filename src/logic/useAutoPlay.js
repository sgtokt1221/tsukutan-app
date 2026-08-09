import { useCallback, useEffect, useRef, useState } from 'react';
import { speakSequence, stopSpeaking } from './speechUtils';

/**
 * カードの自動読み上げ。英語 → 意味 の順に読み、読み終えたら次の単語へ進む。
 *
 * 復習カードと学習カードで同じ挙動にするため、ここ1箇所に置く。
 * 以前は復習カードだけが持っていて、しかも「英語の完了待ち」と
 * 「日本語の完了待ち」を同時に走らせていたため、日本語が鳴り終わる前に
 * 次へ進んで英語と日本語がずれていた。読み上げの連結は onend に任せる。
 *
 * @param {object}   params
 * @param {Array}    params.words 読み上げる単語の配列
 * @param {number}   params.currentIndex 開始位置
 * @param {boolean}  params.enabled 使える画面か（単語帳モードでは false）
 * @param {Function} params.onRevealMeaning 意味を読み始めるときに呼ぶ（カードをめくる）
 * @param {Function} params.onAdvance 次の単語へ進むときに呼ぶ (nextIndex)
 */
export const useAutoPlay = ({ words, currentIndex, enabled = true, onRevealMeaning, onAdvance }) => {
  const [autoPlay, setAutoPlay] = useState(false);
  const timerRef = useRef(null);
  // 読み上げの完了通知は止めたあとにも届く。state だとクロージャが
  // 古いままなので ref で見る。
  const activeRef = useRef(false);

  // 最新のコールバックを参照する。依存に入れて再生成すると再生が途切れる。
  const handlersRef = useRef({ onRevealMeaning, onAdvance });
  handlersRef.current = { onRevealMeaning, onAdvance };

  const stop = useCallback(() => {
    activeRef.current = false;
    setAutoPlay(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 読み上げ中のぶんも打ち切る。止めたのに喋り続けるのを防ぐ。
    stopSpeaking();
  }, []);

  const start = useCallback(() => {
    if (!enabled || !Array.isArray(words) || words.length === 0) return;

    activeRef.current = true;
    setAutoPlay(true);

    const playAt = (index) => {
      if (!activeRef.current) return;
      const word = words[index];
      if (index >= words.length || !word) {
        activeRef.current = false;
        setAutoPlay(false);
        return;
      }

      const meaning = word.meaning || word.japanese || word.translation;

      speakSequence(
        [
          { text: word.word, lang: 'en-US' },
          {
            text: meaning,
            lang: 'ja-JP',
            onStart: () => handlersRef.current.onRevealMeaning?.(),
          },
        ],
        {
          onDone: () => {
            if (!activeRef.current) return;
            timerRef.current = setTimeout(() => {
              if (!activeRef.current) return;
              if (index < words.length - 1) {
                handlersRef.current.onAdvance?.(index + 1);
                playAt(index + 1);
              } else {
                activeRef.current = false;
                setAutoPlay(false);
              }
            }, 1000);
          },
        }
      );
    };

    playAt(currentIndex);
  }, [enabled, words, currentIndex]);

  // 画面を離れるときは必ず止める
  useEffect(() => stop, [stop]);

  // 単語帳モードへ切り替えたときなど、使えない状態になったら止める
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  return { autoPlay, start, stop };
};

export default useAutoPlay;
