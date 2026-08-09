import { useCallback, useEffect, useState } from 'react';
import { loadPronunciations } from './wordMaster';
import logger from './logger';

/**
 * 発音記号（IPA）を綴りから引く。
 *
 * 単語がどこから来ても同じように出せるようにするための仕組み。
 * 自由学習は public/data のマスター（pronunciation 入り）を読むが、
 * 日次学習は Firestore の textbooks、復習は保存時点の写しなので
 * どちらも pronunciation を持たない。そこで表示のときに引く。
 *
 * 発音は補助情報なので、読み込みに失敗しても学習は止めない。
 * 引けなかった語は undefined を返し、呼び出し側で非表示にする。
 */
export const usePronunciation = () => {
  const [table, setTable] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadPronunciations()
      .then((data) => {
        if (!cancelled) setTable(data);
      })
      .catch((error) => {
        logger.warn('発音記号を読み込めませんでした。発音の表示だけ省きます。', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return useCallback(
    (word) => {
      if (!word || !table) return undefined;
      return table[word];
    },
    [table]
  );
};

export default usePronunciation;
