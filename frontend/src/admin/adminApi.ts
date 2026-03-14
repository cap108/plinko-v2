import type {
  AdminConfigResponse,
  AdminConfigUpdateRequest,
  AdminSessionListResponse,
  AdminSessionDetailResponse,
  AdminStatsResponse,
  AdminRtpReportResponse,
} from '@plinko-v2/shared';
import { API_BASE } from '../api.js';

const TOKEN_KEY = 'plinko_admin_token';

export function getToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

export function clearToken(): void {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...init?.headers,
      },
    });

    if (res.status === 401) {
      clearToken();
      throw new Error('Session expired');
    }
    if (res.status === 429) {
      throw new Error('Too many requests. Please wait 60 seconds.');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyAuth(): Promise<boolean> {
  try {
    await adminFetch<AdminStatsResponse>('/api/admin/stats');
    return true;
  } catch {
    return false;
  }
}

export async function getConfig(): Promise<AdminConfigResponse> {
  return adminFetch<AdminConfigResponse>('/api/admin/config');
}

export async function updateConfig(data: AdminConfigUpdateRequest): Promise<{ ok: boolean; effective: AdminConfigResponse['effective']; rtpReport: Record<string, number> }> {
  return adminFetch('/api/admin/config', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getSessions(page = 1, pageSize = 20): Promise<AdminSessionListResponse> {
  return adminFetch<AdminSessionListResponse>(`/api/admin/sessions?page=${page}&pageSize=${pageSize}`);
}

export async function getSessionDetail(id: string): Promise<AdminSessionDetailResponse> {
  return adminFetch<AdminSessionDetailResponse>(`/api/admin/sessions/${id}`);
}

export async function resetSessionBalance(id: string, balanceCents: number): Promise<{ ok: boolean }> {
  return adminFetch(`/api/admin/sessions/${id}/reset-balance`, {
    method: 'POST',
    body: JSON.stringify({ balanceCents }),
  });
}

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  return adminFetch(`/api/admin/sessions/${id}`, { method: 'DELETE' });
}

export async function purgeExpiredSessions(): Promise<{ ok: boolean; purged: number }> {
  return adminFetch('/api/admin/sessions/purge-expired', { method: 'POST' });
}

export async function getStats(): Promise<AdminStatsResponse> {
  return adminFetch<AdminStatsResponse>('/api/admin/stats');
}

export async function getRtpReport(): Promise<AdminRtpReportResponse> {
  return adminFetch<AdminRtpReportResponse>('/api/admin/rtp-report');
}
