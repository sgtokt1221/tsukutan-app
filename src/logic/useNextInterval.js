import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { nextIntervalDays } from './swipeIntent';

/**
 * 「わかった」にしたら次は何日後か。**保存済みの記録を読んで計算する。**
 *
 * `updateUserWordProgress` は `users/{uid}/reviewWords/{word.id}` を読み、無ければ
 * はじめての語として計算する。ここも同じ文書を読む。カードの語で計算すると、
 * 記録を持たないカード（自由学習・毎日みる単語）で「明日」と出ていた。
 *
 * 読み終わるまでは null（札は日数を言わない）。
 */
export function useNextInterval(uid, word, motivationLevel) {
  const [result, setResult] = useState({ id: null, days: null });
  const id = word?.id;

  useEffect(() => {
    if (!id) return undefined;
    if (!uid) {
      // ログインしていなければ記録を書かない。カードの中身で見積もる
      setResult({ id, days: nextIntervalDays(word, motivationLevel) });
      return undefined;
    }
    let alive = true;
    getDoc(doc(db, 'users', uid, 'reviewWords', id))
      .then((snap) => {
        if (alive) setResult({ id, days: nextIntervalDays(snap.exists() ? snap.data() : null, motivationLevel) });
      })
      .catch(() => {
        if (alive) setResult({ id, days: null });
      });
    return () => { alive = false; };
    // 同じ語のあいだは読み直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, id, motivationLevel]);

  return result.id === id ? result.days : null;
}
