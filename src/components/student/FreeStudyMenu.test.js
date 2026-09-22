import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FreeStudyMenu, { freeStudyBackTarget } from './FreeStudyMenu';

const EIKEN_OPTIONS = [
  { id: 'eiken-5', label: '英検5級' },
  { id: 'eiken-4', label: '英検4級' },
  { id: 'eiken-3', label: '英検3級' },
  { id: 'eiken-pre2', label: '英検準2級' },
  { id: 'eiken-2', label: '英検2級' },
  { id: 'eiken-pre1', label: '英検準1級' },
];

const INTERVIEW_GRADES = [
  { id: '3', label: '3級' },
  { id: 'pre2', label: '準2級' },
  { id: '2', label: '2級' },
  { id: 'pre1', label: '準1級' },
];

const COUNTS = {
  'osaka-koukou-nyuushi': 3193,
  'highschool-english': 5934,
  'eiken-5': 620,
  'eiken-4': 1240,
  'eiken-3': 2100,
  'eiken-pre2': 3400,
  'eiken-2': 4800,
  'eiken-pre1': 6200,
};

/** 教材。**定義の正本は `src/config/books.js`**。ここは親から切り離すための写し */
const BOOKS = [
  { id: 'book-systan5', title: 'システム英単語', publisher: '駿台文庫', count: 2027, cover: 'https://example.test/a.jpg' },
  { id: 'book-target1900', title: '英単語ターゲット1900', publisher: '旺文社', count: 1900, cover: 'https://example.test/b.jpg' },
  { id: 'book-leap', title: '必携英単語LEAP', publisher: '数研出版', count: 1935, cover: 'https://example.test/c.jpg' },
  { id: 'book-idiom-target1000', title: '英熟語ターゲット1000', publisher: '旺文社', count: 1000, cover: 'https://example.test/d.jpg' },
];

const show = (props = {}) => {
  const handlers = {
    onNavigate: jest.fn(),
    onSelectTextbook: jest.fn(),
    onSelectInterview: jest.fn(),
    onSelectBook: jest.fn(),
    onSelectRange: jest.fn(),
  };
  render(
    <FreeStudyMenu
      mode="main"
      eikenOptions={EIKEN_OPTIONS}
      interviewGrades={INTERVIEW_GRADES}
      books={BOOKS}
      wordCountOf={(id) => COUNTS[id] ?? null}
      recommendationOf={() => null}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

/*
  **教材が先頭**（2026-09-22 の指定）。塾が実際に配っている本なので、
  生徒はまずここを探す。並び順まで固定するのは、後から足した入口が
  いつのまにか下へ埋もれるのを止めるため。
*/
test('最初は 教材 / 中学英語 / 高校英語 / 英検 の4枚だけ', () => {
  show();

  const titles = screen.getAllByRole('button')
    .map((card) => card.querySelector('.free-study-card__title').textContent);
  expect(titles).toEqual(['教材', '中学英語', '高校英語', '英検']);

  // 級や面接の入口は、英検を開くまで出さない
  expect(screen.queryByText('英検3級')).not.toBeInTheDocument();
  expect(screen.queryByText('二次試験（面接）')).not.toBeInTheDocument();
  // 冊の名前も、教材を開くまで出さない
  expect(screen.queryByText('システム英単語')).not.toBeInTheDocument();
});

test('中学英語・高校英語は語数を添えて、押すとそのまま教材へ入る', () => {
  const { onSelectTextbook } = show();

  expect(screen.getByText('大阪府公立入試・3,193語')).toBeInTheDocument();
  expect(screen.getByText('基礎・標準・応用・5,934語')).toBeInTheDocument();

  fireEvent.click(screen.getByText('中学英語'));
  expect(onSelectTextbook).toHaveBeenCalledWith('osaka-koukou-nyuushi');
});

test('単語データを読む前は語数を出さない', () => {
  show({ wordCountOf: () => null });

  expect(screen.getByText('大阪府公立入試')).toBeInTheDocument();
  expect(screen.queryByText(/\d語/)).not.toBeInTheDocument();
});

test('英検は選ばずに一段下りる', () => {
  const { onNavigate, onSelectTextbook } = show();

  fireEvent.click(screen.getByText('英検'));
  expect(onNavigate).toHaveBeenCalledWith('eiken');
  expect(onSelectTextbook).not.toHaveBeenCalled();
});

test('英検の下は 単語 と 面接 の2つ', () => {
  const { onNavigate } = show({ mode: 'eiken' });

  fireEvent.click(screen.getByText('単語を覚える'));
  expect(onNavigate).toHaveBeenCalledWith('eiken-words');

  fireEvent.click(screen.getByText('二次試験（面接）'));
  expect(onNavigate).toHaveBeenCalledWith('eiken-interview');
});

test('単語は5級から準1級まで並ぶ', () => {
  const { onSelectTextbook } = show({ mode: 'eiken-words' });

  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    '英検5級620語', '英検4級1,240語', '英検3級2,100語',
    '英検準2級3,400語', '英検2級4,800語', '英検準1級6,200語',
  ]);

  fireEvent.click(screen.getByText('英検3級'));
  expect(onSelectTextbook).toHaveBeenCalledWith('eiken-3');
});

test('収録が0語の級は出さない。選んでも何も学べない', () => {
  show({ mode: 'eiken-words', wordCountOf: (id) => (id === 'eiken-pre1' ? 0 : 100) });

  expect(screen.getByText('英検2級')).toBeInTheDocument();
  expect(screen.queryByText('英検準1級')).not.toBeInTheDocument();
});

test('面接は3級以上の4つだけ。単語ではないので語数を出さない', () => {
  const { onSelectInterview } = show({ mode: 'eiken-interview' });

  expect(screen.getAllByRole('button').map((b) => b.textContent))
    .toEqual(['3級5問', '準2級5問', '2級5問', '準1級5問']);

  fireEvent.click(screen.getByText('準2級'));
  expect(onSelectInterview).toHaveBeenCalledWith('pre2');
});

test('英検カードのおすすめは、どれか1級でも合っていれば付く', () => {
  show({ recommendationOf: (id) => (id === 'eiken-3' ? 'medium' : null) });

  // 中学英語・高校英語には付かず、英検にだけ付く
  expect(screen.getAllByText('おすすめ')).toHaveLength(1);
  expect(screen.getByText('英検').closest('button')).toHaveTextContent('おすすめ');
});

/*
  教材の段。**絞り込み画面（レベル・品詞・意味）は通さない。**
  単語帳は通し番号で進めるものなので、番号の帯から直接カードへ行く。
*/
describe('教材で選ぶ', () => {
  test('押すと教材の一覧へ進むだけ（教材を選んだことにしない）', () => {
    const { onNavigate, onSelectTextbook, onSelectBook } = show();

    fireEvent.click(screen.getByText('教材'));

    expect(onNavigate).toHaveBeenCalledWith('books');
    expect(onSelectTextbook).not.toHaveBeenCalled();
    expect(onSelectBook).not.toHaveBeenCalled();
  });

  test('4冊が、出版社と語数を添えて並ぶ', () => {
    show({ mode: 'books' });

    const titles = screen.getAllByRole('button')
      .map((card) => card.querySelector('.free-study-card__title').textContent);
    expect(titles).toEqual([
      'システム英単語', '英単語ターゲット1900', '必携英単語LEAP', '英熟語ターゲット1000',
    ]);
    expect(screen.getByText('駿台文庫・2,027語')).toBeInTheDocument();
    expect(screen.getByText('旺文社・1,000語')).toBeInTheDocument();
  });

  /*
    **表紙で選べるようにする**（2026-09-22 の指定）。生徒は題名より先に
    絵で本を見つける。alt は空——題名が隣に出ているので読み上げが二重になる。
  */
  test('表紙のサムネイルが出る', () => {
    const { container } = render(
      <FreeStudyMenu
        mode="books"
        books={BOOKS}
        eikenOptions={EIKEN_OPTIONS}
        interviewGrades={INTERVIEW_GRADES}
        wordCountOf={() => null}
        recommendationOf={() => null}
        onNavigate={jest.fn()}
        onSelectTextbook={jest.fn()}
        onSelectInterview={jest.fn()}
        onSelectBook={jest.fn()}
        onSelectRange={jest.fn()}
      />
    );
    const covers = [...container.querySelectorAll('.free-study-card__cover img')];
    expect(covers).toHaveLength(4);
    expect(covers[0].getAttribute('src')).toBe('https://example.test/a.jpg');
    expect(covers[0].getAttribute('alt')).toBe('');
  });

  test('冊を押すと、その冊が親へ渡る', () => {
    const { onSelectBook } = show({ mode: 'books' });

    fireEvent.click(screen.getByText('必携英単語LEAP'));

    expect(onSelectBook).toHaveBeenCalledWith(BOOKS[2]);
  });

  test('**番号の帯が並び、端数は本当の語数で出る**（2,027語 → 最後は 2001〜2027）', () => {
    show({ mode: 'book-range', selectedBook: BOOKS[0] });

    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels).toHaveLength(21);
    expect(labels[0]).toBe('1〜100100語');
    expect(labels[20]).toBe('2001〜202727語');
  });

  test('帯を押すと、冊と範囲が親へ渡る', () => {
    const { onSelectRange } = show({ mode: 'book-range', selectedBook: BOOKS[3] });

    fireEvent.click(screen.getByText('101〜200'));

    expect(onSelectRange).toHaveBeenCalledWith(
      BOOKS[3],
      { from: 101, to: 200, label: '101〜200', count: 100 },
    );
  });

  test('冊が決まっていなければ何も出さない（落ちない）', () => {
    show({ mode: 'book-range', selectedBook: null });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('戻る先', () => {
  test('英検の中は一段ずつ戻る', () => {
    expect(freeStudyBackTarget('eiken-words', null)).toBe('eiken');
    expect(freeStudyBackTarget('eiken-interview', null)).toBe('eiken');
    expect(freeStudyBackTarget('eiken', null)).toBe('main');
  });

  test('教材から戻る先は、その教材をどこから選んだかで決まる', () => {
    expect(freeStudyBackTarget('filter', 'eiken-3')).toBe('eiken-words');
    expect(freeStudyBackTarget('filter', 'osaka-koukou-nyuushi')).toBe('main');
    expect(freeStudyBackTarget('filter', 'highschool-english')).toBe('main');
    expect(freeStudyBackTarget('filter', null)).toBe('main');
  });

  test('教材も一段ずつ戻る', () => {
    expect(freeStudyBackTarget('book-range', 'book-systan5')).toBe('books');
    expect(freeStudyBackTarget('books', null)).toBe('main');
  });
});
