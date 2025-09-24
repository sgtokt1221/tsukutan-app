const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");

// It is strongly recommended to specify the production URL in an environment variable
// and add it to the list of allowed origins.
// e.g., const productionUrl = functions.config().cors.origin;
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5000", // Default for Firebase Hosting emulator
  "https://tsukutan-58b3f.web.app", // Your project's URL
  "https://tsukutan-58b3f.firebaseapp.com", // Your project's URL
];

const corsHandler = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not ' +
                'allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
});
const { parse } = require("csv-parse/sync");

admin.initializeApp();
const db = admin.firestore();

exports.importUsers = functions.region("asia-northeast1").https(async (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    if (!req.body) {
      return res.status(400).send("Bad Request: No body provided.");
    }

    // Check for admin privileges (important for security)
    const idToken = req.get("Authorization")?.split("Bearer ")[1];
    if (!idToken) {
        return res.status(403).send("Unauthorized");
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        // This is the admin user we created earlier
        if (decodedToken.email !== "tsukasafoods@gmail.com") {
            return res.status(403).send("Forbidden: Not an admin user.");
        }
    } catch (error) {
        console.error("Error verifying auth token:", error);
        return res.status(403).send("Unauthorized");
    }

    const csvData = req.body;
    let createdCount = 0;
    let failedCount = 0;
    const errors = [];

    try {
      const records = parse(csvData, {
        columns: false,
        skip_empty_lines: true,
      });

      for (const record of records) {
        const username = record[0];
        const studentId = record[1];

        if (!username || !studentId || studentId.length !== 4) {
          failedCount++;
          errors.push(`Invalid record: ${record.join(",")}`);
          continue;
        }

        const email = `${studentId}@tsukasafoods.com`; // Using a dummy domain
        const password = `tsukuba${studentId}`;

        try {
          const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: username,
          });

          // Firestoreに保存するユーザー情報に新しいフィールドを追加
          await db.collection("users").doc(userRecord.uid).set({
            name: username,
            studentId: studentId,
            level: 0,
            
            // ▼▼▼▼▼ ここから下が修正・追加した箇所です ▼▼▼▼▼
            goal: {
              targetExam: null,
              targetDate: null,
              isSet: false,
            },
            learningState: {
              dailyNewWords: 10, // ユーザーごとの学習計画の初期値
              dailyReviewWords: 30, // ユーザーごとの学習計画の初期値
            },
            progress: {
              percentage: 0,
              currentVocabulary: 0,
              lastCheckedAt: null,
            },
            // ▲▲▲▲▲ ここまで ▲▲▲▲▲
          });

          createdCount++;
        } catch (error) {
          failedCount++;
          errors.push(`Failed to create user ${email}: ${error.message}`);
          console.error(`Failed to create user ${email}:`, error);
        }
      }

      res.status(200).send({
        message: "User import process finished.",
        created: createdCount,
        failed: failedCount,
        errors: errors,
      });
    } catch (error) {
      console.error("Error parsing or processing CSV:", error);
      res.status(500).send(`Internal Server Error: ${error.message}`);
    }
  });
});