import { THEMES, buildThemeGroups, themeLabels, themeDescriptions, themesForWord } from './themeMatcher';

describe('themes.json の整合性', () => {
  test('idが重複していない', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('全テーマに表示用の項目とキーワードが揃っている', () => {
    for (const theme of THEMES) {
      expect(typeof theme.label).toBe('string');
      expect(theme.label.length).toBeGreaterThan(0);
      expect(typeof theme.description).toBe('string');
      expect(theme.en.length).toBeGreaterThan(0);
      expect(theme.ja.length).toBeGreaterThan(0);
    }
  });

  test('英語のキーワードは小文字の英字だけ', () => {
    for (const theme of THEMES) {
      for (const term of theme.en) {
        expect(term).toMatch(/^[a-z][a-z' ]*$/);
      }
    }
  });

  test('ラベルと説明が全テーマぶん引ける', () => {
    for (const theme of THEMES) {
      expect(themeLabels[theme.id]).toBe(theme.label);
      expect(themeDescriptions[theme.id]).toBe(theme.description);
    }
  });
});

describe('themesForWord', () => {
  test('英語は語として一致させる', () => {
    expect(themesForWord({ word: 'go', meaning: '行く' })).toContain('movement');
  });

  test('部分一致で拾わない', () => {
    // 'go' を部分一致にすると ago / algorithm / good が「移動」に入っていた
    for (const word of ['ago', 'algorithm', 'good']) {
      expect(themesForWord({ word, meaning: '' })).not.toContain('movement');
    }
  });

  test('活用形も原形として拾う', () => {
    expect(themesForWord({ word: 'running', meaning: '' })).toContain('movement');
    expect(themesForWord({ word: 'studied', meaning: '' })).toContain('learning');
    expect(themesForWord({ word: 'makes', meaning: '' })).toContain('making');
  });

  test('熟語は語ごとに見る', () => {
    expect(themesForWord({ word: 'look up to', meaning: '' })).toContain('seeing');
  });

  test('日本語の意味からも拾う', () => {
    expect(themesForWord({ word: 'glance', meaning: 'ちらっと見る' })).toContain('seeing');
    expect(themesForWord({ word: 'wallet', meaning: '財布；お金を入れるもの' })).toContain('work');
  });

  test('どこにも当たらない語は空', () => {
    expect(themesForWord({ word: 'zzz', meaning: 'ののの' })).toEqual([]);
    expect(themesForWord(null)).toEqual([]);
  });
});

describe('buildThemeGroups', () => {
  test('同じ単語を二重に入れない', () => {
    const word = { id: 'w_1', word: 'see', meaning: '見る' };
    const groups = buildThemeGroups([word, word]);
    expect(groups.seeing.words).toHaveLength(1);
  });

  test('配列でなければ空', () => {
    expect(buildThemeGroups(null)).toEqual({});
    expect(buildThemeGroups(undefined)).toEqual({});
  });

  test('実データで全テーマに単語が入る', () => {
    // 単語が0件のテーマを出すと、選んでも何も学べない画面になる
    const master = require('../../public/data/words-master.json');
    const groups = buildThemeGroups(master);
    const empty = THEMES.filter((t) => !groups[t.id] || groups[t.id].words.length < 20);
    expect(empty.map((t) => t.id)).toEqual([]);
  });

  test('実データのカバー率が以前の実装より高い', () => {
    // 以前は5テーマ・部分一致で 515語 しか入らなかった
    const master = require('../../public/data/words-master.json');
    const groups = buildThemeGroups(master);
    const covered = new Set();
    for (const group of Object.values(groups)) {
      for (const word of group.words) covered.add(word.word);
    }
    expect(covered.size).toBeGreaterThan(1500);
  });
});
