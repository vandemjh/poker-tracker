// Google Picker API service for selecting files from Drive

declare global {
  interface Window {
    google: {
      picker: {
        PickerBuilder: new () => PickerBuilder;
        ViewId: {
          SPREADSHEETS: string;
          DOCS: string;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        DocsView: new (viewId?: string) => DocsView;
      };
    };
    gapi: {
      load: (api: string, callback: () => void) => void;
    };
  }
}

interface DocsView {
  setIncludeFolders: (include: boolean) => DocsView;
  setMimeTypes: (mimeTypes: string) => DocsView;
  setSelectFolderEnabled: (enabled: boolean) => DocsView;
}

interface PickerBuilder {
  addView: (view: DocsView | string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  build: () => Picker;
}

interface Picker {
  setVisible: (visible: boolean) => void;
}

interface PickerDocument {
  id: string;
  name: string;
  mimeType: string;
  url: string;
}

interface PickerResponse {
  action: string;
  docs?: PickerDocument[];
}

export interface SelectedFile {
  id: string;
  name: string;
  mimeType: string;
}

let pickerApiLoaded = false;
let pickerApiLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (pickerApiLoaded) {
      resolve();
      return;
    }

    if (pickerApiLoading) {
      loadCallbacks.push(resolve);
      return;
    }

    pickerApiLoading = true;

    // Check if gapi script is already loaded
    if (!window.gapi) {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => {
        window.gapi.load('picker', () => {
          pickerApiLoaded = true;
          pickerApiLoading = false;
          resolve();
          loadCallbacks.forEach(cb => cb());
          loadCallbacks.length = 0;
        });
      };
      script.onerror = () => {
        pickerApiLoading = false;
        reject(new Error('Failed to load Google API script'));
      };
      document.body.appendChild(script);
    } else {
      window.gapi.load('picker', () => {
        pickerApiLoaded = true;
        pickerApiLoading = false;
        resolve();
        loadCallbacks.forEach(cb => cb());
        loadCallbacks.length = 0;
      });
    }
  });
}

export async function openGooglePicker(
  accessToken: string,
  apiKey: string
): Promise<SelectedFile | null> {
  await loadPickerApi();

  return new Promise((resolve) => {
    const google = window.google;

    // Create a view for Google Sheets only
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS);
    view.setIncludeFolders(true);

    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setTitle('Select a Google Sheet to import')
      .setCallback((data: PickerResponse) => {
        if (data.action === google.picker.Action.PICKED && data.docs && data.docs.length > 0) {
          const doc = data.docs[0];
          resolve({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
          });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
