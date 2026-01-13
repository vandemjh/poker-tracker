# Poker Tracker Application - Technical Requirements Document

## 1. Executive Summary

A web-based poker tracker application that enables users to track poker game sessions, player statistics, and financial records. The application supports CSV import for historical data, real-time game tracking, and comprehensive statistical analysis.

---

## 2. System Overview

### 2.1 Purpose
Enable poker game organizers to:
- Track player buy-ins and cash-outs across multiple sessions
- Import historical game data from CSV files
- View player statistics and performance trends
- Manage live game sessions with real-time balance tracking

### 2.2 Target Users
- Home game organizers tracking buy-ins and cash-outs during live games
- Players reviewing their performance history across multiple sessions

---

## 3. Functional Requirements

### 3.1 Data Import Module

#### 3.1.1 CSV Import
**Requirement**: Support importing player results from CSV files

**Input Format**:
```
Players,1/2/2025,1/8/2025,Total,Average,Other Stats...
Zach,-$30.00,-26.50,-56.50,-28.25,...
Jack V,$41.00,25.75,66.75,33.38,...
Jack L,$61.50,34.25,95.75,47.88,...
```

**Specifications**:
- First row: `Players` column header followed by date columns (MM/DD/YYYY format)
- All columns after date columns should be ignored (legacy statistics from spreadsheet)
- Date column detection: Parse columns as dates; stop processing when a column cannot be parsed as a date
- Subsequent rows: Player name followed by profit/loss values
- Support both `$XX.XX` and `XX.XX` formats (with or without dollar signs)
- Handle empty cells (player did not participate in that session)
- Validate date formats and numeric values
- Provide error feedback for malformed data

**Data Validation**:
- Ensure sum of all player results equals zero for each session (zero-sum game)
- Flag sessions with mismatched totals
- Warn on duplicate player names within same session

**Data Processing**:
- Automatically sort sessions chronologically by date
- Handle duplicate dates by preserving import order

**Error Handling**:
- Display line-by-line import errors
- Allow partial import with error report
- Provide downloadable error log

### 3.2 Results Module

#### 3.2.1 Player Statistics Dashboard

**Requirement**: Display comprehensive statistics for each player

**Core Metrics**:
- **Total Profit/Loss**: Cumulative earnings across all sessions
- **Session Count**: Number of games played
- **Win Rate**: Percentage of profitable sessions
- **Average Win/Loss**: Mean profit or loss per session
- **Best Session**: Largest single-session win
- **Worst Session**: Largest single-session loss
- **Variance**: Statistical measure of result volatility (σ²)
- **Standard Deviation**: Square root of variance (σ)
- **ROI**: Return on investment (total profit / total buy-ins)

**Display Options**:
- Sortable table by any metric
- Filterable by date range
- Expandable rows showing session-by-session breakdown
- Export statistics to CSV

#### 3.2.2 Balance Chart Visualization

**Requirement**: Interactive line chart showing player balance progression over time

**Features**:
- X-axis: Date/session chronology
- Y-axis: Cumulative balance
- Individual line for each player
- Toggle visibility for each player (checkbox or click legend)
- Hover tooltips showing exact values and dates
- Color-coded lines with legend
- Zoom and pan functionality
- Option to display absolute balances or percentage gains

**Chart Library Recommendation**: Chart.js, Recharts, or D3.js

### 3.3 Play Module (Live Game Management)

#### 3.3.1 Game Session Creation

**Requirement**: Start and manage live poker games

**Session Setup**:
- Session name (optional, defaults to date/time)
- Date and time (defaults to current)
- Game type (cash game, tournament)
- Stakes (e.g., "$1/$2", "$2/$5")
- Location (optional)

#### 3.3.2 Player Management

**Requirement**: Add players and track buy-ins during active session

**Add Player**:
- Select from existing player list or add new player
- Enter initial buy-in amount
- Timestamp of entry

**Add Buy-in**:
- Select player from active session
- Enter additional buy-in amount
- Timestamp of buy-in
- Display total invested for player

**Player Display**:
- List of active players
- Total buy-in per player
- Cash-out amount (entered at session end)
- Current profit/loss (cash-out minus buy-ins)

#### 3.3.3 Table Total Calculator

**Requirement**: Real-time calculation of total money on table

**Display**:
- Sum of all buy-ins
- Sum of all cash-outs (if session ended)
- Remaining balance (buy-ins minus cash-outs)
- Alert if totals don't match (zero-sum validation)

**Features**:
- Live updating as buy-ins/cash-outs are added
- Visual indicator when balanced (green) or unbalanced (red)
- Breakdown by player

#### 3.3.4 Session Completion

**Requirement**: Finalize game session and record results

**End Session Flow**:
1. Enter cash-out amount for each player
2. System calculates profit/loss (cash-out minus buy-ins)
3. Validate zero-sum (total profit/loss = $0)
4. Save session to Google Sheet
5. Update player statistics
6. Generate session summary report

---

## 4. Data Model

### 4.1 Core Entities

#### Player
```typescript
interface Player {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Session
```typescript
interface Session {
  id: string;
  name?: string;
  date: Date;
  gameType: 'cash' | 'tournament';
  stakes?: string;
  location?: string;
  isComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

#### PlayerSession (Join Table)
```typescript
interface PlayerSession {
  id: string;
  playerId: string;
  sessionId: string;
  buyIns: BuyIn[];
  cashOut?: number;
  netResult: number;
  timestamp: Date;
}
```

#### BuyIn
```typescript
interface BuyIn {
  id: string;
  amount: number;
  timestamp: Date;
}
```

### 4.2 Calculated Statistics

Statistics should be computed on-demand rather than stored:

```typescript
interface PlayerStatistics {
  playerId: string;
  totalProfit: number;
  sessionCount: number;
  winRate: number;
  avgWinLoss: number;
  bestSession: number;
  worstSession: number;
  variance: number;
  standardDeviation: number;
  roi: number;
  balanceHistory: Array<{ date: Date; balance: number }>;
}
```

---

## 5. Technical Stack Recommendations

### 5.1 Frontend
- **Framework**: React with TypeScript and Redux (no Next.js)
- **State Management**: Redux Toolkit
- **Design System**: Neo-brutalist design (https://www.neobrutalism.dev/)
  - Bold borders (typically 3-5px black)
  - High contrast colors
  - Shadows for depth (offset shadows, not blur)
  - Simple geometric shapes
  - Expressive typography
  - Minimal animations
- **Charting**: Chart.js or Recharts
- **UI Styling**: Tailwind CSS with custom Neo-brutalist utilities
- **Forms**: React Hook Form
- **CSV Parsing**: PapaParse

### 5.2 Backend & Storage

**Google Drive Integration**:
- Use Google Drive API for data persistence
- Store application data as JSON file in user's Google Drive
- OAuth 2.0 authentication flow for Drive access
- Read/write permissions only for app-created files
- Automatic sync on data changes

**Implementation Details**:
- Use `@react-oauth/google` for authentication
- Google Drive API v3 for file operations
- Store data in `/appDataFolder` (hidden folder, only accessible by app)
- Fallback to local storage if offline
- Data structure: Single JSON file with schema version for migrations

**File Structure**:
```json
{
  "version": "1.0",
  "players": [...],
  "sessions": [...],
  "playerSessions": [...],
  "lastModified": "2025-01-12T10:30:00Z"
}
```

### 5.3 Deployment
- **Hosting**: GitHub Pages
- **Build**: Create React App or Vite build process
- **CI/CD**: GitHub Actions for automatic deployment on push to main branch
- **Domain**: Custom domain or `username.github.io/poker-tracker`

---

## 6. Non-Functional Requirements

### 6.1 Performance
- CSV import: Handle files up to 500 sessions
- Chart rendering: Smooth with 20+ data points per player
- Session list: Display all without pagination (expected max ~100 sessions)
- Google Drive sync: Debounced saves (3 second delay after last change)

### 6.2 Usability
- Mobile-responsive design (Neo-brutalist responsive patterns)
- Simple navigation - maximum 2 main views (Results and Play)
- Fast data entry during live games
- Clear visual feedback for all actions

### 6.3 Data Integrity
- Automatic validation of zero-sum games
- Google Drive automatic sync and backup
- Imported historical data is read-only (cannot be edited)
- Manual session entries can be edited/deleted before sync



## 7. User Interface Mockup Structure

### 7.1 Navigation
- **Results** (landing page - statistics and charts)
- **Play** (live game management)
- **Import CSV** (modal/overlay for CSV upload)
- **Google Drive** (connect/disconnect, sync status indicator)

### 7.2 Results Page Layout
```
+----------------------------------------------------------+
| [Date Range Filter] [Player Filter] [Export CSV]         |
+----------------------------------------------------------+
|                                                           |
|  Player Balance Chart                                    |
|  [Toggle players: □ Zach  □ Jack V  ☑ Jack L ...]      |
|                                                           |
+----------------------------------------------------------+
|                                                           |
|  Player Statistics Table                                 |
|  Name     | Total P/L | Sessions | Win Rate | Variance  |
|  Jack L   | $95.75    | 2        | 100%     | 185.28    |
|  Jack V   | $66.75    | 2        | 100%     | 116.28    |
|  ...                                                      |
+----------------------------------------------------------+
```

### 7.3 Play Page Layout
```
+----------------------------------------------------------+
| Active Session: January 12, 2025 - $1/$2                 |
| [End Session]                                             |
+----------------------------------------------------------+
| Total on Table: $500.00           [+ Add Player]          |
+----------------------------------------------------------+
| Player      | Buy-ins        | Cash-out | P/L            |
| Zach        | $100 + $50     | -        | -              |
| Jack V      | $100           | -        | -              |
| Jack L      | $100 + $50     | -        | -              |
| Marco       | $100           | -        | -              |
+----------------------------------------------------------+
```

---

## 8. Development Phases

### Phase 1: Core Functionality
- [ ] Google Drive authentication and file operations
- [ ] Redux store setup with data models
- [ ] CSV import with validation
- [ ] Basic session creation and player management
- [ ] Manual session entry and completion
- [ ] Zero-sum validation

### Phase 2: Statistics & Visualization
- [ ] Player statistics calculations (all metrics)
- [ ] Balance chart with Chart.js/Recharts
- [ ] Chart player toggle functionality
- [ ] Sortable statistics table
- [ ] Date range filtering

### Phase 3: Neo-brutalist UI & Polish
- [ ] Implement Neo-brutalist design system
- [ ] Mobile responsive layouts
- [ ] Loading states and error handling
- [ ] Google Drive sync status indicators
- [ ] Final UX refinements

---

## 9. Implementation Notes

### Resolved Design Decisions

**Single-User Architecture**
- No multi-tenant support needed
- Each user imports their own CSV and maintains their own Google Drive data
- No player authentication required

**Data Immutability**
- Historical data imported via CSV is read-only
- Manual entries can be edited before Google Drive sync
- Once synced, data should be treated as canonical

**Player Name Handling**
- Player names may have variations (e.g., "Jack V" vs "Jack V." vs "JackV")
- System should display names exactly as imported/entered
- Future consideration: Add manual player merging feature if needed

**Session Timing**
- Games extending past midnight belong entirely to the session start date
- No session splitting required

### Google Drive API Setup Steps

1. Create project in Google Cloud Console
2. Enable Google Drive API
3. Configure OAuth consent screen
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized JavaScript origins: `https://username.github.io`
6. Add authorized redirect URIs: `https://username.github.io/poker-tracker`

---

## Appendix A: Sample Calculation - Variance

For a player with session results: [-$30, -$26.50]

1. Mean (μ) = (-30 + -26.50) / 2 = -28.25
2. Squared differences: (-30 - -28.25)² = 3.0625, (-26.50 - -28.25)² = 3.0625
3. Variance (σ²) = (3.0625 + 3.0625) / 2 = 3.0625
4. Standard Deviation (σ) = √3.0625 = 1.75

---

**Document Version**: 1.1  
**Last Updated**: January 12, 2025  
**Author**: Technical Requirements  
**Status**: Draft for Review
