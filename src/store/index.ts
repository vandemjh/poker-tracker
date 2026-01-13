import { configureStore } from '@reduxjs/toolkit';
import playersReducer from './playersSlice';
import sessionsReducer from './sessionsSlice';
import uiReducer from './uiSlice';

export const store = configureStore({
  reducer: {
    players: playersReducer,
    sessions: sessionsReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Re-export all actions
export * from './playersSlice';
export * from './sessionsSlice';
export * from './uiSlice';
