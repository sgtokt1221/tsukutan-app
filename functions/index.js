// Firebase SDK
const { onRequest } = require("firebase-functions/v2/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// 外部ライブラリ
const cors = require("cors")({ origin: true });
const { parse } = require("csv-parse/sync");
const { VertexAI } = require('@google-cloud/vertexai');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1;

//==============================================================================
// ユーザー一括インポート機能 (変更なし)
//==============================================================================
exports.importUsers = onRequest(
  // ▼▼▼ リージョンを us-central1 に変更 ▼▼▼
  { region: "us-central1", memory: "256MiB" },
  (req, res) => {
    cors(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }
      const idToken = req.get("Authorization")?.split("Bearer ")[1];
      if (!idToken) {
        return res.status(403).send("Unauthorized: No token provided.");
      }
      try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (decodedToken.email !== "tsukasafoods@gmail.com") {
          return res.status(403).send("Forbidden: Not an admin user.");
        }
      } catch (error) {
        logger.error("Error verifying auth token:", error);
        return res.status(403).send("Unauthorized: Invalid token.");
      }
      const csvData = req.body.toString();
      let createdCount = 0;
      let failedCount = 0;
      const errors = [];
      try {
        const records = parse(csvData, { skip_empty_lines: true });
        for (const record of records) {
          const username = record[0];
          const studentId = record[1];
          if (!username || !studentId || studentId.length !== 4) {
            failedCount++;
            errors.push(`Invalid record: ${record.join(",")}`);
            continue;
          }
          const email = `${studentId}@tsukasafoods.com`;
          const password = `tsukuba${studentId}`;
          try {
            const userRecord = await admin.auth().createUser({
              email,
              password,
              displayName: username,
            });
            await db.collection("users").doc(userRecord.uid).set({
              name: username,
              studentId: studentId,
              level: 0,
              goal: { targetExam: null, targetDate: null, isSet: false },
              progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
            });
            createdCount++;
          } catch (error) {
            failedCount++;
            const errorMessage = error.message || "Unknown error.";
            errors.push(`Failed to create user ${email}: ${errorMessage}`);
            logger.error(`Failed to create user ${email}:`, error);
          }
        }
        res.status(200).send({
          message: "User import process finished.",
          created: createdCount,
          failed: failedCount,
          errors: errors,
        });
      } catch (error) {
        logger.error("Error parsing or processing CSV:", error);
        res.status(500).send(`Internal Server Error: ${error.message}`);
      }
    });
  }
);

//==============================================================================
// AIストーリー生成機能 (Gemini版)
//==============================================================================
exports.generateStoryFromWords = onCall(
  // ▼▼▼ リージョンを us-central1 に変更 ▼▼▼
  { region: 'us-central1', timeoutSeconds: 120, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'この機能を利用するにはログインが必要です。');
    }
    const userId = request.auth.uid;
    const words = request.data.words;
    if (!words || words.length === 0) {
      throw new HttpsError('invalid-argument', '単語リストが空です。');
    }
    const userDocRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userDocRef.get();
    const userData = userDoc.data();
    if (userData && userData.lastStoryGeneration) {
      const lastGenDate = userData.lastStoryGeneration.toDate();
      const now = new Date();
      if (lastGenDate.getFullYear() === now.getFullYear() && lastGenDate.getMonth() === now.getMonth()) {
        throw new HttpsError('resource-exhausted', 'この機能は月に1回まで利用できます。');
      }
    }
    try {
      // ▼▼▼ Gemini呼び出し元のリージョンも us-central1 に変更 ▼▼▼
      const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
      const model = 'gemini-pro';
      const generativeModel = vertex_ai.getGenerativeModel({ model });

      const wordList = words.map(w => w.word).join(', ');
      const prompt = `Please write a short, simple, and interesting story for an English learner, using all of the following words: ${wordList}. The story should be around 150-200 words.`;

      const resp = await generativeModel.generateContent(prompt);
      const story = resp.response.candidates[0].content.parts[0].text;
      if (!story) {
        throw new HttpsError('internal', 'AIによるストーリー生成に失敗しました。');
      }

      const translationClient = new TranslationServiceClient();
      const projectId = process.env.GCLOUD_PROJECT;
      const location = 'global'; // 翻訳APIは 'global' のままでOK

      const translateRequest = {
        parent: `projects/${projectId}/locations/${location}`,
        contents: [story],
        mimeType: 'text/plain',
        sourceLanguageCode: 'en',
        targetLanguageCode: 'ja',
      };

      const [translateResponse] = await translationClient.translateText(translateRequest);
      const translation = translateResponse.translations[0].translatedText;

      await userDocRef.set({
          lastStoryGeneration: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return { story, translation };
    } catch (error) {
      logger.error("Gemini story generation failed:", error);
      throw new HttpsError('internal', 'ストーリーの生成に失敗しました。時間をおいて再度お試しください。');
    }
  }
);