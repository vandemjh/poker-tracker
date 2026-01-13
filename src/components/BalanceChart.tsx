import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import type { PlayerStatistics } from '../types';
import { formatMoney, formatDateShort } from '../utils/statistics';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Neo-brutalist color palette for chart lines
const CHART_COLORS = [
  '#0088FF', // Blue
  '#FF6B9D', // Pink
  '#00D26A', // Green
  '#FF9500', // Orange
  '#A855F7', // Purple
  '#00CED1', // Cyan
  '#FF3B30', // Red
  '#BFFF00', // Lime
  '#FFE500', // Yellow
  '#6366F1', // Indigo
];

interface BalanceChartProps {
  data: PlayerStatistics[];
}

const BalanceChart: React.FC<BalanceChartProps> = ({ data }) => {
  if (data.length === 0 || data.every(d => d.balanceHistory.length === 0)) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No balance history data available
      </div>
    );
  }

  // Get all unique dates across all players and sort them
  const allDates = new Set<string>();
  data.forEach(player => {
    player.balanceHistory.forEach(entry => {
      allDates.add(entry.date);
    });
  });
  const sortedDates = Array.from(allDates).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  // Create labels from dates
  const labels = sortedDates.map(date => formatDateShort(date));

  // Create dataset for each player
  const datasets = data.map((player, index) => {
    const color = CHART_COLORS[index % CHART_COLORS.length];

    // Create a map of date to balance for this player
    const balanceMap = new Map<string, number>();
    player.balanceHistory.forEach(entry => {
      balanceMap.set(entry.date, entry.balance);
    });

    // Fill in data points, carrying forward the last known balance
    let lastBalance = 0;
    const dataPoints = sortedDates.map(date => {
      if (balanceMap.has(date)) {
        lastBalance = balanceMap.get(date)!;
      }
      // Only show data points where this player participated
      return balanceMap.has(date) ? lastBalance : null;
    });

    // For a continuous line, we need to fill gaps
    // Find first and last non-null indices
    let firstIndex = dataPoints.findIndex(d => d !== null);
    let lastIndex = dataPoints.length - 1;
    for (let i = dataPoints.length - 1; i >= 0; i--) {
      if (dataPoints[i] !== null) {
        lastIndex = i;
        break;
      }
    }

    // Fill in gaps between first and last
    let runningBalance = 0;
    const filledData = dataPoints.map((point, i) => {
      if (i < firstIndex) return null;
      if (i > lastIndex) return null;
      if (point !== null) {
        runningBalance = point;
        return point;
      }
      return runningBalance;
    });

    return {
      label: player.playerName,
      data: filledData,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.1,
      spanGaps: true,
    };
  });

  const chartData = {
    labels,
    datasets,
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            family: 'Inter, system-ui, sans-serif',
            weight: 'bold',
          },
          padding: 16,
          usePointStyle: true,
          pointStyle: 'rectRounded',
        },
      },
      tooltip: {
        backgroundColor: '#000',
        titleFont: {
          family: 'Space Grotesk, system-ui, sans-serif',
          weight: 'bold',
        },
        bodyFont: {
          family: 'Inter, system-ui, sans-serif',
        },
        padding: 12,
        cornerRadius: 0,
        borderColor: '#000',
        borderWidth: 2,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            return `${context.dataset.label}: ${formatMoney(value)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: '#e5e5e5',
        },
        ticks: {
          font: {
            family: 'Inter, system-ui, sans-serif',
          },
        },
      },
      y: {
        grid: {
          color: '#e5e5e5',
        },
        ticks: {
          font: {
            family: 'Inter, system-ui, sans-serif',
          },
          callback: (value) => formatMoney(value as number),
        },
      },
    },
  };

  return <Line data={chartData} options={options} />;
};

export default BalanceChart;
