import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { FaRedo, FaVolumeUp } from 'react-icons/fa';
import { VERDICT_LABELS } from '../../logic/transcribeApi';
import { commentFor, scoreOf, summarize, toneOf } from '../../logic/interviewScore';

// ドーナツと横棒に要る部品だけ登録する。他の画面は別途登録している。
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip);

const TONE_COLORS = {
  good: '#16a34a',
  partial: '#f59e0b',
  'off-target': '#dc2626',
};
const EMPTY = '#e2e8f0';

/**
 * 面接をひと通り終えたあとの結果。
 *
 * 途中では点を出さない代わりに、ここでまとめて見せる。数字だけ並べても
 * 中高生には響かないので、全体の出来をドーナツで、場面ごとの出来を
 * 横棒で出し、そのあとに1場面ずつの講評を置く。
 *
 * 判定はまだ返っていないことがある（結果を開いた時点で投げている）。
 * 待っている場面はその旨を出し、揃ったところから絵が埋まる。
 */
export default function InterviewResultModal({ title, answers, places, onSpeak, onEditTranscript, onClose, onRestart, onExit }) {
  const summary = useMemo(() => summarize(answers, places), [answers, places]);
  const waiting = answers.filter((entry) => entry.status === 'working' || entry.reviewing).length;

  const overall = summary.overall;

  const doughnut = useMemo(() => ({
    labels: ['できたところ', 'これから'],
    datasets: [{
      data: [overall ?? 0, 100 - (overall ?? 0)],
      backgroundColor: [overall === null ? EMPTY : TONE_COLORS[toneOf(overall)], EMPTY],
      borderWidth: 0,
    }],
  }), [overall]);

  const bar = useMemo(() => ({
    labels: summary.items.map((item) => item.label),
    datasets: [{
      label: '点',
      data: summary.items.map((item) => item.score ?? 0),
      backgroundColor: summary.items.map((item) => (item.tone ? TONE_COLORS[item.tone] : EMPTY)),
      borderRadius: 6,
      barThickness: 18,
    }],
  }), [summary.items]);

  return (
    <div className="interview-result-backdrop" role="presentation" onClick={onClose}>
      <div
        className="interview-result"
        role="dialog"
        aria-modal="true"
        aria-label="面接の結果"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="interview-result__head">
          <p className="interview-result__title">面接の結果</p>
          <p className="interview-result__card">{title}</p>
        </div>

        <div className="interview-result__body">
          <div className="interview-result__overall">
            <div className="interview-gauge">
              <Doughnut
                data={doughnut}
                options={{
                  cutout: '78%',
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 400 },
                  plugins: { legend: { display: false }, tooltip: { enabled: false } },
                }}
                aria-label={overall === null ? '点はまだ出ていません' : `全体の点 ${overall}点`}
              />
              <div className="interview-gauge__center">
                <span className="interview-gauge__value">{overall === null ? '—' : overall}</span>
                <span className="interview-gauge__unit">点</span>
              </div>
            </div>
            <p className="interview-result__comment">{commentFor(overall)}</p>
            {summary.counts.good + summary.counts.partial + summary.counts['off-target'] > 0 && (
              <p className="interview-result__counts">
                答えられた {summary.counts.good} ／ あと少し {summary.counts.partial}
                {' '}／ ずれた {summary.counts['off-target']}
              </p>
            )}
          </div>

          {waiting > 0 && (
            <p className="speaking-note">残り{waiting}件、採点しています…</p>
          )}

          {summary.items.length > 1 && (
            <div className="interview-result__chart" style={{ height: 40 + summary.items.length * 34 }}>
              <Bar
                data={bar}
                options={{
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: { duration: 400 },
                  plugins: { legend: { display: false } },
                  scales: {
                    x: {
                      min: 0,
                      max: 100,
                      grid: { color: 'rgba(15, 23, 42, 0.08)' },
                      border: { display: false },
                      ticks: { stepSize: 50, font: { size: 10 }, color: '#64748b' },
                    },
                    y: {
                      grid: { display: false },
                      border: { display: false },
                      ticks: { font: { size: 11 }, color: '#0f172a' },
                    },
                  },
                }}
                aria-label="場面ごとの点"
              />
            </div>
          )}

          {summary.unanswered > 0 && (
            <p className="speaking-note">
              答えていない場面が{summary.unanswered}件あります。0点として数えています。
            </p>
          )}

          <div className="interview-result__list">
            {summary.items.map((item) => {
              const entry = answers.find((answer) => answer.key === item.key);
              return entry
                ? <ResultItem key={item.key} entry={entry} onSpeak={onSpeak} onEditTranscript={onEditTranscript} />
                : (
                  <div className="interview-result-item" key={item.key}>
                    <p className="interview-result-item__head">
                      <span className="interview-result-item__label">{item.label}</span>
                      <span className="interview-badge is-off-target">答えていません</span>
                    </p>
                  </div>
                );
            })}
          </div>
        </div>

        <div className="interview-result__foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            戻る
          </button>
          <button type="button" className="ghost-button" onClick={onRestart}>
            <FaRedo aria-hidden="true" /> もう一度
          </button>
          <button type="button" className="primary-action" onClick={onExit}>
            問題を選ぶ
          </button>
        </div>
      </div>
    </div>
  );
}

/** 1場面ぶんの講評。質問・自分の答え・直しどころ・聞き返しをこの順で。 */
function ResultItem({ entry, onSpeak, onEditTranscript }) {
  const score = scoreOf(entry);
  const content = entry.review?.content;
  const missing = entry.review?.missing || [];

  return (
    <div className="interview-result-item">
      <p className="interview-result-item__head">
        <span className="interview-result-item__label">{entry.label}</span>
        {score !== null && (
          <span className={`interview-badge is-${toneOf(score)}`}>
            {entry.mode === 'scripted'
              ? `読めた語 ${score}%`
              : VERDICT_LABELS[content?.verdict] || `${score}点`}
          </span>
        )}
        {entry.reviewing && <span className="speaking-note">採点しています…</span>}
      </p>

      {entry.mode === 'unscripted' && entry.question && (
        <p className="interview-result-item__question">{entry.question}</p>
      )}

      {/* 日本語なまりの英語は取り違えられる。直すと採点がかかり直す。
          録音を止めたらすぐ次の場面へ進む作りなので、直す場はここしかない。 */}
      {entry.status === 'working' ? (
        <p className="speaking-note">聞き取っています…</p>
      ) : (
        <label className="speaking-transcript">
          <span className="speaking-transcript__label">
            言えていた内容
            {entry.edited && <span className="speaking-transcript__edited">直しました</span>}
          </span>
          <textarea
            className="speaking-transcript__input"
            value={entry.transcript}
            rows={2}
            onChange={(event) => onEditTranscript(entry.key, event.target.value)}
            placeholder="聞き取れませんでした。言ったとおりに書き直せます。"
          />
          <span className="speaking-note">聞き間違いがあれば直してください。直した文で採点し直します。</span>
        </label>
      )}

      {entry.reviewFailed && (
        <p className="speaking-error">
          {entry.failure || '採点できませんでした。'}文字起こしを直すと、もう一度かかります。
        </p>
      )}

      {missing.length > 0 && (
        <p className="interview-result-item__missing">
          読み飛ばした語: {missing.join(' / ')}
        </p>
      )}

      {content?.reasonJa && <p>{content.reasonJa}</p>}
      {content?.missingJa && <p>足すとよいこと: {content.missingJa}</p>}
      {content?.betterAnswer && (
        <div className="interview-result-item__better">
          <p>{content.betterAnswer}</p>
          {/* 直された文は、読んで終わりにせず口に出させたい。 */}
          <button type="button" className="ghost-button" onClick={() => onSpeak(content.betterAnswer)}>
            <FaVolumeUp aria-hidden="true" /> 聞く
          </button>
        </div>
      )}

      <audio className="speaking-audio" src={entry.url} controls preload="metadata">
        <track kind="captions" />
      </audio>
    </div>
  );
}
