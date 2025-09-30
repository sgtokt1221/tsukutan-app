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
        // 英語音声を優先的にフィルタリング
        voices = availableVoices.filter(voice => 
          voice.lang === 'en-US' || voice.lang.startsWith('en-')
        );
        
        console.log('Available English voices:', voices.map(v => `${v.name} (${v.lang})`));
        
        if (voices.length > 0) {
          // イベントリスナーをクリーンアップ
          synthesis.onvoiceschanged = null;
          resolve();
        } else {
          console.warn('No English voices found, using default voice');
          // 英語音声が見つからない場合でも初期化を完了
          voices = availableVoices; // デフォルト音声を使用
          synthesis.onvoiceschanged = null;
          resolve();
        }
      }
    };

    loadVoices();
    if (voices.length === 0 && synthesis.onvoiceschanged !== undefined) {
      synthesis.onvoiceschanged = loadVoices;
    } else if (voices.length === 0) {
      // 音声が利用できない場合でも初期化を完了
      console.warn('No voices available, will use default settings');
      resolve();
    }
  });

  return initializationPromise;
};

const speak = (text) => {
  if (!text) {
    return;
  }

  // 進行中の発話をキャンセル
  if (synthesis.speaking) {
    synthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // 強制的に英語音声を設定
  utterance.lang = 'en-US';
  
  // デバイスを検出
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    // モバイルデバイス: 英語音声を強制設定
    utterance.rate = 0.9; // 少しゆっくりめ
    utterance.pitch = 1.0; // 自然なピッチ
    utterance.volume = 0.8; // 適度な音量
    
    // 利用可能な英語音声を取得
    const availableVoices = synthesis.getVoices();
    const englishVoices = availableVoices.filter(voice => 
      voice.lang === 'en-US' || voice.lang.startsWith('en-')
    );
    
    if (englishVoices.length > 0) {
      // 英語音声を優先的に選択
      const selectedVoice = englishVoices.find(voice => voice.name.includes('English')) ||
                           englishVoices.find(voice => voice.name.includes('US')) ||
                           englishVoices[0];
      utterance.voice = selectedVoice;
    }
  } else {
    // デスクトップ: 英語音声を優先選択
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    if (voices.length > 0) {
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

  console.log('Speaking with voice:', utterance.voice?.name || 'default', 'lang:', utterance.lang);
  synthesis.speak(utterance);
};

export { initialize, speak };