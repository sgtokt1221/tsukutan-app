#!/usr/bin/env node
/**
 * scripts/migrate-review-words.js
 *
 * 既存の users/{uid}/reviewWords を、永続IDつきマスターのIDへ移行する。
 * IMPLEMENTATION_PLAN.md 9.5。
 *
 *   node scripts/migrate-review-words.js                    # ドライラン（既定）
 *   node scripts/migrate-review-words.js --uid <uid>        # 1人だけ確認
 *   node scripts/migrate-review-words.js --execute          # 本実行
 *
 * **本番 Firestore を読み書きする。** 既定はドライランで、`--execute` を明示しない限り
 * 1件も書き込まない。本実行の前に必ずドライランの件数を確認すること。
 *
 * 本実行がすること
 *   - 新IDの文書を作る（旧文書は消さない）
 *   - 旧文書に migratedTo を記録する
 *   - 同じ新IDへ複数の旧文書が集まる場合は計画書9.5の規則で統合する
 *
 * 本実行がしないこと
 *   - 旧文書の削除。移行後の照合が済むまで残す
 *   - 曖昧・対応不能な文書への書き込み。レポートに出して手当てを促す
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const { buildIndex, mapReviewWord, mergeReviewDocs } = require('./lib/reviewWordMapping');

const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'public', 'data', 'words-master.json');
const PROJECT_ID = 'tsukutan-58b3f';

const argv = process.argv.slice(2);
const EXECUTE = argv.includes('--execute');
const uidIndex = argv.indexOf('--uid');
const ONLY_UID = uidIndex >= 0 ? argv[uidIndex + 1] : null;

const main = async () => {
  if (!fs.existsSync(MASTER_PATH)) {
    console.error('public/data/words-master.json がありません。先に node scripts/build-word-master.js を実行してください。');
    process.exit(1);
  }

  // 認証は Application Default Credentials を優先する。
  //   gcloud auth application-default login
  // で済むなら、鍵ファイルをローカルに置かずに実行できる。
  // ADC が無い環境向けに serviceAccountKey.json へフォールバックする。
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
  const index = buildIndex(master);

  console.log(EXECUTE ? '=== 本実行 ===' : '=== ドライラン（書き込みません） ===');
  console.log(`マスター: ${master.length} 件`);

  const userDocs = ONLY_UID
    ? [await db.collection('users').doc(ONLY_UID).get()]
    : (await db.collection('users').get()).docs;

  const totals = { users: 0, docs: 0, matched: 0, ambiguous: 0, unmatched: 0, merged: 0, alreadyMigrated: 0 };
  const perUser = [];
  const problems = [];

  for (const userDoc of userDocs) {
    if (!userDoc.exists) continue;
    const uid = userDoc.id;
    const snapshot = await db.collection('users').doc(uid).collection('reviewWords').get();
    if (snapshot.empty) continue;

    totals.users += 1;

    // 新IDごとに旧文書を束ねる
    const byNewId = new Map();
    const userProblems = [];

    for (const reviewDoc of snapshot.docs) {
      totals.docs += 1;
      const data = reviewDoc.data();

      if (data.migratedTo) {
        totals.alreadyMigrated += 1;
        continue;
      }

      const result = mapReviewWord(data, index);

      if (result.status === 'matched') {
        totals.matched += 1;
        if (!byNewId.has(result.id)) byNewId.set(result.id, []);
        byNewId.get(result.id).push({ ...data, __oldId: reviewDoc.id, __via: result.via });
      } else {
        totals[result.status] += 1;
        userProblems.push({
          uid,
          oldId: reviewDoc.id,
          word: data.word ?? null,
          partOfSpeech: data.partOfSpeech ?? null,
          meaning: data.meaning ?? null,
          level: data.level ?? null,
          status: result.status,
          reason: result.reason ?? null,
          candidates: result.candidates ?? null,
        });
      }
    }

    const mergedIds = [...byNewId.entries()].filter(([, docs]) => docs.length > 1);
    totals.merged += mergedIds.length;

    perUser.push({
      uid,
      oldDocs: snapshot.size,
      newDocs: byNewId.size,
      mergedGroups: mergedIds.length,
      problems: userProblems.length,
    });
    problems.push(...userProblems);

    if (!EXECUTE) continue;

    //------------------------------------------------------------------------
    // 本実行
    //------------------------------------------------------------------------
    // commit したバッチは再利用できない。使い切ったら必ず作り直す。
    let batch = db.batch();
    let writes = 0;
    let committed = 0;

    for (const [newId, docs] of byNewId) {
      const masterEntry = master.find((entry) => entry.id === newId);
      if (!masterEntry) {
        problems.push({ uid, oldId: null, status: 'unmatched', reason: `マスターにIDが無い: ${newId}` });
        continue;
      }
      const merged = mergeReviewDocs(docs);

      batch.set(
        db.collection('users').doc(uid).collection('reviewWords').doc(newId),
        {
          ...masterEntry,
          lastReviewed: merged.lastReviewed ? admin.firestore.Timestamp.fromMillis(merged.lastReviewed) : null,
          nextReviewDate: merged.nextReviewDate ? admin.firestore.Timestamp.fromMillis(merged.nextReviewDate) : null,
          repetitions: merged.repetitions,
          easeFactor: merged.easeFactor,
          interval: merged.interval,
          migratedFrom: merged.migratedFrom,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      writes += 1;

      for (const oldDoc of docs) {
        if (oldDoc.__oldId === newId) continue;
        batch.set(
          db.collection('users').doc(uid).collection('reviewWords').doc(oldDoc.__oldId),
          { migratedTo: newId, migratedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        writes += 1;
      }

      // Firestore のバッチ上限（500）に達する前に区切る。
      // commit 済みのバッチには追記できないので、必ず新しく作り直す。
      if (writes >= 400) {
        await batch.commit();
        committed += writes;
        batch = db.batch();
        writes = 0;
      }
    }

    if (writes > 0) {
      await batch.commit();
      committed += writes;
    }
    console.log(`  ${uid}: 旧${snapshot.size} → 新${byNewId.size}（書き込み ${committed} 件）`);
  }

  //--------------------------------------------------------------------------
  console.log('\n=== 集計 ===');
  console.log(`  対象ユーザー      : ${totals.users}`);
  console.log(`  旧文書            : ${totals.docs}`);
  console.log(`  移行済み（スキップ）: ${totals.alreadyMigrated}`);
  console.log(`  一意に対応        : ${totals.matched}`);
  console.log(`  複数候補（保留）  : ${totals.ambiguous}`);
  console.log(`  対応不能（保留）  : ${totals.unmatched}`);
  console.log(`  統合されるグループ: ${totals.merged}`);

  if (perUser.length) {
    console.log('\n=== ユーザー別 ===');
    for (const row of perUser) {
      console.log(`  ${row.uid}  旧${row.oldDocs} → 新${row.newDocs}  統合${row.mergedGroups}  要手当て${row.problems}`);
    }
  }

  const reportPath = path.join(ROOT, 'docs', 'baseline', `review-words-migration-${EXECUTE ? 'execute' : 'dryrun'}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({ totals, perUser, problems }, null, 2)}\n`);
  console.log(`\nレポート: ${path.relative(ROOT, reportPath)}`);

  if (!EXECUTE) {
    console.log('\nドライランなので何も書き込んでいません。');
    console.log('件数を確認したうえで --execute を付けて再実行してください。');
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
