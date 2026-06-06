import React from 'react';
import { useAppSelector } from '../../hooks/useAppSelector';
import {
  formatMoney,
  formatMoneyWithSign,
  parseLocalDate,
} from '../../utils/statistics';
import type { Session, PlayerSession } from '../../types';

interface ActiveSessionViewProps {
  activeSession: Session;
  activePlayerSessions: PlayerSession[];
  tableTotal: number;
  cashOutTotal: number;
  sessionBalances: boolean;
  showBalanceWarning: boolean;
  balanceWarningFading: boolean;
  isSavingToSheet: boolean;
  onAddPlayerClick: () => void;
  onAddBuyInClick: (playerSessionId: string) => void;
  onEditBuyInClick: (playerSessionId: string, buyInId: string) => void;
  onCashOutClick: (playerSessionId: string) => void;
  onRemovePlayerClick: (playerSessionId: string) => void;
  onEndSession: () => void;
}

export const ActiveSessionView: React.FC<ActiveSessionViewProps> = ({
  activeSession,
  activePlayerSessions,
  tableTotal,
  cashOutTotal,
  sessionBalances,
  showBalanceWarning,
  balanceWarningFading,
  isSavingToSheet,
  onAddPlayerClick,
  onAddBuyInClick,
  onEditBuyInClick,
  onCashOutClick,
  onRemovePlayerClick,
  onEndSession,
}) => {
  const { players } = useAppSelector((state) => state.players);

  const getPlayerName = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    return player?.name || 'Unknown';
  };

  return (
    <div className="space-y-6">
      {/* Session Header */}
      <div className="card-nb md:p-6 p-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl break-words leading-tight">
            {activeSession.name ||
              parseLocalDate(activeSession.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
          </h2>
          {(activeSession.stakes || activeSession.location) && (
            <p className="text-sm text-theme-secondary break-words">
              {activeSession.stakes}
              {activeSession.stakes && activeSession.location && ' @ '}
              {!activeSession.stakes && activeSession.location && '@ '}
              {activeSession.location}
            </p>
          )}
        </div>
      </div>

      {/* Table Total */}
      <div className="card-nb bg-nb-yellow text-nb-black p-3 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex items-center justify-between gap-4 md:justify-normal md:flex-1">
            <div>
              <div className="text-xs md:text-sm font-semibold text-nb-black">
                Total on Table
              </div>
              <div className="text-xl md:text-2xl font-bold text-nb-black">
                {formatMoney(tableTotal)}
              </div>
            </div>
            {cashOutTotal > 0 && (
              <div className="text-right">
                <div className="text-xs md:text-sm font-semibold text-nb-black">
                  Cashed Out
                </div>
                <div className="text-xl md:text-2xl font-bold text-nb-black">
                  {formatMoney(cashOutTotal)}
                </div>
              </div>
            )}
          </div>
          {cashOutTotal > 0 && (
            <div className="flex items-center justify-between gap-4 md:justify-normal">
              <div>
                <div className="text-xs md:text-sm font-semibold text-nb-black">
                  Difference
                </div>
                <div
                  className={`text-xl md:text-2xl font-bold ${
                    cashOutTotal - tableTotal === 0
                      ? 'text-nb-green'
                      : 'text-nb-red'
                  }`}
                >
                  {formatMoneyWithSign(cashOutTotal - tableTotal)}
                </div>
              </div>
              {cashOutTotal !== tableTotal && (
                <div className="text-right">
                  <div className="text-xs md:text-sm font-semibold text-nb-black">
                    In Favor Of
                  </div>
                  <div
                    className={`text-sm md:text-base font-bold ${
                      cashOutTotal - tableTotal > 0
                        ? 'text-nb-green'
                        : 'text-nb-red'
                    }`}
                  >
                    {cashOutTotal - tableTotal > 0 ? 'Players' : 'Bank'}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            onClick={onAddPlayerClick}
            className="btn-nb text-nb-black text-sm py-2 px-4 whitespace-nowrap"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            + Add Player
          </button>
        </div>
      </div>

      {/* Players List */}
      <div className="card-nb md:p-6 p-3 overflow-x-auto">
        <h3 className="mb-3 md:mb-4 text-base md:text-xl">
          Players ({activePlayerSessions.length})
        </h3>
        {activePlayerSessions.length === 0 ? (
          <p className="text-theme-secondary text-center py-8 text-sm">
            No players yet. Add a player to get started.
          </p>
        ) : (
          <table className="table-nb text-sm">
            <thead>
              <tr>
                <th className="px-1 py-1.5 md:px-4 md:py-3 text-xs">Player</th>
                <th className="px-1 py-1.5 md:px-4 md:py-3 text-xs">Buy-ins</th>
                <th className="px-1 py-1.5 md:px-4 md:py-3 text-xs">
                  Cash-out
                </th>
                <th className="px-1 py-1.5 md:px-4 md:py-3 text-xs">P/L</th>
                <th className="px-1 py-1.5 md:px-4 md:py-3 text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activePlayerSessions.map((ps) => {
                const totalBuyIns = ps.buyIns.reduce(
                  (sum, b) => sum + b.amount,
                  0,
                );
                const netResult =
                  ps.cashOut !== undefined ? ps.cashOut - totalBuyIns : null;

                return (
                  <tr key={ps.id}>
                    <td className="px-1 py-1.5 md:px-4 md:py-3 font-semibold whitespace-nowrap text-xs md:text-sm">
                      {getPlayerName(ps.playerId)}
                    </td>
                    <td className="px-1 py-1.5 md:px-4 md:py-3">
                      <div className="flex flex-wrap gap-0.5 md:gap-1 items-center">
                        {ps.buyIns.map((buyIn) => (
                          <span
                            key={buyIn.id}
                            className="badge-nb bg-nb-blue text-nb-white px-1 py-0 text-xs md:px-2 md:py-0.5 cursor-pointer hover:bg-nb-yellow transition-colors"
                            onClick={() => onEditBuyInClick(ps.id, buyIn.id)}
                            title="Click to edit"
                          >
                            {formatMoney(buyIn.amount)}
                          </span>
                        ))}
                        <button
                          onClick={() => onAddBuyInClick(ps.id)}
                          className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center border-2 text-xs font-bold hover:bg-nb-yellow flex-shrink-0"
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: 'var(--color-bg-card)',
                          }}
                        >
                          +
                        </button>
                      </div>
                      <div className="text-xs text-theme-secondary mt-0.5 md:mt-1">
                        Total: {formatMoney(totalBuyIns)}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 md:px-4 md:py-3 whitespace-nowrap">
                      {ps.cashOut !== undefined ? (
                        <button
                          onClick={() => {
                            onCashOutClick(ps.id);
                          }}
                          className="font-semibold hover:text-nb-blue hover:underline cursor-pointer text-xs md:text-sm"
                          title="Click to edit"
                        >
                          {formatMoney(ps.cashOut)}{' '}
                          <span className="ml-0.5 opacity-60">✏️</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onCashOutClick(ps.id)}
                          className="btn-nb text-xs py-0.5 px-1 md:py-1 md:px-2"
                        >
                          Cash Out
                        </button>
                      )}
                    </td>
                    <td className="px-1 py-1.5 md:px-4 md:py-3 whitespace-nowrap">
                      {netResult !== null ? (
                        <span
                          className={`font-bold text-xs md:text-sm ${
                            netResult >= 0
                              ? 'status-positive'
                              : 'status-negative'
                          }`}
                        >
                          {formatMoneyWithSign(netResult)}
                        </span>
                      ) : (
                        <span className="text-theme-secondary text-xs md:text-sm">
                          -
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-1.5 md:px-4 md:py-3">
                      <button
                        onClick={() => onRemovePlayerClick(ps.id)}
                        className="text-nb-red hover:underline text-xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* End Session */}
      <div className="card-nb md:p-6 p-3">
        <div className="flex items-center justify-between gap-4">
          {showBalanceWarning && (
            <span
              className={`text-xs sm:text-sm text-nb-red font-semibold transition-opacity duration-500 ${balanceWarningFading ? 'opacity-0' : 'opacity-100'}`}
            >
              Session must balance to $0.00 before ending
            </span>
          )}
          <button
            onClick={onEndSession}
            disabled={isSavingToSheet}
            className={`btn-nb-danger text-sm py-2 px-4 whitespace-nowrap ml-auto ${isSavingToSheet ? 'opacity-50 cursor-wait' : ''} ${!sessionBalances && !isSavingToSheet ? 'opacity-30 cursor-not-allowed' : ''}`}
          >
            {isSavingToSheet ? 'Saving...' : 'End Session'}
          </button>
        </div>
      </div>
    </div>
  );
};
