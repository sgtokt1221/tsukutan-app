/**
 * 録音した音声を Azure が受け取れる形にする。
 *
 * MediaRecorder が出すのは端末まかせの形式で、Chrome なら webm/opus、
 * Safari なら mp4/aac になる。Azure の発音評価は 16kHz・モノラル・16bit の
 * WAV しか受け取らないので、送る前にこちらで変換する。
 *
 * サーバー側で ffmpeg を回す手もあるが、Cloud Functions に入れると重い。
 * ブラウザには元から音声のデコーダーが載っているので、ここで済ませる。
 *
 * 補間は線形。OfflineAudioContext のほうが質は良いが、Safari は長らく
 * 44.1kHz 未満の sampleRate を受け付けなかった。発音評価に渡すだけなので
 * 線形で足り、どの端末でも同じ結果になるほうを取る。
 */

export const TARGET_SAMPLE_RATE = 16000;

/**
 * 複数チャンネルを1本にならす。
 * 平均を取る。片チャンネルだけ拾うと、端末によって音が消える。
 */
export const downmixToMono = (channels) => {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];

  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels.length; c += 1) sum += channels[c][i];
    mono[i] = sum / channels.length;
  }
  return mono;
};

/** 線形補間で標本化周波数を変える。 */
export const resample = (samples, fromRate, toRate) => {
  if (fromRate === toRate || samples.length === 0) return samples;

  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, samples.length - 1);
    const weight = position - left;
    out[i] = samples[left] * (1 - weight) + samples[right] * weight;
  }
  return out;
};

/**
 * -1.0〜1.0 の実数を 16bit 整数の WAV にする。
 * 範囲外は丸める。歪むより切れるほうがまし。
 */
export const encodeWavBuffer = (samples, sampleRate = TARGET_SAMPLE_RATE) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeAscii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);          // fmt チャンクの大きさ
  view.setUint16(20, 1, true);           // 1 = リニアPCM
  view.setUint16(22, 1, true);           // モノラル
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // 1秒あたりのバイト数
  view.setUint16(32, 2, true);           // 1標本あたりのバイト数
  view.setUint16(34, 16, true);          // ビット深度
  writeAscii(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
};

export const encodeWav = (samples, sampleRate = TARGET_SAMPLE_RATE) =>
  new Blob([encodeWavBuffer(samples, sampleRate)], { type: 'audio/wav' });

/**
 * 録音した Blob を 16kHz モノラルの WAV にする。
 * 端末のデコーダーを使うので、webm でも mp4 でも同じように扱える。
 */
export const toAssessmentWav = async (blob) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('この端末では音声を変換できません');

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from(
      { length: decoded.numberOfChannels },
      (unused, index) => decoded.getChannelData(index)
    );
    const mono = downmixToMono(channels);
    return encodeWav(resample(mono, decoded.sampleRate, TARGET_SAMPLE_RATE));
  } finally {
    // 端末によっては同時に開ける数に上限がある。使い終わったら閉じる。
    if (typeof context.close === 'function') context.close();
  }
};
