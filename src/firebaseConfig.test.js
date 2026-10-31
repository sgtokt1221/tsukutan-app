const fs = require('fs');
const path = require('path');

// 携帯で、使っていないポップアップ用の部品（gapi と auth の iframe）を待たない（2026-10-31）
describe('認証の初期化', () => {
  const src = fs.readFileSync(path.join(__dirname, 'firebaseConfig.js'), 'utf8');

  test('**getAuth で作らない**（ポップアップ用の部品が付く）', () => {
    expect(src).not.toMatch(/getAuth\(app\)/);
    expect(src).not.toMatch(/popupRedirectResolver/);
  });

  test('**保存先の並びは getAuth の既定と同じ**（変えると全員ログアウト）', () => {
    expect(src.replace(/\s+/g, ' ')).toContain(
      'persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]',
    );
  });
});
