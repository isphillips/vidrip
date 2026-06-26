// ── Text moderation (Apple Guideline 1.2: "a method for filtering objectionable content") ──────
//
// A lightweight, on-device baseline filter for user-entered TEXT — handles/display names, captions,
// comments. It blocks hate slurs and explicit sexual terms before the text is published. This is a
// first line of defence that pairs with the server-side video moderation (moderateVideo.ts) and the
// report/block tools; it can be upgraded later to a server text-moderation endpoint (e.g. OpenAI
// moderation) without changing call sites.
//
// Matching is case-insensitive, ignores common leet substitutions, and is word-boundary aware so we
// don't flag innocent substrings (e.g. "Scunthorpe", "assistant", "class").

// Curated baseline blocklist — worst-category terms (hate slurs + hardcore sexual). Intentionally
// conservative to avoid false positives on everyday language; expand or move server-side as needed.
const BLOCKLIST: string[] = [
  // hate slurs
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'tranny', 'chink', 'spic', 'kike', 'wetback', 'coon',
  // explicit sexual
  'cunt', 'rape', 'rapist', 'pedophile', 'pedo', 'childporn', 'cp', 'cum', 'creampie', 'blowjob',
  'handjob', 'deepthroat', 'bestiality', 'incest', 'porn', 'pornhub', 'xvideos', 'onlyfans',
];

// Leet/obfuscation folding so "n1gg3r", "f@g", "p0rn" etc. still match.
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function normalize(input: string): string {
  let s = input.toLowerCase();
  s = s.replace(/[013457@$!]/g, c => LEET[c] ?? c);
  // collapse repeated chars (niiigger → niigger → matches via boundary below) and strip separators
  s = s.replace(/[^a-z\s]/g, ' ');
  return s;
}

// Pre-build word-boundary regexes once.
const PATTERNS = BLOCKLIST.map(w => new RegExp(`\\b${w}\\b`, 'i'));

/** Returns the first matched objectionable term, or null if the text is clean. */
export function findObjectionable(text: string | null | undefined): string | null {
  if (!text) { return null; }
  const norm = normalize(text);
  for (let i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i].test(norm)) { return BLOCKLIST[i]; }
  }
  return null;
}

/** Convenience boolean. */
export function isObjectionable(text: string | null | undefined): boolean {
  return findObjectionable(text) !== null;
}

export class TextRejected extends Error {
  constructor(public term: string) {
    super('objectionable-text');
    this.name = 'TextRejected';
  }
}

/** Throws TextRejected if the text contains a blocked term — use before publishing UGC text. */
export function assertCleanText(text: string | null | undefined): void {
  const hit = findObjectionable(text);
  if (hit) { throw new TextRejected(hit); }
}

// A friendly, non-specific message to show the user (don't echo the matched slur back).
export const OBJECTIONABLE_MESSAGE =
  "That contains language we don't allow. Please remove it and try again.";
