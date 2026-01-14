import type { AppData } from '../types';

const APP_DATA_FILE_NAME = 'poker-tracker-data.json';
const STORAGE_KEY_TOKEN = 'poker-tracker-google-token';
const STORAGE_KEY_USER = 'poker-tracker-google-user';
const STORAGE_KEY_SPREADSHEET_ID = 'poker-tracker-spreadsheet-id';

const INITIAL_APP_DATA: AppData = {
  version: '1.0',
  players: [],
  sessions: [],
  playerSessions: [],
  lastModified: new Date().toISOString(),
};

// Google API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets', // Full access to read/write sheets
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

class GoogleDriveService {
  private accessToken: string | null = null;
  private fileId: string | null = null;

  setAccessToken(token: string, persist: boolean = true) {
    this.accessToken = token;
    if (persist) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
    }
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearAccessToken() {
    this.accessToken = null;
    this.fileId = null;
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_SPREADSHEET_ID);
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  // Get stored token from localStorage
  getStoredToken(): string | null {
    return localStorage.getItem(STORAGE_KEY_TOKEN);
  }

  // Get stored user from localStorage
  getStoredUser(): GoogleUserInfo | null {
    const stored = localStorage.getItem(STORAGE_KEY_USER);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return null;
      }
    }
    return null;
  }

  // Save user info to localStorage
  saveUserInfo(user: GoogleUserInfo) {
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  }

  // Get stored spreadsheet ID
  getStoredSpreadsheetId(): string | null {
    return localStorage.getItem(STORAGE_KEY_SPREADSHEET_ID);
  }

  // Save spreadsheet ID to localStorage
  saveSpreadsheetId(id: string) {
    localStorage.setItem(STORAGE_KEY_SPREADSHEET_ID, id);
  }

  // Fetch user info from Google
  async fetchUserInfo(): Promise<GoogleUserInfo> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    const data = await response.json();
    const userInfo: GoogleUserInfo = {
      id: data.id,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };

    this.saveUserInfo(userInfo);
    return userInfo;
  }

  // Validate stored token is still valid
  async validateToken(): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${this.accessToken}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error: ${response.status} - ${errorText}`);
    }

    return response;
  }

  async findAppDataFile(): Promise<string | null> {
    const response = await this.makeRequest(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${APP_DATA_FILE_NAME}'&fields=files(id,name,modifiedTime)`
    );

    const data = await response.json();

    if (data.files && data.files.length > 0) {
      this.fileId = data.files[0].id;
      return this.fileId;
    }

    return null;
  }

  async loadAppData(): Promise<AppData> {
    try {
      // First, try to find existing file
      let fileId = await this.findAppDataFile();

      if (!fileId) {
        // No file exists, return initial data
        return INITIAL_APP_DATA;
      }

      // Download file content
      const response = await this.makeRequest(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      );

      const data: AppData = await response.json();
      return data;
    } catch (error) {
      console.error('Error loading app data from Google Drive:', error);
      throw error;
    }
  }

  async saveAppData(data: AppData): Promise<void> {
    try {
      const updatedData: AppData = {
        ...data,
        lastModified: new Date().toISOString(),
      };

      const fileContent = JSON.stringify(updatedData, null, 2);
      const blob = new Blob([fileContent], { type: 'application/json' });

      if (this.fileId) {
        // Update existing file
        await this.makeRequest(
          `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media`,
          {
            method: 'PATCH',
            body: blob,
          }
        );
      } else {
        // Create new file
        const metadata = {
          name: APP_DATA_FILE_NAME,
          parents: ['appDataFolder'],
        };

        const form = new FormData();
        form.append(
          'metadata',
          new Blob([JSON.stringify(metadata)], { type: 'application/json' })
        );
        form.append('file', blob);

        const response = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
            },
            body: form,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to create file: ${response.status}`);
        }

        const result = await response.json();
        this.fileId = result.id;
      }
    } catch (error) {
      console.error('Error saving app data to Google Drive:', error);
      throw error;
    }
  }

  async deleteAppDataFile(): Promise<void> {
    if (!this.fileId) {
      await this.findAppDataFile();
    }

    if (this.fileId) {
      await this.makeRequest(
        `https://www.googleapis.com/drive/v3/files/${this.fileId}`,
        {
          method: 'DELETE',
        }
      );
      this.fileId = null;
    }
  }

  // Fetch spreadsheet data from Google Sheets
  async getSpreadsheetData(spreadsheetId: string): Promise<string[][]> {
    try {
      // First, get spreadsheet metadata to find the first sheet name
      const metaResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
      );
      const metadata = await metaResponse.json();

      if (!metadata.sheets || metadata.sheets.length === 0) {
        throw new Error('Spreadsheet has no sheets');
      }

      const firstSheetName = metadata.sheets[0].properties.title;

      // Fetch all data from the first sheet
      const response = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstSheetName)}?valueRenderOption=UNFORMATTED_VALUE`
      );

      const data = await response.json();
      return data.values || [];
    } catch (error) {
      console.error('Error fetching spreadsheet data:', error);
      throw error;
    }
  }

  // Append or update a session column in the spreadsheet
  // If a column with the same date exists, it updates that column
  // Otherwise, it appends a new column to the right
  async appendSessionColumn(
    spreadsheetId: string,
    sessionDate: Date,
    playerResults: { playerName: string; netResult: number }[]
  ): Promise<void> {
    try {
      // Get spreadsheet metadata
      const metaResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
      );
      const metadata = await metaResponse.json();

      if (!metadata.sheets || metadata.sheets.length === 0) {
        throw new Error('Spreadsheet has no sheets');
      }

      const firstSheetName = metadata.sheets[0].properties.title;

      // Get existing data to find the rightmost column and player rows
      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstSheetName)}?valueRenderOption=UNFORMATTED_VALUE`
      );
      const existingData = await dataResponse.json();
      const rows: (string | number)[][] = existingData.values || [];

      if (rows.length === 0) {
        throw new Error('Spreadsheet is empty');
      }

      // Format the date string for comparison
      const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}/${sessionDate.getFullYear()}`;

      // Check if a column with this date already exists
      const headerRow = rows[0] || [];
      let existingColIndex = -1;

      for (let i = 1; i < headerRow.length; i++) {
        const headerValue = headerRow[i];
        let headerDateStr = '';

        // Handle both string dates and serial number dates
        if (typeof headerValue === 'number') {
          // Convert serial date to date string
          const serialDate = this.serialDateToDate(headerValue);
          if (serialDate) {
            headerDateStr = `${serialDate.getMonth() + 1}/${serialDate.getDate()}/${serialDate.getFullYear()}`;
          }
        } else if (typeof headerValue === 'string') {
          headerDateStr = headerValue.trim();
        }

        if (headerDateStr === dateStr) {
          existingColIndex = i;
          break;
        }
      }

      // Find the rightmost column with data (for appending new column)
      let maxCol = 0;
      for (const row of rows) {
        if (row.length > maxCol) {
          maxCol = row.length;
        }
      }

      // Use existing column if found, otherwise append to the right
      const targetColIndex = existingColIndex !== -1 ? existingColIndex : maxCol;

      // Create a map of player names to row indices (case-insensitive)
      const playerRowMap = new Map<string, number>();
      for (let i = 1; i < rows.length; i++) {
        const playerName = String(rows[i]?.[0] ?? '').trim().toLowerCase();
        if (playerName) {
          playerRowMap.set(playerName, i);
        }
      }

      // Create column values array with the date in the header row
      const columnValues: (string | number)[][] = [[dateStr]];

      // Fill in player results
      for (let i = 1; i < rows.length; i++) {
        const playerName = String(rows[i]?.[0] ?? '').trim().toLowerCase();
        const result = playerResults.find(
          pr => pr.playerName.toLowerCase() === playerName
        );

        if (result) {
          columnValues.push([result.netResult]);
        } else {
          // Player didn't participate in this session
          columnValues.push(['']);
        }
      }

      // Check if any new players need to be added
      const existingPlayers = new Set(playerRowMap.keys());
      const newPlayers = playerResults.filter(
        pr => !existingPlayers.has(pr.playerName.toLowerCase())
      );

      // Add new players to the end
      for (const newPlayer of newPlayers) {
        columnValues.push([newPlayer.netResult]);
      }

      // Convert column index to letter (A, B, C, ... AA, AB, etc.)
      const colLetter = this.columnIndexToLetter(targetColIndex);
      const range = `${firstSheetName}!${colLetter}1:${colLetter}${columnValues.length}`;

      // Write the column (either new or updating existing)
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range,
            majorDimension: 'COLUMNS',
            values: [columnValues.map(v => v[0])],
          }),
        }
      );

      // If there are new players, we need to add their names in column A
      if (newPlayers.length > 0) {
        const startRow = rows.length + 1;
        const namesRange = `${firstSheetName}!A${startRow}:A${startRow + newPlayers.length - 1}`;

        await this.makeRequest(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(namesRange)}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              range: namesRange,
              majorDimension: 'ROWS',
              values: newPlayers.map(p => [p.playerName]),
            }),
          }
        );
      }

      console.log(existingColIndex !== -1
        ? 'Successfully updated existing session in spreadsheet'
        : 'Successfully appended new session to spreadsheet');
    } catch (error) {
      console.error('Error saving session to spreadsheet:', error);
      throw error;
    }
  }

  // Helper to convert serial date to Date object
  private serialDateToDate(serial: number): Date | null {
    if (serial < 1 || serial > 100000) {
      return null;
    }
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const date = new Date((serial - 25569) * millisecondsPerDay);
    const year = date.getFullYear();
    if (year >= 1990 && year <= 2100) {
      return date;
    }
    return null;
  }

  // Helper to convert column index (0-based) to column letter
  private columnIndexToLetter(index: number): string {
    let letter = '';
    let temp = index;

    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }

    return letter;
  }

  // Update or create an "In Progress" session column
  async updateInProgressSession(
    spreadsheetId: string,
    sessionDate: Date,
    playerBuyIns: { playerName: string; totalBuyIn: number }[],
    isComplete: boolean = false
  ): Promise<void> {
    try {
      // Get spreadsheet metadata
      const metaResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
      );
      const metadata = await metaResponse.json();

      if (!metadata.sheets || metadata.sheets.length === 0) {
        throw new Error('Spreadsheet has no sheets');
      }

      const firstSheetName = metadata.sheets[0].properties.title;

      // Get existing data
      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(firstSheetName)}?valueRenderOption=UNFORMATTED_VALUE`
      );
      const existingData = await dataResponse.json();
      const rows: (string | number)[][] = existingData.values || [];

      if (rows.length === 0) {
        throw new Error('Spreadsheet is empty');
      }

      // Format dates
      const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}/${sessionDate.getFullYear()}`;
      const inProgressHeader = `${dateStr} In Progress`;
      const finalHeader = dateStr;

      // Find existing column for this session (either "In Progress" or final)
      let existingColIndex = -1;
      const headerRow = rows[0] || [];

      for (let i = 0; i < headerRow.length; i++) {
        const header = String(headerRow[i] || '').trim();
        if (header === inProgressHeader || header === finalHeader) {
          existingColIndex = i;
          break;
        }
      }

      // If no existing column, find the rightmost column
      let targetColIndex = existingColIndex;
      if (targetColIndex === -1) {
        let maxCol = 0;
        for (const row of rows) {
          if (row.length > maxCol) {
            maxCol = row.length;
          }
        }
        targetColIndex = maxCol;
      }

      // Create a map of player names to row indices (case-insensitive)
      const playerRowMap = new Map<string, number>();
      for (let i = 1; i < rows.length; i++) {
        const playerName = String(rows[i]?.[0] ?? '').trim().toLowerCase();
        if (playerName) {
          playerRowMap.set(playerName, i);
        }
      }

      // Header is "In Progress" during game, just date when complete
      const headerValue = isComplete ? finalHeader : inProgressHeader;

      // Build column values - during play, show buy-in amounts (negative since it's money in)
      const columnValues: (string | number)[] = [headerValue];

      // Fill in player buy-in amounts
      for (let i = 1; i < rows.length; i++) {
        const playerName = String(rows[i]?.[0] ?? '').trim().toLowerCase();
        const result = playerBuyIns.find(
          pr => pr.playerName.toLowerCase() === playerName
        );

        if (result) {
          // During active session, show negative buy-in (money on table)
          // When complete, this will be called with final netResult instead
          columnValues.push(result.totalBuyIn);
        } else {
          columnValues.push('');
        }
      }

      // Check for new players not in the spreadsheet
      const existingPlayers = new Set(playerRowMap.keys());
      const newPlayers = playerBuyIns.filter(
        pr => !existingPlayers.has(pr.playerName.toLowerCase())
      );

      // Add new players to the column
      for (const newPlayer of newPlayers) {
        columnValues.push(newPlayer.totalBuyIn);
      }

      // Write the column
      const colLetter = this.columnIndexToLetter(targetColIndex);
      const range = `${firstSheetName}!${colLetter}1:${colLetter}${columnValues.length}`;

      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range,
            majorDimension: 'COLUMNS',
            values: [columnValues],
          }),
        }
      );

      // If there are new players, add their names in column A
      if (newPlayers.length > 0) {
        const startRow = rows.length + 1;
        const namesRange = `${firstSheetName}!A${startRow}:A${startRow + newPlayers.length - 1}`;

        await this.makeRequest(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(namesRange)}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              range: namesRange,
              majorDimension: 'ROWS',
              values: newPlayers.map(p => [p.playerName]),
            }),
          }
        );
      }

      console.log('Successfully updated in-progress session in spreadsheet');
    } catch (error) {
      console.error('Error updating in-progress session:', error);
      throw error;
    }
  }
}

export const googleDriveService = new GoogleDriveService();
export { SCOPES };
