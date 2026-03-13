import type {
  SessionResponse, ConfigResponse, BetRequest,
  PlaceBetResponse, BalanceResponse, HistoryResponse,
} from '@plinko-v2/shared';

const SESSION_KEY = 'plinko_v2_sessionId';

// ---- Session persistence ----

export function getStoredSessionId(): string | null {
  try { return localStorage.getItem(SESSION_KEY); }
  catch { return null; }
}

export function storeSessionId(id: string): void {
  try { localStorage.setItem(SESSION_KEY, id); } catch { /* ignore */ }
}

export function clearSession(): void {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// ---- API calls ----

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(path, { ...init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/session', { method: 'POST' });
}

export async function getBalance(sessionId: string): Promise<number> {
  const { balance } = await apiFetch<BalanceResponse>(
    `/api/balance?sessionId=${encodeURIComponent(sessionId)}`
  );
  return balance;
}

export async function getConfig(sessionId: string): Promise<ConfigResponse> {
  return apiFetch<ConfigResponse>(
    `/api/config?sessionId=${encodeURIComponent(sessionId)}`
  );
}

export async function placeBet(body: BetRequest): Promise<PlaceBetResponse> {
  return apiFetch<PlaceBetResponse>('/api/plinko/bet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getHistory(
  sessionId: string, limit = 20,
): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(
    `/api/history?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`
  );
}

export async function ensureSession(): Promise<SessionResponse> {
  const stored = getStoredSessionId();
  if (stored) {
    try {
      const balance = await getBalance(stored);
      return { sessionId: stored, balance };
    } catch {
      // Session expired or invalid — create new
      clearSession();
    }
  }
  const session = await createSession();
  storeSessionId(session.sessionId);
  return session;
}
