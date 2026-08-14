import React from 'react';
import { FaArrowRight, FaRedo } from 'react-icons/fa';
import LEVELS from '../../config/levels.json';
import { CLEAR_RATIO } from '../../logic/estimatedLevel';
import './LevelNudge.css';

/**
 * 「テストのときより力が付いています」の知らせ。
 *
 * レベル（users/{uid}.level）は語彙力チェックテストでしか動かない。覚えた
 * ぶんが表示に出ないままだと、進んでいる実感が持てず、テストを受け直す
 * きっかけも無い。復習の卒業ぐあいから見積もった値がテストの値を上回った
 * ときだけ、ここで声をかける。
 *
 * 見積もりは表示だけに使う。出題の範囲は測った値のまま動かさない
 * （src/logic/estimatedLevel.js）。
 */

const levelOf = (level) => LEVELS.find((entry) => entry.level === level) || null;

export default function LevelNudge({ assessedLevel = 0, estimatedLevel, nextRatio = 0, onRetest }) {
  const from = levelOf(assessedLevel);
  const to = levelOf(estimatedLevel);
  if (!to) return null;

  // 次のレベルへどこまで来たか。8割で越えたと見なすので、そこを満杯にする。
  const fill = Math.min(100, Math.round((nextRatio / CLEAR_RATIO) * 100));

  return (
    <div className="level-nudge">
      <p className="level-nudge__eyebrow">テストのときより力が付いています</p>

      <div className="level-nudge__jump">
        <span className="level-nudge__from">
          <span className="level-nudge__no">Lv.{assessedLevel || '—'}</span>
          <span className="level-nudge__name">{from ? from.label : '未測定'}</span>
        </span>

        <FaArrowRight className="level-nudge__arrow" aria-hidden="true" />

        <span className="level-nudge__to" style={{ '--level-color': to.color }}>
          <span className="level-nudge__no">Lv.{to.level}</span>
          <span className="level-nudge__name">{to.label}</span>
        </span>
      </div>

      <p className="level-nudge__lead">
        いまの覚えぐあいは <strong>{to.label}（{to.eiken}）</strong>相当です。
      </p>

      {fill > 0 && (
        <div className="level-nudge__meter" aria-hidden="true">
          <span className="level-nudge__fill" style={{ width: `${fill}%` }} />
        </div>
      )}

      {onRetest && (
        <button type="button" className="level-nudge__action" onClick={onRetest}>
          <FaRedo aria-hidden="true" /> チェックテストで確かめる
        </button>
      )}

      <p className="level-nudge__note">
        これは復習の卒業ぐあいから見た目安です。出題の範囲はテストの結果のままです。
      </p>
    </div>
  );
}
