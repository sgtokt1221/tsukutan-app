import React from 'react';
import { render } from '@testing-library/react';
import CardFace from './CardFace';

/**
 * jsdom は高さを持たない（scrollHeight も clientHeight も 0）。
 * 面の中身がはみ出している / いないを、ここで作って渡す。
 */
let overflowPx = 0;
const FACE_HEIGHT = 210;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return FACE_HEIGHT; },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() { return FACE_HEIGHT + overflowPx; },
  });
});

beforeEach(() => { overflowPx = 0; });

const face = (container) => container.querySelector('.card-face');

test('中身が収まっていれば、指で動かせる印は付かない', () => {
  const { container } = render(<CardFace className="card-face card-front">apple</CardFace>);

  // 印が無い＝CSS 側で touch-action: none。上スワイプでページが動かない。
  expect(face(container)).not.toHaveClass('is-scrollable');
});

test('中身がはみ出していれば、指でたぐれるようにする', () => {
  overflowPx = 160;
  const { container } = render(
    <CardFace className="card-face card-back">とても長い意味と例文</CardFace>
  );

  expect(face(container)).toHaveClass('is-scrollable');
});

test('語が変わって収まるようになったら、印は外れる', () => {
  overflowPx = 160;
  const { container, rerender } = render(
    <CardFace className="card-face card-back">長い語</CardFace>
  );
  expect(face(container)).toHaveClass('is-scrollable');

  overflowPx = 0;
  rerender(<CardFace className="card-face card-back">短い語</CardFace>);
  expect(face(container)).not.toHaveClass('is-scrollable');
});

test('渡した className と中身はそのまま出す', () => {
  const { container } = render(
    <CardFace className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
      <p id="card-front-text">apple</p>
    </CardFace>
  );

  expect(face(container)).toHaveClass('card-face', 'card-front');
  expect(face(container)).toHaveStyle({ backgroundColor: 'transparent' });
  expect(container.querySelector('#card-front-text')).toHaveTextContent('apple');
});
