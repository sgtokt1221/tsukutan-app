import React from 'react';
import { motion } from 'framer-motion';

/**
 * 採点の結果（2026-09-26）。**点数だけ**（ユーザーの決定。コメントは書かない）。
 * 観点ごとの 0〜4 の棒と合計、それに自動のしるし（語数・短縮形・0点ルール）。
 */

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
        <p className="wr-answer__text">{answer}</p>
      </div>

      <div className="wr-actions">
        <button type="button" className="wr-btn" onClick={onBack}>問題の一覧へ</button>
        <button type="button" className="wr-btn wr-btn--primary" onClick={onRetry}>書き直す</button>
      </div>
    </div>
  );
}
