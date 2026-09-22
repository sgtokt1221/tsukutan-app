/**
 * **下タブの寸法を、受験サポートと同じに保つ。**
 *
 * つくつくと受験サポートは同じ塾の生徒が両方使う。**並べたときに片方だけ
 * 低いと、作りが雑に見える**（2026-09-22 の指摘）。
 *
 * ## 何が起きていたか
 *
 * 土台には安全領域の余白が書いてあったのに、**スマホ幅の上書きが消していた**。
 *
 * ```css
 * .tab-bar { padding: 0 0 env(safe-area-inset-bottom); }   ← 土台
 * @media (max-width: 480px) { .tab-bar { padding: 4px 0; } } ← 消える
 * ```
 *
 * ホーム操作バーのある端末では、その34pxぶんタブが下に潜り込む。
 * 高さの指定（58px）は合っていたのに**低く見えていた**のはこれ。
 *
 * 文字も 0.9rem → 0.8 → 0.75rem と幅ごとに縮めていた。
 * 受験サポートは**どの幅でも11px**なので、階段を作らない。
 *
 * ## ここで見るもの
 *
 * 実寸はブラウザでないと測れないので、**CSS の値そのものを固定する**。
 * 受験サポート側の数字は `tsukuba-manager/src/exam-support/student/TabBar.tsx`。
 */
const fs = require('fs');
const path = require('path');

const appCss = fs.readFileSync(path.join(__dirname, '../../App.css'), 'utf8');
const shellCss = fs.readFileSync(path.join(__dirname, 'StudentShell.css'), 'utf8');

/** 受験サポート側の実測値（向こうを変えたら、ここも一緒に直す） */
const EXAM_SUPPORT = {
  itemMinHeight: '58px',
  fontSize: '11px',
  iconSize: '21px',
  gap: '3px',
  contentBottom: '96px',
};

describe('下タブの寸法', () => {
  it('1つの高さが受験サポートと同じ', () => {
    expect(appCss).toContain(`min-height: ${EXAM_SUPPORT.itemMinHeight};`);
  });

  it('文字の大きさが受験サポートと同じ', () => {
    const at = appCss.indexOf('.tab-label {');
    expect(appCss.slice(at, at + 200)).toContain(`font-size: ${EXAM_SUPPORT.fontSize};`);
  });

  it('アイコンと縦の間隔が受験サポートと同じ', () => {
    expect(shellCss).toContain(`font-size: ${EXAM_SUPPORT.iconSize};`);
    expect(shellCss).toContain(`gap: ${EXAM_SUPPORT.gap};`);
  });

  /*
    **ここが今回の本体。** 安全領域を消す上書きを二度と書かない。
  */
  it('**安全領域の余白を、幅で上書きしない**（潜り込んで低く見える）', () => {
    expect(appCss).toContain('padding: 0 0 env(safe-area-inset-bottom, 0px);');
    // 画面幅ごとにタブバーの padding を書き換えない
    expect(appCss).not.toMatch(/@media[^{]*\{[^}]*\.tab-bar\s*\{[^}]*padding:\s*\d+px\s+0;/);
  });

  it('**幅ごとに文字を縮めない**（受験サポートは常に11px）', () => {
    expect(appCss).not.toContain('font-size: 0.8rem;\n  }');
    expect(appCss).not.toContain('font-size: 0.75rem;\n  }');
  });

  it('本文の下余白が、タブと安全領域のぶん空いている', () => {
    expect(appCss).toContain(`padding-bottom: ${EXAM_SUPPORT.contentBottom};`);
  });
});
