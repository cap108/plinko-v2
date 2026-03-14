import type {
  SessionResponse, ConfigResponse, BetRequest,
  PlaceBetResponse, BalanceResponse, HistoryResponse,
} from '@plinko-v2/shared';

const SESSION_KEY = 'plinko_v2_sessionId';

// ---- Typed errors ----

export enum ApiErrorType {
  Network = 'network',
  Timeout = 'timeout',
  Server = 'server',
  Client = 'client',
}

export class ApiError extends Error {
  readonly type: ApiErrorType;
  readonly status?: number;

  constructor(type: ApiErrorType, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.status = status;
  }

  get retryable(): boolean {
    return this.type === ApiErrorType.Network || this.type === ApiErrorType.Timeout ||
      (this.type === ApiErrorType.Server && (this.status === undefined || this.status >= 500));
  }
}

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

// ---- API base URL ----
// Dev: empty string → relative paths go through Vite proxy.
// Production: VITE_API_URL = Railway backend origin (e.g. 'https://plinko-api.up.railway.app').
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

// ---- API calls ----

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(ApiErrorType.Timeout, 'Request timed out');
      }
      throw new ApiError(ApiErrorType.Network, 'Network error — check your connection');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.error
        ?? (res.status >= 500 ? 'Server is unavailable — please try again shortly' : `HTTP ${res.status}`);
      const type = res.status >= 500 ? ApiErrorType.Server : ApiErrorType.Client;
      throw new ApiError(type, msg, res.status);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- Retry with jittered exponential backoff ----

function abortAwareSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

async function apiFetchWithRetry<T>(
  path: string,
  init?: RequestInit,
  maxRetries = 3,
): Promise<T> {
  let lastError: ApiError | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiFetch<T>(path, init);
    } catch (err) {
      if (!(err instanceof ApiError) || !err.retryable || attempt === maxRetries) {
        throw err;
      }
      lastError = err;
      // Jittered exponential backoff: base 1s, factor 2, ±50% jitter
      const base = 1000 * Math.pow(2, attempt);
      const jitter = base * (0.5 + Math.random());
      await abortAwareSleep(jitter, init?.signal ?? undefined);
    }
  }
  throw lastError!;
}

// ---- Public API ----

export async function createSession(): Promise<SessionResponse> {
  return apiFetch<SessionResponse>('/api/session', { method: 'POST' });
}

export async function getBalance(sessionId: string): Promise<number> {
  const { balance } = await apiFetchWithRetry<BalanceResponse>(
    `/api/balance?sessionId=${encodeURIComponent(sessionId)}`
  );
  return balance;
}

export async function getConfig(sessionId: string): Promise<ConfigResponse> {
  return apiFetchWithRetry<ConfigResponse>(
    `/api/config?sessionId=${encodeURIComponent(sessionId)}`
  );
}

export async function placeBet(body: BetRequest): Promise<PlaceBetResponse> {
  // NOT idempotent — no retry
  return apiFetch<PlaceBetResponse>('/api/plinko/bet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function getHistory(
  sessionId: string, limit = 20,
): Promise<HistoryResponse> {
  return apiFetchWithRetry<HistoryResponse>(
    `/api/history?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`
  );
}

export async function ensureSession(): Promise<SessionResponse> {
  const stored = getStoredSessionId();
  if (stored) {
    try {
      // Use non-retry apiFetch to prevent cascading retry (94s worst case)
      const balance = await apiFetch<BalanceResponse>(
        `/api/balance?sessionId=${encodeURIComponent(stored)}`
      );
      return { sessionId: stored, balance: balance.balance };
    } catch (err) {
      // If the server itself is down, propagate — don't fall through to createSession
      if (err instanceof ApiError && (err.type === ApiErrorType.Network || err.type === ApiErrorType.Timeout || (err.type === ApiErrorType.Server && err.status !== 404))) {
        throw err;
      }
      // Session expired or invalid (4xx) — create new
      clearSession();
    }
  }
  const session = await createSession();
  storeSessionId(session.sessionId);
  return session;
}
