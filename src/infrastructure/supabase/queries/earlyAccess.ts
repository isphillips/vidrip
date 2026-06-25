import { supabase } from '../client';

// Capture a creator's email for the closed-launch waitlist (the "claim your spot" form at the end of
// the cinematic creator onboarding). Writes to the existing `early_access_signups` table. Best-effort
// but surfaces real failures so the form can show a retry — a duplicate email is treated as success
// (they're already on the list).
export async function joinEarlyAccess(email: string, opts?: { handle?: string; referral?: string }): Promise<void> {
  const clean = email.trim().toLowerCase();
  const { error } = await (supabase as any).from('early_access_signups').insert({
    email: clean,
    handle: opts?.handle?.trim() || null,
    referral: opts?.referral || null,
  });
  if (error && error.code !== '23505') { throw error; } // 23505 = already on the list → fine
}

// A light client-side email sanity check (UI gating only; the table/edge handles real validation).
export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
