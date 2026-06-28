import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, ScrollView, useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../theme';
import { LENSES, lensCategory, type LensCategory } from './faceLens';

// Brand gradient (matches the STUDIO nav badge / GradientButton).
const FLOW = ['#FF4FA3', '#A05CFF', '#2DD4BF'];
const PANEL_BG = '#190A33';

type Option = { key: string | null; label: string; icon: string; featured?: boolean };

// Picker tabs, in display order, each with a small glyph that hints at the category.
const TABS: { cat: LensCategory; label: string; icon: string }[] = [
  // { cat: 'beauty', label: 'Beautify', icon: 'sparkles-outline' },
  { cat: 'mesh', label: 'Mask', icon: 'grid-outline' },
  { cat: 'warp', label: 'Warp', icon: 'aperture-outline' },
  { cat: 'overlay', label: 'Overlay', icon: 'layers-outline' },
  { cat: 'gesture', label: 'Interactive', icon: 'happy-outline' },
];

const labelFor = (k: string | null) => (k ? LENSES.find(l => l.key === k)?.label ?? 'None' : 'None');

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
 * with category tabs (Mesh / Warp / Overlay / Gesture) and a grid of lenses; picking one selects it.
 */
export default function LensPicker({
  lensKey, onChange, topInset,
}: { lensKey: string | null; onChange: (k: string | null) => void; topInset: number }) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [gridW, setGridW] = useState(0); // measured inner width of the scroll area (exact, not guessed)
  const [tab, setTab] = useState<LensCategory>(() => {
    const cur = LENSES.find(l => l.key === lensKey);
    return cur ? lensCategory(cur) : 'mesh';
  });
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: open ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [open, anim]);

  // Each time the panel opens, jump to the active lens's tab so it's visible/selected.
  useEffect(() => {
    if (open) { const cur = LENSES.find(l => l.key === lensKey); if (cur) { setTab(lensCategory(cur)); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 4 per row, edge-to-edge. cellW fits 4 with at least GAP between (from the MEASURED width, with a
  // conservative fallback); the row then uses `space-between`, which only ever EXPANDS the gaps — so
  // four fixed-width tiles can never wrap to 3, and the spare space is shared between columns (no
  // right-edge gutter) instead of being dumped after the last tile.
  const COLS = 4;
  const GAP = SPACE.SM;
  const PAD = SPACE.SM;
  const innerW = (gridW || width * 0.9) - PAD * 2;
  const cellW = Math.max(56, Math.floor((innerW - GAP * (COLS - 1)) / COLS));
  const cellH = Math.round(cellW * 1.18);

  // None + the lenses in the active tab, with featured (signature/new) lenses floated to the front.
  const inTab = LENSES.filter(l => lensCategory(l) === tab)
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
  const opts: Option[] = [
    { key: null, label: 'None', icon: 'ban-outline' },
    ...inTab.map(l => ({ key: l.key, label: l.label, icon: l.icon, featured: l.featured })),
  ];

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

        {/* Slide-down panel: tabs + grid */}
        {open && (
          <Animated.View
            style={[styles.panel, {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, SPACE.SM] }) }],
            }]}>
            {/* Category tabs */}
            <View style={styles.tabRow}>
              {TABS.map(t => {
                const active = t.cat === tab;
                return (
                  <TouchableOpacity key={t.cat} activeOpacity={0.8} onPress={() => setTab(t.cat)} style={[styles.tab, active && styles.tabOn]}>
                    <Ionicons name={t.icon as any} size={15} color={active ? C.ACCENT_HOT : C.SUBTLE} style={styles.tabIcon} />
                    <Text style={[styles.tabTxt, active && styles.tabTxtOn]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              onLayout={e => setGridW(e.nativeEvent.layout.width)}
              contentContainerStyle={[styles.grid, { padding: PAD, rowGap: GAP }]}>
              {opts.map(o => {
                const on = o.key === lensKey;
                return (
                  <TouchableOpacity key={o.key ?? 'none'} activeOpacity={0.85} onPress={() => select(o.key)} style={{ width: cellW }}>
                    <View style={[styles.cell, { width: cellW, height: cellH }, o.featured && styles.cellFeatured, on && styles.cellOn]}>
                      <IconTile icon={o.icon} on={on} w={cellW} h={cellH} />
                      {o.featured && (
                        <LinearGradient colors={FLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newBadge}>
                          <Text style={styles.newTxt}>NEW</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <Text style={[styles.cellLabel, (on || o.featured) && styles.cellLabelOn]} numberOfLines={1}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Invisible spacers pad the final row to a multiple of COLS so its tiles stay column-
                  aligned under the rows above (space-between would otherwise spread a partial row). */}
              {Array.from({ length: (COLS - (opts.length % COLS)) % COLS }).map((_, i) => (
                <View key={`sp-${i}`} style={{ width: cellW }} />
              ))}
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
    marginTop: SPACE.SM, width: '94%',
    borderRadius: RADIUS.LG, backgroundColor: 'rgba(13,4,24,0.92)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACE.SM, paddingTop: SPACE.SM, paddingBottom: SPACE.XS,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: RADIUS.MD, backgroundColor: 'rgba(255,255,255,0.05)' },
  tabOn: { backgroundColor: 'rgba(255,79,163,0.18)', borderWidth: 1, borderColor: C.ACCENT_HOT },
  tabIcon: { marginBottom: 2 },
  tabTxt: { color: C.SUBTLE, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.XS },
  tabTxtOn: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },
  scroll: { maxHeight: 380 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  cell: {
    borderRadius: RADIUS.MD, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2, borderColor: 'transparent', overflow: 'hidden',
  },
  cellOn: { borderColor: C.ACCENT_HOT },
  cellFeatured: { borderColor: 'rgba(255,79,163,0.55)', backgroundColor: 'rgba(255,79,163,0.10)' },
  newBadge: { position: 'absolute', top: 4, right: 4, borderRadius: RADIUS.FULL },
  newTxt: { color: '#FFFFFF', fontFamily: FONT.BODY_BOLD, fontSize: 8, letterSpacing: 0.5, paddingHorizontal: 5, paddingVertical: 1 },
  cellLabel: { color: C.SUBTLE, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.XS, textAlign: 'center', marginTop: 4 },
  cellLabelOn: { color: C.WHITE, fontFamily: FONT.BODY_BOLD },
});
