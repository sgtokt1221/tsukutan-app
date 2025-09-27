// Firebase SDK
const { onRequest } = require("firebase-functions/v2/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// 外部ライブラリ
const express = require('express');
const cors = require('cors');
const iconv = require('iconv-lite');
const Papa = require('papaparse');
const fetch = require('node-fetch');
const { VertexAI } = require('@google-cloud/vertexai');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1;

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

importUsersApp.post('/', async (req, res) => {
  try {
    await verifyAdmin(req);

    const { fileName, fileData } = req.body || {};
    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided.' });
    }

    // リセット処理: 既存ユーザーを削除
    const existingUsersSnapshot = await db.collection('users').get();
    const deleteBatch = db.batch();
    const authUsersToDelete = [];

    existingUsersSnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const docRef = db.collection('users').doc(docSnapshot.id);
      deleteBatch.delete(docRef);
      if (data.studentId) {
        const email = `${data.studentId}@tsukasafoods.com`;
        authUsersToDelete.push(email);
      }
    });

    await deleteBatch.commit();

    for (const email of authUsersToDelete) {
      try {
        const existingAuthUser = await admin.auth().getUserByEmail(email);
        await admin.auth().deleteUser(existingAuthUser.uid);
      } catch (deleteError) {
        if (deleteError.code !== 'auth/user-not-found') {
          logger.warn(`Failed to delete auth user ${email}: ${deleteError.message}`);
        }
      }
    }

    const fileBuffer = Buffer.from(fileData, 'base64');

    let decodedCsv = '';
    try {
      decodedCsv = iconv.decode(fileBuffer, 'shift_jis');
      if (decodedCsv.includes('�')) {
        // 文字化けが多い場合は UTF-8 と判断してフォールバック
        decodedCsv = fileBuffer.toString('utf8');
      }
    } catch (decodeError) {
      decodedCsv = fileBuffer.toString('utf8');
    }

    const parseResult = Papa.parse(decodedCsv, { skipEmptyLines: true });
    // ヘッダーを検出（「ID」「氏名」「学年」）
    let dataRows = parseResult.data;
    const headerRow = dataRows[0].map(cell => String(cell || '').trim());
    const hasHeader = headerRow.includes('ID') && headerRow.includes('氏名');

    if (hasHeader) {
      const idIndex = headerRow.indexOf('ID');
      const nameIndex = headerRow.indexOf('氏名');
      const gradeIndex = headerRow.indexOf('学年');
      dataRows = dataRows.slice(1).map(row => [row[idIndex], row[nameIndex], row[gradeIndex]]);
    } else {
      // 古い形式（ヘッダーなし）: 先頭3行をスキップ
      dataRows = dataRows.slice(3);
    }

    const users = dataRows.filter((row) => row && row.length > 1 && row.some((cell) => cell && String(cell).trim() !== ''));

    if (users.length === 0) {
      return res.status(400).json({ error: 'CSVに有効なデータ行が見つかりませんでした。' });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const record of users) {
      const rawStudentId = record[0];
      const rawName = record[1];
      const rawGrade = record[2];

      if (rawStudentId == null && rawName == null && rawGrade == null) {
        continue;
      }

      let studentId = String(rawStudentId || '').trim();
      const username = String(rawName || '').trim();
      let grade = String(rawGrade || '').trim();

      if (!/^\d{3,4}$/.test(studentId)) {
        failedCount++;
        errors.push(`IDが不正: ${record.join(',')}`);
        continue;
      }
      if (studentId.length === 3) studentId = studentId.padStart(4, '0');
      if (!username) {
        failedCount++;
        errors.push(`氏名が空: ${record.join(',')}`);
        continue;
      }
      if (!grade) {
        errors.push(`学年が空: ${record.join(',')}`);
        failedCount++;
        continue;
      }

      // 学年文字列をトリムし、全角→半角変換・大文字統一などが必要ならここで実施
      grade = grade.replace(/\s+/g, '');

      const email = `${studentId}@tsukasafoods.com`;
      const password = `tsukuba${studentId}`;

      try {
        const userRecord = await admin.auth().getUserByEmail(email).catch((e) => {
          if (e.code === 'auth/user-not-found') return null;
          throw e;
        });

        if (userRecord) {
          await admin.auth().updateUser(userRecord.uid, { displayName: username, password });
          await db.collection('users').doc(userRecord.uid).set({
            name: username,
            grade,
            studentId,
          }, { merge: true });
          updatedCount++;
        } else {
          const newUserRecord = await admin.auth().createUser({ email, password, displayName: username });
          await db.collection('users').doc(newUserRecord.uid).set({
            name: username,
            studentId,
            grade,
            level: 0,
            goal: { targetExam: null, targetDate: null, isSet: false },
            progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
          });
          createdCount++;
        }
      } catch (err) {
        failedCount++;
        errors.push(`処理失敗 ${email}: ${err.message}`);
        logger.error('[Import] Error processing ${email}:', err);
      }
    }

    return res.status(200).json({
      message: 'User import process finished.',
      created: createdCount,
      updated: updatedCount,
      failed: failedCount,
      errors,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
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
      const yearMonth = new Date().toISOString().slice(0, 7);
      const storyDocRef = db.collection('users').doc(userId).collection('generatedStories').doc(yearMonth);
      const storyDoc = await storyDocRef.get();
      if (storyDoc.exists) {
        logger.info(`Story for ${userId} in ${yearMonth} already exists.`);
        return res.status(429).json({ 
          error: 'A story for this month has already been generated.',
          ...storyDoc.data()
        });
      }

      try {
        const userLevel = userData.level || 3;
        const levelDescriptions = {
          1: "a very beginner level (CEFR A1)", 2: "a beginner level (CEFR A1)",
          3: "an elementary level (CEFR A2)", 4: "a pre-intermediate level (CEFR A2)",
          5: "an intermediate level (CEFR B1)", 6: "an upper-intermediate level (CEFR B1-B2)",
          7: "an advanced level (CEFR B2)", 8: "a very advanced level (CEFR C1)",
          9: "a near-native level (CEFR C1+)", 10: "a native level (CEFR C2)"
        };
        const levelDescription = levelDescriptions[userLevel] || levelDescriptions[3];
        const wordList = words.map(w => w.word).join(', ');

        const jsonSchema = {
          type: "object",
          properties: {
            story: {
              type: "string",
              description: "The generated story, as a single block of plain text without any markdown or formatting symbols."
            },
            unusedWords: {
              type: "array",
              description: "An array of words from the provided list that could not be logically included in the story. This should be an empty array if all words were used.",
              items: {
                type: "string"
              }
            }
          },
          required: ["story", "unusedWords"]
        };

        const prompt = `
You are an expert in creating educational materials for English language learners.
Your task is to write a coherent and logical short story for a student at ${levelDescription}.

Please adhere to the following rules:
1.  **Use all of the following words**: ${wordList}.
2.  **Story requirements**: The story must be logical, coherent, and interesting. It should be between 150 and 200 words.
3.  **Output format**: The output must be a single, valid JSON object that conforms to the following schema. Do not output any text or markdown before or after the JSON object.
    \`\`\`json
    ${JSON.stringify(jsonSchema, null, 2)}
    \`\`\`
4.  If you cannot logically include a word, add it to the "unusedWords" array. If all words are used, the array must be empty.
`;

        const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
        const generativeModel = vertex_ai.getGenerativeModel({
          model: 'gemini-2.0-flash-001',
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });
        
        const resp = await generativeModel.generateContent(prompt);
        logger.info("Full response from Gemini:", JSON.stringify(resp, null, 2));

        const candidate = resp.response?.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts || !candidate.content.parts[0].text) {
          const finishReason = resp.response?.finishReason;
          const safetyRatings = resp.response?.safetyRatings;
          logger.error("Story generation failed. Invalid response structure from AI.", { finishReason, safetyRatings, candidate });
          throw new HttpsError('internal', 'AI returned an invalid response structure.');
        }
        
        let resultData;
        const responseJsonText = candidate.content.parts[0].text;
        try {
            resultData = JSON.parse(responseJsonText);
            logger.info("Successfully parsed AI response.", { resultData });
        } catch (e) {
            logger.error("Failed to parse AI response as JSON.", { responseText: responseJsonText, error: e });
            throw new HttpsError('internal', 'AI returned a non-JSON response, preventing story generation.');
        }

        const story = resultData.story;
        const unusedWords = resultData.unusedWords || [];

        if (!story || typeof story !== 'string') {
          logger.error("Story generation failed. Could not extract valid story text from JSON response.", { resultData });
          throw new HttpsError('internal', 'Failed to generate a valid story from the AI response.');
        }

        const translationClient = new TranslationServiceClient();
        const projectId = process.env.GCLOUD_PROJECT;
        const location = 'global';
        const translateRequest = {
          parent: `projects/${projectId}/locations/${location}`,
          contents: [story],
          mimeType: 'text/plain',
          sourceLanguageCode: 'en',
          targetLanguageCode: 'ja',
        };
        const [translateResponse] = await translationClient.translateText(translateRequest);
        const translation = translateResponse.translations[0]?.translatedText || '';

        const storyDataToSave = {
          story,
          translation,
          words,
          unusedWords,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await storyDocRef.set(storyDataToSave);

        return res.status(200).json(storyDataToSave);

      } catch (error) {
        logger.error("Gemini story generation failed with error:", error);
        const message = error instanceof HttpsError ? error.message : 'Internal Server Error: Failed to generate story. Please try again later.';
        const code = error instanceof HttpsError ? error.code : 'internal';
        return res.status(500).json({ error: message, code: code });
      }
    });
  }
);