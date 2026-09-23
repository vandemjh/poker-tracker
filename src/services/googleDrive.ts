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
  miscounts: [],
  lastModified: new Date().toISOString(),
};

// Google API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
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

// Callback type for when re-authentication is needed
type AuthRequiredCallback = () => Promise<boolean>;

class GoogleDriveService {
  private accessToken: string | null = null;
  private fileId: string | null = null;
  private onAuthRequiredCallback: AuthRequiredCallback | null = null;
  private onRequestFailedCallback: ((status: number) => void) | null = null;
  private isReauthenticating: boolean = false;
  private reauthPromise: Promise<boolean> | null = null;

  // Register a callback to be called when re-authentication is needed
  // The callback should trigger the auth flow and resolve to true if successful
  setOnAuthRequired(callback: AuthRequiredCallback | null) {
    this.onAuthRequiredCallback = callback;
  }

  // Register a callback to be called when Google returns a failed response
  // (e.g. 403 Forbidden, 429 rate limit). The callback should warn the user.
  setOnRequestFailed(callback: ((status: number) => void) | null) {
    this.onRequestFailedCallback = callback;
  }

  setAccessToken(token: string, persist: boolean = true) {
    this.accessToken = token;
    this.isReauthenticating = false;
    this.reauthPromise = null;
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
      },
    );

    if (!response.ok) {
      this.notifyRequestFailed(
        response.status,
        'https://www.googleapis.com/oauth2/v2/userinfo',
      );
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
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${this.accessToken}`,
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // Notify the UI that Google returned a failed response (e.g. 403, 429)
  private notifyRequestFailed(status: number, url: string) {
    console.warn('Google API request failed:', status, url);
    if (this.onRequestFailedCallback) {
      this.onRequestFailedCallback(status);
    }
  }

  // Trigger re-authentication and wait for it to complete
  private async triggerReauth(): Promise<boolean> {
    // If already re-authenticating, wait for that to complete
    if (this.isReauthenticating && this.reauthPromise) {
      return this.reauthPromise;
    }

    if (!this.onAuthRequiredCallback) {
      console.warn('No auth required callback registered');
      return false;
    }

    this.isReauthenticating = true;
    this.reauthPromise = this.onAuthRequiredCallback();

    try {
      const result = await this.reauthPromise;
      return result;
    } finally {
      this.isReauthenticating = false;
      this.reauthPromise = null;
    }
  }

  private async makeRequest(
    url: string,
    options: RequestInit = {},
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

    // Token expired (401) - trigger re-auth to restore the session, but never
    // retry the failed request
    if (response.status === 401) {
      console.log('Token expired, triggering re-authentication...');
      await this.triggerReauth();
      throw new Error('Your session expired. Please try the action again.');
    }

    // Any failed response (403 Forbidden, 429 rate limit, 5xx, etc.) - do not
    // retry, warn the user
    if (!response.ok) {
      this.notifyRequestFailed(response.status, url);
      const errorText = await response.text();
      const message =
        response.status === 403
          ? `You do not have access to perform this action. Google API error: ${response.status} - ${errorText}`
          : `Google API error: ${response.status} - ${errorText}`;
      throw new Error(message);
    }

    return response;
  }

  async findAppDataFile(): Promise<string | null> {
    const response = await this.makeRequest(
      `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${APP_DATA_FILE_NAME}'&fields=files(id,name,modifiedTime)`,
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
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
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
          },
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
          new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
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
          },
        );

        if (!response.ok) {
          this.notifyRequestFailed(
            response.status,
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          );
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
        },
      );
      this.fileId = null;
    }
  }

  // Fetch spreadsheet metadata (name)
  async getSpreadsheetName(spreadsheetId: string): Promise<string> {
    const response = await this.makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`,
    );
    const data = await response.json();
    return data.properties.title;
  }

  // Fetch spreadsheet data from Google Sheets (from Totals sheet)
  async getSpreadsheetData(spreadsheetId: string): Promise<string[][]> {
    try {
      // Get the totals sheet name
      const sheetName = await this.getTotalsSheetName(spreadsheetId);

      // Fetch all data from the totals sheet
      const response = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE`,
      );

      const data = await response.json();
      return data.values || [];
    } catch (error) {
      console.error('Error fetching spreadsheet data:', error);
      throw error;
    }
  }

  // Fetch spreadsheet name using API key (for publicly shared sheets)
  async getSpreadsheetNamePublic(
    spreadsheetId: string,
    apiKey: string,
  ): Promise<string> {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title&key=${apiKey}`,
    );
    if (!response.ok)
      throw new Error(`Google Sheets API error: ${response.status}`);
    const data = await response.json();
    return data.properties.title;
  }

  // Fetch spreadsheet data using API key (for publicly shared sheets)
  async getSpreadsheetDataPublic(
    spreadsheetId: string,
    apiKey: string,
  ): Promise<string[][]> {
    const sheetName = await this.getTotalsSheetNamePublic(
      spreadsheetId,
      apiKey,
    );
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE&key=${apiKey}`,
    );
    if (!response.ok)
      throw new Error(`Google Sheets API error: ${response.status}`);
    const data = await response.json();
    return data.values || [];
  }

  private async getTotalsSheetNamePublic(
    spreadsheetId: string,
    apiKey: string,
  ): Promise<string> {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties&key=${apiKey}`,
    );
    if (!response.ok)
      throw new Error(`Google Sheets API error: ${response.status}`);
    const metadata = await response.json();

    const totalsSheet = metadata.sheets?.find(
      (s: any) => s.properties.title === this.TOTALS_SHEET_NAME,
    );
    if (totalsSheet) return this.TOTALS_SHEET_NAME;

    const firstSheet = metadata.sheets?.find(
      (s: any) => s.properties.title !== this.IN_PROGRESS_SHEET_NAME,
    );
    return firstSheet?.properties.title || metadata.sheets[0].properties.title;
  }

  // Append or update a session row in the Totals sheet
  // Layout (transposed): each row is a game date, each column is a player
  // If a row with the same date exists, it updates that row
  // Otherwise, it appends a new row at the bottom
  async appendSessionRow(
    spreadsheetId: string,
    sessionDate: Date,
    playerResults: { playerName: string; netResult: number }[],
  ): Promise<void> {
    try {
      // Get the totals sheet name
      const sheetName = await this.getTotalsSheetName(spreadsheetId);

      // Get existing data to find player columns and existing game rows
      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE`,
      );
      const existingData = await dataResponse.json();
      const rows: (string | number)[][] = existingData.values || [];

      if (rows.length === 0) {
        throw new Error('Spreadsheet is empty');
      }

      // Format the date string for comparison
      const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}/${sessionDate.getFullYear()}`;

      // Header row maps player names to their column index
      const headerRow = rows[0] || [];
      const playerColMap = new Map<
        string,
        { col: number; displayName: string }
      >();
      for (let i = 1; i < headerRow.length; i++) {
        const displayName = String(headerRow[i] ?? '').trim();
        if (displayName) {
          playerColMap.set(displayName.toLowerCase(), { col: i, displayName });
        }
      }

      // Check if a row with this date already exists (scan the date column)
      let existingRowIndex = -1;
      for (let r = 1; r < rows.length; r++) {
        const cell = rows[r]?.[0];
        let rowDateStr = '';

        // Handle both string dates and serial number dates
        if (typeof cell === 'number') {
          const serialDate = this.serialDateToDate(cell);
          if (serialDate) {
            rowDateStr = `${serialDate.getMonth() + 1}/${serialDate.getDate()}/${serialDate.getFullYear()}`;
          }
        } else if (typeof cell === 'string') {
          rowDateStr = cell.trim();
        }

        if (rowDateStr === dateStr) {
          existingRowIndex = r;
          break;
        }
      }

      // Find the rightmost column with data (for appending new players)
      let maxCol = 1; // Column A holds the game date
      for (const row of rows) {
        if (row.length > maxCol) {
          maxCol = row.length;
        }
      }

      // Assign columns for any new players and build the row values
      const rowValues: (string | number)[] = [];
      let nextNewCol = maxCol;
      const newPlayers: { name: string; col: number }[] = [];

      for (const pr of playerResults) {
        const key = pr.playerName.trim().toLowerCase();
        const mapped = playerColMap.get(key);
        let col: number;
        if (mapped) {
          col = mapped.col;
        } else {
          col = nextNewCol;
          nextNewCol++;
          playerColMap.set(key, {
            col,
            displayName: pr.playerName.trim(),
          });
          newPlayers.push({ name: pr.playerName.trim(), col });
        }
        rowValues[col] = pr.netResult;
      }

      // Build the full row: date followed by one slot per player column
      rowValues[0] = dateStr;
      for (let i = 0; i < nextNewCol; i++) {
        if (rowValues[i] === undefined) {
          rowValues[i] = '';
        }
      }

      // If there are new players (or the sheet is fresh), write the header row
      if (newPlayers.length > 0) {
        const headerValues: string[] = new Array<string>(nextNewCol).fill('');
        headerValues[0] = 'Date';
        for (const [, { displayName, col }] of playerColMap) {
          headerValues[col] = displayName;
        }
        const headerRange = `${sheetName}!A1:${this.columnIndexToLetter(nextNewCol - 1)}1`;

        await this.makeRequest(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(headerRange)}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              range: headerRange,
              majorDimension: 'ROWS',
              values: [headerValues],
            }),
          },
        );
      }

      // Determine which row to write (row 1 is the header)
      const targetRowIndex =
        existingRowIndex !== -1
          ? existingRowIndex
          : Math.max(1, rows.length); // Fresh sheet: first game goes in row 2
      const rowNum = targetRowIndex + 1;
      const colLetter = this.columnIndexToLetter(nextNewCol - 1);
      const range = `${sheetName}!A${rowNum}:${colLetter}${rowNum}`;

      // Write the row (either new or updating existing)
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            range,
            majorDimension: 'ROWS',
            values: [rowValues],
          }),
        },
      );

      console.log(
        existingRowIndex !== -1
          ? 'Successfully updated existing session in spreadsheet'
          : 'Successfully appended new session to spreadsheet',
      );
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
    const utcDate = new Date((serial - 25569) * millisecondsPerDay);
    const year = utcDate.getUTCFullYear();
    if (year >= 1990 && year <= 2100) {
      // Convert from UTC midnight to local midnight to avoid timezone shifts
      return new Date(year, utcDate.getUTCMonth(), utcDate.getUTCDate());
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
  private readonly MICOUNTS_SHEET_NAME = 'Miscounts';

  // Helper to find or create a sheet by name
  private async ensureSheetExists(
    spreadsheetId: string,
    sheetName: string,
  ): Promise<{ sheetId: number; existed: boolean }> {
    // Get spreadsheet metadata
    const metaResponse = await this.makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    );
    const metadata = await metaResponse.json();

    // Check if sheet already exists
    const existingSheet = metadata.sheets?.find(
      (s: any) => s.properties.title === sheetName,
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
          requests: [
            {
              addSheet: {
                properties: { title: sheetName },
              },
            },
          ],
        }),
      },
    );

    const createResult = await createResponse.json();
    const newSheetId = createResult.replies[0].addSheet.properties.sheetId;

    return { sheetId: newSheetId, existed: false };
  }

  // Helper to get the "Totals" sheet name (first sheet or "Totals" if it exists)
  private async getTotalsSheetName(spreadsheetId: string): Promise<string> {
    const metaResponse = await this.makeRequest(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    );
    const metadata = await metaResponse.json();

    // Look for a sheet named "Totals"
    const totalsSheet = metadata.sheets?.find(
      (s: any) => s.properties.title === this.TOTALS_SHEET_NAME,
    );

    if (totalsSheet) {
      return this.TOTALS_SHEET_NAME;
    }

    // Otherwise return the first sheet that's not "In Progress"
    const firstSheet = metadata.sheets?.find(
      (s: any) => s.properties.title !== this.IN_PROGRESS_SHEET_NAME,
    );

    return firstSheet?.properties.title || metadata.sheets[0].properties.title;
  }

  // Update or create in-progress game data in the "In Progress" sheet
  // Format:
  // Row 1: Game date (MM/DD/YYYY)
  // Row 2: Headers (Player, Buy-in, Cash-out, Miscounts)
  // Row 3+: Player data
  async updateInProgressSession(
    spreadsheetId: string,
    sessionDate: Date,
    playerData: {
      playerName: string;
      totalBuyIn: number;
      cashOut?: number;
      miscounts?: number;
    }[],
  ): Promise<void> {
    try {
      // Ensure the "In Progress" sheet exists
      await this.ensureSheetExists(spreadsheetId, this.IN_PROGRESS_SHEET_NAME);

      // Format the date
      const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}/${sessionDate.getFullYear()}`;

      // Build the data to write
      const rows: (string | number)[][] = [
        [dateStr], // Row 1: Date
        ['Player', 'Buy-in', 'Cash-out', 'Miscounts'], // Row 2: Headers
      ];

      // Add player data
      for (const player of playerData) {
        rows.push([
          player.playerName,
          player.totalBuyIn,
          player.cashOut !== undefined ? player.cashOut : '',
          player.miscounts ?? 0,
        ]);
      }

      // Clear and write to the sheet
      const range = `'${this.IN_PROGRESS_SHEET_NAME}'!A1:D${rows.length}`;

      // First clear the sheet
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${this.IN_PROGRESS_SHEET_NAME}'!A:D:clear`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
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
        },
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
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      );
      const metadata = await metaResponse.json();

      const ipSheet = metadata.sheets?.find(
        (s: any) => s.properties.title === this.IN_PROGRESS_SHEET_NAME,
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
        },
      );

      console.log('Cleared in-progress sheet');
    } catch (error) {
      console.error('Error clearing in-progress sheet:', error);
      // Don't throw - this is cleanup, not critical
    }
  }

  // Get in-progress game data from the "In Progress" sheet
  async getInProgressGame(spreadsheetId: string): Promise<{
    date: Date;
    players: {
      playerName: string;
      totalBuyIn: number;
      cashOut?: number;
      miscounts?: number;
    }[];
  } | null> {
    try {
      // Check if the sheet exists
      const metaResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      );
      const metadata = await metaResponse.json();

      const ipSheet = metadata.sheets?.find(
        (s: any) => s.properties.title === this.IN_PROGRESS_SHEET_NAME,
      );

      if (!ipSheet) {
        return null; // Sheet doesn't exist
      }

      // Get the data
      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${this.IN_PROGRESS_SHEET_NAME}'!A:D?valueRenderOption=UNFORMATTED_VALUE`,
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
        parseInt(dateParts[1], 10),
      );

      // Parse player data starting from row 3 (index 2)
      const players: {
        playerName: string;
        totalBuyIn: number;
        cashOut?: number;
        miscounts?: number;
      }[] = [];

      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        const playerName = String(row?.[0] || '').trim();
        const totalBuyIn = parseFloat(String(row?.[1] || '0')) || 0;
        const cashOutValue = row?.[2];
        const cashOut =
          cashOutValue !== undefined && cashOutValue !== ''
            ? parseFloat(String(cashOutValue))
            : undefined;
        const miscountsValue = row?.[3];
        const miscounts =
          miscountsValue !== undefined && miscountsValue !== ''
            ? parseFloat(String(miscountsValue)) || 0
            : undefined;

        if (playerName && totalBuyIn > 0) {
          players.push({ playerName, totalBuyIn, cashOut, miscounts });
        }
      }

      if (players.length === 0) return null;

      return { date, players };
    } catch (error) {
      console.error('Error getting in-progress game:', error);
      return null;
    }
  }

  // Format a cell value from a sheet as a displayable date string.
  // Handles both date strings (MM/DD/YYYY) and Google Sheets serial numbers.
  private formatSheetDate(value: string | number | undefined): string {
    if (value === undefined || value === '') return '';
    if (typeof value === 'number') {
      const date = this.serialDateToDate(value);
      if (date) {
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
      }
      return '';
    }
    return String(value).trim();
  }

  // Write miscount totals to the "Miscounts" sheet in the same layout as the
  // "Totals" sheet: column A holds game dates, each subsequent column is a
  // player, and cells hold the miscount count for that player on that date.
  // Existing data is read first and merged, then the whole sheet is rewritten.
  async appendMiscountsRow(
    spreadsheetId: string,
    sessionDate: Date,
    playerMiscounts: { playerName: string; count: number }[],
  ): Promise<void> {
    try {
      // Ensure the "Miscounts" sheet exists
      await this.ensureSheetExists(spreadsheetId, this.MICOUNTS_SHEET_NAME);

      const sheetName = this.MICOUNTS_SHEET_NAME;

      // Fetch existing data
      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}?valueRenderOption=UNFORMATTED_VALUE`,
      );
      const existingData = await dataResponse.json();
      const rows: (string | number)[][] = existingData.values || [];

      // Existing data is laid out like the Totals sheet: header row
      // (Date | <player names>) and one row per game date
      const headerRow = rows[0] || [];

      // Parse existing data into date -> player -> count
      const dates = new Map<
        string,
        { dateStr: string; counts: Map<string, number> }
      >();

      if (headerRow[0]?.toString().trim().toLowerCase() === 'date') {
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const dateStr = this.formatSheetDate(row[0]);
          if (!dateStr) continue;
          const entry: { dateStr: string; counts: Map<string, number> } = {
            dateStr,
            counts: new Map(),
          };
          for (let c = 1; c < headerRow.length; c++) {
            const playerName = String(headerRow[c] ?? '').trim();
            if (!playerName) continue;
            const value = row?.[c];
            const count =
              value === undefined || value === ''
                ? 0
                : Number.isFinite(Number(value))
                  ? Number(value)
                  : 0;
            if (count > 0) {
              entry.counts.set(playerName, count);
            }
          }
          if (entry.counts.size > 0) dates.set(dateStr, entry);
        }
      }

      // Merge the current game's miscount totals
      const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}/${sessionDate.getFullYear()}`;
      let current = dates.get(dateStr);
      if (!current) {
        current = { dateStr, counts: new Map() };
        dates.set(dateStr, current);
      }
      for (const pm of playerMiscounts) {
        if (pm.count <= 0) continue;
        const name = pm.playerName.trim();
        current.counts.set(
          name,
          (current.counts.get(name) || 0) + pm.count,
        );
      }

      // Build rows, preserving player column order
      const playerOrder: string[] = [];
      for (const { counts } of dates.values()) {
        for (const name of counts.keys()) {
          if (!playerOrder.includes(name)) playerOrder.push(name);
        }
      }

      const output: (string | number)[][] = [['Date', ...playerOrder]];
      const sortedDates = [...dates.values()].sort((a, b) =>
        a.dateStr.localeCompare(b.dateStr),
      );
      for (const entry of sortedDates) {
        const row: (string | number)[] = [entry.dateStr];
        for (const name of playerOrder) {
          const value = entry.counts.get(name);
          row.push(value === undefined ? '' : value);
        }
        output.push(row);
      }

      // Clear and rewrite the sheet
      const endCol = this.columnIndexToLetter(
        Math.max(1, output[0].length - 1),
      );
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:${endCol}:clear`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );

      const range = `${sheetName}!A1:${endCol}${output.length}`;
      await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            range,
            majorDimension: 'ROWS',
            values: output,
          }),
        },
      );

      console.log('Successfully updated miscounts sheet');
    } catch (error) {
      console.error('Error updating miscounts sheet:', error);
      throw error;
    }
  }

  // Read all miscount records from the "Miscounts" sheet
  // Returns flattened records ({date, playerName, amount}) for the
  // Totals-style layout, where each row is a game date, each column a player,
  // and amount is the miscount count.
  async getMiscounts(spreadsheetId: string): Promise<
    { date: string; playerName: string; amount: number }[]
  > {
    try {
      // Check if the sheet exists
      const metaResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      );
      const metadata = await metaResponse.json();
      const miscountSheet = (
        metadata.sheets as Array<{ properties: { title: string } }>
      )?.find((s) => s.properties.title === this.MICOUNTS_SHEET_NAME);
      if (!miscountSheet) {
        return [];
      }

      const dataResponse = await this.makeRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(this.MICOUNTS_SHEET_NAME)}!A:Z?valueRenderOption=UNFORMATTED_VALUE`,
      );
      const data = await dataResponse.json();
      const rows: (string | number)[][] = data.values || [];

      const miscounts: { date: string; playerName: string; amount: number }[] =
        [];
      if (rows.length < 1) {
        return miscounts;
      }

      const headerRow = rows[0] || [];

      // Totals-style layout: dates down column A, players across the header
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const date = this.formatSheetDate(row?.[0]);
        if (!date) continue;
        for (let c = 1; c < headerRow.length; c++) {
          const playerName = String(headerRow[c] ?? '').trim();
          if (!playerName) continue;
          const amount = parseFloat(String(row?.[c] || '0')) || 0;
          if (amount > 0) {
            miscounts.push({ date, playerName, amount });
          }
        }
      }

      return miscounts;
    } catch (error) {
      console.error('Error getting miscounts from spreadsheet:', error);
      return [];
    }
  }
}

export const googleDriveService = new GoogleDriveService();
export { SCOPES };
