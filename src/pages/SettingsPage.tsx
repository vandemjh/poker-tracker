import React, { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../hooks/useAppSelector';
import { setDefaultBuyIn } from '../store';

const SettingsPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const { settings } = useAppSelector(state => state.ui);
  const [buyInInput, setBuyInInput] = useState(settings.defaultBuyIn.toString());

  const handleSaveBuyIn = () => {
    const value = parseFloat(buyInInput);
    if (!isNaN(value) && value > 0) {
      dispatch(setDefaultBuyIn(value));
    }
  };

  const handleBuyInChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBuyInInput(e.target.value);
  };

  const handleBuyInBlur = () => {
    handleSaveBuyIn();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveBuyIn();
    }
  };

  return (
    <div className="space-y-6">
      <div className="card-nb">
        <h2 className="mb-6">Settings</h2>

        <div className="space-y-6">
          {/* Default Buy-in Setting */}
          <div>
            <label className="block text-sm font-semibold mb-2">Default Buy-in Amount</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 font-semibold">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={buyInInput}
                  onChange={handleBuyInChange}
                  onBlur={handleBuyInBlur}
                  onKeyDown={handleKeyDown}
                  className="input-nb pl-8 w-32"
                />
              </div>
              <span className="text-sm text-theme-secondary">
                This will be the default buy-in amount when adding players to a session.
              </span>
            </div>
          </div>

          {/* Current Value Display */}
          <div className="p-4 border-3" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
            <div className="text-sm text-theme-secondary">Current default buy-in:</div>
            <div className="text-2xl font-bold">${settings.defaultBuyIn.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
