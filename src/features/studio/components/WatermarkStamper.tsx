import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { C, FONT } from '../../../theme';

// Renders the branded attribution badge into a FULL-FRAME transparent PNG (the badge baked into the
// bottom-left corner) sized to the output aspect, so the native exporter can fill-scale it over every
// frame with no stretch — see StudioRecipe.watermark. Only used on outbound shares (TikTok/IG/etc.).

const LOGO = require('../../../assets/driplogo.png');
const LOGO_AR = 194 / 321; // driplogo intrinsic width/height

export type WatermarkResult = { uri: string; width: number; height: number };
export type WatermarkStamperHandle = { stamp: (opts: { aspect: number }) => Promise<WatermarkResult> };

// Logical stage height; ×devicePixelRatio → ~1920px PNG on @3x, matching the exported video resolution.
const STAGE_H = 640;

const waitFrames = (n: number) =>
  new Promise<void>(res => {
    let c = 0;
    const tick = () => { if (++c >= n) { res(); } else { requestAnimationFrame(tick); } };
    requestAnimationFrame(tick);
  });

const WatermarkStamper = forwardRef<WatermarkStamperHandle>((_props, ref) => {
  const stageRef = useRef<View>(null);
  const [job, setJob] = useState<{ w: number; h: number } | null>(null);
  // Resolved when the logo image has painted, so the capture is never blank.
  const loadedRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    stamp: async ({ aspect }) => {
      const h = STAGE_H;
      const w = Math.max(1, Math.round(h * (aspect > 0 ? aspect : 9 / 16)));
      const loaded = new Promise<void>(res => { loadedRef.current = res; });
      setJob({ w, h });
      await waitFrames(2);                       // mount + lay out
      await Promise.race([loaded, waitFrames(12)]); // wait for the logo to paint (frame fallback)
      const f = await captureRef(stageRef, { format: 'png', quality: 1, result: 'tmpfile' });
      setJob(null);
      loadedRef.current = null;
      return { uri: f.startsWith('file://') ? f : `file://${f}`, width: w, height: h };
    },
  }), []);

  if (!job) { return null; }
  const pad = Math.round(job.h * 0.035);
  const logoH = Math.round(job.h * 0.052);
  const fontSize = Math.round(job.h * 0.040);
  const gap = Math.round(job.h * 0.012);
  return (
    // Off-screen but laid out, so captureRef works. Transparent so the PNG keeps alpha for compositing.
    <View
      ref={stageRef}
      collapsable={false}
      pointerEvents="none"
      style={[styles.stage, { width: job.w, height: job.h }]}>
      <View style={[styles.badge, { left: Math.round(pad * 1.1), bottom: pad, gap }]}>
        <Image
          source={LOGO}
          onLoad={() => loadedRef.current?.()}
          resizeMode="contain"
          // eslint-disable-next-line react-native/no-inline-styles
          style={{ height: logoH, width: Math.round(logoH * LOGO_AR) }}
        />
        <Text style={[styles.word, { fontSize }]}>Vidrip</Text>
      </View>
    </View>
  );
});

export default WatermarkStamper;

const styles = StyleSheet.create({
  stage: { position: 'absolute', left: -100000, top: 0, backgroundColor: 'transparent' },
  badge: { position: 'absolute', flexDirection: 'row', alignItems: 'center' },
  word: {
    color: C.WHITE,
    fontFamily: FONT.DISPLAY_BOLD,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
    letterSpacing: 0.5,
  },
});
