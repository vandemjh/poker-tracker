import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Session, PlayerSession, BuyIn } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface SessionsState {
  sessions: Session[];
  playerSessions: PlayerSession[];
  activeSessionId: string | null;
}

const initialState: SessionsState = {
  sessions: [],
  playerSessions: [],
  activeSessionId: null,
};

const sessionsSlice = createSlice({
  name: 'sessions',
  initialState,
  reducers: {
    setSessions: (state, action: PayloadAction<Session[]>) => {
      state.sessions = action.payload;
    },
    setPlayerSessions: (state, action: PayloadAction<PlayerSession[]>) => {
      state.playerSessions = action.payload;
    },
    createSession: (state, action: PayloadAction<{
      name?: string;
      date: string;
      gameType: 'cash' | 'tournament';
      stakes?: string;
      location?: string;
    }>) => {
      const now = new Date().toISOString();
      const newSession: Session = {
        id: uuidv4(),
        name: action.payload.name,
        date: action.payload.date,
        gameType: action.payload.gameType,
        stakes: action.payload.stakes,
        location: action.payload.location,
        isComplete: false,
        isImported: false,
        createdAt: now,
        updatedAt: now,
      };
      state.sessions.push(newSession);
      state.activeSessionId = newSession.id;
    },
    setActiveSession: (state, action: PayloadAction<string | null>) => {
      state.activeSessionId = action.payload;
    },
    addPlayerToSession: (state, action: PayloadAction<{
      sessionId: string;
      playerId: string;
      buyInAmount: number;
    }>) => {
      const now = new Date().toISOString();
      const buyIn: BuyIn = {
        id: uuidv4(),
        amount: action.payload.buyInAmount,
        timestamp: now,
      };
      const playerSession: PlayerSession = {
        id: uuidv4(),
        playerId: action.payload.playerId,
        sessionId: action.payload.sessionId,
        buyIns: [buyIn],
        netResult: 0,
        timestamp: now,
      };
      state.playerSessions.push(playerSession);
    },
    addBuyIn: (state, action: PayloadAction<{
      playerSessionId: string;
      amount: number;
    }>) => {
      const playerSession = state.playerSessions.find(
        ps => ps.id === action.payload.playerSessionId
      );
      if (playerSession) {
        const buyIn: BuyIn = {
          id: uuidv4(),
          amount: action.payload.amount,
          timestamp: new Date().toISOString(),
        };
        playerSession.buyIns.push(buyIn);
      }
    },
    setCashOut: (state, action: PayloadAction<{
      playerSessionId: string;
      amount: number;
    }>) => {
      const playerSession = state.playerSessions.find(
        ps => ps.id === action.payload.playerSessionId
      );
      if (playerSession) {
        playerSession.cashOut = action.payload.amount;
        const totalBuyIns = playerSession.buyIns.reduce((sum, b) => sum + b.amount, 0);
        playerSession.netResult = action.payload.amount - totalBuyIns;
      }
    },
    completeSession: (state, action: PayloadAction<string>) => {
      const session = state.sessions.find(s => s.id === action.payload);
      if (session) {
        session.isComplete = true;
        session.updatedAt = new Date().toISOString();
      }
      if (state.activeSessionId === action.payload) {
        state.activeSessionId = null;
      }
    },
    resumeCompletedSession: (state, action: PayloadAction<string>) => {
      const session = state.sessions.find(s => s.id === action.payload);
      if (session && session.isComplete && !session.isImported) {
        session.isComplete = false;
        session.updatedAt = new Date().toISOString();
        state.activeSessionId = session.id;

        // Reset all player cash-outs for this session
        state.playerSessions.forEach(ps => {
          if (ps.sessionId === session.id) {
            ps.cashOut = undefined;
            ps.netResult = 0;
          }
        });
      }
    },
    deleteSession: (state, action: PayloadAction<string>) => {
      const sessionId = action.payload;
      const session = state.sessions.find(s => s.id === sessionId);

      // Only allow deleting non-imported sessions
      if (session && !session.isImported) {
        state.sessions = state.sessions.filter(s => s.id !== sessionId);
        state.playerSessions = state.playerSessions.filter(
          ps => ps.sessionId !== sessionId
        );
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
      }
    },
    importSessions: (state, action: PayloadAction<{
      sessions: Session[];
      playerSessions: PlayerSession[];
    }>) => {
      // Add imported sessions
      state.sessions.push(...action.payload.sessions);
      state.playerSessions.push(...action.payload.playerSessions);
    },
    replaceImportedSessions: (state, action: PayloadAction<{
      sessions: Session[];
      playerSessions: PlayerSession[];
    }>) => {
      // Remove all imported sessions and their player sessions
      const importedSessionIds = new Set(
        state.sessions.filter(s => s.isImported).map(s => s.id)
      );

      // Keep only non-imported sessions
      state.sessions = state.sessions.filter(s => !s.isImported);

      // Keep only player sessions from non-imported sessions
      state.playerSessions = state.playerSessions.filter(
        ps => !importedSessionIds.has(ps.sessionId)
      );

      // Add new imported sessions
      state.sessions.push(...action.payload.sessions);
      state.playerSessions.push(...action.payload.playerSessions);
    },
    removePlayerFromSession: (state, action: PayloadAction<string>) => {
      const playerSession = state.playerSessions.find(ps => ps.id === action.payload);
      if (playerSession) {
        const session = state.sessions.find(s => s.id === playerSession.sessionId);
        // Only allow removing from non-imported, incomplete sessions
        if (session && !session.isImported && !session.isComplete) {
          state.playerSessions = state.playerSessions.filter(
            ps => ps.id !== action.payload
          );
        }
      }
    },
  },
});

export const {
  setSessions,
  setPlayerSessions,
  createSession,
  setActiveSession,
  addPlayerToSession,
  addBuyIn,
  setCashOut,
  completeSession,
  resumeCompletedSession,
  deleteSession,
  importSessions,
  replaceImportedSessions,
  removePlayerFromSession,
} = sessionsSlice.actions;
export default sessionsSlice.reducer;
