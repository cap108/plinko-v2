// ---- Risk & Config ----
export type RiskLevel = 'low' | 'medium' | 'high';
export type RowCount = 8 | 10 | 12 | 14 | 16;

// ---- API Responses ----
export interface SessionResponse {
  sessionId: string;
  balance: number; // dollars (converted from cents on backend)
}

export interface Paytable {
  multipliers: number[];
  probabilities: number[];
}

export interface ConfigResponse {
  rows: RowCount[];
  riskLevels: RiskLevel[];
  paytables: Record<string, Paytable>; // key: "{rows}_{risk}"
  defaultRows: RowCount;
  defaultRisk: RiskLevel;
  minBet: number;
  maxBet: number;
  maxBallCount: number;
}

// ---- Bet ----
export interface BetRequest {
  sessionId: string;
  betAmount: number;
  rows: RowCount;
  riskLevel: RiskLevel;
  count?: number; // 1-100, default 1
}

export interface BetResult {
  roundId: string;
  slotIndex: number;
  multiplier: number;
  winAmount: number;
  balance: number;
}

export interface PlaceBetResponse {
  bets: BetResult[];
}

// ---- Balance & History ----
export interface BalanceResponse {
  balance: number;
}

export interface HistoryEntry {
  roundId: string;
  betAmount: number;
  slotIndex: number;
  multiplier: number;
  winAmount: number;
  balance: number;
  timestamp: number;
  rows: RowCount;
  riskLevel: RiskLevel;
}

export interface HistoryResponse {
  history: HistoryEntry[];
}
