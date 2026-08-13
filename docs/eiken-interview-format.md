# 英検二次試験（面接）対策モード — 素材の作り方

問題を書く人（＝先生）が、この形に沿って書けばそのまま動く、という取り決め。
実装側（画面・音声生成）はこの形を正本にする。

## 0. はじめに2つだけ

**過去問はそのまま使えない。** 英検の問題は日本英語検定協会に、市販の問題集は
各出版社に著作権がある。ここで作るのは「本番と同じ形式の、こちらで書き下ろした
オリジナル」。形式（構成・設問の種類・時間配分）に著作権は及ばないので、そこは
本番に揃えてよい。

**形式は公式サイトで確認済み**（2026-08-13 時点、eiken.or.jp の各級「試験内容」ページ）。
改定されることがあるので、年度が変わったら見直すこと。

- [3級](https://www.eiken.or.jp/eiken/exam/grade_3/solutions.html)
- [準2級](https://www.eiken.or.jp/eiken/exam/grade_p2/solutions.html)
- [2級](https://www.eiken.or.jp/eiken/exam/grade_2/solutions.html)
- [準1級](https://www.eiken.or.jp/eiken/exam/grade_p1/solutions.html)

**1級は対象外。**（2026-08-13 の判断）

---

## 1. 級ごとの形式

| | 3級 | 準2級 | 2級 | 準1級 |
|---|---|---|---|---|
| 面接時間 | 約5分 | 約6分 | 約7分 | 約8分 |
| パッセージ | 30語程度 | 50語程度 | 60語程度 | なし |
| 音読 | あり | あり | あり | **なし** |
| イラスト | 1枚 | 2枚（A・B） | 3コマ | 4コマ |
| 設問数 | 4問（音読を除く） | 5問（音読を除く） | 4問（音読を除く） | 4問 |
| 自由会話 | なし | なし | なし | **あり**（冒頭） |

出典は各級の「試験内容」ページ（上記リンク）。問題数は公式表の「問題数」欄に
合わせてある。準2級だけ公式表は音読を含めて計6問と書かれている。

### 3級
1. 音読（30語程度）
2. No.1 パッセージについて
3. No.2 イラスト：**これから何をするか**（吹き出しで示される）
4. No.3 イラスト：**数を数える**（"How many …?"）
5. No.4・No.5 受験者自身のこと（カードを裏返す）。**No.5 は Yes/No で分岐**

### 準2級
1. 音読（50語程度）
2. No.1 パッセージについて
3. No.2 イラストA：**5人が何をしているか、言えるだけ言う**
4. No.3 イラストB：**1人の状況を説明**（やりたいのにできない構図）
5. No.4 カードのトピックに関連した質問（カードを裏返す）。**Yes/No で分岐**
6. No.5 日常生活の身近な事柄についての質問。**Yes/No で分岐**

### 2級
1. 音読（60語程度）
2. No.1 パッセージについて（"According to the passage, …"）
3. No.2 **3コマのナレーション**。20秒準備、カードの書き出しから始める
4. No.3 "Some people say that … What do you think about that?"（カードを裏返す）
5. No.4 社会の動きについて。**Yes/No で分岐**（Why? / Why not?）

### 準1級
0. **自由会話** — 面接委員と簡単な日常会話（公式表に項目として載っている）
1. **ナレーション** — 4コマの展開を説明。準備1分、話すのは**2分間**。
   カードに「どんな話か」の一文と書き出しの文が書かれている
2. No.1 **4コマ目の人物になったつもりで**（"If you were the woman, what would you be thinking?"）
3. No.2・No.3 カードの話題に関連した質問（カードを裏返す）
4. No.4 社会・政策についての質問

音読は無い。準1級だけ Yes/No 分岐は無く、いきなり意見を述べる。

---

## 2. データの形

`public/eiken-interview/{級}/{id}.json`。1ファイル＝1つの問題カード。

```jsonc
{
  "id": "eiken3-001",
  "grade": "3",                    // "3" | "pre2" | "2" | "pre1"
  "title": "Online Shopping",      // 一覧に出す見出し。生徒には出さない

  // 音読のあるカードだけ
  "passage": {
    "text": "Many people enjoy shopping on the Internet today. ...",
    "wordCount": 32                // 目安の確認用。3級30/準2級50/2級60
  },

  // イラスト
  "illustrations": [
    {
      "id": "a",                   // 3級は "a" のみ。準2級は "a","b"。2級は "1","2","3"。準1級は "1"〜"4"
      "prompt": "…",               // 生成用のプロンプト（下の§4）
      "caption": "駅で電車を待つ人々",  // 先生用のメモ。生徒には出さない
      "file": "eiken3-001-a.webp"   // 生成後に埋める
    }
  ],

  // ナレーションのある級（2級・準1級）だけ
  "narration": {
    "openingSentence": "One day, Mr. and Mrs. Sato were talking about their summer vacation.",
    "prepareSeconds": 20,          // 2級20 / 準1級60
    "speakSeconds": null           // 準1級は120。2級は指定なしなら null
  },

  "questions": [
    {
      "no": 1,
      "type": "passage",           // passage | illustration | narration | roleplay | opinion | personal
      "cardVisible": true,         // false ならカードを裏返して答える設問
      "prompt": "Please look at the passage. Why do many people enjoy shopping on the Internet?",
      "modelAnswer": "Because they can buy things without going to a store.",
      "answerSeconds": 20,         // 目安。無ければ null

      // Yes/No で追い質問が来る設問だけ。3級No.5・準2級No.4/5・2級No.4 が該当
      "followUp": {
        "yes": { "prompt": "Why?",     "modelAnswer": "…" },
        "no":  { "prompt": "Why not?", "modelAnswer": "…" }
      }
    }
  ]
}
```

### 面接官の固定セリフ（入室〜退室）

**二次試験は入室から退室までが試験。** 問題カードのやりとりだけを練習しても
本番にならないので、挨拶・名前の確認・カードの受け渡し・退室まで通しで持つ。

カードごとに書かない。級ごとに1本、`public/eiken-interview/interviewer-{級}.json`
に置いて全カードで使い回す。4級ぶん（`interviewer-3` / `-pre2` / `-2` / `-pre1`）作成済み。
下の表は3級。他の級は級名が変わり、準2級以降は「カードを裏返す」が入り、
準1級は音読が無く冒頭に自由会話が入る。

| # | 場面 | 面接委員 | 受験者 |
|---|---|---|---|
| ① | 入室 | Hello. / Good morning. | Hello. |
| ① | | Can I have your card, please? | Here you are. |
| ① | 着席 | Please sit down. | Thank you. |
| ② | 名前 | May I have your name, please? | My name is 〜. |
| ② | 級の確認 | Mr. / Ms. 〜, this is the third grade test, OK? | OK. |
| ② | | How are you? | I'm fine, thank you. |
| ③ | カード受取 | This is your card. | Thank you. |
| ③ | 黙読20秒 | Please read the passage silently for 20 seconds. | （黙読） |
| ④ | 音読 | Now, please read it aloud. | （音読） |
| ⑤ | 質問 | Now, I'll ask you five questions. | |
| ⑥ | カード返却 | May I have your card back, please? | Here you are. |
| ⑥ | 退室 | You may go now. | Thank you very much. Goodbye. |

級の確認は本番では名前が入る。名前は生徒ごとに違うので、音声は名前を
省いた「This is the third grade test, OK?」で作り、画面には名前入りの
全文を出す（`fullForm`）。

聞き取れなかったときは **I beg your pardon?** で聞き返せる。ただし繰り返しは
減点対象。この一言も練習に含める。

#### 級ごとの追加セリフ

```jsonc
{
  "pre2": {
    "describeA": "Now, please look at the picture and describe the situation. You have twenty seconds.",
    "turnOver": "Now, Mr./Ms. ... , please turn over the card and put it down."
  },
  "2": {
    "narration": "Now, please look at the three pictures. I'd like you to describe the situation. You have twenty seconds to prepare. Your story should begin with this sentence: ...",
    "turnOver": "Now, Mr./Ms. ... , please turn over the card and put it down."
  },
  "pre1": {
    "smallTalk": "How did you get here today?",
    "narration": "Now, please look at the four pictures. I'd like you to narrate the story. You have one minute to prepare. Your story should begin with this sentence: ..."
  }
}
```

---

## 3. 級ごとの英語のレベル

公式サンプルから読み取った、級ごとの手加減。**ここを外すと練習にならない。**

| | 3級 | 準2級 | 2級 | 準1級 |
|---|---|---|---|---|
| パッセージの文数 | 3文 | 4文 | 5〜6文 | なし |
| 1文の長さ | 10〜18語 | 15〜20語 | 18〜25語 | — |
| 時制 | 現在形が主 | 現在形＋現在完了 | 受動態・関係詞・不定詞 | — |
| 語彙 | 中学範囲 | 高校基礎 | 抽象名詞が入る | 社会・時事 |
| 話題 | 身のまわり | 生活に関わる社会 | 社会の仕組み | 政策・社会問題 |
| No.1 の聞き方 | "What can people learn ...?" | "According to the passage, how ...?" | "According to the passage, how ...?" | （パッセージなし） |
| 最後の設問 | 受験者自身のこと | 意見（Yes/No分岐） | 社会的な話題への賛否 | 政策への意見 |

**具体的にどう違うか。** 公式サンプルの書き出しを読み比べると分かりやすい。

- 3級「There are many kinds of radio programs.」— 主語＋動詞。修飾が少ない
- 準2級「These days, recycling is becoming common in people's daily lives.」—
  副詞句で始まり、進行形＋形容詞
- 2級「It can be troublesome for parents with young children to go shopping in
  crowded places.」— 形式主語 it、to不定詞、後置修飾が重なる

**設問の抽象度も上がる。** 準1級の最後は「世論は政府の決定に影響を与えられるか」。
2級は「中古品はこれから普及するか」。準2級は「新聞をよく読むか」。3級は
「週末は何をするのが好きか」。**同じ話題を難しく言い換えるのではなく、
話題そのものの射程が変わる。**

### パッセージに入れる決まり文句

**No.1 の答えは、決まり文句の直前の文から作る。** 公式サンプル3本とも例外なく
この作りだった。ここを外すと No.1 が答えられない問題になる。

| 級 | パッセージに置く型 | No.1 の聞き方 | 答えの形 |
|---|---|---|---|
| 3級 | `…, so + 結果` | "What can …?" / "Why …?" | 直前の節をそのまま |
| 準2級 | `…, and in this way, they + 結果` | "According to the passage, how do …?" | **"By 〜ing …"** |
| 2級 | `In this way, they + 結果` / `For this reason, …` | "According to the passage, how do …?" | **"By 〜ing …"** |

**仕組み**

```
（前の文）  ← ここが答えの中身
In this way, they + 結果      ← ここを質問文がそのまま借りる
```

準2級のサンプルなら「recycled paper で作られた製品を使う」→「in this way, 環境を
よくしようとしている」。No.1 は後半をそのまま借りて "how do many families try to
make the environment better?" と聞き、答えは前半を By 〜ing にした
"By using products made from recycled paper."

**書くときの手順**

1. 結果の文を先に決める（「〜しようとしている」「〜が楽になる」）
2. その手段を前の文に書く
3. 2つを `in this way` / `so` / `for this reason` でつなぐ
4. 結果の文をほぼそのまま疑問文にして No.1 にする

**使える決まり文句**（サンプルで確認できたもの、および同型のもの）

- `so` — 3級。因果を一番やさしくつなぐ
- `in this way` — 準2級・2級。**手段 → 結果**。By 〜ing で答えさせたいときはこれ
- `for this reason` — 2級。**理由 → 対応**。「だから〜するようになった」
- `as a result` — 2級。結果を強調する
- `by doing so` — 2級。in this way とほぼ同じ働き
- `however` — 2級以上。逆接。No.3/No.4 の意見設問につなげる伏線に使える

**注意** — 答えでは代名詞を名詞に戻す。パッセージが `they` でも、模範解答は
"some customers with children" のように具体名詞で始まる。質問文を作るときに
`they` が誰を指すかが一意に決まるようにしておくこと。

### 全級に共通する仕掛け

**Yes/No で分岐して追い質問が来る。** 3級のNo.5、準2級のNo.4・No.5、2級のNo.4 が
これ。スキーマの `followUp` はここで要る。

| 答え | 追い質問 |
|---|---|
| Yes | "Why?" / "Please tell me more." |
| No | "Why not?" |

**カードを裏返す合図**は準2級以降。「Now, Mr./Ms. —, please turn over the card
and put it down.」以降の設問は、カードを見ずに答える。**3級には無い**（最後まで
カードを持ったまま答える）。

### 実例

**以下はこちらで書き下ろした見本。** 公式サンプルは形式の参考にしただけで、
英文も絵も流用していない。

```jsonc
{
  "id": "eiken3-001",
  "grade": "3",
  "title": "Morning Radio",
  "passage": {
    "text": "Many people listen to the radio in the morning. They can hear the news and the weather while they eat breakfast. The radio tells them about traffic and trains, so it helps them get to work on time.",
    "wordCount": 38
  },
  "illustrations": [
    { "id": "a", "prompt": "§4-3級 を参照",
      "caption": "朝の居間。母が食事を並べ、娘が食べ、父は新聞を持って立っている（吹き出しで座って読む姿）。机にカップ2つ" }
  ],
  "questions": [
    { "no": 1, "type": "passage", "cardVisible": true,
      "prompt": "Please look at the passage. How does the radio help people get to work on time?",
      "modelAnswer": "It tells them about traffic and trains." },
    { "no": 2, "type": "illustration", "cardVisible": true,
      "prompt": "Please look at the picture. What is the man going to do?",
      "modelAnswer": "He's going to read a newspaper." },
    { "no": 3, "type": "illustration", "cardVisible": true,
      "prompt": "How many cups are there on the table?",
      "modelAnswer": "There are two cups." },
    { "no": 4, "type": "personal", "cardVisible": false,
      "prompt": "What do you usually do before breakfast?",
      "modelAnswer": "I usually wash my face and change my clothes." },
    { "no": 5, "type": "personal", "cardVisible": false,
      "prompt": "Do you often listen to music?",
      "followUp": {
        "yes": { "prompt": "Please tell me more.", "modelAnswer": "I listen to music on my phone every day. I like Japanese pop songs." },
        "no":  { "prompt": "Why not?", "modelAnswer": "I don't have much free time. I usually study after school." }
      } }
  ]
}
```

2級・準2級・準1級も同じ形。準1級は `passage` を持たず、`illustrations` が4枚、
`narration.prepareSeconds` が 60、`speakSeconds` が 120。

---

## 4. イラストのプロンプト

**公式サンプルを見て全面的に書き直した。** 最初に推測で書いた「白黒の線画・文字を
入れない」は**全部間違い**だった。実物は次のようになっている。

- **カラー**。水彩・色鉛筆のような柔らかい塗り。輪郭線は細く均一
- **吹き出しを使う**。3級から使われている。セリフ（角の尖った吹き出し）と
  思考・想像（雲形の吹き出し）の2種類
- **絵の中に英語の文字が入る**。2級・準1級はコマの間に「Ten minutes later」
  「The next week」などの経過ラベル、看板やポスターの文字も読ませる
- **斜線（禁止・不可の印）** を使う。準2級サンプルでは、自販機の前に自転車が
  停まっていて飲み物を買えない、という状況を斜線で示していた
- 日本の日常風景。人物は年齢・服装で描き分ける

参照した公式サンプル（いずれも「無断転載・複製を禁じます © 公益財団法人 日本英語検定協会」。
**形式の参考にするだけで、絵も英文もそのまま使わない**）
- [3級](https://www.eiken.or.jp/eiken/exam/virtual/grade_3/pdf/grade_3.pdf) — Listening to the Radio
- [準2級](https://www.eiken.or.jp/eiken/exam/virtual/grade_p2/pdf/grade_p2.pdf) — Recycling
- [2級](https://www.eiken.or.jp/eiken/exam/virtual/grade_2/pdf/grade_2.pdf) — A New Service for Parents
- [準1級](https://www.eiken.or.jp/eiken/exam/virtual/grade_p1/pdf/grade_p1.pdf) — 路上喫煙の話

### 共通（全級の頭に付ける）

```
Soft watercolor and colored-pencil illustration in the style of a Japanese
English proficiency test picture card. Thin even outlines, gentle pastel
colors, flat lighting, no heavy shadows. An ordinary everyday scene in
Japan. Full bodies visible, nothing cropped at the edges. Simple friendly
faces. Each person must be told apart by hair, age and clothing.
Every action must be unmistakable at a glance.
```

### 3級 — 1枚

設問は「これから何をするか（吹き出し）」と「数を数える」。**その2つが絵から
読み取れないと問題が成立しない。**

```
One indoor scene with three or four people, each doing a clearly different
action. One person has a cloud-shaped thought bubble showing what they are
about to do next. Include several identical countable objects (cups,
books, boxes) placed in plain view so that a "How many ...?" question has
one correct answer.

Scene: <例: A family in a living room in the morning. A mother is putting
food on the table. A girl is sitting and eating. A father is standing with
a newspaper, and his thought bubble shows him sitting in a chair reading
it. Two cups are on the table.>
```

### 準2級 — 2枚

**Picture A**（No.2「それぞれ何をしているか、言えるだけ言う」）。模範解答が5つ
挙がっていたので、**動作は5つ**用意する。

```
One outdoor scene with exactly five people, spread apart so none overlap.
Each person performs a completely different, easily named action.
No thought bubbles.

Scene: <例: A street on a clean-up day. A man is putting a box of bottles
into a truck. A woman is planting flowers. A woman is walking her dog.
A man is painting a wall. A boy is riding a bicycle.>
```

**Picture B**（No.3「状況を説明する」）。**やりたいのにできない**構図にする。
理由が同じ絵の中に見えていること。

```
One scene focused on a single person who wants to do something but cannot.
The obstacle is visible in the same frame. The person has a cloud-shaped
thought bubble showing what they want to do, with a red diagonal line
across the bubble to show it is not possible.

Scene: <例: A girl standing in front of a vending machine. Many bicycles
are parked in front of the machine so she cannot reach it. Her thought
bubble shows her holding a drink, crossed out.>
```

### 2級 — 3コマ

```
A three-panel colored illustration in one horizontal row, thin borders
between panels. The same characters appear in all three panels and must be
recognizable (same hair, same clothes). Between the panels, place a small
arrow with a short English time label such as "Ten minutes later" or
"Two hours later at the gift shop". Panel 1 has a speech bubble with one
short line of dialogue. One later panel has a cloud-shaped thought bubble
showing a worry or a wish.
Panel 1: <…>
Panel 2: <…>
Panel 3: <…>
```

経過ラベルと吹き出しの文字は**ナレーションで使わせるための材料**なので、必ず
読める大きさで入れる。生成AIが英単語を崩したら、その部分だけ後から画像編集で
差し替える。

### 準1級 — 4コマ

```
A four-panel colored illustration in one horizontal row, numbered 1 to 4
below the panels, thin borders between panels. The same main character
appears in every panel. Above or between panels, place short English time
labels such as "The next week", "Six months later", "A few days later".
Include readable signs, posters or notices inside the scenes when they
carry the story. Panel 4 must show the main character reacting to an
unexpected result, so that "If you were her, what would you be thinking?"
has an answer.
Panel 1: <…>
Panel 2: <…>
Panel 3: <…>
Panel 4: <…>
```

準1級のサンプルは「問題を解決しようと動いた結果、別の問題が起きた」という
**皮肉のある落ち**だった。No.1 が「4コマ目の人物になったつもりで」なので、
4コマ目に**割り切れなさ**が要る。単純なハッピーエンドにしない。

### 生成したあと

- **設問に答えられるかを自分で確かめる。**「What is she doing?」に答えられない絵、
  数が数えられない絵は作り直し
- 生成AIは物の数と指の本数を間違える。数を聞く設問では必ず数える
- 英語の文字は崩れる。看板・経過ラベルは読めるか確認し、駄目なら後から重ねる
- 生成物は `public/eiken/{id}-{illustrationId}.webp`

## 5. 音声にするもの

事前生成（`scripts/build-audio.js` と同じ仕組み）でまかなえる。

`scripts/build-audio.js` が `public/eiken-interview/` を読んで作る。

```bash
node scripts/build-audio.js --source interview --dry-run   # 件数と費用
node scripts/build-audio.js --source interview             # 作る
```

| 対象 | 声 |
|---|---|
| 面接委員のセリフ（入室〜退室） | 英語 |
| 受験者の応答例（Here you are. など） | 英語 |
| 各設問の prompt / followUp の prompt | 英語 |
| パッセージ（模範の音読） | 英語 |
| modelAnswer | 英語 |
| narration.openingSentence | 英語 |

面接は全編英語なので、日本語の音声は作らない（注釈は画面で読む）。
`My name is ...` のような雛形は尻切れになるので音声化から除く。

**4級 × 5カードの実測: 212クリップ / 20,992文字 / WaveNet で $0.34。**
単語の29,220クリップに比べれば誤差の範囲。

生徒の発話は録音して聞き返せるようにする。採点まで踏み込むなら Azure の
Pronunciation Assessment（音読と相性が良い）。

---

## 6. 作る順番の提案

1. **3級を5カード**。イラスト1枚だけなので、絵の作り方の勘所がつかめる
2. 画面を作る（音読 → 設問 → 録音 → 聞き返す）
3. 2級・準2級（コマ割りの絵が要る）
4. 準1級

3級5カードぶんの素材ができた時点で、画面の作りが妥当かを一度見てもらうのが早い。
