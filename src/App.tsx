import { useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { store } from './store';
import { useAppSelector, useAppDispatch } from './hooks/useAppSelector';
import { setSyncStatus, clearUnsyncedChanges } from './store';
import { googleDriveService } from './services/googleDrive';
import Layout from './components/Layout';
import ResultsPage from './pages/ResultsPage';
import PlayPage from './pages/PlayPage';
import CSVImportModal from './components/CSVImportModal';

// Google OAuth Client ID - Replace with your own
// Get one from: https://console.cloud.google.com/
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Debounced sync hook
function useDebouncedSync() {
  const dispatch = useAppDispatch();
  const { isGoogleConnected, syncStatus } = useAppSelector(state => state.ui);
  const { players } = useAppSelector(state => state.players);
  const { sessions, playerSessions } = useAppSelector(state => state.sessions);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const syncToGoogleDrive = useCallback(async () => {
    if (!isGoogleConnected || !syncStatus.hasUnsyncedChanges) return;

    try {
      dispatch(setSyncStatus({ isSyncing: true, error: null }));

      await googleDriveService.saveAppData({
        version: '1.0',
        players,
        sessions,
        playerSessions,
        lastModified: new Date().toISOString(),
      });

      dispatch(setSyncStatus({
        isSyncing: false,
        lastSyncTime: new Date().toISOString(),
        error: null,
      }));
      dispatch(clearUnsyncedChanges());
    } catch (error) {
      console.error('Sync error:', error);
      dispatch(setSyncStatus({
        isSyncing: false,
        error: String(error),
      }));
    }
  }, [dispatch, isGoogleConnected, syncStatus.hasUnsyncedChanges, players, sessions, playerSessions]);

  useEffect(() => {
    if (!syncStatus.hasUnsyncedChanges || !isGoogleConnected) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced sync (3 seconds as per spec)
    timeoutRef.current = setTimeout(() => {
      syncToGoogleDrive();
    }, 3000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [syncStatus.hasUnsyncedChanges, isGoogleConnected, syncToGoogleDrive]);
}

// Main app content with hooks
function AppContent() {
  useDebouncedSync();

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ResultsPage />} />
          <Route path="play" element={<PlayPage />} />
        </Route>
      </Routes>
      <CSVImportModal />
    </BrowserRouter>
  );
}

function App() {
  // Store reference for play page new player workaround
  (window as any).__REDUX_STORE__ = store;

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Provider store={store}>
        <AppContent />
      </Provider>
    </GoogleOAuthProvider>
  );
}

export default App;
