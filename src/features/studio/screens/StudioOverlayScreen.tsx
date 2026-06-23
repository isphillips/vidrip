import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { C, FONT, SPACE, RADIUS } from '../../../theme';
import { IDENTITY, type CMatrix } from '../colorMatrix';
import { STICKERS, stickerByKey } from '../stickers';
import { type StudioRecipe } from '../../../infrastructure/creatorStudio/recipe';
import { exportRecipe } from '../../../infrastructure/native/studioExporter';
import { isEmptyRecipe, type OverlayRecipe, type OverlayNode } from '../effectRecipe';
import { EffectClockProvider } from '../effectClock';
import SkiaVideoPreview from '../components/SkiaVideoPreview';
import DraggableOverlay, { type OverlayTransform } from '../components/DraggableOverlay';
import GradientButton from '../components/GradientButton';
import SaveForLaterButton from '../components/SaveForLaterButton';
import StudioMusicPreview, { useDraftAudioTrack, useFocusReplayKey } from '../components/StudioMusicPreview';
import EffectText from '../components/EffectText';
import { useStudioAutosave } from '../useStudioAutosave';
import { saveSnapshotVideo, updateDraft, getDraft } from '../../../infrastructure/storage/studioDraftStorage';
import type { StudioStackScreenProps } from '../../../app/navigation/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEXT_COLORS = ['#FFFFFF', '#000000', '#FF4FA3', '#A05CFF', '#3B82F6', '#FFD166', '#06D6A0', '#EF476F'];
const FONTS = [
  { key: 'syneB', label: 'Aa', family: FONT.DISPLAY_BOLD },
  { key: 'syne',  label: 'Aa', family: FONT.DISPLAY },
  { key: 'raleB', label: 'Aa', family: FONT.BODY_BOLD },
  { key: 'raleM', label: 'Aa', family: FONT.BODY_MEDIUM },
  { key: 'rale',  label: 'Aa', family: FONT.BODY },
];
const FONT_SIZES = [
  { label: 'S', value: 20 },
  { label: 'M', value: 30 },
  { label: 'L', value: 42 },
  { label: 'XL', value: 56 },
];
const TEXT_ANIMS: { key: TextAnim; label: string; icon: string }[] = [
  { key: 'none',    label: 'Still',   icon: 'remove-outline' },
  { key: 'bounce',  label: 'Bounce',  icon: 'chevron-up' },
  { key: 'pulse',   label: 'Pulse',   icon: 'radio-button-on-outline' },
  { key: 'marquee', label: 'Scroll',  icon: 'play-forward-outline' },
];
const DEFAULT_FONT = FONT.DISPLAY_BOLD;
const DEFAULT_FONT_SIZE = 30;

type TextAnim = 'none' | 'bounce' | 'pulse' | 'marquee';
type TrayTab = 'text' | 'stickers' | 'emoji' | 'animated' | 'overlays';

// ─── Types ────────────────────────────────────────────────────────────────────

type OverlayItem = {
  id: string;
  type: 'text' | 'sticker';
  text?: string;
  color?: string;
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textAnim?: TextAnim;
  stickerKey?: string;
  transform: OverlayTransform;
};

// ─── TextOverlayContent ───────────────────────────────────────────────────────
// Thin adapter over the shared, clock-driven EffectText so the editor and replay match.

function TextOverlayContent({ item }: { item: OverlayItem }) {
  return (
    <EffectText
      text={item.text ?? ''}
      color={item.color}
      font={item.font}
      fontSize={item.fontSize}
      bold={item.bold}
      italic={item.italic}
      anim={item.textAnim ?? 'none'}
    />
  );
}

// ─── EffectTrayItem ─────────────────────────────────────────────────────────────
// A fullscreen-effect picker button. Uses a gesture-handler Tap (recognized on the native gesture
// thread) instead of TouchableOpacity: while an effect is already animating it saturates the UI/
// render thread, and TouchableOpacity's JS-responder taps get dropped under that load — so switching
// effects took several taps on Android. A native Tap is queued, not dropped, so the first tap lands.
// Press feedback (opacity) is driven by a UI-thread shared value so it stays instant even when the
// JS thread is busy.
const EffectTrayItem = React.memo(function EffectTrayItem({
  st, active, onToggle,
}: { st: (typeof STICKERS)[number]; active: boolean; onToggle: () => void }) {
  const pressed = useSharedValue(0);
  const tap = Gesture.Tap()
    .onBegin(() => { pressed.value = 1; })
    .onFinalize(() => { pressed.value = 0; })
    .onEnd(() => { runOnJS(onToggle)(); });
  const aStyle = useAnimatedStyle(() => ({ opacity: pressed.value ? 0.7 : 1 }));
  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[styles.trayItem, styles.overlayItem, active && styles.overlayItemOn, aStyle]}>
        {st.render()}
        <Text style={[styles.overlayLabel, active && styles.overlayLabelOn]}>{st.label}</Text>
      </Animated.View>
    </GestureDetector>
  );
});

// Sticker sets per tab — static (STICKERS never changes), so hoisted out of the component to keep
// stable array references (the animated tray's stagger effect keys off them).
const STICKER_STICKERS  = STICKERS.filter(s => s.category === 'sticker');
const EMOJI_STICKERS    = STICKERS.filter(s => s.category === 'emoji');
const ANIMATED_STICKERS = STICKERS.filter(s => s.category === 'animated');
const OVERLAY_STICKERS  = STICKERS.filter(s => s.category === 'overlay' && s.isFullscreen);

// ─── AnimatedTray ───────────────────────────────────────────────────────────────
// The "Animated" tab holds ~10 live particle stickers. Mounting them all in the one commit that the
// tab switch triggers froze the JS thread for several seconds on Android (each builds its particle
// arrays + starts a frame loop synchronously). Two fixes: (1) one shared EffectClockProvider drives
// all thumbnails, so it's a single frame callback instead of ~10 self-advancing fallback clocks;
// (2) the thumbnails mount a couple at a time across frames after the tab transition, so the tab
// opens instantly and previews pop in. Empty slots keep their box size so the row doesn't reflow.
function AnimatedTray({ items, onAdd }: { items: typeof STICKERS; onAdd: (key: string) => void }) {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    setReady(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      i += 2;
      setReady(i);
      if (i < items.length) { timer = setTimeout(step, 40); }
    };
    const task = InteractionManager.runAfterInteractions(step);
    return () => { task.cancel?.(); if (timer) { clearTimeout(timer); } };
  }, [items]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trayBar} contentContainerStyle={styles.tray}>
      <EffectClockProvider playing>
        {items.map((st, idx) => (
          <TouchableOpacity key={st.key} onPress={() => onAdd(st.key)} style={styles.trayItem} activeOpacity={0.85}>
            <View style={styles.trayThumb}>{idx < ready ? st.render() : null}</View>
          </TouchableOpacity>
        ))}
      </EffectClockProvider>
    </ScrollView>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

let _id = 0;
const nextId = () => `ov_${_id++}`;

export default function StudioOverlayScreen({ route, navigation }: StudioStackScreenProps<'StudioOverlay'>) {
  const { fileUri, durationSec, trimStartMs, trimEndMs, colorMatrix, mirror, draftId, recipe: initRecipe } = route.params;
  const { top } = useSafeAreaInsets();
  const matrix: CMatrix = (colorMatrix as CMatrix) ?? IDENTITY;

  const [avail, setAvail]     = useState({ w: 0, h: 0 });
  const [aspect, setAspect]   = useState(9 / 16);
  const [overlays, setOverlays] = useState<OverlayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fsOverlay, setFsOverlay]   = useState<string | null>(null);
  const [trayTab, setTrayTab] = useState<TrayTab>('stickers');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [elapsed, setElapsed]     = useState(0);
  // While an overlay is being pinch-resized (Android only — DraggableOverlay only fires there),
  // pause the shared effect clock so the rasterized sticker texture is frozen and resizing stays
  // smooth. Plain moves don't pause; iOS never fires this.
  const [gesturing, setGesturing] = useState(0);
  const onOverlayGesture = useCallback((active: boolean) =>
    setGesturing(c => Math.max(0, c + (active ? 1 : -1))), []);
  const layerRef = useRef<View>(null);
  const musicTrack = useDraftAudioTrack(draftId);
  const replayKey = useFocusReplayKey();   // remount the Skia preview on re-focus so it replays from 0

  // Reset spinner when user navigates back from StudioDetails — success path
  // sets exporting=true then navigates away without clearing it.
  useEffect(() => {
    return navigation.addListener('focus', () => setExporting(false));
  }, [navigation]);

  // Count-up timer shown in the processing overlay while exporting.
  useEffect(() => {
    if (!exporting) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(e => e + 0.1), 100);
    return () => clearInterval(id);
  }, [exporting]);

  const box = useMemo(() => {
    if (!avail.w || !avail.h) { return { w: 0, h: 0 }; }
    let w = avail.w, h = avail.w / aspect;
    if (h > avail.h) { h = avail.h; w = avail.h * aspect; }
    return { w: Math.floor(w), h: Math.floor(h) };
  }, [avail, aspect]);

  // Resume: rebuild the overlay items from a saved recipe once the canvas box is known (inverse of
  // buildRecipe — normalized nx/ny → pixel tx/ty against the current box).
  //
  // Mounting a draft's whole effect layer at once was a burst of native-view + Skia-pipeline work
  // that hitched the screen on resume (the "loading a saved draft with effects is laggy" report). So
  // we (a) wait for the navigation transition to finish (runAfterInteractions) and (b) reveal the
  // draggable overlays a couple at a time across frames instead of in one commit. The fullscreen
  // effect mounts first — its Skia pipelines are already warmed by EffectWarmup. Staggering finishes
  // well inside the autosave debounce, so a partial layer never gets persisted back.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !initRecipe || !box.w || !box.h) { return; }
    hydratedRef.current = true;
    const items: OverlayItem[] = (initRecipe.nodes ?? []).map((n): OverlayItem => ({
      id: nextId(),
      type: n.kind,
      ...(n.kind === 'text'
        ? { text: n.text, color: n.color, font: n.font, fontSize: n.fontSize, bold: n.bold, italic: n.italic, textAnim: n.anim }
        : { stickerKey: n.stickerKey }),
      transform: { tx: (n.nx - 0.5) * box.w, ty: (n.ny - 0.5) * box.h, scale: n.scale, rotation: n.rotation },
    }));
    const fs = initRecipe.fullscreen ?? null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) { return; }
      setFsOverlay(fs);
      let i = 0;
      const CHUNK = 2;
      const step = () => {
        if (cancelled) { return; }
        setOverlays(prev => [...prev, ...items.slice(i, i + CHUNK)]);
        i += CHUNK;
        if (i < items.length) { timer = setTimeout(step, 32); }
      };
      if (items.length) { step(); }
    });
    return () => { cancelled = true; if (timer) { clearTimeout(timer); } task.cancel?.(); };
  }, [initRecipe, box.w, box.h]);

  const selected    = overlays.find(o => o.id === selectedId);
  const selectedTxt = selected?.type === 'text' ? selected : null;

  const staggerOffset = (): OverlayTransform => ({
    tx: (overlays.length % 5) * 16 - 32,
    ty: (overlays.length % 5) * 16 - 32,
    scale: 1,
    rotation: 0,
  });

  const addText = useCallback(() => {
    Alert.prompt('Add text', undefined, (text) => {
      if (text?.trim()) {
        const id = nextId();
        setOverlays(o => [...o, { id, type: 'text', text: text.trim(), color: '#FFFFFF', font: DEFAULT_FONT, fontSize: DEFAULT_FONT_SIZE, bold: false, italic: false, textAnim: 'none', transform: staggerOffset() }]);
        setSelectedId(id);
        setTrayTab('text');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays.length]);

  const addSticker = useCallback((key: string) => {
    const id = nextId();
    setOverlays(o => [...o, { id, type: 'sticker', stickerKey: key, transform: staggerOffset() }]);
    setSelectedId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlays.length]);

  const updateTransform = useCallback((id: string, t: OverlayTransform) =>
    setOverlays(o => o.map(it => it.id === id ? { ...it, transform: t } : it)), []);

  const remove = useCallback((id: string) => {
    setOverlays(o => o.filter(it => it.id !== id));
    setSelectedId(s => s === id ? null : s);
  }, []);

  const patchSelected = (p: Partial<OverlayItem>) =>
    setOverlays(o => o.map(it => it.id === selectedId ? { ...it, ...p } : it));

  // Serialize the live overlay layer into a replayable recipe (positions normalized to the
  // authoring box). Replayed live over the player — no pixels baked until the user shares out.
  const buildRecipe = useCallback((): OverlayRecipe => {
    const nodes: OverlayNode[] = overlays.map(o => {
      const nx = box.w ? (box.w / 2 + o.transform.tx) / box.w : 0.5;
      const ny = box.h ? (box.h / 2 + o.transform.ty) / box.h : 0.5;
      const base = { nx, ny, scale: o.transform.scale, rotation: o.transform.rotation };
      return o.type === 'text'
        ? { kind: 'text' as const, ...base, text: o.text ?? '', color: o.color, font: o.font, fontSize: o.fontSize, bold: o.bold, italic: o.italic, anim: o.textAnim ?? 'none' }
        : { kind: 'sticker' as const, ...base, stickerKey: o.stickerKey! };
    });
    return { version: 1, canvasW: box.w, canvasH: box.h, nodes, fullscreen: fsOverlay };
  }, [overlays, box, fsOverlay]);

  const next = useCallback(async () => {
    if (exporting) { return; }
    setExporting(true);
    setExportMsg('Saving…');
    try {
      setSelectedId(null);
      const recipe = buildRecipe();
      // Bake the look (trim + colour + mirror) AND the music into the stored video; the animated
      // overlay layer rides along as a recipe and is replayed live in-app. Music is baked here so
      // it flows to both channel upload and the friend-share overlay bake from the one snapshot.
      const draft = draftId ? await getDraft(draftId) : null;
      const aud = draft?.audio;
      const baseRecipe: StudioRecipe = {
        clips: [{ uri: fileUri, trimStartMs, trimEndMs }],
        colorMatrix: matrix === IDENTITY ? null : matrix,
        mirror,
        audioTracks: aud?.tracks.length ? aud.tracks.map(t => ({ uri: t.uri, volume: t.volume })) : null,
        keepOriginalAudio: aud ? aud.keepOriginal : undefined,
        originalVolume: aud ? aud.originalVolume : undefined,
      };
      const { uri } = await exportRecipe(baseRecipe, durationSec ? durationSec * 1000 : undefined);
      const finalRecipe = isEmptyRecipe(recipe) ? null : recipe;
      const outDur = Math.round((trimEndMs - trimStartMs) / 1000);
      // Autosave at the processing step: store the baked video as the draft's snapshot + mark it
      // ready-to-publish, so a crash during Bunny upload can resume straight to Details.
      if (draftId) {
        try {
          await saveSnapshotVideo(draftId, uri);
          await updateDraft(draftId, { stage: 'details', recipe: finalRecipe, durationSec: outDur });
        } catch { /* draft persistence is best-effort — never block publishing */ }
      }
      navigation.navigate('StudioDetails', {
        fileUri: uri,
        durationSec: outDur,
        recipe: finalRecipe,
        draftId,
      });
    } catch (e: any) {
      Alert.alert('Overlays', e?.message ?? 'Could not finish.');
      setExporting(false);
    }
  }, [exporting, buildRecipe, fileUri, trimStartMs, trimEndMs, durationSec, matrix, mirror, navigation, draftId]);

  // Autosave overlay edits to the draft (recipe + the look/trim carried so a resume into this
  // screen restores everything).
  useStudioAutosave(draftId, 'overlay', {
    durationSec, trimStartMs, trimEndMs,
    colorMatrix: matrix === IDENTITY ? null : (matrix as number[]),
    mirror,
    recipe: buildRecipe(),
  });

  return (
    <View style={[styles.container, { paddingTop: top + SPACE.SM }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={C.INK} />
        </TouchableOpacity>
        <Text style={styles.title}>Overlays</Text>
        {draftId ? <SaveForLaterButton onPress={() => navigation.popToTop()} /> : <View style={{ width: 26 }} />}
      </View>

      {/* Preview */}
      <View style={styles.previewWrap} onLayout={e => setAvail({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {box.w > 0 && (
          <View style={[styles.preview, { width: box.w, height: box.h }]}>
            <SkiaVideoPreview key={replayKey} uri={fileUri} width={box.w} height={box.h} matrix={matrix} mirror={mirror ?? false} onAspect={setAspect} />
            <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setSelectedId(null)} />
            {/* One shared, play-gated clock for the whole effect layer (instead of a per-component
                fallback clock each) — also where adaptive-quality frame sampling runs. */}
            <EffectClockProvider playing={gesturing === 0}>
              <View ref={layerRef} style={StyleSheet.absoluteFill} pointerEvents="box-none" collapsable={false}>
                {/* Full-screen overlay layer */}
                {fsOverlay && (() => {
                  const def = stickerByKey(fsOverlay);
                  return def?.renderFull ? def.renderFull(box.w, box.h) : null;
                })()}
                {/* Draggable items */}
                {overlays.map(o => (
                  <DraggableOverlay
                    key={o.id} selected={o.id === selectedId} initial={o.transform}
                    onSelect={() => setSelectedId(o.id)} onDelete={() => remove(o.id)}
                    onChange={t => updateTransform(o.id, t)} onGestureChange={onOverlayGesture}>
                    {o.type === 'text'
                      ? <TextOverlayContent item={o} />
                      : stickerByKey(o.stickerKey!)?.render()}
                  </DraggableOverlay>
                ))}
              </View>
            </EffectClockProvider>
          </View>
        )}
      </View>
      {/* The chosen track plays over the (silent) overlay preview; silenced during the export bake. */}
      {musicTrack && <StudioMusicPreview uri={musicTrack.uri} volume={musicTrack.volume} paused={exporting} />}

      {/* Text formatting bar — visible whenever a text item is selected */}
      {selectedTxt && (
        <View style={styles.fmtWrap}>
          {/* Font row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fontRow}>
            {FONTS.map(f => (
              <TouchableOpacity key={f.key} onPress={() => patchSelected({ font: f.family })}
                style={[styles.fontChip, selectedTxt.font === f.family && styles.fontChipOn]}>
                <Text style={{ color: C.INK, fontFamily: f.family, fontSize: 18 }}>Aa</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Size + style + anim row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fmtRow}>
            {FONT_SIZES.map(sz => (
              <TouchableOpacity key={sz.value} onPress={() => patchSelected({ fontSize: sz.value })}
                style={[styles.fmtChip, selectedTxt.fontSize === sz.value && styles.fmtChipOn]}>
                <Text style={[styles.fmtChipTxt, selectedTxt.fontSize === sz.value && styles.fmtChipTxtOn]}>{sz.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.fmtDiv} />
            <TouchableOpacity onPress={() => patchSelected({ bold: !selectedTxt.bold })}
              style={[styles.fmtChip, selectedTxt.bold && styles.fmtChipOn]}>
              <Text style={[styles.fmtChipTxt, { fontWeight: '700' }, selectedTxt.bold && styles.fmtChipTxtOn]}>B</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => patchSelected({ italic: !selectedTxt.italic })}
              style={[styles.fmtChip, selectedTxt.italic && styles.fmtChipOn]}>
              <Text style={[styles.fmtChipTxt, { fontStyle: 'italic' }, selectedTxt.italic && styles.fmtChipTxtOn]}>I</Text>
            </TouchableOpacity>
            <View style={styles.fmtDiv} />
            {TEXT_ANIMS.map(ta => (
              <TouchableOpacity key={ta.key} onPress={() => patchSelected({ textAnim: ta.key })}
                style={[styles.fmtChip, selectedTxt.textAnim === ta.key && styles.fmtChipOn]}>
                <Ionicons name={ta.icon as any} size={14} color={selectedTxt.textAnim === ta.key ? C.WHITE : C.MUTED} />
                <Text style={[styles.fmtChipTxt, { marginLeft: 3 }, selectedTxt.textAnim === ta.key && styles.fmtChipTxtOn]}>{ta.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Color palette */}
          <View style={styles.palette}>
            {TEXT_COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => patchSelected({ color: c })}
                style={[styles.swatch, { backgroundColor: c }, selectedTxt.color === c && styles.swatchOn]} />
            ))}
          </View>
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'text',     icon: 'text-outline',        label: 'Text' },
          { key: 'stickers', icon: 'albums-outline',      label: 'Stickers' },
          { key: 'emoji',    icon: 'happy-outline',       label: 'Emoji' },
          { key: 'animated', icon: 'sparkles-outline',    label: 'Animated' },
          { key: 'overlays', icon: 'film-outline',        label: 'Effects' },
        ] as const).map(t => (
          <TouchableOpacity key={t.key} style={styles.tabBtn} onPress={() => setTrayTab(t.key)} activeOpacity={0.75}>
            <Ionicons name={t.icon} size={20} color={trayTab === t.key ? C.ACCENT_HOT : C.MUTED} />
            <Text style={[styles.tabLabel, trayTab === t.key && styles.tabLabelOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tray */}
      {trayTab === 'text' && (
        <View style={styles.textTray}>
          <TouchableOpacity onPress={addText} style={styles.addTextBtn} activeOpacity={0.85}>
            <Ionicons name="add-circle-outline" size={22} color={C.ACCENT_HOT} />
            <Text style={styles.addTextTxt}>Add Text</Text>
          </TouchableOpacity>
          {!selectedTxt && overlays.filter(o => o.type === 'text').length > 0 && (
            <Text style={styles.textHint}>Tap a text item to edit its style</Text>
          )}
        </View>
      )}

      {trayTab === 'stickers' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trayBar} contentContainerStyle={styles.tray}>
          {STICKER_STICKERS.map(st => (
            <TouchableOpacity key={st.key} onPress={() => addSticker(st.key)} style={[styles.trayItem, styles.trayItemSticker]} activeOpacity={0.85}>
              {st.render()}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {trayTab === 'emoji' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trayBar} contentContainerStyle={styles.tray}>
          {EMOJI_STICKERS.map(st => (
            <TouchableOpacity key={st.key} onPress={() => addSticker(st.key)} style={styles.trayItem} activeOpacity={0.85}>
              <View style={styles.trayThumb}>{st.render()}</View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {trayTab === 'animated' && (
        <AnimatedTray items={ANIMATED_STICKERS} onAdd={addSticker} />
      )}

      {trayTab === 'overlays' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.trayBar} contentContainerStyle={styles.tray}>
          {OVERLAY_STICKERS.map(st => (
            <EffectTrayItem key={st.key} st={st} active={fsOverlay === st.key}
              onToggle={() => setFsOverlay(prev => prev === st.key ? null : st.key)} />
          ))}
        </ScrollView>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <GradientButton label="Next" onPress={next} loading={exporting} />
      </View>

      {/* Processing overlay — blocks interaction while we capture + bake the video */}
      {exporting && (
        <View style={styles.processing}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={C.ACCENT_HOT} />
            <Text style={styles.processingTitle}>Processing video</Text>
            <Text style={styles.processingMsg}>{exportMsg}</Text>
            <Text style={styles.processingTime}>{elapsed.toFixed(1)}s</Text>
            <Text style={styles.processingHint}>Baking your effects into the video. Hang tight.</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.BG, paddingHorizontal: SPACE.LG },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.MD },
  title:          { fontSize: FONT.SIZES.LG, fontFamily: FONT.DISPLAY_BOLD, color: C.INK },

  // Processing overlay
  processing:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,0,14,0.78)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  processingCard:  { backgroundColor: C.SURFACE_2, borderRadius: RADIUS.LG, borderWidth: 1, borderColor: C.BORDER, paddingVertical: SPACE.XL, paddingHorizontal: SPACE.XXL, alignItems: 'center', gap: SPACE.SM, maxWidth: 280 },
  processingTitle: { color: C.INK, fontFamily: FONT.DISPLAY_BOLD, fontSize: FONT.SIZES.LG, marginTop: SPACE.SM },
  processingMsg:   { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  processingTime:  { color: C.MUTED, fontFamily: FONT.BODY_MEDIUM, fontSize: FONT.SIZES.XL, marginTop: 2 },
  processingHint:  { color: C.SUBTLE, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS, textAlign: 'center', marginTop: 2 },
  previewWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.SM },
  preview:        { borderRadius: RADIUS.MD, backgroundColor: '#000', overflow: 'hidden' },

  // Text formatting
  fmtWrap:   { marginBottom: SPACE.SM },
  fontRow:   { gap: SPACE.SM, paddingBottom: SPACE.XS, paddingRight: SPACE.LG },
  fontChip:  { width: 40, height: 36, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  fontChipOn:{ borderColor: C.ACCENT_HOT },
  fmtRow:    { gap: SPACE.XS, paddingBottom: SPACE.XS, paddingRight: SPACE.LG, alignItems: 'center' },
  fmtChip:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.SM, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER },
  fmtChipOn: { backgroundColor: C.ACCENT, borderColor: C.ACCENT },
  fmtChipTxt:   { color: C.MUTED, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  fmtChipTxtOn: { color: C.WHITE },
  fmtDiv:    { width: 1, height: 22, backgroundColor: C.BORDER, marginHorizontal: 4 },
  palette:   { flexDirection: 'row', gap: SPACE.SM, justifyContent: 'center' },
  swatch:    { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: 'transparent' },
  swatchOn:  { borderColor: C.INK },

  // Tabs
  tabBar:   { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.BORDER, marginBottom: SPACE.SM, paddingTop: SPACE.SM },
  tabBtn:   { flex: 1, alignItems: 'center', gap: 3 },
  tabLabel: { fontSize: 10, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  tabLabelOn: { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD },

  // Trays
  textTray:    { paddingBottom: SPACE.SM, minHeight: 44, gap: SPACE.SM },
  addTextBtn:  { flexDirection: 'row', alignItems: 'center', gap: SPACE.SM, alignSelf: 'flex-start', paddingHorizontal: SPACE.MD, paddingVertical: SPACE.SM, borderRadius: RADIUS.FULL, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.ACCENT_HOT },
  addTextTxt:  { color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD, fontSize: FONT.SIZES.SM },
  textHint:    { color: C.MUTED, fontFamily: FONT.BODY, fontSize: FONT.SIZES.XS },
  trayBar:     { flexGrow: 0, marginBottom: SPACE.SM },
  tray:        { gap: SPACE.SM, alignItems: 'center', paddingRight: SPACE.LG },
  trayItem:        { height: 64, minWidth: 64, paddingHorizontal: SPACE.SM, borderRadius: RADIUS.MD, backgroundColor: C.SURFACE, borderWidth: 1, borderColor: C.BORDER, alignItems: 'center', justifyContent: 'center' },
  trayItemSticker: { height: 80, paddingHorizontal: 4, paddingVertical: 0, overflow: 'hidden' },
  trayThumb:       { transform: [{ scale: 0.5 }] },

  // Overlay picker
  overlayItem:   { height: 80, width: 60, gap: 6, flexDirection: 'column', paddingHorizontal: 0 },
  overlayItemOn: { borderColor: C.ACCENT_HOT },
  overlayLabel:  { fontSize: 10, fontFamily: FONT.BODY_MEDIUM, color: C.MUTED },
  overlayLabelOn:{ color: C.ACCENT_HOT, fontFamily: FONT.BODY_SEMIBOLD },

  // Footer
  footer:         { paddingBottom: SPACE.LG },
});
