import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleProp, ViewStyle, View, StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { tikTokPlayerUrl } from '../infrastructure/tiktok/api';

// State strings mirror react-native-youtube-iframe's onChangeState so this
// component drops into the same sync handlers (handleYtStateChange etc.).
export type PlayerState =
  | 'unstarted'
  | 'ended'
  | 'playing'
  | 'paused'
  | 'buffering';

// TikTok embed Player API onStateChange values → our shared state strings.
const TT_STATE: Record<number, PlayerState> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
};

export type TikTokPlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  mute: () => void;
  unMute: () => void;
};

type Props = {
  videoId: string;
  controls?: boolean;
  // Mute on ready — used for the source PIP on watch screens (the reaction
  // video carries the audio, mirroring the muted YouTube PIP).
  startMuted?: boolean;
  onChangeState?: (state: PlayerState) => void;
  onReady?: () => void;
  onCurrentTime?: (currentTime: number, duration: number) => void;
  // Fired when the user taps the player (detected via the window blurring as focus enters the iframe).
  // Used by the recorder to show a loading spinner between the tap and playback beginning.
  onUserTap?: () => void;
  style?: StyleProp<ViewStyle>;
};

// Local host page: embeds the TikTok player iframe and bridges its postMessage
// events to RN, and relays RN commands back into the iframe. This mirrors how
// react-native-youtube-iframe wraps the YT iframe API.
function buildHtml(src: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body{margin:0;padding:0;height:100%;background:#000;overflow:hidden}#tt{width:100%;height:100%;border:0}</style>
</head>
<body>
<iframe id="tt" src="${src}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>
<script>
  (function(){
    var iframe = document.getElementById('tt');
    function send(obj){
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    }
    // RN -> player command bridge.
    window.__tt = function(type, value){
      iframe.contentWindow.postMessage(
        { 'x-tiktok-player': true, type: type, value: value },
        '*'
      );
    };
    // player -> RN event bridge.
    window.addEventListener('message', function(e){
      var d = e.data;
      if (!d) { return; }
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (_) { return; } }
      if (typeof d.type !== 'string') { return; }
      if (d.type.indexOf('on') !== 0) { return; }
      send({ type: d.type, value: d.value });
    });
    // Tap detection: touch events inside the (cross-origin) player iframe never reach this document,
    // but tapping it moves focus into the iframe, blurring this window — the one reliable signal that
    // the user tapped play. Armed after a beat so load-time focus churn doesn't count as a tap; fires
    // once. Lets the host show a spinner over the gap between the tap and playback actually starting.
    var _tapped = false;
    setTimeout(function(){
      window.addEventListener('blur', function(){
        if (_tapped) { return; }
        _tapped = true;
        send({ type: 'onUserTap' });
      });
    }, 1000);
  })();
  true;
</script>
</body>
</html>`;
}

const TikTokPlayer = forwardRef<TikTokPlayerHandle, Props>(function TikTokPlayer(
  { videoId, controls = true, startMuted = false, onChangeState, onReady, onCurrentTime, onUserTap, style },
  ref,
) {
  const webRef = useRef<WebView>(null);
  // `onReady` fires once — from the embed's onPlayerReady, or from a load-based fallback (below).
  const readyRef = useRef(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const html = useMemo(
    () => buildHtml(tikTokPlayerUrl(videoId, { controls, autoplay: false })),
    [videoId, controls],
  );

  const command = useCallback((type: string, value?: number) => {
    const arg = value === undefined ? 'undefined' : JSON.stringify(value);
    webRef.current?.injectJavaScript(`window.__tt && window.__tt(${JSON.stringify(type)}, ${arg}); true;`);
  }, []);

  const fireReady = useCallback(() => {
    if (readyRef.current) { return; }
    readyRef.current = true;
    if (readyTimer.current) { clearTimeout(readyTimer.current); readyTimer.current = null; }
    if (startMuted) { command('mute'); }
    onReady?.();
  }, [onReady, startMuted, command]);

  // Android safety net: the TikTok embed's onPlayerReady postMessage often never reaches the host there,
  // which would leave a readiness-gated caller (the reaction recorder's veil) spinning forever. Once the
  // page has loaded, reveal after a short grace period even if onPlayerReady never arrives. iOS gets
  // onPlayerReady near-instantly, so this fallback no-ops there.
  const scheduleReadyFallback = useCallback(() => {
    if (readyRef.current || readyTimer.current) { return; }
    readyTimer.current = setTimeout(fireReady, 1800);
  }, [fireReady]);

  useEffect(() => () => { if (readyTimer.current) { clearTimeout(readyTimer.current); } }, []);

  useImperativeHandle(
    ref,
    () => ({
      play: () => command('play'),
      pause: () => command('pause'),
      seekTo: (seconds: number) => command('seekTo', seconds),
      mute: () => command('mute'),
      unMute: () => command('unMute'),
    }),
    [command],
  );

  const handleMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: { type: string; value?: any };
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'onPlayerReady':
          fireReady();
          break;
        case 'onStateChange': {
          const state = TT_STATE[Number(msg.value)];
          if (state) { onChangeState?.(state); }
          break;
        }
        case 'onCurrentTime':
          if (msg.value) {
            onCurrentTime?.(Number(msg.value.currentTime), Number(msg.value.duration));
          }
          break;
        case 'onUserTap':
          onUserTap?.();
          break;
        default:
          break;
      }
    },
    [onChangeState, onCurrentTime, fireReady, onUserTap],
  );

  return (
    <WebView
      ref={webRef as any}
      style={style}
      source={{ html, baseUrl: 'https://www.tiktok.com' }}
      // Block "open in the TikTok app" redirects (snssdk*://, tiktok://, …). Without this, on a device
      // with TikTok installed the embed redirects to its app scheme, WKWebView can't load it, and shows
      // "Error loading page · Redirection to URL with a scheme that is not HTTP(S)" — a full-screen blank
      // that reads as "the app didn't load content" (App Store 2.1 rejection). Cancelling the navigation
      // here keeps the embedded player in place. originWhitelist double-gates it at the load layer.
      originWhitelist={['https://*', 'http://*']}
      onShouldStartLoadWithRequest={req => {
        const u = req.url || '';
        return u.startsWith('https://') || u.startsWith('http://') || u.startsWith('about:') || u.startsWith('data:');
      }}
      onMessage={handleMessage}
      onLoadEnd={scheduleReadyFallback}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      setSupportMultipleWindows={false}
      // Safety net: if a load ever does fail, show black (the player bg) instead of WKWebView's scary
      // default "Error loading page" white screen.
      renderError={() => <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />}
    />
  );
});

export default TikTokPlayer;
