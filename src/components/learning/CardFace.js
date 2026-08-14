import React, { useEffect, useRef, useState } from 'react';

/**
 * フラッシュカードの表・裏の面。
 *
 * 中身が高さに収まらないときだけ、指で面の中をスクロールできるようにする。
 *
 * 収まっているのに縦のスクロールを許すと、上スワイプ（もう覚えた）のたびに
 * ページまで一緒に動く。overflow を持つ要素は touch-action のさかのぼりを
 * そこで止めるので、カード側（#flashcard）の touch-action: none が指まで
 * 届かず、ブラウザがページを流してしまうため。
 *
 * かといって常に止めると、長い意味や例文を持つ語で、はみ出した文字を
 * 指でたぐれなくなる。だから溢れている面にだけ pan-y を許し、
 * overscroll-behavior: contain で「面の端まで来たらページへ渡す」のを断つ。
 */
export default function CardFace({ className, children, ...rest }) {
  const ref = useRef(null);
  const [scrollable, setScrollable] = useState(false);

  // 語が変わっても、裏返しても、文字の大きさが変わっても測り直す。
  // 依存配列を置かない（毎回の描画のあとで測る）。同じ値なら React が
  // 更新を打ち切るので、これで回り続けることはない。
  useEffect(() => {
    const face = ref.current;
    if (!face) return undefined;

    const measure = () => setScrollable(face.scrollHeight > face.clientHeight + 1);
    measure();

    // 書体の読み込みや画面の回転でも高さは変わる。
    const observer = new ResizeObserver(measure);
    observer.observe(face);
    for (const child of face.children) observer.observe(child);
    return () => observer.disconnect();
  });

  return (
    <div
      {...rest}
      ref={ref}
      className={scrollable ? `${className} is-scrollable` : className}
    >
      {children}
    </div>
  );
}
