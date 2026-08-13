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
1. 音読
2. No.1 パッセージについて
3. No.2 イラスト：数や物の状況（"How many …?" など）
4. No.3 イラスト：人物の動作（"What is the man doing?"）
5. No.4・No.5 受験者自身のこと（カードを裏返す）

### 準2級
1. 音読（50語程度）
2. No.1 パッセージについて
3. No.2 イラストA：**人物の行動を描写**
4. No.3 イラストB：**人物の状況を説明**
5. No.4 カードのトピックに関連した質問（カードを裏返す）
6. No.5 日常生活の身近な事柄についての質問

### 2級
1. 音読（60語程度）
2. No.1 パッセージについて
3. No.2 **3コマのイラストの展開を説明**
4. No.3 ある事象・意見について自分の意見を述べる（カードを裏返す）
5. No.4 日常生活の一般的な事柄に関する自分の意見を述べる

### 準1級
0. **自由会話** — 面接委員と簡単な日常会話（公式表に項目として載っている）
1. **ナレーション** — 4コマのイラストの展開を説明。準備1分、話すのは**2分間**
2. No.1 イラストに関連した質問
3. No.2・No.3 カードのトピックに関連した質問（カードを裏返す）
4. No.4 やや関連した、社会性のある内容についての質問

音読は無い。

---

## 2. データの形

`content/eiken-interview/{級}/{id}.json`。1ファイル＝1つの問題カード。

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
      "file": "eiken3-001-a.png"   // 生成後に埋める
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
      "answerSeconds": 20          // 目安。無ければ null
    }
  ]
}
```

### 面接官の固定セリフ

カードごとに書かなくてよい。級ごとに1回だけ決めて、全カードで使い回す。
`content/eiken-interview/interviewer.json` に置く。

```jsonc
{
  "common": {
    "greeting": "Hello. May I have your card, please?",
    "askName": "My name is ... . May I have your name, please?",
    "silentRead": "Now, let's begin the test. Please read the passage silently for twenty seconds.",
    "readAloud": "Now, please read it aloud.",
    "turnOver": "Now, Mr./Ms. ... , please turn over the card and put it down.",
    "finish": "This is the end of the test. Could I have the card back, please?"
  },
  "pre2": {
    "describeA": "Now, please look at the picture and describe the situation. You have twenty seconds."
  },
  "2": {
    "narration": "Now, please look at the three pictures. I'd like you to describe the situation. You have twenty seconds to prepare. Your story should begin with this sentence: ..."
  },
  "pre1": {
    "smallTalk": "How did you get here today?",
    "narration": "Now, please look at the four pictures. I'd like you to narrate the story. You have one minute to prepare. Your story should begin with this sentence: ..."
  }
}
```

---

## 3. 級ごとの実例

**以下は形式を示すためにこちらで書いた見本。** 中身は差し替える前提。

### 3級 — eiken3-001

```jsonc
{
  "id": "eiken3-001",
  "grade": "3",
  "title": "Online Shopping",
  "passage": {
    "text": "Many people enjoy shopping on the Internet. They can buy things at any time, and the things come to their homes. Some people say it is easier than going to a store.",
    "wordCount": 33
  },
  "illustrations": [{ "id": "a", "prompt": "§4-3級 を参照", "caption": "リビングで買い物をする女性と、荷物を運ぶ配達員" }],
  "questions": [
    { "no": 1, "type": "passage", "cardVisible": true,
      "prompt": "Please look at the passage. Why do some people say Internet shopping is easier?",
      "modelAnswer": "Because they can buy things at any time and the things come to their homes." },
    { "no": 2, "type": "illustration", "cardVisible": true,
      "prompt": "Please look at the picture. How many boxes are there on the floor?",
      "modelAnswer": "There are three boxes." },
    { "no": 3, "type": "illustration", "cardVisible": true,
      "prompt": "Please look at the woman with long hair. What is she doing?",
      "modelAnswer": "She's looking at a computer." },
    { "no": 4, "type": "personal", "cardVisible": false,
      "prompt": "Do you often buy things on the Internet?",
      "modelAnswer": "Yes, I do. / No, I don't." },
    { "no": 5, "type": "personal", "cardVisible": false,
      "prompt": "What do you like to do on weekends?",
      "modelAnswer": "I like to play soccer with my friends." }
  ]
}
```

### 2級 — eiken2-001（3コマのナレーション）

```jsonc
{
  "id": "eiken2-001",
  "grade": "2",
  "title": "The Crowded Bus",
  "passage": {
    "text": "Many cities in Japan have problems with crowded buses in the morning. Some city governments have started new services to solve this. They hope that these services will make people's lives more comfortable.",
    "wordCount": 34
  },
  "illustrations": [
    { "id": "1", "prompt": "§4-2級 コマ1", "caption": "満員のバス停で困る会社員" },
    { "id": "2", "prompt": "§4-2級 コマ2", "caption": "市役所の職員が新しいバス路線の案内を貼る" },
    { "id": "3", "prompt": "§4-2級 コマ3", "caption": "空いたバスに座って新聞を読む会社員" }
  ],
  "narration": { "openingSentence": "One morning, Mr. Tanaka was waiting for a bus.", "prepareSeconds": 20, "speakSeconds": null },
  "questions": [
    { "no": 1, "type": "passage", "cardVisible": true,
      "prompt": "According to the passage, why have some city governments started new services?",
      "modelAnswer": "Because they hope that these services will make people's lives more comfortable." },
    { "no": 2, "type": "narration", "cardVisible": true,
      "prompt": "Now, please look at the three pictures and describe the situation.",
      "modelAnswer": "One morning, Mr. Tanaka was waiting for a bus. The bus was very crowded, so he could not get on it. That afternoon, a city officer was putting up a poster about a new bus route. The next morning, Mr. Tanaka was reading a newspaper on a bus with many empty seats." },
    { "no": 3, "type": "opinion", "cardVisible": false,
      "prompt": "Do you think people should use public transportation more often?",
      "modelAnswer": "Yes. Trains and buses can carry many people at once, so they help reduce traffic." },
    { "no": 4, "type": "opinion", "cardVisible": false,
      "prompt": "Some people say that working from home will become more common in the future. What do you think about that?",
      "modelAnswer": "I agree. Many companies have found that people can work well at home." }
  ]
}
```

準2級・準1級も同じ形。準1級は `passage` を持たず、`illustrations` が4枚、
`narration.prepareSeconds` が 60、`speakSeconds` が 120。

---

## 4. イラストのプロンプト

英検のイラストには決まった見た目がある。バラバラだと本番の練習にならないので、
共通部分をテンプレートにして、場面だけ差し替える。

### 共通（全級の頭に付ける）

```
Simple black-and-white line drawing in the style of a Japanese English
proficiency test illustration. Clean uniform line weight, no shading,
no hatching, flat white background, no color. Everyday Japanese setting.
Everyone's action must be unmistakable at a glance. Full bodies visible,
no cropping. No text, no letters, no numbers, no speech bubbles unless
specified. Simple neutral faces, no exaggerated expressions.
```

**なぜこの縛りか**
- 白黒の線画: 本番の問題カードがそうなっている
- 「動作が一目で分かる」: 設問が "What is she doing?" なので、動作が曖昧だと問題が成立しない
- 文字を入れない: 生成AIは英単語を崩して描く。読ませたい文字は後から重ねる
- 吹き出しは指定時のみ: 準1級だけ、意図を示す吹き出しが要る

### 3級 — 1枚、人物3〜5人

共通のあとに続ける:

```
One scene. Three to five people, each doing a clearly different action.
Include a few countable objects (boxes, books, cups) so that a
"How many ...?" question can be asked. Each person is distinguishable by
hair length or clothing, not by facial detail.

Scene: <ここに場面を書く。例: A living room. A woman with long hair is
looking at a laptop on a table. A delivery man is carrying a box through
the door. Three boxes are on the floor. A boy is reading a book on a sofa.>
```

### 準2級 — 2枚

イラストA（複数の動作）:
```
One scene with five people, each performing a distinctly different action,
spread across the frame so all five are countable and describable.

Scene: <例: A park on a sunny day. A man is walking a dog. A woman is
sitting on a bench and drinking coffee. Two children are throwing a ball.
An old man is watering flowers.>
```

イラストB（1人の状況）:
```
One scene focused on a single person facing a small problem or situation.
The cause of the situation must be visible in the same frame.

Scene: <例: A woman is standing in front of a train station gate. Her bag
is open and her wallet is not inside. A station attendant is looking at her.>
```

### 2級 — 3コマ

```
A three-panel comic strip, panels arranged left to right, equal size,
thin black borders between panels. The same characters appear in every
panel and must be recognizable across panels (same hair, same clothes).
The story must be understandable without any text.
Panel 1: <…>
Panel 2: <…>
Panel 3: <…>
```

時間の経過を示したいときは、コマの上に日本語で「翌朝」などと入れるのではなく、
**背景で示す**（朝の光 / 夕方の空 / 掛け時計の針）。文字は生成AIが崩すため。

### 準1級 — 4コマ

```
A four-panel comic strip in a 2x2 grid, thin black borders. The same
characters appear throughout and must be recognizable across panels.
Panel 4 must show a character with a visible thought bubble containing a
simple picture (not text) that shows what they are thinking or worrying about.
Panel 1: <…>
Panel 2: <…>
Panel 3: <…>
Panel 4: <…>
```

準1級は No.2 で「4コマ目の人物になったつもりで」と聞くので、**4コマ目に
心情が読み取れる要素が要る**。吹き出しの中は絵にする（文字は崩れる）。

### 生成したあと

- 動作が読み取れるか、**設問に答えられるか**を必ず自分で確認する。
  「What is she doing?」に答えられない絵は作り直し
- 人物の指の本数や物の数がおかしいことがある。"How many" を聞く設問では数を数える
- 生成物は `public/eiken/{id}-{illustrationId}.png`

---

## 5. 音声にするもの

事前生成（`scripts/build-audio.js` と同じ仕組み）でまかなえる。

| 対象 | 声 |
|---|---|
| 面接官の固定セリフ | 英語 |
| 各設問の prompt | 英語 |
| パッセージ（模範の音読） | 英語 |
| modelAnswer | 英語 |
| narration.openingSentence | 英語 |

1カードあたり英語で10前後。100カード作っても1,000クリップ弱で、
単語の29,220クリップに比べれば誤差の範囲。費用も数十円。

生徒の発話は録音して聞き返せるようにする。採点まで踏み込むなら Azure の
Pronunciation Assessment（音読と相性が良い）。

---

## 6. 作る順番の提案

1. **3級を5カード**。イラスト1枚だけなので、絵の作り方の勘所がつかめる
2. 画面を作る（音読 → 設問 → 録音 → 聞き返す）
3. 2級・準2級（コマ割りの絵が要る）
4. 準1級

3級5カードぶんの素材ができた時点で、画面の作りが妥当かを一度見てもらうのが早い。
