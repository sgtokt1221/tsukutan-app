/**
 * Firestore Security Rules の許可・拒否テスト（IMPLEMENTATION_PLAN.md 7.8）
 *
 *   npm --prefix functions run test:rules
 *
 * Firestore エミュレータ上で実行する。`firebase emulators:exec` が
 * FIRESTORE_EMULATOR_HOST を渡してくれる前提。
 */

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');

const ADMIN_EMAIL = 'tsukasafoods@gmail.com';
const STUDENT_A = 'student-a';
const STUDENT_B = 'student-b';

let testEnv;

const asStudentA = () => testEnv.authenticatedContext(STUDENT_A, { email: '1203@tsukasafoods.com' }).firestore();
const asAdmin = () => testEnv.authenticatedContext('admin-uid', { email: ADMIN_EMAIL }).firestore();
const asAnonymous = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-tsukutan',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host,
      port: Number(port),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // ルールを迂回してシードする
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', STUDENT_A), { name: '山田太郎', studentId: '1203', grade: '中1' });
    await setDoc(doc(db, 'users', STUDENT_B), { name: '佐藤花子', studentId: '1204', grade: '高2' });
    await setDoc(doc(db, 'users', STUDENT_A, 'reviewWords', 'w1'), { word: 'apple' });
    await setDoc(doc(db, 'users', STUDENT_B, 'reviewWords', 'w1'), { word: 'banana' });
    await setDoc(doc(db, 'goalsMaster', 'eiken_3'), { displayName: '英検3級 合格', requiredVocabulary: 2100 });
    await setDoc(doc(db, 'textbooks', 'osaka-koukou-nyuushi', 'words', 'w1'), { word: 'about', level: 1 });
    await setDoc(doc(db, 'importOperations', 'op1'), { status: 'previewed' });
  });
});

describe('生徒は自分のデータを読み書きできる', () => {
  test('自分のユーザー文書を読める', async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), 'users', STUDENT_A)));
  });

  test('自分のユーザー文書を更新できる', async () => {
    await assertSucceeds(
      updateDoc(doc(asStudentA(), 'users', STUDENT_A), { goal: { isSet: true, targets: [] } })
    );
  });

  test('自分のサブコレクションを読み書きできる', async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), 'users', STUDENT_A, 'reviewWords', 'w1')));
    await assertSucceeds(setDoc(doc(asStudentA(), 'users', STUDENT_A, 'reviewWords', 'w2'), { word: 'cat' }));
  });
});

describe('生徒は他人のデータに触れない', () => {
  test('他の生徒のユーザー文書を読めない', async () => {
    await assertFails(getDoc(doc(asStudentA(), 'users', STUDENT_B)));
  });

  test('他の生徒のユーザー文書を書き換えられない', async () => {
    await assertFails(updateDoc(doc(asStudentA(), 'users', STUDENT_B), { name: '改竄' }));
  });

  test('他の生徒のサブコレクションを読めない', async () => {
    await assertFails(getDoc(doc(asStudentA(), 'users', STUDENT_B, 'reviewWords', 'w1')));
  });

  test('他の生徒のサブコレクションに書き込めない', async () => {
    await assertFails(setDoc(doc(asStudentA(), 'users', STUDENT_B, 'reviewWords', 'w9'), { word: 'x' }));
  });
});

describe('生徒は一覧を取得できない', () => {
  test('users コレクションを list できない', async () => {
    await assertFails(getDocs(collection(asStudentA(), 'users')));
  });

  test('管理者だけが users を list できる', async () => {
    await assertSucceeds(getDocs(collection(asAdmin(), 'users')));
  });
});

describe('管理者', () => {
  test('任意の生徒の文書を読める', async () => {
    await assertSucceeds(getDoc(doc(asAdmin(), 'users', STUDENT_A)));
    await assertSucceeds(getDoc(doc(asAdmin(), 'users', STUDENT_B)));
  });

  test('生徒のサブコレクションを読める', async () => {
    await assertSucceeds(getDocs(collection(asAdmin(), 'users', STUDENT_A, 'reviewWords')));
  });
});

describe('保護フィールド', () => {
  test('生徒は自分の studentId を書き換えられない', async () => {
    await assertFails(updateDoc(doc(asStudentA(), 'users', STUDENT_A), { studentId: '9999' }));
  });

  test('生徒は自分の disabledAt を消せない', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', STUDENT_A), { disabledAt: new Date() });
    });
    await assertFails(updateDoc(doc(asStudentA(), 'users', STUDENT_A), { disabledAt: null }));
  });

  test('生徒はユーザー文書を削除できない', async () => {
    await assertFails(deleteDoc(doc(asStudentA(), 'users', STUDENT_A)));
  });
});

describe('マスターデータ', () => {
  test('認証済みなら goalsMaster を読める', async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), 'goalsMaster', 'eiken_3')));
  });

  test('認証済みなら教材の単語を読める', async () => {
    await assertSucceeds(getDoc(doc(asStudentA(), 'textbooks', 'osaka-koukou-nyuushi', 'words', 'w1')));
  });

  test('生徒は goalsMaster を一覧取得できる（progressLogic が getDocs する）', async () => {
    await assertSucceeds(getDocs(collection(asStudentA(), 'goalsMaster')));
  });

  test('生徒は教材の単語を一覧取得できる（learningPlanner が getDocs する）', async () => {
    await assertSucceeds(getDocs(collection(asStudentA(), 'textbooks', 'osaka-koukou-nyuushi', 'words')));
  });

  test('生徒は自分のサブコレクションを一覧取得できる', async () => {
    await assertSucceeds(getDocs(collection(asStudentA(), 'users', STUDENT_A, 'reviewWords')));
  });

  test('生徒は goalsMaster を書き換えられない', async () => {
    await assertFails(setDoc(doc(asStudentA(), 'goalsMaster', 'eiken_3'), { requiredVocabulary: 1 }));
  });

  test('管理者でも goalsMaster をクライアントから書き換えられない', async () => {
    await assertFails(setDoc(doc(asAdmin(), 'goalsMaster', 'eiken_3'), { requiredVocabulary: 1 }));
  });
});

describe('未認証', () => {
  test('何も読めない', async () => {
    await assertFails(getDoc(doc(asAnonymous(), 'users', STUDENT_A)));
    await assertFails(getDoc(doc(asAnonymous(), 'goalsMaster', 'eiken_3')));
  });
});

describe('取り込み操作記録', () => {
  test('生徒も管理者もクライアントからは触れない', async () => {
    await assertFails(getDoc(doc(asStudentA(), 'importOperations', 'op1')));
    await assertFails(getDoc(doc(asAdmin(), 'importOperations', 'op1')));
    await assertFails(setDoc(doc(asAdmin(), 'importOperations', 'op2'), { status: 'previewed' }));
  });
});

describe('未定義のコレクション', () => {
  test('ルールに無いパスは拒否される', async () => {
    await assertFails(getDoc(doc(asStudentA(), 'secretStuff', 'x')));
    await assertFails(setDoc(doc(asAdmin(), 'secretStuff', 'x'), { a: 1 }));
  });
});
