import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/useAppSelector';
import {
  setShowImportModal,
  importPlayers,
  importSessions,
  markUnsyncedChanges,
  setImportedSpreadsheetId,
} from '../store';
import { parseSpreadsheetData, generateImportReport, generateErrorLog } from '../utils/csvImport';
import { googleDriveService } from '../services/googleDrive';
import { openGooglePicker } from '../services/googlePicker';
import type { CSVImportResult } from '../types';

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';

const CSVImportModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showImportModal, isGoogleConnected } = useAppSelector(state => state.ui);

  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setIsProcessing(false);
    setSelectedFileName(null);
    setSelectedSpreadsheetId(null);
    setImportResult(null);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    dispatch(setShowImportModal(false));
  };

  const handleSelectFromDrive = async () => {
    if (!isGoogleConnected) {
      setError('Please connect to Google Drive first');
      return;
    }

    const accessToken = googleDriveService.getAccessToken();
    if (!accessToken) {
      setError('Not authenticated. Please reconnect to Google Drive.');
      return;
    }

    if (!GOOGLE_API_KEY) {
      setError('Google API key not configured. Please add VITE_GOOGLE_API_KEY to your environment.');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setImportResult(null);

      const selectedFile = await openGooglePicker(accessToken, GOOGLE_API_KEY);

      if (!selectedFile) {
        // User cancelled
        setIsProcessing(false);
        return;
      }

      setSelectedFileName(selectedFile.name);
      setSelectedSpreadsheetId(selectedFile.id);

      // Fetch the spreadsheet data
      const spreadsheetData = await googleDriveService.getSpreadsheetData(selectedFile.id);

      // Parse the data
      const result = parseSpreadsheetData(spreadsheetData);
      const report = generateImportReport(result);

      setImportResult(report);

      // Store the full data for import
      (window as any).__csvImportData = result;
    } catch (err) {
      console.error('Error selecting file from Drive:', err);
      setError(String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    const data = (window as any).__csvImportData;
    if (!data) return;

    dispatch(importPlayers(data.players));
    dispatch(importSessions({
      sessions: data.sessions,
      playerSessions: data.playerSessions,
    }));
    dispatch(markUnsyncedChanges());

    // Save the spreadsheet ID so we can write back to it later
    if (selectedSpreadsheetId) {
      dispatch(setImportedSpreadsheetId(selectedSpreadsheetId));
      googleDriveService.saveSpreadsheetId(selectedSpreadsheetId);
    }

    // Clean up
    delete (window as any).__csvImportData;
    handleClose();
  };

  const handleDownloadErrorLog = () => {
    if (!importResult) return;

    const log = generateErrorLog(importResult.errors, importResult.warnings);
    const blob = new Blob([log], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!showImportModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="card-nb max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2>Link Google Sheet</h2>
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center border-3 hover:translate-x-[2px] hover:translate-y-[2px] font-bold text-xl"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-bg-card)',
              boxShadow: '2px 2px 0px 0px var(--color-shadow)',
            }}
          >
            X
          </button>
        </div>

        {!isGoogleConnected && (
          <div className="p-4 bg-nb-orange bg-opacity-20 border-3 border-nb-orange mb-4">
            <p className="font-semibold">Google Drive Not Connected</p>
            <p className="text-sm mt-1">
              Please connect to Google Drive using the button in the navigation bar before linking a sheet.
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-nb-red bg-opacity-10 border-3 border-nb-red mb-4">
            <p className="font-semibold text-nb-red">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {!importResult && !isProcessing && (
          <>
            <div className="text-center py-8">
              <div className="text-6xl mb-4">📊</div>
              <button
                onClick={handleSelectFromDrive}
                disabled={!isGoogleConnected || isProcessing}
                className={`btn-nb-primary ${!isGoogleConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Select Google Sheet
              </button>
              <p className="text-sm text-theme-secondary mt-4">
                Choose a Google Sheet to link for tracking your poker sessions
              </p>
            </div>

            <div className="mt-6 p-4 border-3" style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
              <h3 className="text-lg font-semibold mb-2">Expected Spreadsheet Format</h3>
              <div className="overflow-x-auto">
                <table className="text-xs border-2 w-full" style={{ borderColor: 'var(--color-border)' }}>
                  <thead>
                    <tr className="bg-nb-black text-nb-white">
                      <th className="p-2 border-r border-gray-600">Players</th>
                      <th className="p-2 border-r border-gray-600">1/2/2025</th>
                      <th className="p-2 border-r border-gray-600">1/8/2025</th>
                      <th className="p-2">...</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-theme">
                      <td className="p-2 border-r border-theme font-semibold">Zach</td>
                      <td className="p-2 border-r border-theme text-nb-red">-$30.00</td>
                      <td className="p-2 border-r border-theme text-nb-red">-$26.50</td>
                      <td className="p-2">...</td>
                    </tr>
                    <tr className="border-t border-theme">
                      <td className="p-2 border-r border-theme font-semibold">Jack V</td>
                      <td className="p-2 border-r border-theme text-nb-green">$41.00</td>
                      <td className="p-2 border-r border-theme text-nb-green">$25.75</td>
                      <td className="p-2">...</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul className="text-sm mt-3 space-y-1">
                <li>First row: "Players" followed by date columns (MM/DD/YYYY)</li>
                <li>Subsequent rows: Player name followed by profit/loss values</li>
                <li>Supports both $XX.XX and plain numbers</li>
                <li>Empty cells indicate player did not participate</li>
              </ul>
            </div>
          </>
        )}

        {isProcessing && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-theme border-t-nb-yellow mx-auto mb-4"></div>
            <p className="font-semibold">
              {selectedFileName ? `Processing "${selectedFileName}"...` : 'Selecting file...'}
            </p>
          </div>
        )}

        {importResult && !isProcessing && (
          <div>
            {selectedFileName && (
              <div className="mb-4 p-3 border-3 border-theme" style={{ backgroundColor: 'var(--color-bg-card)' }}>
                <span className="font-semibold">Selected: </span>
                {selectedFileName}
              </div>
            )}

            {importResult.errors.length > 0 && (
              <div className="mb-4 p-4 bg-nb-red bg-opacity-10 border-3 border-nb-red">
                <h3 className="font-semibold text-nb-red mb-2">
                  Errors ({importResult.errors.length})
                </h3>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>
                      <span className="font-mono">Line {err.line}:</span> {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importResult.warnings.length > 0 && (
              <div className="mb-4 p-4 bg-nb-orange bg-opacity-10 border-3 border-nb-orange">
                <h3 className="font-semibold text-nb-orange mb-2">
                  Warnings ({importResult.warnings.length})
                </h3>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {importResult.warnings.map((warning, i) => (
                    <li key={i}>
                      <span className="font-mono">{warning.sessionDate}:</span> {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importResult.success && (
              <div className="mb-4 p-4 bg-nb-green bg-opacity-10 border-3 border-nb-green">
                <h3 className="font-semibold text-nb-green mb-2">Data Found</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-semibold">Sessions:</span> {importResult.sessionsImported}
                  </div>
                  <div>
                    <span className="font-semibold">Players:</span> {importResult.playersImported}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 mt-6">
              {importResult.success && (
                <button
                  onClick={handleConfirmImport}
                  className="btn-nb-success"
                >
                  Link Sheet
                </button>
              )}

              {(importResult.errors.length > 0 || importResult.warnings.length > 0) && (
                <button
                  onClick={handleDownloadErrorLog}
                  className="btn-nb"
                >
                  Download Error Log
                </button>
              )}

              <button
                onClick={resetState}
                className="btn-nb"
              >
                Select Different File
              </button>

              <button
                onClick={handleClose}
                className="btn-nb"
                style={{ backgroundColor: 'var(--color-bg-card)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CSVImportModal;
