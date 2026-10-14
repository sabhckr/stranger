import type { ChatMode, ReportReason, TranscriptLine } from '@stranger/protocol';
import type { Logger } from '../logger.js';
import type { BanService } from './bans.js';
import type { ReportService } from './reports.js';

export interface ModerationPolicy {
  autobanThreshold: number;
  autobanWindowHours: number;
  autobanDurationHours: number;
}

export interface ReportOutcome {
  reportId: string;
  isNew: boolean;
  autoBan: { banId: string; expiresAt: number | null } | null;
}

/** Applies the automatic moderation policy on top of persisted reports and bans. */
export class ModerationService {
  constructor(
    private readonly reports: ReportService,
    private readonly bans: BanService,
    private readonly policy: ModerationPolicy,
    private readonly log: Logger,
  ) {}

  async handleReport(input: {
    pairId: string;
    mode: ChatMode;
    reporterHash: string;
    reportedHash: string;
    reporterIpHash: string | null;
    reason: ReportReason;
    details?: string;
    transcript?: TranscriptLine[];
  }): Promise<ReportOutcome> {
    const created = await this.reports.create(input);
    const outcome: ReportOutcome = { reportId: created.id, isNew: created.isNew, autoBan: null };
    if (!created.isNew) return outcome;

    const distinct = await this.reports.distinctReportersWithin(
      input.reportedHash,
      this.policy.autobanWindowHours,
    );
    if (distinct >= this.policy.autobanThreshold) {
      const existing = await this.bans.isBanned('client', input.reportedHash);
      if (!existing) {
        const ban = await this.bans.ban({
          type: 'client',
          hash: input.reportedHash,
          reason: `auto: ${distinct} reports in ${this.policy.autobanWindowHours}h`,
          source: 'auto',
          durationHours: this.policy.autobanDurationHours,
          reportId: created.id,
        });
        outcome.autoBan = {
          banId: ban.id,
          expiresAt: ban.expires_at ? ban.expires_at.getTime() : null,
        };
        this.log.warn(
          { reported: input.reportedHash.slice(0, 12), distinct, banId: ban.id },
          'moderation: automatic ban',
        );
      }
    }
    return outcome;
  }
}
