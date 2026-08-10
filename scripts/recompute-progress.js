#!/usr/bin/env node
/**
 * scripts/recompute-progress.js
 *
 * users/{uid}.progress を、いまの数え方（和集合）で計算し直す。
 *
 *   node scripts/recompute-progress.js                 # ドライラン（既定）
 *   node scripts/recompute-progress.js --uid <uid>     # 1人だけ確認
 *   node scripts/recompute-progress.js --execute       # 本実行
 *
 * **本番 Firestore を読み書きする。** 既定はドライランで、`--execute` を明示しない限り
 * 1件も書き込まない。本実行の前に必ずドライランの件数を確認すること。
 *
 * なぜ必要か
 *   到達語数は以前「実力テストでの一括計上 + 新規学習ごとの increment」で
 *   足し算していて、収録語数を超える値が出ていた。src/logic/vocabularyCount.js
 *   で和集合に直したが、保存済みの値はその生徒が次に学習するまで古いままになる。
 *   ここで全員分を一度そろえる。
 *
 * 計算内容は src/logic/progressLogic.js の updateProgressPercentage と同じ。
 * 片方だけ直すと表示がずれるので、変えるときは両方を見ること。
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'public', 'data', 'words-master.json');
const PROJECT_ID = 'tsukutan-58b3f';

const argv = process.argv.slice(2);
const EXECUTE = argv.includes('--execute');
const uidIndex = argv.indexOf('--uid');
const ONLY_UID = uidIndex >= 0 ? argv[uidIndex + 1] : null;

/** 判定レベル以下の語数。実力テストが「大丈夫だろう」とみなす範囲。 */
const assessedWordCount = (master, assessedLevel) => {
  if (!Number.isFinite(assessedLevel) || assessedLevel <= 0) return 0;
  const ids = new Set();
  for (const word of master) {
    if (!word || (word.level ?? 0) > assessedLevel) continue;
    ids.add(word.id || `${word.word}|${word.partOfSpeech}|${word.meaning}`);
  }
  return ids.size;
};

/** 復習完了のうち、判定レベルより上にある語の数。下は上の集合に含まれるので足さない。 */
const masteredBeyondAssessment = (reviewWords, assessedLevel) => {
  const level = Number.isFinite(assessedLevel) ? assessedLevel : 0;
  const ids = new Set();
  for (const word of reviewWords) {
    if (!word || word.migratedTo) continue;
    if (word.status !== 'mastered') continue;
    if ((word.level ?? 0) <= level) continue;
    ids.add(word.id || word.word);
  }
  return ids.size;
};

const achievementPercentage = (reached, target) => {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.round((reached / target) * 100));
};

const main = async () => {
  if (!fs.existsSync(MASTER_PATH)) {
    console.error('public/data/words-master.json がありません。先に node scripts/build-word-master.js を実行してください。');
    process.exit(1);
  }

  // 認証は Application Default Credentials を優先し、無ければ鍵ファイルへ落とす。
  if (!admin.apps.length) {
    const serviceAccountPath = path.join(ROOT, 'serviceAccountKey.json');
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: PROJECT_ID,
      });
    } catch (adcError) {
      if (!fs.existsSync(serviceAccountPath)) {
        console.error('認証情報がありません。`gcloud auth application-default login` を実行するか、serviceAccountKey.json を置いてください。');
        process.exit(1);
      }
      // eslint-disable-next-line global-require, import/no-dynamic-require
      admin.initializeApp({ credential: admin.credential.cert(require(serviceAccountPath)) });
    }
  }
  const db = admin.firestore();

  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));

  console.log(EXECUTE ? '=== 本実行 ===' : '=== ドライラン（書き込みません） ===');
  console.log(`マスター: ${master.length} 件`);

  // 判定レベルは1〜7しかないので、レベルごとの語数は先に出しておく。
  const assessedByLevel = new Map();
  for (let level = 0; level <= 7; level += 1) {
    assessedByLevel.set(level, assessedWordCount(master, level));
  }
  console.log('レベル別の到達語数:', [...assessedByLevel.entries()].map(([l, n]) => `${l}:${n}`).join(' / '));

  const goalsSnapshot = await db.collection('goalsMaster').get();
  const goalsMaster = new Map(goalsSnapshot.docs.map((d) => [d.id, d.data()]));
  console.log(`goalsMaster: ${goalsMaster.size} 件`);

  const userDocs = ONLY_UID
    ? [await db.collection('users').doc(ONLY_UID).get()]
    : (await db.collection('users').get()).docs;

  const stats = { total: 0, missing: 0, noGoal: 0, changed: 0, same: 0, written: 0 };
  const samples = [];

  for (const userDoc of userDocs) {
    if (!userDoc.exists) {
      stats.missing += 1;
      console.error(`ユーザーが見つかりません: ${ONLY_UID}`);
      continue;
    }
    stats.total += 1;

    const userData = userDoc.data();
    const goal = userData.goal;
    const before = userData.progress || {};

    // 目標未設定は 0%。updateProgressPercentage と同じ扱いにする。
    if (!goal || !Array.isArray(goal.targets) || goal.targets.length === 0 || !userData.progress) {
      stats.noGoal += 1;
      if (before.percentage !== 0) {
        stats.changed += 1;
        if (EXECUTE) {
          await userDoc.ref.update({ 'progress.percentage': 0 });
          stats.written += 1;
        }
      } else {
        stats.same += 1;
      }
      continue;
    }

    const targetVocabulary = Math.max(
      ...goal.targets.map((t) => goalsMaster.get(t.goalId)?.requiredVocabulary || 0),
    );

    const assessedLevel = userData.level || 0;
    const reviewSnapshot = await userDoc.ref.collection('reviewWords').get();
    const reviewWords = reviewSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    const assessed = assessedByLevel.get(assessedLevel) ?? assessedWordCount(master, assessedLevel);
    const beyond = masteredBeyondAssessment(reviewWords, assessedLevel);
    const total = assessed + beyond;
    const percentage = achievementPercentage(total, targetVocabulary);

    const isSame = before.percentage === percentage
      && before.currentVocabulary === total
      && before.targetVocabulary === targetVocabulary
      && before.assessedVocabulary === assessed
      && before.masteredBeyondAssessment === beyond
      && before.assessedLevel === assessedLevel;

    if (isSame) {
      stats.same += 1;
      continue;
    }

    stats.changed += 1;
    if (samples.length < 10) {
      samples.push(
        `${userData.studentId || userDoc.id}: `
        + `${before.currentVocabulary ?? '-'}語(${before.percentage ?? '-'}%) → `
        + `${total}語(${percentage}%) [Lv${assessedLevel} テスト範囲${assessed} + 復習完了${beyond} / 目標${targetVocabulary}]`,
      );
    }

    if (EXECUTE) {
      await userDoc.ref.update({
        'progress.percentage': percentage,
        'progress.targetVocabulary': targetVocabulary,
        'progress.currentVocabulary': total,
        'progress.assessedVocabulary': assessed,
        'progress.masteredBeyondAssessment': beyond,
        'progress.assessedLevel': assessedLevel,
      });
      stats.written += 1;
    }
  }

  console.log('');
  console.log(`対象ユーザー: ${stats.total} 人`);
  console.log(`  目標未設定 : ${stats.noGoal} 人`);
  console.log(`  変更あり   : ${stats.changed} 人`);
  console.log(`  変更なし   : ${stats.same} 人`);
  console.log(`  書き込み   : ${stats.written} 人${EXECUTE ? '' : '（ドライランのため0）'}`);

  if (samples.length) {
    console.log('');
    console.log('変更の例:');
    samples.forEach((line) => console.log(`  ${line}`));
  }

  if (!EXECUTE) {
    console.log('');
    console.log('書き込むには --execute を付けて実行してください。');
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
