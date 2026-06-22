import { supabase } from '../client';

// User-facing content/user reporting (UGC safety). Writes to `content_reports`
// (see migration 20260622000000_content_reports.sql). Reviewed out-of-band by staff.
export type ReportTargetType =
  | 'user' | 'reaction' | 'comment' | 'post' | 'clip' | 'channel' | 'thread';

export interface ReportInput {
  targetType: ReportTargetType;
  targetId: string;
  /** Author/owner of the reported content (enables follow-up moderation). */
  reportedUserId?: string | null;
  /** Short machine reason key (e.g. 'nudity', 'harassment'). */
  reason?: string;
  /** Optional free-text the reporter added. */
  details?: string;
}

/** File a report (idempotent — re-reporting the same target is a silent no-op). */
export async function reportContent(input: ReportInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { throw new Error('Not authenticated'); }
  const { error } = await (supabase as any).from('content_reports').insert({
    reporter_id: user.id,
    target_type: input.targetType,
    target_id: input.targetId,
    reported_user_id: input.reportedUserId ?? null,
    reason: input.reason ?? null,
    details: input.details ?? null,
  });
  if (error && error.code !== '23505') { throw error; }   // ignore duplicate report
}
