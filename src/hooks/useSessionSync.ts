import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from './useAppSelector';
import {
  createSession,
  addPlayerToSession,
  addPlayer,
  setCashOut,
  removePlayerFromSession,
  clearUnsyncedChanges,
  setSyncStatus,
} from '../store';
import { getLocalDateString, parseLocalDate } from '../utils/statistics';
import { googleDriveService } from '../services/googleDrive';

const POLL_INTERVAL = 30000;

interface RemoteGame {
  date: Date;
  players: { playerName: string; totalBuyIn: number; cashOut?: number }[];
}

export function useSessionSync() {
  const dispatch = useAppDispatch();
  const { players } = useAppSelector((state) => state.players);
  const { sessions, playerSessions, activeSessionId } = useAppSelector(
    (state) => state.sessions,
  );
  const { importedSpreadsheetId, isGoogleConnected } = useAppSelector(
    (state) => state.ui,
  );

  const [isSyncingInProgress, setIsSyncingInProgress] = useState(false);
  const [remoteInProgressGame, setRemoteInProgressGame] =
    useState<RemoteGame | null>(null);
  const [showJoinGameModal, setShowJoinGameModal] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncedDataRef = useRef<string>('');
  const isLoadingFromSpreadsheetRef = useRef(false);
  const lastLocalChangeTimeRef = useRef<number>(0);
  const isPollingSuspendedRef = useRef(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId);
  }, [sessions, activeSessionId]);

  const activePlayerSessions = useMemo(() => {
    if (!activeSessionId) return [];
    return playerSessions.filter((ps) => ps.sessionId === activeSessionId);
  }, [playerSessions, activeSessionId]);

  const suspendPolling = useCallback(() => {
    lastLocalChangeTimeRef.current = Date.now();
    isPollingSuspendedRef.current = true;
    setTimeout(() => {
      isPollingSuspendedRef.current = false;
    }, 3000);
  }, []);

  const createNormalizedHash = useCallback(
    (
      playerData: {
        playerName: string;
        totalBuyIn: number;
        cashOut?: number;
      }[],
    ) => {
      const normalized = playerData
        .map((p) => ({
          name: p.playerName.toLowerCase().trim(),
          buyIn: Math.round(p.totalBuyIn * 100),
          cashOut: p.cashOut !== undefined ? Math.round(p.cashOut * 100) : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return JSON.stringify(normalized);
    },
    [],
  );

  const syncInProgressToSheet = useCallback(async () => {
    if (
      !isGoogleConnected ||
      !importedSpreadsheetId ||
      !activeSession ||
      !activeSessionId
    ) {
      return;
    }

    if (isLoadingFromSpreadsheetRef.current) {
      return;
    }

    const playerData = activePlayerSessions.map((ps) => {
      const player = players.find((p) => p.id === ps.playerId);
      const totalBuyIn = ps.buyIns.reduce((sum, b) => sum + b.amount, 0);
      return {
        playerName: player?.name || 'Unknown',
        totalBuyIn,
        cashOut: ps.cashOut,
      };
    });

    if (playerData.length === 0) {
      return;
    }

    const dataHash = createNormalizedHash(playerData);
    if (dataHash === lastSyncedDataRef.current) {
      return;
    }

    if (isSyncingRef.current) {
      return;
    }

    try {
      isSyncingRef.current = true;
      setIsSyncingInProgress(true);
      await googleDriveService.updateInProgressSession(
        importedSpreadsheetId,
        parseLocalDate(activeSession.date),
        playerData,
      );
      lastSyncedDataRef.current = dataHash;
      dispatch(clearUnsyncedChanges());
      dispatch(
        setSyncStatus({
          lastSyncTime: new Date().toISOString(),
          hasUnsyncedChanges: false,
          error: null,
        }),
      );
    } catch (error) {
      console.error('Error syncing in-progress game:', error);
    } finally {
      isSyncingRef.current = false;
      setIsSyncingInProgress(false);
    }
  }, [
    dispatch,
    isGoogleConnected,
    importedSpreadsheetId,
    activeSession,
    activeSessionId,
    activePlayerSessions,
    players,
    createNormalizedHash,
  ]);

  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(() => {
      syncInProgressToSheet();
    }, 500);
  }, [syncInProgressToSheet]);

  const loadGameFromSpreadsheet = useCallback(
    async (remoteGame: RemoteGame) => {
      isLoadingFromSpreadsheetRef.current = true;

      dispatch(
        createSession({
          date: getLocalDateString(remoteGame.date),
          gameType: 'cash',
        }),
      );

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
          let localPlayer = state.players.players.find(
            (p: any) =>
              p.name.toLowerCase() === remotePlayer.playerName.toLowerCase(),
          );

          if (!localPlayer) {
            dispatch(addPlayer({ name: remotePlayer.playerName }));
            const updatedState = (window as any).__REDUX_STORE__?.getState?.();
            if (updatedState) {
              localPlayer = updatedState.players.players.find(
                (p: any) =>
                  p.name.toLowerCase() ===
                  remotePlayer.playerName.toLowerCase(),
              );
            }
          }

          if (localPlayer) {
            dispatch(
              addPlayerToSession({
                sessionId: newSessionId,
                playerId: localPlayer.id,
                buyInAmount: remotePlayer.totalBuyIn,
              }),
            );

            if (remotePlayer.cashOut !== undefined) {
              pendingCashOuts++;
              setTimeout(() => {
                const latestState = (
                  window as any
                ).__REDUX_STORE__?.getState?.();
                if (latestState) {
                  const ps = latestState.sessions.playerSessions.find(
                    (ps: any) =>
                      ps.sessionId === newSessionId &&
                      ps.playerId === localPlayer.id,
                  );
                  if (ps) {
                    dispatch(
                      setCashOut({
                        playerSessionId: ps.id,
                        amount: remotePlayer.cashOut!,
                      }),
                    );
                  }
                }
                pendingCashOuts--;
                if (pendingCashOuts === 0) {
                  isLoadingFromSpreadsheetRef.current = false;
                }
              }, 50);
            }
          }
        }

        lastSyncedDataRef.current = JSON.stringify(
          remoteGame.players.sort((a, b) =>
            a.playerName.localeCompare(b.playerName),
          ),
        );

        if (pendingCashOuts === 0) {
          isLoadingFromSpreadsheetRef.current = false;
        }
      }, 100);
    },
    [dispatch],
  );

  const checkForRemoteInProgressGame = useCallback(async () => {
    if (!isGoogleConnected || !importedSpreadsheetId || activeSessionId) {
      return;
    }

    try {
      const remoteGame = await googleDriveService.getInProgressGame(
        importedSpreadsheetId,
      );
      if (remoteGame && remoteGame.players.length > 0) {
        setRemoteInProgressGame(remoteGame);
        setShowJoinGameModal(true);
      }
    } catch (error) {
      console.error('Error checking for remote in-progress game:', error);
    }
  }, [isGoogleConnected, importedSpreadsheetId, activeSessionId]);

  const pollForUpdates = useCallback(async () => {
    if (isPollingSuspendedRef.current || isSyncingInProgress) {
      return;
    }

    if (
      !isGoogleConnected ||
      !importedSpreadsheetId ||
      !activeSession ||
      !activeSessionId
    ) {
      return;
    }

    try {
      const remoteGame = await googleDriveService.getInProgressGame(
        importedSpreadsheetId,
      );

      if (!remoteGame) {
        console.log(
          'No in-progress game found in spreadsheet - game may have been ended elsewhere',
        );
        return;
      }

      const localPlayerData = activePlayerSessions.map((ps) => {
        const player = players.find((p) => p.id === ps.playerId);
        const totalBuyIn = ps.buyIns.reduce((sum, b) => sum + b.amount, 0);
        return {
          playerName: player?.name || 'Unknown',
          totalBuyIn,
          cashOut: ps.cashOut,
        };
      });

      const localHash = createNormalizedHash(localPlayerData);
      const remoteHash = createNormalizedHash(remoteGame.players);

      if (localHash === remoteHash) {
        lastSyncedDataRef.current = localHash;
        return;
      }

      console.log(
        'Detected remote changes, updating local state from spreadsheet...',
      );

      for (const remotePlayer of remoteGame.players) {
        let localPlayer = players.find(
          (p) => p.name.toLowerCase() === remotePlayer.playerName.toLowerCase(),
        );

        if (!localPlayer) {
          dispatch(addPlayer({ name: remotePlayer.playerName }));
          const state = (window as any).__REDUX_STORE__?.getState?.();
          if (state) {
            localPlayer = state.players.players.find(
              (p: any) =>
                p.name.toLowerCase() === remotePlayer.playerName.toLowerCase(),
            );
          }
        }

        if (!localPlayer) continue;

        const existingPs = activePlayerSessions.find(
          (ps) => ps.playerId === localPlayer!.id,
        );

        if (!existingPs) {
          dispatch(
            addPlayerToSession({
              sessionId: activeSessionId,
              playerId: localPlayer.id,
              buyInAmount: remotePlayer.totalBuyIn,
            }),
          );

          if (remotePlayer.cashOut !== undefined) {
            setTimeout(() => {
              const state = (window as any).__REDUX_STORE__?.getState?.();
              if (state) {
                const ps = state.sessions.playerSessions.find(
                  (ps: any) =>
                    ps.sessionId === activeSessionId &&
                    ps.playerId === localPlayer!.id,
                );
                if (ps) {
                  dispatch(
                    setCashOut({
                      playerSessionId: ps.id,
                      amount: remotePlayer.cashOut!,
                    }),
                  );
                }
              }
            }, 50);
          }
        } else {
          const remoteCashOut = remotePlayer.cashOut;
          if (
            remoteCashOut !== undefined &&
            existingPs.cashOut !== remoteCashOut
          ) {
            dispatch(
              setCashOut({
                playerSessionId: existingPs.id,
                amount: remoteCashOut,
              }),
            );
          }
        }
      }

      if (!isSyncingInProgress) {
        const remotePlayerNames = new Set(
          remoteGame.players.map((p) => p.playerName.toLowerCase()),
        );
        for (const ps of activePlayerSessions) {
          const player = players.find((p) => p.id === ps.playerId);
          if (player && !remotePlayerNames.has(player.name.toLowerCase())) {
            dispatch(removePlayerFromSession(ps.id));
          }
        }
      }

      lastSyncedDataRef.current = remoteHash;
    } catch (error) {
      console.error('Error polling for updates:', error);
    }
  }, [
    isGoogleConnected,
    importedSpreadsheetId,
    activeSession,
    activeSessionId,
    activePlayerSessions,
    players,
    dispatch,
    isSyncingInProgress,
    createNormalizedHash,
  ]);

  useEffect(() => {
    if (activeSession && isGoogleConnected && importedSpreadsheetId) {
      pollIntervalRef.current = setInterval(pollForUpdates, POLL_INTERVAL);

      pollForUpdates().then(() => {
        if (!isLoadingFromSpreadsheetRef.current) {
          syncInProgressToSheet();
        }
      });

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;
        }
      };
    }
  }, [
    activeSession,
    isGoogleConnected,
    importedSpreadsheetId,
    pollForUpdates,
    syncInProgressToSheet,
  ]);

  useEffect(() => {
    checkForRemoteInProgressGame();
  }, [checkForRemoteInProgressGame]);

  const dismissJoinGame = useCallback(() => {
    setShowJoinGameModal(false);
    setRemoteInProgressGame(null);
  }, []);

  return {
    activeSession,
    activePlayerSessions,
    isSyncingInProgress,
    showJoinGameModal,
    remoteInProgressGame,
    loadGameFromSpreadsheet,
    debouncedSync,
    suspendPolling,
    dismissJoinGame,
  };
}
