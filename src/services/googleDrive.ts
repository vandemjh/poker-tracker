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
  'https://www.googleapis.com/auth/spreadsheets',
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

  // Fetch spreadsheet data from Google Sheets (from Totals sheet)
  async getSpreadsheetData(spreadsheetId: string): Promise<string[][]> {
    try {
      // Get the totals sheet name
      const sheetName = await this.getTotalsSheetName(spreadsheetId);

      // Fetch all data from the totals sheet
      const response = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE`
      );

      const data = await response.json();
      return data.values || [];
    } catch (error) {
      console.error('Error fetching spreadsheet data:', error);
      throw error;
    }
  }

  // Append or update a session column in the Totals sheet
  // If a column with the same date exists, it updates that column
  // Otherwise, it appends a new column to the right
  async appendSessionColumn(
    spreadsheetId: string,
    sessionDate: Date,
    playerResults: { playerName: string; netResult: number }[]
  ): Promise<void> {
    try {
      // Get the totals sheet name
      const sheetName = await this.getTotalsSheetName(spreadsheetId);

      // Get existing data to find the rightmost column and player rows
      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE`
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
      const range = `${sheetName}!${colLetter}1:${colLetter}${columnValues.length}`;

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
        const namesRange = `${sheetName}!A${startRow}:A${startRow + newPlayers.length - 1}`;

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

  // Sheet names
  private readonly TOTALS_SHEET_NAME = 'Totals';
  private readonly IN_PROGRESS_SHEET_NAME = 'In Progress';

  // Helper to find or create a sheet by name
  private async ensureSheetExists(
    spreadsheetId: string,
    sheetName: string
  ): Promise<{ sheetId: number; existed: boolean }> {
    // Get spreadsheet metadata
    const metaResponse = await this.makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
    );
    const metadata = await metaResponse.json();

    // Check if sheet already exists
    const existingSheet = metadata.sheets?.find(
      (s: any) => s.properties.title === sheetName
    );

    if (existingSheet) {
      return { sheetId: existingSheet.properties.sheetId, existed: true };
    }

    // Create the sheet
    const createResponse = await this.makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            addSheet: {
              properties: { title: sheetName }
            }
          }]
        }),
      }
    );

    const createResult = await createResponse.json();
    const newSheetId = createResult.replies[0].addSheet.properties.sheetId;

    return { sheetId: newSheetId, existed: false };
  }

  // Helper to get the "Totals" sheet name (first sheet or "Totals" if it exists)
  private async getTotalsSheetName(spreadsheetId: string): Promise<string> {
    const metaResponse = await this.makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
    );
    const metadata = await metaResponse.json();

    // Look for a sheet named "Totals"
    const totalsSheet = metadata.sheets?.find(
      (s: any) => s.properties.title === this.TOTALS_SHEET_NAME
    );

    if (totalsSheet) {
      return this.TOTALS_SHEET_NAME;
    }

    // Otherwise return the first sheet that's not "In Progress"
    const firstSheet = metadata.sheets?.find(
      (s: any) => s.properties.title !== this.IN_PROGRESS_SHEET_NAME
    );

    return firstSheet?.properties.title || metadata.sheets[0].properties.title;
  }

  // Update or create in-progress game data in the "In Progress" sheet
  // Format:
  // Row 1: Game date (MM/DD/YYYY)
  // Row 2: Headers (Player, Buy-in, Cash-out)
  // Row 3+: Player data
  async updateInProgressSession(
    spreadsheetId: string,
    sessionDate: Date,
    playerData: { playerName: string; totalBuyIn: number; cashOut?: number }[]
  ): Promise<void> {
    try {
      // Ensure the "In Progress" sheet exists
      await this.ensureSheetExists(spreadsheetId, this.IN_PROGRESS_SHEET_NAME);

      // Format the date
      const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}/${sessionDate.getFullYear()}`;

      // Build the data to write
      const rows: (string | number)[][] = [
        [dateStr], // Row 1: Date
        ['Player', 'Buy-in', 'Cash-out'], // Row 2: Headers
      ];

      // Add player data
      for (const player of playerData) {
        rows.push([
          player.playerName,
          player.totalBuyIn,
          player.cashOut !== undefined ? player.cashOut : '',
        ]);
      }

      // Clear and write to the sheet
      const range = `'${this.IN_PROGRESS_SHEET_NAME}'!A1:C${rows.length}`;

      // First clear the sheet
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${this.IN_PROGRESS_SHEET_NAME}'!A:C:clear`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      // Then write the new data
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            range,
            majorDimension: 'ROWS',
            values: rows,
          }),
        }
      );

      console.log('Successfully updated in-progress session in spreadsheet');
    } catch (error) {
      console.error('Error updating in-progress session:', error);
      throw error;
    }
  }

  // Clear the "In Progress" sheet (called when game ends)
  async clearInProgressSheet(spreadsheetId: string): Promise<void> {
    try {
      // Check if the sheet exists
      const metaResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
      );
      const metadata = await metaResponse.json();

      const ipSheet = metadata.sheets?.find(
        (s: any) => s.properties.title === this.IN_PROGRESS_SHEET_NAME
      );

      if (!ipSheet) {
        return; // Sheet doesn't exist, nothing to clear
      }

      // Clear the sheet
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${this.IN_PROGRESS_SHEET_NAME}'!A:Z:clear`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      console.log('Cleared in-progress sheet');
    } catch (error) {
      console.error('Error clearing in-progress sheet:', error);
      // Don't throw - this is cleanup, not critical
    }
  }

  // Get in-progress game data from the "In Progress" sheet
  async getInProgressGame(
    spreadsheetId: string
  ): Promise<{
    date: Date;
    players: { playerName: string; totalBuyIn: number; cashOut?: number }[];
  } | null> {
    try {
      // Check if the sheet exists
      const metaResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`
      );
      const metadata = await metaResponse.json();

      const ipSheet = metadata.sheets?.find(
        (s: any) => s.properties.title === this.IN_PROGRESS_SHEET_NAME
      );

      if (!ipSheet) {
        return null; // Sheet doesn't exist
      }

      // Get the data
      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${this.IN_PROGRESS_SHEET_NAME}'!A:C?valueRenderOption=UNFORMATTED_VALUE`
      );
      const data = await dataResponse.json();
      const rows: (string | number)[][] = data.values || [];

      if (rows.length < 3) {
        return null; // Not enough data (need date row, header row, at least one player)
      }

      // Parse the date from row 1
      const dateStr = String(rows[0]?.[0] || '').trim();
      if (!dateStr) return null;

      const dateParts = dateStr.split('/');
      if (dateParts.length !== 3) return null;

      const date = new Date(
        parseInt(dateParts[2], 10),
        parseInt(dateParts[0], 10) - 1,
        parseInt(dateParts[1], 10)
      );

      // Parse player data starting from row 3 (index 2)
      const players: { playerName: string; totalBuyIn: number; cashOut?: number }[] = [];

      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        const playerName = String(row?.[0] || '').trim();
        const totalBuyIn = parseFloat(String(row?.[1] || '0')) || 0;
        const cashOutValue = row?.[2];
        const cashOut = cashOutValue !== undefined && cashOutValue !== ''
          ? parseFloat(String(cashOutValue))
          : undefined;

        if (playerName && totalBuyIn > 0) {
          players.push({ playerName, totalBuyIn, cashOut });
        }
      }

      if (players.length === 0) return null;

      return { date, players };
    } catch (error) {
      console.error('Error getting in-progress game:', error);
      return null;
    }
  }
}

export const googleDriveService = new GoogleDriveService();
export { SCOPES };
