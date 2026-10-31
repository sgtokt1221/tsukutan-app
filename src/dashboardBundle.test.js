/*
  ホームが出るまでに読む塊の番人（2026-10-31）。

  StudentDashboard から**静的に** import をたどって届くものは、ホームを出す前に
  まとめて読まれる。Chart.js（折れ線・ドーナツ）は記録タブと面接の結果でしか
  使わないので、ここへ入れるとホームの表示が遅くなる。React.lazy で読むこと。
*/
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const STATIC_IMPORT = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm;

const resolveLocal = (from, spec) => {
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  return candidates.find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) || null;
};

/** 静的 import で届くファイルと外部パッケージを集める */
const staticGraph = (entry) => {
  const files = new Set();
  const packages = new Set();
  const visit = (file) => {
    if (files.has(file) || !file.endsWith('.js')) return;
    files.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(STATIC_IMPORT)) {
      if (spec.startsWith('.')) {
        const resolved = resolveLocal(file, spec);
        if (resolved) visit(resolved);
      } else {
        packages.add(spec);
      }
    }
  };
  visit(entry);
  return { files, packages };
};

describe('ダッシュボードの最初の塊', () => {
  const { files, packages } = staticGraph(path.join(SRC, 'StudentDashboard.js'));
  const rel = (file) => path.relative(SRC, file);

  test('Chart.js を静的に読まない', () => {
    expect([...packages].filter((p) => /^(chart\.js|react-chartjs-2)/.test(p))).toEqual([]);
  });

  test('記録タブ（AnalyticsPanel）は遅延読み込み', () => {
    expect([...files].map(rel)).not.toContain(path.join('components', 'student', 'AnalyticsPanel.js'));
    const source = fs.readFileSync(path.join(SRC, 'StudentDashboard.js'), 'utf8');
    expect(source).toMatch(/React\.lazy\(\(\) => import\('\.\/components\/student\/AnalyticsPanel'\)\)/);
  });
});
