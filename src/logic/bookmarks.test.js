import { bookmarkId } from './bookmarks';

describe('bookmarkId', () => {
  test('同じ綴り・同じ意味なら、どの画面から登録しても同じIDになる', () => {
    // 日次学習は Firestore の教材ドキュメントID、復習は永続ID、
    // 自由学習はマスターのID を持つ。id が違っても同一視できること。
    const fromDaily = { id: 'AbC123xyz', word: 'about', meaning: '約、およそ' };
    const fromReview = { id: 'w_0123456789abcdef', word: 'about', meaning: '約、およそ' };
    const fromMaster = { id: 'w_0123456789abcdef', word: 'About', meaning: ' 約、およそ ' };

    expect(bookmarkId(fromDaily)).toBe(bookmarkId(fromReview));
    expect(bookmarkId(fromReview)).toBe(bookmarkId(fromMaster));
  });

  test('意味が違えば別のIDになる（同綴異義語を潰さない）', () => {
    expect(bookmarkId({ word: 'lead', meaning: '導く' }))
      .not.toBe(bookmarkId({ word: 'lead', meaning: '鉛' }));
  });

  test('綴りが違えば別のIDになる', () => {
    expect(bookmarkId({ word: 'affect', meaning: '影響する' }))
      .not.toBe(bookmarkId({ word: 'effect', meaning: '影響' }));
  });

  test('Firestore のドキュメントIDとして使える文字だけになる', () => {
    const ids = [
      { word: "(all) on one's own", meaning: '自分だけで' },
      { word: 'inasmuch/in as much as …', meaning: '〜する限り' },
      { word: 'look ～ in the eye(s)', meaning: '〜の目を見る' },
      { word: 'résumé', meaning: '履歴書' },
    ].map(bookmarkId);

    for (const id of ids) {
      expect(id).toMatch(/^bm_[0-9a-f]{16}$/);
      // ダブルアンダースコアで挟まれた形は Firestore が拒否する
      expect(id).not.toMatch(/^__.*__$/);
      expect(id).not.toContain('/');
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('綴りが無いものは登録できない', () => {
    expect(bookmarkId(null)).toBeNull();
    expect(bookmarkId({})).toBeNull();
    expect(bookmarkId({ meaning: '意味だけ' })).toBeNull();
  });

  test('意味が無くても綴りだけで登録できる', () => {
    expect(bookmarkId({ word: 'about' })).toMatch(/^bm_[0-9a-f]{16}$/);
  });

  test('マスター全語でIDが衝突しない', () => {
    const master = require('../../public/data/words-master.json');
    const byId = new Map();
    const collisions = [];
    for (const entry of master) {
      const id = bookmarkId(entry);
      const seen = byId.get(id);
      // 同じ綴り・同じ意味でレベルだけ違う重複は同一視してよい
      if (seen && (seen.word !== entry.word || seen.meaning !== entry.meaning)) {
        collisions.push([seen.word, entry.word]);
      }
      byId.set(id, entry);
    }
    expect(collisions).toEqual([]);
  });
});
