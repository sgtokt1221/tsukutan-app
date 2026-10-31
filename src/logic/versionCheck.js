/**
 * 開いたままの画面を、新しい版へ切り替える（2026-09-27）。
 *
 * つくつくは Service Worker を持たず、index.html は毎回取り直す（firebase.json）。それでも
 * **開きっぱなしの画面（ホーム画面から開いたまま・タブを閉じない）は古い JS のまま動き続ける**。
 * ビルドのたびに /version.json（本体の JS のファイル名）を書き、いま動いているものと見比べる。
 *
 *  - しばらく（AWAY_MS）離れて戻ってきたとき … 新しければその場で読み直す（勉強の途中ではないので）
 *  - 開いているあいだ … 10分ごとに見て、新しければ下に「更新」を出す（勉強の途中で勝手に変えない）
 */
export const AWAY_MS = 10 * 60 * 1000;
const INTERVAL_MS = 10 * 60 * 1000;

/** いま動いている本体の JS のファイル名。開発中（ファイル名にハッシュが無い）は null */
export function runningMainJs(doc = document) {
  const src = doc.querySelector('script[src*="/static/js/main."]')?.getAttribute('src') || '';
  const name = src.split('/').pop();
  return /^main\.[0-9a-f]+\.js$/.test(name) ? name : null;
}

/** 本番に出ている本体の JS のファイル名。読めなければ null（何もしない） */
export async function deployedMainJs(fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.mainJs === 'string' ? body.mainJs : null;
  } catch (e) {
    return null;
  }
}

function showUpdateBanner() {
  if (document.getElementById('tsukutan-update')) return;
  const button = document.createElement('button');
  button.id = 'tsukutan-update';
  button.type = 'button';
  button.textContent = '新しいつくつくがあります（押すと更新）';
  Object.assign(button.style, {
    position: 'fixed', left: '50%', bottom: 'calc(80px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
    zIndex: '10000', minHeight: '44px', padding: '0 16px', border: 'none', borderRadius: '9999px',
    background: '#183153', color: '#fff', fontSize: '16px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,.2)',
  });
  button.onclick = () => window.location.reload();
  document.body.appendChild(button);
}

export function startVersionCheck({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  const mine = runningMainJs();
  if (!mine) return () => {};
  let hiddenAt = null;
  const check = async ({ reloadIfNew }) => {
    const deployed = await deployedMainJs(fetchImpl);
    if (!deployed || deployed === mine) return;
    if (reloadIfNew) window.location.reload();
    else showUpdateBanner();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = now();
      return;
    }
    const away = hiddenAt === null ? 0 : now() - hiddenAt;
    hiddenAt = null;
    void check({ reloadIfNew: away >= AWAY_MS });
  };
  document.addEventListener('visibilitychange', onVisibility);
  const timer = setInterval(() => { void check({ reloadIfNew: false }); }, INTERVAL_MS);
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(timer);
  };
}
