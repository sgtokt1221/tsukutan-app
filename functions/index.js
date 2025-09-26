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
const { VertexAI } = require('@google-cloud/vertexai');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1;

//==============================================================================
// ユーザー一括インポート機能 (Express.js + JSONベース)
//==============================================================================
const importUsersApp = express();
// CORSミドルウェアを適用
importUsersApp.use(cors({ origin: true }));

importUsersApp.post('/', async (req, res) => {
  // 認証
  const idToken = req.get("Authorization")?.split("Bearer ")[1];
  if (!idToken) {
    return res.status(403).json({error: "Unauthorized: No token provided."});
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    if (decodedToken.email !== "tsukasafoods@gmail.com") {
      return res.status(403).json({error: "Forbidden: Not an admin user."});
    }
  } catch (error) {
    logger.error("Error verifying auth token:", error);
    return res.status(403).json({error: "Unauthorized: Invalid token."});
  }

  // ビジネスロジック
  try {
    const { users } = req.body;
    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: "Bad Request: 'users' array not provided."});
    }
    
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const errors = [];

    // 各行の処理を並列実行
    const promises = users.map(async (record) => {
      const username = record[0];
      const studentId = record[1];
      const grade = record[2];

      if (!username || !studentId || studentId.length !== 4 || !grade) {
        failedCount++;
        errors.push(`情報不足: ${record.join(",")}`);
        return;
      }

      const email = `${studentId}@tsukasafoods.com`;
      const password = `tsukuba${studentId}`;

      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        // 既存ユーザーの更新
        await admin.auth().updateUser(userRecord.uid, {
          displayName: username,
          password: password,
        });
        await db.collection("users").doc(userRecord.uid).set({ name: username, grade: grade }, { merge: true });
        updatedCount++;
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          // 新規ユーザーの作成
          try {
            const newUserRecord = await admin.auth().createUser({ email, password, displayName: username });
            await db.collection("users").doc(newUserRecord.uid).set({
              name: username,
              studentId: studentId,
              grade: grade,
              level: 0,
              goal: { targetExam: null, targetDate: null, isSet: false },
              progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
            });
            createdCount++;
          } catch (creationError) {
            failedCount++;
            errors.push(`作成失敗 ${email}: ${creationError.message}`);
          }
        } else {
          failedCount++;
          errors.push(`処理失敗 ${email}: ${error.message}`);
        }
      }
    });
    
    await Promise.all(promises);

    return res.status(200).json({
      message: "User import process finished.",
      created: createdCount,
      updated: updatedCount,
      failed: failedCount,
      errors: errors,
    });
  } catch (error) {
    logger.error("Error processing users:", error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
});

// Firebase FunctionsのエンドポイントとしてExpressアプリをエクスポート
exports.importUsers = onRequest(
  { region: "us-central1", memory: "256MiB" },
  importUsersApp
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