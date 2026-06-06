import React, { useState, useEffect } from 'react';

// --- BuyIn Modal ---

interface BuyInModalProps {
  isOpen: boolean;
  playerSessionId: string | null;
  onConfirm: (playerSessionId: string, amount: number) => void;
  onCancel: () => void;
}

export const BuyInModal: React.FC<BuyInModalProps> = ({
  isOpen,
  playerSessionId,
  onConfirm,
  onCancel,
}) => {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (isOpen) setAmount('');
  }, [isOpen]);

  if (!isOpen || !playerSessionId) return null;

  const handleConfirm = () => {
    const parsed = parseFloat(amount);
    if (!isNaN(parsed) && parsed > 0) {
      onConfirm(playerSessionId, parsed);
      setAmount('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-sm mx-0 sm:mx-4 p-3 sm:p-6">
        <h3 className="mb-3 sm:mb-4 text-base sm:text-xl">Add Buy-in</h3>
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-nb py-2 sm:py-3"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirm}
              className="btn-nb-success text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Add
            </button>
            <button
              onClick={() => {
                setAmount('');
                onCancel();
              }}
              className="btn-nb text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Edit BuyIn Modal ---

interface EditBuyInModalProps {
  isOpen: boolean;
  data: { playerSessionId: string; buyInId: string } | null;
  currentAmount: string;
  playerName: string;
  onUpdate: (playerSessionId: string, buyInId: string, amount: number) => void;
  onDelete: (playerSessionId: string, buyInId: string) => void;
  onCancel: () => void;
}

export const EditBuyInModal: React.FC<EditBuyInModalProps> = ({
  isOpen,
  data,
  currentAmount,
  playerName,
  onUpdate,
  onDelete,
  onCancel,
}) => {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (isOpen) setAmount(currentAmount);
  }, [isOpen, currentAmount]);

  if (!isOpen || !data) return null;

  const handleUpdate = () => {
    const parsed = parseFloat(amount);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdate(data.playerSessionId, data.buyInId, parsed);
    }
  };

  const handleDelete = () => {
    onDelete(data.playerSessionId, data.buyInId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-sm mx-0 sm:mx-4 p-3 sm:p-6">
        <h3 className="mb-3 sm:mb-4 text-base sm:text-xl">Edit Buy-in</h3>
        {playerName && (
          <p className="text-xs sm:text-sm text-theme-secondary mb-3 sm:mb-4">
            Player: {playerName}
          </p>
        )}
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-nb py-2 sm:py-3"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleUpdate}
              className="btn-nb-success text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Update
            </button>
            <button
              onClick={handleDelete}
              className="btn-nb-danger text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Delete
            </button>
            <button
              onClick={onCancel}
              className="btn-nb text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- CashOut Modal ---

interface CashOutModalProps {
  isOpen: boolean;
  playerSessionId: string | null;
  currentAmount: string;
  playerName: string;
  isEditing: boolean;
  onConfirm: (playerSessionId: string, amount: number) => void;
  onCancel: () => void;
}

export const CashOutModal: React.FC<CashOutModalProps> = ({
  isOpen,
  playerSessionId,
  currentAmount,
  playerName,
  isEditing,
  onConfirm,
  onCancel,
}) => {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (isOpen) setAmount(currentAmount);
  }, [isOpen, currentAmount]);

  if (!isOpen || !playerSessionId) return null;

  const handleConfirm = () => {
    const parsed = parseFloat(amount);
    if (!isNaN(parsed) && parsed >= 0) {
      onConfirm(playerSessionId, parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-sm mx-0 sm:mx-4 p-3 sm:p-6">
        <h3 className="mb-3 sm:mb-4 text-base sm:text-xl">
          {isEditing ? 'Edit Cash Out' : 'Cash Out'}
        </h3>
        {playerName && (
          <p className="text-xs sm:text-sm text-theme-secondary mb-3 sm:mb-4">
            Player: {playerName}
          </p>
        )}
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-nb py-2 sm:py-3"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleConfirm}
              className="btn-nb-success text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              {isEditing ? 'Update' : 'Confirm'}
            </button>
            <button
              onClick={onCancel}
              className="btn-nb text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- RemovePlayer Modal ---

interface RemovePlayerModalProps {
  isOpen: boolean;
  playerSessionId: string | null;
  playerName: string;
  onConfirm: (playerSessionId: string) => void;
  onCancel: () => void;
}

export const RemovePlayerModal: React.FC<RemovePlayerModalProps> = ({
  isOpen,
  playerSessionId,
  playerName,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen || !playerSessionId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-sm mx-0 sm:mx-4 p-3 sm:p-6">
        <h3 className="mb-3 sm:mb-4 text-base sm:text-xl">Remove Player</h3>
        <p className="text-xs sm:text-sm text-theme-secondary mb-3 sm:mb-4">
          Are you sure you want to remove{' '}
          <span className="font-semibold text-theme-text">{playerName}</span>{' '}
          from the session? Their buy-ins and cash-out will be lost.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              onConfirm(playerSessionId);
              onCancel();
            }}
            className="btn-nb-danger text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
          >
            Remove
          </button>
          <button
            onClick={onCancel}
            className="btn-nb text-sm py-2 px-4 sm:text-base sm:py-3 sm:px-6"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
