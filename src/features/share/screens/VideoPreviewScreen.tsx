import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { ShareStackScreenProps } from '../../../app/navigation/types';

export default function VideoPreviewScreen({
  route,
  navigation,
}: ShareStackScreenProps<'VideoPreview'>) {
  const { videoId, videoTitle, videoThumbnail, channelTitle } = route.params;
  const { width } = useWindowDimensions();
  const [playing, setPlaying] = useState(true);
  const playerHeight = Math.round(width * (9 / 16));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} bounces={false}>
      {/* Player */}
      <View style={[styles.playerWrap, { height: playerHeight }]}>
        <YoutubePlayer
          height={playerHeight}
          width={width}
          videoId={videoId}
          play={playing}
          onChangeState={(state) => {
            if (state === 'ended') { setPlaying(false); }
          }}
          initialPlayerParams={{ rel: 0, modestbranding: 1, controls: 1 }}
          webViewStyle={{ backgroundColor: C.BLACK }}
        />
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title}>{videoTitle}</Text>
        <Text style={styles.channel}>{channelTitle}</Text>
      </View>

      {/* Share button */}
      <TouchableOpacity
        style={styles.shareBtn}
        activeOpacity={0.85}
        onPress={() =>
          navigation.navigate('SelectRecipients', { videoId, videoTitle, videoThumbnail })
        }>
        <Text style={styles.shareBtnText}>Share with Friends →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG },
  content: { flexGrow: 1 },
  playerWrap: { backgroundColor: C.BLACK },
  info: {
    padding: SPACE.LG,
    gap: SPACE.XS,
    borderBottomWidth: 1,
    borderBottomColor: C.BORDER,
  },
  title: {
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.DISPLAY_SEMIBOLD,
    color: C.INK,
    lineHeight: 24,
  },
  channel: {
    fontSize: FONT.SIZES.SM,
    fontFamily: FONT.BODY,
    color: C.MUTED,
  },
  shareBtn: {
    backgroundColor: C.ACCENT,
    borderRadius: RADIUS.MD,
    margin: SPACE.LG,
    padding: SPACE.LG,
    alignItems: 'center',
  },
  shareBtnText: {
    color: C.WHITE,
    fontSize: FONT.SIZES.LG,
    fontFamily: FONT.BODY_BOLD,
    fontWeight: '700',
  },
});
