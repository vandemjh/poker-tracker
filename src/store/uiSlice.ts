import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { DateRangeFilter, SyncStatus } from '../types';

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

type Theme = 'system' | 'light' | 'dark';

interface Settings {
  defaultBuyIn: number;
}

interface UIState {
  isLoading: boolean;
  isInitializing: boolean; // True while checking for stored data on app load
  error: string | null;
  showImportModal: boolean;
  dateFilter: DateRangeFilter;
  selectedPlayers: string[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  syncStatus: SyncStatus;
  isGoogleConnected: boolean;
  googleUser: GoogleUserInfo | null;
  importedSpreadsheetId: string | null; // Track the Google Sheet we imported from
  theme: Theme;
  settings: Settings;
}

const initialState: UIState = {
  isLoading: false,
  isInitializing: true, // Start as true, set to false once initialization is complete
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
  googleUser: null,
  importedSpreadsheetId: null,
  theme: 'system',
  settings: {
    defaultBuyIn: 30,
  },
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
      if (!action.payload) {
        state.googleUser = null;
      }
    },
    setGoogleUser: (state, action: PayloadAction<GoogleUserInfo | null>) => {
      state.googleUser = action.payload;
    },
    markUnsyncedChanges: (state) => {
      state.syncStatus.hasUnsyncedChanges = true;
    },
    clearUnsyncedChanges: (state) => {
      state.syncStatus.hasUnsyncedChanges = false;
    },
    setImportedSpreadsheetId: (state, action: PayloadAction<string | null>) => {
      state.importedSpreadsheetId = action.payload;
    },
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
    },
    setInitializing: (state, action: PayloadAction<boolean>) => {
      state.isInitializing = action.payload;
    },
    setDefaultBuyIn: (state, action: PayloadAction<number>) => {
      state.settings.defaultBuyIn = action.payload;
    },
    setSettings: (state, action: PayloadAction<Partial<Settings>>) => {
      state.settings = { ...state.settings, ...action.payload };
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
  setGoogleUser,
  markUnsyncedChanges,
  clearUnsyncedChanges,
  setImportedSpreadsheetId,
  setTheme,
  setInitializing,
  setDefaultBuyIn,
  setSettings,
} = uiSlice.actions;
export default uiSlice.reducer;
