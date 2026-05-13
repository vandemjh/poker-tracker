export function extractSpreadsheetIdFromUrl(url: string): string | null {
  const trimmed = url.trim();

  if (!trimmed) return null;

  // If it's already a raw ID (alphanumeric with hyphens/underscores, 20+ chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  // Match spreadsheet ID from Google Sheets URL patterns:
  // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
  // https://docs.google.com/spreadsheets/u/0/d/SPREADSHEET_ID/edit
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
