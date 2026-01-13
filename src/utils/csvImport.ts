import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import type {
  Player,
  Session,
  PlayerSession,
  CSVImportResult,
  CSVImportError,
  CSVImportWarning,
  BuyIn
} from '../types';

interface ParsedCSVData {
  players: Player[];
  sessions: Session[];
  playerSessions: PlayerSession[];
  errors: CSVImportError[];
  warnings: CSVImportWarning[];
}

function parseDate(dateStr: string): Date | null {
  // Try MM/DD/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    // Validate the date parts
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      const fullYear = year < 100 ? 2000 + year : year;
      const date = new Date(fullYear, month - 1, day);
      // Verify the date is valid (e.g., not Feb 30)
      if (date.getMonth() === month - 1) {
        return date;
      }
    }
  }
  return null;
}

function parseMoney(value: string): number | null {
  if (!value || value.trim() === '') {
    return null;
  }

  // Remove dollar sign, commas, and whitespace
  let cleaned = value.trim().replace(/[$,\s]/g, '');

  // Handle negative values in parentheses like ($30.00)
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}


export function parseCSV(csvContent: string): ParsedCSVData {
  const errors: CSVImportError[] = [];
  const warnings: CSVImportWarning[] = [];
  const players: Player[] = [];
  const sessions: Session[] = [];
  const playerSessions: PlayerSession[] = [];

  const playerMap = new Map<string, Player>();
  const sessionTotals = new Map<string, number>();

  const parseResult = Papa.parse(csvContent, {
    header: false,
    skipEmptyLines: true,
  });

  if (parseResult.errors.length > 0) {
    parseResult.errors.forEach((err, index) => {
      errors.push({
        line: err.row !== undefined ? err.row + 1 : index + 1,
        message: err.message,
        data: err.row !== undefined ? String(parseResult.data[err.row]) : undefined,
      });
    });
  }

  const data = parseResult.data as string[][];

  if (data.length < 2) {
    errors.push({
      line: 1,
      message: 'CSV must have at least a header row and one data row',
    });
    return { players, sessions, playerSessions, errors, warnings };
  }

  const headerRow = data[0];

  // Find date columns (stop when we hit a non-date column)
  const dateColumns: { index: number; date: Date }[] = [];
  for (let i = 1; i < headerRow.length; i++) {
    const date = parseDate(headerRow[i]);
    if (date) {
      dateColumns.push({ index: i, date });
    } else {
      // Stop processing columns when we hit a non-date column
      break;
    }
  }

  if (dateColumns.length === 0) {
    errors.push({
      line: 1,
      message: 'No valid date columns found. Expected format: MM/DD/YYYY',
      data: headerRow.join(','),
    });
    return { players, sessions, playerSessions, errors, warnings };
  }

  // Create sessions for each date column
  const now = new Date().toISOString();
  dateColumns.forEach(({ date }) => {
    const session: Session = {
      id: uuidv4(),
      date: date.toISOString(),
      gameType: 'cash',
      isComplete: true,
      isImported: true,
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(session);
    sessionTotals.set(session.id, 0);
  });

  // Process player rows
  for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    const playerName = row[0]?.trim();

    if (!playerName) {
      continue; // Skip empty rows
    }

    // Get or create player
    let player = playerMap.get(playerName.toLowerCase());
    if (!player) {
      player = {
        id: uuidv4(),
        name: playerName,
        createdAt: now,
        updatedAt: now,
      };
      playerMap.set(playerName.toLowerCase(), player);
      players.push(player);
    } else {
      // Warn about duplicate player names
      warnings.push({
        sessionDate: 'N/A',
        message: `Duplicate player name found: "${playerName}"`,
      });
    }

    // Process each date column for this player
    dateColumns.forEach(({ index }, sessionIndex) => {
      const session = sessions[sessionIndex];
      const cellValue = row[index];
      const amount = parseMoney(cellValue);

      if (amount !== null) {
        // Create a buy-in record (we'll use net result since CSV only has final results)
        const buyIn: BuyIn = {
          id: uuidv4(),
          amount: 0, // We don't know actual buy-in from CSV
          timestamp: session.date,
        };

        const playerSession: PlayerSession = {
          id: uuidv4(),
          playerId: player!.id,
          sessionId: session.id,
          buyIns: [buyIn],
          cashOut: undefined,
          netResult: amount,
          timestamp: session.date,
        };
        playerSessions.push(playerSession);

        // Track session totals for zero-sum validation
        const currentTotal = sessionTotals.get(session.id) || 0;
        sessionTotals.set(session.id, currentTotal + amount);
      }
    });
  }

  // Validate zero-sum for each session
  sessions.forEach((session) => {
    const total = sessionTotals.get(session.id) || 0;
    if (Math.abs(total) > 0.01) {
      const formattedDate = new Date(session.date).toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
      });
      warnings.push({
        sessionDate: formattedDate,
        message: `Session does not sum to zero. Difference: $${total.toFixed(2)}`,
      });
    }
  });

  return { players, sessions, playerSessions, errors, warnings };
}

export function processCSVFile(file: File): Promise<ParsedCSVData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        reject(new Error('Failed to read file'));
        return;
      }

      try {
        const result = parseCSV(content);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };

    reader.readAsText(file);
  });
}

export function generateImportReport(result: ParsedCSVData): CSVImportResult {
  return {
    success: result.errors.length === 0,
    sessionsImported: result.sessions.length,
    playersImported: result.players.length,
    errors: result.errors,
    warnings: result.warnings,
  };
}

export function generateErrorLog(errors: CSVImportError[], warnings: CSVImportWarning[]): string {
  let log = 'CSV Import Error Log\n';
  log += '=====================\n\n';

  if (errors.length > 0) {
    log += 'ERRORS:\n';
    errors.forEach((error) => {
      log += `Line ${error.line}: ${error.message}\n`;
      if (error.data) {
        log += `  Data: ${error.data}\n`;
      }
    });
    log += '\n';
  }

  if (warnings.length > 0) {
    log += 'WARNINGS:\n';
    warnings.forEach((warning) => {
      log += `Session ${warning.sessionDate}: ${warning.message}\n`;
    });
  }

  if (errors.length === 0 && warnings.length === 0) {
    log += 'No errors or warnings.\n';
  }

  return log;
}
