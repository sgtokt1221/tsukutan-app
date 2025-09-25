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
const Core = require('@alicloud/pop-core');

//==============================================================================
// ユーザー一括インポート機能 (第2世代版)
//==============================================================================
exports.importUsers = onRequest(
  { region: "asia-northeast1", memory: "256MiB" },
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
// AIストーリー生成機能 (第2世代版)
//==============================================================================
exports.generateStoryFromWords = onCall(
  { region: 'asia-northeast1', timeoutSeconds: 120, memory: '256MiB' },
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

    const config = functions.config();
    const accessKeyId = config.alibaba?.access_key_id;
    const accessKeySecret = config.alibaba?.access_key_secret;

    if (!accessKeyId || !accessKeySecret) {
      logger.error("Alibaba API keys are not configured in Firebase Functions config.");
      throw new HttpsError('internal', 'サーバー側のAPIキー設定に問題があります。');
    }

    const wordList = words.map(w => w.word).join(', ');
    const prompt = `Please write a short, simple, and interesting story for an English learner, using all of the following words: ${wordList}. The story should be around 150-200 words.`;

    try {
      // 長文生成
      const llmClient = new Core({
          accessKeyId,
          accessKeySecret,
          endpoint: 'https://dashscope.aliyuncs.com',
          apiVersion: '2023-05-25',
      });
      const llmResult = await llmClient.request('Generation', {
          model: 'qwen-turbo',
          input: { messages: [{ role: 'user', content: prompt }] },
      }, { method: 'POST' });
      const story = llmResult.output.text;
      if (!story) {
           throw new HttpsError('internal', 'AIによるストーリー生成に失敗しました。');
      }

      // 翻訳
      const translateClient = new Core({
          accessKeyId,
          accessKeySecret,
          endpoint: 'https://mt.aliyuncs.com',
          apiVersion: '2018-10-12',
      });
      const translateResult = await translateClient.request('TranslateGeneral', {
          SourceLanguage: 'en',
          TargetLanguage: 'ja',
          SourceText: story,
          FormatType: 'text',
      }, { method: 'POST' });
      const translation = translateResult.Data.Translated;

      // 使用日時を記録
      await userDocRef.set({
          lastStoryGeneration: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return { story, translation };
    } catch (error) {
      logger.error("AI story generation failed:", error);
      throw new HttpsError('internal', 'ストーリーの生成に失敗しました。時間をおいて再度お試しください。');
    }
  }
);