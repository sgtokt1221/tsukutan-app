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
const busboy = require('busboy');
const iconv = require('iconv-lite');
const Papa = require('papaparse');
const { VertexAI } = require('@google-cloud/vertexai');
const { TranslationServiceClient } = require('@google-cloud/translate').v3beta1;

//==============================================================================
// ユーザー一括インポート機能 (ファイルアップロードベース)
//==============================================================================
const importUsersApp = express();
// CORSミドルウェアを適用 (OPTIONSリクエストの処理を含む)
importUsersApp.use(cors({ 
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// OPTIONSリクエストの明示的な処理
importUsersApp.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.status(200).end();
});

importUsersApp.post('/', (req, res) => {
  // 認証
  const idToken = req.get("Authorization")?.split("Bearer ")[1];
  if (!idToken) {
    return res.status(403).json({error: "Unauthorized: No token provided."});
  }
  admin.auth().verifyIdToken(idToken)
    .then(async (decodedToken) => {
      if (decodedToken.email !== "tsukasafoods@gmail.com") {
        throw new Error("Forbidden: Not an admin user.");
      }
      
      try {
        // Check if request is JSON (base64) or multipart form
        if (req.headers['content-type']?.includes('application/json')) {
          // Handle base64 encoded file
          const { fileName, fileData, mimeType } = req.body;
          
          if (!fileName || !fileData) {
            return res.status(400).json({ error: 'Missing fileName or fileData in request body.' });
          }
          
          logger.info(`Received base64 file: ${fileName}, mimeType: ${mimeType}`);
          
          // Convert base64 to buffer
          const fileBuffer = Buffer.from(fileData, 'base64');
          // 文字コードをShift-JISからUTF-8へ変換
          const decodedCsv = iconv.decode(fileBuffer, 'shift-jis');
          
          // CSVをパース
          const parseResult = Papa.parse(decodedCsv, { skipEmptyLines: true });
          const users = parseResult.data.slice(3).filter(row => row.length > 1 && row.some(cell => cell && cell.trim() !== ''));

          if (users.length === 0) {
            return res.status(400).json({ error: 'CSVに有効なデータ行が見つかりませんでした。' });
          }

          // バッチ処理
          let createdCount = 0;
          let updatedCount = 0;
          let failedCount = 0;
          const errors = [];
          const BATCH_SIZE = 2;
          const DELAY_MS = 5000;
          const MAX_RETRIES = 3;
          const RETRY_DELAY = 10000;
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

          // Retry function for Firebase Auth operations
          const retryAuthOperation = async (operation, maxRetries = MAX_RETRIES) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                return await operation();
              } catch (error) {
                if (error.code === 'auth/internal-error' && attempt < maxRetries) {
                  logger.info(`Auth operation failed, retrying in ${RETRY_DELAY}ms (attempt ${attempt}/${maxRetries})`);
                  await sleep(RETRY_DELAY);
                  continue;
                }
                throw error;
              }
            }
          };

          for (let i = 0; i < users.length; i += BATCH_SIZE) {
            const batch = users.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (record) => {
              let studentId = record[0];
              const username = record[1];
              const grade = record[2];

              if (studentId && studentId.length === 3) {
                studentId = studentId.padStart(4, '0');
              }

              if (!username || !studentId || studentId.length !== 4 || !grade) {
                failedCount++;
                errors.push(`情報不足: ${record.join(",")}`);
                return;
              }

              const email = `${studentId}@tsukasafoods.com`;
              const password = `tsukuba${studentId}`;

              try {
                const userRecord = await retryAuthOperation(() => admin.auth().getUserByEmail(email));
                await retryAuthOperation(() => admin.auth().updateUser(userRecord.uid, { displayName: username, password: password }));
                await db.collection("users").doc(userRecord.uid).set({ name: username, grade: grade }, { merge: true });
                updatedCount++;
              } catch (error) {
                if (error.code === 'auth/user-not-found') {
                  try {
                    const newUserRecord = await retryAuthOperation(() => admin.auth().createUser({ email, password, displayName: username }));
                    await db.collection("users").doc(newUserRecord.uid).set({
                      name: username, studentId: studentId, grade: grade, level: 0,
                      goal: { targetExam: null, targetDate: null, isSet: false },
                      progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
                    });
                    createdCount++;
                  } catch (creationError) {
                    failedCount++;
                    // Extract meaningful error message
                    let errorMessage = creationError.message;
                    if (creationError.code) {
                      errorMessage = `${creationError.code}: ${creationError.message}`;
                    }
                    // Truncate very long error messages
                    if (errorMessage.length > 200) {
                      errorMessage = errorMessage.substring(0, 200) + '...';
                    }
                    errors.push(`作成失敗 ${email}: ${errorMessage}`);
                  }
                } else {
                  failedCount++;
                  // Extract meaningful error message
                  let errorMessage = error.message;
                  if (error.code) {
                    errorMessage = `${error.code}: ${error.message}`;
                  }
                  // Truncate very long error messages
                  if (errorMessage.length > 200) {
                    errorMessage = errorMessage.substring(0, 200) + '...';
                  }
                  errors.push(`処理失敗 ${email}: ${errorMessage}`);
                }
              }
            });
            await Promise.all(promises);
            if (i + BATCH_SIZE < users.length) {
              await sleep(DELAY_MS);
            }
          }

          return res.status(200).json({
            message: "User import process finished.",
            created: createdCount, updated: updatedCount, failed: failedCount, errors: errors,
          });
        } else {
          // Fallback to multipart form handling (for backward compatibility)
          const bb = busboy({ 
            headers: req.headers,
            limits: {
              fileSize: 10 * 1024 * 1024, // 10MB limit
            }
          });
          const fileBuffers = [];
          let fileReceived = false;

          bb.on('file', (name, file, info) => {
            logger.info(`File received: ${name}, mimeType: ${info.mimeType}`);
            fileReceived = true;
            const { mimeType } = info;
            logger.info(`File mimeType: ${mimeType}`);
            // Accept various CSV mime types
            const allowedMimeTypes = [
              'text/csv',
              'application/vnd.ms-excel',
              'application/csv',
              'text/plain',
              'application/octet-stream'
            ];
            if (!allowedMimeTypes.includes(mimeType)) {
                return res.status(400).json({ error: `Unsupported file type: ${mimeType}. Please upload a CSV file.` });
            }
            file.on('data', (data) => {
                fileBuffers.push(data);
            }).on('close', () => {
                logger.info('File upload finished.');
            }).on('error', (err) => {
                logger.error('File stream error:', err);
            });
          });

          bb.on('error', (err) => {
            logger.error('Busboy error:', err);
            return res.status(400).json({ error: `File upload error: ${err.message}` });
          });

          bb.on('finish', async () => {
            try {
              logger.info(`Finish event triggered. File received: ${fileReceived}, Buffers: ${fileBuffers.length}`);
              if (!fileReceived || fileBuffers.length === 0) {
                return res.status(400).json({ error: 'No file uploaded.' });
              }
              const fileBuffer = Buffer.concat(fileBuffers);
              // 文字コードをShift-JISからUTF-8へ変換
              const decodedCsv = iconv.decode(fileBuffer, 'shift-jis');
              
              // CSVをパース
              const parseResult = Papa.parse(decodedCsv, { skipEmptyLines: true });
              const users = parseResult.data.slice(3).filter(row => row.length > 1 && row.some(cell => cell && cell.trim() !== ''));

              if (users.length === 0) {
                return res.status(400).json({ error: 'CSVに有効なデータ行が見つかりませんでした。' });
              }

              // バッチ処理
              let createdCount = 0;
              let updatedCount = 0;
              let failedCount = 0;
              const errors = [];
              const BATCH_SIZE = 2;
              const DELAY_MS = 5000;
              const MAX_RETRIES = 3;
              const RETRY_DELAY = 10000;
              const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

              // Retry function for Firebase Auth operations
              const retryAuthOperation = async (operation, maxRetries = MAX_RETRIES) => {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                  try {
                    return await operation();
                  } catch (error) {
                    if (error.code === 'auth/internal-error' && attempt < maxRetries) {
                      logger.info(`Auth operation failed, retrying in ${RETRY_DELAY}ms (attempt ${attempt}/${maxRetries})`);
                      await sleep(RETRY_DELAY);
                      continue;
                    }
                    throw error;
                  }
                }
              };

              for (let i = 0; i < users.length; i += BATCH_SIZE) {
                const batch = users.slice(i, i + BATCH_SIZE);
                const promises = batch.map(async (record) => {
                  let studentId = record[0];
                  const username = record[1];
                  const grade = record[2];

                  if (studentId && studentId.length === 3) {
                    studentId = studentId.padStart(4, '0');
                  }

                  if (!username || !studentId || studentId.length !== 4 || !grade) {
                    failedCount++;
                    errors.push(`情報不足: ${record.join(",")}`);
                    return;
                  }

                  const email = `${studentId}@tsukasafoods.com`;
                  const password = `tsukuba${studentId}`;

                  try {
                    const userRecord = await retryAuthOperation(() => admin.auth().getUserByEmail(email));
                    await retryAuthOperation(() => admin.auth().updateUser(userRecord.uid, { displayName: username, password: password }));
                    await db.collection("users").doc(userRecord.uid).set({ name: username, grade: grade }, { merge: true });
                    updatedCount++;
                  } catch (error) {
                    if (error.code === 'auth/user-not-found') {
                      try {
                        const newUserRecord = await retryAuthOperation(() => admin.auth().createUser({ email, password, displayName: username }));
                        await db.collection("users").doc(newUserRecord.uid).set({
                          name: username, studentId: studentId, grade: grade, level: 0,
                          goal: { targetExam: null, targetDate: null, isSet: false },
                          progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
                        });
                        createdCount++;
                      } catch (creationError) {
                        failedCount++;
                        // Extract meaningful error message
                        let errorMessage = creationError.message;
                        if (creationError.code) {
                          errorMessage = `${creationError.code}: ${creationError.message}`;
                        }
                        // Truncate very long error messages
                        if (errorMessage.length > 200) {
                          errorMessage = errorMessage.substring(0, 200) + '...';
                        }
                        errors.push(`作成失敗 ${email}: ${errorMessage}`);
                      }
                    } else {
                      failedCount++;
                      // Extract meaningful error message
                      let errorMessage = error.message;
                      if (error.code) {
                        errorMessage = `${error.code}: ${error.message}`;
                      }
                      // Truncate very long error messages
                      if (errorMessage.length > 200) {
                        errorMessage = errorMessage.substring(0, 200) + '...';
                      }
                      errors.push(`処理失敗 ${email}: ${errorMessage}`);
                    }
                  }
                });
                await Promise.all(promises);
                if (i + BATCH_SIZE < users.length) {
                  await sleep(DELAY_MS);
                }
              }

              return res.status(200).json({
                message: "User import process finished.",
                created: createdCount, updated: updatedCount, failed: failedCount, errors: errors,
              });

            } catch (error) {
              logger.error("Error processing users:", error);
              return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
            }
          });
          
          req.pipe(bb);
        }

      } catch (error) {
        logger.error("Error processing request:", error);
        return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
      }

    })
    .catch(error => {
      logger.error("Error verifying auth token:", error);
      return res.status(403).json({error: `Unauthorized: ${error.message}`});
    });
});

// Firebase FunctionsのエンドポイントとしてExpressアプリをエクスポート
exports.importUsers = onRequest(
  { 
    region: "us-central1", 
    memory: "512MiB",
    timeoutSeconds: 300,
    maxInstances: 10
  },
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