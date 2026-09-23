import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Miscount } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface MiscountsState {
  miscounts: Miscount[];
}

const initialState: MiscountsState = {
  miscounts: [],
};

const miscountsSlice = createSlice({
  name: 'miscounts',
  initialState,
  reducers: {
    addMiscount: (
      state,
      action: PayloadAction<{
        playerId: string | null;
        playerName: string;
        sessionId: string | null;
        amount: number;
        source: 'cashout-edit' | 'manual';
      }>,
    ) => {
      const miscount: Miscount = {
        id: uuidv4(),
        playerId: action.payload.playerId,
        playerName: action.payload.playerName,
        sessionId: action.payload.sessionId,
        amount: Math.abs(action.payload.amount),
        source: action.payload.source,
        timestamp: new Date().toISOString(),
      };
      state.miscounts.push(miscount);
    },
    setMiscounts: (state, action: PayloadAction<Miscount[]>) => {
      state.miscounts = action.payload;
    },
    setPlayerMiscount: (
      state,
      action: PayloadAction<{
        playerId: string | null;
        playerName: string;
        sessionId: string;
        amount: number;
      }>,
    ) => {
      const { playerId, playerName, sessionId, amount } = action.payload;
      const key = playerId || playerName.toLowerCase();
      state.miscounts = state.miscounts.filter(
        (m) =>
          m.sessionId !== sessionId ||
          (m.playerId || m.playerName.toLowerCase()) !== key,
      );
      state.miscounts.push({
        id: uuidv4(),
        playerId,
        playerName,
        sessionId,
        amount: Math.abs(amount),
        source: 'manual',
        timestamp: new Date().toISOString(),
      });
    },
    clearMiscounts: (state) => {
      state.miscounts = [];
    },
    reconcileSessionMiscounts: (
      state,
      action: PayloadAction<{
        sessionId: string;
        players: { playerId: string | null; playerName: string; amount: number }[];
      }>,
    ) => {
      const { sessionId, players } = action.payload;

      // Reconcile miscounts for this session against the synced per-player
      // values from the spreadsheet. Each player's miscounts collapse to a
      // single record whose amount is the total value miscounted (keyed by
      // playerId when known, otherwise by lowercased player name).
      const keep = state.miscounts.filter((m) => m.sessionId !== sessionId);

      for (const p of players) {
        const amount = Math.abs(p.amount || 0);
        if (amount <= 0) continue;
        keep.push({
          id: uuidv4(),
          playerId: p.playerId ?? null,
          playerName: p.playerName,
          sessionId,
          amount,
          source: 'manual' as const,
          timestamp: new Date().toISOString(),
        });
      }

      state.miscounts = keep;
    },
  },
});

export const {
  addMiscount,
  setMiscounts,
  setPlayerMiscount,
  clearMiscounts,
  reconcileSessionMiscounts,
} = miscountsSlice.actions;
export default miscountsSlice.reducer;