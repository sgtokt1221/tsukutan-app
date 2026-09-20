import logger from './logger';
import { fetchClip } from './audioLibrary';
const synthesis = window.speechSynthesis;
let voices = [];
let initializationPromise = null;
// 発話中の utterance。GC で読み上げが切れるのを防ぐために保持するだけで、
// 読み出すことはない（Chrome は参照が消えると途中で音が切れる）。
// eslint-disable-next-line no-unused-vars
let activeUtterance = null;
// 実行中の読み上げの並び。打ち切ったあとに古いイベントで進まないようにする。
let activeSequence = null;
/*
  最後に cancel() を呼んだ時刻。

  **Chrome は cancel() の直後の speak() を黙って捨てる。**
  ところが直後は `synthesis.speaking` も `pending` も false なので、
  「鳴っていたら100ms待つ」という下の守りをすり抜ける。
  呼び出し側が stopSpeaking() してすぐ speakSequence() する経路
  （ReadingPanel の読み上げボタン）がまさにこれで、**2回目以降が無音になる**。
  鳴っているかではなく「直前に打ち切ったか」で待つ。
*/
let lastCancelAt = 0;
const CANCEL_GUARD_MS = 150;

const noteCancel = () => {
  lastCancelAt = Date.now();
};

/*
  待ってから積むぶんの予約。**止めたら取り消す。**
  取り消さないと、止めたあとに前の予約が起きて鳴り、次のぶんと重なる
  （押し直すたびに古い文が混ざる）。
*/
let pendingStart = null;
const scheduleStart = (run, ms) => {
  clearTimeout(pendingStart);
  pendingStart = setTimeout(run, ms);
};
const cancelScheduledStart = () => {
  clearTimeout(pendingStart);
  pendingStart = null;
};

const initialize = () => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = new Promise((resolve, reject) => {
    const loadVoices = () => {
      const availableVoices = synthesis.getVoices();
      if (availableVoices.length > 0) {
        // すべての音声を保存（英語・日本語両方）
        voices = availableVoices;
        
        logger.debug('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
        
        // イベントリスナーをクリーンアップ
        synthesis.onvoiceschanged = null;
        resolve();
      }
    };

    // 即座に試行
    loadVoices();
    
    // 音声がまだ読み込まれていない場合、イベントを待つ
    if (voices.length === 0) {
      if (synthesis.onvoiceschanged !== undefined) {
        synthesis.onvoiceschanged = loadVoices;
      } else {
        // 音声が利用できない場合でも初期化を完了
        console.warn('No voices available, will use default settings');
        voices = [];
        resolve();
      }
    }
  });

  return initializationPromise;
};

/** テキストと言語から utterance を組み立てる。音声の選び方はここ1箇所に集める。 */
const buildUtterance = (text, lang) => {
  const utterance = new SpeechSynthesisUtterance(text);
  
  // 言語を設定（デフォルトは英語）
  utterance.lang = lang;
  
  logger.debug('Attempting to speak:', text, 'with lang:', lang);
  
  // デバイスを検出
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    // モバイルデバイス: 英語音声を強制設定
    utterance.rate = 0.9; // 少しゆっくりめ
    utterance.pitch = 1.0; // 自然なピッチ
    utterance.volume = 0.8; // 適度な音量
    
    // 利用可能な音声を取得
    const availableVoices = synthesis.getVoices();
    logger.debug('Available voices for mobile:', availableVoices.map(v => `${v.name} (${v.lang})`));
    
    if (lang === 'ja' || lang === 'ja-JP') {
      // 日本語音声を選択
      const japaneseVoices = availableVoices.filter(voice => 
        voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
      );
      
      logger.debug('Japanese voices found:', japaneseVoices.map(v => `${v.name} (${v.lang})`));
      
      if (japaneseVoices.length > 0) {
        const selectedVoice = japaneseVoices.find(voice => voice.name.includes('Google')) ||
                             japaneseVoices.find(voice => voice.name.includes('Kyoko')) ||
                             japaneseVoices.find(voice => voice.name.includes('日本語')) ||
                             japaneseVoices[0];
        utterance.voice = selectedVoice;
        logger.debug('Selected Japanese voice:', selectedVoice?.name);
      } else {
        console.warn('No Japanese voices found, using default');
      }
    } else {
      // 英語音声を選択
      const englishVoices = availableVoices.filter(voice => 
        voice.lang === 'en-US' || voice.lang.startsWith('en-')
      );
      
      if (englishVoices.length > 0) {
        const selectedVoice = englishVoices.find(voice => voice.name.includes('English')) ||
                             englishVoices.find(voice => voice.name.includes('US')) ||
                             englishVoices[0];
        utterance.voice = selectedVoice;
      }
    }
  } else {
    // デスクトップ: 英語音声を優先選択
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    if (voices.length > 0) {
      if (lang === 'ja' || lang === 'ja-JP') {
        // 日本語音声を選択
        const japaneseVoices = voices.filter(voice => 
          voice.lang === 'ja-JP' || voice.lang.startsWith('ja')
        );
        
        logger.debug('Japanese voices found (desktop):', japaneseVoices.map(v => `${v.name} (${v.lang})`));
        
        if (japaneseVoices.length > 0) {
          const selectedVoice =
            // **端末の中にある声を先に選ぶ。** Google の声はサーバで合成するので、
            // 読み始めるまでに毎回待ちが入る（通しの読み上げが遅いのはこれ）
            japaneseVoices.find(voice => voice.localService) ||
            japaneseVoices.find(voice => voice.name.includes('Kyoko')) || // macOSの日本語音声
            japaneseVoices.find(voice => voice.name.includes('Microsoft')) ||
            japaneseVoices.find(voice => voice.name.includes('日本語')) ||
            japaneseVoices[0];
          
          utterance.voice = selectedVoice;
          logger.debug('Selected Japanese voice (desktop):', selectedVoice?.name);
        } else {
          console.warn('No Japanese voices found (desktop), using default');
        }
      } else {
        // 英語音声のみから選択
        const englishVoices = voices.filter(voice => 
          voice.lang === 'en-US' || voice.lang.startsWith('en-')
        );
        
        if (englishVoices.length > 0) {
          const selectedVoice =
            // **端末の中にある声を先に選ぶ**（上の日本語と同じ理由）
            englishVoices.find(voice => voice.localService && voice.lang === 'en-US') ||
            englishVoices.find(voice => voice.localService) ||
            englishVoices.find(voice => voice.name === 'Alex') || // macOSの高品質な音声
            englishVoices.find(voice => voice.name.includes('Microsoft')) ||
            englishVoices.find(voice => voice.name.includes('English')) ||
            englishVoices.find(voice => voice.name.includes('US')) ||
            englishVoices[0];
          
          utterance.voice = selectedVoice;
        }
      }
    }
  }

  logger.debug('Speaking with voice:', utterance.voice?.name || 'default', 'lang:', utterance.lang);
  
  // 日本語音声が見つからない場合のフォールバック
  if ((lang === 'ja' || lang === 'ja-JP') && !utterance.voice) {
    console.warn('Japanese voice not found, trying fallback');
    // フォールバック：言語だけ設定して音声はシステムデフォルト
    utterance.lang = 'ja-JP';
  }
  
  return utterance;
};

const speak = (text, lang = 'en-US') => {
  if (!text) {
    return;
  }

  // 進行中の発話がある場合は、読み上げ完了を待つ
  if (synthesis.speaking) {
    logger.debug('Speech already in progress, queuing next speech');
    // 現在の読み上げが完了するまで待機
    const checkSpeaking = () => {
      if (synthesis.speaking) {
        setTimeout(checkSpeaking, 100);
      } else {
        // 読み上げ完了後に新しい音声を開始
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = lang;
          logger.debug('Speaking queued text:', text, 'with lang:', lang);
          synthesis.speak(utterance);
        }, 200); // 少し間隔を空ける
      }
    };
    checkSpeaking();
    return;
  }

  const utterance = buildUtterance(text, lang);

  // 連続読み上げと同じく、GC で切れないよう参照を残す
  activeUtterance = utterance;
  synthesis.speak(utterance);
};

/**
 * 英語→日本語のように、続けて読み上げる。
 *
 * ぜんぶまとめて speak() に積む。1つ読み終えてから次を積むと、
 * Google の音声（サーバー側で合成する localService: false の声）では
 * そこで毎回200〜400msの取得待ちが入る。先に積んでおけば、
 * 1つ目を読んでいる間に2つ目の音声が用意される。
 *
 * 順番はブラウザのキューが保つ。onStart / onDone は各 utterance の
 * イベントで拾うので、積む順と鳴る順はずれない。
 *
 * @param {Array<{text: string, lang?: string, onStart?: Function}>} items 読み上げる順に並べる
 * @param {{onDone?: Function}} [options] 全部読み終えたときに呼ぶ
 */
// 再生中の音声ファイル。止めるときに使う。
let activeAudio = null;

const stopClip = () => {
  if (!activeAudio) return;
  try {
    activeAudio.pause();
    if (activeAudio.src.startsWith('blob:')) URL.revokeObjectURL(activeAudio.src);
  } catch (error) {
    // 止められなくても続行する
  }
  activeAudio = null;
};

/**
 * 作っておいた音声ファイルを鳴らす。
 * 用意が無ければ false を返し、呼び出し側が端末の読み上げに戻す。
 */
const playClip = (blob) => new Promise((resolve) => {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeAudio = audio;

  const done = () => {
    if (activeAudio === audio) activeAudio = null;
    URL.revokeObjectURL(url);
    resolve();
  };

  audio.onended = done;
  audio.onerror = done;
  audio.play().catch(done);
});

/**
 * 続けて読むぶんを、1つの発話にまとめる。
 *
 * **通しの読み上げが遅いのはここ。** 1文ずつ積むと、文と文のあいだに
 * 合成の待ちが必ず入る（ネット音声だと1文ごとに200〜400ms）。
 * 10文の読みものなら数秒ぶん、ただ黙っている時間になる。
 *
 * 言語が同じで、**始まりを知らせる必要が無い**ぶんだけ繋ぐ。
 * 1文ずつ光らせている経路（`onStart` を持つ）は繋がない——
 * まとめると、どの文を読んでいるか分からなくなる。
 *
 * @param {Array<{text: string, lang?: string, onStart?: Function}>} queue
 * @returns {Array<{text: string, lang?: string, onStart?: Function}>}
 */
const mergeSameVoice = (queue) => {
  const out = [];
  for (const item of queue) {
    const last = out[out.length - 1];
    const sameVoice = last
      && (last.lang || 'en-US') === (item.lang || 'en-US')
      && typeof last.onStart !== 'function'
      && typeof item.onStart !== 'function';
    if (sameVoice) last.text = `${last.text} ${item.text}`;
    else out.push({ ...item });
  }
  return out;
};

const speakSequence = (items, options = {}) => {
  const queue = mergeSameVoice((items || []).filter((item) => item && item.text));
  if (queue.length === 0) {
    if (typeof options.onDone === 'function') options.onDone();
    return;
  }

  /**
   * 音声ファイルで順に鳴らす。1つでも用意が無ければ false を返し、
   * 端末の読み上げに任せる（声が混ざるより揃っている方がよい）。
   */
  const playAllClips = async (token) => {
    const blobs = [];
    for (const item of queue) {
      // eslint-disable-next-line no-await-in-loop
      const blob = await fetchClip(item.text, item.lang || 'en-US');
      // **音声でないものを鳴らしたことにしない。** 端末に古い取り違え
      // （SPA が返した index.html）が残っていると、`audio.onerror` が
      // 「再生し終わった」と同じ扱いになり、無音のまま先へ進む
      if (!blob || !String(blob.type || '').startsWith('audio/')) return false;
      blobs.push(blob);
    }

    for (let index = 0; index < queue.length; index += 1) {
      if (activeSequence !== token) return true;
      const item = queue[index];
      if (typeof item.onStart === 'function') item.onStart();
      // eslint-disable-next-line no-await-in-loop
      await playClip(blobs[index]);
    }

    if (activeSequence === token) {
      activeSequence = null;
      if (typeof options.onDone === 'function') options.onDone();
    }
    return true;
  };

  const enqueueAll = () => {
    // 打ち切られたあとに古いキューのイベントで先へ進まないよう、
    // この呼び出しぶんだけを見分ける印を持たせる。
    const token = {};
    activeSequence = token;

    // まず作っておいた音声を試す。無ければ端末の読み上げへ。
    playAllClips(token).then((played) => {
      if (played || activeSequence !== token) return;
      enqueueUtterances(token);
    });
  };

  /*
    **1つずつ積む。まとめて積まない。**

    以前は queue を全部 speak() に渡していた。1つ読んでいる間に次の音声が
    用意されるので速い——のだが、**iOS Safari は一度に積んだ2つ目以降を黙って落とす**。
    「1文ずつの読み上げは鳴るのに、通しの読み上げボタンだけ効かない」という形で出る
    （2026-09-20 に実機で報告）。エラーは出ないので画面からは分からない。

    読み終わりを待って次を積むので、ネット音声だと文の間が少し空く。
    鳴らないより間が空く方がよい。
  */
  const enqueueUtterances = (token) => {
    const held = [];
    // Chrome は発話中の utterance がGCされると途中で切れる。参照を残す。
    activeUtterance = held;

    const finish = () => {
      if (activeSequence !== token) return;
      activeSequence = null;
      if (typeof options.onDone === 'function') options.onDone();
    };

    const speakAt = (index) => {
      if (activeSequence !== token) return;
      if (index >= queue.length) {
        finish();
        return;
      }
      const item = queue[index];
      const utterance = buildUtterance(item.text, item.lang || 'en-US');
      held.push(utterance);

      utterance.onstart = () => {
        if (activeSequence !== token) return;
        if (typeof item.onStart === 'function') item.onStart();
      };
      // 失敗しても止めない（音声が無い端末で固まらないように）次へ進む
      utterance.onend = () => speakAt(index + 1);
      utterance.onerror = () => speakAt(index + 1);

      synthesis.speak(utterance);
    };

    speakAt(0);
  };

  if (synthesis.speaking || synthesis.pending) {
    // 前の読み上げは打ち切る。カードを次々めくったときに溜まらないように。
    synthesis.cancel();
    noteCancel();
    // cancel() の直後に speak() を呼ぶと Chrome が無視することがあるので間を置く。
    scheduleStart(enqueueAll, CANCEL_GUARD_MS);
    return;
  }

  // 鳴っていなくても、直前に打ち切っていれば同じだけ待つ
  const sinceCancel = Date.now() - lastCancelAt;
  if (sinceCancel < CANCEL_GUARD_MS) {
    scheduleStart(enqueueAll, CANCEL_GUARD_MS - sinceCancel);
    return;
  }

  enqueueAll();
};

/**
 * 単語と意味を続けて読む。学習カードの標準の読み上げ方。
 *
 * 既定は英語 → 日本語。和→英で出題しているときは、問題（日本語）を
 * 先に読まないと、聞くだけで答えが分かってしまうので順を入れ替える。
 */
const speakWordThenMeaning = (word, meaning, direction = 'en-ja') => {
  const english = { text: word, lang: 'en-US' };
  const japanese = { text: meaning, lang: 'ja-JP' };
  return speakSequence(direction === 'ja-en' ? [japanese, english] : [english, japanese]);
};

/** 読み上げを止める。連続再生の途中でも打ち切る。 */
const stopSpeaking = () => {
  activeUtterance = null;
  activeSequence = null;
  cancelScheduledStart();
  stopClip();
  synthesis.cancel();
  noteCancel();
};

export { initialize, speak, speakSequence, speakWordThenMeaning, stopSpeaking };