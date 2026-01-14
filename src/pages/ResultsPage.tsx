import React, { useMemo, useState } from 'react';
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
  const { dateFilter, selectedPlayers, sortColumn, sortDirection, isInitializing } = useAppSelector(
    state => state.ui
  );

  const [showAllGames, setShowAllGames] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);

  const statistics = useMemo(() => {
    return calculateAllPlayerStatistics(players, sessions, playerSessions, dateFilter);
  }, [players, sessions, playerSessions, dateFilter]);

  // Sort statistics by session count to get top 10 players
  const sortedByGames = useMemo(() => {
    return [...statistics].sort((a, b) => b.sessionCount - a.sessionCount);
  }, [statistics]);

  const top10Players = useMemo(() => sortedByGames.slice(0, 10), [sortedByGames]);
  const otherPlayers = useMemo(() => sortedByGames.slice(10), [sortedByGames]);

  // Filter other players by search term
  const filteredOtherPlayers = useMemo(() => {
    if (!playerSearch) return otherPlayers;
    return otherPlayers.filter(p =>
      p.playerName.toLowerCase().includes(playerSearch.toLowerCase())
    );
  }, [otherPlayers, playerSearch]);

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

  // Limit chart data to last 20 games unless showAllGames is true
  const limitedChartData = useMemo(() => {
    if (showAllGames) return chartData;

    return chartData.map(player => ({
      ...player,
      balanceHistory: player.balanceHistory.slice(-20),
    }));
  }, [chartData, showAllGames]);

  // Count total games in the data
  const totalGames = useMemo(() => {
    const allDates = new Set<string>();
    chartData.forEach(player => {
      player.balanceHistory.forEach(entry => {
        allDates.add(entry.date);
      });
    });
    return allDates.size;
  }, [chartData]);

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

  const handleSelectOtherPlayer = (playerId: string) => {
    dispatch(togglePlayerSelection(playerId));
    setPlayerSearch('');
    setShowPlayerDropdown(false);
  };

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div className="card-nb text-center py-12">
        <div className="animate-spin w-12 h-12 border-4 border-theme border-t-nb-yellow mx-auto mb-4 rounded-full"></div>
        <h2 className="mb-4">Loading...</h2>
        <p className="text-theme-secondary">Checking for saved data...</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="card-nb text-center py-12">
        <div className="text-6xl mb-4">📊</div>
        <h2 className="mb-4">No Data Yet</h2>
        <p className="text-theme-secondary mb-6">
          Link a Google Sheet or start a new game session to see your statistics.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Chart */}
      <div className="card-nb">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2>Balance Over Time</h2>

          {/* Date Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="date"
              value={dateFilter.startDate || ''}
              onChange={e =>
                dispatch(setDateFilter({ ...dateFilter, startDate: e.target.value || null }))
              }
              className="input-nb w-36 py-1 text-sm"
              title="Start Date"
            />
            <span className="text-theme-secondary">to</span>
            <input
              type="date"
              value={dateFilter.endDate || ''}
              onChange={e =>
                dispatch(setDateFilter({ ...dateFilter, endDate: e.target.value || null }))
              }
              className="input-nb w-36 py-1 text-sm"
              title="End Date"
            />
            {(dateFilter.startDate || dateFilter.endDate) && (
              <button
                onClick={() => dispatch(clearDateFilter())}
                className="text-sm text-theme-secondary hover:text-nb-red"
                title="Clear date filter"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Player Toggle */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <button
            onClick={handleToggleAll}
            className={`badge-nb cursor-pointer transition-colors ${
              selectedPlayers.length === statistics.length || selectedPlayers.length === 0
                ? 'bg-nb-yellow text-nb-black'
                : 'bg-theme-card'
            }`}
          >
            {selectedPlayers.length === 0 ? 'All' : 'Toggle All'}
          </button>
          {top10Players.map(stat => (
            <button
              key={stat.playerId}
              onClick={() => dispatch(togglePlayerSelection(stat.playerId))}
              className={`badge-nb cursor-pointer transition-colors ${
                selectedPlayers.length === 0 || selectedPlayers.includes(stat.playerId)
                  ? 'bg-nb-blue text-nb-white'
                  : 'bg-theme-card'
              }`}
            >
              {stat.playerName}
            </button>
          ))}

          {/* Dropdown for other players */}
          {otherPlayers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowPlayerDropdown(!showPlayerDropdown)}
                className="badge-nb cursor-pointer transition-colors bg-theme-card"
              >
                +{otherPlayers.length} more
              </button>

              {showPlayerDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowPlayerDropdown(false);
                      setPlayerSearch('');
                    }}
                  />
                  <div
                    className="absolute top-full left-0 mt-1 w-64 border-3 z-50 max-h-64 overflow-y-auto"
                    style={{
                      backgroundColor: 'var(--color-bg-card)',
                      borderColor: 'var(--color-border)',
                      boxShadow: '4px 4px 0px 0px var(--color-shadow)',
                    }}
                  >
                    <div className="p-2 border-b-2" style={{ borderColor: 'var(--color-border)' }}>
                      <input
                        type="text"
                        placeholder="Search players..."
                        value={playerSearch}
                        onChange={e => setPlayerSearch(e.target.value)}
                        className="input-nb py-1 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredOtherPlayers.map(stat => (
                        <button
                          key={stat.playerId}
                          onClick={() => handleSelectOtherPlayer(stat.playerId)}
                          className={`w-full text-left px-3 py-2 hover:bg-nb-yellow hover:text-nb-black transition-colors flex items-center justify-between ${
                            selectedPlayers.includes(stat.playerId) ? 'bg-nb-blue text-nb-white' : ''
                          }`}
                        >
                          <span>{stat.playerName}</span>
                          <span className="text-xs opacity-70">{stat.sessionCount} games</span>
                        </button>
                      ))}
                      {filteredOtherPlayers.length === 0 && (
                        <div className="px-3 py-2 text-theme-secondary text-sm">No players found</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="h-80">
          <BalanceChart data={limitedChartData} />
        </div>

        {/* Show more games option */}
        {totalGames > 20 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAllGames(!showAllGames)}
              className="text-sm text-nb-blue hover:underline"
            >
              {showAllGames
                ? `Show last 20 games`
                : `Show all ${totalGames} games`}
            </button>
          </div>
        )}
      </div>

      {/* Statistics Table */}
      <div className="card-nb overflow-x-auto">
        <h2 className="mb-4">Player Statistics</h2>
        <table className="table-nb">
          <thead>
            <tr>
              <th>Player</th>
              <th
                className="cursor-pointer hover:opacity-80"
                onClick={() => dispatch(setSortColumn('totalProfit'))}
              >
                Total P/L {getSortIcon('totalProfit')}
              </th>
              <th
                className="cursor-pointer hover:opacity-80"
                onClick={() => dispatch(setSortColumn('sessionCount'))}
              >
                Sessions {getSortIcon('sessionCount')}
              </th>
              <th
                className="cursor-pointer hover:opacity-80"
                onClick={() => dispatch(setSortColumn('winRate'))}
              >
                Win Rate {getSortIcon('winRate')}
              </th>
              <th
                className="cursor-pointer hover:opacity-80"
                onClick={() => dispatch(setSortColumn('avgWinLoss'))}
              >
                Avg W/L {getSortIcon('avgWinLoss')}
              </th>
              <th
                className="cursor-pointer hover:opacity-80"
                onClick={() => dispatch(setSortColumn('bestSession'))}
              >
                Best {getSortIcon('bestSession')}
              </th>
              <th
                className="cursor-pointer hover:opacity-80"
                onClick={() => dispatch(setSortColumn('worstSession'))}
              >
                Worst {getSortIcon('worstSession')}
              </th>
              <th
                className="cursor-pointer hover:opacity-80"
                onClick={() => dispatch(setSortColumn('variance'))}
              >
                Variance {getSortIcon('variance')}
              </th>
              <th
                className="cursor-pointer hover:opacity-80"
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
