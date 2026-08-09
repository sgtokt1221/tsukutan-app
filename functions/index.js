// Firebase SDK
const { onRequest, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
admin.initializeApp();
const db = admin.firestore();

// 外部ライブラリ
const express = require('express');
const cors = require('cors');
const { VertexAI } = require('@google-cloud/vertexai');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1;

// 自前モジュール
const {
  decodeCsv,
  parseStudentCsv,
  buildImportPlan,
} = require('./lib/studentImport');
const { getCurrentMonthKey } = require('./lib/dateKeys');

//==============================================================================
// ユーザー一括インポート機能 (シンプル版)
//==============================================================================
const importUsersApp = express();
importUsersApp.use(cors({ origin: true }));
importUsersApp.use(express.json({ limit: '10mb' }));

const manageStudentsApp = express();
manageStudentsApp.use(cors({ origin: true }));
manageStudentsApp.use(express.json({ limit: '1mb' }));

const verifyAdmin = async (req) => {
  const idToken = req.get('Authorization')?.split('Bearer ')[1];
  if (!idToken) {
    throw new HttpsError('unauthenticated', 'Authorization header is missing.');
  }
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  if (decodedToken.email !== 'tsukasafoods@gmail.com') {
    throw new HttpsError('permission-denied', 'You do not have permission to perform this action.');
  }
  return decodedToken;
};

const IMPORT_BATCH_SIZE = 400;
const IMPORT_OPERATION_TTL_MS = 30 * 60 * 1000;

/** studentId を持つ users 文書だけを生徒とみなす（管理者などを巻き込まないため） */
const fetchExistingStudents = async () => {
  const snapshot = await db.collection('users').get();
  return snapshot.docs
    .map((docSnapshot) => ({ uid: docSnapshot.id, ...docSnapshot.data() }))
    .filter((user) => typeof user.studentId === 'string' && user.studentId.trim() !== '')
    .map((user) => ({
      uid: user.uid,
      studentId: user.studentId.trim(),
      name: user.name ?? null,
      grade: user.grade ?? null,
    }));
};

const csvFingerprint = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const emptySummary = () => ({ create: 0, update: 0, unchanged: 0, disableCandidates: 0, errors: 0 });

/** 400件ずつに切って commit する。Firestore のバッチ上限500に対する余裕分を残す。 */
const commitInChunks = async (items, applyToBatch) => {
  for (let i = 0; i < items.length; i += IMPORT_BATCH_SIZE) {
    const chunk = items.slice(i, i + IMPORT_BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((item) => applyToBatch(batch, item));
    await batch.commit();
  }
};

/**
 * 生徒CSVインポート。
 *
 * リクエスト: { mode: 'upsert'|'replace', dryRun: boolean, fileName, fileData(base64), operationId? }
 *
 * 重要な性質:
 *   - 全行の検証が通るまで1件も書き込まない
 *   - CSVにいない生徒を削除しない（replace でも無効化のみ）
 *   - 既存生徒のパスワードを再設定しない
 *   - パスワードをレスポンスにもログにも出さない
 */
importUsersApp.post('/', async (req, res) => {
  try {
    const adminToken = await verifyAdmin(req);

    const {
      mode = 'upsert',
      dryRun = true,
      fileName = null,
      fileData,
      operationId = null,
    } = req.body || {};

    if (!fileData) {
      return res.status(400).json({ error: 'ファイルが送信されていません。' });
    }
    if (mode !== 'upsert' && mode !== 'replace') {
      return res.status(400).json({ error: `mode が不正です: ${mode}（upsert か replace）` });
    }

    const buffer = Buffer.from(fileData, 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'ファイルが空です。' });
    }

    let text;
    try {
      text = decodeCsv(buffer);
    } catch (decodeError) {
      return res.status(400).json({ error: decodeError.message });
    }

    const { rows, errors, warnings } = parseStudentCsv(text);
    const fingerprint = csvFingerprint(buffer);

    // 検証優先。1件でもエラーがあれば既存データには一切触れない。
    if (errors.length > 0) {
      return res.status(400).json({
        valid: false,
        mode,
        summary: { ...emptySummary(), errors: errors.length },
        errors,
        warnings,
        message: 'CSVに問題があるため中止しました。既存データは変更していません。',
      });
    }

    const existing = await fetchExistingStudents();
    const plan = buildImportPlan(rows, existing, mode);

    //--------------------------------------------------------------------------
    // ドライラン: 差分を返すだけ。書き込みは操作記録のみ。
    //--------------------------------------------------------------------------
    if (dryRun) {
      const newOperationId = crypto.randomUUID();
      await db.collection('importOperations').doc(newOperationId).set({
        status: 'previewed',
        mode,
        fileName,
        fingerprint,
        rowCount: rows.length,
        summary: plan.summary,
        createdByUid: adminToken.uid ?? null,
        createdByEmail: adminToken.email ?? null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + IMPORT_OPERATION_TTL_MS),
      });

      return res.status(200).json({
        operationId: newOperationId,
        valid: true,
        dryRun: true,
        mode,
        summary: plan.summary,
        errors: [],
        warnings,
        preview: {
          create: plan.create.map((row) => ({ line: row.line, studentId: row.studentId, name: row.name, grade: row.grade })),
          update: plan.update.map((row) => ({ line: row.line, studentId: row.studentId, name: row.name, grade: row.grade, changes: row.changes })),
          disableCandidates: mode === 'replace' ? plan.disableCandidates : [],
        },
      });
    }

    //--------------------------------------------------------------------------
    // 本実行: 確認済みの operationId と、確認したときと同じCSVであることを要求する。
    //--------------------------------------------------------------------------
    if (!operationId) {
      return res.status(400).json({ error: '先に内容を確認してください（operationId がありません）。' });
    }

    const operationRef = db.collection('importOperations').doc(operationId);
    const operationSnapshot = await operationRef.get();
    if (!operationSnapshot.exists) {
      return res.status(400).json({ error: '確認記録が見つかりません。もう一度内容を確認してください。' });
    }

    const operation = operationSnapshot.data();
    if (operation.status !== 'previewed') {
      return res.status(409).json({ error: `この確認は既に処理されています（状態: ${operation.status}）。` });
    }
    if (operation.fingerprint !== fingerprint) {
      return res.status(409).json({ error: '確認したCSVと内容が異なります。もう一度内容を確認してください。' });
    }
    if (operation.mode !== mode) {
      return res.status(409).json({ error: `確認時のモード（${operation.mode}）と異なります。` });
    }
    if (operation.expiresAt && operation.expiresAt.toMillis() < Date.now()) {
      return res.status(410).json({ error: '確認から時間が経ちすぎています。もう一度内容を確認してください。' });
    }

    // 二重送信対策。previewed のときだけ running へ進めるトランザクション。
    try {
      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(operationRef);
        if (!fresh.exists || fresh.data().status !== 'previewed') {
          throw new HttpsError('aborted', 'already-running');
        }
        transaction.update(operationRef, {
          status: 'running',
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } catch (lockError) {
      return res.status(409).json({ error: 'この取り込みは既に実行中です。' });
    }

    const executionErrors = [];
    let created = 0;
    let updated = 0;
    let disabled = 0;

    // --- 新規作成 ---
    for (const row of plan.create) {
      const email = `${row.studentId}@tsukasafoods.com`;
      let createdAuthUid = null;
      try {
        let userRecord = await admin.auth().getUserByEmail(email).catch((error) => {
          if (error.code === 'auth/user-not-found') return null;
          throw error;
        });

        if (!userRecord) {
          // 新規のときだけ初期パスワードを設定する。値はレスポンスにもログにも出さない。
          userRecord = await admin.auth().createUser({
            email,
            password: `tsukuba${row.studentId}`,
            displayName: row.name,
          });
          createdAuthUid = userRecord.uid;
        }

        await db.collection('users').doc(userRecord.uid).set({
          name: row.name,
          studentId: row.studentId,
          grade: row.grade,
          level: 0,
          goal: { targets: [], isSet: false, targetDate: null, motivationLevel: null, setAt: null },
          progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
        }, { merge: true });

        created += 1;
      } catch (error) {
        // Firestore で失敗したら、このリクエストで作った Auth ユーザーだけ巻き戻す。
        if (createdAuthUid) {
          await admin.auth().deleteUser(createdAuthUid).catch((rollbackError) => {
            logger.error('[Import] Auth ロールバックに失敗', { studentId: row.studentId, message: rollbackError.message });
          });
        }
        executionErrors.push({ line: row.line, studentId: row.studentId, message: `作成に失敗しました: ${error.message}` });
      }
    }

    // --- 更新（氏名・学年のみ。進捗・目標・ログ・ストーリーには触れない） ---
    try {
      await commitInChunks(plan.update, (batch, row) => {
        batch.set(
          db.collection('users').doc(row.uid),
          { name: row.name, grade: row.grade, studentId: row.studentId },
          { merge: true }
        );
      });
      updated = plan.update.length;
    } catch (error) {
      executionErrors.push({ line: null, studentId: null, message: `更新に失敗しました: ${error.message}` });
    }

    // --- replace: CSVにいない生徒を無効化（削除はしない） ---
    if (mode === 'replace' && plan.disableCandidates.length > 0) {
      try {
        await commitInChunks(plan.disableCandidates, (batch, candidate) => {
          batch.set(
            db.collection('users').doc(candidate.uid),
            { disabledAt: admin.firestore.FieldValue.serverTimestamp(), disabledByOperationId: operationId },
            { merge: true }
          );
        });
        for (const candidate of plan.disableCandidates) {
          try {
            const userRecord = await admin.auth().getUserByEmail(`${candidate.studentId}@tsukasafoods.com`);
            await admin.auth().updateUser(userRecord.uid, { disabled: true });
            disabled += 1;
          } catch (error) {
            if (error.code !== 'auth/user-not-found') {
              executionErrors.push({ line: null, studentId: candidate.studentId, message: `無効化に失敗しました: ${error.message}` });
            }
          }
        }
      } catch (error) {
        executionErrors.push({ line: null, studentId: null, message: `無効化に失敗しました: ${error.message}` });
      }
    }

    const result = {
      created,
      updated,
      unchanged: plan.unchanged.length,
      disabled,
      errors: executionErrors.length,
    };

    await operationRef.update({
      status: executionErrors.length ? 'completedWithErrors' : 'completed',
      result,
      executionErrors,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      operationId,
      valid: true,
      dryRun: false,
      mode,
      result,
      errors: executionErrors,
      warnings,
      message: executionErrors.length
        ? '一部の行で失敗しました。詳細を確認してください。'
        : '取り込みが完了しました。',
    });
  } catch (error) {
    const statusCode = error instanceof HttpsError ? 403 : 500;
    logger.error('User import failed:', { errorMessage: error.message, errorStack: error.stack });
    return res.status(statusCode).json({ error: error.message || 'Internal Server Error' });
  }
});

// Firebase FunctionsのエンドポイントとしてExpressアプリをエクスポート
exports.importUsers = onRequest(
  { 
    region: "us-central1", 
    memory: "512MiB",
    timeoutSeconds: 300,
    maxInstances: 10,
    serviceAccount: "115384710973-compute@developer.gserviceaccount.com",
  },
  importUsersApp
);

manageStudentsApp.post('/', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { studentId, name, grade } = req.body || {};

    if (!studentId || !/^[0-9]{4}$/.test(studentId)) {
      throw new HttpsError('invalid-argument', 'studentId must be a 4-digit string');
    }
    if (!name || typeof name !== 'string') {
      throw new HttpsError('invalid-argument', 'name is required');
    }
    if (!grade || typeof grade !== 'string') {
      throw new HttpsError('invalid-argument', 'grade is required');
    }

    const trimmedId = studentId.trim();
    const email = `${trimmedId}@tsukasafoods.com`;
    const password = `tsukuba${trimmedId}`;

    const newUserRecord = await admin.auth().createUser({ email, password, displayName: name.trim() });
    await db.collection('users').doc(newUserRecord.uid).set({
      name: name.trim(),
      studentId: trimmedId,
      grade: grade.trim(),
      level: 0,
      goal: { targetExam: null, targetDate: null, isSet: false },
      progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
    });

    return res.status(201).json({ message: 'Student created', uid: newUserRecord.uid });
  } catch (error) {
    const code = error instanceof HttpsError ? error.code : 'internal';
    const message = error instanceof HttpsError ? error.message : (error.message || 'Internal error');
    logger.error('Create student failed:', error);
    return res.status(code === 'internal' ? 500 : 400).json({ error: message });
  }
});

const deleteUserDataRecursively = async (docRef) => {
  const collections = await docRef.listCollections();
  for (const collectionRef of collections) {
    const snapshot = await collectionRef.get();
    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    await Promise.all(snapshot.docs.map((doc) => deleteUserDataRecursively(doc.ref)));
  }
  await docRef.delete();
};

manageStudentsApp.delete('/:uid', async (req, res) => {
  try {
    await verifyAdmin(req);
    const { uid } = req.params;
    if (!uid) {
      throw new HttpsError('invalid-argument', 'UID is required');
    }

    const userDocRef = db.collection('users').doc(uid);
    const docSnapshot = await userDocRef.get();

    if (!docSnapshot.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const data = docSnapshot.data();
    const email = data?.studentId ? `${data.studentId}@tsukasafoods.com` : null;

    await deleteUserDataRecursively(userDocRef);

    if (email) {
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        await admin.auth().deleteUser(userRecord.uid);
      } catch (authError) {
        if (authError.code !== 'auth/user-not-found') {
          throw authError;
        }
      }
    }

    return res.status(200).json({ message: 'Student deleted' });
  } catch (error) {
    const code = error instanceof HttpsError ? error.code : 'internal';
    const message = error instanceof HttpsError ? error.message : (error.message || 'Internal error');
    logger.error('Delete student failed:', error);
    return res.status(code === 'internal' ? 500 : 400).json({ error: message });
  }
});

exports.manageStudents = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 120,
    serviceAccount: "115384710973-compute@developer.gserviceaccount.com",
  },
  manageStudentsApp
);

const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

const LEVEL_DESCRIPTIONS = {
  1: 'a very beginner level (CEFR A1)', 2: 'a beginner level (CEFR A1)',
  3: 'an elementary level (CEFR A2)', 4: 'a pre-intermediate level (CEFR A2)',
  5: 'an intermediate level (CEFR B1)', 6: 'an upper-intermediate level (CEFR B1-B2)',
  7: 'an advanced level (CEFR B2)',
};

const STORY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    story: { type: 'string', description: 'The generated story, as a single block of plain text without any markdown or formatting symbols.' },
    unusedWords: { type: 'array', description: 'Words from the provided list that could not be logically included.', items: { type: 'string' } },
  },
  required: ['story', 'unusedWords'],
};

/** Gemini に1本の物語を書かせる */
const generateStory = async (wordObjects, userLevel) => {
  const levelDescription = LEVEL_DESCRIPTIONS[userLevel] || LEVEL_DESCRIPTIONS[3];
  const wordList = wordObjects.map((w) => w.word).join(', ');

  const prompt = `
You are an expert in creating educational materials for English language learners.
Your task is to write a coherent and logical short story for a student at ${levelDescription}.

Please adhere to the following rules:
1.  **Use all of the following words**: ${wordList}.
2.  **Story requirements**: The story must be logical, coherent, and interesting. It should be between 150 and 200 words.
3.  **Output format**: The output must be a single, valid JSON object that conforms to the following schema. Do not output any text or markdown before or after the JSON object.
    \`\`\`json
    ${JSON.stringify(STORY_JSON_SCHEMA, null, 2)}
    \`\`\`
4.  If you cannot logically include a word, add it to the "unusedWords" array. If all words are used, the array must be empty.
`;

  const vertexAi = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
  const generativeModel = vertexAi.getGenerativeModel({
    model: 'gemini-2.0-flash-001',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const resp = await generativeModel.generateContent(prompt);
  const candidate = resp.response?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    logger.error('Story generation failed. Invalid response structure from AI.', {
      finishReason: resp.response?.finishReason,
      safetyRatings: resp.response?.safetyRatings,
    });
    throw new HttpsError('internal', 'AI returned an invalid response structure.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    logger.error('Failed to parse AI response as JSON.', { responseText: text });
    throw new HttpsError('internal', 'AI returned a non-JSON response.');
  }

  if (!parsed.story || typeof parsed.story !== 'string') {
    throw new HttpsError('internal', 'Failed to generate a valid story from the AI response.');
  }
  return { story: parsed.story, unusedWords: Array.isArray(parsed.unusedWords) ? parsed.unusedWords : [] };
};

/** 英文を日本語へ訳す */
const translateToJapanese = async (text) => {
  const translationClient = new TranslationServiceClient();
  const projectId = process.env.GCLOUD_PROJECT;
  const [response] = await translationClient.translateText({
    parent: `projects/${projectId}/locations/global`,
    contents: [text],
    mimeType: 'text/plain',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'ja',
  });
  return response.translations[0]?.translatedText || '';
};

//==============================================================================
// AIストーリー生成機能 (The user's working version, unchanged)
//==============================================================================
const corsForStory = cors({origin: true});

exports.generateStoryFromWords = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    serviceAccount: "115384710973-compute@developer.gserviceaccount.com",
  },
  (req, res) => {
    corsForStory(req, res, async () => {
      // 正常に動作していたため、この関数のCORS処理は変更しない
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
      }

      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
      }
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(403).json({ error: 'Unauthorized: No token provided.' });
      }
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (error) {
        logger.error("Error verifying auth token:", error);
        return res.status(403).json({ error: 'Unauthorized: Invalid token.' });
      }
      const userId = decodedToken.uid;
      const { words } = req.body;
      if (!words || !Array.isArray(words) || words.length === 0) {
        return res.status(400).json({ error: 'Bad Request: Word list is empty or invalid.' });
      }

      const userDocRef = db.collection('users').doc(userId);
      const userDoc = await userDocRef.get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: 'User not found.' });
      }
      const userData = userDoc.data();
      const yearMonth = getCurrentMonthKey();
      const storyDocRef = userDocRef.collection('generatedStories').doc(yearMonth);

      //------------------------------------------------------------------------
      // 月次ドキュメントをトランザクションで予約する。
      // 同時に2回押されても、2つ目は 409 で弾かれるので二重生成にならない。
      //------------------------------------------------------------------------
      try {
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(storyDocRef);
          if (snapshot.exists) {
            const existing = snapshot.data();
            if (existing.status === 'complete' || existing.status === undefined) {
              // status を持たない旧スキーマの文書も「生成済み」として扱う
              const error = new Error('already-generated');
              error.code = 'already-generated';
              error.payload = existing;
              throw error;
            }
            if (existing.status === 'generating') {
              const startedAt = existing.startedAt?.toMillis?.() ?? 0;
              if (Date.now() - startedAt < GENERATION_TIMEOUT_MS) {
                const error = new Error('in-progress');
                error.code = 'in-progress';
                throw error;
              }
              // 前回の生成が落ちたまま残っている場合は引き継ぐ
            }
            // failed / 期限切れの generating は上書きして再挑戦できる
          }
          transaction.set(storyDocRef, {
            status: 'generating',
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        });
      } catch (reservationError) {
        if (reservationError.code === 'already-generated') {
          return res.status(429).json({
            error: 'A story for this month has already been generated.',
            ...reservationError.payload,
          });
        }
        if (reservationError.code === 'in-progress') {
          return res.status(409).json({ error: 'ストーリーを生成中です。しばらく待ってからもう一度開いてください。' });
        }
        throw reservationError;
      }

      try {
        const userLevel = userData.level || 3;
        const requestedWords = words
          .map((word) => (typeof word === 'string' ? { word } : word))
          .filter((word) => word && typeof word.word === 'string' && word.word.trim() !== '');

        if (requestedWords.length === 0) {
          throw new HttpsError('invalid-argument', '有効な単語がありません。');
        }

        //----------------------------------------------------------------------
        // 1回目。使えなかった単語があれば、同じ実行の中で2回目を作る。
        // クライアントから2回呼ぶと月次制限に引っかかって必ず429になっていた。
        //----------------------------------------------------------------------
        const first = await generateStory(requestedWords, userLevel);
        const sentences = [{ english: first.story, japanese: await translateToJapanese(first.story) }];

        let unusedWords = first.unusedWords;
        if (unusedWords.length > 0) {
          const retryWords = requestedWords.filter((word) => unusedWords.includes(word.word));
          if (retryWords.length > 0) {
            const second = await generateStory(retryWords, userLevel);
            sentences.push({ english: second.story, japanese: await translateToJapanese(second.story) });
            unusedWords = second.unusedWords;
          }
        }

        const unusedSet = new Set(unusedWords);
        const usedWordIds = requestedWords.filter((w) => !unusedSet.has(w.word)).map((w) => w.id).filter(Boolean);
        const unusedWordIds = requestedWords.filter((w) => unusedSet.has(w.word)).map((w) => w.id).filter(Boolean);

        const storyDataToSave = {
          status: 'complete',
          title: '今月の長文',
          sentences,
          words: requestedWords,
          usedWords: requestedWords.filter((w) => !unusedSet.has(w.word)).map((w) => w.word),
          unusedWords,
          usedWordIds,
          unusedWordIds,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          failureReason: admin.firestore.FieldValue.delete(),
        };
        await storyDocRef.set(storyDataToSave, { merge: true });

        return res.status(200).json({ ...storyDataToSave, createdAt: new Date().toISOString(), failureReason: null });
      } catch (error) {
        logger.error('Gemini story generation failed with error:', error);
        // 失敗を残しておく。理由と時刻が分かれば再試行の判断ができる。
        await storyDocRef.set({
          status: 'failed',
          failureReason: error.message || 'unknown',
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch((writeError) => {
          logger.error('Failed to record story failure:', writeError);
        });

        const message = error instanceof HttpsError
          ? error.message
          : 'ストーリーを生成できませんでした。しばらくしてからもう一度お試しください。';
        return res.status(500).json({ error: message, status: 'failed' });
      }
    });
  }
);