// Core Entity Types

export interface Player {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  name?: string;
  date: string;
  gameType: 'cash' | 'tournament';
  stakes?: string;
  location?: string;
  isComplete: boolean;
  isImported: boolean; // True if imported from CSV (read-only)
  createdAt: string;
  updatedAt: string;
}

export interface BuyIn {
  id: string;
  amount: number;
  timestamp: string;
}

export interface PlayerSession {
  id: string;
  playerId: string;
  sessionId: string;
  buyIns: BuyIn[];
  cashOut?: number;
  netResult: number;
  timestamp: string;
}

// Calculated Statistics Types

export interface BalanceHistoryEntry {
  date: string;
  balance: number;
  sessionId: string;
}

export interface PlayerStatistics {
  playerId: string;
  playerName: string;
  totalProfit: number;
  sessionCount: number;
  winRate: number;
  avgWinLoss: number;
  bestSession: number;
  worstSession: number;
  variance: number;
  standardDeviation: number;
  roi: number;
  totalBuyIns: number;
  balanceHistory: BalanceHistoryEntry[];
}

// App Data Structure (stored in Google Drive)

export interface AppData {
  version: string;
  players: Player[];
  sessions: Session[];
  playerSessions: PlayerSession[];
  lastModified: string;
}

// CSV Import Types

export interface CSVImportResult {
  success: boolean;
  sessionsImported: number;
  playersImported: number;
  errors: CSVImportError[];
  warnings: CSVImportWarning[];
}

export interface CSVImportError {
  line: number;
  message: string;
  data?: string;
}

export interface CSVImportWarning {
  sessionDate: string;
  message: string;
}

// UI State Types

export interface DateRangeFilter {
  startDate: string | null;
  endDate: string | null;
}

export interface UIState {
  isLoading: boolean;
  error: string | null;
  showImportModal: boolean;
  dateFilter: DateRangeFilter;
  selectedPlayers: string[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
}

// Google Drive Types

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  hasUnsyncedChanges: boolean;
  error: string | null;
}

// Active Session Types (for Play page)

export interface ActiveSession {
  session: Session;
  playerSessions: PlayerSession[];
}

// Form Types

export interface CreateSessionForm {
  name?: string;
  date: string;
  gameType: 'cash' | 'tournament';
  stakes?: string;
  location?: string;
}

export interface AddPlayerToSessionForm {
  playerId: string;
  newPlayerName?: string;
  buyInAmount: number;
}

export interface AddBuyInForm {
  playerSessionId: string;
  amount: number;
}

export interface CashOutForm {
  playerSessionId: string;
  amount: number;
}
