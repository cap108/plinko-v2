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
  maintenanceMode?: boolean;
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

export interface ErrorResponse {
  error: string;
}

// ---- Admin Types ----

export interface AdminConfigOverrides {
  minBetCents?: number | null;
  maxBetCents?: number | null;
  maxBetCount?: number | null;
  initialBalanceCents?: number | null;
  maintenanceMode?: boolean | null;
  paytableOverrides?: Record<string, { multipliers: number[]; weights: number[] }> | null;
}

export interface AdminConfigResponse {
  defaults: {
    minBetCents: number;
    maxBetCents: number;
    maxBetCount: number;
    initialBalanceCents: number;
  };
  overrides: AdminConfigOverrides;
  effective: {
    minBetCents: number;
    maxBetCents: number;
    maxBetCount: number;
    initialBalanceCents: number;
    maintenanceMode: boolean;
  };
  rtpReport: Record<string, number>;
}

export type AdminConfigUpdateRequest = AdminConfigOverrides;

export interface AdminSessionEntry {
  sessionId: string;
  balanceCents: number;
  createdAt: number;
  lastActiveAt: number;
  createdByIpHash: string | null;
  roundCount: number;
}

export interface AdminSessionListResponse {
  sessions: AdminSessionEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSessionDetailResponse {
  session: AdminSessionEntry;
  recentHistory: Array<{
    roundId: string;
    betCents: number;
    rows: number;
    riskLevel: string;
    multiplier: number;
    winCents: number;
    balanceCents: number;
    timestamp: number;
  }>;
}

export interface AdminStatsResponse {
  activeSessions: number;
  totalSessions: number;
  totalBetsAllTime: number;
  totalWageredCents: number;
  totalWonCents: number;
  houseEdgeCents: number;
  observedRtp: number;
  uptimeSeconds: number;
  maintenanceMode: boolean;
}

export interface AdminRtpReportResponse {
  configured: Record<string, number>;
  observed: Record<string, { rtp: number; sampleSize: number }>;
}
