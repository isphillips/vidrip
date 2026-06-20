import AsyncStorage from '@react-native-async-storage/async-storage';

// Tracks which invite code the user texted to which contact, on-device only. Used to (a) mark a
// contact as "invited" in the list and (b) count how many codes are still un-sent so we can warn when
// they send their last one. Sending an SMS can't be confirmed, so this is optimistic: recorded the
// moment the user taps to text. Keyed by the device contact id.

const KEY = 'vidrip.sentInvites.v1';

export type SentInvite = { code: string; contactName: string; sentAt: number };
export type SentInviteMap = Record<string, SentInvite>;

export async function loadSentInvites(): Promise<SentInviteMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SentInviteMap) : {};
  } catch {
    return {};
  }
}

export async function recordSentInvite(contactId: string, contactName: string, code: string): Promise<SentInviteMap> {
  const map = await loadSentInvites();
  map[contactId] = { code, contactName, sentAt: Date.now() };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(map)); } catch { /* best effort */ }
  return map;
}

export async function clearSentInvite(contactId: string): Promise<SentInviteMap> {
  const map = await loadSentInvites();
  delete map[contactId];
  try { await AsyncStorage.setItem(KEY, JSON.stringify(map)); } catch { /* best effort */ }
  return map;
}

/** The set of codes already sent (each available code is meant for one invite). */
export function sentCodes(map: SentInviteMap): Set<string> {
  return new Set(Object.values(map).map(v => v.code));
}
