import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  removeBuyIn,
  markUnsyncedChanges,
  mergePlayers,
  replaceImportedSessions,
  clearUnsyncedChanges,
  setSyncStatus,
  updateBuyIn,
} from '../store';
import { parseLocalDate, validateZeroSum } from '../utils/statistics';
import { googleDriveService } from '../services/googleDrive';
import { parseSpreadsheetData, remapPlayerIds } from '../utils/csvImport';
import { useSessionSync } from '../hooks/useSessionSync';
import { NoSessionView } from '../components/play/NoSessionView';
import { ActiveSessionView } from '../components/play/ActiveSessionView';
import { AddPlayerModal } from '../components/play/AddPlayerModal';
import {
  BuyInModal,
  EditBuyInModal,
  CashOutModal,
  RemovePlayerModal,
} from '../components/play/ActionModals';
import {
  JoinGameModal,
  EndSessionSummaryModal,
} from '../components/play/SessionModals';
import type { CreateSessionForm, AddPlayerToSessionForm } from '../types';

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
  const { players } = useAppSelector((state) => state.players);
  const { sessions, playerSessions, activeSessionId } = useAppSelector(
    (state) => state.sessions,
  );
  const { importedSpreadsheetId, isGoogleConnected, settings } = useAppSelector(
    (state) => state.ui,
  );

  const {
    activeSession,
    activePlayerSessions,
    isSyncingInProgress,
    showJoinGameModal,
    remoteInProgressGame,
    loadGameFromSpreadsheet,
    debouncedSync,
    suspendPolling,
    dismissJoinGame,
  } = useSessionSync();

  // Modal visibility state
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showBuyInModal, setShowBuyInModal] = useState<string | null>(null);
  const [showEditBuyInModal, setShowEditBuyInModal] = useState<{
    playerSessionId: string;
    buyInId: string;
  } | null>(null);
  const [showCashOutModal, setShowCashOutModal] = useState<string | null>(null);
  const [showRemovePlayerModal, setShowRemovePlayerModal] = useState<
    string | null
  >(null);
  const [isSavingToSheet, setIsSavingToSheet] = useState(false);
  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [showBalanceWarning, setShowBalanceWarning] = useState(false);
  const [balanceWarningFading, setBalanceWarningFading] = useState(false);

  useEffect(() => {
    if (showBalanceWarning) {
      setBalanceWarningFading(false);
      const fadeTimer = setTimeout(() => setBalanceWarningFading(true), 3500);
      const removeTimer = setTimeout(() => {
        setShowBalanceWarning(false);
        setBalanceWarningFading(false);
      }, 4000);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [showBalanceWarning]);

  const tableTotal = useMemo(() => {
    return activePlayerSessions.reduce(
      (sum, ps) =>
        sum + ps.buyIns.reduce((buyInSum, b) => buyInSum + b.amount, 0),
      0,
    );
  }, [activePlayerSessions]);

  const cashOutTotal = useMemo(() => {
    return activePlayerSessions.reduce((sum, ps) => sum + (ps.cashOut || 0), 0);
  }, [activePlayerSessions]);

  const sessionBalances = useMemo(() => {
    if (!activeSessionId) return true;
    const { isValid } = validateZeroSum(activeSessionId, activePlayerSessions);
    return isValid;
  }, [activeSessionId, activePlayerSessions]);

  const playerGameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    players.forEach((player) => {
      const gameCount = playerSessions.filter(
        (ps) => ps.playerId === player.id,
      ).length;
      counts.set(player.id, gameCount);
    });
    return counts;
  }, [players, playerSessions]);

  const sortedAllPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const countA = playerGameCounts.get(a.id) || 0;
      const countB = playerGameCounts.get(b.id) || 0;
      return countB - countA;
    });
  }, [players, playerGameCounts]);

  const activePlayerIds = useMemo(() => {
    return new Set(activePlayerSessions.map((ps) => ps.playerId));
  }, [activePlayerSessions]);

  const getPlayerName = useCallback(
    (playerId: string) => {
      return players.find((p) => p.id === playerId)?.name || 'Unknown';
    },
    [players],
  );

  const onCreateSession = useCallback(
    async (data: CreateSessionForm) => {
      if (isGoogleConnected && importedSpreadsheetId) {
        try {
          await googleDriveService.clearInProgressSheet(importedSpreadsheetId);
        } catch (error) {
          console.error('Error clearing in-progress sheet:', error);
        }
      }
      dispatch(createSession(data));
      dispatch(markUnsyncedChanges());
    },
    [dispatch, isGoogleConnected, importedSpreadsheetId],
  );

  const onAddPlayer = useCallback(
    (data: AddPlayerToSessionForm) => {
      if (!activeSessionId) return;

      if (data.playerId === 'new' && data.newPlayerName) {
        dispatch(addPlayer({ name: data.newPlayerName }));

        setTimeout(() => {
          const state = (window as any).__REDUX_STORE__?.getState?.();
          if (state) {
            const newestPlayer =
              state.players.players[state.players.players.length - 1];
            if (newestPlayer) {
              dispatch(
                addPlayerToSession({
                  sessionId: activeSessionId,
                  playerId: newestPlayer.id,
                  buyInAmount: data.buyInAmount,
                }),
              );
              suspendPolling();
              debouncedSync();
            }
          }
        }, 0);
      } else if (data.playerId) {
        dispatch(
          addPlayerToSession({
            sessionId: activeSessionId,
            playerId: data.playerId,
            buyInAmount: data.buyInAmount,
          }),
        );
        suspendPolling();
        debouncedSync();
      }

      dispatch(markUnsyncedChanges());
      setShowAddPlayer(false);
    },
    [dispatch, activeSessionId, players, suspendPolling, debouncedSync],
  );

  const handleAddBuyIn = useCallback(
    (playerSessionId: string, amount: number) => {
      dispatch(addBuyIn({ playerSessionId, amount }));
      dispatch(markUnsyncedChanges());
      suspendPolling();
      debouncedSync();
      setShowBuyInModal(null);
    },
    [dispatch, suspendPolling, debouncedSync],
  );

  const handleUpdateBuyIn = useCallback(
    (playerSessionId: string, buyInId: string, amount: number) => {
      dispatch(updateBuyIn({ playerSessionId, buyInId, amount }));
      dispatch(markUnsyncedChanges());
      suspendPolling();
      debouncedSync();
      setShowEditBuyInModal(null);
    },
    [dispatch, suspendPolling, debouncedSync],
  );

  const handleDeleteBuyIn = useCallback(
    (playerSessionId: string, buyInId: string) => {
      dispatch(removeBuyIn({ playerSessionId, buyInId }));
      dispatch(markUnsyncedChanges());
      suspendPolling();
      debouncedSync();
      setShowEditBuyInModal(null);
    },
    [dispatch, suspendPolling, debouncedSync],
  );

  const handleCashOut = useCallback(
    (playerSessionId: string, amount: number) => {
      dispatch(setCashOut({ playerSessionId, amount }));
      dispatch(markUnsyncedChanges());
      suspendPolling();
      debouncedSync();
      setShowCashOutModal(null);
    },
    [dispatch, suspendPolling, debouncedSync],
  );

  const handleRemovePlayer = useCallback(
    (playerSessionId: string) => {
      dispatch(removePlayerFromSession(playerSessionId));
      dispatch(markUnsyncedChanges());
      suspendPolling();
      debouncedSync();
      setShowRemovePlayerModal(null);
    },
    [dispatch, suspendPolling, debouncedSync],
  );

  const handleEndSession = useCallback(() => {
    if (!activeSessionId || !activeSession) return;

    if (!sessionBalances) {
      setShowBalanceWarning(true);
      return;
    }
    setShowBalanceWarning(false);

    const allCashedOut = activePlayerSessions.every(
      (ps) => ps.cashOut !== undefined,
    );
    if (!allCashedOut) {
      alert('All players must cash out before ending the session.');
      return;
    }

    const savedData: SavedSessionData = {
      sessionId: activeSessionId,
      playerSessions: activePlayerSessions.map((ps) => ({
        playerId: ps.playerId,
        buyIns: ps.buyIns,
        cashOut: ps.cashOut,
      })),
    };
    localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(savedData));

    setShowEndSessionModal(true);
  }, [activeSessionId, activeSession, sessionBalances, activePlayerSessions]);

  const confirmEndSession = useCallback(async () => {
    if (!activeSessionId || !activeSession) return;

    setShowEndSessionModal(false);

    if (isGoogleConnected && importedSpreadsheetId) {
      try {
        setIsSavingToSheet(true);

        const sessionDate = parseLocalDate(activeSession.date);

        const playerResults = activePlayerSessions.map((ps) => {
          const player = players.find((p) => p.id === ps.playerId);
          return {
            playerName: player?.name || 'Unknown',
            netResult: ps.netResult,
          };
        });

        await googleDriveService.appendSessionColumn(
          importedSpreadsheetId,
          sessionDate,
          playerResults,
        );

        dispatch(completeSession(activeSessionId));

        try {
          const spreadsheetData = await googleDriveService.getSpreadsheetData(
            importedSpreadsheetId,
          );
          const parsedResult = parseSpreadsheetData(spreadsheetData);
          const result = remapPlayerIds(parsedResult, players);
          dispatch(mergePlayers(result.players));
          dispatch(
            replaceImportedSessions({
              sessions: result.sessions,
              playerSessions: result.playerSessions,
            }),
          );
          dispatch(clearUnsyncedChanges());
          dispatch(
            setSyncStatus({
              lastSyncTime: new Date().toISOString(),
              hasUnsyncedChanges: false,
              error: null,
            }),
          );
        } catch (syncError) {
          console.error('Error syncing after save:', syncError);
        }
      } catch (error) {
        console.error('Error saving to Google Sheet:', error);
        alert(
          `Failed to save to Google Sheet: ${error}. The session will still be saved locally.`,
        );
        dispatch(completeSession(activeSessionId));
        dispatch(markUnsyncedChanges());
      } finally {
        setIsSavingToSheet(false);
      }
    } else {
      dispatch(completeSession(activeSessionId));
      dispatch(markUnsyncedChanges());
    }

    navigate('/');
  }, [
    dispatch,
    isGoogleConnected,
    importedSpreadsheetId,
    activeSession,
    activeSessionId,
    activePlayerSessions,
    players,
    navigate,
  ]);

  const handleResumeEndedSession = useCallback(
    (sessionId: string) => {
      dispatch(resumeCompletedSession(sessionId));
      dispatch(markUnsyncedChanges());

      try {
        const savedJson = localStorage.getItem(SAVED_SESSION_KEY);
        if (savedJson) {
          const savedData: SavedSessionData = JSON.parse(savedJson);
          if (savedData.sessionId === sessionId) {
            const state = (window as any).__REDUX_STORE__?.getState?.();
            if (state) {
              const currentPlayerSessions =
                state.sessions.playerSessions.filter(
                  (ps: any) => ps.sessionId === sessionId,
                );
              savedData.playerSessions.forEach((saved) => {
                if (saved.cashOut !== undefined) {
                  const matchingPs = currentPlayerSessions.find(
                    (ps: any) => ps.playerId === saved.playerId,
                  );
                  if (matchingPs) {
                    dispatch(
                      setCashOut({
                        playerSessionId: matchingPs.id,
                        amount: saved.cashOut,
                      }),
                    );
                  }
                }
              });
            }
          }
        }
      } catch (e) {
        console.error('Error restoring session data:', e);
      }
    },
    [dispatch],
  );

  const handleResumeSession = useCallback(
    (sessionId: string) => {
      dispatch(setActiveSession(sessionId));
    },
    [dispatch],
  );

  // Block access in local mode
  if (!isGoogleConnected && !activeSessionId) {
    return (
      <div className="max-w-lg mx-auto space-y-6 mt-8 md:mt-16">
        <div className="card-nb p-6 md:p-8 text-center">
          <div className="text-5xl md:text-6xl mb-4">🔒</div>
          <h2 className="text-xl md:text-2xl font-bold mb-3">
            Play Mode Requires Google Connection
          </h2>
          <p className="text-sm md:text-base text-theme-secondary mb-6">
            To ensure your sessions are saved to your linked spreadsheet, you
            need to connect to Google before using Play mode.
          </p>
          <p className="text-xs md:text-sm text-theme-secondary">
            Connect your Google account using the button in the header to unlock
            Play mode.
          </p>
        </div>
      </div>
    );
  }

  // No active session
  if (!activeSession) {
    const incompleteSessions = sessions.filter(
      (s) => !s.isComplete && !s.isImported,
    );

    const recentlyCompletedSessions = sessions
      .filter((s) => s.isComplete && !s.isImported)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    const lastCompletedSession = recentlyCompletedSessions[0];

    return (
      <NoSessionView
        isGoogleConnected={isGoogleConnected}
        incompleteSessions={incompleteSessions}
        lastCompletedSession={lastCompletedSession}
        onStartSession={onCreateSession}
        onResumeSession={handleResumeSession}
        onResumeEndedSession={handleResumeEndedSession}
      />
    );
  }

  // Active session - compute modal data
  const currentCashOutPs = showCashOutModal
    ? activePlayerSessions.find((ps) => ps.id === showCashOutModal)
    : undefined;

  const currentEditBuyInPs = showEditBuyInModal
    ? activePlayerSessions.find(
        (ps) => ps.id === showEditBuyInModal.playerSessionId,
      )
    : undefined;

  const currentBuyIn =
    showEditBuyInModal && currentEditBuyInPs
      ? currentEditBuyInPs.buyIns.find(
          (b) => b.id === showEditBuyInModal.buyInId,
        )
      : undefined;

  const currentRemovePs = showRemovePlayerModal
    ? activePlayerSessions.find((ps) => ps.id === showRemovePlayerModal)
    : undefined;

  return (
    <div className="space-y-6">
      <ActiveSessionView
        activeSession={activeSession}
        activePlayerSessions={activePlayerSessions}
        tableTotal={tableTotal}
        cashOutTotal={cashOutTotal}
        sessionBalances={sessionBalances}
        showBalanceWarning={showBalanceWarning}
        balanceWarningFading={balanceWarningFading}
        isSavingToSheet={isSavingToSheet}
        onAddPlayerClick={() => setShowAddPlayer(true)}
        onAddBuyInClick={(id) => setShowBuyInModal(id)}
        onEditBuyInClick={(psId, buyInId) =>
          setShowEditBuyInModal({
            playerSessionId: psId,
            buyInId,
          })
        }
        onCashOutClick={(id) => setShowCashOutModal(id)}
        onRemovePlayerClick={(id) => setShowRemovePlayerModal(id)}
        onEndSession={handleEndSession}
      />

      <AddPlayerModal
        isOpen={showAddPlayer}
        sortedAllPlayers={sortedAllPlayers}
        activePlayerIds={activePlayerIds}
        playerGameCounts={playerGameCounts}
        defaultBuyIn={settings.defaultBuyIn}
        onAddPlayer={onAddPlayer}
        onClose={() => setShowAddPlayer(false)}
      />

      <BuyInModal
        isOpen={showBuyInModal !== null}
        playerSessionId={showBuyInModal}
        onConfirm={handleAddBuyIn}
        onCancel={() => setShowBuyInModal(null)}
      />

      <EditBuyInModal
        isOpen={showEditBuyInModal !== null}
        data={showEditBuyInModal}
        currentAmount={currentBuyIn?.amount.toString() || ''}
        playerName={
          currentEditBuyInPs ? getPlayerName(currentEditBuyInPs.playerId) : ''
        }
        onUpdate={handleUpdateBuyIn}
        onDelete={handleDeleteBuyIn}
        onCancel={() => setShowEditBuyInModal(null)}
      />

      <CashOutModal
        isOpen={showCashOutModal !== null}
        playerSessionId={showCashOutModal}
        currentAmount={currentCashOutPs?.cashOut?.toString() || ''}
        playerName={
          currentCashOutPs ? getPlayerName(currentCashOutPs.playerId) : ''
        }
        isEditing={currentCashOutPs?.cashOut !== undefined}
        onConfirm={handleCashOut}
        onCancel={() => setShowCashOutModal(null)}
      />

      <RemovePlayerModal
        isOpen={showRemovePlayerModal !== null}
        playerSessionId={showRemovePlayerModal}
        playerName={
          currentRemovePs ? getPlayerName(currentRemovePs.playerId) : ''
        }
        onConfirm={handleRemovePlayer}
        onCancel={() => setShowRemovePlayerModal(null)}
      />

      <JoinGameModal
        isOpen={showJoinGameModal}
        remoteInProgressGame={remoteInProgressGame?.players || null}
        remoteGameDate={remoteInProgressGame?.date || null}
        onContinue={() => {
          if (remoteInProgressGame) {
            loadGameFromSpreadsheet(remoteInProgressGame);
            dismissJoinGame();
          }
        }}
        onDismiss={dismissJoinGame}
      />

      <EndSessionSummaryModal
        isOpen={showEndSessionModal}
        activeSession={activeSession}
        activePlayerSessions={activePlayerSessions}
        players={players}
        isSavingToSheet={isSavingToSheet}
        onConfirm={confirmEndSession}
        onClose={() => setShowEndSessionModal(false)}
      />

      {isSyncingInProgress && (
        <div className="fixed bottom-4 right-4 bg-nb-blue text-white px-3 py-2 rounded-lg shadow-lg text-sm">
          Syncing...
        </div>
      )}
    </div>
  );
};

export default PlayPage;
