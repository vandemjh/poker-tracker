import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DateRangeFilter, SyncStatus } from '../types';

interface UIState {
  isLoading: boolean;
  error: string | null;
  showImportModal: boolean;
  dateFilter: DateRangeFilter;
  selectedPlayers: string[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  syncStatus: SyncStatus;
  isGoogleConnected: boolean;
}

const initialState: UIState = {
  isLoading: false,
  error: null,
  showImportModal: false,
  dateFilter: {
    startDate: null,
    endDate: null,
  },
  selectedPlayers: [],
  sortColumn: 'totalProfit',
  sortDirection: 'desc',
  syncStatus: {
    isSyncing: false,
    lastSyncTime: null,
    hasUnsyncedChanges: false,
    error: null,
  },
  isGoogleConnected: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    toggleImportModal: (state) => {
      state.showImportModal = !state.showImportModal;
    },
    setShowImportModal: (state, action: PayloadAction<boolean>) => {
      state.showImportModal = action.payload;
    },
    setDateFilter: (state, action: PayloadAction<DateRangeFilter>) => {
      state.dateFilter = action.payload;
    },
    clearDateFilter: (state) => {
      state.dateFilter = { startDate: null, endDate: null };
    },
    setSelectedPlayers: (state, action: PayloadAction<string[]>) => {
      state.selectedPlayers = action.payload;
    },
    togglePlayerSelection: (state, action: PayloadAction<string>) => {
      const playerId = action.payload;
      const index = state.selectedPlayers.indexOf(playerId);
      if (index === -1) {
        state.selectedPlayers.push(playerId);
      } else {
        state.selectedPlayers.splice(index, 1);
      }
    },
    selectAllPlayers: (state, action: PayloadAction<string[]>) => {
      state.selectedPlayers = action.payload;
    },
    clearPlayerSelection: (state) => {
      state.selectedPlayers = [];
    },
    setSortColumn: (state, action: PayloadAction<string>) => {
      if (state.sortColumn === action.payload) {
        // Toggle direction if clicking same column
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortColumn = action.payload;
        state.sortDirection = 'desc';
      }
    },
    setSyncStatus: (state, action: PayloadAction<Partial<SyncStatus>>) => {
      state.syncStatus = { ...state.syncStatus, ...action.payload };
    },
    setGoogleConnected: (state, action: PayloadAction<boolean>) => {
      state.isGoogleConnected = action.payload;
    },
    markUnsyncedChanges: (state) => {
      state.syncStatus.hasUnsyncedChanges = true;
    },
    clearUnsyncedChanges: (state) => {
      state.syncStatus.hasUnsyncedChanges = false;
    },
  },
});

export const {
  setLoading,
  setError,
  clearError,
  toggleImportModal,
  setShowImportModal,
  setDateFilter,
  clearDateFilter,
  setSelectedPlayers,
  togglePlayerSelection,
  selectAllPlayers,
  clearPlayerSelection,
  setSortColumn,
  setSyncStatus,
  setGoogleConnected,
  markUnsyncedChanges,
  clearUnsyncedChanges,
} = uiSlice.actions;
export default uiSlice.reducer;
