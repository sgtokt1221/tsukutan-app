/**
 * functions/lib/studentImport.js
 *
 * 生徒CSVの解析・正規化・検証・差分計算。
 * Firebase に依存しない純粋関数だけを置く（そのままユニットテストできるようにするため）。
 *
 * 設計方針（IMPLEMENTATION_PLAN.md 7章）
 *   - 全行の検証が通るまで、呼び出し側は1件も書き込まない
 *   - CSVにいない生徒を勝手に削除しない
 *   - 既存生徒のパスワードは再設定しない（このモジュールはパスワードを一切扱わない）
 */

const Papa = require('papaparse');
const iconv = require('iconv-lite');

// 保存される学年の表記。src/AdminDashboard.js の GRADE_SELECT_OPTIONS と同じ集合。
const CANONICAL_GRADES = [
  '小1', '小2', '小3', '小4', '小5', '小6',
  '中1', '中2', '中3',
  '高1', '高2', '高3',
];

const REQUIRED_HEADERS = ['ID', '氏名', '学年'];

// 10MB。Functions の express.json 上限と合わせる。
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const toHalfWidthDigits = (value) =>
  String(value).replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

/**
 * Shift_JIS を優先して復号し、置換文字が出たら UTF-8 とみなす。
 * 教室で作られるCSVは Excel 由来の Shift_JIS が多いが、UTF-8 も混ざるため。
 */
const decodeCsv = (buffer) => {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`CSVが大きすぎます（${Math.round(buffer.length / 1024)}KB / 上限 ${MAX_FILE_BYTES / 1024}KB）`);
  }

  let text;
  try {
    text = iconv.decode(buffer, 'shift_jis');
    if (text.includes('�')) {
      text = buffer.toString('utf8');
    }
  } catch (error) {
    text = buffer.toString('utf8');
  }

  // Excel が付ける BOM を除去
  return text.replace(/^﻿/, '');
};

/** 3〜4桁の数字を4桁ゼロ埋めへ。条件を満たさなければ null。 */
const normalizeStudentId = (raw) => {
  const value = toHalfWidthDigits(String(raw == null ? '' : raw)).trim();
  if (!/^\d{3,4}$/.test(value)) return null;
  return value.padStart(4, '0');
};

/** 学年の揺れを保存用の表記へ寄せる。寄せられなければ null。 */
const normalizeGrade = (raw) => {
  const value = toHalfWidthDigits(String(raw == null ? '' : raw))
    .replace(/\s+/g, '')
    .trim();
  if (!value) return null;

  const patterns = [
    { re: /^小([1-6])$/, prefix: '小' },
    { re: /^小学([1-6])年?生?$/, prefix: '小' },
    { re: /^中([1-3])$/, prefix: '中' },
    { re: /^中学([1-3])年?生?$/, prefix: '中' },
    { re: /^高([1-3])$/, prefix: '高' },
    { re: /^高校([1-3])年?生?$/, prefix: '高' },
  ];

  for (const { re, prefix } of patterns) {
    const match = value.match(re);
    if (match) return `${prefix}${match[1]}`;
  }
  return null;
};

const normalizeName = (raw) => String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();

/**
 * CSVテキストを行の配列へ。エラーは行番号つきで返し、途中で例外を投げない。
 *
 * @returns {{rows: Array, errors: Array<{line: number|null, message: string}>, warnings: Array}}
 */
const parseStudentCsv = (text) => {
  const errors = [];
  const warnings = [];
  const rows = [];

  // 先に弾いておかないと、Papa の「区切り文字を検出できません」という
  // 現場では意味の分からないメッセージが返ってしまう。
  if (String(text || '').trim() === '') {
    errors.push({ line: null, message: 'CSVが空です。' });
    return { rows, errors, warnings };
  }

  const parsed = Papa.parse(text, { skipEmptyLines: 'greedy' });

  for (const problem of parsed.errors || []) {
    // Papa の row は 0 始まり。ヘッダー行を足して人が読む行番号にする。
    errors.push({
      line: typeof problem.row === 'number' ? problem.row + 1 : null,
      message: `CSVの構造が壊れています: ${problem.message}`,
    });
  }

  const table = parsed.data || [];
  if (table.length === 0) {
    errors.push({ line: null, message: 'CSVが空です。' });
    return { rows, errors, warnings };
  }

  const header = table[0].map((cell) => String(cell == null ? '' : cell).trim());
  const missingHeaders = REQUIRED_HEADERS.filter((name) => !header.includes(name));
  if (missingHeaders.length) {
    errors.push({
      line: 1,
      message: `必須ヘッダーがありません: ${missingHeaders.join(', ')}（1行目に ${REQUIRED_HEADERS.join(', ')} が必要です）`,
    });
    return { rows, errors, warnings };
  }

  const idIndex = header.indexOf('ID');
  const nameIndex = header.indexOf('氏名');
  const gradeIndex = header.indexOf('学年');

  const seenIds = new Map();

  for (let i = 1; i < table.length; i += 1) {
    const line = i + 1; // 1始まりの行番号
    const row = table[i] || [];
    const isBlank = row.every((cell) => String(cell == null ? '' : cell).trim() === '');
    if (isBlank) continue;

    const rawId = row[idIndex];
    const rawName = row[nameIndex];
    const rawGrade = row[gradeIndex];

    const studentId = normalizeStudentId(rawId);
    const name = normalizeName(rawName);
    const grade = normalizeGrade(rawGrade);

    let rowHasError = false;

    if (!studentId) {
      errors.push({ line, message: `IDが不正です（3〜4桁の数字が必要）: "${String(rawId ?? '')}"` });
      rowHasError = true;
    } else if (seenIds.has(studentId)) {
      errors.push({ line, message: `IDが重複しています: ${studentId}（${seenIds.get(studentId)}行目と同じ）` });
      rowHasError = true;
    }

    if (!name) {
      errors.push({ line, message: '氏名が空です。' });
      rowHasError = true;
    }

    if (!grade) {
      errors.push({
        line,
        message: `学年を判別できません: "${String(rawGrade ?? '')}"（例: ${CANONICAL_GRADES.join(' / ')}）`,
      });
      rowHasError = true;
    }

    if (rowHasError) continue;

    seenIds.set(studentId, line);
    if (String(rawId).trim() !== studentId) {
      warnings.push({ line, message: `ID ${String(rawId).trim()} を ${studentId} に正規化しました。` });
    }
    rows.push({ line, studentId, name, grade });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ line: null, message: 'CSVに有効なデータ行がありません。' });
  }

  return { rows, errors, warnings };
};

/**
 * 解析済みの行と既存生徒を突き合わせて、実行内容を確定させる。
 *
 * @param {Array} rows                      parseStudentCsv の rows
 * @param {Array<{uid, studentId, name, grade}>} existing 既存の生徒（studentId を持つ users 文書）
 * @param {'upsert'|'replace'} mode
 */
const buildImportPlan = (rows, existing, mode = 'upsert') => {
  const byStudentId = new Map();
  for (const student of existing) {
    if (!student.studentId) continue;
    byStudentId.set(student.studentId, student);
  }

  const create = [];
  const update = [];
  const unchanged = [];

  for (const row of rows) {
    const current = byStudentId.get(row.studentId);
    if (!current) {
      create.push(row);
      continue;
    }

    const changes = {};
    if (current.name !== row.name) changes.name = { from: current.name ?? null, to: row.name };
    if (current.grade !== row.grade) changes.grade = { from: current.grade ?? null, to: row.grade };

    if (Object.keys(changes).length === 0) {
      unchanged.push({ ...row, uid: current.uid });
    } else {
      update.push({ ...row, uid: current.uid, changes });
    }
  }

  const csvIds = new Set(rows.map((row) => row.studentId));
  const missing = existing.filter((student) => student.studentId && !csvIds.has(student.studentId));

  // upsert では触らない。replace でも削除はせず、無効化の候補として返すだけ。
  const disableCandidates = missing.map((student) => ({
    uid: student.uid,
    studentId: student.studentId,
    name: student.name ?? null,
    grade: student.grade ?? null,
  }));

  return {
    mode,
    create,
    update,
    unchanged,
    disableCandidates,
    summary: {
      create: create.length,
      update: update.length,
      unchanged: unchanged.length,
      disableCandidates: mode === 'replace' ? disableCandidates.length : 0,
      errors: 0,
    },
  };
};

module.exports = {
  CANONICAL_GRADES,
  REQUIRED_HEADERS,
  MAX_FILE_BYTES,
  decodeCsv,
  normalizeStudentId,
  normalizeGrade,
  normalizeName,
  parseStudentCsv,
  buildImportPlan,
};
