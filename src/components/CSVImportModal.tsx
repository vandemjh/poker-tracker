import React, { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/useAppSelector';
import {
  setShowImportModal,
  importPlayers,
  importSessions,
  markUnsyncedChanges,
} from '../store';
import { processCSVFile, generateImportReport, generateErrorLog } from '../utils/csvImport';
import type { CSVImportResult } from '../types';

const CSVImportModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showImportModal } = useAppSelector(state => state.ui);

  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);

  const resetState = () => {
    setFile(null);
    setIsProcessing(false);
    setImportResult(null);
  };

  const handleClose = () => {
    resetState();
    dispatch(setShowImportModal(false));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'text/csv') {
      setFile(files[0]);
      processFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFile(files[0]);
      processFile(files[0]);
    }
  };

  const processFile = async (selectedFile: File) => {
    setIsProcessing(true);
    setImportResult(null);

    try {
      const result = await processCSVFile(selectedFile);
      const report = generateImportReport(result);

      setImportResult(report);

      // Store the full data for import
      (window as any).__csvImportData = result;
    } catch (error) {
      setImportResult({
        success: false,
        sessionsImported: 0,
        playersImported: 0,
        errors: [{ line: 0, message: String(error) }],
        warnings: [],
      });
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
    a.download = 'csv-import-errors.txt';
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
          <h2>Import CSV</h2>
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center border-3 border-nb-black bg-nb-white shadow-nb-sm hover:shadow-nb-active hover:translate-x-[2px] hover:translate-y-[2px] font-bold text-xl"
          >
            X
          </button>
        </div>

        {!file && !importResult && (
          <>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-4 border-dashed p-8 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-nb-blue bg-nb-blue bg-opacity-10'
                  : 'border-nb-black hover:border-nb-blue'
              }`}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                id="csv-file-input"
              />
              <label htmlFor="csv-file-input" className="cursor-pointer">
                <div className="text-4xl mb-4">📁</div>
                <p className="font-semibold mb-2">Drop CSV file here or click to browse</p>
                <p className="text-sm text-gray-600">
                  Supports poker session data in standard format
                </p>
              </label>
            </div>

            <div className="mt-6 p-4 bg-gray-100 border-3 border-nb-black">
              <h3 className="text-lg font-semibold mb-2">Expected CSV Format</h3>
              <pre className="text-xs overflow-x-auto bg-nb-white p-3 border-2 border-nb-black">
{`Players,1/2/2025,1/8/2025,...
Zach,-$30.00,-26.50,...
Jack V,$41.00,25.75,...
Jack L,$61.50,34.25,...`}
              </pre>
              <ul className="text-sm mt-3 space-y-1">
                <li>First row: "Players" followed by date columns (MM/DD/YYYY)</li>
                <li>Subsequent rows: Player name followed by profit/loss values</li>
                <li>Supports both $XX.XX and XX.XX formats</li>
                <li>Empty cells indicate player did not participate</li>
              </ul>
            </div>
          </>
        )}

        {isProcessing && (
          <div className="text-center py-8">
            <div className="animate-spin w-12 h-12 border-4 border-nb-black border-t-nb-yellow mx-auto mb-4"></div>
            <p className="font-semibold">Processing CSV file...</p>
          </div>
        )}

        {importResult && !isProcessing && (
          <div>
            {importResult.errors.length > 0 && (
              <div className="mb-4 p-4 bg-nb-red bg-opacity-10 border-3 border-nb-red">
                <h3 className="font-semibold text-nb-red mb-2">
                  Errors ({importResult.errors.length})
                </h3>
                <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                  {importResult.errors.map((error, i) => (
                    <li key={i}>
                      <span className="font-mono">Line {error.line}:</span> {error.message}
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
                <h3 className="font-semibold text-nb-green mb-2">Import Preview</h3>
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
                  Confirm Import
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
                Try Another File
              </button>

              <button
                onClick={handleClose}
                className="btn-nb bg-gray-200"
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
