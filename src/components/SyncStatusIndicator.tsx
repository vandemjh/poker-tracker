import React from 'react';
import { useAppSelector } from '../hooks/useAppSelector';

const SyncStatusIndicator: React.FC = () => {
  const { syncStatus, isGoogleConnected, importedSpreadsheetId } = useAppSelector(state => state.ui);

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
