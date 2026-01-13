import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import {
  createSession,
  addPlayerToSession,
  addBuyIn,
  setCashOut,
  completeSession,
  addPlayer,
  setActiveSession,
  removePlayerFromSession,
  markUnsyncedChanges,
} from '../store';
import { formatMoney, formatMoneyWithSign, validateZeroSum } from '../utils/statistics';
import type { CreateSessionForm, AddPlayerToSessionForm } from '../types';

const PlayPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { players } = useAppSelector(state => state.players);
  const { sessions, playerSessions, activeSessionId } = useAppSelector(state => state.sessions);

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showBuyInModal, setShowBuyInModal] = useState<string | null>(null);
  const [showCashOutModal, setShowCashOutModal] = useState<string | null>(null);
  const [buyInAmount, setBuyInAmount] = useState('');
  const [cashOutAmount, setCashOutAmount] = useState('');

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId);
  }, [sessions, activeSessionId]);

  const activePlayerSessions = useMemo(() => {
    if (!activeSessionId) return [];
    return playerSessions.filter(ps => ps.sessionId === activeSessionId);
  }, [playerSessions, activeSessionId]);

  const tableTotal = useMemo(() => {
    return activePlayerSessions.reduce((sum, ps) => {
      return sum + ps.buyIns.reduce((buyInSum, b) => buyInSum + b.amount, 0);
    }, 0);
  }, [activePlayerSessions]);

  const cashOutTotal = useMemo(() => {
    return activePlayerSessions.reduce((sum, ps) => sum + (ps.cashOut || 0), 0);
  }, [activePlayerSessions]);

  const { register: registerSession, handleSubmit: handleSessionSubmit, reset: resetSession } =
    useForm<CreateSessionForm>({
      defaultValues: {
        date: new Date().toISOString().split('T')[0],
        gameType: 'cash',
      },
    });

  const {
    register: registerPlayer,
    handleSubmit: handlePlayerSubmit,
    reset: resetPlayer,
    watch: watchPlayer,
  } = useForm<AddPlayerToSessionForm>({
    defaultValues: {
      playerId: '',
      buyInAmount: 100,
    },
  });

  const watchPlayerId = watchPlayer('playerId');

  const onCreateSession = (data: CreateSessionForm) => {
    dispatch(createSession(data));
    dispatch(markUnsyncedChanges());
    resetSession();
  };

  const onAddPlayer = (data: AddPlayerToSessionForm) => {
    if (!activeSessionId) return;

    let playerId = data.playerId;

    // If creating a new player
    if (data.playerId === 'new' && data.newPlayerName) {
      dispatch(addPlayer({ name: data.newPlayerName }));
      // Get the newly created player (it's the last one)
      const newPlayer = players[players.length - 1];
      playerId = newPlayer?.id || '';

      // Since we need the ID of the newly created player, we need to handle this differently
      // The player will be added on the next render, so we'll use a timeout
      setTimeout(() => {
        const state = (window as any).__REDUX_STORE__?.getState?.();
        if (state) {
          const newestPlayer = state.players.players[state.players.players.length - 1];
          if (newestPlayer) {
            dispatch(
              addPlayerToSession({
                sessionId: activeSessionId,
                playerId: newestPlayer.id,
                buyInAmount: data.buyInAmount,
              })
            );
          }
        }
      }, 0);
    } else if (playerId) {
      dispatch(
        addPlayerToSession({
          sessionId: activeSessionId,
          playerId,
          buyInAmount: data.buyInAmount,
        })
      );
    }

    dispatch(markUnsyncedChanges());
    resetPlayer();
    setShowAddPlayer(false);
  };

  const handleAddBuyIn = (playerSessionId: string) => {
    const amount = parseFloat(buyInAmount);
    if (!isNaN(amount) && amount > 0) {
      dispatch(addBuyIn({ playerSessionId, amount }));
      dispatch(markUnsyncedChanges());
    }
    setBuyInAmount('');
    setShowBuyInModal(null);
  };

  const handleCashOut = (playerSessionId: string) => {
    const amount = parseFloat(cashOutAmount);
    if (!isNaN(amount) && amount >= 0) {
      dispatch(setCashOut({ playerSessionId, amount }));
      dispatch(markUnsyncedChanges());
    }
    setCashOutAmount('');
    setShowCashOutModal(null);
  };

  const handleEndSession = () => {
    if (!activeSessionId) return;

    // Check if all players have cashed out
    const allCashedOut = activePlayerSessions.every(ps => ps.cashOut !== undefined);
    if (!allCashedOut) {
      alert('All players must cash out before ending the session.');
      return;
    }

    // Validate zero-sum
    const validation = validateZeroSum(activeSessionId, activePlayerSessions);
    if (!validation.isValid) {
      const proceed = confirm(
        `Warning: Session doesn't balance. Difference: ${formatMoney(validation.difference)}. End anyway?`
      );
      if (!proceed) return;
    }

    dispatch(completeSession(activeSessionId));
    dispatch(markUnsyncedChanges());
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return player?.name || 'Unknown';
  };

  const availablePlayers = useMemo(() => {
    const usedPlayerIds = new Set(activePlayerSessions.map(ps => ps.playerId));
    return players.filter(p => !usedPlayerIds.has(p.id));
  }, [players, activePlayerSessions]);

  // If no active session, show session creation or list of incomplete sessions
  if (!activeSession) {
    const incompleteSessions = sessions.filter(s => !s.isComplete && !s.isImported);

    return (
      <div className="space-y-6">
        <div className="card-nb">
          <h2 className="mb-6">Start New Session</h2>
          <form onSubmit={handleSessionSubmit(onCreateSession)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Session Name (optional)</label>
                <input
                  {...registerSession('name')}
                  className="input-nb"
                  placeholder="e.g., Friday Night Game"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Date</label>
                <input type="date" {...registerSession('date')} className="input-nb" required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Game Type</label>
                <select {...registerSession('gameType')} className="select-nb">
                  <option value="cash">Cash Game</option>
                  <option value="tournament">Tournament</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Stakes (optional)</label>
                <input
                  {...registerSession('stakes')}
                  className="input-nb"
                  placeholder="e.g., $1/$2"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-1">Location (optional)</label>
                <input
                  {...registerSession('location')}
                  className="input-nb"
                  placeholder="e.g., John's House"
                />
              </div>
            </div>
            <button type="submit" className="btn-nb-primary">
              Start Session
            </button>
          </form>
        </div>

        {incompleteSessions.length > 0 && (
          <div className="card-nb">
            <h2 className="mb-4">Resume Session</h2>
            <div className="space-y-2">
              {incompleteSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => dispatch(setActiveSession(session.id))}
                  className="w-full text-left p-4 border-3 border-nb-black bg-nb-white shadow-nb-sm hover:shadow-nb-hover hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  <div className="font-semibold">
                    {session.name || new Date(session.date).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-gray-600">
                    {session.gameType} {session.stakes && `- ${session.stakes}`}
                    {session.location && ` @ ${session.location}`}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active session view
  return (
    <div className="space-y-6">
      {/* Session Header */}
      <div className="card-nb">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2>
              {activeSession.name ||
                new Date(activeSession.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
            </h2>
            <p className="text-gray-600">
              {activeSession.gameType === 'cash' ? 'Cash Game' : 'Tournament'}
              {activeSession.stakes && ` - ${activeSession.stakes}`}
              {activeSession.location && ` @ ${activeSession.location}`}
            </p>
          </div>
          <button onClick={handleEndSession} className="btn-nb-danger">
            End Session
          </button>
        </div>
      </div>

      {/* Table Total */}
      <div className="card-nb bg-nb-yellow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Total on Table</div>
            <div className="text-3xl font-bold">{formatMoney(tableTotal)}</div>
          </div>
          {cashOutTotal > 0 && (
            <div className="text-right">
              <div className="text-sm font-semibold">Cashed Out</div>
              <div className="text-2xl font-bold">{formatMoney(cashOutTotal)}</div>
            </div>
          )}
          <button onClick={() => setShowAddPlayer(true)} className="btn-nb bg-nb-white">
            + Add Player
          </button>
        </div>
      </div>

      {/* Players List */}
      <div className="card-nb overflow-x-auto">
        <h3 className="mb-4">Players</h3>
        {activePlayerSessions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No players yet. Add a player to get started.
          </p>
        ) : (
          <table className="table-nb">
            <thead>
              <tr>
                <th>Player</th>
                <th>Buy-ins</th>
                <th>Cash-out</th>
                <th>P/L</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activePlayerSessions.map(ps => {
                const totalBuyIns = ps.buyIns.reduce((sum, b) => sum + b.amount, 0);
                const netResult = ps.cashOut !== undefined ? ps.cashOut - totalBuyIns : null;

                return (
                  <tr key={ps.id}>
                    <td className="font-semibold">{getPlayerName(ps.playerId)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1 items-center">
                        {ps.buyIns.map((buyIn) => (
                          <span key={buyIn.id} className="badge-nb bg-nb-blue text-nb-white text-xs">
                            {formatMoney(buyIn.amount)}
                          </span>
                        ))}
                        <button
                          onClick={() => setShowBuyInModal(ps.id)}
                          className="w-6 h-6 flex items-center justify-center border-2 border-nb-black bg-nb-white text-xs font-bold hover:bg-nb-yellow"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Total: {formatMoney(totalBuyIns)}
                      </div>
                    </td>
                    <td>
                      {ps.cashOut !== undefined ? (
                        <span className="font-semibold">{formatMoney(ps.cashOut)}</span>
                      ) : (
                        <button
                          onClick={() => setShowCashOutModal(ps.id)}
                          className="btn-nb text-sm py-1 px-3"
                        >
                          Cash Out
                        </button>
                      )}
                    </td>
                    <td>
                      {netResult !== null ? (
                        <span
                          className={`font-bold ${
                            netResult >= 0 ? 'status-positive' : 'status-negative'
                          }`}
                        >
                          {formatMoneyWithSign(netResult)}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td>
                      {ps.cashOut === undefined && (
                        <button
                          onClick={() => dispatch(removePlayerFromSession(ps.id))}
                          className="text-nb-red hover:underline text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Player Modal */}
      {showAddPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card-nb w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3>Add Player</h3>
              <button
                onClick={() => {
                  setShowAddPlayer(false);
                  resetPlayer();
                }}
                className="w-8 h-8 flex items-center justify-center border-2 border-nb-black font-bold"
              >
                X
              </button>
            </div>
            <form onSubmit={handlePlayerSubmit(onAddPlayer)} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Player</label>
                <select {...registerPlayer('playerId')} className="select-nb" required>
                  <option value="">Select a player</option>
                  {availablePlayers.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="new">+ New Player</option>
                </select>
              </div>
              {watchPlayerId === 'new' && (
                <div>
                  <label className="block text-sm font-semibold mb-1">New Player Name</label>
                  <input
                    {...registerPlayer('newPlayerName')}
                    className="input-nb"
                    placeholder="Enter name"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold mb-1">Initial Buy-in</label>
                <input
                  type="number"
                  step="0.01"
                  {...registerPlayer('buyInAmount', { valueAsNumber: true })}
                  className="input-nb"
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-nb-success">
                  Add Player
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddPlayer(false);
                    resetPlayer();
                  }}
                  className="btn-nb"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Buy-in Modal */}
      {showBuyInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card-nb w-full max-w-sm mx-4">
            <h3 className="mb-4">Add Buy-in</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={buyInAmount}
                  onChange={e => setBuyInAmount(e.target.value)}
                  className="input-nb"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleAddBuyIn(showBuyInModal)}
                  className="btn-nb-success"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setShowBuyInModal(null);
                    setBuyInAmount('');
                  }}
                  className="btn-nb"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash-out Modal */}
      {showCashOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card-nb w-full max-w-sm mx-4">
            <h3 className="mb-4">Cash Out</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={cashOutAmount}
                  onChange={e => setCashOutAmount(e.target.value)}
                  className="input-nb"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleCashOut(showCashOutModal)}
                  className="btn-nb-success"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setShowCashOutModal(null);
                    setCashOutAmount('');
                  }}
                  className="btn-nb"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayPage;
