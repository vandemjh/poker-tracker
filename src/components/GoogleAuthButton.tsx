import React from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import {
  setGoogleConnected,
  setSyncStatus,
  setLoading,
  setError,
  setPlayers,
  setSessions,
  setPlayerSessions,
} from '../store';
import { googleDriveService, SCOPES } from '../services/googleDrive';

const GoogleAuthButton: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isGoogleConnected } = useAppSelector(state => state.ui);
  const { players } = useAppSelector(state => state.players);
  const { sessions } = useAppSelector(state => state.sessions);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        dispatch(setLoading(true));
        googleDriveService.setAccessToken(tokenResponse.access_token);
        dispatch(setGoogleConnected(true));

        // Load existing data from Google Drive
        const appData = await googleDriveService.loadAppData();

        if (appData.players.length > 0 || appData.sessions.length > 0) {
          // If there's existing data in Drive and no local data, load it
          if (players.length === 0 && sessions.length === 0) {
            dispatch(setPlayers(appData.players));
            dispatch(setSessions(appData.sessions));
            dispatch(setPlayerSessions(appData.playerSessions));
          }
        }

        dispatch(setSyncStatus({
          lastSyncTime: new Date().toISOString(),
          hasUnsyncedChanges: false,
          error: null,
        }));
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
    dispatch(setSyncStatus({
      lastSyncTime: null,
      hasUnsyncedChanges: false,
      error: null,
    }));
  };

  if (isGoogleConnected) {
    return (
      <button
        onClick={handleLogout}
        className="btn-nb bg-nb-red text-nb-white text-sm"
      >
        Disconnect
      </button>
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
