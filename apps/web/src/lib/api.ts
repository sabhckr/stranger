import { API_BASE } from './config.js';

export interface IceResponse {
  iceServers: RTCIceServer[];
  turn: boolean;
  ttl: number;
}

export async function fetchIceServers(): Promise<IceResponse> {
  const res = await fetch(`${API_BASE}/api/ice`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ICE config failed: ${res.status}`);
  return (await res.json()) as IceResponse;
}

export async function fetchStats(): Promise<{
  onlineCount: number;
  waiting: { text: number; video: number };
}> {
  const res = await fetch(`${API_BASE}/api/stats`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`stats failed: ${res.status}`);
  return (await res.json()) as { onlineCount: number; waiting: { text: number; video: number } };
}

export class AdminApi {
  constructor(private readonly token: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
    });
    if (res.status === 401) throw new Error('Invalid admin token.');
    if (res.status === 404 && path.startsWith('/api/admin'))
      throw new Error(
        'Admin API is disabled on this server (ADMIN_TOKEN not set) or the item was not found.',
      );
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  }

  listReports(status?: 'open' | 'actioned' | 'dismissed') {
    return this.call<{ reports: AdminReport[] }>(
      `/api/admin/reports${status ? `?status=${status}` : ''}`,
    );
  }
  resolveReport(id: string, status: 'actioned' | 'dismissed', note?: string) {
    return this.call<{ report: AdminReport }>(`/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    });
  }
  listBans(active = true) {
    return this.call<{ bans: AdminBan[] }>(`/api/admin/bans?active=${active}`);
  }
  createBan(input: {
    subjectType: 'client' | 'ip';
    subjectHash: string;
    reason: string;
    hours: number | null;
    reportId?: string;
  }) {
    return this.call<{ ban: AdminBan }>('/api/admin/bans', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  revokeBan(id: string) {
    return this.call<{ ban: AdminBan }>(`/api/admin/bans/${id}`, { method: 'DELETE' });
  }
}

export interface AdminReport {
  id: string;
  created_at: string;
  pair_id: string;
  mode: 'text' | 'video';
  reporter_hash: string;
  reported_hash: string;
  reason: string;
  details: string | null;
  transcript: Array<{ from: 'me' | 'partner'; text: string; ts: number }> | null;
  status: 'open' | 'actioned' | 'dismissed';
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface AdminBan {
  id: string;
  created_at: string;
  subject_type: 'client' | 'ip';
  subject_hash: string;
  reason: string;
  source: 'auto' | 'admin';
  expires_at: string | null;
  revoked_at: string | null;
  note: string | null;
}
