/**
 * 読みものを選ぶところ（本棚 → 目次）。
 *
 * **いちばん大事なのは「本を開いても勉強時間を測り始めない」こと。**
 * 測り始めるのは読みものを選んだ瞬間だけ。目次を眺めただけの時間を勉強時間に
 * すると、`noteActivity` が一度も来ないまま締められ、実態と合わない記録になる。
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ReadingShelf from './ReadingShelf';

/** `public/reading/index.json` と同じ形。級はやさしい順に入っている */
const GRADES = [
  { id: '5', label: '英検5級', readings: [
    { id: 'r1', title: 'My Morning', titleJa: 'わたしの朝', category: 'daily' },
    { id: 'r2', title: 'My Dog and I', titleJa: 'わたしと犬', category: 'daily' },
  ] },
  { id: '4', label: '英検4級', readings: [{ id: 'r3', title: 'The School Festival', titleJa: '学園祭', category: 'school' }] },
  { id: '3', label: '英検3級', readings: [] },
  { id: 'pre2', label: '英検準2級', readings: [{ id: 'r4', title: 'Why We Forget', titleJa: 'なぜ忘れるのか', category: 'science' }] },
  { id: '2', label: '英検2級', readings: [{ id: 'r5', title: 'The Bowl That Was Broken', titleJa: '割れた器', category: 'culture' }] },
  { id: 'pre1', label: '英検準1級', readings: [
    // **実データの最長（37文字）**。折り返す前提で組んであることを見る
    { id: 'r6', title: 'The Medicine That Is Losing Its Power', titleJa: '効かなくなる薬', category: 'science' },
  ] },
];

const LABELS = { daily: '毎日のこと', school: '学校', science: '科学とからだ', culture: '文化と歴史' };

const show = (props = {}) => {
  const handlers = {
    onOpenBook: jest.fn(),
    onCloseBook: jest.fn(),
    onSelect: jest.fn(),
  };
  const view = render(
    <ReadingShelf
      grades={GRADES}
      recommended="3"
      openBook={null}
      categoryLabel={LABELS}
      {...handlers}
      {...props}
    />
  );
  return { ...handlers, ...view };
};

describe('本棚', () => {
  it('**6冊がやさしい順に並ぶ**', () => {
    const { container } = show();
    const labels = [...container.querySelectorAll('.reading-book__label')].map((n) => n.textContent);
    expect(labels).toEqual(['英検5級', '英検4級', '英検3級', '英検準2級', '英検2級', '英検準1級']);
  });

  it('本数が出る（0本の級も出す）', () => {
    const { container } = show();
    const counts = [...container.querySelectorAll('.reading-book__count')].map((n) => n.textContent);
    expect(counts).toEqual(['2本', '1本', '0本', '1本', '1本', '1本']);
  });

  /*
    **色だけに頼らない。** いまの級は文字でも分かるようにする。
  */
  it('いまの級に、文字で印が付く', () => {
    const { container } = show();
    const marks = [...container.querySelectorAll('.reading-book')]
      .map((b) => (b.querySelector('.reading-book__mark') ? b.querySelector('.reading-book__label').textContent : null))
      .filter(Boolean);
    expect(marks).toEqual(['英検3級']);
  });

  it('**本を開くまで読みものの題名は出ない**', () => {
    show();
    expect(screen.queryByText('My Morning')).not.toBeInTheDocument();
    expect(screen.queryByText('わたしの朝')).not.toBeInTheDocument();
  });

  it('本を押すと、その級が親へ渡る', () => {
    const { onOpenBook, onSelect } = show();

    fireEvent.click(screen.getByText('英検準2級'));

    expect(onOpenBook).toHaveBeenCalledWith('pre2');
    // **読みものを選んだことにしない**（ここで測り始めてはいけない）
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('表紙は飾り。読み上げに乗せない', () => {
    const { container } = show();
    const arts = container.querySelectorAll('.reading-book__art');
    expect(arts).toHaveLength(6);
    expect(arts[0].getAttribute('aria-hidden')).toBe('true');
    expect(arts[0].getAttribute('focusable')).toBe('false');
    // **大きさは CSS が決める**（SVG は viewBox しか持たない）
    expect(arts[0].getAttribute('width')).toBeNull();
  });
});

describe('目次', () => {
  it('開いた級の読みものが、番号つきで並ぶ', () => {
    const { container } = show({ openBook: '5' });
    expect(container.querySelector('.reading-title').textContent).toBe('英検5級');
    const nos = [...container.querySelectorAll('.reading-item__no')].map((n) => n.textContent);
    expect(nos).toEqual(['1', '2']);
    expect(screen.getByText('My Morning')).toBeInTheDocument();
    expect(screen.getByText('わたしと犬')).toBeInTheDocument();
  });

  /*
    カテゴリは1冊に6〜9種でほぼ1本ずつ。**章立てにせず、各行に添えるだけ**
    （2026-09-23 に実データで確認）。
  */
  it('カテゴリは行に添える（見出しにしない）', () => {
    const { container } = show({ openBook: '5' });
    const cats = [...container.querySelectorAll('.reading-item__category')].map((n) => n.textContent);
    expect(cats).toEqual(['毎日のこと', '毎日のこと']);
  });

  it('長い題名もそのまま出す（37文字）', () => {
    show({ openBook: 'pre1' });
    expect(screen.getByText('The Medicine That Is Losing Its Power')).toBeInTheDocument();
  });

  it('読みものが無い級は、そう書く', () => {
    show({ openBook: '3' });
    expect(screen.getByText('この級の読みものはまだありません。')).toBeInTheDocument();
  });

  it('読みものを押すと、その項目が親へ渡る', () => {
    const { onSelect } = show({ openBook: '5' });

    fireEvent.click(screen.getByText('My Dog and I'));

    expect(onSelect).toHaveBeenCalledWith(GRADES[0].readings[1]);
  });

  it('戻るを押すと本棚へ', () => {
    const { onCloseBook } = show({ openBook: '5' });

    fireEvent.click(screen.getByRole('button', { name: '本棚に戻る' }));

    expect(onCloseBook).toHaveBeenCalled();
  });

  it('知らない級が来ても落ちない（本棚を出す）', () => {
    const { container } = show({ openBook: 'zzz' });
    expect(container.querySelectorAll('.reading-book')).toHaveLength(6);
  });
});
