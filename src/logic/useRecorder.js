import { useCallback, useEffect, useRef, useState } from 'react';
import logger from './logger';

/**
 * マイクで録音する。
 *
 * 面接の練習では、音読も答えも生徒が声に出す。あとで聞き返せること、
 * そして採点に送れることの両方が要る。
 *
 * MediaRecorder が出す形式は端末まかせ（Chrome は webm/opus、Safari は
 * mp4/aac）。聞き返しはその Blob をそのまま使い、採点に送るときだけ
 * wavEncoder で 16kHz の WAV に変換する。
 *
 * マイクは使い終わったら必ず止める。止めないとブラウザのタブに録音中の
 * 印が出たままになり、生徒が不安になる。
 */

/** この端末で録音できるか。iOS の Safari は 14.3 以降。 */
export const canRecord = () => Boolean(
  typeof navigator !== 'undefined'
  && navigator.mediaDevices?.getUserMedia
  && typeof window !== 'undefined'
  && window.MediaRecorder
);

const errorMessageFor = (error) => {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'マイクの使用が許可されていません。ブラウザの設定で許可してください。';
    case 'NotFoundError':
      return 'マイクが見つかりません。';
    case 'NotReadableError':
      return '他のアプリがマイクを使っています。閉じてからもう一度お試しください。';
    default:
      return '録音を開始できませんでした。';
  }
};

export const useRecorder = () => {
  const [state, setState] = useState('idle'); // idle | recording | recorded
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const tickRef = useRef(null);
  const urlRef = useRef(null);

  /** マイクとタイマーを手放す。二重に呼ばれても平気にしておく。 */
  const release = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  // 画面を離れるときに確実に止める。録音したままにしない。
  useEffect(() => () => {
    release();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, [release]);

  const start = useCallback(async () => {
    if (!canRecord()) {
      setError('この端末では録音できません。');
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        // 前の録音の URL は必ず捨てる。残すとメモリを掴んだままになる。
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(recorded);
        setBlob(recorded);
        setUrl(urlRef.current);
        setState('recorded');
        release();
      };

      recorder.start();
      setSeconds(0);
      setState('recording');
      tickRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (startError) {
      logger.warn('録音を開始できませんでした', startError);
      setError(errorMessageFor(startError));
      release();
      setState('idle');
    }
  }, [release]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // onstop で後片付けする
    } else {
      release();
      setState((value) => (value === 'recording' ? 'idle' : value));
    }
  }, [release]);

  /** 録り直す前に消す。前の音が残っていると採点も前のままになる。 */
  const reset = useCallback(() => {
    release();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    chunksRef.current = [];
    setBlob(null);
    setUrl(null);
    setSeconds(0);
    setError(null);
    setState('idle');
  }, [release]);

  return { state, blob, url, seconds, error, start, stop, reset };
};

export default useRecorder;
