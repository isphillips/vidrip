import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE } from '../../../theme';
import { signCreatorVideo } from '../../../infrastructure/creatorStudio/api';

// The Bunny embed page itself has a white background that shows around the (portrait)
// video — force the page + player + video backgrounds to black.
const BLACK_BG_CSS = `(function(){
  var s=document.createElement('style');
  s.innerHTML='html,body,#bunny-stream-embed,.vjs-poster,video,iframe{background:#000 !important;margin:0 !important;}';
  document.head.appendChild(s); true;
})();`;

// Plays a creator (Bunny) video via its token-authenticated iframe embed — Bunny's
// player handles HLS + segment token delivery (raw HLS would 403 on segments).
// Shared by the Studio player and the in-channel creator-video viewer.
export default function BunnyEmbedPlayer({
  postId, title, onClose,
}: { postId: string; title: string; onClose: () => void }) {
  const { top } = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    signCreatorVideo(postId)
      .then(setEmbedUrl)
      .catch((e) => setError(e?.message ?? 'This video is unavailable.'));
  }, [postId]);

  return (
    <View style={styles.container}>
      {/* Full-screen video */}
      {embedUrl && (
        <WebView
          ref={webRef}
          source={{ uri: embedUrl }}
          style={styles.player}
          // iOS WKWebView is opaque-white by default — transparent + black parent
          // kills the white frame (not in this version's TS types, but valid at runtime).
          {...({ opaque: false } as any)}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          javaScriptEnabled
          injectedJavaScript={BLACK_BG_CSS}
          onLoadEnd={() => webRef.current?.injectJavaScript(BLACK_BG_CSS)}
        />
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
  player: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute', left: SPACE.LG, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
  },
  error: { color: C.MUTED, fontFamily: FONT.BODY, paddingHorizontal: SPACE.XL, textAlign: 'center' },
});
