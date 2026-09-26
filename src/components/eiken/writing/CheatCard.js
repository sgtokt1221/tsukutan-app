import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';

/**
 * カンニングカード（カンペ）。右の端から引き出す（2026-09-26）。
 *
 * 中身は塾の「ライティング道場」PDFの重要表現・構文（public/eiken-writing/cards）。
 * **見るだけ**。文へ差し込まない（自分で書いて覚える）。閉じても書いた文は残る。
 * 赤の「特に重要」は目立たせる。
 */
export default function CheatCard({ card, open, onOpen, onClose }) {
  const sections = card?.sections || [];
  const [sectionId, setSectionId] = useState(null);
  const section = sections.find((s) => s.id === sectionId) || sections[0];

  return (
    <>
      {/* 右端のつまみ。いつでも見えている */}
      <button
        type="button"
        className={open ? 'cheat-tab is-open' : 'cheat-tab'}
        onClick={open ? onClose : onOpen}
        aria-expanded={open}
        aria-label={open ? 'カンペを閉じる' : 'カンペを開く'}
      >
        カンペ
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="cheat-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.aside
              className="cheat-drawer"
              role="dialog"
              aria-label="カンペ"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: [0.22, 0.9, 0.24, 1] }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.6 }}
              // 右へ払って閉じる
              onDragEnd={(event, info) => { if (info.offset.x > 80) onClose(); }}
            >
              <div className="cheat-drawer__head">
                <span className="cheat-drawer__title">カンペ</span>
                <button type="button" className="cheat-drawer__close" onClick={onClose} aria-label="カンペを閉じる">
                  <FaTimes aria-hidden="true" />
                </button>
              </div>

              <div className="cheat-drawer__tabs" role="tablist" aria-label="カンペの分類">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={s.id === section?.id}
                    className={s.id === section?.id ? 'cheat-chip is-on' : 'cheat-chip'}
                    onClick={() => setSectionId(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="cheat-drawer__body">
                {!card && <p className="cheat-empty">読み込んでいます…</p>}
                {section?.lead && <p className="cheat-lead">{section.lead}</p>}
                {(section?.groups || []).map((group, gi) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <section key={gi} className="cheat-group">
                    {group.title && <h4 className="cheat-group__title">{group.title}</h4>}
                    <ul className="cheat-list">
                      {(group.items || []).map((item, ii) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <li key={ii} className={item.important ? 'cheat-item is-important' : 'cheat-item'}>
                          <span className="cheat-item__en">{item.en}</span>
                          <span className="cheat-item__ja">{item.ja}</span>
                          {item.example && (
                            <span className="cheat-item__example">
                              {item.example}
                              {item.exampleJa && <span className="cheat-item__example-ja">{item.exampleJa}</span>}
                            </span>
                          )}
                          {item.note && <span className="cheat-item__note">{item.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
