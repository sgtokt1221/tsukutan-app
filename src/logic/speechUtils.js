import logger from './logger';
const synthesis = window.speechSynthesis;
let voices = [];
let initializationPromise = null;

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
            japaneseVoices.find(voice => voice.name.includes('Google')) ||
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
            englishVoices.find(voice => voice.name.includes('Google')) ||
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
  
  synthesis.speak(utterance);
};

export { initialize, speak };