import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE } from '../../../theme';
import { signCreatorVideo, fetchOverlayRecipe } from '../../../infrastructure/creatorStudio/api';
import { EffectClockProvider } from '../effectClock';
import EffectLayer from './EffectLayer';
import { isEmptyRecipe, type OverlayRecipe } from '../effectRecipe';

// Bunny's embed page has a white background that shows around portrait video. Force
// only the PAGE (html/body) black — never the player container or <video>, because in
// WKWebView the inline video is a separate hardware layer and an opaque background on
// those elements fills the compositing hole and blacks out the picture.
const BLACK_BG_CSS = `(function(){
  var s=document.createElement('style');
  s.innerHTML='html,body{background:#000 !important;margin:0 !important;}';
  document.head.appendChild(s); true;
})();`;

// Reports the played video's on-screen picture rect + play state out to RN, so the overlay
// effect layer can sit exactly on the video and pause/play in sync. Recomputes the picture
// box from the <video>'s intrinsic size (object-fit: contain letterboxing). Also keeps the
// video inline (no native fullscreen that would cover the RN overlay) and swallows the
// double-tap-to-fullscreen gesture.
const BRIDGE_JS = `(function(){
  function post(){
    var v=document.querySelector('video'); if(!v||!window.ReactNativeWebView) return;
    var r=v.getBoundingClientRect();
    var vw=v.videoWidth||r.width, vh=v.videoHeight||r.height;
    var scale=Math.min(r.width/vw, r.height/vh) || 1;
    var pw=vw*scale, ph=vh*scale;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      x:r.left+(r.width-pw)/2, y:r.top+(r.height-ph)/2, w:pw, h:ph, playing:!v.paused,
    }));
  }
  function firstFrame(){ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify({firstFrame:true})); } }
  function bind(){
    var v=document.querySelector('video');
    if(!v){ setTimeout(bind,300); return; }
    // Force inline playback so a tap/double-tap can't hand off to the native fullscreen
    // player (which would render above the RN overlay and hide the effects).
    v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
    v.addEventListener('webkitbeginfullscreen', function(){ try { v.webkitExitFullscreen && v.webkitExitFullscreen(); } catch(e){} });
    ['play','pause','playing','loadedmetadata','timeupdate'].forEach(function(e){ v.addEventListener(e, post); });
    v.addEventListener('timeupdate', firstFrame); // fires once real frames are decoding
    window.addEventListener('resize', post);
    setInterval(post, 500); // keep the rect fresh through orientation / chrome changes
    post();
  }
  // Swallow double-tap (it triggers the player's fullscreen/zoom) before the player sees it.
  document.addEventListener('dblclick', function(e){ e.preventDefault(); e.stopPropagation(); }, true);
  bind(); true;
})();`;

// Plays a creator (Bunny) video via its token-authenticated iframe embed, with the animated
// overlay layer replayed live on top — positioned to the real video rect and clock-gated to
// the embed's play state (bridged out via injected JS).
export default function BunnyEmbedPlayer({
  postId, title, onClose,
}: { postId: string; title: string; onClose: () => void }) {
  const { top } = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const webRef = useRef<WebView>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<OverlayRecipe | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false); // true once real frames decode

  useEffect(() => {
    signCreatorVideo(postId)
      .then(setEmbedUrl)
      .catch((e) => setError(e?.message ?? 'This video is unavailable.'));
    fetchOverlayRecipe(postId).then(setRecipe).catch(() => {});
  }, [postId]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.firstFrame) { setFirstFrame(true); }
      if (typeof m.x === 'number' && m.w > 0) { setRect({ x: m.x, y: m.y, w: m.w, h: m.h }); }
      if (typeof m.playing === 'boolean') { setPlaying(m.playing); }
    } catch { /* ignore non-JSON messages */ }
  };

  const showFx = !isEmptyRecipe(recipe) && !!rect;

  return (
    <View style={styles.container}>
      {/* Full-screen video */}
      {embedUrl && (
        <WebView
          ref={webRef}
          source={{ uri: embedUrl }}
          // Explicit pixel size — absoluteFill collapsed to width:0 inside some parents,
          // hiding the (playing) video. Window dimensions can't be zero.
          style={{ width, height, backgroundColor: '#000' }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo={false}
          javaScriptEnabled
          injectedJavaScript={`${BLACK_BG_CSS}${BRIDGE_JS}`}
          onMessage={onMessage}
          onLoadEnd={() => { webRef.current?.injectJavaScript(BLACK_BG_CSS); webRef.current?.injectJavaScript(BRIDGE_JS); }}
        />
      )}

      {/* Mask the WKWebView green/black compositing flash in the gap between pressing play
          and the first decoded frame (pointerEvents none so the play button stays tappable). */}
      {playing && !firstFrame && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />}

      {/* Animated overlay layer, pinned to the real video rect, clock-gated to play state */}
      {showFx && rect && (
        <View pointerEvents="none" style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
          <EffectClockProvider playing={playing}>
            <EffectLayer recipe={recipe!} width={rect.w} height={rect.h} />
          </EffectClockProvider>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {!embedUrl && !error && <ActivityIndicator color={C.ACCENT} style={StyleSheet.absoluteFill} />}

      {/* Floating close button over the video */}
      <TouchableOpacity onPress={onClose} hitSlop={12} style={[styles.closeBtn, { top: top + SPACE.SM }]}>
        <Ionicons name="chevron-back" size={26} color={C.WHITE} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  closeBtn: {
    position: 'absolute', left: SPACE.LG, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
  },
  error: { color: C.MUTED, fontFamily: FONT.BODY, paddingHorizontal: SPACE.XL, textAlign: 'center' },
});
