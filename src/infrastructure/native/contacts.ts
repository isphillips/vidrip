import { Platform, PermissionsAndroid } from 'react-native';
import Contacts from 'react-native-contacts';

// Thin wrapper over react-native-contacts. We read the device address book ONLY to let the user pick
// who to text an invite code to — phone numbers are used purely to open the SMS composer on-device and
// are never uploaded or stored. Emails (if present) are hashed client-side for the optional "already on
// Vidrip" match (see queries/contactMatch.ts); raw emails never leave the device either.

export type DeviceContact = {
  id: string;
  name: string;
  phones: string[];   // raw, for the sms: deep link
  emails: string[];   // for the hashed on-platform match
};

function nameOf(c: Contacts.Contact): string {
  const full = [c.givenName, c.familyName].filter(Boolean).join(' ').trim();
  return full || c.displayName || (c as { company?: string }).company || '';
}

/** Ask for contacts permission (cross-platform). Returns true if granted. */
export async function ensureContactsPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS, {
      title: 'Invite friends',
      message: 'Vidrip needs access to your contacts so you can text them an invite code.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    });
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  const status = await Contacts.requestPermission();
  return status === 'authorized';
}

/**
 * Read the address book, normalized for the invite UI. Only contacts with at least one phone number
 * are returned (you can't text an invite without one), sorted by name.
 */
export async function loadDeviceContacts(): Promise<DeviceContact[]> {
  const raw = await Contacts.getAll();
  const out: DeviceContact[] = [];
  for (const c of raw) {
    const name = nameOf(c);
    const phones = (c.phoneNumbers ?? []).map(p => p.number).filter((n): n is string => !!n);
    if (!name || phones.length === 0) { continue; }
    const emails = (c.emailAddresses ?? []).map(e => e.email).filter((e): e is string => !!e);
    out.push({ id: c.recordID, name, phones, emails });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
