import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import {
  createSession,
  addPlayerToSession,
  addBuyIn,
  setCashOut,
  completeSession,
  resumeCompletedSession,
  addPlayer,
  setActiveSession,
  removePlayerFromSession,
  markUnsyncedChanges,
  setPlayers,
  replaceImportedSessions,
  clearUnsyncedChanges,
  setSyncStatus,
} from '../store';
import { formatMoney, formatMoneyWithSign, validateZeroSum } from '../utils/statistics';
import { googleDriveService } from '../services/googleDrive';
import { parseSpreadsheetData } from '../utils/csvImport';
import type { CreateSessionForm, AddPlayerToSessionForm } from '../types';

// Helper to save session data to localStorage for resume feature
const SAVED_SESSION_KEY = 'poker_tracker_saved_session';

interface SavedSessionData {
  sessionId: string;
  playerSessions: Array<{
    playerId: string;
    buyIns: Array<{ id: string; amount: number; timestamp: string }>;
    cashOut?: number;
  }>;
}

const PlayPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { players } = useAppSelector(state => state.players);
  const { sessions, playerSessions, activeSessionId } = useAppSelector(state => state.sessions);
  const { importedSpreadsheetId, isGoogleConnected, settings } = useAppSelector(state => state.ui);

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showBuyInModal, setShowBuyInModal] = useState<string | null>(null);
  const [showCashOutModal, setShowCashOutModal] = useState<string | null>(null);
  const [buyInAmount, setBuyInAmount] = useState('');
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [isSavingToSheet, setIsSavingToSheet] = useState(false);
  const [showOptionalFields, setShowOptionalFields] = useState(false);

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
    setValue: setPlayerValue,
  } = useForm<AddPlayerToSessionForm>({
    defaultValues: {
      playerId: '',
      buyInAmount: settings.defaultBuyIn,
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

  const handleEndSession = async () => {
    if (!activeSessionId || !activeSession) return;

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

    // Save session data to localStorage for potential resume
    const savedData: SavedSessionData = {
      sessionId: activeSessionId,
      playerSessions: activePlayerSessions.map(ps => ({
        playerId: ps.playerId,
        buyIns: ps.buyIns,
        cashOut: ps.cashOut,
      })),
    };
    localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(savedData));

    // Save to Google Sheet (required for all sessions)
    if (isGoogleConnected && importedSpreadsheetId) {
      try {
        setIsSavingToSheet(true);

        // Build player results for the spreadsheet
        const playerResults = activePlayerSessions.map(ps => {
          const player = players.find(p => p.id === ps.playerId);
          return {
            playerName: player?.name || 'Unknown',
            netResult: ps.netResult,
          };
        });

        // Get session date
        const sessionDate = new Date(activeSession.date);

        // Append to the Google Sheet
        await googleDriveService.appendSessionColumn(
          importedSpreadsheetId,
          sessionDate,
          playerResults
        );

        console.log('Session saved to Google Sheet successfully');

        // Sync from spreadsheet to ensure local state matches
        try {
          const spreadsheetData = await googleDriveService.getSpreadsheetData(importedSpreadsheetId);
          const result = parseSpreadsheetData(spreadsheetData);

          dispatch(setPlayers(result.players));
          dispatch(replaceImportedSessions({
            sessions: result.sessions,
            playerSessions: result.playerSessions,
          }));

          dispatch(clearUnsyncedChanges());
          dispatch(setSyncStatus({
            lastSyncTime: new Date().toISOString(),
            hasUnsyncedChanges: false,
            error: null,
          }));
        } catch (syncError) {
          console.error('Error syncing after save:', syncError);
          // Don't block navigation if sync fails
        }
      } catch (error) {
        console.error('Error saving to Google Sheet:', error);
        alert(`Failed to save to Google Sheet: ${error}. The session will still be saved locally.`);
        dispatch(completeSession(activeSessionId));
        dispatch(markUnsyncedChanges());
      } finally {
        setIsSavingToSheet(false);
      }
    } else {
      dispatch(completeSession(activeSessionId));
      dispatch(markUnsyncedChanges());
    }

    // Navigate to results page
    navigate('/');
  };

  const getPlayerName = (playerId: string) => {
    const player = players.find(p => p.id === playerId);
    return player?.name || 'Unknown';
  };

  const availablePlayers = useMemo(() => {
    const usedPlayerIds = new Set(activePlayerSessions.map(ps => ps.playerId));
    return players.filter(p => !usedPlayerIds.has(p.id));
  }, [players, activePlayerSessions]);

  // Calculate games played per player for sorting
  const playerGameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    players.forEach(player => {
      const gameCount = playerSessions.filter(ps => ps.playerId === player.id).length;
      counts.set(player.id, gameCount);
    });
    return counts;
  }, [players, playerSessions]);

  // Sort available players by games played (descending)
  const sortedAvailablePlayers = useMemo(() => {
    return [...availablePlayers].sort((a, b) => {
      const countA = playerGameCounts.get(a.id) || 0;
      const countB = playerGameCounts.get(b.id) || 0;
      return countB - countA;
    });
  }, [availablePlayers, playerGameCounts]);

  // If no active session, show session creation or list of incomplete sessions
  if (!activeSession) {
    const incompleteSessions = sessions.filter(s => !s.isComplete && !s.isImported);

    // Find the most recent completed non-imported session (for "resume accidentally ended" feature)
    const recentlyCompletedSessions = sessions
      .filter(s => s.isComplete && !s.isImported)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const lastCompletedSession = recentlyCompletedSessions[0];

    // Check if user can start a session (must have Google connected and sheet linked)
    const canStartSession = isGoogleConnected && importedSpreadsheetId;

    return (
      <div className="space-y-6">
        {!canStartSession && (
          <div className="card-nb bg-nb-orange">
            <div className="flex items-center gap-4">
              <div className="text-4xl">📊</div>
              <div>
                <h3 className="text-nb-black">Link a Google Sheet to get started</h3>
                <p className="text-sm text-nb-black opacity-80">
                  {!isGoogleConnected
                    ? 'Connect to Google Drive and link a spreadsheet to track your games.'
                    : 'Click the "Link" button in the header to connect a Google Sheet.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className={`card-nb ${!canStartSession ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="mb-6">Start New Session</h2>
          <form onSubmit={handleSessionSubmit(onCreateSession)} className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Date</label>
                <input type="date" {...registerSession('date')} className="input-nb" required />
              </div>

              <button
                type="button"
                onClick={() => setShowOptionalFields(!showOptionalFields)}
                className="flex items-center gap-2 text-sm font-semibold text-theme-secondary hover:text-theme transition-colors"
              >
                <span className={`transform transition-transform ${showOptionalFields ? 'rotate-90' : ''}`}>▶</span>
                Optional Details
              </button>

              {showOptionalFields && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-3" style={{ borderColor: 'var(--color-border)' }}>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Session Name</label>
                    <input
                      {...registerSession('name')}
                      className="input-nb"
                      placeholder="e.g., Friday Night Game"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Stakes</label>
                    <input
                      {...registerSession('stakes')}
                      className="input-nb"
                      placeholder="e.g., $1/$2"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold mb-1">Location</label>
                    <input
                      {...registerSession('location')}
                      className="input-nb"
                      placeholder="e.g., John's House"
                    />
                  </div>
                </div>
              )}
            </div>
            <button type="submit" className="btn-nb-primary" disabled={!canStartSession}>
              Start Session
            </button>
          </form>
        </div>

        {incompleteSessions.length > 0 && canStartSession && (
          <div className="card-nb">
            <h2 className="mb-4">Resume Session</h2>
            <div className="space-y-2">
              {incompleteSessions.map(session => (
                <button
                  key={session.id}
                  onClick={() => dispatch(setActiveSession(session.id))}
                  className="w-full text-left p-4 border-3 hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                  style={{
                    backgroundColor: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                    boxShadow: '2px 2px 0px 0px var(--color-shadow)',
                  }}
                >
                  <div className="font-semibold">
                    {session.name || new Date(session.date).toLocaleDateString()}
                  </div>
                  <div className="text-sm text-theme-secondary">
                    {session.stakes && `${session.stakes}`}
                    {session.stakes && session.location && ' @ '}
                    {!session.stakes && session.location && '@ '}
                    {session.location}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resume accidentally ended game */}
        {lastCompletedSession && canStartSession && (
          <div className="card-nb bg-nb-orange bg-opacity-20">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="font-semibold text-nb-black dark:text-theme">Accidentally ended a game?</h3>
                <p className="text-sm text-theme-secondary">
                  Resume "{lastCompletedSession.name || new Date(lastCompletedSession.date).toLocaleDateString()}"
                  (ended {new Date(lastCompletedSession.updatedAt).toLocaleString()})
                </p>
              </div>
              <button
                onClick={() => {
                  // First resume the session (this resets cashouts to undefined)
                  dispatch(resumeCompletedSession(lastCompletedSession.id));
                  dispatch(markUnsyncedChanges());

                  // Restore saved cash-out amounts from localStorage if available
                  try {
                    const savedJson = localStorage.getItem(SAVED_SESSION_KEY);
                    if (savedJson) {
                      const savedData: SavedSessionData = JSON.parse(savedJson);
                      if (savedData.sessionId === lastCompletedSession.id) {
                        // Get the current state to find playerSession IDs
                        const state = (window as any).__REDUX_STORE__?.getState?.();
                        if (state) {
                          const currentPlayerSessions = state.sessions.playerSessions.filter(
                            (ps: any) => ps.sessionId === lastCompletedSession.id
                          );

                          // Restore cash-out amounts for each player
                          savedData.playerSessions.forEach(saved => {
                            if (saved.cashOut !== undefined) {
                              const matchingPs = currentPlayerSessions.find(
                                (ps: any) => ps.playerId === saved.playerId
                              );
                              if (matchingPs) {
                                dispatch(setCashOut({
                                  playerSessionId: matchingPs.id,
                                  amount: saved.cashOut,
                                }));
                              }
                            }
                          });
                        }
                      }
                    }
                  } catch (e) {
                    console.error('Error restoring session data:', e);
                  }
                }}
                className="btn-nb bg-nb-orange text-nb-black whitespace-nowrap"
              >
                Resume Game
              </button>
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
            {(activeSession.stakes || activeSession.location) && (
              <p className="text-theme-secondary">
                {activeSession.stakes}
                {activeSession.stakes && activeSession.location && ' @ '}
                {!activeSession.stakes && activeSession.location && '@ '}
                {activeSession.location}
              </p>
            )}
          </div>
          <button
            onClick={handleEndSession}
            disabled={isSavingToSheet}
            className={`btn-nb-danger ${isSavingToSheet ? 'opacity-50 cursor-wait' : ''}`}
          >
            {isSavingToSheet ? 'Saving...' : 'End Session'}
          </button>
        </div>
      </div>

      {/* Table Total */}
      <div className="card-nb bg-nb-yellow text-nb-black">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-nb-black">Total on Table</div>
            <div className="text-3xl font-bold text-nb-black">{formatMoney(tableTotal)}</div>
          </div>
          {cashOutTotal > 0 && (
            <div className="text-center">
              <div className="text-sm font-semibold text-nb-black">Cashed Out</div>
              <div className="text-2xl font-bold text-nb-black">{formatMoney(cashOutTotal)}</div>
            </div>
          )}
          {cashOutTotal > 0 && (
            <div className="text-right">
              <div className="text-sm font-semibold text-nb-black">Difference</div>
              <div className={`text-2xl font-bold ${
                cashOutTotal - tableTotal === 0
                  ? 'text-nb-green'
                  : 'text-nb-red'
              }`}>
                {formatMoneyWithSign(cashOutTotal - tableTotal)}
              </div>
            </div>
          )}
          <button
            onClick={() => {
              setPlayerValue('buyInAmount', settings.defaultBuyIn);
              setShowAddPlayer(true);
            }}
            className="btn-nb text-nb-black"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            + Add Player
          </button>
        </div>
      </div>

      {/* Players List */}
      <div className="card-nb overflow-x-auto">
        <h3 className="mb-4">Players</h3>
        {activePlayerSessions.length === 0 ? (
          <p className="text-theme-secondary text-center py-8">
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
                          onClick={() => {
                            setBuyInAmount(settings.defaultBuyIn.toString());
                            setShowBuyInModal(ps.id);
                          }}
                          className="w-6 h-6 flex items-center justify-center border-2 text-xs font-bold hover:bg-nb-yellow"
                          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
                        >
                          +
                        </button>
                      </div>
                      <div className="text-sm text-theme-secondary mt-1">
                        Total: {formatMoney(totalBuyIns)}
                      </div>
                    </td>
                    <td>
                      {ps.cashOut !== undefined ? (
                        <button
                          onClick={() => {
                            setCashOutAmount(ps.cashOut!.toString());
                            setShowCashOutModal(ps.id);
                          }}
                          className="font-semibold hover:text-nb-blue hover:underline cursor-pointer"
                          title="Click to edit"
                        >
                          {formatMoney(ps.cashOut)}
                        </button>
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
                        <span className="text-theme-secondary">-</span>
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
                className="w-8 h-8 flex items-center justify-center border-2 font-bold"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}
              >
                X
              </button>
            </div>
            <form onSubmit={handlePlayerSubmit(onAddPlayer)} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Player</label>
                <select {...registerPlayer('playerId')} className="select-nb" required>
                  <option value="">Select a player</option>
                  {sortedAvailablePlayers.map(p => {
                    const gameCount = playerGameCounts.get(p.id) || 0;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({gameCount} {gameCount === 1 ? 'game' : 'games'})
                      </option>
                    );
                  })}
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
      {showCashOutModal && (() => {
        const currentPlayerSession = activePlayerSessions.find(ps => ps.id === showCashOutModal);
        const isEditing = currentPlayerSession?.cashOut !== undefined;
        const playerName = getPlayerName(currentPlayerSession?.playerId || '');

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="card-nb w-full max-w-sm mx-4">
              <h3 className="mb-4">{isEditing ? 'Edit Cash Out' : 'Cash Out'}</h3>
              {playerName && (
                <p className="text-sm text-theme-secondary mb-4">Player: {playerName}</p>
              )}
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
                    {isEditing ? 'Update' : 'Confirm'}
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
        );
      })()}
    </div>
  );
};

export default PlayPage;
