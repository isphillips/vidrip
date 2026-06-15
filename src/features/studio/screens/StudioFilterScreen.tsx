import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Canvas, Image as SkImage, ColorMatrix, useImage } from '@shopify/react-native-skia';
import LinearGradient from 'react-native-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { createThumbnail } from 'react-native-create-thumbnail';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { STUDIO_FILTERS, FILTER_CATEGORIES, type StudioFilterDef } from '../filters';
import { adjustMatrix, mul, isIdentity, type CMatrix } from '../colorMatrix';
import SkiaVideoPreview from '../components/SkiaVideoPreview';
import Slider from '../components/Slider';
import GradientButton from '../components/GradientButton';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

const BRAND = ['#FF4FA3', '#A05CFF', '#3B82F6'];
const SWATCH_W = 54;
const SWATCH_H = 72;

const ADJUST_DEFAULT = { brightness: 0, contrast: 1, saturation: 1, exposure: 0, hue: 0 };
type AdjustState = typeof ADJUST_DEFAULT;
const ADJUST_KEYS: { key: keyof AdjustState; label: string; min: number; max: number }[] = [
  { key: 'exposure',   label: 'Exposure',   min: -2, max: 2 },
  { key: 'brightness', label: 'Brightness', min: -1, max: 1 },
  { key: 'contrast',   label: 'Contrast',   min: 0,  max: 2 },
  { key: 'saturation', label: 'Saturation', min: 0,  max: 2 },
  { key: 'hue',        label: 'Hue',        min: -Math.PI, max: Math.PI },
];
const adjustActive = (a: AdjustState) =>
  (Object.keys(ADJUST_DEFAULT) as (keyof AdjustState)[]).some(k => Math.abs(a[k] - ADJUST_DEFAULT[k]) > 1e-3);

// A swatch renders the still through Skia with the preset's color matrix — instant,
// GPU, no native round-trip. Selected one pulses with a branded gradient ring.
function Swatch({
  def, active, img, onPress,
}: { def: StudioFilterDef; active: boolean; img: ReturnType<typeof useImage>; onPress: () => void }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = active
      ? withRepeat(withSequence(withTiming(1.06, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false)
      : withTiming(1, { duration: 200 });
  }, [active, pulse]);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const inner = (
    <View style={styles.swatchInner}>
      {img
        ? <Canvas style={{ width: SWATCH_W, height: SWATCH_H }}>
            <SkImage image={img} x={0} y={0} width={SWATCH_W} height={SWATCH_H} fit="cover">
              <ColorMatrix matrix={def.matrix} />
            </SkImage>
          </Canvas>
        : <ActivityIndicator color={C.SUBTLE} style={StyleSheet.absoluteFill} />}
    </View>
  );
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <Animated.View style={[styles.swatchCol, aStyle]}>
        {active
          ? <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>{inner}</LinearGradient>
          : <View style={[styles.ring, styles.ringIdle]}>{inner}</View>}
        <Text style={[styles.swatchLabel, active && styles.swatchLabelActive]} numberOfLines={1}>{def.label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function StudioFilterScreen({ route, navigation }: StudioStackScreenProps<'StudioFilter'>) {
  const { fileUri, durationSec, trimStartMs, trimEndMs } = route.params;
  const { top } = useSafeAreaInsets();

  const [filterKey, setFilterKey] = useState('none');
  const [filterCat, setFilterCat] = useState('all');
  const [mirror, setMirror] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjust, setAdjust] = useState<AdjustState>(ADJUST_DEFAULT);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [baseThumb, setBaseThumb] = useState<string | null>(null);

  const preset = STUDIO_FILTERS.find(f => f.key === filterKey) ?? STUDIO_FILTERS[0];
  const visibleFilters = filterCat === 'all' ? STUDIO_FILTERS : STUDIO_FILTERS.filter(f => f.category === filterCat);
  // Live composed look — recomputes as sliders move, drives the Skia preview in real time.
  const liveMatrix: CMatrix = useMemo(() => mul(adjustMatrix(adjust), preset.matrix), [adjust, preset]);
  const swatchImg = useImage(baseThumb ? `file://${baseThumb}` : undefined);

  useEffect(() => {
    let alive = true;
    createThumbnail({ url: fileUri, timeStamp: trimStartMs + 50, format: 'jpeg' })
      .then(({ path }) => { if (alive) { setBaseThumb(path); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [fileUri, trimStartMs]);

  // Non-destructive: carry the look forward to overlays; the single bake happens last.
  const next = useCallback(() => {
    navigation.navigate('StudioOverlay', {
      fileUri, durationSec, trimStartMs, trimEndMs,
      colorMatrix: isIdentity(liveMatrix) ? null : liveMatrix,
      mirror,
    });
  }, [navigation, fileUri, durationSec, trimStartMs, trimEndMs, liveMatrix, mirror]);

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>Looks</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.preview} onLayout={e => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box.w > 0 && (
          <SkiaVideoPreview uri={fileUri} width={box.w} height={box.h} matrix={liveMatrix} mirror={mirror} />
        )}
      </View>

      <View style={styles.tools}>
        <TouchableOpacity onPress={() => setMirror(m => !m)} activeOpacity={0.85}
          style={[styles.tool, mirror && styles.toolActive]}>
          <Ionicons name="swap-horizontal" size={18} color={mirror ? C.DANGER : C.MUTED} />
          <Text style={[styles.toolTxt, mirror && styles.toolTxtActive]}>Mirror</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAdjusting(a => !a)} activeOpacity={0.85}
          style={[styles.tool, adjusting && styles.toolActive]}>
          <Ionicons name="options-outline" size={18} color={adjusting ? C.DANGER : C.MUTED} />
          <Text style={[styles.toolTxt, adjusting && styles.toolTxtActive]}>Adjust</Text>
          {adjustActive(adjust) && !adjusting && <View style={styles.toolDot} />}
        </TouchableOpacity>
      </View>

      {adjusting ? (
        <View style={styles.adjustPanel}>
          {ADJUST_KEYS.map(a => (
            <Slider key={a.key} label={a.label} value={adjust[a.key]} min={a.min} max={a.max}
              onChange={(v) => setAdjust(s => ({ ...s, [a.key]: v }))} />
          ))}
          <View style={styles.adjustActions}>
            <TouchableOpacity onPress={() => setAdjust(ADJUST_DEFAULT)} hitSlop={8}><Text style={styles.resetTxt}>Reset</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setAdjusting(false)} hitSlop={8}><Text style={styles.doneTxt}>Done</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.catBar} contentContainerStyle={styles.catRow}>
            {[{ key: 'all', label: 'All' }, ...FILTER_CATEGORIES].map(cat => (
              <TouchableOpacity key={cat.key} onPress={() => setFilterCat(cat.key)}
                style={[styles.catPill, filterCat === cat.key && styles.catPillActive]} activeOpacity={0.8}>
                <Text style={[styles.catTxt, filterCat === cat.key && styles.catTxtActive]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.swatchBar} contentContainerStyle={styles.swatchRow}>
            {visibleFilters.map(f => (
              <Swatch key={f.key} def={f} active={f.key === filterKey} img={swatchImg}
                onPress={() => setFilterKey(f.key)} />
            ))}
          </ScrollView>
        </>
      )}

      <View style={styles.footer}>
        <GradientButton label="Next" onPress={next} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title: { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },
  preview: { flex: 1, borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden', marginBottom: SPACE.MD, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', gap: SPACE.SM, marginBottom: SPACE.SM },
  tool: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL,
    backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER,
  },
  toolActive: { borderColor: C.DANGER },
  toolTxt: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  toolTxtActive: { color: C.DANGER },
  toolDot: { position: 'absolute', top: 4, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: C.ACCENT_HOT },
  adjustPanel: { paddingTop: SPACE.SM },
  adjustActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.XS },
  resetTxt: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  doneTxt: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM },
  catBar: { flexGrow: 0, marginBottom: SPACE.SM },
  catRow: { gap: SPACE.SM, paddingRight: SPACE.LG },
  catPill: { paddingHorizontal: SPACE.MD, paddingVertical: 6, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER },
  catPillActive: { borderColor: C.DANGER },
  catTxt: { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  catTxtActive: { color: C.DANGER },
  swatchBar: { flexGrow: 0 },
  swatchRow: { gap: SPACE.MD, paddingVertical: SPACE.SM, paddingRight: SPACE.LG, alignItems: 'flex-start' },
  swatchCol: { width: SWATCH_W + 8, alignItems: 'center' },
  ring: { padding: 2, borderRadius: RADIUS.MD + 2 },
  ringIdle: { backgroundColor: C.BORDER },
  swatchInner: { width: SWATCH_W, height: SWATCH_H, borderRadius: RADIUS.MD, overflow: 'hidden', backgroundColor: '#000' },
  swatchLabel: { marginTop: 6, fontSize: FONT.SIZES.XS, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  swatchLabelActive: { color: C.INK, fontFamily: FONT.BODY_SEMIBOLD },
  footer: { paddingVertical: SPACE.MD, paddingBottom: SPACE.LG },
});
