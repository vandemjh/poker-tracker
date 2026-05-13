import { useState, useEffect, useRef, useCallback } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { useAppSelector, useAppDispatch } from './useAppSelector';
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

export function useGoogleAuth() {
  const dispatch = useAppDispatch();
  const { isGoogleConnected, googleUser, isInitializing } = useAppSelector(
    (state) => state.ui,
  );
  const { players } = useAppSelector((state) => state.players);

  const [showDropdown, setShowDropdown] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(false);
  const autoReconnectAttempted = useRef(false);
  const hasInitialized = useRef(false);
  const reauthResolverRef = useRef<((success: boolean) => void) | null>(null);
  const pendingSyncAfterReauth = useRef(false);

  const syncFromSpreadsheet = useCallback(
    async (spreadsheetId: string, existingPlayers: typeof players = []) => {
      try {
        const spreadsheetData =
          await googleDriveService.getSpreadsheetData(spreadsheetId);
        const parsedResult = parseSpreadsheetData(spreadsheetData);

        const result = remapPlayerIds(parsedResult, existingPlayers);

        dispatch(mergePlayers(result.players));
        dispatch(
          replaceImportedSessions({
            sessions: result.sessions,
            playerSessions: result.playerSessions,
          }),
        );

        dispatch(
          setSyncStatus({
            lastSyncTime: new Date().toISOString(),
            hasUnsyncedChanges: false,
            error: null,
          }),
        );
      } catch (error) {
        console.error('Error syncing from spreadsheet:', error);
      }
    },
    [dispatch],
  );

  const handleLoginSuccess = useCallback(
    async (accessToken: string, isReauth: boolean = false) => {
      try {
        dispatch(setLoading(true));
        googleDriveService.setAccessToken(accessToken);
        dispatch(setGoogleConnected(true));
        setNeedsReauth(false);
        setIsAutoReconnecting(false);

        const userInfo = await googleDriveService.fetchUserInfo();
        dispatch(setGoogleUser(userInfo));

        const spreadsheetId = googleDriveService.getStoredSpreadsheetId();
        if (spreadsheetId) {
          dispatch(setImportedSpreadsheetId(spreadsheetId));
          const shouldSync = !isReauth || pendingSyncAfterReauth.current;
          pendingSyncAfterReauth.current = false;
          if (shouldSync) {
            await syncFromSpreadsheet(spreadsheetId, players);
          }
        }

        if (reauthResolverRef.current) {
          reauthResolverRef.current(true);
          reauthResolverRef.current = null;
        }
      } catch (error) {
        console.error('Error connecting to Google Drive:', error);
        dispatch(setError('Failed to connect to Google Drive'));
        if (reauthResolverRef.current) {
          reauthResolverRef.current(false);
          reauthResolverRef.current = null;
        }
      } finally {
        dispatch(setLoading(false));
      }
    },
    [dispatch, players, syncFromSpreadsheet],
  );

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      await handleLoginSuccess(tokenResponse.access_token);
    },
    onError: (error) => {
      console.error('Google login error:', error);
      setIsAutoReconnecting(false);
      if (!autoReconnectAttempted.current) {
        dispatch(setError('Failed to sign in with Google'));
      }
      autoReconnectAttempted.current = false;
    },
    scope: SCOPES,
  });

  const loginWithHint = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      await handleLoginSuccess(tokenResponse.access_token, true);
    },
    onError: (error) => {
      console.error('Google re-login error:', error);
      setIsAutoReconnecting(false);
      setNeedsReauth(true);
      if (reauthResolverRef.current) {
        reauthResolverRef.current(false);
        reauthResolverRef.current = null;
      }
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

      if (storedSpreadsheetId) {
        dispatch(setImportedSpreadsheetId(storedSpreadsheetId));
      }

      if (storedToken && storedUser) {
        googleDriveService.setAccessToken(storedToken, false);

        const isValid = await googleDriveService.validateToken();

        if (isValid) {
          dispatch(setGoogleConnected(true));
          dispatch(setGoogleUser(storedUser));

          if (storedSpreadsheetId) {
            await syncFromSpreadsheet(storedSpreadsheetId);
          }
        } else {
          if (storedSpreadsheetId) {
            pendingSyncAfterReauth.current = true;
          }
          dispatch(setGoogleUser(storedUser));
          setNeedsReauth(true);
        }
      }

      dispatch(setInitializing(false));
    };

    restoreSession();
  }, [dispatch, syncFromSpreadsheet]);

  // Auto-trigger reconnection when needed
  useEffect(() => {
    if (
      needsReauth &&
      googleUser &&
      !isAutoReconnecting &&
      !autoReconnectAttempted.current
    ) {
      autoReconnectAttempted.current = true;
      setIsAutoReconnecting(true);
      setTimeout(() => {
        loginWithHint();
      }, 500);
    }
  }, [needsReauth, googleUser, isAutoReconnecting, loginWithHint]);

  // Register re-auth callback for mid-session token expiration
  useEffect(() => {
    const handleReauthRequired = (): Promise<boolean> => {
      return new Promise((resolve) => {
        reauthResolverRef.current = resolve;
        setIsAutoReconnecting(true);
        setTimeout(() => {
          loginWithHint();
        }, 100);
      });
    };

    googleDriveService.setOnAuthRequired(handleReauthRequired);

    return () => {
      googleDriveService.setOnAuthRequired(null);
    };
  }, [loginWithHint]);

  const handleLogout = () => {
    googleLogout();
    googleDriveService.clearAccessToken();
    dispatch(setGoogleConnected(false));
    dispatch(setGoogleUser(null));
    dispatch(setImportedSpreadsheetId(null));
    dispatch(
      setSyncStatus({
        lastSyncTime: null,
        hasUnsyncedChanges: false,
        error: null,
      }),
    );
    setShowDropdown(false);
    setNeedsReauth(false);
  };

  return {
    isInitializing,
    isGoogleConnected,
    googleUser,
    needsReauth,
    isAutoReconnecting,
    showDropdown,
    setShowDropdown,
    login,
    loginWithHint,
    handleLogout,
  };
}
