import {
  QUESTIONS_STAGE_1,
  QUESTIONS_PER_STAGE,
  MAX_LEVEL,
  MIN_LEVEL,
  createInitialState,
  selectQuestions,
  seededRandom,
  recordAnswer,
  undoLastAnswer,
  isStageComplete,
  completeStage,
  stageScore,
  totalScore,
  questionsForStage,
  computeResultLevel,
  estimateVocabulary,
} from './placementTestEngine';

/** レベルごとに単語を用意する。eikenLevels には文字列も混ぜる。 */
const makeWords = () => {
  const words = [];
  for (let level = 1; level <= 7; level += 1) {
    for (let i = 0; i < 30; i += 1) {
      words.push({
        id: `w_L${level}_${i}`,
        word: `word-${level}-${i}`,
        partOfSpeech: '名',
        meaning: `意味${level}-${i}`,
        level,
        eikenLevels: level >= 5 ? ['pre1', 'pre2', 2] : [5, 4],
      });
    }
  }
  return words;
};

const WORDS = makeWords();

/** 与えた正誤の並びでテストを進める */
const playThrough = (answers, { startLevel = 3 } = {}) => {
  let state = createInitialState({ startLevel });
  let cursor = 0;
  while (!state.completed && cursor < answers.length) {
    const questions = selectQuestions(WORDS, state.targetLevel, questionsForStage(state.stage), state.askedIds, seededRandom(42));
    for (const question of questions) {
      if (cursor >= answers.length) break;
      state = recordAnswer(state, { wordId: question.id, isCorrect: answers[cursor], responseTime: 1000 });
      cursor += 1;
    }
    if (isStageComplete(state)) state = completeStage(state);
    else break;
  }
  return state;
};

describe('ステージ進行', () => {
  test('ステージ1は5問、ステージ2以降は10問', () => {
    expect(questionsForStage(1)).toBe(QUESTIONS_STAGE_1);
    expect(questionsForStage(2)).toBe(QUESTIONS_PER_STAGE);
    expect(questionsForStage(7)).toBe(QUESTIONS_PER_STAGE);
  });

  test('5問目で難易度が変わってもステージがリセットされない', () => {
    let state = createInitialState({ startLevel: 3 });
    const questions = selectQuestions(WORDS, 3, 5, state.askedIds, seededRandom(1));

    for (let i = 0; i < 5; i += 1) {
      state = recordAnswer(state, { wordId: questions[i].id, isCorrect: true, responseTime: 900 });
      // 途中で得点も回答数も消えない
      expect(state.stageAnswers).toHaveLength(i + 1);
      expect(stageScore(state)).toBe(i + 1);
    }

    expect(isStageComplete(state)).toBe(true);
    const levelBefore = state.targetLevel;

    state = completeStage(state);
    // 難易度が動くのはステージを締めたときだけ
    expect(state.targetLevel).toBe(levelBefore + 1);
    expect(state.stage).toBe(2);
    // 全体の履歴は残る
    expect(state.allAnswers).toHaveLength(5);
    expect(totalScore(state)).toBe(5);
  });

  test('ステージ得点と全体得点を別に持つ', () => {
    let state = createInitialState({ startLevel: 3 });
    const first = selectQuestions(WORDS, 3, 5, state.askedIds, seededRandom(2));
    first.forEach((q) => { state = recordAnswer(state, { wordId: q.id, isCorrect: true }); });
    state = completeStage(state);

    const second = selectQuestions(WORDS, state.targetLevel, 10, state.askedIds, seededRandom(3));
    second.slice(0, 3).forEach((q) => { state = recordAnswer(state, { wordId: q.id, isCorrect: false }); });

    expect(stageScore(state)).toBe(0);
    expect(totalScore(state)).toBe(5);
  });

  test('同じ単語を二度出さない', () => {
    let state = createInitialState({ startLevel: 3 });
    const seen = new Set();

    for (let stage = 0; stage < 5 && !state.completed; stage += 1) {
      const questions = selectQuestions(WORDS, state.targetLevel, questionsForStage(state.stage), state.askedIds, seededRandom(7));
      for (const question of questions) {
        expect(seen.has(question.id)).toBe(false);
        seen.add(question.id);
        state = recordAnswer(state, { wordId: question.id, isCorrect: stage % 2 === 0 });
      }
      state = completeStage(state);
    }
  });
});

describe('レベル判定', () => {
  test('全問正解でレベルが上がる', () => {
    // 3→4→5→6→7 と上がり、上限に張り付いてから2ステージ安定して終わる
    const state = playThrough(Array(60).fill(true), { startLevel: 3 });
    expect(state.completed).toBe(true);
    expect(state.resultLevel).toBeGreaterThan(3);
  });

  test('全問不正解で下がる', () => {
    const state = playThrough(Array(60).fill(false), { startLevel: 5 });
    expect(state.completed).toBe(true);
    expect(state.resultLevel).toBeLessThan(5);
  });

  test('レベルは1〜7の外へ出ない', () => {
    expect(playThrough(Array(120).fill(true), { startLevel: 7 }).resultLevel).toBeLessThanOrEqual(MAX_LEVEL);
    expect(playThrough(Array(120).fill(false), { startLevel: 1 }).resultLevel).toBeGreaterThanOrEqual(MIN_LEVEL);
  });

  test('同じ回答履歴から常に同じ最終レベルが返る', () => {
    const answers = [true, false, true, true, false, true, true, true, false, false,
                     true, true, false, true, true, false, true, false, true, true,
                     false, true, true, true, false, true, false, true, true, false,
                     true, true, true, false, true];
    const a = playThrough(answers);
    const b = playThrough(answers);
    expect(a.resultLevel).toBe(b.resultLevel);
    expect(a.stage).toBe(b.stage);
    expect(a.allAnswers.length).toBe(b.allAnswers.length);
  });

  test('累積正答率が正しく計算される', () => {
    let state = createInitialState({ startLevel: 3 });
    const questions = selectQuestions(WORDS, 3, 5, state.askedIds, seededRandom(9));
    [true, true, false, true, false].forEach((isCorrect, i) => {
      state = recordAnswer(state, { wordId: questions[i].id, isCorrect });
    });
    expect(totalScore(state)).toBe(3);
    expect(state.allAnswers).toHaveLength(5);
  });
});

describe('早期終了', () => {
  test('最低回答数を満たすまで終わらない', () => {
    // 5問だけ答えてステージを締めても、まだ終わらない
    let state = createInitialState({ startLevel: 3 });
    const questions = selectQuestions(WORDS, 3, 5, state.askedIds, seededRandom(11));
    questions.forEach((q) => { state = recordAnswer(state, { wordId: q.id, isCorrect: true }); });
    state = completeStage(state);
    expect(state.completed).toBe(false);
    expect(state.allAnswers.length).toBeLessThan(15);
  });

  test('レベルが安定し15問以上答えたら終了する', () => {
    // 正答率50%を続けるとレベルが動かない
    const answers = Array.from({ length: 40 }, (_, i) => i % 2 === 0);
    const state = playThrough(answers, { startLevel: 3 });
    expect(state.completed).toBe(true);
    expect(state.allAnswers.length).toBeGreaterThanOrEqual(15);
  });

  test('最大10ステージで必ず終わる', () => {
    // 交互にレベルが動き続けるケースでも打ち切られる
    const answers = Array.from({ length: 200 }, (_, i) => Math.floor(i / 10) % 2 === 0);
    const state = playThrough(answers, { startLevel: 4 });
    expect(state.completed).toBe(true);
    expect(state.stage).toBeLessThanOrEqual(11);
  });
});

describe('pre1 / pre2 を含むデータ', () => {
  test('例外もNaNも起きない', () => {
    const state = playThrough(Array(30).fill(true), { startLevel: 6 });
    expect(Number.isNaN(state.resultLevel)).toBe(false);
    expect(state.resultLevel).toBeGreaterThanOrEqual(MIN_LEVEL);
    expect(state.resultLevel).toBeLessThanOrEqual(MAX_LEVEL);
  });

  test('出題は level だけで選ぶ（eikenLevels の文字列に影響されない）', () => {
    const questions = selectQuestions(WORDS, 6, 10, [], seededRandom(13));
    expect(questions).toHaveLength(10);
    for (const question of questions) {
      expect(Math.abs(question.level - 6)).toBeLessThanOrEqual(1);
    }
  });
});

describe('selectQuestions', () => {
  test('乱数を注入すると同じ問題順を再現できる', () => {
    const a = selectQuestions(WORDS, 3, 10, [], seededRandom(123)).map((w) => w.id);
    const b = selectQuestions(WORDS, 3, 10, [], seededRandom(123)).map((w) => w.id);
    expect(a).toEqual(b);
  });

  test('種が違えば並びも変わる', () => {
    const a = selectQuestions(WORDS, 3, 10, [], seededRandom(1)).map((w) => w.id);
    const b = selectQuestions(WORDS, 3, 10, [], seededRandom(2)).map((w) => w.id);
    expect(a).not.toEqual(b);
  });

  test('出題済みは除外される', () => {
    const first = selectQuestions(WORDS, 3, 10, [], seededRandom(5));
    const asked = first.map((w) => w.id);
    const second = selectQuestions(WORDS, 3, 10, asked, seededRandom(5));
    expect(second.some((w) => asked.includes(w.id))).toBe(false);
  });

  test('候補が足りなければ範囲を広げる', () => {
    const few = [
      { id: 'a', level: 1 },
      { id: 'b', level: 3 },
      { id: 'c', level: 7 },
    ];
    expect(selectQuestions(few, 1, 3, [], seededRandom(1))).toHaveLength(3);
  });

  test('IDの無い単語は出題しない', () => {
    const dirty = [{ level: 3, word: 'no id' }, { id: 'ok', level: 3 }];
    expect(selectQuestions(dirty, 3, 5, [], seededRandom(1)).map((w) => w.id)).toEqual(['ok']);
  });
});

describe('前の問題へ戻る', () => {
  test('直前の回答を取り消せるが、出題済みからは外さない', () => {
    let state = createInitialState({ startLevel: 3 });
    const questions = selectQuestions(WORDS, 3, 5, state.askedIds, seededRandom(17));
    state = recordAnswer(state, { wordId: questions[0].id, isCorrect: true });
    state = recordAnswer(state, { wordId: questions[1].id, isCorrect: false });

    state = undoLastAnswer(state);
    expect(state.stageAnswers).toHaveLength(1);
    expect(state.allAnswers).toHaveLength(1);
    // 同じテスト中に再出題しないため、出題済みIDは残す
    expect(state.askedIds).toContain(questions[1].id);
  });

  test('回答が無ければ何も起きない', () => {
    const state = createInitialState();
    expect(undoLastAnswer(state)).toBe(state);
  });
});

describe('estimateVocabulary', () => {
  test('永続IDのユニーク件数で数える', () => {
    const words = [
      { id: 'w1', level: 1 },
      { id: 'w1', level: 1 }, // 同じIDが別教材から来ても1件
      { id: 'w2', level: 3 },
      { id: 'w3', level: 5 },
    ];
    expect(estimateVocabulary(words, 3)).toBe(2);
    expect(estimateVocabulary(words, 5)).toBe(3);
  });

  test('レベル0や空配列でも壊れない', () => {
    expect(estimateVocabulary([], 3)).toBe(0);
    expect(estimateVocabulary(null, 3)).toBe(0);
  });

  test('実際のマスターでも単調に増える', () => {
    const master = require('../../public/data/words-master.json');
    const counts = [1, 2, 3, 4, 5, 6, 7].map((level) => estimateVocabulary(master, level));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[6]).toBe(master.length);
  });
});

describe('computeResultLevel', () => {
  test('落ち着いたレベルでほぼ全問正解なら1段上げる', () => {
    const answers = Array.from({ length: 10 }, () => ({ level: 4, isCorrect: true }));
    expect(computeResultLevel({ targetLevel: 4, allAnswers: answers })).toBe(5);
  });

  test('ほぼ全問不正解なら1段下げる', () => {
    const answers = Array.from({ length: 10 }, () => ({ level: 4, isCorrect: false }));
    expect(computeResultLevel({ targetLevel: 4, allAnswers: answers })).toBe(3);
  });

  test('中間ならそのまま', () => {
    const answers = Array.from({ length: 10 }, (_, i) => ({ level: 4, isCorrect: i < 6 }));
    expect(computeResultLevel({ targetLevel: 4, allAnswers: answers })).toBe(4);
  });

  test('回答が無ければ現在レベル', () => {
    expect(computeResultLevel({ targetLevel: 3, allAnswers: [] })).toBe(3);
  });
});

describe('答えを見てからの回答', () => {
  const { answerScore, REVEALED_ANSWER_WEIGHT } = require('./placementTestEngine');

  test('思い出せた正解は満点', () => {
    expect(answerScore({ isCorrect: true, revealed: false })).toBe(1);
  });

  test('答えを見てからの「わかる」は半分', () => {
    // 自己申告なので、見てから「知っていた」と答えると実力より甘くなる。
    // 画面が答えを見られる作りである以上、見たこと自体は不正解にしない。
    expect(answerScore({ isCorrect: true, revealed: true })).toBe(REVEALED_ANSWER_WEIGHT);
  });

  test('不正解は見ていても0点', () => {
    expect(answerScore({ isCorrect: false, revealed: true })).toBe(0);
    expect(answerScore({ isCorrect: false, revealed: false })).toBe(0);
  });

  test('全部「見てからわかる」だと最高レベルに届かない', () => {
    const { createInitialState, recordAnswer, completeStage } = require('./placementTestEngine');
    let state = createInitialState();
    for (let i = 0; i < 60; i += 1) {
      state = recordAnswer(state, { wordId: `w${i}`, isCorrect: true, revealed: true });
      if (state.stageAnswers.length >= 10) state = completeStage(state);
      if (state.completed) break;
    }
    // 半分の得点では正答率0.5で、レベルアップの閾値0.7に届かない
    expect(state.targetLevel).toBeLessThanOrEqual(3);
  });
});
