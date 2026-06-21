import { C } from '../../theme';
import type { ViewStyle, TextStyle } from 'react-native';

// The four shared conversation-row states, used by BOTH the Feed (per-friend) list
// and the Channels (per-channel) list so the colour language is identical everywhere.
//   unread     → new interaction not yet seen        → teal/light-blue highlight
//   unreplied  → seen a reaction request, not acted   → light-purple outline
//   caughtup   → read/reacted, nothing pending        → greyed-out
// An exclusive drop overrides all of these with a gold glow (handled by <ExclusiveGlow>).
export type RowState = 'unread' | 'unreplied' | 'caughtup';

export type RowStateStyle = {
  // Applied to the row container (left accent border + opacity).
  container: ViewStyle;
  // Applied to the numeric count badge next to the avatar (null = hide badge).
  badge: TextStyle | null;
  badgeBg: ViewStyle | null;
};

// Pure: state (+ exclusive flag) → styles. No hooks; safe to call in render.
// Precedence is resolved by the caller — exclusive rows wrap in <ExclusiveGlow> and
// pass exclusiveGlow so we drop the state border in favour of the gold treatment.
export function rowStateStyle(state: RowState, exclusiveGlow = false): RowStateStyle {
  if (exclusiveGlow) {
    return {
      container: { opacity: 1, borderLeftWidth: 0 },
      badge: { color: C.BLACK },
      badgeBg: { backgroundColor: C.GOLD_REAL },
    };
  }
  switch (state) {
    case 'unread':
      return {
        container: { opacity: 1, borderLeftWidth: 3, borderLeftColor: C.TEAL },
        badge: { color: C.BLACK },
        badgeBg: { backgroundColor: C.TEAL },
      };
    case 'unreplied':
      return {
        container: { opacity: 1, borderLeftWidth: 3, borderLeftColor: C.ACCENT_OUTLINE },
        badge: { color: C.WHITE },
        badgeBg: { backgroundColor: C.ACCENT_OUTLINE },
      };
    case 'caughtup':
    default:
      // Caught-up rows keep full brightness (the dim read too dark in both lists); the
      // teal/purple accent borders on active rows are enough to distinguish them.
      return {
        container: { opacity: 1, borderLeftWidth: 3, borderLeftColor: 'transparent' },
        badge: null,
        badgeBg: null,
      };
  }
}
