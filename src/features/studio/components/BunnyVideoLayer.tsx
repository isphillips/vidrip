import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { EffectClockProvider } from '../effectClock';
import EffectLayer from './EffectLayer';
import { isEmptyRecipe, type OverlayRecipe } from '../effectRecipe';

// Force only the embed PAGE (html/body) black — never the player/<video> (in WKWebView the
// inline video is a separate hardware layer; an opaque bg on it fills the compositing hole).
const BLACK_BG_CSS = `(function(){
  var s=document.createElement('style');
  s.innerHTML='html,body{background:#000 !important;margin:0 !important;}';
  document.head.appendChild(s); true;
})();`;

// Make the embed's <video> exactly FIT the WebView viewport — pinned to the viewport (not its player
// container, which can be larger than the box and overflow/zoom the video) and contained so the whole
// frame is visible. For small previews. Opt-in (breaks the overlay rect math, so don't pass a recipe).
const FIT_CSS = `(function(){
  var s=document.createElement('style');
  s.innerHTML='video{position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;object-fit:contain !important;background:#000 !important;margin:0 !important;}';
  document.head.appendChild(s); true;
})();`;

// Bridges the played video out of the Bunny embed: the picture rect (for pinning the overlay),
// play/pause state (for the clock + driving recording), first-frame (for the flash mask), and
// ended. Also forces inline playback so a tap can't promote to native fullscreen.
const BRIDGE_JS = `(function(){
  function post(extra){
    var v=document.querySelector('video'); if(!v||!window.ReactNativeWebView) return;
    var r=v.getBoundingClientRect();
    var vw=v.videoWidth||r.width, vh=v.videoHeight||r.height;
    var scale=Math.min(r.width/vw, r.height/vh) || 1;
    var pw=vw*scale, ph=vh*scale;
    var m={ x:r.left+(r.width-pw)/2, y:r.top+(r.height-ph)/2, w:pw, h:ph, playing:!v.paused, dur:(isFinite(v.duration)?v.duration:0) };
    if(extra){ for(var k in extra){ m[k]=extra[k]; } }
    window.ReactNativeWebView.postMessage(JSON.stringify(m));
  }
  function bind(){
    var v=document.querySelector('video');
    if(!v){ setTimeout(bind,300); return; }
    v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
    v.addEventListener('webkitbeginfullscreen', function(){ try { v.webkitExitFullscreen && v.webkitExitFullscreen(); } catch(e){} });
    ['play','pause','playing','loadedmetadata'].forEach(function(e){ v.addEventListener(e, function(){ post(); }); });
    v.addEventListener('timeupdate', function(){ post({ firstFrame:true }); });
    v.addEventListener('ended', function(){ post({ ended:true }); });
    window.addEventListener('resize', function(){ post(); });
    setInterval(function(){ post(); }, 500);
    post();
  }
  document.addEventListener('dblclick', function(e){ e.preventDefault(); e.stopPropagation(); }, true);
  bind(); true;
})();`;

export type BunnyPlayState = 'playing' | 'paused' | 'ended';

// Plays a creator (Bunny) video via its signed iframe embed and reconstructs the animated
// overlay layer live on top — pinned to the real video rect, clock-gated to play state.
// Reusable by the watch player and the reaction recorder.
// Mutes/unmutes the embed's <video> (retries until it exists).
const muteJs = (m: boolean) =>
  `(function(){function go(){var v=document.querySelector('video'); if(!v){return setTimeout(go,200);} v.muted=${m};} go(); true;})();`;

export default function BunnyVideoLayer({
  embedUrl, recipe, onStateChange, onFirstFrame, onDuration, autoplay = true, muted = false, fit = false, style,
}: {
  embedUrl: string;
  recipe?: OverlayRecipe | null;
  onStateChange?: (state: BunnyPlayState) => void;
  onFirstFrame?: () => void;
  // The source video's own length (seconds), once the embed's <video> reports it.
  onDuration?: (seconds: number) => void;
  // When false, playback requires a user gesture (no autoplay) — e.g. the reaction recorder,
  // where the user's tap to play is also what starts the recording.
  autoplay?: boolean;
  // Mute the source audio (e.g. reaction playback recorded without headphones — the source
  // already bled into the mic, so playing it again would double up).
  muted?: boolean;
  // Fit the whole video to the WebView box (viewport-pinned, contained) — for small previews. Don't pass
  // a recipe with this (it bypasses the overlay rect math).
  fit?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const webRef = useRef<WebView>(null);
  useEffect(() => { webRef.current?.injectJavaScript(muteJs(muted)); }, [muted]);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const prevPlaying = useRef(false);
  const firstFrameSent = useRef(false);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.firstFrame && !firstFrameSent.current) { firstFrameSent.current = true; setFirstFrame(true); onFirstFrame?.(); }
      if (typeof m.dur === 'number' && m.dur > 0) { onDuration?.(m.dur); }
      if (typeof m.x === 'number' && m.w > 0) { setRect({ x: m.x, y: m.y, w: m.w, h: m.h }); }
      if (m.ended) { setPlaying(false); prevPlaying.current = false; onStateChange?.('ended'); return; }
      if (typeof m.playing === 'boolean') {
        setPlaying(m.playing);
        if (m.playing !== prevPlaying.current) {
          prevPlaying.current = m.playing;
          onStateChange?.(m.playing ? 'playing' : 'paused');
        }
      }
    } catch { /* ignore non-JSON messages */ }
  };

  const showFx = !isEmptyRecipe(recipe) && !!rect;

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <WebView
        ref={webRef as any}
        source={{ uri: embedUrl }}
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={!autoplay}
        allowsFullscreenVideo={false}
        javaScriptEnabled
        // Block any non-http(s) redirect (app deep links, store links) so a stray redirect can't surface
        // WKWebView's "Redirection to URL with a scheme that is not HTTP(S)" error page over the video.
        originWhitelist={['https://*', 'http://*']}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={req => {
          const u = req.url || '';
          return u.startsWith('https://') || u.startsWith('http://') || u.startsWith('about:') || u.startsWith('data:');
        }}
        injectedJavaScript={`${BLACK_BG_CSS}${fit ? FIT_CSS : ''}${BRIDGE_JS}`}
        onMessage={onMessage}
        onLoadEnd={() => { webRef.current?.injectJavaScript(BLACK_BG_CSS); if (fit) { webRef.current?.injectJavaScript(FIT_CSS); } webRef.current?.injectJavaScript(BRIDGE_JS); webRef.current?.injectJavaScript(muteJs(muted)); }}
        renderError={() => <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />}
      />

      {/* Mask the WKWebView green/black flash between play start and the first frame. */}
      {playing && !firstFrame && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />}

      {showFx && rect && (
        <View pointerEvents="none" style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          <EffectClockProvider playing={playing}>
            <EffectLayer recipe={recipe!} width={rect.w} height={rect.h} />
          </EffectClockProvider>
        </View>
      )}
    </View>
  );
}
