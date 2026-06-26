import { NativeModules, Platform } from 'react-native';

// Best-effort device-region detection — a proxy for the App Store storefront (there is no JS API for
// the true storefront without StoreKit). Used solely to gate the optional "Join on the web" link,
// which Apple permits only on the US storefront. Defaults to non-US (no link) when the region is
// unknown, so we never show the link where it isn't allowed.
export function deviceCountry(): string {
  try {
    let locale = '';
    if (Platform.OS === 'ios') {
      const s: any = NativeModules.SettingsManager?.settings;
      locale = s?.AppleLocale || (Array.isArray(s?.AppleLanguages) ? s.AppleLanguages[0] : '') || '';
    } else {
      locale = (NativeModules.I18nManager as any)?.localeIdentifier || '';
    }
    const parts = locale.replace('-', '_').split('_');
    return (parts[1] || '').toUpperCase();
  } catch {
    return '';
  }
}

export function isUSStorefront(): boolean {
  return deviceCountry() === 'US';
}
