import React from 'react';
import { motion } from 'framer-motion';

/**
 * 採点の結果（2026-09-26）。観点ごとの 0〜4 の棒と合計、それに自動のしるし（語数・短縮形・0点ルール）。
 * **2026-09-27：書いた英文を1文ずつ並べ、間違いのある文に種類とヒントを付ける**（沖藤さんの指定）。
 * 直した英文は出さない（採点の Jev は書き直せない。種類はサーバが文ごとに選ばせたもの → functions/lib/writingScore.js）。
 */

/** 間違いの種類。サーバの SENTENCE_ERRORS と対応 */
export const ERROR_TEXT = {
  agreement: { label: '主語と動詞の形', hint: '主語に動詞の形を合わせよう（I go / he goes、the library is / books are）' },
  tense: { label: '動詞の時制・形', hint: '過去のことは過去形に。can・will・to のあとは動詞の元の形' },
  article: { label: 'a / the', hint: '数えられる名詞の前に a や the が要らないか見直そう（in the library）' },
  plural: { label: '単数・複数', hint: 'many・two などのあとは複数形（many books）' },
  preposition: { label: '前置詞', hint: '動詞とセットの前置詞を確かめよう（concentrate on、listen to）' },
  spelling: { label: 'つづり・大文字', hint: 'つづりと、曜日・月・人名の大文字を確かめよう（Sunday、friend）' },
  wordOrder: { label: '語順', hint: '「だれが → どうする → 何を」の順になっているか確かめよう' },
  wordChoice: { label: '言葉の選び方', hint: '意味に合う単語か確かめよう（do homework、make a friend）' },
  fragment: { label: '文になっていない', hint: 'Because 〜 だけでは1文にならない。前の文とつなげよう' },
  other: { label: 'そのほかの文法', hint: 'もう一度、文の形を確かめよう' },
};

const ASPECT_LABEL = { content: '内容', organization: '構成', vocabulary: '語彙', grammar: '文法' };
const ASPECT_ORDER = ['content', 'organization', 'vocabulary', 'grammar'];

/** 印の言葉。サーバ（functions/lib/writingScore.js）の flags と対応 */
export const FLAG_TEXT = {
  'not-answersQuestion': '問いに答えていないので0点です',
  'not-isReply': 'メールへの返信になっていないので0点です',
  'not-isSummary': '要約になっていないので0点です',
  'missing-twoReasons': '理由が2つそろっていません（内容は2点まで）',
  'missing-usesTwoPoints': 'POINTS を2つ使っていません（内容は2点まで）',
  'missing-answersBoth': '下線の質問の両方に答えていません（内容は2点まで）',
  'missing-answersQuestion': '相手の質問に答えていません（内容は2点まで）',
  'missing-asksTwoQuestions': '下線部について質問を2つしていません（内容は2点まで）',
  'too-short': '語数が足りません',
  'too-long': '語数が多すぎます',
  contractions: "短縮形があります（I'm → I am, It's → It is）",
};

export default function WritingResult({ result, answer, onRetry, onBack }) {
  const aspects = ASPECT_ORDER.filter((a) => result.scores?.[a] != null);
  const ratio = result.max > 0 ? result.total / result.max : 0;
  return (
    <div className="wr-result">
      <div className="wr-result__total">
        <span className="wr-result__num">{result.total}</span>
        <span className="wr-result__max">/ {result.max}</span>
        <div className="wr-result__track" aria-hidden="true">
          <motion.div
            className="wr-result__fill"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(ratio * 100)}%` }}
            transition={{ duration: 0.8, ease: [0.22, 0.9, 0.24, 1] }}
          />
        </div>
      </div>

      <ul className="wr-aspects">
        {aspects.map((aspect, i) => (
          <li key={aspect} className="wr-aspect">
            <span className="wr-aspect__label">{ASPECT_LABEL[aspect]}</span>
            <span className="wr-aspect__pips" aria-label={`${ASPECT_LABEL[aspect]} ${result.scores[aspect]} / 4`}>
              {[0, 1, 2, 3].map((n) => (
                <motion.span
                  key={n}
                  className={n < result.scores[aspect] ? 'wr-pip is-on' : 'wr-pip'}
                  initial={{ scaleY: 0.3, opacity: 0.4 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.12 + n * 0.05, duration: 0.3 }}
                />
              ))}
            </span>
            <span className="wr-aspect__num">{result.scores[aspect]}</span>
          </li>
        ))}
      </ul>

      {result.flags?.length > 0 && (
        <ul className="wr-flags">
          {result.flags.map((flag) => FLAG_TEXT[flag] && (
            <li key={flag} className={flag.startsWith('not-') ? 'wr-flag is-zero' : 'wr-flag'}>{FLAG_TEXT[flag]}</li>
          ))}
        </ul>
      )}

      <div className="wr-answer">
        <span className="wr-answer__label">書いた英文（{result.words}語）</span>
        {Array.isArray(result.sentences) && result.sentences.length > 0 ? (
          <ol className="wr-sentences">
            {result.sentences.map((sentence, i) => {
              const errors = (sentence.errors || []).filter((e) => ERROR_TEXT[e]);
              return (
                <li key={i} className={errors.length ? 'wr-sentence has-error' : 'wr-sentence'}>
                  <span className="wr-sentence__text">{sentence.text}</span>
                  {errors.map((e) => (
                    <span key={e} className="wr-sentence__error">
                      <strong>{ERROR_TEXT[e].label}</strong>：{ERROR_TEXT[e].hint}
                    </span>
                  ))}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="wr-answer__text">{answer}</p>
        )}
      </div>

      <div className="wr-actions">
        <button type="button" className="wr-btn" onClick={onBack}>問題の一覧へ</button>
        <button type="button" className="wr-btn wr-btn--primary" onClick={onRetry}>書き直す</button>
      </div>
    </div>
  );
}
