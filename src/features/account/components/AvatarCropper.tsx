import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, useWindowDimensions, Alert, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import ImageEditor from '@react-native-community/image-editor';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, FONT, SPACE, RADIUS } from '../../../theme';

type Props = {
  image: { uri: string; width: number; height: number };
  onCancel: () => void;
  onDone: (uri: string) => void;
};

const OUT = 512; // output avatar size (px)

export default function AvatarCropper({ image, onCancel, onDone }: Props) {
  const { width } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const CROP = Math.min(width - SPACE.XL * 2, 320);

  const imgW = image.width || 1;
  const imgH = image.height || 1;
  // Cover fit: at scale 1 the shorter side exactly fills the crop window.
  const baseScale = CROP / Math.min(imgW, imgH);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [busy, setBusy] = useState(false);

  const clamp = () => {
    'worklet';
    const dispW = imgW * baseScale * scale.value;
    const dispH = imgH * baseScale * scale.value;
    const maxX = Math.max(0, (dispW - CROP) / 2);
    const maxY = Math.max(0, (dispH - CROP) / 2);
    tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
    ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate(e => { scale.value = Math.min(4, Math.max(1, savedScale.value * e.scale)); clamp(); })
    .onEnd(() => { savedScale.value = scale.value; });
  const pan = Gesture.Pan()
    .onUpdate(e => { tx.value = savedTx.value + e.translationX; ty.value = savedTy.value + e.translationY; clamp(); })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });
  const gesture = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));
  const imageBase = { width: imgW * baseScale, height: imgH * baseScale };

  const handleUse = async () => {
    if (busy) { return; }
    setBusy(true);
    try {
      const s = scale.value;
      const dispW = imgW * baseScale * s;
      const dispH = imgH * baseScale * s;
      const factor = imgW / dispW; // image px per displayed px
      let cropX = (dispW / 2 - CROP / 2 - tx.value) * factor;
      let cropY = (dispH / 2 - CROP / 2 - ty.value) * factor;
      const cropW = CROP * factor;
      const cropH = CROP * factor;
      cropX = Math.max(0, Math.min(cropX, imgW - cropW));
      cropY = Math.max(0, Math.min(cropY, imgH - cropH));
      const out: any = await ImageEditor.cropImage(image.uri, {
        offset: { x: cropX, y: cropY },
        size: { width: cropW, height: cropH },
        displaySize: { width: OUT, height: OUT },
        resizeMode: 'cover',
      });
      onDone(typeof out === 'string' ? out : (out.uri ?? out.path));
    } catch (e: any) {
      Alert.alert('Crop', e?.message ?? 'Could not crop the image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={onCancel}>
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.header, { paddingTop: top + SPACE.MD }]}>
          <Text style={styles.title}>Adjust your photo</Text>
          <Text style={styles.hint}>Pinch to zoom · drag to position</Text>
        </View>

        <View style={styles.stage}>
          <GestureDetector gesture={gesture}>
            <View style={[styles.window, { width: CROP, height: CROP, borderRadius: CROP / 2 }]}>
              <Animated.Image source={{ uri: image.uri }} style={[imageBase, imageStyle]} resizeMode="cover" />
            </View>
          </GestureDetector>
          {/* Gold ring overlay */}
          <View pointerEvents="none" style={[styles.ring, { width: CROP, height: CROP, borderRadius: CROP / 2 }]} />
        </View>

        <View style={[styles.actions, { paddingBottom: bottom + SPACE.LG }]}>
          <TouchableOpacity style={styles.btnGhost} onPress={onCancel} disabled={busy}>
            <Text style={styles.btnGhostText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSolid, busy && styles.btnDisabled]} onPress={handleUse} disabled={busy}>
            {busy ? <ActivityIndicator color={C.BG} /> : <Text style={styles.btnSolidText}>Use Photo</Text>}
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.BG },
  header: { alignItems: 'center', paddingHorizontal: SPACE.LG, gap: SPACE.XS, paddingBottom: SPACE.MD },
  title: { fontSize: FONT.SIZES.XL, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  hint: { fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY, color: C.MUTED },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  window: { overflow: 'hidden', backgroundColor: C.BLACK, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: C.GOLD },
  actions: { flexDirection: 'row', gap: SPACE.MD, paddingHorizontal: SPACE.LG, paddingTop: SPACE.MD },
  btnGhost: { flex: 1, height: 52, borderRadius: RADIUS.MD, borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  btnGhostText: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.MD },
  btnSolid: { flex: 1, height: 52, borderRadius: RADIUS.MD, backgroundColor: C.GOLD, alignItems: 'center', justifyContent: 'center' },
  btnSolidText: { color: C.BG, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.MD, letterSpacing: 1 },
  btnDisabled: { opacity: 0.5 },
});
