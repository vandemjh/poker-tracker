import React from 'react';
import { useAppSelector } from '../hooks/useAppSelector';

const SyncStatusIndicator: React.FC = () => {
  const { syncStatus, isGoogleConnected } = useAppSelector(state => state.ui);

  if (!isGoogleConnected) {
    return (
      <span className="badge-nb bg-gray-200 text-gray-600 text-xs">
        Offline
      </span>
    );
  }

  if (syncStatus.isSyncing) {
    return (
      <span className="badge-nb bg-nb-yellow text-xs animate-pulse">
        Syncing...
      </span>
    );
  }

  if (syncStatus.error) {
    return (
      <span className="badge-nb bg-nb-red text-nb-white text-xs" title={syncStatus.error}>
        Sync Error
      </span>
    );
  }

  if (syncStatus.hasUnsyncedChanges) {
    return (
      <span className="badge-nb bg-nb-orange text-xs">
        Unsaved
      </span>
    );
  }

  return (
    <span className="badge-nb bg-nb-green text-xs">
      Synced
    </span>
  );
};

export default SyncStatusIndicator;
