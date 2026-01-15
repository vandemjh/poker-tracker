import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(false);
  const hasInitialized = useRef(false);
  const autoReconnectAttempted = useRef(false);

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

  // Handle successful login
  const handleLoginSuccess = useCallback(async (accessToken: string) => {
    try {
      dispatch(setLoading(true));
      googleDriveService.setAccessToken(accessToken);
      dispatch(setGoogleConnected(true));
      setNeedsReauth(false);
      setIsAutoReconnecting(false);

      // Fetch and store user info
      const userInfo = await googleDriveService.fetchUserInfo();
      dispatch(setGoogleUser(userInfo));

      // Check if there's a linked spreadsheet and auto-sync from it
      const spreadsheetId = googleDriveService.getStoredSpreadsheetId();
      if (spreadsheetId) {
        dispatch(setImportedSpreadsheetId(spreadsheetId));
        await syncFromSpreadsheet(spreadsheetId, players);
      }
    } catch (error) {
      console.error('Error connecting to Google Drive:', error);
      dispatch(setError('Failed to connect to Google Drive'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch, players]);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      await handleLoginSuccess(tokenResponse.access_token);
    },
    onError: (error) => {
      console.error('Google login error:', error);
      setIsAutoReconnecting(false);
      // Only show error if this wasn't a silent/auto reconnect attempt
      if (!autoReconnectAttempted.current) {
        dispatch(setError('Failed to sign in with Google'));
      }
      autoReconnectAttempted.current = false;
    },
    scope: SCOPES,
  });

  // Login with hint (for reconnection - pre-selects the user's account)
  const loginWithHint = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      await handleLoginSuccess(tokenResponse.access_token);
    },
    onError: (error) => {
      console.error('Google re-login error:', error);
      setIsAutoReconnecting(false);
      setNeedsReauth(true);
    },
    scope: SCOPES,
    hint: googleUser?.email,
  });

  // Try to restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      if (hasInitialized.current) return;
      hasInitialized.current = true;

      const storedToken = googleDriveService.getStoredToken();
      const storedUser = googleDriveService.getStoredUser();
      const storedSpreadsheetId = googleDriveService.getStoredSpreadsheetId();

      // Always restore spreadsheet ID if we have one
      if (storedSpreadsheetId) {
        dispatch(setImportedSpreadsheetId(storedSpreadsheetId));
      }

      if (storedToken && storedUser) {
        // Set the token
        googleDriveService.setAccessToken(storedToken, false);

        // Validate the token is still valid
        const isValid = await googleDriveService.validateToken();

        if (isValid) {
          dispatch(setGoogleConnected(true));
          dispatch(setGoogleUser(storedUser));

          // Auto-sync from spreadsheet - spreadsheet is the source of truth
          if (storedSpreadsheetId) {
            await syncFromSpreadsheet(storedSpreadsheetId);
          }
        } else {
          // Token expired but we have stored info
          // Keep user info for display and auto-reconnect
          dispatch(setGoogleUser(storedUser));
          setNeedsReauth(true);
        }
      }

      dispatch(setInitializing(false));
    };

    restoreSession();
  }, [dispatch]); // Only run once on mount

  // Auto-trigger reconnection when needed (after component mounts and login is available)
  useEffect(() => {
    if (needsReauth && googleUser && !isAutoReconnecting && !autoReconnectAttempted.current) {
      // Auto-trigger reconnection with the user's email as hint
      autoReconnectAttempted.current = true;
      setIsAutoReconnecting(true);
      // Small delay to ensure the login hook is ready
      setTimeout(() => {
        loginWithHint();
      }, 500);
    }
  }, [needsReauth, googleUser, isAutoReconnecting, loginWithHint]);

  const handleLogout = () => {
    googleLogout();
    googleDriveService.clearAccessToken();
    dispatch(setGoogleConnected(false));
    dispatch(setGoogleUser(null));
    dispatch(setImportedSpreadsheetId(null));
    dispatch(setSyncStatus({
      lastSyncTime: null,
      hasUnsyncedChanges: false,
      error: null,
    }));
    setShowDropdown(false);
    setNeedsReauth(false);
  };

  // Show loading state while restoring or auto-reconnecting
  if (isInitializing || isAutoReconnecting) {
    return (
      <div className="flex items-center gap-2">
        {googleUser && (
          <img
            src={googleUser.picture}
            alt={googleUser.name}
            className="w-8 h-8 rounded-full opacity-50"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="w-6 h-6 border-2 border-nb-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show reconnect button if token expired and auto-reconnect failed
  if (needsReauth && googleUser) {
    return (
      <button
        onClick={() => loginWithHint()}
        className="btn-nb bg-nb-orange text-nb-black text-sm flex items-center gap-2"
        title={`Reconnect as ${googleUser.name}`}
      >
        <img
          src={googleUser.picture}
          alt={googleUser.name}
          className="w-6 h-6 rounded-full"
          referrerPolicy="no-referrer"
        />
        Reconnect
      </button>
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
