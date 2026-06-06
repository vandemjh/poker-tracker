import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import type { AddPlayerToSessionForm } from '../../types';

interface AddPlayerModalProps {
  isOpen: boolean;
  sortedAllPlayers: Array<{ id: string; name: string }>;
  activePlayerIds: Set<string>;
  playerGameCounts: Map<string, number>;
  defaultBuyIn: number;
  onAddPlayer: (data: AddPlayerToSessionForm) => void;
  onClose: () => void;
}

export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({
  isOpen,
  sortedAllPlayers,
  activePlayerIds,
  playerGameCounts,
  defaultBuyIn,
  onAddPlayer,
  onClose,
}) => {
  const {
    register: registerPlayer,
    handleSubmit: handlePlayerSubmit,
    reset: resetPlayer,
    watch: watchPlayer,
    setValue: setPlayerValue,
  } = useForm<AddPlayerToSessionForm>({
    defaultValues: {
      playerId: '',
      buyInAmount: defaultBuyIn,
    },
  });

  const watchPlayerId = watchPlayer('playerId');

  useEffect(() => {
    if (isOpen) {
      setPlayerValue('buyInAmount', defaultBuyIn);
      setPlayerValue('playerId', '');
    }
  }, [isOpen, defaultBuyIn, setPlayerValue]);

  if (!isOpen) return null;

  const handleFormSubmit = (data: AddPlayerToSessionForm) => {
    onAddPlayer(data);
    resetPlayer();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-md mx-0 sm:mx-4 p-3 sm:p-6">
        <div className="flex justify-between items-center mb-3 sm:mb-4">
          <h3 className="text-base sm:text-xl">Add Player</h3>
          <button
            onClick={() => {
              onClose();
              resetPlayer();
            }}
            className="w-8 h-8 flex items-center justify-center border-2 font-bold"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-card)',
            }}
          >
            X
          </button>
        </div>
        <form
          onSubmit={handlePlayerSubmit(handleFormSubmit)}
          className="space-y-3 sm:space-y-4"
        >
          <div>
            <label className="block text-sm font-semibold mb-1">Player</label>
            <select
              {...registerPlayer('playerId')}
              className="select-nb py-2 sm:py-3"
              required
            >
              <option value="">Select a player</option>
              {sortedAllPlayers.map((p) => {
                const gameCount = playerGameCounts.get(p.id) || 0;
                const alreadyInSession = activePlayerIds.has(p.id);
                return (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={alreadyInSession}
                    style={{
                      backgroundColor: alreadyInSession ? '#f3f4f6' : 'inherit',
                      color: alreadyInSession ? '#9ca3af' : 'inherit',
                    }}
                  >
                    {p.name} ({gameCount} {gameCount === 1 ? 'game' : 'games'})
                    {alreadyInSession ? ' — In session' : ''}
                  </option>
                );
              })}
              <option value="new">+ New Player</option>
            </select>
          </div>
          {watchPlayerId === 'new' && (
            <div>
              <label className="block text-sm font-semibold mb-1">
                New Player Name
              </label>
              <input
                {...registerPlayer('newPlayerName')}
                className="input-nb py-2 sm:py-3"
                placeholder="Enter name"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold mb-1">
              Initial Buy-in
            </label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              {...registerPlayer('buyInAmount', { valueAsNumber: true })}
              className="input-nb py-2 sm:py-3"
              required
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="btn-nb-success text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Add Player
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                resetPlayer();
              }}
              className="btn-nb text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
