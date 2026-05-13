import React from 'react';

interface GoogleAuthButtonProps {
  isInitializing: boolean;
  isGoogleConnected: boolean;
  googleUser: { picture: string; name: string; email: string } | null;
  needsReauth: boolean;
  isAutoReconnecting: boolean;
  showDropdown: boolean;
  onToggleDropdown: () => void;
  onLogin: () => void;
  onLoginWithHint: () => void;
  onLogout: () => void;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  isInitializing,
  isGoogleConnected,
  googleUser,
  needsReauth,
  isAutoReconnecting,
  showDropdown,
  onToggleDropdown,
  onLogin,
  onLoginWithHint,
  onLogout,
}) => {
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

  if (needsReauth && googleUser) {
    return (
      <button
        onClick={() => onLoginWithHint()}
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
          onClick={onToggleDropdown}
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
            <div className="fixed inset-0 z-40" onClick={onToggleDropdown} />
            <div
              className="absolute right-0 mt-2 w-64 border-3 z-50"
              style={{
                backgroundColor: 'var(--color-bg-card)',
                borderColor: 'var(--color-border)',
                boxShadow: '4px 4px 0px 0px var(--color-shadow)',
              }}
            >
              <div
                className="p-4 border-b-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
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
                    <p className="text-sm text-theme-secondary truncate">
                      {googleUser.email}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-2">
                <button
                  onClick={onLogout}
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
    <button onClick={onLogin} className="btn-nb bg-nb-green text-sm">
      Connect Google Drive
    </button>
  );
};

export default GoogleAuthButton;
