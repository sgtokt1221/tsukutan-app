import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { getTokyoDateKey } from '../../logic/dateKeys';

// 折れ線に必要な部品だけ登録する。管理画面は円グラフ用に別途登録している。
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const BRAND_LIME = '#A3E635';
const INK_OLIVE = '#36421E';
const GRID = 'rgba(54, 66, 30, 0.10)';

/**
 * きろくページの推移グラフ。
 *
 * accuracyTrend / levelProgression は前から計算されていたのに
 * どこにも出していなかった。数字だけ並ぶ画面になっていた原因。
 *
 * @param {Array<{date: Date|string, value: number}>} points 古い順
 */
export default function TrendChart({ points, label, unit = '', max, min = 0, height = 160 }) {
  const data = useMemo(() => ({
    labels: points.map((p) => {
      const key = getTokyoDateKey(p.date instanceof Date ? p.date : new Date(p.date));
      return key.slice(5).replace('-', '/'); // 08/09
    }),
    datasets: [
      {
        label,
        data: points.map((p) => p.value),
        borderColor: INK_OLIVE,
        backgroundColor: 'rgba(163, 230, 53, 0.28)',
        pointBackgroundColor: BRAND_LIME,
        pointBorderColor: INK_OLIVE,
        pointRadius: points.length > 20 ? 0 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        fill: true,
        tension: 0.3,
      },
    ],
  }), [points, label]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${label}: ${Math.round(ctx.parsed.y * 10) / 10}${unit}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: 'rgba(54, 66, 30, 0.68)', maxTicksLimit: 6, font: { size: 10 } },
      },
      y: {
        min,
        max,
        grid: { color: GRID },
        border: { display: false },
        ticks: { color: 'rgba(54, 66, 30, 0.68)', maxTicksLimit: 4, font: { size: 10 } },
      },
    },
  }), [label, unit, max, min]);

  if (!points || points.length < 2) return null;

  return (
    <div className="trend-chart" style={{ height }}>
      <Line data={data} options={options} aria-label={`${label}の推移`} />
    </div>
  );
}
