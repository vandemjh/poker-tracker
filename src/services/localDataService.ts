import type { Player, Session, PlayerSession } from '../types';

const STORAGE_KEY = 'poker-tracker-local-data';

interface LocalAppData {
  players: Player[];
  sessions: Session[];
  playerSessions: PlayerSession[];
  lastModified: string;
}

export function saveLocalData(
  players: Player[],
  sessions: Session[],
  playerSessions: PlayerSession[],
): void {
  const data: LocalAppData = {
    players,
    sessions,
    playerSessions,
    lastModified: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save local data:', e);
  }
}

export function loadLocalData(): LocalAppData | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as LocalAppData;
    }
  } catch (e) {
    console.error('Failed to load local data:', e);
  }
  return null;
}

export function getLocalDataLastModified(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as LocalAppData;
      return data.lastModified;
    }
  } catch {
    // ignore
  }
  return null;
}
