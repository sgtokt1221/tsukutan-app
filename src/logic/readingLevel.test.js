import { readingGradeFor, EIKEN_ORDER } from './readingLevel';

const ALL = EIKEN_ORDER;

test('学年で決まる。中1は5級、高3は2級', () => {
  expect(readingGradeFor({ schoolGrade: '中1', available: ALL })).toBe('5');
  expect(readingGradeFor({ schoolGrade: '中2', available: ALL })).toBe('4');
  expect(readingGradeFor({ schoolGrade: '中3', available: ALL })).toBe('3');
  expect(readingGradeFor({ schoolGrade: '高1', available: ALL })).toBe('pre2');
  expect(readingGradeFor({ schoolGrade: '高3', available: ALL })).toBe('2');
});

test('小学生は中1と同じ5級から', () => {
  expect(readingGradeFor({ schoolGrade: '小4', available: ALL })).toBe('5');
});

test('学年が分からなければ5級から', () => {
  expect(readingGradeFor({ available: ALL })).toBe('5');
  expect(readingGradeFor({ schoolGrade: '大1', available: ALL })).toBe('5');
});

test('本人の力が学年より上なら、そちらに寄せる', () => {
  // 中1（既定5級）でも、語彙力チェックが4なら準2級
  expect(readingGradeFor({ schoolGrade: '中1', abilityLevel: 4, available: ALL })).toBe('pre2');
});

test('力が学年より下でも下げない', () => {
  // 学校の授業についていけなくなる。下げるのは本人が選んだときだけ。
  expect(readingGradeFor({ schoolGrade: '高3', abilityLevel: 1, available: ALL })).toBe('2');
});

test('目標がもっと上なら、目標に合わせる', () => {
  expect(readingGradeFor({
    schoolGrade: '中2', goalTargets: [{ goalId: 'eiken-2' }], available: ALL,
  })).toBe('2');
});

test('英検以外の目標は級を動かさない', () => {
  expect(readingGradeFor({
    schoolGrade: '中2', goalTargets: [{ goalId: 'highschool-60' }], available: ALL,
  })).toBe('4');
});

test('用意の無い級には寄せず、その下で一番難しい級に落とす', () => {
  // 準1級の長文をまだ書いていない状態
  expect(readingGradeFor({
    schoolGrade: '高3', abilityLevel: 7, available: ['5', '4', '3', 'pre2', '2'],
  })).toBe('2');
  // 3級までしか無ければ3級
  expect(readingGradeFor({ schoolGrade: '高3', available: ['5', '4', '3'] })).toBe('3');
});
