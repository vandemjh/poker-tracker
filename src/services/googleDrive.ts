import type { AppData } from '../types';

const APP_DATA_FILE_NAME = 'poker-tracker-data.json';
const INITIAL_APP_DATA: AppData = {
  version: '1.0',
  players: [],
  sessions: [],
  playerSessions: [],
  lastModified: new Date().toISOString(),
};

// Google API configuration
// Users need to set up their own Google Cloud project and replace this
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

class GoogleDriveService {
  private accessToken: string | null = null;
  private fileId: string | null = null;

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  clearAccessToken() {
    this.accessToken = null;
    this.fileId = null;
  }

  isAuthenticated(): boolean {
    return this.accessToken !== null;
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
      throw new Error(`Google Drive API error: ${response.status} - ${errorText}`);
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
}

export const googleDriveService = new GoogleDriveService();
export { SCOPES };
