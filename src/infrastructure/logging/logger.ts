/**
 * App logger. In development it forwards to the console; in production info/warn stay silent
 * and errors route to `reportError` — the single hook point for wiring a crash reporter
 * (Sentry/Crashlytics) later. Use this instead of raw `console.*` (which lint now bans),
 * keeping the existing `[scope]` tags at call sites.
 */
/* eslint-disable no-console */
type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

// Production error sink. No-op today; replace the body to forward to a crash reporter.
const reportError: LogFn = () => {};

export const log: { info: LogFn; warn: LogFn; error: LogFn } = __DEV__
  ? {
      info: (...a) => console.info(...a),
      warn: (...a) => console.warn(...a),
      error: (...a) => console.error(...a),
    }
  : { info: noop, warn: noop, error: reportError };
