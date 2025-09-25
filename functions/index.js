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
  {
    region: "us-central1",
    memory: "256MiB",
    serviceAccount: "115384710973-compute@developer.gserviceaccount.com",
  },
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
exports.generateStoryFromWords = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    serviceAccount: "115384710973-compute@developer.gserviceaccount.com",
  },
  (req, res) => {
    cors(req, res, async () => {
      // プリフライトリクエスト(OPTIONS)にCORSヘッダーを付けて返す
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.set('Access-Control-Max-Age', '3600');
        return res.status(204).send('');
      }

      // --- onRequest形式への変更に伴う認証とリクエスト処理 ---
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
      // --- ここまで ---

      if (!words || words.length === 0) {
        return res.status(400).json({ error: 'Bad Request: Word list is empty.' });
      }

      const userDocRef = admin.firestore().collection('users').doc(userId);
      const userDoc = await userDocRef.get();
      const userData = userDoc.data();

      if (userData && userData.lastStoryGeneration) {
        const lastGenDate = userData.lastStoryGeneration.toDate();
        const now = new Date();
        if (lastGenDate.getFullYear() === now.getFullYear() && lastGenDate.getMonth() === now.getMonth()) {
          return res.status(429).json({ error: 'Too Many Requests: This feature can only be used once a month.' });
        }
      }

      try {
        const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: 'us-central1' });
        const model = 'gemini-1.5-flash';
        const generativeModel = vertex_ai.getGenerativeModel({ model });
        const wordList = words.map(w => w.word).join(', ');
        const prompt = `Please write a short, simple, and interesting story for an English learner, using all of the following words: ${wordList}. The story should be around 150-200 words.`;

        const resp = await generativeModel.generateContent(prompt);
        logger.info("Full response from Gemini:", JSON.stringify(resp, null, 2));

        const candidates = resp.response?.candidates;
        if (!candidates || candidates.length === 0) {
          const finishReason = resp.response?.finishReason;
          const safetyRatings = resp.response?.safetyRatings;
          logger.error("Story generation failed. No candidates returned.", { finishReason, safetyRatings });
          return res.status(500).json({ error: 'AI could not generate a story. This may be due to inappropriate words or other issues.' });
        }

        const story = candidates[0]?.content?.parts?.[0]?.text;
        if (!story) {
          logger.error("Story generation failed. Could not extract text from candidate.", { candidate: candidates[0] });
          return res.status(500).json({ error: 'Failed to generate story from AI response.' });
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
        const translation = translateResponse.translations[0].translatedText;

        await userDocRef.set({
            lastStoryGeneration: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // --- 成功時のレスポンス ---
        return res.status(200).json({ story, translation });

      } catch (error) {
        logger.error("Gemini story generation failed:", error);
        // --- 失敗時のレスポンス ---
        return res.status(500).json({ error: 'Internal Server Error: Failed to generate story. Please try again later.' });
      }
    });
  }
);