/**
 * 「先頭へ戻る」で実際に動かす要素を探す。
 *
 * 単語帳の外枠（.wordbook-shell）自身がスクロールしていた頃は
 * それを動かせばよかったが、いまはスクロールするのは親の .card-main。
 * 枠に scrollTo しても何も起きないので、実際にスクロールしている
 * 先祖まで辿る。
 */
export const scrollingAncestorOf = (element) => {
  let node = element?.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
};

/** 単語帳を先頭まで戻す。 */
export const scrollWordbookToTop = (shell) => {
  const target = shell && shell.scrollHeight > shell.clientHeight
    ? shell
    : scrollingAncestorOf(shell);
  target?.scrollTo({ top: 0, behavior: 'smooth' });
};
