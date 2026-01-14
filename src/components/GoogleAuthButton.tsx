import React, { useEffect, useState } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import {
  setGoogleConnected,
  setGoogleUser,
  setSyncStatus,
  setLoading,
  setError,
  mergePlayers,
  replaceImportedSessions,
  setImportedSpreadsheetId,
  setInitializing,
} from '../store';
import { googleDriveService, SCOPES } from '../services/googleDrive';
import { parseSpreadsheetData, remapPlayerIds } from '../utils/csvImport';

const GoogleAuthButton: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isGoogleConnected, googleUser, isInitializing } = useAppSelector(state => state.ui);
  const { players } = useAppSelector(state => state.players);

  const [showDropdown, setShowDropdown] = useState(false);

  // Helper function to sync from spreadsheet
  const syncFromSpreadsheet = async (spreadsheetId: string, existingPlayers: typeof players = []) => {
    try {
      const spreadsheetData = await googleDriveService.getSpreadsheetData(spreadsheetId);
      const parsedResult = parseSpreadsheetData(spreadsheetData);

      // Remap player IDs to match existing players
      const result = remapPlayerIds(parsedResult, existingPlayers);

      // Replace all data with spreadsheet data
      dispatch(mergePlayers(result.players));
      dispatch(replaceImportedSessions({
        sessions: result.sessions,
        playerSessions: result.playerSessions,
      }));

      dispatch(setSyncStatus({
        lastSyncTime: new Date().toISOString(),
        hasUnsyncedChanges: false,
        error: null,
      }));
    } catch (error) {
      console.error('Error syncing from spreadsheet:', error);
      // Don't throw - just log the error, user can manually sync later
    }
  };

  // Try to restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = googleDriveService.getStoredToken();
      const storedUser = googleDriveService.getStoredUser();

      if (storedToken && storedUser) {
        // Set the token
        googleDriveService.setAccessToken(storedToken, false);

        // Validate the token is still valid
        const isValid = await googleDriveService.validateToken();

        if (isValid) {
          dispatch(setGoogleConnected(true));
          dispatch(setGoogleUser(storedUser));

          // Restore spreadsheet ID and auto-sync from it
          const spreadsheetId = googleDriveService.getStoredSpreadsheetId();
          if (spreadsheetId) {
            dispatch(setImportedSpreadsheetId(spreadsheetId));
            // Auto-sync from spreadsheet - spreadsheet is the source of truth
            await syncFromSpreadsheet(spreadsheetId);
          }
        } else {
          // Token expired, clear it
          googleDriveService.clearAccessToken();
        }
      }

      dispatch(setInitializing(false));
    };

    restoreSession();
  }, [dispatch]); // Only run once on mount

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        dispatch(setLoading(true));
        googleDriveService.setAccessToken(tokenResponse.access_token);
        dispatch(setGoogleConnected(true));

        // Fetch and store user info
        const userInfo = await googleDriveService.fetchUserInfo();
        dispatch(setGoogleUser(userInfo));

        // Check if there's a linked spreadsheet and auto-sync from it
        const spreadsheetId = googleDriveService.getStoredSpreadsheetId();
        if (spreadsheetId) {
          dispatch(setImportedSpreadsheetId(spreadsheetId));
          await syncFromSpreadsheet(spreadsheetId);
        }
      } catch (error) {
        console.error('Error connecting to Google Drive:', error);
        dispatch(setError('Failed to connect to Google Drive'));
      } finally {
        dispatch(setLoading(false));
      }
    },
    onError: (error) => {
      console.error('Google login error:', error);
      dispatch(setError('Failed to sign in with Google'));
    },
    scope: SCOPES,
  });

  const handleLogout = () => {
    googleLogout();
    googleDriveService.clearAccessToken();
    dispatch(setGoogleConnected(false));
    dispatch(setGoogleUser(null));
    dispatch(setSyncStatus({
      lastSyncTime: null,
      hasUnsyncedChanges: false,
      error: null,
    }));
    setShowDropdown(false);
  };

  // Show loading state while restoring
  if (isInitializing) {
    return (
      <div className="w-10 h-10 rounded-full bg-theme-card animate-pulse border-3" style={{ borderColor: 'var(--color-border)' }} />
    );
  }

  if (isGoogleConnected && googleUser) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 p-1 border-3 hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-bg-card)',
            boxShadow: '2px 2px 0px 0px var(--color-shadow)',
          }}
        >
          <img
            src={googleUser.picture}
            alt={googleUser.name}
            className="w-8 h-8 rounded-full"
            referrerPolicy="no-referrer"
          />
        </button>

        {showDropdown && (
          <>
            {/* Backdrop to close dropdown */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowDropdown(false)}
            />

            {/* Dropdown menu */}
            <div
              className="absolute right-0 mt-2 w-64 border-3 z-50"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                borderColor: 'var(--color-border)',
                boxShadow: '4px 4px 0px 0px var(--color-shadow)',
              }}
            >
              <div className="p-4 border-b-3" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-3">
                  <img
                    src={googleUser.picture}
                    alt={googleUser.name}
                    className="w-12 h-12 rounded-full border-2"
                    style={{ borderColor: 'var(--color-border)' }}
                    referrerPolicy="no-referrer"
                  />
                  <div className="overflow-hidden">
                    <p className="font-semibold truncate">{googleUser.name}</p>
                    <p className="text-sm text-theme-secondary truncate">{googleUser.email}</p>
                  </div>
                </div>
              </div>
              <div className="p-2">
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 hover:bg-nb-red hover:text-nb-white transition-colors font-semibold"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => login()}
      className="btn-nb bg-nb-green text-sm"
    >
      Connect Google Drive
    </button>
  );
};

export default GoogleAuthButton;
