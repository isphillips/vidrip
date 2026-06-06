import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleProp, ViewStyle } from 'react-native';
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
  })();
  true;
</script>
</body>
</html>`;
}

const TikTokPlayer = forwardRef<TikTokPlayerHandle, Props>(function TikTokPlayer(
  { videoId, controls = true, startMuted = false, onChangeState, onReady, onCurrentTime, style },
  ref,
) {
  const webRef = useRef<WebView>(null);

  const html = useMemo(
    () => buildHtml(tikTokPlayerUrl(videoId, { controls, autoplay: false })),
    [videoId, controls],
  );

  const command = useCallback((type: string, value?: number) => {
    const arg = value === undefined ? 'undefined' : JSON.stringify(value);
    webRef.current?.injectJavaScript(`window.__tt && window.__tt(${JSON.stringify(type)}, ${arg}); true;`);
  }, []);

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
          if (startMuted) { command('mute'); }
          onReady?.();
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
        default:
          break;
      }
    },
    [onChangeState, onReady, onCurrentTime, startMuted, command],
  );

  return (
    <WebView
      ref={webRef}
      style={style}
      source={{ html, baseUrl: 'https://www.tiktok.com' }}
      originWhitelist={['*']}
      onMessage={handleMessage}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      setSupportMultipleWindows={false}
    />
  );
});

export default TikTokPlayer;
