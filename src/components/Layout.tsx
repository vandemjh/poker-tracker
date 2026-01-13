import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import { toggleImportModal } from '../store';
import GoogleAuthButton from './GoogleAuthButton';
import SyncStatusIndicator from './SyncStatusIndicator';

const Layout: React.FC = () => {
  const dispatch = useAppDispatch();
  useAppSelector(state => state.ui);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 font-semibold border-3 border-nb-black transition-all duration-100 ${
      isActive
        ? 'bg-nb-yellow shadow-nb-active translate-x-[4px] translate-y-[4px]'
        : 'bg-nb-white shadow-nb hover:shadow-nb-hover hover:translate-x-[2px] hover:translate-y-[2px]'
    }`;

  return (
    <div className="min-h-screen bg-nb-cream">
      <header className="bg-nb-white border-b-4 border-nb-black">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl md:text-3xl font-bold">Poker Tracker</h1>
              <SyncStatusIndicator />
            </div>

            <nav className="flex flex-wrap items-center gap-3">
              <NavLink to="/" className={navLinkClass}>
                Results
              </NavLink>
              <NavLink to="/play" className={navLinkClass}>
                Play
              </NavLink>
              <button
                onClick={() => dispatch(toggleImportModal())}
                className="btn-nb bg-nb-blue text-nb-white"
              >
                Import CSV
              </button>
              <GoogleAuthButton />
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="bg-nb-white border-t-4 border-nb-black mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-sm">
          <p>Poker Tracker - Track your poker sessions</p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
