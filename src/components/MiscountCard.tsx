import React, { useMemo } from 'react';
import PlayerBadge from './PlayerBadge';
import { formatMoney } from '../utils/statistics';
import type { Miscount } from '../types';

interface MiscountCardProps {
  miscounts: Miscount[];
}

interface MiscountSummary {
  key: string;
  playerName: string;
  count: number;
  totalAmount: number;
  avgAmount: number;
}

const MiscountCard: React.FC<MiscountCardProps> = ({ miscounts }) => {
  const summaries = useMemo(() => {
    const grouped = new Map<string, MiscountSummary>();

    for (const miscount of miscounts) {
      // For imported records playerId may be null, so fall back to the name
      const key = miscount.playerId || miscount.playerName.toLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += miscount.amount;
        existing.avgAmount = existing.totalAmount / existing.count;
      } else {
        grouped.set(key, {
          key,
          playerName: miscount.playerName,
          count: 1,
          totalAmount: miscount.amount,
          avgAmount: miscount.amount,
        });
      }
    }

    return Array.from(grouped.values()).sort(
      (a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName),
    );
  }, [miscounts]);

  if (miscounts.length === 0) {
    return null;
  }

  const visible = summaries.slice(0, 5);
  const hiddenCount = summaries.length - visible.length;

  return (
    <div className="card-nb">
      <h2 className="mb-4">Miscounts</h2>
      <div className="space-y-3">
        {visible.map((summary) => (
          <div
            key={summary.key}
            className="flex items-center justify-between gap-4 p-2 border-2"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <PlayerBadge name={summary.playerName} />
              <span className="text-xs text-theme-secondary">
                {summary.count} miscount
                {summary.count !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="text-right whitespace-nowrap">
              <span className="font-semibold text-sm">
                avg {formatMoney(summary.avgAmount)}
              </span>
              <span className="text-xs text-theme-secondary ml-2">
                total {formatMoney(summary.totalAmount)}
              </span>
            </div>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="text-center text-sm text-theme-secondary">
            +{hiddenCount} more player{hiddenCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

export default MiscountCard;