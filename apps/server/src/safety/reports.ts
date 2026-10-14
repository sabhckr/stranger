import type pg from 'pg';
import type { ChatMode, ReportReason, TranscriptLine } from '@stranger/protocol';

export interface ReportRow {
  id: string;
  created_at: Date;
  pair_id: string;
  mode: ChatMode;
  reporter_hash: string;
  reported_hash: string;
  reporter_ip_hash: string | null;
  reason: ReportReason;
  details: string | null;
  transcript: TranscriptLine[] | null;
  status: 'open' | 'actioned' | 'dismissed';
  resolved_at: Date | null;
  resolution_note: string | null;
}

export class ReportService {
  constructor(private readonly pool: pg.Pool) {}

  /** Insert a report; a second report of the same pair by the same reporter updates the first. */
  async create(input: {
    pairId: string;
    mode: ChatMode;
    reporterHash: string;
    reportedHash: string;
    reporterIpHash: string | null;
    reason: ReportReason;
    details?: string;
    transcript?: TranscriptLine[];
  }): Promise<{ id: string; isNew: boolean }> {
    const res = await this.pool.query<{ id: string; is_new: boolean }>(
      `INSERT INTO reports (pair_id, mode, reporter_hash, reported_hash, reporter_ip_hash, reason, details, transcript)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (pair_id, reporter_hash) DO UPDATE
         SET reason = EXCLUDED.reason,
             details = COALESCE(EXCLUDED.details, reports.details),
             transcript = COALESCE(EXCLUDED.transcript, reports.transcript)
       RETURNING id, (xmax = 0) AS is_new`,
      [
        input.pairId,
        input.mode,
        input.reporterHash,
        input.reportedHash,
        input.reporterIpHash,
        input.reason,
        input.details ?? null,
        input.transcript ? JSON.stringify(input.transcript) : null,
      ],
    );
    const row = res.rows[0]!;
    return { id: row.id, isNew: row.is_new };
  }

  async distinctReportersWithin(reportedHash: string, windowHours: number): Promise<number> {
    const res = await this.pool.query<{ n: string }>(
      `SELECT count(DISTINCT reporter_hash)::text AS n FROM reports
        WHERE reported_hash = $1 AND created_at > now() - ($2::int * interval '1 hour')`,
      [reportedHash, windowHours],
    );
    return Number(res.rows[0]?.n ?? 0);
  }

  async list(opts: { status?: ReportRow['status']; limit?: number } = {}): Promise<ReportRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
    const res = await this.pool.query<ReportRow>(
      `SELECT * FROM reports WHERE ($1::text IS NULL OR status = $1) ORDER BY created_at DESC LIMIT $2`,
      [opts.status ?? null, limit],
    );
    return res.rows;
  }

  async get(id: string): Promise<ReportRow | null> {
    const res = await this.pool.query<ReportRow>(`SELECT * FROM reports WHERE id = $1`, [id]);
    return res.rows[0] ?? null;
  }

  async resolve(
    id: string,
    status: 'actioned' | 'dismissed',
    note?: string,
  ): Promise<ReportRow | null> {
    const res = await this.pool.query<ReportRow>(
      `UPDATE reports SET status = $2, resolved_at = now(), resolution_note = $3 WHERE id = $1 RETURNING *`,
      [id, status, note ?? null],
    );
    const row = res.rows[0];
    if (!row) return null;
    await this.pool.query(
      `INSERT INTO moderation_actions (actor, action, subject_hash, report_id, metadata)
       VALUES ('admin', 'resolve_report', $1, $2, $3)`,
      [row.reported_hash, row.id, JSON.stringify({ status, note: note ?? null })],
    );
    return row;
  }

  /** Retention: delete resolved and stale reports (and their transcripts) older than `days`. */
  async purgeOlderThan(days: number): Promise<number> {
    const res = await this.pool.query(
      `DELETE FROM reports WHERE created_at < now() - ($1::int * interval '1 day')`,
      [days],
    );
    return res.rowCount ?? 0;
  }
}
