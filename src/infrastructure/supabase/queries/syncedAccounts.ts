import { supabase } from '../client';
import type { SyncProvider, ConnectionType } from '../../oauth/config';

export type SyncedAccount = {
  id: string;
  provider: SyncProvider;
  connection_type: ConnectionType;
  provider_handle: string | null;
  provider_display_name: string | null;
  provider_avatar_url: string | null;
  enabled: boolean;
  last_synced_at: string | null;
};

export async function fetchSyncedAccounts(
  userId: string,
  connectionType: ConnectionType = 'creator',
): Promise<SyncedAccount[]> {
  const { data, error } = await supabase
    .from('synced_accounts')
    .select('id, provider, connection_type, provider_handle, provider_display_name, provider_avatar_url, enabled, last_synced_at')
    .eq('user_id', userId)
    .eq('connection_type', connectionType)
    .order('created_at', { ascending: true });
  if (error) { throw error; }
  return (data ?? []) as SyncedAccount[];
}

/**
 * Hand the OAuth code to the sync-oauth edge function — it exchanges tokens and
 * stores them server-side. For 'creator' it also ensures the Members Only channel
 * and imports videos; for 'feed' it sets up the connection for the For You grid.
 */
export async function syncOAuthCode(
  provider: SyncProvider,
  code: string,
  connectionType: ConnectionType = 'creator',
): Promise<void> {
  // functions.invoke doesn't reliably attach the user JWT (especially right after
  // returning from the system-browser OAuth round-trip), and sync-oauth requires
  // it to identify the caller — pass the current access token explicitly.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { throw new Error('You appear to be signed out. Sign in and try again.'); }
  const { data, error } = await supabase.functions.invoke('sync-oauth', {
    body: { provider, code, connectionType },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    // FunctionsHttpError carries the Response — pull out the function's {error} body.
    let msg = error.message;
    try {
      const body = await (error as any).context?.json?.();
      if (body?.error) { msg = body.error; }
    } catch { /* keep msg */ }
    throw new Error(msg);
  }
  if (data?.error) { throw new Error(data.error); }
}

export type FacebookPage = {
  id: string;
  name: string;
  avatar: string | null;
  // false when the user can see but can't manage the Page (no Page token) — the picker
  // shows it greyed with a "needs manage access" hint rather than hiding it.
  importable: boolean;
  // false when a manageable Page has no reels yet → "No reels" hint (distinct from an
  // access problem). null when unknown (not manageable, or beyond the probe cap).
  hasReels: boolean | null;
};

// Pull out the {error} body a FunctionsHttpError wraps, falling back to its message.
async function functionErrorMessage(error: any): Promise<string> {
  let msg = error?.message ?? 'Request failed';
  try {
    const body = await error?.context?.json?.();
    if (body?.error) { msg = body.error; }
  } catch { /* keep msg */ }
  return msg;
}

/**
 * Facebook phase 1: hand the OAuth code to sync-oauth, which exchanges the user token
 * and returns the Pages this user manages. Nothing is imported yet — the caller shows
 * a picker and then calls importFacebookPage() with the chosen Page (phase 2).
 */
export async function connectFacebook(
  code: string,
  connectionType: ConnectionType = 'creator',
): Promise<FacebookPage[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { throw new Error('You appear to be signed out. Sign in and try again.'); }
  const { data, error } = await supabase.functions.invoke('sync-oauth', {
    body: { provider: 'facebook', code, connectionType },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) { throw new Error(await functionErrorMessage(error)); }
  if (data?.error) { throw new Error(data.error); }
  return (data?.pages ?? []) as FacebookPage[];
}

/**
 * Reopen the Facebook Page picker for a pending connection (one where the user
 * connected but never picked a Page). Re-lists Pages from the user token stashed
 * server-side — no second OAuth round-trip. Throws if that token has expired.
 */
export async function resumeFacebookPages(
  connectionType: ConnectionType = 'creator',
): Promise<FacebookPage[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { throw new Error('You appear to be signed out. Sign in and try again.'); }
  const { data, error } = await supabase.functions.invoke('sync-oauth', {
    body: { provider: 'facebook', connectionType },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) { throw new Error(await functionErrorMessage(error)); }
  if (data?.error) { throw new Error(data.error); }
  return (data?.pages ?? []) as FacebookPage[];
}

/**
 * Facebook phase 2: import the chosen Page's reels. Uses the user token stashed by
 * connectFacebook() server-side to derive the Page token — no second OAuth round-trip.
 */
export async function importFacebookPage(
  pageId: string,
  connectionType: ConnectionType = 'creator',
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { throw new Error('You appear to be signed out. Sign in and try again.'); }
  const { data, error } = await supabase.functions.invoke('sync-oauth', {
    body: { provider: 'facebook', pageId, connectionType },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) { throw new Error(await functionErrorMessage(error)); }
  if (data?.error) { throw new Error(data.error); }
}

/** Enable/disable a synced account — the DB trigger reconciles channel visibility. */
export async function setSyncedAccountEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('synced_accounts')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { throw error; }
}

/** Disconnect (delete) a synced account — cascades tokens; trigger hides channel if none remain. */
export async function disconnectSyncedAccount(id: string): Promise<void> {
  const { error } = await supabase.from('synced_accounts').delete().eq('id', id);
  if (error) { throw error; }
}
