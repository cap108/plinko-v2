export interface AutoBetConfig {
  maxRounds: number;      // 0 = unlimited
  stopOnLoss: number;     // 0 = disabled; cumulative loss threshold in dollars
  stopOnProfit: number;   // 0 = disabled; cumulative net profit threshold in dollars
}

export const DEFAULT_AUTO_BET_CONFIG: AutoBetConfig = {
  maxRounds: 1,
  stopOnLoss: 0,
  stopOnProfit: 0,
};
