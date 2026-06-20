# cleanup-shorts

Prunes the `shorts` discovery feed of YouTube videos that are no longer playable — **deleted, set
private, channel terminated, embedding disabled, or upload failed/rejected**. The fetchers
(`fetch-latest-shorts` / `fetch-shorts` / `fetch-channel-shorts`) already drop rows older than 7 days;
this removes ones that died *inside* that window so the feed never shows a blank/unavailable card.

## How it detects "dead"
Calls `youtube/v3/videos?part=status&id=<≤50 ids>`. A deleted/private/terminated video is simply
**absent** from the response → counted dead. Present-but-unplayable (`embeddable: false`, or
`uploadStatus` of `failed|rejected|deleted`) is also removed. Public/unlisted videos stay (they play).

**Quota:** 1 unit per 50 ids → `ceil(rows / 50)` units per run. Check the size first:
```sql
select count(*) as rows, ceil(count(*) / 50.0) as chunks from shorts;
```

## Safety
- Only deletes ids confirmed missing from a **successful** API response. If a batch call fails
  (network/quota/5xx), that batch is **skipped** — "no response" is never treated as "deleted".
- Deletes are chunked (`IN (...)` of 200).
- Auth: requires the `x-internal-secret` header (same secret as the fetch-* functions).

## Env vars
| var | notes |
|---|---|
| `YOUTUBE_API_KEY_MP` | YouTube Data API v3 key (same one the fetchers use) |
| `INTERNAL_SECRET` | shared secret for the `x-internal-secret` header |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | auto-injected in Supabase Edge runtime |

## Deploy
```bash
supabase functions deploy cleanup-shorts
```

## Dry run first (deletes nothing — returns the dead ids)
```bash
curl -X POST "https://<project>.functions.supabase.co/cleanup-shorts?dryRun=1" \
  -H "x-internal-secret: $INTERNAL_SECRET"
# → { ok, total, checked, dead, deleted: 0, dryRun: true, deadIds: [...] }
```
Eyeball `deadIds` against a couple you know are gone, then run for real (omit `dryRun`).

## Schedule
Trigger it on whatever scheduler already runs `fetch-latest-shorts` / `cleanup-reactions` (the repo
has no `pg_cron`, so it's an external scheduler). Run **every ~3h**, ideally a beat *after* the ingest.

A POST with the secret header is all it needs:
```
POST https://<project>.functions.supabase.co/cleanup-shorts
x-internal-secret: <INTERNAL_SECRET>
```

If you'd rather schedule from inside Postgres instead, use `pg_cron` + `pg_net`:
```sql
select cron.schedule(
  'cleanup-shorts', '17 */3 * * *',  -- every 3h, offset from the ingest
  $$ select net.http_post(
       url    := 'https://<project>.functions.supabase.co/cleanup-shorts',
       headers:= jsonb_build_object('x-internal-secret', '<INTERNAL_SECRET>')
     ); $$
);
```
