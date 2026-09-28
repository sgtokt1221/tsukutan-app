/**
 * Jev の採点が「堅く・順序どおり」になっているかを、公開前に確かめる（2026-09-26）。
 *
 * 使い方（鍵は環境変数で渡す。ファイルに書かない）:
 *   JEV_API_KEY=... node functions/scripts/eval-writing.js
 *
 * 級ごとに「よい答え」と、わざと崩した答え（理由1つ・短縮形だらけ・話題外・語数不足）を流し、
 * 合計点が よい答え > 崩した答え の順になるか、話題外が0点になるかを見る。
 * よい答えは塾の「ライティング道場」の型（主張→理由2つ→まとめ）に沿って書いたもの。
 */
const { scoreWriting } = require('../lib/writingScore');

const CASES = [
  {
    grade: '3',
    task: 'opinion',
    prompt: { question: 'Which do you like better, summer or winter?' },
    answers: {
      good: 'I like summer better than winter. I have two reasons. First, I can enjoy outdoor activities in summer. Second, it is fun to swim in the sea with my friends. That is why I like summer.',
      oneReason: 'I like summer better than winter. I like summer because I can swim in the sea with my friends. It is fun. I often go to the beach. That is why I like summer the best.',
      contractions: "I'm a summer person. It's hot but I don't mind. First, I can't swim in winter. Second, it's fun to eat ice cream. That's why I'm happy in summer.",
      offTopic: 'My favorite food is sushi. I eat it with my family every weekend. It is delicious and healthy. My father makes it very well at home.',
      short: 'I like summer. It is fun.',
    },
  },
  {
    grade: 'pre2',
    task: 'opinion',
    prompt: { question: 'Do you think it is a good idea for students to study in the morning before school?' },
    answers: {
      good: 'Yes. I think that it is a good idea for students to study in the morning. I have two reasons. First, they can concentrate on studying because it is quiet in the morning. Second, it will be a good habit, and it helps them get good grades. For the reasons mentioned above, I believe that students had better study before school.',
      oneReason: 'Yes. I think that it is a good idea for students to study in the morning. It is quiet in the morning, so students can concentrate on studying well. Studying in the quiet morning is very good. For this reason, I believe that students should study in the morning before school.',
      contractions: "Yes. I think it's a good idea. First, it's quiet so students can't be disturbed. Second, they'll get good grades. That's why I'm sure it's good for students to study in the morning before they go to school every day.",
      offTopic: 'I like playing soccer with my friends after school. Soccer is a very popular sport in Japan and many people watch games on TV. My favorite player is from Brazil and he is very fast. I want to be a soccer player in the future.',
      short: 'Yes. It is quiet in the morning. It is good.',
    },
  },
  {
    grade: '2',
    task: 'opinion',
    prompt: {
      question: 'Some people say that all supermarkets should use self-checkout machines. Do you agree with this opinion?',
      points: ['Staff shortages', 'Elderly people', 'Time'],
    },
    answers: {
      good: 'I agree with this opinion. I have two reasons for feeling this way. First, many supermarkets suffer from staff shortages. By using self-checkout machines, they can run their stores with fewer workers, and the workers can focus on other important tasks. Second, customers can save time. They do not have to wait in long lines, so shopping becomes more convenient, especially when they are busy. For the reasons mentioned above, I believe that all supermarkets should introduce self-checkout machines.',
      oneReason: 'I agree with this opinion. Many supermarkets suffer from staff shortages these days, and it is difficult for them to hire new workers. Self-checkout machines can solve this problem because stores need fewer workers. This is a very serious problem for many stores in Japan. For this reason, I believe that all supermarkets should use self-checkout machines in the future.',
      contractions: "I agree. It's true that stores don't have enough workers, and they can't hire people easily. First, machines'll help them. Second, customers won't wait long. It's convenient and they'll save time. That's why I'm sure it's a good idea for all supermarkets to use self-checkout machines in the future.",
      offTopic: 'Japan has many beautiful places to visit, such as Kyoto and Hokkaido. Many tourists come to Japan every year to enjoy traditional culture and delicious food. Tourism is very important for the Japanese economy, and the government should promote it more. I want to travel around Japan with my family someday and see many temples and festivals.',
      short: 'I agree. It saves time for customers.',
    },
  },
];

const main = async () => {
  const apiKey = process.env.JEV_API_KEY;
  if (!apiKey) {
    console.error('JEV_API_KEY を環境変数で渡してください');
    process.exit(1);
  }
  let problems = 0;
  for (const c of CASES) {
    const results = {};
    for (const [kind, answer] of Object.entries(c.answers)) {
      // eslint-disable-next-line no-await-in-loop
      const r = await scoreWriting({ grade: c.grade, task: c.task, prompt: c.prompt, answer }, { apiKey });
      results[kind] = r;
      console.log(`${c.grade} ${c.task} ${kind.padEnd(12)} ${String(r.total).padStart(2)}/${r.max}  ${JSON.stringify(r.scores)}  ${r.flags.join(',')}`);
    }
    const good = results.good.total;
    for (const kind of ['oneReason', 'contractions', 'offTopic', 'short']) {
      if (results[kind].total >= good) {
        problems += 1;
        console.log(`  ✗ ${kind} が よい答え（${good}）以上`);
      }
    }
    if (results.offTopic.total !== 0) {
      problems += 1;
      console.log('  ✗ 話題外が0点になっていない');
    }
  }
  console.log(problems === 0 ? '\nすべて期待どおり' : `\n期待と違うもの ${problems} 件`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
