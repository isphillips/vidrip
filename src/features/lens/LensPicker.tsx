import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, ScrollView, useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { LENSES } from './faceLens';

// Brand gradient (matches the STUDIO nav badge / GradientButton).
const FLOW = ['#FF4FA3', '#A05CFF', '#2DD4BF'];
const PANEL_BG = '#190A33';

type Option = { key: string | null; label: string; icon: string };
const OPTIONS: Option[] = [
  { key: null, label: 'None', icon: 'ban-outline' },
  ...LENSES.map(l => ({ key: l.key, label: l.label, icon: l.icon })),
];

const labelFor = (k: string | null) => OPTIONS.find(o => o.key === k)?.label ?? 'None';

// A single sleek icon per lens — a dark tile with the lens's glyph centered. The selected one
// lights up with the brand accent + a gradient ring (handled by the cell border below).
function IconTile({ icon, on, w, h }: { icon: string; on: boolean; w: number; h: number }) {
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon as any} size={Math.round(Math.min(w, h) * 0.42)} color={on ? C.ACCENT_HOT : '#EDE6FF'} />
    </View>
  );
}

/**
 * Top-center filter pill (gradient border, like the STUDIO badge). Tapping it slides a panel down
 * with a grid of live lens previews; picking one selects it and closes the panel.
 */
export default function LensPicker({
  lensKey, onChange, topInset,
}: { lensKey: string | null; onChange: (k: string | null) => void; topInset: number }) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [open, anim]);

  // 4 per row, uniform spacing all around: the panel is 94% of the screen, and the outer padding
  // equals the inter-cell gap so the margins between cells and at the edges all match.
  const COLS = 4;
  const GAP = SPACE.SM;
  const PAD = SPACE.SM;
  const panelW = width * 0.94;
  const cellW = Math.floor((panelW - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.18);

  const select = (k: string | null) => { onChange(k); setOpen(false); };

  return (
    <>
      {/* Backdrop — tap outside to close (only while open). */}
      {open && <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />}

      <View style={[styles.wrap, { top: topInset + SPACE.SM }]} pointerEvents="box-none">
        {/* Pill */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(o => !o)}>
          <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pillBorder}>
            <View style={styles.pillInner}>
              <Ionicons name="sparkles" size={13} color={C.TEAL} style={{ marginRight: 6 }} />
              <Text style={styles.pillTxt}>{labelFor(lensKey)}</Text>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={C.WHITE} style={{ marginLeft: 6 }} />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Slide-down grid */}
        {open && (
          <Animated.View
            style={[styles.panel, {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, SPACE.SM] }) }],
            }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.grid, { padding: PAD, gap: GAP }]}>
              {OPTIONS.map(o => {
                const on = o.key === lensKey;
                return (
                  <TouchableOpacity key={o.key ?? 'none'} activeOpacity={0.85} onPress={() => select(o.key)} style={{ width: cellW }}>
                    <View style={[styles.cell, { width: cellW, height: cellH }, on && styles.cellOn]}>
                      <IconTile icon={o.icon} on={on} w={cellW} h={cellH} />
                    </View>
                    <Text style={[styles.cellLabel, on && styles.cellLabelOn]} numberOfLines={1}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  pillBorder: { borderRadius: RADIUS.FULL, padding: 1.5, overflow: 'hidden' },
  pillInner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: RADIUS.FULL, backgroundColor: PANEL_BG,
    paddingHorizontal: SPACE.MD, paddingVertical: 6,
  },
  pillTxt: { color: C.WHITE, fontFamily: FONT.BODY_BOLD, fontSize: FONT.SIZES.SM, letterSpacing: 0.5 },
  panel: {
    marginTop: SPACE.SM, width: '94%', maxHeight: 440,
    borderRadius: RADIUS.LG, backgroundColor: 'rgba(13,4,24,0.92)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  cell: {
    borderRadius: RADIUS.MD, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2, borderColor: 'transparent', overflow: 'hidden',
  },
  cellOn: { borderColor: C.ACCENT_HOT },
  cellLabel: { color: C.SUBTLE, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.XS, textAlign: 'center', marginTop: 4 },
  cellLabelOn: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },
});
