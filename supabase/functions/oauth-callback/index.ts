import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Providers require an https redirect (custom schemes rejected) and block OAuth
// inside embedded WebViews. So the auth happens in the system browser, redirects
// here, and this page bounces back into the app via the reaxn:// deep link.
Deno.serve((req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error") ?? "";
  const errorDescription = url.searchParams.get("error_description") ?? "";

  // Forward state + error_description on the error path too, so the app knows
  // which provider failed and can show the provider's actual reason.
  const deepLink = error
    ? `reaxn://oauth?error=${encodeURIComponent(error)}` +
      `&error_description=${encodeURIComponent(errorDescription)}` +
      `&state=${encodeURIComponent(state)}`
    : `reaxn://oauth?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

  // 302 straight to the app's custom scheme — no HTML body to mis-render.
  return new Response(null, {
    status: 302,
    headers: { Location: deepLink },
  });
});
