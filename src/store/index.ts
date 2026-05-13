import { configureStore } from '@reduxjs/toolkit';
import playersReducer from './playersSlice';
import sessionsReducer from './sessionsSlice';
import uiReducer from './uiSlice';
import { saveLocalData } from '../services/localDataService';

export const store = configureStore({
  reducer: {
    players: playersReducer,
    sessions: sessionsReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Auto-persist data to localStorage on every state change
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
store.subscribe(() => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const state = store.getState();
    saveLocalData(
      state.players.players,
      state.sessions.sessions,
      state.sessions.playerSessions,
    );
  }, 500);
});

// Re-export all actions
export * from './playersSlice';
export * from './sessionsSlice';
export * from './uiSlice';
