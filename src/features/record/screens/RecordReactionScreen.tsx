import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import type { RecordStackScreenProps } from '../../../app/navigation/types';

export default function RecordReactionScreen({
  navigation,
}: RecordStackScreenProps<'RecordReaction'>) {
  return (
    <View style={styles.container}>
      {/* Top half: YouTube Short */}
      <View style={styles.videoPane}>
        <Text style={styles.icon}>▶</Text>
        <Text style={styles.paneLabel}>short plays here</Text>
      </View>

      {/* Bottom half: front camera */}
      <View style={styles.cameraPane}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.paneLabel}>your reaction</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.recordButton}>
          <View style={styles.recordDot} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BLACK },
  videoPane: {
    flex: 1,
    backgroundColor: C.SURFACE_2,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: C.ACCENT,
    gap: SPACE.SM,
  },
  cameraPane: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.SM,
  },
  icon: { fontSize: 40 },
  paneLabel: { fontSize: FONT.SIZES.MD, color: C.MUTED },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.FULL,
    borderWidth: 4,
    borderColor: C.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.FULL,
    backgroundColor: C.ACCENT,
  },
  closeButton: {
    position: 'absolute',
    top: SPACE.XL,
    right: SPACE.LG,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: RADIUS.FULL,
  },
  closeText: { color: C.WHITE, fontSize: FONT.SIZES.LG },
});
