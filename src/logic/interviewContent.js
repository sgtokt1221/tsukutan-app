/**
 * 英検二次試験（面接）の素材を読む。
 *
 * 素材は public/eiken-interview/ に置いてある。
 *   index.json            級とカードの一覧
 *   interviewer-{級}.json  入室から退室までの流れ
 *   {級}/{id}.json         問題カード1枚
 *
 * 形は docs/eiken-interview-format.md が正本。
 */

const BASE_PATH = '/eiken-interview';

/** 表示順。1級は対象外（docs/eiken-interview-format.md §0）。 */
export const INTERVIEW_GRADES = [
  { id: '3', label: '3級' },
  { id: 'pre2', label: '準2級' },
  { id: '2', label: '2級' },
  { id: 'pre1', label: '準1級' },
];

const cache = new Map();

const fetchJson = (path) => {
  if (cache.has(path)) return cache.get(path);

  const promise = fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error(`${path} を取得できませんでした (HTTP ${response.status})`);
      return response.json();
    })
    .catch((error) => {
      // 失敗をキャッシュに残すと、電波が戻っても二度と読めなくなる。
      cache.delete(path);
      throw error;
    });

  cache.set(path, promise);
  return promise;
};

export const loadInterviewIndex = () => fetchJson(`${BASE_PATH}/index.json`);

export const loadInterviewFlow = (grade) => fetchJson(`${BASE_PATH}/interviewer-${grade}.json`);

export const loadInterviewCard = (grade, cardId) => fetchJson(`${BASE_PATH}/${grade}/${cardId}.json`);

/** イラストの置き場。カードの illustrations[].file をそのまま使う。 */
export const illustrationUrl = (file) => `/eiken/${file}`;

/**
 * 面接の流れと問題カードを、画面が上から順に出せる1本の列にする。
 *
 * 流れ（interviewer-{級}.json）は「入室 → 黙読 → 音読 → 質問 → 退室」の骨格だけを
 * 持っていて、実際の設問はカード側にある。questions-intro のところで設問を差し込む。
 *
 * カードを裏返す合図（準2級以降）は afterQuestion を持っている。その番号の設問の
 * 直後に入れる。位置を間違えても画面は普通に動いてしまい、本番と違う順で
 * 練習していたことに後から気づけないので、ここだけは単体テストを置いてある。
 *
 * @param {object} flow interviewer-{級}.json
 * @param {object} card {級}/{id}.json
 * @returns {Array} beats
 */
export const buildBeats = (flow, card) => {
  const steps = flow?.steps || [];
  const questions = card?.questions || [];
  const turnOver = steps.find((step) => typeof step.afterQuestion === 'number');

  const beatFromStep = (step) => ({
    key: `step-${step.id}`,
    kind: step.timerSeconds ? 'timer' : 'line',
    phase: step.phase,
    speech: step.interviewer,
    display: step.fullForm || step.interviewer,
    alt: step.alt || null,
    expected: step.expected || null,
    ja: step.ja || null,
    timerSeconds: step.timerSeconds || null,
    recordsStudent: Boolean(step.recordsStudent),
    stepId: step.id,
  });

  const beatFromQuestion = (question) => ({
    key: `q-${question.no}`,
    kind: 'question',
    phase: 'questions',
    speech: question.prompt,
    display: question.prompt,
    ja: null,
    question,
    stepId: null,
  });

  const beats = [];
  for (const step of steps) {
    if (turnOver && step === turnOver) continue; // 設問の間に差し込むのでここでは出さない

    beats.push(beatFromStep(step));

    if (step.id !== 'questions-intro') continue;

    for (const question of questions) {
      beats.push(beatFromQuestion(question));
      if (turnOver && turnOver.afterQuestion === question.no) {
        beats.push(beatFromStep(turnOver));
      }
    }
  }

  return beats;
};

/**
 * その場面で出す心得（interviewer-{級}.json の tips）。
 *
 * tips[].at は buildBeats が付ける beat.key（`step-{ステップid}` / `q-{設問番号}`）。
 * まとめて最初に並べても、その心得が要る場面に着いた頃には読み返さない。
 * 綴りを間違えた at は画面に一度も出ないまま気づけないので、実在する場面を
 * 指しているかは単体テストで見ている。
 *
 * @param {object} flow interviewer-{級}.json
 * @param {object} beat buildBeats が返した1場面
 * @returns {string[]} その場面に出す文言
 */
export const tipsFor = (flow, beat) => {
  if (!beat) return [];
  return (flow?.tips || []).filter((tip) => tip.at === beat.key).map((tip) => tip.text);
};

/**
 * その場面で問題カードの何を見せるか。
 * 裏返したあと（cardVisible: false）は何も見せない。本番と同じにする。
 */
export const cardViewFor = (beat) => {
  if (!beat) return 'none';

  if (beat.kind === 'question') {
    if (beat.question.cardVisible === false) return 'none';
    switch (beat.question.type) {
      case 'passage':
        return 'passage';
      // 受験者自身のことを聞く設問。3級はカードを裏返さないので手元には
      // あるが、絵を出すと「絵の説明」だと思わせてしまう。出さない。
      case 'personal':
      case 'opinion':
        return 'none';
      default:
        return 'illustration';
    }
  }

  switch (beat.stepId) {
    case 'silent-read':
    case 'read-aloud':
      return 'passage';
    case 'narration-intro':
    case 'narration':
      return 'illustration';
    default:
      return 'none';
  }
};

/**
 * その場面で生徒が声を出すか。出すなら、採点に渡す材料を返す。
 *
 * 音読は読む英文が決まっているので scripted。Azure に referenceText を渡すと
 * どの語を読み違えたかまで返る。それ以外は何を言うか決まっていないので
 * unscripted にして、中身は別に見る。
 *
 * Yes / No を選んだあとは、生徒が答えるのは追い質問のほう。質問文も模範解答も
 * そちらに差し替える。元の質問のまま採点すると「Yes と言っただけ」になる。
 *
 * @param {object} beat buildBeats が返した1場面
 * @param {object} card 問題カード
 * @param {'yes'|'no'|null} branch 選んだ枝
 */
export const speakingFor = (beat, card, branch = null) => {
  if (!beat) return null;

  if (beat.stepId === 'read-aloud' && card?.passage?.text) {
    return { mode: 'scripted', referenceText: card.passage.text };
  }

  if (beat.stepId === 'narration') {
    const narration = card?.narration;
    if (!narration) return null;
    return {
      mode: 'unscripted',
      question: [narration.storyLine, narration.openingSentence]
        .filter(Boolean)
        .join(' Begin with: '),
    };
  }

  if (beat.kind !== 'question') return null;

  const question = beat.question;
  const followUp = branch ? question.followUp?.[branch] : null;
  if (followUp) {
    return {
      mode: 'unscripted',
      question: `${question.prompt} (${branch === 'yes' ? 'Yes' : 'No'}) ${followUp.prompt}`,
      modelAnswer: followUp.modelAnswer,
    };
  }

  return {
    mode: 'unscripted',
    question: question.prompt,
    modelAnswer: question.modelAnswer || undefined,
  };
};

/** 事前生成の音声を温めるための読み上げ一覧。面接は全編英語。 */
export const speechTextsFor = (flow, card) => {
  const texts = [];
  for (const beat of buildBeats(flow, card)) {
    texts.push(beat.speech, beat.expected);
    const question = beat.question;
    if (!question) continue;
    texts.push(question.modelAnswer);
    for (const branch of Object.values(question.followUp || {})) {
      texts.push(branch.prompt, branch.modelAnswer);
    }
  }
  if (card?.passage?.text) texts.push(card.passage.text);
  if (card?.narration?.openingSentence) texts.push(card.narration.openingSentence);

  return [...new Set(texts.filter((text) => typeof text === 'string' && !text.includes('...')))];
};
