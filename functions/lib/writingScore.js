/**
 * 英検ライティングの採点（2026-09-26）。**点数だけを返す**（コメントは書かない。ユーザーの決定）。
 *
 * 採点は Jev（TypeSafe の型付き判断モデル。https://docs.typesafe.ai/api）に任せる。
 * 文章を書かせず、観点ごとに「0〜4のどの段か」を Score で、0点ルールに当たるかを Noul で聞く。
 * 英語が Jev のいちばん得意な言語なので、基準（criteria）は英語で書く。
 *
 * **語数と短縮形はコードで数える**（AIに数えさせない）。
 * **堅く採る**：Score の期待値は四捨五入より 0.25 厳しく丸める（3.7 → 3、3.8 → 4）。
 *
 * 公式の形式・観点：eiken.or.jp の採点基準ページ（2016scoring_w_info / 2017scoring_p2w_info /
 * 2017scoring_3w_info）と 2024 年度リニューアル・2025-04-15 の要約の語数の告知。
 */

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
const JEV_MODEL = 'jev-latest';

/**
 * 級とタスクごとの語数と観点。**画面の問題データ（public/eiken-writing/prompts）と同じ値**
 * （writingScore.test.js が突き合わせる）。
 */
const FORMATS = {
  3: {
    opinion: { min: 25, max: 35, aspects: ['content', 'organization', 'vocabulary', 'grammar'] },
    email: { min: 15, max: 25, aspects: ['content', 'vocabulary', 'grammar'] },
  },
  pre2: {
    opinion: { min: 50, max: 60, aspects: ['content', 'organization', 'vocabulary', 'grammar'] },
    email: { min: 40, max: 50, aspects: ['content', 'vocabulary', 'grammar'] },
  },
  2: {
    opinion: { min: 80, max: 100, aspects: ['content', 'organization', 'vocabulary', 'grammar'] },
    // 要約の語数は必須（2025 年度から「目安」ではなくなった）
    summary: { min: 45, max: 55, required: true, aspects: ['content', 'organization', 'vocabulary', 'grammar'] },
  },
  pre1: {
    opinion: { min: 120, max: 150, aspects: ['content', 'organization', 'vocabulary', 'grammar'] },
    summary: { min: 60, max: 70, required: true, aspects: ['content', 'organization', 'vocabulary', 'grammar'] },
  },
};

const GRADE_NAME = { 3: 'Grade 3 (CEFR A1-A2)', pre2: 'Grade Pre-2 (CEFR A2-B1)', 2: 'Grade 2 (CEFR B1)', pre1: 'Grade Pre-1 (CEFR B2)' };

/** 語数。英字か数字を含むまとまりを1語と数える（記号だけの塊は数えない） */
const countWords = (text) => String(text || '')
  .split(/\s+/)
  .filter((token) => /[A-Za-z0-9]/.test(token))
  .length;

/**
 * 短縮形（I'm / It's / don't …）。塾の教材が「短縮しちゃだめ」としているので印を付ける。
 * 所有の 's（Tom's）と区別がつかないものは数えない（it's / that's / there's / what's だけ数える）
 */
const CONTRACTION = /\b(?:I'm|I've|I'll|I'd|you're|you've|you'll|you'd|we're|we've|we'll|we'd|they're|they've|they'll|they'd|he's|she's|it's|that's|there's|what's|let's|\w+n't)\b/gi;
const findContractions = (text) => (String(text || '').replace(/[’`]/g, "'").match(CONTRACTION) || []);

// ---- 観点の基準（0〜4 の5段。低い順） ----

const ASPECT_LABEL = { content: '内容', organization: '構成', vocabulary: '語彙', grammar: '文法' };

const TASK_GOAL = {
  opinion: 'states a clear opinion on the QUESTION/TOPIC and supports it with TWO relevant, convincing reasons',
  email: 'replies to the email and does everything the instructions ask',
  summary: 'summarizes the main points of ALL paragraphs of the passage accurately, in the writer\'s own words, without adding personal opinions',
};

const criteriaFor = (aspect, task) => {
  if (aspect === 'content') {
    return [
      `Does not achieve the task at all: the answer ${TASK_GOAL[task]} is missing, off-topic, or unreadable.`,
      'Barely achieves the task: most required elements are missing or unsupported; the ideas are hard to follow or contradict the stated position.',
      'Partly achieves the task: one required element is missing, weak, or unsupported (e.g. only one real reason, a reason with no explanation, a question from the instructions not answered), or the answer is clearly too short.',
      'Mostly achieves the task: all required elements are present and relevant, but one of them is thin or only generally supported.',
      'Fully achieves the task: all required elements are present, relevant, and clearly supported with explanations or examples appropriate for the grade.',
    ];
  }
  if (aspect === 'organization') {
    return [
      'No recognizable organization; sentences are unconnected or the text is not a response to the task.',
      'Hard to follow: ideas jump around, no logical order, and connectives are missing or misused.',
      'Some order is visible but the flow breaks in places; connectives are few or repetitive; some sentences do not fit.',
      'Clear and logical overall (e.g. opinion, reasons, conclusion) with appropriate connectives; minor lapses in flow.',
      'Very clear, logical structure throughout; connectives (First, Second, However, For these reasons, etc.) are used naturally and correctly.',
    ];
  }
  if (aspect === 'vocabulary') {
    return [
      'Vocabulary is so limited or wrong that meaning cannot be understood; or unexplained non-English words dominate.',
      'Very limited or often wrong vocabulary; frequent spelling mistakes that block meaning; heavy repetition of the same words.',
      'Basic vocabulary that is often repetitive or sometimes misused; several spelling mistakes; little variation.',
      'Mostly appropriate vocabulary for the topic with some variety; a few spelling or word-choice errors that do not block meaning.',
      'Appropriate, varied vocabulary for the topic and grade, with accurate spelling and word choice; ideas are paraphrased rather than repeated.',
    ];
  }
  return [
    'Grammar errors are so frequent that the text cannot be understood.',
    'Frequent grammar errors that often block meaning; sentence structures are very limited.',
    'Several grammar errors, some of which affect meaning; little variety in sentence structure.',
    'Mostly accurate grammar with a few errors that do not block meaning; some variety in sentence structure.',
    'Accurate grammar with a variety of sentence structures (e.g. subordinate clauses, comparatives, relative clauses) used correctly for the grade.',
  ];
};

/**
 * Noul（はい／いいえの確率）で聞く、0点ルールや必須条件。
 * gate … 当たらなければ全観点0（公式の0点ルール）。cap … 当たらなければ「内容」を2までに抑える
 */
const checksFor = (gradeIn, task) => {
  const grade = String(gradeIn);
  if (task === 'opinion') {
    const checks = [
      { id: 'answersQuestion', effect: 'gate', text: 'Does the answer respond to the QUESTION/TOPIC given (it is on-topic and states an opinion about it)?' },
      { id: 'twoReasons', effect: 'cap', text: 'Does the answer give TWO distinct reasons that support the stated opinion (not contradicting it)?' },
    ];
    if (grade === 'pre1') {
      checks.push({ id: 'usesTwoPoints', effect: 'cap', text: 'Does the answer use at least TWO of the POINTS listed in the prompt as its main supporting ideas?' });
    }
    return checks;
  }
  if (task === 'email') {
    const checks = [{ id: 'isReply', effect: 'gate', text: 'Is the text a reply to the email in the prompt (it responds to what the sender wrote)?' }];
    if (grade === '3') {
      checks.push({ id: 'answersBoth', effect: 'cap', text: 'Does the reply answer BOTH of the underlined questions in the email?' });
    } else {
      checks.push({ id: 'answersQuestion', effect: 'cap', text: 'Does the reply clearly answer the question the sender asked?' });
      checks.push({ id: 'asksTwoQuestions', effect: 'cap', text: 'Does the reply ask TWO questions about the underlined part of the email?' });
    }
    return checks;
  }
  return [
    { id: 'isSummary', effect: 'gate', text: 'Is the text a summary of the passage in the prompt (it restates the passage\'s content rather than giving the writer\'s own opinion or unrelated content)?' },
  ];
};

/** 採点に渡す問題の文面。Eメールの下線 [[...]] は <u>…</u> にして伝える */
const promptText = (task, prompt = {}) => {
  if (task === 'opinion') {
    return [
      prompt.question && `QUESTION/TOPIC: ${prompt.question}`,
      Array.isArray(prompt.points) && prompt.points.length > 0 && `POINTS: ${prompt.points.join(', ')}`,
    ].filter(Boolean).join('\n');
  }
  if (task === 'email') {
    return `EMAIL (underlined parts are marked with <u></u>):\n${String(prompt.body || '').replace(/\[\[(.+?)\]\]/g, '<u>$1</u>')}`;
  }
  return `PASSAGE: ${prompt.title ? `${prompt.title}\n` : ''}${(prompt.passage || []).join('\n\n')}`;
};

/**
 * Jev に送る本文を組む。
 * @param {{ grade: string|number, task: 'opinion'|'email'|'summary', prompt: object, answer: string }} input
 */
const buildJevRequest = ({ grade: gradeIn, task, prompt, answer }) => {
  // 級は文字でも数でも来る（'3' と 3）。文字にそろえる
  const grade = String(gradeIn);
  const format = FORMATS[grade]?.[task];
  if (!format) throw new Error(`unknown format: ${grade} ${task}`);
  const words = countWords(answer);
  const questions = {};
  for (const aspect of format.aspects) {
    questions[aspect] = {
      type: 'score',
      instructions: `As a strict EIKEN ${GRADE_NAME[grade]} writing examiner, rate the ${aspect.toUpperCase()} of the student's ${task} answer for this grade. Judge only ${aspect}.`,
      criteria: criteriaFor(aspect, task),
    };
  }
  for (const check of checksFor(grade, task)) {
    questions[check.id] = { type: 'noul', instructions: check.text };
  }
  return {
    model: JEV_MODEL,
    state: {
      exam: `EIKEN ${GRADE_NAME[grade]} writing`,
      task,
      requiredLength: `${format.min}-${format.max} words${format.required ? ' (required)' : ' (suggested)'}`,
      prompt: promptText(task, prompt),
      studentAnswer: String(answer || ''),
      studentWordCount: words,
    },
    questions,
  };
};

/** 堅い丸め：四捨五入より 0.25 厳しく */
const strictRound = (value) => Math.max(0, Math.min(4, Math.floor((Number(value) || 0) + 0.25)));

/** Noul の値（0〜1）を引く。形が違っても落ちないように */
const noulOf = (answer) => {
  if (!answer) return null;
  const value = answer.noul ?? answer.value ?? answer.probability;
  return Number.isFinite(value) ? value : null;
};

const GATE_BELOW = 0.3;
const CAP_BELOW = 0.5;
const CAP_CONTENT = 2;

/**
 * Jev の答えを点にする。
 * @returns {{ scores: Record<string, number>, total: number, max: number, flags: string[], words: number, contractions: string[] }}
 */
const scoreFromJev = ({ grade: gradeIn, task, answer }, jevAnswers = {}) => {
  const grade = String(gradeIn);
  const format = FORMATS[grade][task];
  const words = countWords(answer);
  const contractions = findContractions(answer);
  const flags = [];
  const scores = {};
  for (const aspect of format.aspects) scores[aspect] = strictRound(jevAnswers[aspect]?.score);

  let zeroed = false;
  let capContent = false;
  for (const check of checksFor(grade, task)) {
    const value = noulOf(jevAnswers[check.id]);
    if (value == null) continue;
    if (check.effect === 'gate' && value < GATE_BELOW) {
      zeroed = true;
      flags.push(`not-${check.id}`);
    }
    if (check.effect === 'cap' && value < CAP_BELOW) {
      capContent = true;
      flags.push(`missing-${check.id}`);
    }
  }

  // 語数。要約は必須の範囲、その他は目安（大きく足りないときだけ内容を抑える）
  if (words < format.min) flags.push('too-short');
  if (words > format.max) flags.push('too-long');
  if (format.required && (words < format.min || words > format.max)) capContent = true;
  if (!format.required && words < format.min * 0.7) capContent = true;
  if (contractions.length > 0) flags.push('contractions');
  if (words === 0) zeroed = true;

  if (capContent) scores.content = Math.min(scores.content, CAP_CONTENT);
  if (zeroed) for (const aspect of format.aspects) scores[aspect] = 0;

  const total = Object.values(scores).reduce((sum, v) => sum + v, 0);
  return { scores, total, max: format.aspects.length * 4, flags, words, contractions, labels: ASPECT_LABEL };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jev を呼ぶ。429（混雑）と 529（過負荷）は間を空けて2回までやり直す。
 * @param {object} body buildJevRequest の結果
 * @param {{ apiKey: string, fetchImpl?: Function, retries?: number, backoffMs?: number }} options
 */
const callJev = async (body, { apiKey, fetchImpl = fetch, retries = 2, backoffMs = 800 } = {}) => {
  if (!apiKey) throw new Error('JEV_API_KEY が設定されていません');
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetchImpl(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      if (!json || typeof json.answers !== 'object') throw new Error('Jev の返事の形が違います');
      return json;
    }
    lastError = new Error(`Jev ${res.status}`);
    if (res.status !== 429 && res.status !== 529) break;
    if (attempt < retries) await sleep(backoffMs * (attempt + 1));
  }
  throw lastError;
};

/** 採点の入口。入力を確かめ、Jev を呼び、点にする */
const scoreWriting = async (input, options) => {
  const body = buildJevRequest(input);
  const json = await callJev(body, options);
  return { ...scoreFromJev(input, json.answers), model: json.model || JEV_MODEL };
};

module.exports = {
  FORMATS,
  countWords,
  findContractions,
  buildJevRequest,
  scoreFromJev,
  strictRound,
  callJev,
  scoreWriting,
};
