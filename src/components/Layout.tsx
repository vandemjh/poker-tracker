import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import { toggleImportModal } from '../store';
import GoogleAuthButton from './GoogleAuthButton';
import SyncStatusIndicator from './SyncStatusIndicator';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../hooks/useTheme';

const Layout: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { activeSessionId } = useAppSelector(state => state.sessions);

  // Initialize theme
  useTheme();

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
                className="text-2xl md:text-3xl font-bold hover:text-nb-blue transition-colors text-left"
              >
                Poker Tracker
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
