import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Player } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface PlayersState {
  players: Player[];
}

const initialState: PlayersState = {
  players: [],
};

const playersSlice = createSlice({
  name: 'players',
  initialState,
  reducers: {
    setPlayers: (state, action: PayloadAction<Player[]>) => {
      state.players = action.payload;
    },
    addPlayer: (state, action: PayloadAction<{ name: string }>) => {
      const now = new Date().toISOString();
      const newPlayer: Player = {
        id: uuidv4(),
        name: action.payload.name,
        createdAt: now,
        updatedAt: now,
      };
      state.players.push(newPlayer);
    },
    updatePlayer: (state, action: PayloadAction<{ id: string; name: string }>) => {
      const player = state.players.find(p => p.id === action.payload.id);
      if (player) {
        player.name = action.payload.name;
        player.updatedAt = new Date().toISOString();
      }
    },
    deletePlayer: (state, action: PayloadAction<string>) => {
      state.players = state.players.filter(p => p.id !== action.payload);
    },
    importPlayers: (state, action: PayloadAction<Player[]>) => {
      // Add players that don't already exist (by name)
      const existingNames = new Set(state.players.map(p => p.name.toLowerCase()));
      const newPlayers = action.payload.filter(
        p => !existingNames.has(p.name.toLowerCase())
      );
      state.players.push(...newPlayers);
    },
  },
});

export const { setPlayers, addPlayer, updatePlayer, deletePlayer, importPlayers } = playersSlice.actions;
export default playersSlice.reducer;
