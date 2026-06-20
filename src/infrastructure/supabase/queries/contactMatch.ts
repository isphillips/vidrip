import { sha256 } from 'js-sha256';
import { supabase } from '../client';
import type { DeviceContact } from '../../native/contacts';

// Optional "already on Vidrip" hint for the invite-contacts screen. We hash each contact's email(s)
// client-side and ask the server which hashes map to an account (and which are already friends). Raw
// emails and phone numbers never leave the device. Best-effort: contacts with no email, or who signed
// up with a different email, won't match — so it undercounts, never produces false "is a user".

const normEmail = (e: string) => e.trim().toLowerCase();

export type ContactMatch = { isUser: boolean; isFriend: boolean };

export async function matchContacts(contacts: DeviceContact[]): Promise<Record<string, ContactMatch>> {
  const hashToContacts = new Map<string, string[]>();
  for (const c of contacts) {
    for (const email of c.emails) {
      const h = sha256(normEmail(email));
      (hashToContacts.get(h) ?? hashToContacts.set(h, []).get(h)!).push(c.id);
    }
  }
  const hashes = [...hashToContacts.keys()];
  if (hashes.length === 0) { return {}; }

  const { data, error } = await supabase.functions.invoke('match-contacts', { body: { hashes } });
  if (error || !data) { return {}; }
  const userHashes: string[] = data.userHashes ?? [];
  const friendHashes = new Set<string>(data.friendHashes ?? []);

  const result: Record<string, ContactMatch> = {};
  for (const h of userHashes) {
    const friend = friendHashes.has(h);
    for (const cid of hashToContacts.get(h) ?? []) {
      result[cid] = { isUser: true, isFriend: friend || !!result[cid]?.isFriend };
    }
  }
  return result;
}
