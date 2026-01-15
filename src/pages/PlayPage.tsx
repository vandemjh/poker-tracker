import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  mergePlayers,
  replaceImportedSessions,
  clearUnsyncedChanges,
  setSyncStatus,
} from '../store';
import { formatMoney, formatMoneyWithSign, validateZeroSum } from '../utils/statistics';
import { googleDriveService } from '../services/googleDrive';
import { parseSpreadsheetData, remapPlayerIds } from '../utils/csvImport';
import type { CreateSessionForm, AddPlayerToSessionForm } from '../types';

// Polling interval for collaborative updates (in ms)
const POLL_INTERVAL = 5000;

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
  const [isSyncingInProgress, setIsSyncingInProgress] = useState(false);
  const [remoteInProgressGame, setRemoteInProgressGame] = useState<{
    date: Date;
    players: { playerName: string; totalBuyIn: number; cashOut?: number }[];
  } | null>(null);
  const [showJoinGameModal, setShowJoinGameModal] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedDataRef = useRef<string>('');
  const isLoadingFromSpreadsheetRef = useRef(false);
  const lastLocalChangeTimeRef = useRef<number>(0);
  const isPollingSuspendedRef = useRef(false);

  // Suspend polling for a short time after local changes to avoid race conditions
  const suspendPolling = useCallback(() => {
    lastLocalChangeTimeRef.current = Date.now();
    isPollingSuspendedRef.current = true;
    // Resume polling after 3 seconds
    setTimeout(() => {
      isPollingSuspendedRef.current = false;
    }, 3000);
  }, []);

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

  // Helper to create a normalized hash for comparison
  const createNormalizedHash = useCallback((playerData: { playerName: string; totalBuyIn: number; cashOut?: number }[]) => {
    const normalized = playerData
      .map(p => ({
        name: p.playerName.toLowerCase().trim(),
        buyIn: Math.round(p.totalBuyIn * 100), // Use cents to avoid float issues
        cashOut: p.cashOut !== undefined ? Math.round(p.cashOut * 100) : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return JSON.stringify(normalized);
  }, []);

  // Sync in-progress game state to spreadsheet
  const syncInProgressToSheet = useCallback(async () => {
    if (!isGoogleConnected || !importedSpreadsheetId || !activeSession || !activeSessionId) {
      return;
    }

    // Don't sync while loading from spreadsheet (would overwrite with incomplete data)
    if (isLoadingFromSpreadsheetRef.current) {
      return;
    }

    // Build player data for the spreadsheet
    const playerData = activePlayerSessions.map(ps => {
      const player = players.find(p => p.id === ps.playerId);
      const totalBuyIn = ps.buyIns.reduce((sum, b) => sum + b.amount, 0);
      return {
        playerName: player?.name || 'Unknown',
        totalBuyIn,
        cashOut: ps.cashOut,
      };
    });

    // Don't sync empty player data (would wipe the spreadsheet)
    if (playerData.length === 0) {
      return;
    }

    // Check if data has actually changed to avoid unnecessary API calls
    const dataHash = createNormalizedHash(playerData);
    if (dataHash === lastSyncedDataRef.current) {
      return;
    }

    try {
      setIsSyncingInProgress(true);
      await googleDriveService.updateInProgressSession(
        importedSpreadsheetId,
        new Date(activeSession.date),
        playerData
      );
      lastSyncedDataRef.current = dataHash;
      console.log('Synced in-progress game to spreadsheet');
    } catch (error) {
      console.error('Error syncing in-progress game:', error);
    } finally {
      setIsSyncingInProgress(false);
    }
  }, [isGoogleConnected, importedSpreadsheetId, activeSession, activeSessionId, activePlayerSessions, players, createNormalizedHash]);

  // Load game from spreadsheet's "In Progress" sheet (source of truth)
  const loadGameFromSpreadsheet = useCallback(async (remoteGame: {
    date: Date;
    players: { playerName: string; totalBuyIn: number; cashOut?: number }[];
  }) => {
    // Set flag to prevent syncing while we're loading
    isLoadingFromSpreadsheetRef.current = true;

    // Create a session with the remote game's date
    dispatch(createSession({
      date: remoteGame.date.toISOString().split('T')[0],
      gameType: 'cash',
    }));

    // Wait for session to be created, then add players
    setTimeout(() => {
      const state = (window as any).__REDUX_STORE__?.getState?.();
      if (!state) {
        isLoadingFromSpreadsheetRef.current = false;
        return;
      }

      const newSessionId = state.sessions.activeSessionId;
      if (!newSessionId) {
        isLoadingFromSpreadsheetRef.current = false;
        return;
      }

      let pendingCashOuts = 0;

      for (const remotePlayer of remoteGame.players) {
        // Find or create the player
        let localPlayer = state.players.players.find(
          (p: any) => p.name.toLowerCase() === remotePlayer.playerName.toLowerCase()
        );

        if (!localPlayer) {
          dispatch(addPlayer({ name: remotePlayer.playerName }));
          const updatedState = (window as any).__REDUX_STORE__?.getState?.();
          if (updatedState) {
            localPlayer = updatedState.players.players.find(
              (p: any) => p.name.toLowerCase() === remotePlayer.playerName.toLowerCase()
            );
          }
        }

        if (localPlayer) {
          dispatch(addPlayerToSession({
            sessionId: newSessionId,
            playerId: localPlayer.id,
            buyInAmount: remotePlayer.totalBuyIn,
          }));

          // Set cash-out if it exists
          if (remotePlayer.cashOut !== undefined) {
            pendingCashOuts++;
            setTimeout(() => {
              const latestState = (window as any).__REDUX_STORE__?.getState?.();
              if (latestState) {
                const ps = latestState.sessions.playerSessions.find(
                  (ps: any) => ps.sessionId === newSessionId && ps.playerId === localPlayer.id
                );
                if (ps) {
                  dispatch(setCashOut({
                    playerSessionId: ps.id,
                    amount: remotePlayer.cashOut!,
                  }));
                }
              }
              pendingCashOuts--;
              // Clear loading flag when all cash-outs are done
              if (pendingCashOuts === 0) {
                isLoadingFromSpreadsheetRef.current = false;
              }
            }, 50);
          }
        }
      }

      // Update the hash to prevent immediate re-sync
      lastSyncedDataRef.current = JSON.stringify(remoteGame.players.sort((a, b) => a.playerName.localeCompare(b.playerName)));

      // Clear loading flag if there were no cash-outs to wait for
      if (pendingCashOuts === 0) {
        isLoadingFromSpreadsheetRef.current = false;
      }
    }, 100);
  }, [dispatch]);

  // Check for in-progress game from spreadsheet on mount
  const checkForRemoteInProgressGame = useCallback(async () => {
    if (!isGoogleConnected || !importedSpreadsheetId || activeSessionId) {
      return;
    }
    
    try {
      const remoteGame = await googleDriveService.getInProgressGame(importedSpreadsheetId);
      if (remoteGame && remoteGame.players.length > 0) {
        setRemoteInProgressGame(remoteGame);
        setShowJoinGameModal(true);
      }
    } catch (error) {
      console.error('Error checking for remote in-progress game:', error);
    }
  }, [isGoogleConnected, importedSpreadsheetId, activeSessionId]);

  // Poll for updates from other collaborators - spreadsheet is source of truth
  const pollForUpdates = useCallback(async () => {
    // Skip polling if suspended (recent local change) or currently syncing
    if (isPollingSuspendedRef.current || isSyncingInProgress) {
      return;
    }

    if (!isGoogleConnected || !importedSpreadsheetId || !activeSession || !activeSessionId) {
      return;
    }

    try {
      const remoteGame = await googleDriveService.getInProgressGame(importedSpreadsheetId);

      // If no remote game exists but we have a local session, the game was ended elsewhere
      if (!remoteGame) {
        console.log('No in-progress game found in spreadsheet - game may have been ended elsewhere');
        return;
      }

      // Build current local state for comparison
      const localPlayerData = activePlayerSessions.map(ps => {
        const player = players.find(p => p.id === ps.playerId);
        const totalBuyIn = ps.buyIns.reduce((sum, b) => sum + b.amount, 0);
        return {
          playerName: player?.name || 'Unknown',
          totalBuyIn,
          cashOut: ps.cashOut,
        };
      });

      // Use normalized hash for comparison
      const localHash = createNormalizedHash(localPlayerData);
      const remoteHash = createNormalizedHash(remoteGame.players);

      // Skip if nothing changed
      if (localHash === remoteHash) {
        // Update the lastSyncedDataRef to match
        lastSyncedDataRef.current = localHash;
        return;
      }

      console.log('Detected remote changes, updating local state from spreadsheet...');

      // Update/add players from remote
      for (const remotePlayer of remoteGame.players) {
        let localPlayer = players.find(p => p.name.toLowerCase() === remotePlayer.playerName.toLowerCase());

        // Add player if they don't exist locally
        if (!localPlayer) {
          dispatch(addPlayer({ name: remotePlayer.playerName }));
          const state = (window as any).__REDUX_STORE__?.getState?.();
          if (state) {
            localPlayer = state.players.players.find(
              (p: any) => p.name.toLowerCase() === remotePlayer.playerName.toLowerCase()
            );
          }
        }

        if (!localPlayer) continue;

        const existingPs = activePlayerSessions.find(ps => ps.playerId === localPlayer!.id);

        if (!existingPs) {
          // Add player to session
          dispatch(addPlayerToSession({
            sessionId: activeSessionId,
            playerId: localPlayer.id,
            buyInAmount: remotePlayer.totalBuyIn,
          }));

          // Set cash-out if exists
          if (remotePlayer.cashOut !== undefined) {
            setTimeout(() => {
              const state = (window as any).__REDUX_STORE__?.getState?.();
              if (state) {
                const ps = state.sessions.playerSessions.find(
                  (ps: any) => ps.sessionId === activeSessionId && ps.playerId === localPlayer!.id
                );
                if (ps) {
                  dispatch(setCashOut({ playerSessionId: ps.id, amount: remotePlayer.cashOut! }));
                }
              }
            }, 50);
          }
        } else {
          // Update cash-out if different (spreadsheet is source of truth)
          const remoteCashOut = remotePlayer.cashOut;
          if (remoteCashOut !== undefined && existingPs.cashOut !== remoteCashOut) {
            dispatch(setCashOut({ playerSessionId: existingPs.id, amount: remoteCashOut }));
          }
        }
      }

      // Remove players that are no longer in remote (spreadsheet is source of truth)
      // BUT only if we're not currently syncing (to avoid race condition where
      // a newly added player gets removed before the sync completes)
      if (!isSyncingInProgress) {
        const remotePlayerNames = new Set(remoteGame.players.map(p => p.playerName.toLowerCase()));
        for (const ps of activePlayerSessions) {
          const player = players.find(p => p.id === ps.playerId);
          if (player && !remotePlayerNames.has(player.name.toLowerCase())) {
            // Player was removed from spreadsheet
            dispatch(removePlayerFromSession(ps.id));
          }
        }
      }

      lastSyncedDataRef.current = remoteHash;
    } catch (error) {
      console.error('Error polling for updates:', error);
    }
  }, [isGoogleConnected, importedSpreadsheetId, activeSession, activeSessionId, activePlayerSessions, players, dispatch, isSyncingInProgress, createNormalizedHash]);

  // Start/stop polling when active session changes
  useEffect(() => {
    if (activeSession && isGoogleConnected && importedSpreadsheetId) {
      // Start polling for updates from other devices
      pollIntervalRef.current = setInterval(pollForUpdates, POLL_INTERVAL);

      // Do an immediate poll to get any updates, then sync local state
      // The sync has guards to prevent overwriting with empty/loading data
      pollForUpdates().then(() => {
        // Only sync after polling, and only if not loading from spreadsheet
        if (!isLoadingFromSpreadsheetRef.current) {
          syncInProgressToSheet();
        }
      });

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
    }
  }, [activeSession, isGoogleConnected, importedSpreadsheetId, pollForUpdates, syncInProgressToSheet]);

  // Check for remote in-progress game on mount
  useEffect(() => {
    checkForRemoteInProgressGame();
  }, [checkForRemoteInProgressGame]);

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

  const onCreateSession = async (data: CreateSessionForm) => {
    // Clear the "In Progress" sheet when starting a NEW game
    // This ensures we don't have stale data from a previous session
    if (isGoogleConnected && importedSpreadsheetId) {
      try {
        await googleDriveService.clearInProgressSheet(importedSpreadsheetId);
        console.log('Cleared in-progress sheet for new game');
      } catch (error) {
        console.error('Error clearing in-progress sheet:', error);
      }
    }

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
            // Sync to spreadsheet after adding player
            suspendPolling();
            setTimeout(() => syncInProgressToSheet(), 100);
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
      // Sync to spreadsheet after adding player
      suspendPolling();
      setTimeout(() => syncInProgressToSheet(), 100);
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
      // Sync to spreadsheet after adding buy-in
      suspendPolling();
      setTimeout(() => syncInProgressToSheet(), 100);
    }
    setBuyInAmount('');
    setShowBuyInModal(null);
  };

  const handleCashOut = (playerSessionId: string) => {
    const amount = parseFloat(cashOutAmount);
    if (!isNaN(amount) && amount >= 0) {
      dispatch(setCashOut({ playerSessionId, amount }));
      dispatch(markUnsyncedChanges());
      // Sync to spreadsheet after cash out
      suspendPolling();
      setTimeout(() => syncInProgressToSheet(), 100);
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

        // Get session date
        const sessionDate = new Date(activeSession.date);

        // Note: We do NOT clear the "In Progress" sheet here.
        // It stays populated until the user starts a NEW game,
        // allowing them to resume an accidentally ended session.

        // Build player results for the spreadsheet
        const playerResults = activePlayerSessions.map(ps => {
          const player = players.find(p => p.id === ps.playerId);
          return {
            playerName: player?.name || 'Unknown',
            netResult: ps.netResult,
          };
        });

        // Append to the Google Sheet
        await googleDriveService.appendSessionColumn(
          importedSpreadsheetId,
          sessionDate,
          playerResults
        );

        console.log('Session saved to Google Sheet successfully');

        // Mark the local session as complete (keeps it for resume feature)
        dispatch(completeSession(activeSessionId));

        // Sync from spreadsheet to ensure local state matches
        try {
          const spreadsheetData = await googleDriveService.getSpreadsheetData(importedSpreadsheetId);
          const parsedResult = parseSpreadsheetData(spreadsheetData);

          // Remap player IDs to match existing players
          const result = remapPlayerIds(parsedResult, players);

          dispatch(mergePlayers(result.players));
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
                          onClick={() => {
                            dispatch(removePlayerFromSession(ps.id));
                            dispatch(markUnsyncedChanges());
                            // Sync to spreadsheet after removing player
                            suspendPolling();
                            setTimeout(() => syncInProgressToSheet(), 100);
                          }}
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
                  inputMode="decimal"
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
                  inputMode="decimal"
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
                    inputMode="decimal"
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

      {/* Join In-Progress Game Modal */}
      {showJoinGameModal && remoteInProgressGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="card-nb w-full max-w-md mx-4">
            <h3 className="mb-4">In-Progress Game Found</h3>
            <p className="text-theme-secondary mb-4">
              There's an in-progress game from {remoteInProgressGame.date.toLocaleDateString()} with {remoteInProgressGame.players.length} player{remoteInProgressGame.players.length !== 1 ? 's' : ''}.
            </p>
            <div className="text-sm mb-4 max-h-32 overflow-y-auto">
              {remoteInProgressGame.players.map((p, i) => (
                <div key={i} className="flex justify-between py-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span>{p.playerName}</span>
                  <span>Buy-in: {formatMoney(p.totalBuyIn)}{p.cashOut !== undefined && ` | Cash-out: ${formatMoney(p.cashOut)}`}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  loadGameFromSpreadsheet(remoteInProgressGame);
                  setShowJoinGameModal(false);
                  setRemoteInProgressGame(null);
                }}
                className="btn-nb-success"
              >
                Continue Game
              </button>
              <button
                onClick={() => {
                  setShowJoinGameModal(false);
                  setRemoteInProgressGame(null);
                }}
                className="btn-nb"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync indicator */}
      {isSyncingInProgress && (
        <div className="fixed bottom-4 right-4 bg-nb-blue text-white px-3 py-2 rounded-lg shadow-lg text-sm">
          Syncing...
        </div>
      )}
    </div>
  );
};

export default PlayPage;
