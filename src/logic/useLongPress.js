import { useCallback, useRef } from 'react';

/**
 * 長押し。指を置いたまま一定時間そのままなら発火する。
 *
 * 長押しのあとに click が来ると、押した先の動き（スラッシュ読みの訳を出す等）が
 * 一緒に走ってしまう。長押しが成立したら掛け金を立て、直後の click を1回だけ
 * 飲み込む。
 *
 * 触っている間に指が動いたら取り消す。一覧をスクロールしただけで登録されると、
 * 生徒は何が起きたのか分からない。
 */

const HOLD_MS = 450;
const MOVE_TOLERANCE = 12;

export const useLongPress = (onLongPress, { holdMs = HOLD_MS } = {}) => {
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }, []);

  const start = useCallback((event) => {
    const point = event.touches?.[0] || event;
    startRef.current = { x: point.clientX, y: point.clientY };
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, holdMs);
  }, [onLongPress, holdMs]);

  const move = useCallback((event) => {
    if (!startRef.current) return;
    const point = event.touches?.[0] || event;
    const moved = Math.abs(point.clientX - startRef.current.x)
      + Math.abs(point.clientY - startRef.current.y);
    if (moved > MOVE_TOLERANCE) clear();
  }, [clear]);

  return {
    handlers: {
      onTouchStart: start,
      onTouchMove: move,
      onTouchEnd: clear,
      onTouchCancel: clear,
      onMouseDown: start,
      onMouseMove: move,
      onMouseUp: clear,
      onMouseLeave: clear,
      // 長押しの直後の click は飲み込む
      onClickCapture: (event) => {
        if (!firedRef.current) return;
        firedRef.current = false;
        event.stopPropagation();
        event.preventDefault();
      },
    },
  };
};
