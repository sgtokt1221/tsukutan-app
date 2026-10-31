/**
 * 先生が出した小テスト（管理画面から出したもの）。**読み書きと4択の組み立て。**
 *
 * - 出したもの: `quiz_assignments/{id}`（つくつくの関数 `staffQuizAssignments` が書く。
 *   読めるのは対象の生徒だけ → firestore.rules）。出した時点の語を `words` に写して持っている
 * - 結果: `users/{uid}/quizResults/{id}`（本人が書く）。**結果があれば済み**
 *
 * **楽観的更新をしない。** 保存したら読み直してカードを消す（呼び出し側が loadPendingQuizzes を呼び直す）。
 */
import { collection, doc, getDoc, getDocs, query, where, orderBy, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { addWordToReview } from './reviewLogic';

/**
 * まだ解いていない小テスト（新しい順）。
 * 読めなければ投げる（「小テストが無い」と「読めなかった」を分けるため。呼び出し側で黙って隠す）。
 */
export async function loadPendingQuizzes(uid) {
  if (!uid) return [];
  const snap = await getDocs(query(
    collection(db, 'quiz_assignments'),
    where('targetUids', 'array-contains', uid),
    where('active', '==', true),
    orderBy('createdAt', 'desc'),
  ));
  // 明示の id は展開のあとに置く（中身に同名の欄があっても文書IDが勝つ）
  const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const done = await Promise.all(all.map((a) => getDoc(doc(db, 'users', uid, 'quizResults', a.id)).then((r) => r.exists())));
  return all.filter((_, i) => !done[i]);
}

/** 結果を保存する。**undefined を入れない**（Firestore が書き込みごと拒否する） */
export async function saveQuizResult(uid, quiz, answers) {
  const score = answers.filter((a) => a.correct).length;
  await setDoc(doc(db, 'users', uid, 'quizResults', quiz.id), {
    title: String(quiz.title || ''),
    score,
    total: answers.length,
    answers: answers.map((a) => ({ id: String(a.id), correct: Boolean(a.correct) })),
    finishedAt: serverTimestamp(),
  });
  return { score, total: answers.length };
}

/**
 * 自分で始めたテスト（教材を選んで「テスト」。2026-09-27）の結果。**先生の小テストの結果（quizResults）と混ぜない**
 * （混ぜると先生の画面で「出していない小テストを解いた」ことになる）。
 */
export async function saveSelfTestResult(uid, quiz, answers) {
  const score = answers.filter((a) => a.correct).length;
  // 間違えた語も写して持つ（先生の画面で中身を見せる。自分でしたテストは出した語を別に持っていない）
  const wrong = new Set(answers.filter((a) => !a.correct).map((a) => String(a.id)));
  const missed = (quiz.words || []).filter((w) => wrong.has(String(w.id)))
    .map((w) => ({ word: String(w.word || ''), meaning: String(w.meaning || '') }));
  await setDoc(doc(db, 'users', uid, 'selfTests', quiz.id), {
    title: String(quiz.title || ''),
    score,
    total: answers.length,
    answers: answers.map((a) => ({ id: String(a.id), correct: Boolean(a.correct) })),
    missed,
    finishedAt: serverTimestamp(),
  });
  return { score, total: answers.length };
}

/** 自分で始めるテストの問題数の上限。100語の帯を全部出すと長すぎる */
export const SELF_TEST_MAX = 20;

/**
 * 自分で始めるテストを組む。範囲の語から**混ぜて**最大 SELF_TEST_MAX 問。
 * ひっかけは同じ教材の語（pool）から選ぶ（高校の単語帳に中学の教科書の訳が混ざらないように）。
 */
export function buildSelfTest({ title, words, pool }, random = Math.random, now = Date.now()) {
  const usable = (words || []).filter((w) => w && w.id && w.word && w.meaning);
  return {
    id: `self_${now}`,
    title: String(title || ''),
    words: shuffle(usable, random).slice(0, SELF_TEST_MAX),
    direction: 'en-ja',
    selfTest: true,
    pool: pool || [],
  };
}

const shuffle = (items, random) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** 問題文と答え。英→和なら語を見せて意味を選ぶ、和→英なら意味を見せて語を選ぶ */
export const promptOf = (word, direction) => (direction === 'ja-en' ? word.meaning : word.word);
export const answerOf = (word, direction) => (direction === 'ja-en' ? word.word : word.meaning);

/**
 * 4択の選択肢。**正解と同じ文字の選択肢は出さない**（同じ意味の語が2つあると正解が2つになる）。
 * ひっかけは同じ小テストの語から、足りなければ教科書の同じ学年の語から選ぶ。
 * @param {object} word 問題の語
 * @param {Array} quizWords 同じ小テストの語
 * @param {Array} extraPool 足りないときに使う語（教科書の同じ学年）
 * @returns {string[]} 4つ（候補が足りなければそれ以下）。正解を含み、混ぜてある
 */
export function buildChoices(word, quizWords, extraPool, direction, random = Math.random) {
  const correct = answerOf(word, direction);
  const seen = new Set([correct]);
  const distractors = [];
  for (const pool of [shuffle(quizWords || [], random), shuffle(extraPool || [], random)]) {
    for (const w of pool) {
      if (distractors.length >= 3) break;
      const text = answerOf(w, direction);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      distractors.push(text);
    }
  }
  return shuffle([correct, ...distractors], random);
}

/**
 * 間違えた語を復習に入れる。**もう復習に入っている語は触らない**（覚えた間隔を上書きしない。
 * 間違えたことは次の復習で採点される）。
 */
export async function addMissedWordsToReview(uid, words) {
  for (const word of words) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await getDoc(doc(db, 'users', uid, 'reviewWords', word.id));
    if (existing.exists()) continue;
    // eslint-disable-next-line no-await-in-loop
    await addWordToReview(uid, { id: word.id, word: word.word, meaning: word.meaning });
  }
}
