// Master gate for every PAID / subscriber / members-only / exclusive-content surface in the app.
//
// FALSE = the iOS App Store build. Apple 3.1.1: an app may not access subscriber/paid digital content by
// means other than In-App Purchase. Until channel subscriptions are sold via StoreKit IAP, the app must
// show ZERO paid-content signals anywhere a reviewer can reach — so this flag hides, in ONE place:
//   • members-only channels in discovery + their "⭐ Members Only" badge + the members lock,
//   • the feed "Exclusive Content" rail, gift reveal, exclusive collections & watch, exclusive badges/notes,
//   • the creator Members-visibility / Exclusive-collection / tiers / award / send-to-subscribers UI,
//   • the "Subscribe!" studio stickers.
//
// Flip to TRUE once subscriptions are available via IAP — the whole monetization surface re-enables here.
export const MONETIZATION_ENABLED = false;
