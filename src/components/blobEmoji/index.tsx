/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import BlobBase from './BlobBase';
import {
  RoundEye, HeartEye, Arc, OpenMouth, Brow,
  FloatHeart, Confetti, Sparkle, Steam, StreamTear, SplashTear, SmokeWisp, ClapHand, FlameTip,
} from './faces';

// Ten animated "blob emojis" — a branded, living alternative to flat emoji art. Each is a squishy
// gradient blob with a hand-built face; it breathes on idle (like the nav slimes) and plays an
// expressive burst when tapped (hearts float, confetti flies, it laugh-shakes, etc.). All share the
// BlobBase engine; this file is just the per-emoji look + which flourish fires on the burst.

export type BlobProps = { size: number; onPress?: () => void; excited?: number; style?: StyleProp<ViewStyle>; idlePhase?: number };

const thick = (w: number) => Math.max(1.5, w * 0.05);

// ❤️ Love — an actual heart character (layered Ionicons heart) with a cute face; hearts burst on tap.
function LoveBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#FF6FA1', '#FF2D6B']} bare variant="pop" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => (
        <>
          {/* heart silhouette: darker base behind a brighter front for depth */}
          <View style={{ position: 'absolute', left: w * 0.5 - w * 0.47, top: h * 0.08 }} pointerEvents="none">
            <Ionicons name="heart" size={w * 0.94} color="#C81E48" />
          </View>
          <View style={{ position: 'absolute', left: w * 0.5 - w * 0.43, top: h * 0.1 }} pointerEvents="none">
            <Ionicons name="heart" size={w * 0.86} color="#FF3D6E" />
          </View>
          <RoundEye cx={w * 0.38} cy={h * 0.42} d={w * 0.1} ink="#7A1030" />
          <RoundEye cx={w * 0.62} cy={h * 0.42} d={w * 0.1} ink="#7A1030" />
          <Arc cx={w * 0.5} cy={h * 0.54} w={w * 0.2} h={h * 0.1} thick={thick(w)} ink="#7A1030" dir="down" />
          <FloatHeart pop={anim.pop} cx={w * 0.5} cy={h * 0.12} size={w * 0.28} />
          <FloatHeart pop={anim.pop} cx={w * 0.26} cy={h * 0.2} size={w * 0.2} delay={0.18} />
          <FloatHeart pop={anim.pop} cx={w * 0.74} cy={h * 0.2} size={w * 0.2} delay={0.3} />
        </>
      )}
    </BlobBase>
  );
}

// 😂 Joy — yellow blob, scrunched eyes, wide open laugh; tears splash outward as it laugh-shakes.
function JoyBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#FFD24D', '#FFAE00']} variant="shake" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => (
        <>
          <Arc cx={w * 0.33} cy={h * 0.42} w={w * 0.2} h={h * 0.12} thick={thick(w)} dir="up" />
          <Arc cx={w * 0.67} cy={h * 0.42} w={w * 0.2} h={h * 0.12} thick={thick(w)} dir="up" />
          <OpenMouth cx={w * 0.5} cy={h * 0.68} w={w * 0.36} h={h * 0.24} tongue />
          {/* tears fling outward as it laughs — a big droplet then a smaller trailing one per side */}
          <SplashTear pop={anim.pop} cx={w * 0.2} cy={h * 0.46} w={w * 0.14} dir={-1} />
          <SplashTear pop={anim.pop} cx={w * 0.24} cy={h * 0.4} w={w * 0.09} dir={-1} delay={0.22} />
          <SplashTear pop={anim.pop} cx={w * 0.8} cy={h * 0.46} w={w * 0.14} dir={1} />
          <SplashTear pop={anim.pop} cx={w * 0.76} cy={h * 0.4} w={w * 0.09} dir={1} delay={0.22} />
        </>
      )}
    </BlobBase>
  );
}

// 😮 Wow — wide round eyes + a big "O" mouth; stretches tall on tap.
function WowBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#FFD96B', '#F5A623']} variant="stretch" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h }) => (
        <>
          <RoundEye cx={w * 0.33} cy={h * 0.4} d={w * 0.17} />
          <RoundEye cx={w * 0.67} cy={h * 0.4} d={w * 0.17} />
          <OpenMouth cx={w * 0.5} cy={h * 0.68} w={w * 0.24} h={h * 0.3} />
        </>
      )}
    </BlobBase>
  );
}

// 🔥 Fire — a flame character (layered Ionicons flame) with a glowing core; flickers + throws sparks.
function FireBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#FF8A2D', '#FF2D2D']} bare variant="pop" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => (
        <>
          {/* outer flame */}
          <View style={{ position: 'absolute', left: w * 0.5 - w * 0.48, top: h * 0.02 }} pointerEvents="none">
            <Ionicons name="flame" size={w * 0.96} color="#FF6A1A" />
          </View>
          {/* glowing inner flame */}
          <View style={{ position: 'absolute', left: w * 0.5 - w * 0.3, top: h * 0.3 }} pointerEvents="none">
            <Ionicons name="flame" size={w * 0.6} color="#FFC24D" />
          </View>
          {/* a flickering crown tip */}
          <FlameTip bob={anim.bob} cx={w * 0.52} cy={h * 0.12} w={w * 0.16} h={h * 0.2} color="#FFB23D" />
          {/* smoke curling up off the flame */}
          <SmokeWisp cx={w * 0.46} cy={h * 0.06} w={w * 0.22} rise={h * 0.55} drift={w * 0.08} phase={0} />
          <SmokeWisp cx={w * 0.57} cy={h * 0.02} w={w * 0.18} rise={h * 0.6} drift={w * -0.07} phase={0.34} />
          <SmokeWisp cx={w * 0.5} cy={h * 0.1} w={w * 0.26} rise={h * 0.5} drift={w * 0.05} phase={0.67} />
          <RoundEye cx={w * 0.4} cy={h * 0.58} d={w * 0.1} ink="#5A1500" />
          <RoundEye cx={w * 0.6} cy={h * 0.58} d={w * 0.1} ink="#5A1500" />
          <Confetti pop={anim.pop} cx={w * 0.42} cy={h * 0.16} angle={-Math.PI / 2.3} dist={w * 0.72} size={w * 0.11} color="#FFD24D" />
          <Confetti pop={anim.pop} cx={w * 0.58} cy={h * 0.16} angle={-Math.PI / 1.9} dist={w * 0.72} size={w * 0.11} color="#FF8A2D" />
        </>
      )}
    </BlobBase>
  );
}

// 👏 Clap — friendly blob with two little hands that clap together at centre (+ sparkles) each cycle.
function ClapBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#9B6CFF', '#6C3CE0']} variant="pop" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => (
        <>
          <Arc cx={w * 0.34} cy={h * 0.34} w={w * 0.17} h={h * 0.1} thick={thick(w)} ink="#fff" dir="up" />
          <Arc cx={w * 0.66} cy={h * 0.34} w={w * 0.17} h={h * 0.1} thick={thick(w)} ink="#fff" dir="up" />
          <Arc cx={w * 0.5} cy={h * 0.48} w={w * 0.28} h={h * 0.14} thick={thick(w)} ink="#fff" dir="down" />
          <ClapHand pop={anim.pop} bw={w} bh={h} side={-1} d={w * 0.24} />
          <ClapHand pop={anim.pop} bw={w} bh={h} side={1} d={w * 0.24} />
          <Sparkle pop={anim.pop} cx={w * 0.5} cy={h * 0.58} size={w * 0.24} delay={0.24} />
        </>
      )}
    </BlobBase>
  );
}

// 😭 Sob — blue blob, worried brows, frown, with two non-stop streams of tears.
function SobBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#6FB8FF', '#2D7BFF']} variant="shake" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h }) => (
        <>
          <Brow cx={w * 0.33} cy={h * 0.32} w={w * 0.2} thick={thick(w)} rot={-16} ink="#11324F" />
          <Brow cx={w * 0.67} cy={h * 0.32} w={w * 0.2} thick={thick(w)} rot={16} ink="#11324F" />
          <Arc cx={w * 0.33} cy={h * 0.46} w={w * 0.16} h={h * 0.1} thick={thick(w)} ink="#11324F" dir="up" />
          <Arc cx={w * 0.67} cy={h * 0.46} w={w * 0.16} h={h * 0.1} thick={thick(w)} ink="#11324F" dir="up" />
          <Arc cx={w * 0.5} cy={h * 0.72} w={w * 0.26} h={h * 0.12} thick={thick(w)} ink="#11324F" dir="up" />
          {/* two staggered streams under each eye → continuous crying */}
          <StreamTear cx={w * 0.31} cy={h * 0.56} w={w * 0.11} fall={h * 0.4} phase={0} />
          <StreamTear cx={w * 0.31} cy={h * 0.56} w={w * 0.11} fall={h * 0.4} phase={0.5} />
          <StreamTear cx={w * 0.69} cy={h * 0.56} w={w * 0.11} fall={h * 0.4} phase={0.25} />
          <StreamTear cx={w * 0.69} cy={h * 0.56} w={w * 0.11} fall={h * 0.4} phase={0.75} />
        </>
      )}
    </BlobBase>
  );
}

// 👍 Thumbs up — shaped like the emoji: a thumbs-up hand (Ionicons) over a darker one for an outline;
// jumps on tap with a sparkle.
function ThumbsBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#FFC98A', '#E0A85C']} bare variant="jump" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => (
        <>
          <View style={{ position: 'absolute', left: w * 0.5 - w * 0.46, top: h * 0.06 }} pointerEvents="none">
            <Ionicons name="thumbs-up" size={w * 0.92} color="#C8862E" />
          </View>
          <View style={{ position: 'absolute', left: w * 0.5 - w * 0.42, top: h * 0.085 }} pointerEvents="none">
            <Ionicons name="thumbs-up" size={w * 0.84} color="#FFC98A" />
          </View>
          <Sparkle pop={anim.pop} cx={w * 0.78} cy={h * 0.22} size={w * 0.22} />
        </>
      )}
    </BlobBase>
  );
}

// 😍 Heart eyes — pink blob with hearts for eyes + a big grin; hearts burst out on tap.
function HeartEyesBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#FFD96B', '#F5A623']} variant="pop" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => (
        <>
          <HeartEye cx={w * 0.33} cy={h * 0.42} size={w * 0.22} grow={anim.pop} />
          <HeartEye cx={w * 0.67} cy={h * 0.42} size={w * 0.22} grow={anim.pop} />
          <Arc cx={w * 0.5} cy={h * 0.68} w={w * 0.36} h={h * 0.18} thick={thick(w)} dir="down" />
          <FloatHeart pop={anim.pop} cx={w * 0.22} cy={h * 0.3} size={w * 0.26} />
          <FloatHeart pop={anim.pop} cx={w * 0.78} cy={h * 0.3} size={w * 0.26} delay={0.18} />
          <FloatHeart pop={anim.pop} cx={w * 0.5} cy={h * 0.14} size={w * 0.3} delay={0.3} />
        </>
      )}
    </BlobBase>
  );
}

// 🎉 Party — purple blob in a party hat; spins and bursts confetti on tap.
// 🎉 Party popper — the actual popper emoji (a tilted striped cone) that EXPLODES a fan of
// confetti out of its mouth on tap. `bare` so there's no blob body; it breathes on idle + pops.
function PartyBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  const COLORS = ['#FF4FA3', '#FFD24D', '#4DD0FF', '#7CFF7C', '#FF8A2D', '#B14DFF', '#FF5C5C', '#5CE1E6'];
  const CONE = '#FF2D7A', RIM = '#FFD24D', STRIPE = '#FFFFFF';
  return (
    <BlobBase size={size} colors={['#8A5BFF', '#B14DFF']} bare variant="pop" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => {
        const hw = w * 0.17, len = h * 0.46;     // cone half-width + length
        const ox = w * 0.56, oy = h * 0.45;       // explosion origin ≈ the cone's mouth (after tilt)
        const N = COLORS.length;
        return (
          <>
            {/* The popper cone: a down-pointing triangle + a mouth rim + a stripe, all in one
                container tilted to open up-and-to-the-right (like the real 🎉). */}
            <View style={{ position: 'absolute', left: w * 0.5 - hw, top: h * 0.46, width: hw * 2, height: len, transform: [{ rotate: '20deg' }] }} pointerEvents="none">
              <View style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, borderLeftWidth: hw, borderRightWidth: hw, borderTopWidth: len, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: CONE }} />
              <View style={{ position: 'absolute', top: -hw * 0.45, left: 0, width: hw * 2, height: hw, borderRadius: hw, backgroundColor: RIM }} />
              <View style={{ position: 'absolute', top: len * 0.42, left: hw * 0.5, width: hw, height: Math.max(2, len * 0.1), borderRadius: 2, backgroundColor: STRIPE }} />
            </View>
            {/* The explosion: a fan of confetti bursting from the mouth toward the upper-right. */}
            {COLORS.map((c, i) => {
              const t = N > 1 ? i / (N - 1) : 0.5;
              const angle = -1.75 + t * 1.55;           // ≈ -100° → -10°: up → right fan
              const dist = w * (0.72 + (i % 3) * 0.12);  // varied throw distance
              return <Confetti key={i} pop={anim.pop} cx={ox} cy={oy} angle={angle} dist={dist} size={w * (0.1 + (i % 2) * 0.04)} color={c} />;
            })}
          </>
        );
      }}
    </BlobBase>
  );
}

// 😡 Angry — red blob, angry brows, grimace, steam puffs; shakes furiously on tap.
function AngryBlob({ size, onPress, excited, style, idlePhase }: BlobProps) {
  return (
    <BlobBase size={size} colors={['#FF5A4D', '#D81E2C']} variant="shake" onPress={onPress} excited={excited} style={style} idlePhase={idlePhase}>
      {({ w, h, anim }) => (
        <>
          <Brow cx={w * 0.34} cy={h * 0.34} w={w * 0.22} thick={thick(w) * 1.3} rot={20} ink="#3A0008" />
          <Brow cx={w * 0.66} cy={h * 0.34} w={w * 0.22} thick={thick(w) * 1.3} rot={-20} ink="#3A0008" />
          <RoundEye cx={w * 0.36} cy={h * 0.46} d={w * 0.11} ink="#3A0008" shine={false} />
          <RoundEye cx={w * 0.64} cy={h * 0.46} d={w * 0.11} ink="#3A0008" shine={false} />
          <Arc cx={w * 0.5} cy={h * 0.72} w={w * 0.28} h={h * 0.12} thick={thick(w)} ink="#3A0008" dir="up" />
          {/* steam blowing off in anger — a continuous stream from each side of the head */}
          <SmokeWisp cx={w * 0.3} cy={h * 0.12} w={w * 0.16} rise={h * 0.5} drift={w * -0.06} phase={0.1} color="rgba(238,238,242,0.6)" />
          <SmokeWisp cx={w * 0.7} cy={h * 0.12} w={w * 0.16} rise={h * 0.5} drift={w * 0.06} phase={0.5} color="rgba(238,238,242,0.6)" />
          <Steam pop={anim.pop} cx={w * 0.14} cy={h * 0.24} size={w * 0.16} dir={-1} />
          <Steam pop={anim.pop} cx={w * 0.86} cy={h * 0.24} size={w * 0.16} dir={1} />
        </>
      )}
    </BlobBase>
  );
}

export const BLOB_EMOJIS: Record<string, React.FC<BlobProps>> = {
  '❤️': LoveBlob,
  '😂': JoyBlob,
  '😮': WowBlob,
  '🔥': FireBlob,
  '👏': ClapBlob,
  '😭': SobBlob,
  '👍': ThumbsBlob,
  '😍': HeartEyesBlob,
  '🎉': PartyBlob,
  '😡': AngryBlob,
};

/** Every emoji we have blob art for. */
export const BLOB_KEYS = Object.keys(BLOB_EMOJIS);

export function hasBlob(emoji: string): boolean {
  return !!BLOB_EMOJIS[emoji];
}

// Stable per-emoji idle phase so a row of blobs breathes out of sync without any caller wiring.
function phaseFor(emoji: string): number {
  let n = 0;
  for (let i = 0; i < emoji.length; i++) { n = (n * 31 + emoji.charCodeAt(i)) >>> 0; }
  return (n % 100) / 100;
}

/** Render the blob for `emoji`, or null if we have no art for it (caller falls back to the glyph). */
export function BlobEmoji({ emoji, size, onPress, excited, style, idlePhase }: { emoji: string } & BlobProps) {
  const Comp = BLOB_EMOJIS[emoji];
  if (!Comp) { return null; }
  return <Comp size={size} onPress={onPress} excited={excited} style={style} idlePhase={idlePhase ?? phaseFor(emoji)} />;
}
