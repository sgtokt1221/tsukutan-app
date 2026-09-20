/**
 * つくばホームのアカウントで、つくつくの中から入るところ。
 *
 * **PWA の中では `#token=` が届かない**（ホーム画面のアプリは Safari と保存領域が別）。
 * ここが唯一の入口になるので、壊れると生徒はアプリを開けても何もできない。
 */
import { signInEmailsFor, isWrongCredential, DEFAULT_SCHOOLS } from './tsukubaSignIn';

const IDS = DEFAULT_SCHOOLS.map((s) => s.id);

describe('試すアドレス', () => {
  it('**生徒本人は頭に `s` が付く**（保護者のアドレスと衝突させない）', () => {
    expect(signInEmailsFor('1203', 'makami')).toEqual(['s1203@makami.com']);
  });

  it('`s` を付けて打たれても同じ', () => {
    expect(signInEmailsFor('s1203', 'makami')).toEqual(signInEmailsFor('1203', 'makami'));
  });

  /*
    **選んだ校舎だけを試す。** 生徒番号は校舎間で重複していて、初期パスワードは
    番号から決まる。他校舎へ落ちると、校舎を選び間違えた生徒が別人の口座に入れる
    （2026-09-20 に本番で確認。`s1335@makami.com` と `s1335@hokkan.com` は別人で、
    どちらも同じパスワードで通った）。
  */
  it('**他の校舎へ落ちない**', () => {
    const list = signInEmailsFor('1335', 'makami');
    expect(list).toHaveLength(1);
    expect(list).not.toContain('s1335@hokkan.com');
  });

  it('校舎が無ければ何も試さない', () => {
    expect(signInEmailsFor('1203', '')).toEqual([]);
  });

  it('数字でなければ何も試さない', () => {
    for (const bad of ['', '  ', 'abc', '12a', '1203@makami.com']) {
      expect(signInEmailsFor(bad, 'makami')).toEqual([]);
    }
  });
});

describe('失敗の伝え方', () => {
  it('**合言葉違いのときだけ「違います」と言う**', () => {
    expect(isWrongCredential('auth/invalid-credential')).toBe(true);
    expect(isWrongCredential('auth/user-not-found')).toBe(true);
    expect(isWrongCredential('auth/invalid-login-credentials')).toBe(true);
  });

  it('**締め出しや通信の不調を「違います」と言わない。** 打ち直させると本当に閉め出される', () => {
    for (const code of ['auth/too-many-requests', 'auth/network-request-failed', 'auth/user-disabled', '']) {
      expect(isWrongCredential(code)).toBe(false);
    }
  });
});

describe('校舎の既定', () => {
  it('**4校を落とさない。** マスタが読めなくても自分の校舎を選べるように', () => {
    expect(IDS).toEqual(['makami', 'hokkan', 'okanmuri', 'highschool']);
    for (const s of DEFAULT_SCHOOLS) expect(s.name).not.toBe('');
  });
});
