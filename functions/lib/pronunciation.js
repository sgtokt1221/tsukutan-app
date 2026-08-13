/**
 * Azure の発音評価に音声を渡し、結果を画面が使える形にして返す。
 *
 * 面接の練習には2つの見方が要る。
 *   scripted   … 音読。読むべき英文が決まっているので referenceText を渡す。
 *                どの語を読み違えたかまで返ってくる。
 *   unscripted … 質問への答えやナレーション。何を言うかは決まっていないので
 *                referenceText を渡さない。発音の良し悪しだけを見る。
 *
 * 30秒を超える音声は連続認識でないと途中で切れる。音読は15〜30秒だが、
 * 準1級のナレーションは2分あるので、常に連続認識で回す。
 *
 * Azure の鍵は Cloud Functions の Secret に置く。クライアントに置くと
 * バンドルに焼き込まれて誰でも読める。
 */

const sdk = require('microsoft-cognitiveservices-speech-sdk');

/** 送られてきた音声の上限。16kHz 16bit モノラルで約3分ぶん。 */
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

/** WAV のヘッダーぶんを飛ばして、生の PCM だけを SDK に流す。 */
const pushWav = (stream, buffer) => {
  // RIFF ヘッダーは 44 バイト。ブラウザ側（wavEncoder.js）が作る形に合わせる。
  const pcm = buffer.length > 44 ? buffer.subarray(44) : buffer;
  // subarray はビューなので、SDK が要求する ArrayBuffer に写してから渡す
  const copy = new ArrayBuffer(pcm.length);
  new Uint8Array(copy).set(pcm);
  stream.write(copy);
  stream.close();
};

/** 単語ごとの結果。読み違えた語だけを画面に出したいので、必要な分だけ拾う。 */
const toWordResult = (word) => ({
  word: word.Word,
  accuracy: word.PronunciationAssessment?.AccuracyScore ?? null,
  errorType: word.PronunciationAssessment?.ErrorType ?? 'None',
});

/**
 * 連続認識を一度回して、全体の点と単語ごとの結果を集める。
 *
 * @param {Buffer} wav 16kHz モノラル 16bit の WAV
 * @param {{key: string, region: string, referenceText?: string}} options
 */
const assess = (wav, { key, region, referenceText }) => new Promise((resolve, reject) => {
  if (!Buffer.isBuffer(wav) || wav.length === 0) {
    reject(new Error('音声が空です'));
    return;
  }
  if (wav.length > MAX_AUDIO_BYTES) {
    reject(new Error('音声が長すぎます'));
    return;
  }

  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'en-US';

  const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
  const pushStream = sdk.AudioInputStream.createPushStream(format);
  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

  const assessmentConfig = new sdk.PronunciationAssessmentConfig(
    referenceText || '',
    sdk.PronunciationAssessmentGradingSystem.HundredMark,
    sdk.PronunciationAssessmentGranularity.Word,
    // 連続認識では miscue が使えない。抜かした語は Azure 側では出ないので、
    // 呼び出し側が referenceText と読み上げ結果を突き合わせて判断する。
    false
  );
  // 抑揚・間の取り方も見る。音読は「意味が分かって読んでいるか」が問われるので、
  // 発音だけ合っていても平板だと本番では取れない。
  assessmentConfig.enableProsodyAssessment();

  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
  assessmentConfig.applyTo(recognizer);

  const words = [];
  const segments = [];
  let transcript = '';
  let settled = false;

  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    // stopContinuousRecognitionAsync を待たずに閉じると、次の要求で
    // ソケットが残ることがある。閉じ切ってから返す。
    recognizer.stopContinuousRecognitionAsync(
      () => { recognizer.close(); if (error) reject(error); else resolve(value); },
      () => { recognizer.close(); if (error) reject(error); else resolve(value); }
    );
  };

  recognizer.recognized = (sender, event) => {
    if (event.result?.reason !== sdk.ResultReason.RecognizedSpeech) return;

    transcript = `${transcript} ${event.result.text || ''}`.trim();

    const raw = event.result.properties?.getProperty(
      sdk.PropertyId.SpeechServiceResponse_JsonResult
    );
    if (!raw) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      return; // この区間の点は諦める。他の区間は生かす。
    }

    const best = parsed.NBest?.[0];
    if (!best) return;

    const segmentWords = (best.Words || []).map(toWordResult);
    for (const word of segmentWords) words.push(word);
    if (best.PronunciationAssessment) {
      // 点をまとめるときの重みに使う。長い音読と短い相槌を同じ重みにしない。
      segments.push({ scores: best.PronunciationAssessment, wordCount: segmentWords.length || 1 });
    }
  };

  recognizer.canceled = (sender, event) => {
    if (event.reason === sdk.CancellationReason.Error) {
      finish(new Error(`Azure が音声を処理できませんでした: ${event.errorDetails}`));
    } else {
      finish(null, { words, segments, transcript });
    }
  };

  recognizer.sessionStopped = () => finish(null, { words, segments, transcript });
  recognizer.speechEndDetected = () => {};

  recognizer.startContinuousRecognitionAsync(
    () => pushWav(pushStream, wav),
    (startError) => finish(new Error(`Azure に接続できませんでした: ${startError}`))
  );
});

/**
 * 区間ごとの点を1つにまとめる。
 *
 * 連続認識だと文ごとに点が返るので、そのままでは複数ある。
 * 単純平均だと短い相槌が長い音読と同じ重みになるため、
 * 単語数で重みを付ける。
 */
const mergeScores = (segments) => {
  if (!segments || segments.length === 0) return null;

  const keys = ['AccuracyScore', 'FluencyScore', 'CompletenessScore', 'ProsodyScore', 'PronScore'];
  const merged = {};

  for (const key of keys) {
    let weighted = 0;
    let weight = 0;
    for (const segment of segments) {
      const value = segment.scores?.[key];
      if (typeof value !== 'number') continue;
      const w = segment.wordCount || 1;
      weighted += value * w;
      weight += w;
    }
    merged[key] = weight > 0 ? Math.round(weighted / weight) : null;
  }
  return merged;
};

module.exports = { assess, mergeScores, toWordResult, MAX_AUDIO_BYTES };
