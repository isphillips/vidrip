import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import YoutubePlayer from 'react-native-youtube-iframe';
import TikTokPlayer from '../../../components/TikTokPlayer';
import { IG_BLOCK_LAUNCH_JS } from '../../shared/igBlockLaunch';
import { log } from '../../../infrastructure/logging/logger';

// ── PROTOTYPE: 1-deep "warm next" video pool ─────────────────────────────────────
// Embedded videos (YouTube/TikTok/IG/FB) can't be fully pre-downloaded — their players own buffering.
// But the bulk of the perceived stall is COLD-START: WebView spin-up, DNS/TLS, loading the platform's
// player JS, the player-ready handshake, then the first media segments. This component attacks exactly
// that: while the Feed is on screen it pre-mounts the next source off-screen so its player JS + page (and,
// for YouTube, the first ~8s of muted media) land in the WebView's SHARED HTTP cache before the user taps.
// When the recorder then mounts its own (fresh) WebView for the same video, it hits those warm caches.
//
// Per-source warming strategy (audio-safe):
//   • YouTube  → muted autoplay for ~8s → real partial media buffer (only source where muted autoplay is safe).
//   • TikTok   → mount the embed (its iframe is autoplay:false) → warms WebView + TikTok player JS, no audio.
//   • Instagram→ mount the reel page (reels are tap-to-play) → warms page + JS + poster, no audio.
//   • Facebook → mount the plugins/video.php iframe with autoplay=false → warms it, no audio.
//
// Still 1-DEEP: exactly one warm player at a time (matched to the next source's type), because memory is the
// ceiling — we OOM'd on one camera + one video WebView on mid Android, which has only 1–2 hardware decoders.
// Focus-gated: only warms while the Feed is visible; unmounts (stops fetching) on navigate-away.
// Flip FEED_VIDEO_WARM to false to A/B the cold-start with/without warming.
export type WarmSource = 'youtube' | 'tiktok' | 'instagram' | 'facebook';
export const FEED_VIDEO_WARM = true;

const WARM_BUFFER_MS = 8000;   // YouTube: stop fetching more after this — enough to seed player JS + first segments
const TINY = { width: 2, height: 2 } as const;

// Mirror the recorder's FB embed (autoplay=false → loads but never plays/audio), so the warm cache matches.
function fbWarmHtml(videoId: string): string {
  const href = videoId.startsWith('http') ? videoId : `https://www.facebook.com/reel/${videoId}`;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}html,body{background:#000;overflow:hidden}iframe{width:100vw;height:100vh;border:0}</style></head><body><iframe src="https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&autoplay=false&mute=false&allowfullscreen=true" allow="autoplay;fullscreen;encrypted-media" allowfullscreen scrolling="no"></iframe></body></html>`;
}

const httpsGuard = (req: { url: string }) =>
  req.url.startsWith('https://') || req.url.startsWith('about:') || req.url.startsWith('data:');

export default function FeedVideoWarmer({ videoId, sourceType }: { videoId: string | null; sourceType: WarmSource | null }) {
  const focused = useIsFocused();
  // YouTube only: buffer for a bounded window, then pause (fetched segments stay in the WebView cache).
  const [play, setPlay] = useState(true);
  useEffect(() => {
    if (!videoId || sourceType !== 'youtube') { return; }
    setPlay(true);
    const t = setTimeout(() => setPlay(false), WARM_BUFFER_MS);
    return () => clearTimeout(t);
  }, [videoId, sourceType]);

  if (!FEED_VIDEO_WARM || !videoId || !sourceType || !focused) { return null; }

  let inner: React.ReactNode = null;
  if (sourceType === 'youtube') {
    inner = (
      <YoutubePlayer
        key={videoId}
        videoId={videoId}
        height={2}
        width={2}
        play={play}
        mute
        initialPlayerParams={{ controls: false, rel: false }}
      />
    );
  } else if (sourceType === 'tiktok') {
    inner = (
      <TikTokPlayer
        key={videoId}
        videoId={videoId}
        controls={false}
        style={TINY}
      />
    );
  } else if (sourceType === 'instagram') {
    inner = (
      <WebView
        key={videoId}
        style={TINY}
        source={{ uri: `https://www.instagram.com/reel/${videoId}/?l=1` }}
        injectedJavaScriptBeforeContentLoaded={IG_BLOCK_LAUNCH_JS}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={httpsGuard}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
      />
    );
  } else if (sourceType === 'facebook') {
    inner = (
      <WebView
        key={videoId}
        style={TINY}
        source={{ html: fbWarmHtml(videoId), baseUrl: 'https://www.facebook.com' }}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={httpsGuard}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
      />
    );
  }

  return <View style={styles.host} pointerEvents="none">{inner}</View>;
}

const styles = StyleSheet.create({
  // Off-screen + invisible, but still MOUNTED so the WebView loads & warms. 2×2 (not 0) so the player
  // actually initializes; pushed far off-screen + opacity 0 so it's never seen and never takes a touch.
  host: { position: 'absolute', width: 2, height: 2, left: -9999, top: -9999, opacity: 0 },
});
