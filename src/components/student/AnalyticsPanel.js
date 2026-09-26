import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { FaChevronRight } from 'react-icons/fa';
import TrendChart from './TrendChart';
import RetentionBar from './RetentionBar';
import RankCard from '../assessment/RankCard';
import { abilityScoreOf, rankLabel } from '../../logic/rankLogic';
import { retentionBreakdown } from '../../logic/retentionBreakdown';
import { abilityHistory, weeklyStudy, nextAction } from '../../logic/recordSummary';
import './Record.css';

/**
 * 「きろく」タブ（2026-09-26 に作り直した）。
 *
 * 出すのは5つ：次にやるとよいこと・いまのランクと知っている語数・力の伸び・直近7日の勉強量・定着の内訳。
 * **文字を減らし、数字とグラフで見せる。**
 *
 * 外したもの（理由は recordSummary.js の冒頭）：正答率の推移・最適な学習時間／曜日・
 * 学習セッション分析・学習予測・助言3か所（中身が重なっていた）。
 */

/** 直近7日の棒。高さは勉強した分、下に曜日 */
function WeeklyBars({ days }) {
  const top = Math.max(10, ...days.map((d) => d.minutes));
  return (
    <div className="rec-week" role="img" aria-label={days.map((d) => `${d.label} ${d.minutes}分 ${d.words}語`).join('、')}>
      {days.map((day) => (
        <div key={day.key} className={day.isToday ? 'rec-week__day is-today' : 'rec-week__day'}>
          <span className="rec-week__value">{day.minutes > 0 ? day.minutes : ''}</span>
          <span className="rec-week__track">
            <span className="rec-week__bar" style={{ height: `${day.minutes > 0 ? Math.max(6, (day.minutes / top) * 100) : 0}%` }} />
          </span>
          <span className="rec-week__label">{day.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPanel({ onNavigateTab, onStartTest }) {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [retention, setRetention] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const [userDoc, logSnapshot, reviewSnapshot] = await Promise.all([
          getDoc(doc(db, 'users', user.uid)),
          getDocs(collection(db, 'users', user.uid, 'logs')),
          getDocs(collection(db, 'users', user.uid, 'reviewWords')),
        ]);
        if (!alive) return;
        setUserData(userDoc.exists() ? userDoc.data() : null);
        setLogs(logSnapshot.docs.map((d) => d.data()));
        setRetention(retentionBreakdown(reviewSnapshot.docs.map((d) => d.data())));
      } catch (error) {
        console.error('きろくを読めませんでした:', error);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="rec">
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>きろくを読み込んでいます…</p>
        </div>
      </div>
    );
  }

  const progress = userData?.progress || {};
  const score = abilityScoreOf({ level: userData?.level, ability: progress.assessedAbility });
  const history = abilityHistory(logs);
  const week = weeklyStudy(logs);
  const weekMinutes = week.reduce((sum, d) => sum + d.minutes, 0);
  const weekWords = week.reduce((sum, d) => sum + d.words, 0);
  const next = nextAction({ history, retention, weekly: week });
  const known = progress.currentVocabulary;
  const target = progress.targetVocabulary;

  const scores = history.map((p) => p.score);
  const chartMin = scores.length ? Math.max(0, Math.min(...scores) - 80) : 0;
  const chartMax = scores.length ? Math.min(1000, Math.max(...scores) + 80) : 1000;

  return (
    <div className="rec">
      {/* 次にやるとよいこと。いちばん上に1行だけ */}
      <button
        type="button"
        className="rec-next"
        onClick={() => (next.action === 'test' ? onStartTest?.() : onNavigateTab?.('home'))}
      >
        <span>{next.text}</span>
        <FaChevronRight aria-hidden="true" />
      </button>

      <section className="rec-section">
        <RankCard score={score} compact />
        {Number.isFinite(known) && known > 0 && (
          <div className="rec-vocab">
            <span className="rec-vocab__label">知っている語</span>
            <span className="rec-vocab__num">
              約<strong>{known.toLocaleString()}</strong>語
            </span>
            {Number.isFinite(target) && target > 0 && (
              <span className="rec-vocab__target">目標 {target.toLocaleString()}語</span>
            )}
          </div>
        )}
      </section>

      <section className="rec-section">
        <h3 className="rec-title">伸び</h3>
        {history.length > 1 ? (
          <TrendChart
            points={history.map((p) => ({ date: p.date, value: p.score }))}
            label="ランク"
            min={chartMin}
            max={chartMax}
            formatValue={(value) => rankLabel(value) || ''}
            stepSize={50}
          />
        ) : (
          <p className="rec-empty">テストを受け直すと、ここに伸びが出ます</p>
        )}
      </section>

      <section className="rec-section">
        <div className="rec-title-row">
          <h3 className="rec-title">この7日</h3>
          <span className="rec-sum">
            <strong>{weekMinutes}</strong>分・<strong>{weekWords}</strong>語
          </span>
        </div>
        <WeeklyBars days={week} />
      </section>

      {retention && retention.total > 0 && (
        <section className="rec-section">
          <h3 className="rec-title">定着の内訳</h3>
          <RetentionBar breakdown={retention} />
        </section>
      )}
    </div>
  );
}
