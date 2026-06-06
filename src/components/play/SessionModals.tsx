import React, { useState, useCallback } from 'react';
import { formatMoney, formatMoneyWithSign } from '../../utils/statistics';
import type { Player, PlayerSession, Session } from '../../types';

// --- JoinGame Modal ---

interface RemotePlayer {
  playerName: string;
  totalBuyIn: number;
  cashOut?: number;
}

interface JoinGameModalProps {
  isOpen: boolean;
  remoteInProgressGame: RemotePlayer[] | null;
  remoteGameDate: Date | null;
  onContinue: () => void;
  onDismiss: () => void;
}

export const JoinGameModal: React.FC<JoinGameModalProps> = ({
  isOpen,
  remoteInProgressGame,
  remoteGameDate,
  onContinue,
  onDismiss,
}) => {
  if (!isOpen || !remoteInProgressGame || !remoteGameDate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-md mx-0 sm:mx-4 p-3 sm:p-6">
        <h3 className="mb-3 sm:mb-4 text-base sm:text-xl">
          In-Progress Game Found
        </h3>
        <p className="text-xs sm:text-sm text-theme-secondary mb-3 sm:mb-4">
          There's an in-progress game from {remoteGameDate.toLocaleDateString()}{' '}
          with {remoteInProgressGame.length} player
          {remoteInProgressGame.length !== 1 ? 's' : ''}.
        </p>
        <div className="text-xs sm:text-sm mb-3 sm:mb-4 max-h-32 overflow-y-auto">
          {remoteInProgressGame.map((p, i) => (
            <div
              key={i}
              className="flex justify-between py-1 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span className="font-semibold">{p.playerName}</span>
              <span className="whitespace-nowrap ml-2">
                {formatMoney(p.totalBuyIn)}
                {p.cashOut !== undefined && ` / ${formatMoney(p.cashOut)}`}
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onContinue}
            className="btn-nb-success text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
          >
            Continue Game
          </button>
          <button
            onClick={onDismiss}
            className="btn-nb text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

// --- EndSessionSummary Modal ---

interface EndSessionSummaryModalProps {
  isOpen: boolean;
  activeSession: Session | null;
  activePlayerSessions: PlayerSession[];
  players: Player[];
  isSavingToSheet: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const EndSessionSummaryModal: React.FC<EndSessionSummaryModalProps> = ({
  isOpen,
  activeSession,
  activePlayerSessions,
  players,
  isSavingToSheet,
  onConfirm,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!activeSession) return;

    const fmtDate = activeSession.date
      ? new Date(activeSession.date + 'T00:00:00').toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    const results = activePlayerSessions
      .map((ps) => {
        const player = players.find((p) => p.id === ps.playerId);
        const cashOut = ps.cashOut ?? 0;
        return {
          name: player?.name || 'Unknown',
          cashOut,
          netResult: ps.netResult,
        };
      })
      .sort((a, b) => b.netResult - a.netResult);

    const title = `${fmtDate} Cash-Outs`;
    const lines = results.map((p) => `${p.name}: ${formatMoney(p.cashOut)}`);
    const maxLen = Math.max(title.length, ...lines.map((s) => s.length));
    const padded = results.map((p) => {
      const padding =
        maxLen - 1 - (p.name.length + formatMoney(p.cashOut).length);
      return `${p.name}:${''.padEnd(padding, ' ')}${formatMoney(p.cashOut)}`;
    });

    const clipboardText = [
      title.padEnd(maxLen),
      ''.padEnd(maxLen, '═'),
      ...padded,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(clipboardText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = clipboardText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [activeSession, activePlayerSessions, players]);

  if (!isOpen || !activeSession) return null;

  const formattedDate = activeSession.date
    ? new Date(activeSession.date + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const playerResults = activePlayerSessions
    .map((ps) => {
      const player = players.find((p) => p.id === ps.playerId);
      const cashOut = ps.cashOut ?? 0;
      return {
        name: player?.name || 'Unknown',
        cashOut,
        netResult: ps.netResult,
      };
    })
    .sort((a, b) => b.netResult - a.netResult);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-sm mx-0 sm:mx-4 p-4 sm:p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-base sm:text-xl">{formattedDate} Results</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 font-bold shrink-0"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-card)',
            }}
          >
            X
          </button>
        </div>

        <div className="space-y-1 mb-4">
          <div className="flex justify-between items-center py-1 text-xs text-theme-secondary font-semibold uppercase tracking-wider">
            <span className="mr-2">Player</span>
            <div className="flex gap-4 sm:gap-6">
              <span className="w-16 sm:w-20 text-right">Cash Out</span>
              <span className="w-16 sm:w-20 text-right">P/L</span>
            </div>
          </div>
          {playerResults.map((p, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-1.5 border-b border-theme last:border-b-0"
            >
              <span className="font-semibold text-sm sm:text-base truncate mr-2">
                {p.name}
              </span>
              <div className="flex gap-4 sm:gap-6 tabular-nums text-sm sm:text-base">
                <span className="w-16 sm:w-20 text-right">
                  {formatMoney(p.cashOut)}
                </span>
                <span
                  className={`w-16 sm:w-20 text-right font-bold ${
                    p.netResult > 0
                      ? 'text-nb-green'
                      : p.netResult < 0
                        ? 'text-nb-red'
                        : ''
                  }`}
                >
                  {formatMoneyWithSign(p.netResult)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className={`btn-nb text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6 flex-1 ${
              copied ? 'btn-nb-success' : ''
            }`}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onConfirm}
            disabled={isSavingToSheet}
            className={`btn-nb-danger text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6 flex-1 ${isSavingToSheet ? 'opacity-50 cursor-wait' : ''}`}
          >
            {isSavingToSheet ? 'Saving...' : 'Confirm & End'}
          </button>
        </div>
      </div>
    </div>
  );
};
