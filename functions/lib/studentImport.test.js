const iconv = require('iconv-lite');
const {
  decodeCsv,
  normalizeStudentId,
  normalizeGrade,
  parseStudentCsv,
  buildImportPlan,
} = require('./studentImport');

const csv = (lines) => lines.join('\n');
const HEADER = 'ID,氏名,学年';

describe('normalizeStudentId', () => {
  test('3桁は4桁へゼロ埋めする', () => {
    expect(normalizeStudentId('203')).toBe('0203');
  });

  test('4桁はそのまま', () => {
    expect(normalizeStudentId('1203')).toBe('1203');
  });

  test('全角数字も受け付ける', () => {
    expect(normalizeStudentId('１２０３')).toBe('1203');
  });

  test('前後の空白を無視する', () => {
    expect(normalizeStudentId('  1203 ')).toBe('1203');
  });

  test('桁数違い・数字以外は null', () => {
    expect(normalizeStudentId('12')).toBeNull();
    expect(normalizeStudentId('12345')).toBeNull();
    expect(normalizeStudentId('12a3')).toBeNull();
    expect(normalizeStudentId('')).toBeNull();
    expect(normalizeStudentId(null)).toBeNull();
  });
});

describe('normalizeGrade', () => {
  test('保存表記はそのまま通る', () => {
    expect(normalizeGrade('中1')).toBe('中1');
    expect(normalizeGrade('高3')).toBe('高3');
    expect(normalizeGrade('小6')).toBe('小6');
  });

  test('揺れを保存表記へ寄せる', () => {
    expect(normalizeGrade('中学1年')).toBe('中1');
    expect(normalizeGrade('中学１年生')).toBe('中1');
    expect(normalizeGrade('高校2年生')).toBe('高2');
    expect(normalizeGrade('小学 3 年')).toBe('小3');
    expect(normalizeGrade('中３')).toBe('中3');
  });

  test('範囲外・判別不能は null', () => {
    expect(normalizeGrade('中4')).toBeNull();
    expect(normalizeGrade('大1')).toBeNull();
    expect(normalizeGrade('浪人')).toBeNull();
    expect(normalizeGrade('')).toBeNull();
  });
});

describe('decodeCsv', () => {
  test('Shift_JIS を復号できる', () => {
    const buffer = iconv.encode(csv([HEADER, '1203,山田太郎,中1']), 'shift_jis');
    expect(decodeCsv(buffer)).toContain('山田太郎');
  });

  test('UTF-8 にフォールバックする', () => {
    const buffer = Buffer.from(csv([HEADER, '1203,山田太郎,中1']), 'utf8');
    expect(decodeCsv(buffer)).toContain('山田太郎');
  });

  test('BOM を落とす', () => {
    const buffer = Buffer.from(`﻿${csv([HEADER, '1203,山田太郎,中1'])}`, 'utf8');
    expect(decodeCsv(buffer).startsWith('ID')).toBe(true);
  });

  test('上限を超えるファイルは例外', () => {
    expect(() => decodeCsv(Buffer.alloc(11 * 1024 * 1024))).toThrow(/大きすぎます/);
  });
});

describe('parseStudentCsv', () => {
  test('正常なCSVを行へ変換する', () => {
    const { rows, errors } = parseStudentCsv(csv([HEADER, '1203,山田太郎,中1', '204,佐藤花子,高2']));
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, studentId: '1203', name: '山田太郎', grade: '中1' },
      { line: 3, studentId: '0204', name: '佐藤花子', grade: '高2' },
    ]);
  });

  test('列の順序が違っても読める', () => {
    const { rows, errors } = parseStudentCsv(csv(['学年,ID,氏名', '中1,1203,山田太郎']));
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ studentId: '1203', name: '山田太郎', grade: '中1' });
  });

  test('必須ヘッダーが無ければ行を1件も返さない', () => {
    const { rows, errors } = parseStudentCsv(csv(['番号,名前', '1203,山田太郎']));
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/必須ヘッダー/);
  });

  test('空CSVはエラー', () => {
    expect(parseStudentCsv('').errors[0].message).toMatch(/空/);
  });

  test('ID重複を行番号つきで報告する', () => {
    const { errors } = parseStudentCsv(csv([HEADER, '1203,山田太郎,中1', '1203,別人,中2']));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 3 });
    expect(errors[0].message).toMatch(/重複/);
  });

  test('3桁と4桁のゼロ埋め後の衝突も重複として扱う', () => {
    const { errors } = parseStudentCsv(csv([HEADER, '203,山田太郎,中1', '0203,別人,中2']));
    expect(errors[0].message).toMatch(/重複/);
  });

  test('不正な行だけをエラーにし、他は通す', () => {
    const { rows, errors } = parseStudentCsv(
      csv([HEADER, '1203,山田太郎,中1', 'abc,鈴木一郎,中2', '1205,,高1', '1206,田中,宇宙2'])
    );
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(errors[0].message).toMatch(/IDが不正/);
    expect(errors[1].message).toMatch(/氏名が空/);
    expect(errors[2].message).toMatch(/学年/);
  });

  test('空行は無視する', () => {
    const { rows, errors } = parseStudentCsv(csv([HEADER, '1203,山田太郎,中1', '', '   ', '1204,佐藤,中2']));
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  test('ID正規化は警告として残す', () => {
    const { warnings } = parseStudentCsv(csv([HEADER, '203,山田太郎,中1']));
    expect(warnings[0].message).toMatch(/0203/);
  });
});

describe('buildImportPlan', () => {
  const existing = [
    { uid: 'uid-a', studentId: '1203', name: '山田太郎', grade: '中1' },
    { uid: 'uid-b', studentId: '1204', name: '佐藤花子', grade: '高2' },
  ];

  test('新規・更新・変更なしを振り分ける', () => {
    const rows = [
      { line: 2, studentId: '1203', name: '山田太郎', grade: '中1' }, // 変更なし
      { line: 3, studentId: '1204', name: '佐藤花子', grade: '高3' }, // 学年が変わった
      { line: 4, studentId: '1205', name: '鈴木一郎', grade: '中2' }, // 新規
    ];
    const plan = buildImportPlan(rows, existing, 'upsert');

    expect(plan.summary).toMatchObject({ create: 1, update: 1, unchanged: 1 });
    expect(plan.create[0].studentId).toBe('1205');
    expect(plan.update[0].uid).toBe('uid-b');
    expect(plan.update[0].changes).toEqual({ grade: { from: '高2', to: '高3' } });
  });

  test('upsert では CSV にいない生徒を無効化候補に数えない', () => {
    const rows = [{ line: 2, studentId: '1203', name: '山田太郎', grade: '中1' }];
    const plan = buildImportPlan(rows, existing, 'upsert');

    expect(plan.summary.disableCandidates).toBe(0);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(0);
  });

  test('replace では無効化候補として挙げるが削除対象にはしない', () => {
    const rows = [{ line: 2, studentId: '1203', name: '山田太郎', grade: '中1' }];
    const plan = buildImportPlan(rows, existing, 'replace');

    expect(plan.summary.disableCandidates).toBe(1);
    expect(plan.disableCandidates[0]).toMatchObject({ uid: 'uid-b', studentId: '1204' });
    expect(plan).not.toHaveProperty('delete');
  });

  test('studentId を持たない文書は生徒として扱わない', () => {
    const withAdmin = [...existing, { uid: 'uid-admin', name: '管理者' }];
    const plan = buildImportPlan([], withAdmin, 'replace');

    expect(plan.disableCandidates.map((c) => c.uid)).toEqual(['uid-a', 'uid-b']);
  });

  test('空のCSVでも既存生徒を作成・更新対象にしない', () => {
    const plan = buildImportPlan([], existing, 'upsert');
    expect(plan.summary).toMatchObject({ create: 0, update: 0, unchanged: 0, disableCandidates: 0 });
  });
});
