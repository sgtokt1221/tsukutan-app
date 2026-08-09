import { useCallback, useEffect, useState } from 'react';
import { addBookmark, bookmarkId, fetchBookmarks, removeBookmark } from './bookmarks';
import logger from './logger';

/**
 * ブックマークの一覧と登録／解除。
 *
 * 押した瞬間に見た目を変え、書き込みは裏で進める。通信を待たせると
 * 学習の流れが止まるため。失敗したら元に戻す。
 */
export const useBookmarks = (userId) => {
  const [items, setItems] = useState([]);
  const [ids, setIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setIds(new Set());
      setLoading(false);
      return;
    }
    try {
      const list = await fetchBookmarks(userId);
      setItems(list);
      setIds(new Set(list.map((item) => item.id)));
    } catch (error) {
      logger.error('ブックマークを読み込めませんでした', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const isBookmarked = useCallback((word) => {
    const id = bookmarkId(word);
    return Boolean(id && ids.has(id));
  }, [ids]);

  const toggle = useCallback(async (word) => {
    const id = bookmarkId(word);
    if (!userId || !id) return;

    const wasSaved = ids.has(id);

    // 先に見た目を変える
    setIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      if (wasSaved) {
        await removeBookmark(userId, id);
        setItems((prev) => prev.filter((item) => item.id !== id));
      } else {
        await addBookmark(userId, word);
        await reload();
      }
    } catch (error) {
      logger.error('ブックマークを更新できませんでした', error);
      // 失敗したら見た目を戻す。登録できていないのに星が付いたままにしない。
      setIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  }, [userId, ids, reload]);

  return { items, ids, loading, isBookmarked, toggle, reload };
};

export default useBookmarks;
