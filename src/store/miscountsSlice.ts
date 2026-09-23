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
    clearMiscounts: (state) => {
      state.miscounts = [];
    },
    reconcileSessionMiscounts: (
      state,
      action: PayloadAction<{
        sessionId: string;
        players: { playerId: string | null; playerName: string; count: number }[];
      }>,
    ) => {
      const { sessionId, players } = action.payload;

      // Track the target count per player for this session (keyed by
      // playerId when known, otherwise by lowercased player name)
      const target = new Map<string, number>();
      for (const p of players) {
        target.set(p.playerId || p.playerName.toLowerCase(), p.count);
      }

      // Group existing records for this session by the same player key
      const byKey = new Map<string, Miscount[]>();
      for (const m of state.miscounts) {
        if (m.sessionId !== sessionId) continue;
        const key = m.playerId || m.playerName.toLowerCase();
        const list = byKey.get(key) || [];
        list.push(m);
        byKey.set(key, list);
      }

      // Keep only the first `count` records per player for this session, and
      // drop records for players that should no longer have any miscounts
      state.miscounts = state.miscounts.filter((m) => {
        if (m.sessionId !== sessionId) return true;
        const key = m.playerId || m.playerName.toLowerCase();
        const list = byKey.get(key) || [];
        const desired = target.get(key);
        if (desired === undefined || desired <= 0) return false;
        return list.indexOf(m) < desired;
      });

      // Add synthetic records to match the target counts
      for (const p of players) {
        const key = p.playerId || p.playerName.toLowerCase();
        if (p.count <= 0) continue;
        const existing = state.miscounts.filter(
          (m) =>
            m.sessionId === sessionId &&
            (m.playerId || m.playerName.toLowerCase()) === key,
        ).length;
        const toAdd = p.count - existing;
        for (let i = 0; i < toAdd; i++) {
          state.miscounts.push({
            id: uuidv4(),
            playerId: p.playerId,
            playerName: p.playerName,
            sessionId,
            amount: 0,
            source: 'manual',
            timestamp: new Date().toISOString(),
          });
        }
      }
    },
  },
});

export const {
  addMiscount,
  setMiscounts,
  clearMiscounts,
  reconcileSessionMiscounts,
} = miscountsSlice.actions;
export default miscountsSlice.reducer;