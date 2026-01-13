import React, { useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import {
  setDateFilter,
  clearDateFilter,
  togglePlayerSelection,
  selectAllPlayers,
  clearPlayerSelection,
  setSortColumn,
} from '../store';
import {
  calculateAllPlayerStatistics,
  formatMoney,
  formatMoneyWithSign,
  formatPercentage,
} from '../utils/statistics';
import BalanceChart from '../components/BalanceChart';
import type { PlayerStatistics } from '../types';

const ResultsPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { players } = useAppSelector(state => state.players);
  const { sessions, playerSessions } = useAppSelector(state => state.sessions);
  const { dateFilter, selectedPlayers, sortColumn, sortDirection } = useAppSelector(
    state => state.ui
  );

  const statistics = useMemo(() => {
    return calculateAllPlayerStatistics(players, sessions, playerSessions, dateFilter);
  }, [players, sessions, playerSessions, dateFilter]);

  const sortedStatistics = useMemo(() => {
    const sorted = [...statistics].sort((a, b) => {
      const aValue = a[sortColumn as keyof PlayerStatistics] as number;
      const bValue = b[sortColumn as keyof PlayerStatistics] as number;

      if (sortDirection === 'asc') {
        return aValue - bValue;
      }
      return bValue - aValue;
    });
    return sorted;
  }, [statistics, sortColumn, sortDirection]);

  const chartData = useMemo(() => {
    return statistics.filter(s =>
      selectedPlayers.length === 0 || selectedPlayers.includes(s.playerId)
    );
  }, [statistics, selectedPlayers]);

  const handleExportCSV = () => {
    const headers = [
      'Player',
      'Total P/L',
      'Sessions',
      'Win Rate',
      'Avg Win/Loss',
      'Best Session',
      'Worst Session',
      'Variance',
      'Std Dev',
      'ROI',
    ];

    const rows = sortedStatistics.map(s => [
      s.playerName,
      s.totalProfit.toFixed(2),
      s.sessionCount,
      s.winRate.toFixed(1),
      s.avgWinLoss.toFixed(2),
      s.bestSession.toFixed(2),
      s.worstSession.toFixed(2),
      s.variance.toFixed(2),
      s.standardDeviation.toFixed(2),
      s.roi.toFixed(1),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'poker-statistics.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleToggleAll = () => {
    if (selectedPlayers.length === statistics.length) {
      dispatch(clearPlayerSelection());
    } else {
      dispatch(selectAllPlayers(statistics.map(s => s.playerId)));
    }
  };

  if (players.length === 0) {
    return (
      <div className="card-nb text-center py-12">
        <div className="text-6xl mb-4">📊</div>
        <h2 className="mb-4">No Data Yet</h2>
        <p className="text-gray-600 mb-6">
          Import a CSV file or start a new game session to see your statistics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card-nb">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-semibold mb-1">Start Date</label>
            <input
              type="date"
              value={dateFilter.startDate || ''}
              onChange={e =>
                dispatch(setDateFilter({ ...dateFilter, startDate: e.target.value || null }))
              }
              className="input-nb w-40"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">End Date</label>
            <input
              type="date"
              value={dateFilter.endDate || ''}
              onChange={e =>
                dispatch(setDateFilter({ ...dateFilter, endDate: e.target.value || null }))
              }
              className="input-nb w-40"
            />
          </div>
          <button
            onClick={() => dispatch(clearDateFilter())}
            className="btn-nb text-sm"
          >
            Clear Dates
          </button>
          <div className="ml-auto">
            <button onClick={handleExportCSV} className="btn-nb-secondary text-sm">
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Balance Chart */}
      <div className="card-nb">
        <h2 className="mb-4">Balance Over Time</h2>

        {/* Player Toggle */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={handleToggleAll}
            className={`badge-nb cursor-pointer transition-colors ${
              selectedPlayers.length === statistics.length || selectedPlayers.length === 0
                ? 'bg-nb-yellow'
                : 'bg-gray-200'
            }`}
          >
            {selectedPlayers.length === 0 ? 'All' : 'Toggle All'}
          </button>
          {statistics.map(stat => (
            <button
              key={stat.playerId}
              onClick={() => dispatch(togglePlayerSelection(stat.playerId))}
              className={`badge-nb cursor-pointer transition-colors ${
                selectedPlayers.length === 0 || selectedPlayers.includes(stat.playerId)
                  ? 'bg-nb-blue text-nb-white'
                  : 'bg-gray-200'
              }`}
            >
              {stat.playerName}
            </button>
          ))}
        </div>

        <div className="h-80">
          <BalanceChart data={chartData} />
        </div>
      </div>

      {/* Statistics Table */}
      <div className="card-nb overflow-x-auto">
        <h2 className="mb-4">Player Statistics</h2>
        <table className="table-nb">
          <thead>
            <tr>
              <th>Player</th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('totalProfit'))}
              >
                Total P/L {getSortIcon('totalProfit')}
              </th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('sessionCount'))}
              >
                Sessions {getSortIcon('sessionCount')}
              </th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('winRate'))}
              >
                Win Rate {getSortIcon('winRate')}
              </th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('avgWinLoss'))}
              >
                Avg W/L {getSortIcon('avgWinLoss')}
              </th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('bestSession'))}
              >
                Best {getSortIcon('bestSession')}
              </th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('worstSession'))}
              >
                Worst {getSortIcon('worstSession')}
              </th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('variance'))}
              >
                Variance {getSortIcon('variance')}
              </th>
              <th
                className="cursor-pointer hover:bg-gray-800"
                onClick={() => dispatch(setSortColumn('roi'))}
              >
                ROI {getSortIcon('roi')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStatistics.map(stat => (
              <tr key={stat.playerId}>
                <td className="font-semibold">{stat.playerName}</td>
                <td className={stat.totalProfit >= 0 ? 'status-positive' : 'status-negative'}>
                  {formatMoneyWithSign(stat.totalProfit)}
                </td>
                <td>{stat.sessionCount}</td>
                <td>{formatPercentage(stat.winRate)}</td>
                <td className={stat.avgWinLoss >= 0 ? 'status-positive' : 'status-negative'}>
                  {formatMoneyWithSign(stat.avgWinLoss)}
                </td>
                <td className="status-positive">{formatMoney(stat.bestSession)}</td>
                <td className="status-negative">{formatMoney(stat.worstSession)}</td>
                <td>{stat.variance.toFixed(2)}</td>
                <td className={stat.roi >= 0 ? 'status-positive' : 'status-negative'}>
                  {formatPercentage(stat.roi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsPage;
