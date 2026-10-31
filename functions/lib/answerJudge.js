/**
 * 面接の答えの中身を見る。
 *
 * 発音は Azure が点にしてくれるが、それは「どう言ったか」だけで、
 * 「何を言ったか」は見ていない。本番の面接は的外れな答えだと
 * 発音が良くても落ちる。認識された文字を読んで、質問に答えているかを見る。
 *
 * 使うのは Vertex AI の Gemini。ストーリー生成ですでに動いているので、
 * 鍵も請求先も増えない（functions/index.js の generateStory と同じ）。
 *
 * 採点は甘くしない。ただし理由は日本語で、中高生に分かる言い方で返す。
 */

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['good', 'partial', 'off-target'] },
    reasonJa: { type: 'string' },
    missingJa: { type: 'string' },
    betterAnswer: { type: 'string' },
  },
  required: ['verdict', 'reasonJa'],
};

const GRADE_NOTES = {
  3: '中学範囲。主語と動詞のある完全な文で答えられていれば十分。語数は問わない。',
  pre2: '高校基礎。理由を一言添えられているとよい。',
  2: '賛否とその理由を2つ程度。抽象的な語彙が出てくる。',
  pre1: '意見と根拠。社会的な話題に踏み込めているか。',
};

/** 送るプロンプトを組み立てる。中身の判定だけをさせ、発音には触れさせない。 */
const buildPrompt = ({ grade, question, modelAnswer, transcript }) => `
You are an examiner for the Eiken (EIKEN Test in Practical English Proficiency) speaking test.
Judge ONLY whether the student's answer addresses the question. Do not judge pronunciation
or grammar severity; the pronunciation is scored separately.

Grade: ${grade}
What is expected at this grade (in Japanese): ${GRADE_NOTES[grade] || GRADE_NOTES['3']}

Question asked:
${question}

${modelAnswer ? `A model answer (one acceptable answer, not the only one):\n${modelAnswer}\n` : ''}
What the student actually said (automatic transcription, may contain recognition errors):
${transcript}

Rules:
- "good" = the answer addresses the question and would be accepted.
- "partial" = on topic but incomplete for this grade (e.g. no reason given where one is expected,
  or a bare "Yes" where a full sentence is required).
- "off-target" = does not answer the question, or is empty.
- The transcription is imperfect. Do not mark an answer down for a single odd word that is
  clearly a recognition error.
- There is more than one correct answer. Do not require the model answer's wording.

Write reasonJa, missingJa in JAPANESE, aimed at a Japanese junior/senior high school student.
Keep reasonJa to one or two short sentences. missingJa is what to add next time
(empty string if nothing is missing). betterAnswer is an improved English answer that keeps
the student's own content (empty string if the answer was already good).

Return a single JSON object matching this schema, with no text before or after it:
${JSON.stringify(JUDGE_SCHEMA, null, 2)}
`;

const VERDICTS = new Set(['good', 'partial', 'off-target']);

/** 返ってきた JSON を、画面が必ず扱える形にならす。 */
const normalize = (parsed) => ({
  verdict: VERDICTS.has(parsed?.verdict) ? parsed.verdict : 'partial',
  reasonJa: typeof parsed?.reasonJa === 'string' ? parsed.reasonJa : '',
  missingJa: typeof parsed?.missingJa === 'string' ? parsed.missingJa : '',
  betterAnswer: typeof parsed?.betterAnswer === 'string' ? parsed.betterAnswer : '',
});

/**
 * @param {object} input {grade, question, modelAnswer, transcript}
 * @param {(prompt: string) => Promise<string>} generate 生成の実体。テストで差し替える
 */
const judgeAnswer = async (input, generate) => {
  const transcript = String(input.transcript || '').trim();
  // 何も聞き取れていないのに Gemini を呼ぶ必要はない。課金だけかかる。
  if (transcript.length === 0) {
    return {
      verdict: 'off-target',
      reasonJa: '声が聞き取れませんでした。マイクに近づいて、もう一度話してみてください。',
      missingJa: '',
      betterAnswer: '',
    };
  }

  const text = await generate(buildPrompt({ ...input, transcript }));

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // 判定が取れなくても発音の点は返せる。ここで全体を落とさない。
    return {
      verdict: 'partial',
      reasonJa: '答えの中身は判定できませんでした。発音の点だけ表示します。',
      missingJa: '',
      betterAnswer: '',
    };
  }

  return normalize(parsed);
};

module.exports = { judgeAnswer, buildPrompt, normalize, JUDGE_SCHEMA, GRADE_NOTES };
