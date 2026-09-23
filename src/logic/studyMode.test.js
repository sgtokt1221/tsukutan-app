/**
 * 学習モードごとの決まり（2026-09-23）。
 *
 * 上スワイプ（外す）が全部のモードで効いていて、新規学習で指が上に流れただけで
 * まだ覚えていない語が消えていた。毎日みる単語では「リストから削除」と書いて
 * あるのに、語そのものを卒業させていた。
 */
import { studyModePolicy, sessionTitle } from './studyMode';

describe('上スワイプが効くモード', () => {
  it('**復習と自由学習だけ**', () => {
    expect(studyModePolicy('review').swipeUp).toBe(true);
    expect(studyModePolicy('free').swipeUp).toBe(true);
  });

  it('**今日の新規・おかわり・毎日みる単語では効かない**（誤って消さない）', () => {
    expect(studyModePolicy('daily').swipeUp).toBe(false);
    expect(studyModePolicy('extra').swipeUp).toBe(false);
    expect(studyModePolicy('bookmark').swipeUp).toBe(false);
  });

  it('知らないモードでは効かない（消える方に倒さない）', () => {
    expect(studyModePolicy(undefined).swipeUp).toBe(false);
    expect(studyModePolicy('???').swipeUp).toBe(false);
  });
});

describe('外すボタン', () => {
  it('**毎日みる単語では★を外すだけ**（覚えた記録にしない）', () => {
    const policy = studyModePolicy('bookmark');
    expect(policy.remove).toBe('unbookmark');
    expect(policy.removeLabel).toBe('覚えた（毎日みるから外す）');
  });

  it('**ほかは「もう覚えた」で言葉をそろえる**（新規と復習で違っていた）', () => {
    for (const mode of ['daily', 'extra', 'free', 'review']) {
      expect(studyModePolicy(mode).remove).toBe('graduate');
      expect(studyModePolicy(mode).removeLabel).toBe('もう覚えた');
    }
  });

  it('上スワイプが効くモードだけ、スワイプでも同じと書き添える', () => {
    expect(studyModePolicy('review').removeHint).toContain('スワイプ');
    expect(studyModePolicy('daily').removeHint).not.toContain('スワイプ');
  });
});

describe('見出し', () => {
  it('**いまどのモードかが分かる**（自由学習でも「新規学習」と出ていた）', () => {
    expect(sessionTitle('daily')).toBe('今日の新規');
    expect(sessionTitle('extra')).toBe('おかわり学習');
    expect(sessionTitle('bookmark')).toBe('毎日みる単語');
    expect(sessionTitle('review')).toBe('復習');
    expect(sessionTitle('free', { textbookId: 'ターゲット1900', filterValue: '1〜100' })).toBe('ターゲット1900 1〜100');
    expect(sessionTitle('free', {})).toBe('自由学習');
  });
});

/*
  **新規と復習の違いはこの表だけに置く**（2026-09-23 に部品を1つにまとめた）。
  部品の中に「復習なら」を散らさない。
*/
describe('新規と復習の違い', () => {
  it('復習：復習として数え、毎回混ぜ、復習の記録の形', () => {
    const p = studyModePolicy('review');
    expect(p).toMatchObject({ activity: 'review', shuffle: true, logSchema: 'review', storageKey: 'wordbook_progress_review' });
  });

  it('新規の4つ：新規として数え、教材の順のまま、学習の記録の形', () => {
    for (const mode of ['daily', 'extra', 'free', 'bookmark']) {
      expect(studyModePolicy(mode)).toMatchObject({ activity: 'new', shuffle: false, logSchema: 'learning', storageKey: 'wordbook_progress' });
    }
  });
});
