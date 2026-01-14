import React, { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import {
  mergePlayers,
  replaceImportedSessions,
  clearUnsyncedChanges,
  setSyncStatus,
} from '../store';
import { googleDriveService } from '../services/googleDrive';
import { parseSpreadsheetData, remapPlayerIds } from '../utils/csvImport';

const SyncStatusIndicator: React.FC = () => {
  const dispatch = useAppDispatch();
  const { players } = useAppSelector(state => state.players);
  const { syncStatus, isGoogleConnected, importedSpreadsheetId } = useAppSelector(state => state.ui);
  const { activeSessionId } = useAppSelector(state => state.sessions);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);
  const playersRef = useRef(players);

  // Keep playersRef up to date
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Auto-sync when there are unsynced changes (and no active session)
  useEffect(() => {
    // Don't auto-sync if:
    // - Not connected to Google
    // - No spreadsheet linked
    // - Currently syncing
    // - No unsynced changes
    // - There's an active session in progress (don't interrupt gameplay)
    if (
      !isGoogleConnected ||
      !importedSpreadsheetId ||
      syncStatus.isSyncing ||
      !syncStatus.hasUnsyncedChanges ||
      activeSessionId ||
      isSyncingRef.current
    ) {
      return;
    }

    // Debounce the sync to avoid rapid repeated syncs
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        dispatch(setSyncStatus({
          ...syncStatus,
          isSyncing: true,
        }));

        const spreadsheetData = await googleDriveService.getSpreadsheetData(importedSpreadsheetId);
        const parsedResult = parseSpreadsheetData(spreadsheetData);

        // Remap player IDs to match existing players
        const result = remapPlayerIds(parsedResult, playersRef.current);

        dispatch(mergePlayers(result.players));
        dispatch(replaceImportedSessions({
          sessions: result.sessions,
          playerSessions: result.playerSessions,
        }));

        dispatch(clearUnsyncedChanges());
        dispatch(setSyncStatus({
          lastSyncTime: new Date().toISOString(),
          hasUnsyncedChanges: false,
          isSyncing: false,
          error: null,
        }));
      } catch (error) {
        console.error('Auto-sync error:', error);
        dispatch(setSyncStatus({
          ...syncStatus,
          isSyncing: false,
          error: `Auto-sync failed: ${error}`,
        }));
      } finally {
        isSyncingRef.current = false;
      }
    }, 2000); // 2 second debounce

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [dispatch, isGoogleConnected, importedSpreadsheetId, syncStatus.hasUnsyncedChanges, activeSessionId]);

  // Not connected to Google
  if (!isGoogleConnected) {
    return (
      <span className="badge-nb bg-theme-card text-theme-secondary text-xs">
        Offline
      </span>
    );
  }

  // Connected but no sheet linked
  if (!importedSpreadsheetId) {
    return (
      <span className="badge-nb bg-nb-orange text-nb-black text-xs">
        No Sheet
      </span>
    );
  }

  // Syncing in progress
  if (syncStatus.isSyncing) {
    return (
      <span className="badge-nb bg-nb-yellow text-nb-black text-xs animate-pulse">
        Syncing...
      </span>
    );
  }

  // Sync error
  if (syncStatus.error) {
    return (
      <span className="badge-nb bg-nb-red text-nb-white text-xs" title={syncStatus.error}>
        Sync Error
      </span>
    );
  }

  // Has unsynced changes
  if (syncStatus.hasUnsyncedChanges) {
    return (
      <span className="badge-nb bg-nb-orange text-nb-black text-xs">
        Unsaved
      </span>
    );
  }

  // All synced
  return (
    <span className="badge-nb bg-nb-green text-nb-black text-xs">
      Synced
    </span>
  );
};

export default SyncStatusIndicator;
