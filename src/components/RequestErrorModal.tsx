import React from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/useAppSelector';
import { hideRequestErrorModal } from '../store';

const RequestErrorModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showRequestErrorModal, requestError } = useAppSelector(
    (state) => state.ui,
  );

  if (!showRequestErrorModal) return null;

  const handleClose = () => {
    dispatch(hideRequestErrorModal());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb w-full max-w-sm mx-0 sm:mx-4 p-3 sm:p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Request Error</h2>
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center border-3 hover:translate-x-[2px] hover:translate-y-[2px] font-bold text-xl"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-card)',
              boxShadow: '2px 2px 0px 0px var(--color-shadow)',
            }}
            aria-label="Close"
          >
            X
          </button>
        </div>

        <div className="p-4 bg-nb-red bg-opacity-10 border-3 border-nb-red mb-4">
          <p className="font-semibold text-nb-red">Google API request failed</p>
          <p className="text-sm mt-1">{requestError}</p>
        </div>

        <button onClick={handleClose} className="btn-nb-primary w-full">
          OK
        </button>
      </div>
    </div>
  );
};

export default RequestErrorModal;