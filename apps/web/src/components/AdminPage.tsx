import { useCallback, useEffect, useState } from 'react';
import { AdminApi, type AdminBan, type AdminReport } from '../lib/api.js';
import { Logo } from './Logo.js';

const TOKEN_KEY = 'stranger.adminToken';

function short(hash: string): string {
  return `${hash.slice(0, 10)}…`;
}

export function AdminPage() {
  const [token, setToken] = useState<string>(() => {
    try {
      return window.sessionStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [draftToken, setDraftToken] = useState(token);
  const [tab, setTab] = useState<'reports' | 'bans'>('reports');
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed'>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [bans, setBans] = useState<AdminBan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const api = token ? new AdminApi(token) : null;
  const loadKey = `${token}|${status}|${reloadKey}`;
  const busy = Boolean(api) && loadedKey !== loadKey;

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    Promise.all([api.listReports(status), api.listBans(true)])
      .then(([r, b]) => {
        if (cancelled) return;
        setReports(r.reports);
        setBans(b.bans);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(loadKey);
      });
    return () => {
      cancelled = true;
    };
    // `api` is derived from `token`, which is part of loadKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page">
      <div className="container admin">
        <header className="site-header">
          <Logo />
          <span className="pill">Moderation console</span>
        </header>
        <h1>Moderation</h1>
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setToken(draftToken.trim());
            try {
              window.sessionStorage.setItem(TOKEN_KEY, draftToken.trim());
            } catch {
              /* ignore */
            }
          }}
        >
          <label htmlFor="admin-token" className="sr-only">
            Admin token
          </label>
          <input
            id="admin-token"
            type="password"
            placeholder="Admin token"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="btn">
            Use token
          </button>
          <button type="button" className="btn btn-ghost" disabled={!api || busy} onClick={refresh}>
            Refresh
          </button>
          {busy && (
            <span className="hint" style={{ margin: 0 }}>
              Loading…
            </span>
          )}
        </form>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {!api && (
          <p className="hint">
            Enter the server's ADMIN_TOKEN to load reports and bans. The token is kept in this tab
            only.
          </p>
        )}

        <div className="tabs" role="tablist" aria-label="Sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'reports'}
            className="btn"
            onClick={() => setTab('reports')}
          >
            Reports ({reports.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'bans'}
            className="btn"
            onClick={() => setTab('bans')}
          >
            Active bans ({bans.length})
          </button>
        </div>

        {tab === 'reports' && (
          <section aria-label="Reports">
            <div className="toolbar">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="open">Open</option>
                <option value="actioned">Actioned</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Reason</th>
                    <th>Mode</th>
                    <th>Reported</th>
                    <th>Details</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 && (
                    <tr>
                      <td colSpan={6} className="hint">
                        No {status} reports.
                      </td>
                    </tr>
                  )}
                  {reports.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString()}</td>
                      <td>{r.reason}</td>
                      <td>{r.mode}</td>
                      <td className="mono" title={r.reported_hash}>
                        {short(r.reported_hash)}
                      </td>
                      <td>
                        {r.details && <div>{r.details}</div>}
                        {r.transcript && r.transcript.length > 0 && (
                          <details className="transcript">
                            <summary>Transcript ({r.transcript.length})</summary>
                            <ol>
                              {r.transcript.map((line, i) => (
                                <li key={i}>
                                  <strong>{line.from === 'me' ? 'Reporter' : 'Reported'}:</strong>{' '}
                                  {line.text}
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </td>
                      <td>
                        {r.status === 'open' && api && (
                          <div className="actions">
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() =>
                                void run(async () => {
                                  await api.createBan({
                                    subjectType: 'client',
                                    subjectHash: r.reported_hash,
                                    reason: `report: ${r.reason}`,
                                    hours: 24,
                                    reportId: r.id,
                                  });
                                  await api.resolveReport(r.id, 'actioned', 'banned 24h');
                                })
                              }
                            >
                              Ban 24h
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() =>
                                void run(async () => {
                                  await api.createBan({
                                    subjectType: 'client',
                                    subjectHash: r.reported_hash,
                                    reason: `report: ${r.reason}`,
                                    hours: null,
                                    reportId: r.id,
                                  });
                                  await api.resolveReport(r.id, 'actioned', 'banned permanently');
                                })
                              }
                            >
                              Ban permanently
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={() => void run(() => api.resolveReport(r.id, 'dismissed'))}
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                        {r.status !== 'open' && (
                          <span className="hint">
                            {r.status}
                            {r.resolution_note ? ` — ${r.resolution_note}` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'bans' && (
          <section aria-label="Bans">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Subject</th>
                    <th>Reason</th>
                    <th>Source</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bans.length === 0 && (
                    <tr>
                      <td colSpan={6} className="hint">
                        No active bans.
                      </td>
                    </tr>
                  )}
                  {bans.map((b) => (
                    <tr key={b.id}>
                      <td>{new Date(b.created_at).toLocaleString()}</td>
                      <td className="mono" title={b.subject_hash}>
                        {b.subject_type} {short(b.subject_hash)}
                      </td>
                      <td>{b.reason}</td>
                      <td>{b.source}</td>
                      <td>{b.expires_at ? new Date(b.expires_at).toLocaleString() : 'never'}</td>
                      <td>
                        {api && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void run(() => api.revokeBan(b.id))}
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
