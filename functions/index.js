// Firebase SDK
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require('firebase-functions/params');
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

/**
 * 使う Gemini。
 *
 * gemini-2.0-flash-001 は提供が終わっていて 404 を返す（2026-08-13 に確認）。
 * ストーリー生成が黙って失敗していたのはこれが原因。モデル名を1か所にまとめ、
 * 次に切り替わったときここだけ直せばよいようにする。
 *
 * 生きているかの確かめ方:
 *   curl -s -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" \
 *     -H 'Content-Type: application/json' -d '{"contents":[{"role":"user","parts":[{"text":"ok"}]}]}' \
 *     https://us-central1-aiplatform.googleapis.com/v1/projects/$GCLOUD_PROJECT/locations/us-central1/publishers/google/models/<model>:generateContent
 */
const GEMINI_MODEL = 'gemini-2.5-flash';
const { transcribe, missingWords, uniqueWordCount, MAX_AUDIO_BYTES } = require('./lib/transcription');
// つくばホームの ID トークン → つくたんの入場券。**アカウントを2つ作らない**
const {
  tsukubaAuth,
  assertTsukubaClaims,
  ensureStudentProfile,
} = require('./lib/tsukubaToken');
const { judgeAnswer } = require('./lib/answerJudge');
// つくばホームの管理者に、生徒の苦手な単語を渡すときの決まり
const {
  assertStaffClaims,
  weakWordsForQuiz,
  StaffAccessError,
} = require('./lib/staffMaterials');
// 生徒詳細の「定着度」（教材ごと）
const { masteryByTextbook, easiestEiken } = require('./lib/textbookMastery');
// 管理者が出す教科書の小テスト
const {
  QuizInputError,
  validateCreate: validateQuizCreate,
  pickQuizWords,
  pickWeakWords,
  pickSourceWords,
  pickWeakInSource,
  dataFileOf: quizDataFileOf,
  titleOf: quizTitleOf,
  summarize: summarizeQuiz,
  missedWordsOf,
  validateRetest: validateQuizRetest,
  validateMessage: validateStaffMessage,
} = require('./lib/quizAssignments');

//==============================================================================
// ユーザー一括インポート機能 (シンプル版)
//==============================================================================
const importUsersApp = express();
importUsersApp.use(cors({ origin: true }));
importUsersApp.use(express.json({ limit: '10mb' }));

const manageStudentsApp = express();
manageStudentsApp.use(cors({ origin: true }));
manageStudentsApp.use(express.json({ limit: '1mb' }));

// 録音は 16kHz 16bit モノラルで、3分だと約 3.8MB。base64 で約 5.1MB になる。
// 既定の 100kb では入らないので、余裕を見て 12mb にする。
const transcribeSpeakingApp = express();
transcribeSpeakingApp.use(cors({ origin: true }));
transcribeSpeakingApp.use(express.json({ limit: '12mb' }));

/**
 * HttpsError のコードを HTTP のステータスへ写す。
 *
 * 以前は「HttpsError なら一律 400（importUsers は 403）」にしていたため、
 * 認証ヘッダが無いだけの要求も 400 で返っていた。呼び出し側が
 * 「入力が悪い」のか「ログインし直せばよい」のか区別できない。
 */
const httpStatusFor = (error) => {
  if (!(error instanceof HttpsError)) return 500;
  switch (error.code) {
    case 'unauthenticated':
      return 401;
    case 'permission-denied':
      return 403;
    case 'not-found':
      return 404;
    case 'already-exists':
      return 409;
    case 'invalid-argument':
    case 'failed-precondition':
      return 400;
    default:
      return 500;
  }
};

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
    const statusCode = httpStatusFor(error);
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
    const message = error instanceof HttpsError ? error.message : (error.message || 'Internal error');
    logger.error('Create student failed:', error);
    return res.status(httpStatusFor(error)).json({ error: message });
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
    const message = error instanceof HttpsError ? error.message : (error.message || 'Internal error');
    logger.error('Delete student failed:', error);
    return res.status(httpStatusFor(error)).json({ error: message });
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
    model: GEMINI_MODEL,
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
//==============================================================================
// 英検二次試験の発音・内容の採点
//==============================================================================

/** その回で見るもの。音読は読むべき英文が決まっている。 */
const MODES = new Set(['scripted', 'unscripted']);

/** Vertex AI の Gemini を1回叩く。generateStory と同じ設定。 */
const generateJson = async (prompt) => {
  const vertexAi = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
  const model = vertexAi.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json' },
  });
  const response = await model.generateContent(prompt);
  return response.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

/** Speech-to-Text の窓口。呼ばれたときに作る（起動を重くしない）。 */
let speechClient = null;
const recognize = (request) => {
  if (!speechClient) {
    // eslint-disable-next-line global-require
    const { SpeechClient } = require('@google-cloud/speech');
    speechClient = new SpeechClient();
  }
  return speechClient.recognize(request);
};

/**
 * 録音した英語を文字にする。
 *
 * 音読（scripted）は読むべき英文を認識のヒントに渡し、読み飛ばした語を返す。
 * 質問への答え（unscripted）は文字にしたうえで、Gemini に
 * 「質問に答えているか」を見せる。
 *
 * 発音の点は出さない。それには別サービスが要り、いまは対象外。
 */
/**
 * 生徒本人であることだけ確かめる。uid はトークンから取り、本文の値は信じない。
 * 通っていなければ 401 を返して false。呼び出し側はそこで抜ける。
 */
const verifyStudent = async (req, res) => {
  const idToken = req.get('Authorization')?.split('Bearer ')[1];
  if (!idToken) {
    res.status(401).json({ error: 'ログインし直してください。' });
    return false;
  }
  try {
    await admin.auth().verifyIdToken(idToken);
    return true;
  } catch (error) {
    logger.error('transcribeSpeaking: トークンを検証できませんでした', error);
    res.status(401).json({ error: 'ログインし直してください。' });
    return false;
  }
};

transcribeSpeakingApp.post('/', async (req, res) => {
  if (!(await verifyStudent(req, res))) return undefined;

  const { audio, mode, referenceText, question, modelAnswer, grade } = req.body || {};
  if (typeof audio !== 'string' || audio.length === 0) {
    return res.status(400).json({ error: '音声が送られていません。' });
  }
  if (!MODES.has(mode)) {
    return res.status(400).json({ error: 'mode が不正です。' });
  }

  const wav = Buffer.from(audio, 'base64');
  if (wav.length > MAX_AUDIO_BYTES) {
    return res.status(413).json({ error: '録音が長すぎます。3分以内にしてください。' });
  }

  try {
    const { transcript } = await transcribe(
      wav,
      // 音読は読む英文が分かっている。渡すと認識が寄る。
      mode === 'scripted' && referenceText ? { phrases: referenceText.split(/\s+/) } : {},
      recognize
    );

    // 読み飛ばしは音読のときだけ見る。発音の良し悪しは測らない。
    const missing = mode === 'scripted' && referenceText
      ? missingWords(referenceText, transcript)
      : [];

    // 中身の判定は質問に答える回だけ。音読には要らない。
    let content = null;
    if (mode === 'unscripted' && question) {
      content = await judgeAnswer(
        { grade, question, modelAnswer, transcript },
        generateJson
      ).catch((judgeError) => {
        // 文字起こしは取れているので、ここで全部を落とさない。
        logger.warn('transcribeSpeaking: 内容の判定に失敗しました', judgeError);
        return null;
      });
    }

    return res.status(200).json({ transcript, missing, content });
  } catch (error) {
    logger.error('transcribeSpeaking: 文字起こしに失敗しました', error);
    const message = /音声が空|長すぎ/.test(error.message)
      ? error.message
      : '文字起こしできませんでした。もう一度お試しください。';
    return res.status(502).json({ error: message });
  }
});

/**
 * 文字にしたあとの答えを見る。
 *
 * 音声認識は日本語なまりの英語をよく取り違える。生徒が画面で直せるように
 * したので、判定は「直したあとの文」に対してかけないと意味がない。だから
 * 音声を受けずにテキストだけで判定する口を分けてある。
 *
 * 読み飛ばした語もここで数え直す。分母（total）も返すのは、同じ正規化を
 * クライアントに書き写すと、ずれたときに気づけないため。
 */
transcribeSpeakingApp.post('/review', async (req, res) => {
  if (!(await verifyStudent(req, res))) return undefined;

  const { mode, referenceText, question, modelAnswer, grade, transcript } = req.body || {};
  if (!MODES.has(mode)) {
    return res.status(400).json({ error: 'mode が不正です。' });
  }
  if (typeof transcript !== 'string') {
    return res.status(400).json({ error: '文字起こしが送られていません。' });
  }

  const scripted = mode === 'scripted' && referenceText;
  const missing = scripted ? missingWords(referenceText, transcript) : [];
  const total = scripted ? uniqueWordCount(referenceText) : 0;

  let content = null;
  if (mode === 'unscripted' && question) {
    content = await judgeAnswer(
      { grade, question, modelAnswer, transcript },
      generateJson
    ).catch((judgeError) => {
      // 1問の判定が取れなくても、他の問題の結果は見せたい。ここで落とさない。
      logger.warn('transcribeSpeaking: 内容の判定に失敗しました', judgeError);
      return null;
    });
  }

  return res.status(200).json({ missing, total, content });
});

exports.transcribeSpeaking = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '512MiB',
    serviceAccount: "115384710973-compute@developer.gserviceaccount.com",
  },
  transcribeSpeakingApp
);

//==============================================================================
// 英検ライティングの採点（2026-09-26）
//==============================================================================

/**
 * Jev（TypeSafe）の鍵。**このコードベースで初めての secret**。
 * 入れ方：firebase functions:secrets:set JEV_API_KEY --project tsukutan-58b3f
 */
/**
 * **英検ライティングの栓**（2026-09-27 に一度引っ込め、同日に鍵が届いて戻した）。
 * 鍵の無い defineSecret を関数に付けたままだと、**どの関数を出しても鍵の入力待ちで止まる**。
 * 止めるときは false にする（画面側は src/config/features.js）
 */
const WRITING_ENABLED = true;
const JEV_API_KEY = WRITING_ENABLED ? defineSecret('JEV_API_KEY') : null;
const { FORMATS: WRITING_FORMATS, scoreWriting } = require('./lib/writingScore');
const { getTokyoDateKey } = require('./lib/dateKeys');

/** 1人1日の採点回数の上限。使いすぎ（連打・自動化）で請求が膨らまないように */
const WRITING_DAILY_LIMIT = 30;
const MAX_ANSWER_CHARS = 3000;

const scoreWritingApp = express();
scoreWritingApp.use(cors({ origin: true }));
scoreWritingApp.use(express.json({ limit: '64kb' }));

/** ID トークンを確かめて uid を返す。だめなら 401 を返して null */
const verifiedUid = async (req, res) => {
  const idToken = req.get('Authorization')?.split('Bearer ')[1];
  if (!idToken) {
    res.status(401).json({ error: 'ログインし直してください。' });
    return null;
  }
  try {
    return (await admin.auth().verifyIdToken(idToken)).uid;
  } catch (error) {
    logger.error('scoreWriting: トークンを検証できませんでした', error);
    res.status(401).json({ error: 'ログインし直してください。' });
    return null;
  }
};

/** 問題の文面は画面から来る。長さと型だけ確かめて、採点に要る欄だけ残す */
const cleanPrompt = (prompt = {}) => {
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  return {
    id: str(prompt.id, 40),
    question: str(prompt.question, 600),
    points: Array.isArray(prompt.points) ? prompt.points.slice(0, 6).map((p) => str(p, 60)).filter(Boolean) : undefined,
    body: str(prompt.body, 2000),
    title: str(prompt.title, 200),
    passage: Array.isArray(prompt.passage) ? prompt.passage.slice(0, 6).map((p) => str(p, 2000)).filter(Boolean) : undefined,
  };
};

scoreWritingApp.post('/', async (req, res) => {
  const uid = await verifiedUid(req, res);
  if (!uid) return undefined;

  const grade = String(req.body?.grade || '');
  const task = String(req.body?.task || '');
  const answer = typeof req.body?.answer === 'string' ? req.body.answer.slice(0, MAX_ANSWER_CHARS) : '';
  if (!WRITING_FORMATS[grade]?.[task]) return res.status(400).json({ error: '問題の種類が分かりません。' });
  if (!answer.trim()) return res.status(400).json({ error: '英文を書いてから提出してください。' });
  const prompt = cleanPrompt(req.body?.prompt);

  // 回数を先に数える（採点に失敗したら戻す）
  const usageRef = db.doc(`users/${uid}/writingUsage/${getTokyoDateKey(new Date())}`);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const count = snap.exists ? snap.data().count || 0 : 0;
      if (count >= WRITING_DAILY_LIMIT) {
        const error = new Error('limit');
        error.code = 'limit';
        throw error;
      }
      tx.set(usageRef, { count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
  } catch (error) {
    if (error.code === 'limit') {
      return res.status(429).json({ error: `今日の採点は${WRITING_DAILY_LIMIT}回までです。明日また出してください。` });
    }
    logger.error('scoreWriting: 回数を数えられませんでした', error);
    return res.status(500).json({ error: '採点できませんでした。もう一度出してください。' });
  }

  let result;
  try {
    result = await scoreWriting({ grade, task, prompt, answer }, { apiKey: JEV_API_KEY.value() });
  } catch (error) {
    logger.error('scoreWriting: 採点に失敗しました', error);
    await usageRef.set({ count: admin.firestore.FieldValue.increment(-1) }, { merge: true }).catch(() => {});
    return res.status(502).json({ error: '採点できませんでした。少し待ってからもう一度出してください。' });
  }

  // 結果はサーバで残す（画面から点を書き換えられないように。firestore.rules でも本人は書けない）
  const attempt = {
    grade,
    task,
    promptId: prompt.id || null,
    answer,
    scores: result.scores,
    total: result.total,
    max: result.max,
    flags: result.flags,
    words: result.words,
    model: result.model,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(`users/${uid}/writingAttempts`).add(attempt);
  return res.status(200).json({ id: ref.id, ...attempt, createdAt: new Date().toISOString(), contractions: result.contractions });
});

if (WRITING_ENABLED) {
  exports.scoreWriting = onRequest(
    {
      region: 'us-central1',
      timeoutSeconds: 60,
      memory: '256MiB',
      secrets: [JEV_API_KEY],
      serviceAccount: "115384710973-compute@developer.gserviceaccount.com",
    },
    scoreWritingApp
  );
}

//==============================================================================
// つくばホームからの入場
//==============================================================================

/**
 * 生徒の入場券を発行する。
 *
 * 1. つくばホームの ID トークンを受け取る
 * 2. **つくばホームのプロジェクトの公開鍵で**検証する
 * 3. role を検査する（「認証できた」と「入ってよい」は別）
 * 4. つくたんの Custom Token を発行する。**uid はつくばホームのものをそのまま使う**
 * 5. 初回ならプロフィールを作る（無いと目標設定が `updateDoc` で落ちる）
 *
 * **トークンそのものはログに出さない。** 出すと有効期限まで誰でも使える。
 */
exports.exchangeTsukubaToken = onCall({ region: 'us-central1' }, async (request) => {
  const idToken = (request.data || {}).idToken;
  if (typeof idToken !== 'string' || idToken === '') {
    throw new HttpsError('invalid-argument', 'idToken が必要です');
  }

  let decoded;
  try {
    /*
      `checkRevoked` は付けない。付けるとつくばホームの Auth をユーザー単位で
      読む必要があり、つくたんの資格情報では読めない。
      （失効はトークンの有効期限＝最長1時間で効く）
    */
    decoded = await tsukubaAuth().verifyIdToken(idToken);
  } catch (e) {
    logger.warn('つくばホームのトークンを検証できなかった', { message: e && e.message });
    throw new HttpsError('unauthenticated', 'つくばホームのトークンを検証できませんでした');
  }

  try {
    assertTsukubaClaims(decoded);
  } catch (e) {
    logger.warn('入場を拒否した', { uid: decoded.uid, message: e && e.message });
    throw new HttpsError('permission-denied', e && e.message);
  }

  const customToken = await admin.auth().createCustomToken(decoded.uid);
  // **await する。** 返したあとの fire-and-forget は取りこぼす
  await ensureStudentProfile(db, decoded);
  return { customToken };
});


//==============================================================================
// つくばホームの管理者に、生徒の苦手な単語を渡す（2026-09-23）
//==============================================================================
/*
 * 生徒を見る場所をつくばホームの管理画面（`/tsukutsuku/`）に一本化した。
 * あちらで「苦手な単語の小テスト」を出すための、**読み取りだけ**の口。
 * 判定の中身（管理者だけ・苦手の決め方）は `lib/staffMaterials.js`。AI長文は渡さない（使わない）。
 *
 * - 呼べるのはつくばホームの画面だけ（CORS）。つくばホームのIDトークンを Bearer で受ける
 * - `checkRevoked` は使えない（つくばホームの Auth を読む権限が無い。`exchangeTsukubaToken` と同じ）
 * - **トークンはログに出さない**
 */
const STAFF_ORIGINS = [
  'https://tsukubamanager-4900b.web.app',
  'https://tsukubamanager-4900b.firebaseapp.com',
  'http://localhost:5173',
];
const staffMaterialsApp = express();
staffMaterialsApp.use(cors({ origin: STAFF_ORIGINS }));
staffMaterialsApp.use(express.json({ limit: '10kb' }));

staffMaterialsApp.post('/', async (req, res) => {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (idToken === '') return res.status(401).json({ error: 'つくばホームのログインが必要です' });

  let decoded;
  try {
    decoded = await tsukubaAuth().verifyIdToken(idToken);
  } catch (e) {
    logger.warn('職員のトークンを検証できなかった', { message: e && e.message });
    return res.status(401).json({ error: 'つくばホームのログインを確かめられませんでした' });
  }

  const uid = req.body && typeof req.body.uid === 'string' ? req.body.uid : '';
  if (uid === '' || uid.includes('/')) return res.status(400).json({ error: '生徒が指定されていません' });

  try {
    assertStaffClaims(decoded);
    const userRef = db.collection('users').doc(uid);
    const [userSnap, wordsSnap] = await Promise.all([userRef.get(), userRef.collection('reviewWords').get()]);
    const toDocs = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    const docs = toDocs(wordsSnap);
    // 定着度は教材ファイルが読めなくても、苦手な単語だけは返す（片方の失敗で両方を消さない）
    let mastery = null;
    try {
      mastery = await masteryOfUser(userSnap, docs);
    } catch (e) {
      logger.warn('定着度の教材を読めなかった', { message: e && e.message });
    }
    return res.status(200).json({
      found: userSnap.exists,
      weakWords: weakWordsForQuiz(docs),
      mastery,
    });
  } catch (e) {
    if (e instanceof StaffAccessError) {
      logger.warn('職員の教材読み取りを拒否した', { staff: decoded.uid, role: decoded.role, uid, message: e.message });
      return res.status(403).json({ error: e.message });
    }
    logger.error('職員の教材読み取りに失敗した', { uid, message: e && e.message });
    return res.status(500).json({ error: '読み込めませんでした' });
  }
});

/*
 * **単語帳の語を職員の管理画面へ渡す**（2026-09-27）。単語帳は公開ファイルから外したので、つくばホームの
 * 管理画面（小テストの範囲・印刷・単語データの一覧）はここから読む。認証は上の staffStudentMaterials と同じ
 */
const staffBookWordsApp = express();
staffBookWordsApp.use(cors({ origin: STAFF_ORIGINS }));
staffBookWordsApp.use(express.json({ limit: '2kb' }));
staffBookWordsApp.post('/', async (req, res) => {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (idToken === '') return res.status(401).json({ error: 'つくばホームのログインが必要です' });
  let decoded;
  try {
    decoded = await tsukubaAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'つくばホームのログインを確かめられませんでした' });
  }
  const file = req.body && typeof req.body.file === 'string' ? req.body.file : '';
  if (!/^words-book-[a-z0-9-]+\.json$/.test(file)) return res.status(400).json({ error: '単語帳の指定が正しくありません' });
  try {
    assertStaffClaims(decoded);
    return res.status(200).json({ words: await loadDataFile(file) });
  } catch (e) {
    if (e instanceof StaffAccessError) return res.status(403).json({ error: e.message });
    logger.error('単語帳を職員へ渡せなかった', { file, message: e && e.message });
    return res.status(500).json({ error: '単語帳を読めませんでした' });
  }
});

exports.staffBookWords = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    serviceAccount: '115384710973-compute@developer.gserviceaccount.com',
  },
  staffBookWordsApp
);

/*
 * **単語がどの教材に入っているか**（2026-09-27。管理画面の「単語データ」）。同じ語は教材をまたいで同じ id を持つ
 * （単語帳・教科書を作るとき単語データと照合している）ので id で引く。1語が複数の教材に入ることもある。
 * 教材の並びと題名は定着度と同じ（MASTERY_TEXTBOOKS）。**全部の教材を読むので、組んだ索引は覚えておく**
 * （関数の入れ物が生きているあいだ。単語帳を入れ直したら、次に立ち上がった入れ物から新しくなる）。
 */
let textbookIndexPromise = null;
function textbookIndex() {
  if (!textbookIndexPromise) {
    textbookIndexPromise = loadMasteryTextbooks().then((list) => {
      const byId = new Map();
      list.forEach((t, i) => {
        for (const w of t.words || []) {
          if (!w || !w.id) continue;
          const at = byId.get(w.id) || [];
          if (!at.includes(i)) at.push(i);
          byId.set(w.id, at);
        }
      });
      return { titles: list.map((t) => ({ id: t.id, title: t.title })), byId };
    }).catch((e) => {
      textbookIndexPromise = null; // 失敗は覚えない
      throw e;
    });
  }
  return textbookIndexPromise;
}

const staffWordTextbooksApp = express();
staffWordTextbooksApp.use(cors({ origin: STAFF_ORIGINS }));
staffWordTextbooksApp.use(express.json({ limit: '2kb' }));
staffWordTextbooksApp.post('/', async (req, res) => {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (idToken === '') return res.status(401).json({ error: 'つくばホームのログインが必要です' });
  let decoded;
  try {
    decoded = await tsukubaAuth().verifyIdToken(idToken);
  } catch (e) {
    return res.status(401).json({ error: 'つくばホームのログインを確かめられませんでした' });
  }
  const file = req.body && typeof req.body.file === 'string' ? req.body.file : '';
  if (!/^words-[a-z0-9-]+\.json$/.test(file)) return res.status(400).json({ error: '単語データの指定が正しくありません' });
  try {
    assertStaffClaims(decoded);
    const [{ titles, byId }, words] = await Promise.all([textbookIndex(), loadDataFile(file)]);
    // 返すのはこのファイルの語のぶんだけ（{ 語のid: [教材の番号…] }。番号は titles の並び）
    const byWord = {};
    for (const w of words || []) {
      const at = w && w.id ? byId.get(w.id) : null;
      if (at && at.length) byWord[w.id] = at;
    }
    return res.status(200).json({ titles, byWord });
  } catch (e) {
    if (e instanceof StaffAccessError) return res.status(403).json({ error: e.message });
    logger.error('単語の収録教材を渡せなかった', { file, message: e && e.message });
    return res.status(500).json({ error: '収録教材を読めませんでした' });
  }
});

exports.staffWordTextbooks = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
    maxInstances: 10,
    serviceAccount: '115384710973-compute@developer.gserviceaccount.com',
  },
  staffWordTextbooksApp
);

exports.staffStudentMaterials = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    serviceAccount: '115384710973-compute@developer.gserviceaccount.com',
  },
  staffMaterialsApp
);


//==============================================================================
// 管理者が出す「教科書の小テスト」（2026-09-24）
//==============================================================================
/*
 * つくばホームの管理画面（`/tsukutsuku/`）から、学年・ページを指定して生徒に小テストを出す口。
 * 判定の中身は `lib/quizAssignments.js`。入口の作りは `staffStudentMaterials` と同じ
 * （CORS はつくばホームだけ・つくばホームのIDトークン・管理者だけ・トークンはログに出さない）。
 *
 *   { action: 'create', grade, pageFrom, pageTo, count, direction, targetUids }  → { id }
 *   { action: 'create', source: 'weak' | 'book' (bookId, noFrom, noTo) | 'eiken' (eiken), count, direction, targetUids }
 *   教材（textbook / book / eiken）に weakOnly: true を付けると、範囲の中でその生徒が間違えた単語だけ（対象は1人）
 *   { action: 'list', uid? }  → { assignments: [...集計つき] }（uid を渡すとその生徒に出したものだけ）
 *   { action: 'close', id }   → { ok }（取り下げ。生徒のホームのカードから消える）
 *
 * 生徒は `quiz_assignments` を自分が対象のものだけ読める（firestore.rules）。結果は本人が
 * `users/{uid}/quizResults/{id}` に書く。
 */
const DATA_BASE_URL = 'https://tsukutan-58b3f.web.app/data/';
const dataFileCache = new Map();
/** 単語のファイル。**配信しているものを読む**（関数に写しを持たない）。10分だけ覚えておく */
/**
 * 市販の単語帳（words-book-*.json）は公開ファイルに無い（2026-09-27）。Firestore の licensedWordBooks から組み立てる
 * （scripts/upload-licensed-words.js が400語ずつのチャンクで入れている）。欠けていたら投げる
 */
const loadLicensedBook = async (name) => {
  const deckId = name.replace(/^words-book-|\.json$/g, '');
  const ref = db.collection('licensedWordBooks').doc(deckId);
  const [head, chunks] = await Promise.all([ref.get(), ref.collection('chunks').get()]);
  if (!head.exists) throw new Error(`${name} がありません`);
  // 語は JSON の文字列（json）で持つ（ブラウザの SDK が配列のままだと遅い。scripts/upload-licensed-words.js）。古い形も読む
  const words = chunks.docs.slice().sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((d) => { const c = d.data(); return typeof c.json === 'string' ? JSON.parse(c.json) : (c.words || []); });
  if (words.length !== Number(head.data().count)) throw new Error(`${name} が欠けています`);
  return words;
};

const loadDataFile = async (name) => {
  const hit = dataFileCache.get(name);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data;
  if (/^words-book-.+\.json$/.test(name)) {
    const words = await loadLicensedBook(name);
    dataFileCache.set(name, { at: Date.now(), data: words });
    return words;
  }
  const response = await fetch(`${DATA_BASE_URL}${name}`);
  if (!response.ok) throw new Error(`${name} を読めませんでした (${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error(`${name} が空です`);
  dataFileCache.set(name, { at: Date.now(), data });
  return data;
};
const loadTextbookCards = () => loadDataFile('words-textbook-sunshine.json');

/**
 * 定着度を出す教材（生徒の「えらぶ」と同じ並び）。題名は画面に出すもの。
 * 単語帳の題名の正本はつくつくの src/config/books.js（関数からは読めないので、足したらここにも足す）
 */
const MASTERY_TEXTBOOKS = [
  { id: 'sunshine-1', title: 'Sunshine 1年（学校の教科書）', file: 'words-textbook-sunshine.json', grade: 1 },
  { id: 'sunshine-2', title: 'Sunshine 2年（学校の教科書）', file: 'words-textbook-sunshine.json', grade: 2 },
  { id: 'sunshine-3', title: 'Sunshine 3年（学校の教科書）', file: 'words-textbook-sunshine.json', grade: 3 },
  { id: 'osaka-koukou-nyuushi', title: '中学英語（大阪府公立入試）', file: 'words-osaka.json' },
  { id: 'highschool-english', title: '高校英語', file: 'words-highschool.json' },
  { id: 'book-systan5', title: 'システム英単語', file: 'words-book-systan5.json' },
  { id: 'book-target1900', title: '英単語ターゲット1900', file: 'words-book-target1900.json' },
  { id: 'book-leap', title: '必携英単語LEAP', file: 'words-book-leap.json' },
  { id: 'book-idiom-target1000', title: '英熟語ターゲット1000', file: 'words-book-idiom-target1000.json' },
  // **英検の級はでる順パス単の収録語で数える**（2026-09-27。5級〜準1級すべて。id は変えない＝管理画面の並びはそのまま）
  { id: 'eiken-5', title: '英検5級 でる順パス単［5訂版］', file: 'words-book-passtan5.json' },
  { id: 'eiken-4', title: '英検4級 でる順パス単［5訂版］', file: 'words-book-passtan4.json' },
  { id: 'eiken-3', title: '英検3級 でる順パス単［5訂版］', file: 'words-book-passtan3.json' },
  { id: 'eiken-pre2', title: '英検準2級 でる順パス単［5訂版］', file: 'words-book-passtanp2.json' },
  { id: 'eiken-2', title: '英検2級 でる順パス単［5訂版］', file: 'words-book-passtan2.json' },
  { id: 'eiken-pre1', title: '英検準1級 でる順パス単［5訂版］', file: 'words-book-passtanp1.json' },
];
/**
 * 生徒1人の教材ごとの定着度。**職員の画面（staffStudentMaterials）と生徒の画面（myTextbookMastery）で同じものを使う**
 * （数え方を2か所に書くと、先生と生徒で数字が食い違う）。
 */
async function masteryOfUser(userSnap, reviewDocs) {
  const master = await loadDataFile('words-master.json');
  const levelBySpelling = new Map();
  for (const w of master) {
    const k = String(w.word || '').trim().toLowerCase();
    // 同じ綴りが複数あれば、いちばんやさしい level（知っている見込みを大きく見すぎない方へは倒さない）
    if (Number.isFinite(w.level) && (!levelBySpelling.has(k) || w.level < levelBySpelling.get(k))) levelBySpelling.set(k, w.level);
  }
  const ability = Number(userSnap.exists && userSnap.data().progress && userSnap.data().progress.assessedAbility);
  return masteryByTextbook(reviewDocs, await loadMasteryTextbooks(), { ability, levelBySpelling });
}

/**
 * 生徒本人の教材ごとの定着度（きろくの「教材ごとの定着度」。2026-09-27）。
 * **引数を取らない。** 誰のぶんかはログイン（request.auth.uid）だけで決める（他人のぶんは引けない）。
 * 単語帳は塾の生徒だけの置き場にあるので、生徒の記録が無い（退塾・未登録）なら返さない。
 */
exports.myTextbookMastery = onCall({ region: 'us-central1' }, async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'ログインが必要です');
  const userRef = db.collection('users').doc(uid);
  const [userSnap, wordsSnap] = await Promise.all([userRef.get(), userRef.collection('reviewWords').get()]);
  if (!userSnap.exists || userSnap.data().disabledAt) throw new HttpsError('permission-denied', '塾の生徒だけが見られます');
  const docs = wordsSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  return { mastery: await masteryOfUser(userSnap, docs) };
});

const loadMasteryTextbooks = async () => Promise.all(MASTERY_TEXTBOOKS.map(async ({ id, title, file, grade, eiken }) => {
  const words = await loadDataFile(file);
  if (eiken) return { id, title, words: words.filter((w) => easiestEiken(w) === eiken) };
  return { id, title, words: grade ? words.filter((w) => w.grade === grade) : words };
}));

const quizAssignmentsApp = express();
quizAssignmentsApp.use(cors({ origin: STAFF_ORIGINS }));
quizAssignmentsApp.use(express.json({ limit: '64kb' }));

const toMillis = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : null);

quizAssignmentsApp.post('/', async (req, res) => {
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (idToken === '') return res.status(401).json({ error: 'つくばホームのログインが必要です' });

  let decoded;
  try {
    decoded = await tsukubaAuth().verifyIdToken(idToken);
  } catch (e) {
    logger.warn('職員のトークンを検証できなかった', { message: e && e.message });
    return res.status(401).json({ error: 'つくばホームのログインを確かめられませんでした' });
  }

  const body = req.body || {};
  try {
    assertStaffClaims(decoded);

    if (body.action === 'create') {
      const input = validateQuizCreate(body);
      let words;
      // その生徒の苦手な単語（staffStudentMaterials と同じ決め方）
      const weakOf = async (uid) => {
        const snap = await db.collection('users').doc(uid).collection('reviewWords').get();
        return weakWordsForQuiz(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
      };
      if (input.source === 'weak') {
        words = pickWeakWords(await weakOf(input.targetUids[0]), input.count);
      } else if (input.weakOnly) {
        // 教材の範囲の中で、その生徒が間違えた単語だけ（2026-09-26。規則は lib/quizAssignments.js）
        const [sourceWords, weakWords] = await Promise.all([loadDataFile(quizDataFileOf(input)), weakOf(input.targetUids[0])]);
        words = pickWeakInSource(sourceWords, weakWords, input);
      } else if (input.source === 'book' || input.source === 'eiken') {
        // 単語帳（見出し番号の範囲）・英検（級）。規則は lib/quizAssignments.js
        words = pickSourceWords(await loadDataFile(quizDataFileOf(input)), input);
      } else {
        words = pickQuizWords(await loadTextbookCards(), input);
      }
      const ref = db.collection('quiz_assignments').doc();
      await ref.set({
        textbook: input.source === 'textbook' ? 'sunshine' : null,
        title: quizTitleOf(input),
        ...input,
        count: words.length,
        words,
        active: true,
        createdBy: decoded.uid,
        createdByName: String(decoded.name || ''),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // 画面が同じ語で紙の小テストも刷れるように、選んだ語も返す
      return res.status(200).json({ id: ref.id, count: words.length, words });
    }

    if (body.action === 'list') {
      const uid = typeof body.uid === 'string' && body.uid !== '' && !body.uid.includes('/') ? body.uid : '';
      let query = db.collection('quiz_assignments');
      if (uid) query = query.where('targetUids', 'array-contains', uid);
      const snap = await query.orderBy('createdAt', 'desc').limit(30).get();
      const assignments = await Promise.all(snap.docs.map(async (d) => {
        const a = d.data();
        const targets = uid ? [uid] : (a.targetUids || []);
        const refs = targets.map((t) => db.collection('users').doc(t).collection('quizResults').doc(d.id));
        const results = refs.length ? await db.getAll(...refs) : [];
        const byUid = new Map(results.map((r, i) => [targets[i], r.exists ? r.data() : null]));
        return {
          id: d.id,
          title: a.title,
          source: a.source || 'textbook',
          grade: a.grade ?? null,
          pageFrom: a.pageFrom,
          pageTo: a.pageTo,
          direction: a.direction,
          count: a.count,
          active: a.active !== false,
          createdAt: toMillis(a.createdAt),
          // 合格点（%）と、追試なら元の小テスト（2026-09-27）
          passRate: Number.isInteger(a.passRate) ? a.passRate : null,
          retestOf: a.retestOf || null,
          ...summarizeQuiz({ targetUids: targets }, byUid),
          // 1人を開いているときだけ、提出した中身（間違えた語と提出した時刻）も返す（2026-09-27）
          ...(uid ? {
            finishedAt: toMillis(byUid.get(uid) && byUid.get(uid).finishedAt),
            missed: missedWordsOf(a.words, byUid.get(uid)),
          } : {}),
        };
      }));
      /*
        生徒が自分でしたテスト（教材を選んで「テスト」。users/{uid}/selfTests）。先生が出したものとは別に並べる。
        1人を開いているときだけ
      */
      let selfTests;
      if (uid) {
        const selfSnap = await db.collection('users').doc(uid).collection('selfTests').orderBy('finishedAt', 'desc').limit(30).get();
        selfTests = selfSnap.docs.map((d) => {
          const t = d.data();
          return {
            id: d.id,
            title: String(t.title || ''),
            score: Number(t.score) || 0,
            total: Number(t.total) || 0,
            finishedAt: toMillis(t.finishedAt),
            missed: Array.isArray(t.missed) ? t.missed.map((w) => ({ word: String(w.word || ''), meaning: String(w.meaning || '') })) : [],
          };
        });
      }
      return res.status(200).json({ assignments, ...(selfTests ? { selfTests } : {}) });
    }

    /*
      **追試**（2026-09-27）。元の小テストと**同じ語**を並びだけ混ぜて、選んだ生徒（元の対象の中から）に出す。
      範囲から選び直すと、追試なのに別の問題になる
    */
    if (body.action === 'retest') {
      const input = validateQuizRetest(body);
      const orig = await db.collection('quiz_assignments').doc(input.id).get();
      if (!orig.exists) return res.status(404).json({ error: 'その小テストはありません' });
      const o = orig.data();
      const allowed = new Set(o.targetUids || []);
      if (input.targetUids.some((u) => !allowed.has(u))) return res.status(400).json({ error: '元の小テストの対象ではない生徒が含まれています' });
      const words = (o.words || []).slice();
      for (let i = words.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [words[i], words[j]] = [words[j], words[i]];
      }
      // 元の範囲の欄だけ写す（**undefined を入れない**。Firestore が文書ごと拒む）
      const keep = ['textbook', 'source', 'grade', 'pageFrom', 'pageTo', 'bookId', 'noFrom', 'noTo', 'eiken', 'direction', 'passRate'];
      const copied = Object.fromEntries(keep.filter((k) => o[k] !== undefined && o[k] !== null).map((k) => [k, o[k]]));
      const ref = db.collection('quiz_assignments').doc();
      await ref.set({
        ...copied,
        title: `追試 ${String(o.title || '').replace(/^追試 /, '')}`,
        count: words.length,
        words,
        targetUids: input.targetUids,
        retestOf: input.id,
        active: true,
        createdBy: decoded.uid,
        createdByName: String(decoded.name || ''),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ id: ref.id, count: words.length, words });
    }

    /*
      **生徒のホームに出すメッセージ**（2026-09-27）。一斉テストの結果から「合格点に届かなかった生徒」などへ。
      staff_messages（読めるのは対象の生徒だけ → firestore.rules）。生徒が「読んだ」を押すと消える
    */
    if (body.action === 'message') {
      const input = validateStaffMessage(body);
      const relatedTitle = typeof body.relatedTitle === 'string' ? body.relatedTitle.slice(0, 100) : '';
      const ref = db.collection('staff_messages').doc();
      await ref.set({
        text: input.text,
        targetUids: input.targetUids,
        ...(relatedTitle ? { relatedTitle } : {}),
        active: true,
        createdBy: decoded.uid,
        createdByName: String(decoded.name || ''),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ id: ref.id, count: input.targetUids.length });
    }

    if (body.action === 'close') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (id === '' || id.includes('/')) return res.status(400).json({ error: '小テストが指定されていません' });
      const ref = db.collection('quiz_assignments').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'その小テストはありません' });
      await ref.update({ active: false, closedAt: admin.firestore.FieldValue.serverTimestamp(), closedBy: decoded.uid });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: '操作が指定されていません' });
  } catch (e) {
    if (e instanceof StaffAccessError) {
      logger.warn('小テストの操作を拒否した', { staff: decoded.uid, role: decoded.role, message: e.message });
      return res.status(403).json({ error: e.message });
    }
    if (e instanceof QuizInputError) return res.status(400).json({ error: e.message });
    logger.error('小テストの操作に失敗した', { action: body.action, message: e && e.message });
    return res.status(500).json({ error: 'うまくいきませんでした。もう一度お試しください' });
  }
});

exports.staffQuizAssignments = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    serviceAccount: '115384710973-compute@developer.gserviceaccount.com',
  },
  quizAssignmentsApp
);
