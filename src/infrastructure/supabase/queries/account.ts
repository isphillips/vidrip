import { supabase } from '../client';

type DeleteBody = { action?: 'request' | 'cancel' | 'send-otp'; password?: string; otp?: string };

// Invoke the account-delete edge function with the caller's bearer token (functions.invoke
// doesn't reliably attach it on its own — pass it explicitly, like syncOAuthCode).
async function invokeAccountDelete(body: DeleteBody): Promise<{ purgeAt?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { throw new Error('You appear to be signed out. Sign in and try again.'); }
  const { data, error } = await supabase.functions.invoke('account-delete', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    let msg = error.message;
    try {
      const b = await (error as any).context?.json?.();
      if (b?.error) { msg = b.error; }
    } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) { throw new Error(data.error); }
  return data ?? {};
}

/** Email a one-time confirmation code (accounts without an authenticator). */
export const sendAccountDeleteOtp = () => invokeAccountDelete({ action: 'send-otp' });

/** Request deletion: purges synced accounts/external data now, schedules platform purge. */
export const requestAccountDeletion = (b: { password?: string; otp?: string }) =>
  invokeAccountDelete({ action: 'request', ...b });

/** Cancel a pending deletion within the 30-day grace window. */
export const cancelAccountDeletion = () => invokeAccountDelete({ action: 'cancel' });

/** Read the pending-deletion timestamp (null = active account). */
export async function fetchDeletionStatus(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('users').select('deletion_requested_at').eq('id', userId).maybeSingle();
  return (data as { deletion_requested_at?: string | null } | null)?.deletion_requested_at ?? null;
}
