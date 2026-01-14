import React, { useState, useCallback } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import { toggleImportModal, setPlayers, replaceImportedSessions, markUnsyncedChanges } from '../store';
import GoogleAuthButton from './GoogleAuthButton';
import SyncStatusIndicator from './SyncStatusIndicator';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../hooks/useTheme';
import { googleDriveService } from '../services/googleDrive';
import { parseSpreadsheetData } from '../utils/csvImport';

const Layout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeSessionId } = useAppSelector(state => state.sessions);
  const { importedSpreadsheetId, isGoogleConnected } = useAppSelector(state => state.ui);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSettingsActive = location.pathname === '/settings';

  // Initialize theme
  useTheme();

  const handleManualSync = useCallback(async () => {
    if (!importedSpreadsheetId || !isGoogleConnected) return;

    try {
      setIsSyncing(true);
      const spreadsheetData = await googleDriveService.getSpreadsheetData(importedSpreadsheetId);
      const result = parseSpreadsheetData(spreadsheetData);

      // Replace all players and imported sessions with fresh data from spreadsheet
      dispatch(setPlayers(result.players));
      dispatch(replaceImportedSessions({
        sessions: result.sessions,
        playerSessions: result.playerSessions,
      }));
      dispatch(markUnsyncedChanges());
    } catch (error) {
      console.error('Error syncing from spreadsheet:', error);
      alert(`Failed to sync from Google Sheet: ${error}`);
    } finally {
      setIsSyncing(false);
    }
  }, [dispatch, importedSpreadsheetId, isGoogleConnected]);

  const handleTitleClick = () => {
    if (activeSessionId) {
      navigate('/play');
    } else {
      navigate('/');
    }
  };

  const navButtonClass = (isActive: boolean) =>
    `px-4 py-2 font-semibold border-3 transition-all duration-100 text-center min-w-[80px] ${
      isActive
        ? 'bg-nb-yellow text-nb-black translate-x-[4px] translate-y-[4px]'
        : 'hover:translate-x-[2px] hover:translate-y-[2px]'
    }`;

  const navButtonStyle = (isActive: boolean) => ({
    borderColor: 'var(--color-border)',
    backgroundColor: isActive ? undefined : 'var(--color-bg-card)',
    boxShadow: isActive ? '0px 0px 0px 0px var(--color-shadow)' : '4px 4px 0px 0px var(--color-shadow)',
  });

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200" style={{ backgroundColor: 'var(--color-bg)' }}>
      <header
        className="border-b-4 transition-colors duration-200"
        style={{
          backgroundColor: 'var(--color-bg-card)',
          borderColor: 'var(--color-border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleTitleClick}
                className="text-3xl md:text-4xl hover:scale-110 transition-transform text-left"
                title="Poker Tracker"
              >
                🃏
              </button>
              <SyncStatusIndicator />
            </div>

            <nav className="flex flex-wrap items-center gap-3">
              <NavLink
                to="/"
                className={({ isActive }) => navButtonClass(isActive)}
                style={({ isActive }) => navButtonStyle(isActive)}
                end
              >
                Results
              </NavLink>
              <NavLink
                to="/play"
                className={({ isActive }) => navButtonClass(isActive)}
                style={({ isActive }) => navButtonStyle(isActive)}
              >
                Play
              </NavLink>
              {importedSpreadsheetId ? (
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing || !isGoogleConnected}
                  className={`px-4 py-2 font-semibold border-3 bg-nb-green text-nb-black hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-100 min-w-[80px] text-center ${isSyncing ? 'opacity-50 cursor-wait' : ''}`}
                  style={{
                    borderColor: 'var(--color-border)',
                    boxShadow: '4px 4px 0px 0px var(--color-shadow)',
                  }}
                >
                  {isSyncing ? 'Syncing...' : 'Sync'}
                </button>
              ) : (
                <button
                  onClick={() => dispatch(toggleImportModal())}
                  className="px-4 py-2 font-semibold border-3 bg-nb-blue text-nb-white hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-100 min-w-[80px] text-center"
                  style={{
                    borderColor: 'var(--color-border)',
                    boxShadow: '4px 4px 0px 0px var(--color-shadow)',
                  }}
                >
                  Link
                </button>
              )}
              <button
                onClick={() => navigate('/settings')}
                className={`w-10 h-10 flex items-center justify-center border-3 transition-all duration-100 ${
                  isSettingsActive
                    ? 'bg-nb-yellow text-nb-black translate-x-[2px] translate-y-[2px]'
                    : 'hover:translate-x-[1px] hover:translate-y-[1px]'
                }`}
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: isSettingsActive ? undefined : 'var(--color-bg-card)',
                  boxShadow: isSettingsActive ? '0px 0px 0px 0px var(--color-shadow)' : '2px 2px 0px 0px var(--color-shadow)',
                }}
                title="Settings"
              >
                <span className="text-lg">⚙️</span>
              </button>
              <ThemeToggle />
              <GoogleAuthButton />
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
