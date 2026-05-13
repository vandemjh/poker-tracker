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
  findErrorSessions,
  formatMoney,
  formatMoneyWithSign,
  formatPercentage,
  parseLocalDate,
} from '../utils/statistics';
import BalanceChart from '../components/BalanceChart';
import type { PlayerStatistics } from '../types';

const ResultsPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { players } = useAppSelector((state) => state.players);
  const { sessions, playerSessions } = useAppSelector(
    (state) => state.sessions,
  );
  const {
    dateFilter,
    selectedPlayers,
    sortColumn,
    sortDirection,
    isInitializing,
  } = useAppSelector((state) => state.ui);

  const [showAllGames, setShowAllGames] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [recentGamesCount, setRecentGamesCount] = useState(5);

  const statistics = useMemo(() => {
    return calculateAllPlayerStatistics(
      players,
      sessions,
      playerSessions,
      dateFilter,
    );
  }, [players, sessions, playerSessions, dateFilter]);

  const errorSessions = useMemo(() => {
    return findErrorSessions(sessions, playerSessions, dateFilter);
  }, [sessions, playerSessions, dateFilter]);

  const totalError = useMemo(() => {
    return errorSessions.reduce((sum, e) => sum + e.difference, 0);
  }, [errorSessions]);

  // Sort statistics by session count to get top 10 players
  const sortedByGames = useMemo(() => {
    return [...statistics].sort((a, b) => b.sessionCount - a.sessionCount);
  }, [statistics]);

  const top10Players = useMemo(
    () => sortedByGames.slice(0, 10),
    [sortedByGames],
  );
  const otherPlayers = useMemo(() => sortedByGames.slice(10), [sortedByGames]);

  // Filter other players by search term
  const filteredOtherPlayers = useMemo(() => {
    if (!playerSearch) return otherPlayers;
    return otherPlayers.filter((p) =>
      p.playerName.toLowerCase().includes(playerSearch.toLowerCase()),
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
    return statistics.filter(
      (s) =>
        selectedPlayers.length === 0 || selectedPlayers.includes(s.playerId),
    );
  }, [statistics, selectedPlayers]);

  // Limit chart data to last 20 games unless showAllGames is true
  // Also adjust balances to start at zero from the first shown date
  const limitedChartData = useMemo(() => {
    // Get all unique dates across all players and sort them
    const allDates = new Set<string>();
    chartData.forEach((player) => {
      player.balanceHistory.forEach((entry) => {
        allDates.add(entry.date);
      });
    });
    const sortedDates = Array.from(allDates).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );

    // Determine which dates to show
    const datesToShow = showAllGames
      ? new Set(sortedDates)
      : new Set(sortedDates.slice(-20));

    // Filter and adjust each player's balance history
    return chartData.map((player) => {
      // Filter to only included dates
      const filteredHistory = player.balanceHistory.filter((entry) =>
        datesToShow.has(entry.date),
      );

      if (filteredHistory.length === 0) {
        return { ...player, balanceHistory: [] };
      }

      // Calculate the offset: balance just before the first shown entry
      // We want to subtract the accumulated balance up to (but not including) the first shown game
      const firstShownDate = filteredHistory[0].date;
      const firstEntryIndex = player.balanceHistory.findIndex(
        (entry) => entry.date === firstShownDate,
      );
      const offsetBalance =
        firstEntryIndex > 0
          ? player.balanceHistory[firstEntryIndex - 1].balance
          : 0;

      // Adjust all balances to start from zero
      const adjustedHistory = filteredHistory.map((entry) => ({
        ...entry,
        balance: entry.balance - offsetBalance,
      }));

      return { ...player, balanceHistory: adjustedHistory };
    });
  }, [chartData, showAllGames]);

  // Count total games in the data
  const totalGames = useMemo(() => {
    const allDates = new Set<string>();
    chartData.forEach((player) => {
      player.balanceHistory.forEach((entry) => {
        allDates.add(entry.date);
      });
    });
    return allDates.size;
  }, [chartData]);

  // Total completed sessions count
  const totalCompletedSessions = useMemo(() => {
    return [...sessions].filter((s) => s.isComplete).length;
  }, [sessions]);

  // Recent games data for the Recent Games component
  const recentGamesData = useMemo(() => {
    // Get all completed sessions sorted by date (most recent first)
    const allCompletedSessions = [...sessions]
      .filter((s) => s.isComplete)
      .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());

    const recentSessions = allCompletedSessions.slice(0, recentGamesCount);

    return recentSessions.map((session) => {
      // Get player results for this session
      const sessionPlayerSessions = playerSessions.filter(
        (ps) => ps.sessionId === session.id,
      );
      const results = sessionPlayerSessions
        .map((ps) => {
          const player = players.find((p) => p.id === ps.playerId);
          return {
            name: player?.name || 'Unknown',
            netResult: ps.netResult,
          };
        })
        .sort((a, b) => b.netResult - a.netResult);

      const winners = results
        .filter((r) => r.netResult > 0)
        .sort((a, b) => b.netResult - a.netResult);
      const losers = results
        .filter((r) => r.netResult < 0)
        .sort((a, b) => b.netResult - a.netResult);

      return {
        session,
        results,
        winners,
        losers,
      };
    });
  }, [sessions, playerSessions, players, recentGamesCount]);

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleToggleAll = () => {
    if (selectedPlayers.length === statistics.length) {
      dispatch(clearPlayerSelection());
    } else {
      dispatch(selectAllPlayers(statistics.map((s) => s.playerId)));
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
          Link a Google Sheet or start a new game session to see your
          statistics.
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
              onChange={(e) =>
                dispatch(
                  setDateFilter({
                    ...dateFilter,
                    startDate: e.target.value || null,
                  }),
                )
              }
              className="input-nb w-36 py-1 text-sm"
              title="Start Date"
            />
            <span className="text-theme-secondary">to</span>
            <input
              type="date"
              value={dateFilter.endDate || ''}
              onChange={(e) =>
                dispatch(
                  setDateFilter({
                    ...dateFilter,
                    endDate: e.target.value || null,
                  }),
                )
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
              selectedPlayers.length === statistics.length ||
              selectedPlayers.length === 0
                ? 'bg-nb-yellow text-nb-black'
                : 'bg-theme-card'
            }`}
          >
            {selectedPlayers.length === 0 ? 'All' : 'Toggle All'}
          </button>
          {top10Players.map((stat) => (
            <button
              key={stat.playerId}
              onClick={() => dispatch(togglePlayerSelection(stat.playerId))}
              className={`badge-nb cursor-pointer transition-colors ${
                selectedPlayers.length === 0 ||
                selectedPlayers.includes(stat.playerId)
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
                    <div
                      className="p-2 border-b-2"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <input
                        type="text"
                        placeholder="Search players..."
                        value={playerSearch}
                        onChange={(e) => setPlayerSearch(e.target.value)}
                        className="input-nb py-1 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {filteredOtherPlayers.map((stat) => (
                        <button
                          key={stat.playerId}
                          onClick={() => handleSelectOtherPlayer(stat.playerId)}
                          className={`w-full text-left px-3 py-2 hover:bg-nb-yellow hover:text-nb-black transition-colors flex items-center justify-between ${
                            selectedPlayers.includes(stat.playerId)
                              ? 'bg-nb-blue text-nb-white'
                              : ''
                          }`}
                        >
                          <span>{stat.playerName}</span>
                          <span className="text-xs opacity-70">
                            {stat.sessionCount} games
                          </span>
                        </button>
                      ))}
                      {filteredOtherPlayers.length === 0 && (
                        <div className="px-3 py-2 text-theme-secondary text-sm">
                          No players found
                        </div>
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

      {/* Recent Games */}
      <div className="card-nb">
        <h2 className="mb-4">Recent Games</h2>
        {recentGamesData.length === 0 && (
          <p className="text-theme-secondary text-center py-4">
            No completed games yet.
          </p>
        )}
        {recentGamesData.length > 0 && (
          <div className="space-y-3">
            {recentGamesData.map(({ session, results, winners, losers }) => (
              <div
                key={session.id}
                className="p-3 border-2 transition-colors"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                }}
              >
                <div className="mb-2">
                  <div className="font-semibold text-lg">
                    {parseLocalDate(session.date).toLocaleDateString(
                      undefined,
                      {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      },
                    )}
                  </div>
                  <div className="text-sm text-theme-secondary">
                    {session.stakes && <span>{session.stakes} • </span>}
                    {session.location || ''}
                  </div>
                </div>
                <div>
                  {winners.length > 0 && (
                    <div className="mb-2">
                      <span className="font-semibold">Winners:</span>
                      {winners.slice(0, 3).map((w, i) => (
                        <span key={w.name + i} className="ml-2">
                          {i > 0 ? ' • ' : ''}
                          <span className="status-positive">{w.name}</span>
                          <span className="text-theme-secondary">
                            {' '}
                            {formatMoneyWithSign(w.netResult)}
                          </span>
                        </span>
                      ))}
                      {winners.length > 3 && (
                        <span className="ml-2 text-theme-secondary">
                          {' '}
                          +{winners.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                  {losers.length > 0 && (
                    <div>
                      <span className="font-semibold">Losers:</span>
                      {losers.slice(0, 3).map((l, i) => (
                        <span key={l.name + i} className="ml-2">
                          {i > 0 ? ' • ' : ''}
                          <span className="status-negative">{l.name}</span>
                          <span className="text-theme-secondary">
                            {' '}
                            {formatMoneyWithSign(l.netResult)}
                          </span>
                        </span>
                      ))}
                      {losers.length > 3 && (
                        <span className="ml-2 text-theme-secondary">
                          {' '}
                          +{losers.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-theme-secondary text-right mt-1">
                    {results.length} players
                  </div>
                </div>
              </div>
            ))}
            {recentGamesData.length > 0 &&
              recentGamesData.length < totalCompletedSessions && (
                <div className="text-center mt-6">
                  <button
                    onClick={() => setRecentGamesCount((prev) => prev + 5)}
                    className="px-6 py-2 font-semibold border-3 bg-nb-blue text-nb-white hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-100"
                    style={{
                      borderColor: 'var(--color-border)',
                      boxShadow: '4px 4px 0px 0px var(--color-shadow)',
                    }}
                  >
                    Load 5 More
                  </button>
                </div>
              )}
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
            {sortedStatistics.map((stat) => (
              <tr key={stat.playerId}>
                <td className="font-semibold">{stat.playerName}</td>
                <td
                  className={
                    stat.totalProfit >= 0
                      ? 'status-positive'
                      : 'status-negative'
                  }
                >
                  {formatMoneyWithSign(stat.totalProfit)}
                </td>
                <td>{stat.sessionCount}</td>
                <td>{formatPercentage(stat.winRate)}</td>
                <td
                  className={
                    stat.avgWinLoss >= 0 ? 'status-positive' : 'status-negative'
                  }
                >
                  {formatMoneyWithSign(stat.avgWinLoss)}
                </td>
                <td className="status-positive">
                  {formatMoney(stat.bestSession)}
                </td>
                <td className="status-negative">
                  {formatMoney(stat.worstSession)}
                </td>
                <td>{stat.variance.toFixed(2)}</td>
                <td
                  className={
                    stat.roi >= 0 ? 'status-positive' : 'status-negative'
                  }
                >
                  {formatPercentage(stat.roi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Errors Table */}
      {errorSessions.length > 0 && (
        <div className="card-nb overflow-x-auto">
          <h2 className="mb-4">Errors</h2>
          <table className="table-nb">
            <thead>
              <tr>
                <th>Date</th>
                <th>Game</th>
                <th>Error</th>
                <th>In Favor Of</th>
              </tr>
            </thead>
            <tbody>
              {errorSessions.map(({ session, difference }) => (
                <tr key={session.id}>
                  <td className="font-semibold">
                    {parseLocalDate(session.date).toLocaleDateString(
                      undefined,
                      {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      },
                    )}
                  </td>
                  <td className="text-theme-secondary">
                    {session.stakes && <span>{session.stakes} • </span>}
                    {session.location || '—'}
                  </td>
                  <td className="status-negative">
                    {formatMoneyWithSign(difference)}
                  </td>
                  <td
                    className={
                      difference > 0 ? 'status-positive' : 'status-negative'
                    }
                  >
                    {difference > 0 ? 'Players' : 'Bank'}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} className="font-semibold">
                  Total
                </td>
                <td className="font-semibold status-negative">
                  {formatMoneyWithSign(totalError)}
                </td>
                <td
                  className={
                    totalError > 0
                      ? 'status-positive font-semibold'
                      : 'status-negative font-semibold'
                  }
                >
                  {totalError > 0 ? 'Players' : totalError < 0 ? 'Bank' : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ResultsPage;
