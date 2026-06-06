import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { getLocalDateString, parseLocalDate } from '../../utils/statistics';
import type { CreateSessionForm, Session } from '../../types';

interface NoSessionViewProps {
  onStartSession: (data: CreateSessionForm) => void;
  onResumeSession: (sessionId: string) => void;
  onResumeEndedSession: (sessionId: string) => void;
  lastCompletedSession: Session | undefined;
  incompleteSessions: Session[];
  isGoogleConnected: boolean;
}

export const NoSessionView: React.FC<NoSessionViewProps> = ({
  onStartSession,
  onResumeSession,
  onResumeEndedSession,
  lastCompletedSession,
  incompleteSessions,
  isGoogleConnected,
}) => {
  const [showOptionalFields, setShowOptionalFields] = useState(false);

  const {
    register: registerSession,
    handleSubmit: handleSessionSubmit,
    reset: resetSession,
  } = useForm<CreateSessionForm>({
    defaultValues: {
      date: getLocalDateString(),
      gameType: 'cash',
    },
  });

  const onSubmit = (data: CreateSessionForm) => {
    onStartSession(data);
    resetSession();
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {!isGoogleConnected && (
        <div className="card-nb bg-nb-orange p-3 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="text-3xl md:text-4xl">📊</div>
            <div>
              <h3 className="text-base md:text-lg text-nb-black">
                Local Mode — No Google Sync
              </h3>
              <p className="text-xs md:text-sm text-nb-black opacity-80">
                Sessions are saved in this browser only. Connect to Google Drive
                to sync across devices and link a spreadsheet.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card-nb md:p-6 p-3">
        <h2 className="mb-4 md:mb-6 text-lg md:text-2xl">Start New Session</h2>
        <form
          onSubmit={handleSessionSubmit(onSubmit)}
          className="space-y-3 md:space-y-4"
        >
          <div className="space-y-3 md:space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Date</label>
              <input
                type="date"
                {...registerSession('date')}
                className="input-nb py-2 md:py-3"
                required
              />
            </div>

            <button
              type="button"
              onClick={() => setShowOptionalFields(!showOptionalFields)}
              className="flex items-center gap-2 text-sm font-semibold text-theme-secondary hover:text-theme transition-colors"
            >
              <span
                className={`transform transition-transform ${showOptionalFields ? 'rotate-90' : ''}`}
              >
                ▶
              </span>
              Optional Details
            </button>

            {showOptionalFields && (
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 pl-4 border-l-3"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div>
                  <label className="block text-sm font-semibold mb-1">
                    Session Name
                  </label>
                  <input
                    {...registerSession('name')}
                    className="input-nb py-2 md:py-3"
                    placeholder="e.g., Friday Night Game"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">
                    Stakes
                  </label>
                  <input
                    {...registerSession('stakes')}
                    className="input-nb py-2 md:py-3"
                    placeholder="e.g., $1/$2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold mb-1">
                    Location
                  </label>
                  <input
                    {...registerSession('location')}
                    className="input-nb py-2 md:py-3"
                    placeholder="e.g., John's House"
                  />
                </div>
              </div>
            )}
          </div>
          <button
            type="submit"
            className="btn-nb-primary text-sm py-2 px-4 md:text-base md:py-3 md:px-6"
          >
            Start Session
          </button>
        </form>
      </div>

      {incompleteSessions.length > 0 && (
        <div className="card-nb md:p-6 p-3">
          <h2 className="mb-3 md:mb-4 text-base md:text-2xl">Resume Session</h2>
          <div className="space-y-2">
            {incompleteSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => onResumeSession(session.id)}
                className="w-full text-left p-3 md:p-4 border-3 hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                style={{
                  backgroundColor: 'var(--color-bg-card)',
                  borderColor: 'var(--color-border)',
                  boxShadow: '2px 2px 0px 0px var(--color-shadow)',
                }}
              >
                <div className="font-semibold text-sm md:text-base">
                  {session.name ||
                    parseLocalDate(session.date).toLocaleDateString()}
                </div>
                <div className="text-xs md:text-sm text-theme-secondary">
                  {session.stakes && `${session.stakes}`}
                  {session.stakes && session.location && ' @ '}
                  {!session.stakes && session.location && '@ '}
                  {session.location}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {lastCompletedSession && (
        <div className="card-nb md:p-6 p-3 bg-nb-orange bg-opacity-20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
            <div>
              <h3 className="font-semibold text-sm md:text-base text-nb-black dark:text-theme">
                Accidentally ended a game?
              </h3>
              <p className="text-xs md:text-sm text-theme-secondary break-words">
                Resume "
                {lastCompletedSession.name ||
                  parseLocalDate(
                    lastCompletedSession.date,
                  ).toLocaleDateString()}
                " (ended{' '}
                {new Date(lastCompletedSession.updatedAt).toLocaleString()})
              </p>
            </div>
            <button
              onClick={() => onResumeEndedSession(lastCompletedSession.id)}
              className="btn-nb bg-nb-orange text-nb-black whitespace-nowrap text-sm py-2 px-4 md:text-base md:py-3 md:px-6"
            >
              Resume Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
