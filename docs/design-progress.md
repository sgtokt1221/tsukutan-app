# デザイン改善の進捗

`DESIGN_POLISH_PLAN.md` の工程ごとの記録。
機能側の進捗は `docs/progress.md`。

## 指標

`node scripts/audit-ui-inventory.js` と `node scripts/check-design-tokens.js` で計測する。

| 指標 | D0時点 | D1後 |
|---|---:|---:|
| 16進の色（画面CSS・種類） | 110 | 110 |
| 16進の色（画面CSS・出現） | 420 | 420 |
| rgba（種類） | 84 | 84 |
| border-radius の種類 | 22 | 22 |
| box-shadow の種類 | 45 | 45 |
| font-size の種類 | 39 | 39 |
| 複数CSSに重複するセレクタ | 44 | **41** |
| JSX内のインライン指定 | 196 | 196 |
| `window.innerWidth` による分岐 | 20 | 20 |
| `var()` を使わない border-radius | 136 | 136 |
| `var()` を使わない box-shadow | 53 | 53 |

D1はトークンの土台を敷く工程なので、置き換えの数字はまだ動いていない。
D2以降で画面ごとに減らしていく。

---

## D0: UIインベントリと基準（部分完了）

### 実施

`scripts/audit-ui-inventory.js` を追加し、計画書3章の所見を数値で裏づけた。

- **P0-1（スタイルの責任範囲が重複）**: 複数CSSファイルに同じセレクタが **44件**。
  `.message-box` `.dashboard-header` `.logout-btn` `.admin-layout` など。
  JSX内のインライン指定は **196箇所**（`StudentDashboard` 67 / `LearningFlashcard` 49 / `ReviewFlashcard` 44）。
- **P1-2（文字スケールがない）**: `font-size` が **39種類**。
- **P1-3（グレーと角丸の種類が多い）**: 16進の色 **110種類**、`border-radius` **22種類**、`box-shadow` **45種類**。
  うち **31種類が青系の色相**（Slate系グレー `#64748b` `#e2e8f0` `#94a3b8` など）で、
  計画書の「Slate、Gray、Bootstrap系のグレーが混在」を裏づけた。
- **13.2（`window.innerWidth` による描画分岐の廃止）**: **20箇所**、すべて
  `LearningFlashcard.js` / `ReviewFlashcard.js`。

### 未実施

**主要画面の基準スクリーンショットが揃っていない。**
生徒アカウント・管理者アカウントでログインできないため、
撮れているのはログイン画面（390 / 768 / 1440）だけ。
生徒ダッシュボード、学習画面、単語力チェック、結果、ストーリー、
管理画面はいずれも未取得。**D2以降の受け入れ判定に影響する。**

---

## D1: トークンと共通プリミティブ（完了）

### 追加したもの

| ファイル | 内容 |
|---|---|
| `src/styles/tokens.css` | 計画書5〜10章のトークン（色・文字・余白・角丸・影・動き） |
| `src/styles/primitives.css` | 計画書11章の共通部品の状態定義 |
| `scripts/check-design-tokens.js` | 色相固定の機械チェック |

`src/index.css` は reset と body の基礎だけに絞り、トークンとプリミティブを読み込む。

### 色相固定の担保

計画書18章の「色相固定は全フェーズのレビュー条件とする」を機械化した。

```
OK --color-brand-lime     #a3e635  色相 84°
OK --color-canvas-lime    #f7fee7  色相 79°
OK --color-ink-olive      #36421e  色相 80°
OK --color-accent-blue    #3b82f6  色相 217°
OK --color-surface        #ffffff  色相 0°
```

`node scripts/check-design-tokens.js` は基準色が変わると exit 1 になる。
併せて、画面CSSに残る生の色・角丸・影の数を出すので、
工程ごとに減っていることを確認できる。

### 共通部品

既存のクラス名（`.primary-action` `.ghost-button` `.goal-chip` `.message-box` など）に対して
状態を一括定義した。新しいクラス名を増やしていない。

- Primary / Secondary / Ghost / Danger の4段階。hover は2px浮上、active は `scale(0.98)`
- 全ボタンに `min-height: 44px`
- 選択状態は `aria-pressed="true"` に境界・背景・チェック・太字を併用（色だけに依存しない）
- `prefers-reduced-motion: reduce` で装飾的な中間演出を停止

**`.message-box` の重複を解消した。** `App.css` は角丸12px、`AdminDashboard.css` は4px と
画面ごとに違っていたものを `--radius-control`（10px）へ一本化。
重複セレクタは 44 → 41 件。

### 確認

ログイン画面を 390 / 1440 で再確認。横スクロールなし、カード幅 342 / 420px、
コンソールエラーなし。テスト140件通過。

---

## 未着手

| 工程 | 内容 |
|---|---|
| D2 | 認証・目標・生徒ホーム |
| D3 | 学習・診断・結果 |
| D4 | 管理画面 |
| D5 | アクセシビリティ・Motion・最終統合 |

D2以降は画面の実表示を見ながらでないと judgement が効かない。
**生徒・管理者でログインできる状態が前提になる。**
