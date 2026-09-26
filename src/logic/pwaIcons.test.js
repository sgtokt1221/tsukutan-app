/**
 * ホーム画面（PWA）のアイコン。
 *
 * **iOS は透明を黒で塗ってから、自分で角を丸める。** 角の丸い（＝角が透明な）
 * アイコンを渡すと、丸めた外側に黒い三角が残って壊れて見える。
 * 画面では気づけない——ホーム画面に入れて初めて分かる。
 *
 * PNG は `scripts/build-icons.mjs` が `public/tsukutsuku-icon.svg` から作る。
 * 手で差し替えない。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');

/** PNG のヘッダから 幅・高さ・色の種類 を読む */
const pngInfo = (name) => {
  const buf = readFileSync(join(PUBLIC, name));
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],   // 6 = RGBA（透過あり）/ 4 = グレー+透過
  };
};

const hasAlpha = (info) => info.colorType === 4 || info.colorType === 6;

const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8'));
const html = readFileSync(join(PUBLIC, 'index.html'), 'utf8');

describe('iOS のホーム画面', () => {
  it('**`apple-touch-icon` を指している**（無いとホーム画面が白紙になる）', () => {
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="[^"]*apple-touch-icon\.png"/);
  });

  it('180px で渡す', () => {
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*sizes="180x180"/);
    const info = pngInfo('apple-touch-icon.png');
    expect([info.width, info.height]).toEqual([180, 180]);
  });

  it('**透明を持たない。** 持つと角が黒くなる', () => {
    expect(hasAlpha(pngInfo('apple-touch-icon.png'))).toBe(false);
  });

  it('**角が透明な `logo192.png` を渡さない**（これが黒い三角の元）', () => {
    expect(html).not.toMatch(/rel="apple-touch-icon"[^>]*logo192/);
  });
});

describe('Android の切り抜き', () => {
  const maskable = manifest.icons.filter((i) => String(i.purpose || '').includes('maskable'));

  it('切り抜かれる用のアイコンがある', () => {
    expect(maskable).toHaveLength(1);
    expect(maskable[0].sizes).toBe('512x512');
  });

  it('**透明を持たない。** 切り抜きの外が抜ける', () => {
    expect(hasAlpha(pngInfo(maskable[0].src))).toBe(false);
  });

  it('ふつうの用途のアイコンも残す（切り抜かない端末ぶん）', () => {
    expect(manifest.icons.some((i) => String(i.purpose || 'any').includes('any'))).toBe(true);
  });
});

describe('マニフェスト', () => {
  it('ホーム画面のアプリとして開く', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
  });

  it('書いてあるアイコンが実在して、大きさも合っている', () => {
    for (const icon of manifest.icons) {
      const info = pngInfo(icon.src);
      expect(`${info.width}x${info.height}`).toBe(icon.sizes);
    }
  });
});
