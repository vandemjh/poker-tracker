import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { store } from './store';
import Layout from './components/Layout';
import ResultsPage from './pages/ResultsPage';
import PlayPage from './pages/PlayPage';
import SettingsPage from './pages/SettingsPage';
import CSVImportModal from './components/CSVImportModal';

// Google OAuth Client ID - Replace with your own
// Get one from: https://console.cloud.google.com/
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Main app content
function AppContent() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ResultsPage />} />
          <Route path="play" element={<PlayPage />} />
          <Route path="settings" element={<SettingsPage />} />
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
