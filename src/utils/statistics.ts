import type { Player, Session, PlayerSession, PlayerStatistics, BalanceHistoryEntry } from '../types';

export function calculatePlayerStatistics(
  player: Player,
  sessions: Session[],
  playerSessions: PlayerSession[],
  dateFilter?: { startDate: string | null; endDate: string | null }
): PlayerStatistics {
  // Get all player sessions for this player
  let relevantPlayerSessions = playerSessions.filter(
    ps => ps.playerId === player.id
  );

  // Filter by date if provided
  if (dateFilter?.startDate || dateFilter?.endDate) {
    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    relevantPlayerSessions = relevantPlayerSessions.filter(ps => {
      const session = sessionMap.get(ps.sessionId);
      if (!session) return false;
      const sessionDate = new Date(session.date);
      if (dateFilter.startDate && sessionDate < new Date(dateFilter.startDate)) {
        return false;
      }
      if (dateFilter.endDate && sessionDate > new Date(dateFilter.endDate)) {
        return false;
      }
      return true;
    });
  }

  // Only consider completed sessions
  const sessionMap = new Map(sessions.map(s => [s.id, s]));
  const completedPlayerSessions = relevantPlayerSessions.filter(ps => {
    const session = sessionMap.get(ps.sessionId);
    return session?.isComplete;
  });

  if (completedPlayerSessions.length === 0) {
    return {
      playerId: player.id,
      playerName: player.name,
      totalProfit: 0,
      sessionCount: 0,
      winRate: 0,
      avgWinLoss: 0,
      bestSession: 0,
      worstSession: 0,
      variance: 0,
      standardDeviation: 0,
      roi: 0,
      totalBuyIns: 0,
      balanceHistory: [],
    };
  }

  // Calculate basic metrics
  const results = completedPlayerSessions.map(ps => ps.netResult);
  const totalProfit = results.reduce((sum, r) => sum + r, 0);
  const sessionCount = completedPlayerSessions.length;
  const winningSessionCount = results.filter(r => r > 0).length;
  const winRate = (winningSessionCount / sessionCount) * 100;
  const avgWinLoss = totalProfit / sessionCount;
  const bestSession = Math.max(...results);
  const worstSession = Math.min(...results);

  // Calculate total buy-ins
  // For imported sessions where buy-in amount is 0, estimate from net result
  const totalBuyIns = completedPlayerSessions.reduce((sum, ps) => {
    const actualBuyIns = ps.buyIns.reduce((buyInSum, b) => buyInSum + b.amount, 0);
    if (actualBuyIns > 0) {
      // Use actual buy-in data when available
      return sum + actualBuyIns;
    }
    // For imported sessions, estimate buy-in as cash-out minus net result
    // (cash-out = buy-in + netResult, so buy-in = cash-out - netResult)
    // If no cash-out data, estimate as |netResult| (minimum possible buy-in)
    if (ps.cashOut !== undefined) {
      return sum + (ps.cashOut - ps.netResult);
    }
    return sum + Math.abs(ps.netResult);
  }, 0);

  // Calculate ROI
  const roi = totalBuyIns > 0 ? (totalProfit / totalBuyIns) * 100 : 0;

  // Calculate variance and standard deviation
  const mean = avgWinLoss;
  const squaredDifferences = results.map(r => Math.pow(r - mean, 2));
  const variance = squaredDifferences.reduce((sum, sd) => sum + sd, 0) / sessionCount;
  const standardDeviation = Math.sqrt(variance);

  // Calculate balance history (sorted by date)
  const balanceHistory: BalanceHistoryEntry[] = [];
  let runningBalance = 0;

  // Sort sessions by date
  const sortedPlayerSessions = [...completedPlayerSessions].sort((a, b) => {
    const sessionA = sessionMap.get(a.sessionId);
    const sessionB = sessionMap.get(b.sessionId);
    if (!sessionA || !sessionB) return 0;
    return new Date(sessionA.date).getTime() - new Date(sessionB.date).getTime();
  });

  for (const ps of sortedPlayerSessions) {
    const session = sessionMap.get(ps.sessionId);
    if (session) {
      runningBalance += ps.netResult;
      balanceHistory.push({
        date: session.date,
        balance: runningBalance,
        sessionId: ps.sessionId,
      });
    }
  }

  return {
    playerId: player.id,
    playerName: player.name,
    totalProfit,
    sessionCount,
    winRate,
    avgWinLoss,
    bestSession,
    worstSession,
    variance,
    standardDeviation,
    roi,
    totalBuyIns,
    balanceHistory,
  };
}

export function calculateAllPlayerStatistics(
  players: Player[],
  sessions: Session[],
  playerSessions: PlayerSession[],
  dateFilter?: { startDate: string | null; endDate: string | null }
): PlayerStatistics[] {
  return players.map(player =>
    calculatePlayerStatistics(player, sessions, playerSessions, dateFilter)
  ).filter(stats => stats.sessionCount > 0);
}

export function validateZeroSum(
  sessionId: string,
  playerSessions: PlayerSession[]
): { isValid: boolean; difference: number } {
  const sessionPlayerSessions = playerSessions.filter(
    ps => ps.sessionId === sessionId
  );

  const totalNetResult = sessionPlayerSessions.reduce(
    (sum, ps) => sum + ps.netResult,
    0
  );

  // Allow for small floating point differences
  const isValid = Math.abs(totalNetResult) < 0.01;

  return {
    isValid,
    difference: totalNetResult,
  };
}

export function formatMoney(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (amount >= 0) {
    return `$${formatted}`;
  }
  return `-$${formatted}`;
}

export function formatMoneyWithSign(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (amount > 0) {
    return `+$${formatted}`;
  } else if (amount < 0) {
    return `-$${formatted}`;
  }
  return `$${formatted}`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}
