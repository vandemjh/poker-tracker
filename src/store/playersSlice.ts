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
      // Check if player with this name already exists (case-insensitive)
      const existingPlayer = state.players.find(
        p => p.name.toLowerCase() === action.payload.name.toLowerCase()
      );
      if (existingPlayer) {
        // Player already exists, don't add duplicate
        return;
      }

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
    mergePlayers: (state, action: PayloadAction<Player[]>) => {
      // Merge incoming players with existing ones, preserving existing IDs
      const existingByName = new Map(
        state.players.map(p => [p.name.toLowerCase(), p])
      );

      const mergedPlayers: Player[] = [];
      const seenNames = new Set<string>();

      // First, process incoming players
      for (const incoming of action.payload) {
        const nameLower = incoming.name.toLowerCase();
        const existing = existingByName.get(nameLower);

        if (existing) {
          // Keep existing player (preserves local ID)
          mergedPlayers.push(existing);
        } else {
          // Add new player from import
          mergedPlayers.push(incoming);
        }
        seenNames.add(nameLower);
      }

      // Keep any local players that weren't in the import
      for (const existing of state.players) {
        if (!seenNames.has(existing.name.toLowerCase())) {
          mergedPlayers.push(existing);
        }
      }

      state.players = mergedPlayers;
    },
  },
});

export const { setPlayers, addPlayer, updatePlayer, deletePlayer, importPlayers, mergePlayers } = playersSlice.actions;
export default playersSlice.reducer;
