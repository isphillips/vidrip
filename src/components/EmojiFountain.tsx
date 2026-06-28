import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, Easing, interpolate, runOnJS, type SharedValue,
} from 'react-native-reanimated';
import EmojiGlyph from './EmojiGlyph';
import { BlobStaticContext } from './blobEmoji/BlobBase';

// A full-screen, pointer-transparent overlay that THROWS emoji from the bottom-centre with real
// projectile physics — an initial launch velocity + constant gravity, so they shoot up, decelerate,
// hang at the apex, then accelerate back down (fading + scaling + tumbling on the descent). Each throw
// also leaves a short SMOKE trail along its launch path (puffs that expand, rise + dissipate). Launch
// power, angle and spin are randomised per throw, so it feels tossed rather than tracing a fixed arc.
// Imperative: ref.emit(emoji). Used while RECORDING (the reactor spams) and on PLAYBACK (re-emit at the
// same video times). The trajectory isn't stored — playback just gets a fresh toss.

export type EmojiFountainHandle = { emit: (emoji: string) => void };

// One recorded emoji throw: which emoji `e`, at video time `t` (seconds from the reaction's start).
// On playback we re-emit at `t` with a fresh random toss (the trajectory isn't stored).
export type EmojiHit = { e: string; t: number };

const SIZE = 46;
const GRAVITY = 2600;          // px/s² downward — the constant that makes it feel like gravity
const SMOKE_COUNT = 4;         // puffs dropped along the launch path (each is a per-frame worklet → keep lean)
const SMOKE_LIFE = 0.6;        // seconds each puff lives
// Hard cap on simultaneous throws. Every live particle runs (1 flight + SMOKE_COUNT) worklets per frame,
// so an unbounded burst (rapid spam, or playback re-emitting clustered hits) is what tanks the framerate
// over a playing video. Past the cap we recycle the oldest — visually unnoticeable in a dense fountain.
const MAX_PARTICLES = 16;

type Particle = {
  id: number; emoji: string;
  vy0: number;   // launch velocity (px/s, negative = up)
  vx: number;    // horizontal velocity (px/s) — constant, gives the throw its sideways arc
  spin: number;  // angular velocity (rad/s) — tumble
  apex: number;  // time to the top (s)
  total: number; // flight time (s)
};

// A single smoke puff: born (along the early flight path) at `birth`, then expands, rises + fades out.
function SmokePuff({ clock, birth, bx, by, size }: { clock: SharedValue<number>; birth: number; bx: number; by: number; size: number }) {
  const st = useAnimatedStyle(() => {
    const age = clock.value - birth;
    if (age < 0 || age > SMOKE_LIFE) { return { opacity: 0 }; }
    const prog = age / SMOKE_LIFE;
    return {
      opacity: interpolate(prog, [0, 0.2, 1], [0, 0.3, 0]),
      transform: [
        { translateX: bx },
        { translateY: by - prog * 26 },   // drifts upward as it dissipates
        { scale: interpolate(prog, [0, 1], [0.5, 1.9]) },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: SIZE / 2 - size / 2, top: SIZE / 2 - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: '#D8D8E2' }, st]}
    />
  );
}

// Memoised so adding/removing a throw never re-renders the OTHER live particles (the particle object
// and the stable `onDone` keep props referentially equal). Without this, every emit reconciled the whole
// growing list. `onDone` takes the id so it can stay stable across renders.
const FlyingEmoji = React.memo(function FlyingEmoji({ p, onDone }: { p: Particle; onDone: (id: number) => void }) {
  const clock = useSharedValue(0); // seconds since launch
  useEffect(() => {
    clock.value = withTiming(p.total, { duration: Math.round(p.total * 1000), easing: Easing.linear },
      (finished) => { if (finished) { runOnJS(onDone)(p.id); } });
  }, [clock, p, onDone]);

  // Smoke puffs are dropped at points the emoji passes through over the first ~0.3s of flight (jittered).
  const puffs = useMemo(() => {
    const arr: { birth: number; bx: number; by: number; size: number }[] = [];
    for (let i = 0; i < SMOKE_COUNT; i++) {
      const birth = 0.015 + i * 0.05;
      arr.push({
        birth,
        bx: p.vx * birth + (Math.random() * 2 - 1) * 9,
        by: p.vy0 * birth + 0.5 * GRAVITY * birth * birth,
        size: 22 + Math.random() * 12,
      });
    }
    return arr;
  }, [p]);

  const style = useAnimatedStyle(() => {
    const t = clock.value;
    // Kinematics: x = vx·t, y = vy0·t + ½g·t² (y grows downward; vy0 is negative so it rises first).
    const x = p.vx * t;
    const y = p.vy0 * t + 0.5 * GRAVITY * t * t;
    const rot = p.spin * t;
    // Descent progress (0 at apex → 1 at landing) drives the fade + shrink "on the way down".
    const desc = t <= p.apex ? 0 : (t - p.apex) / (p.total - p.apex);
    const fadeIn = t < 0.09 ? t / 0.09 : 1;       // quick pop-in
    const popIn = t < 0.12 ? 0.5 + (t / 0.12) * 0.5 : 1;
    return {
      opacity: fadeIn * (1 - desc),
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${rot}rad` },
        { scale: popIn * (1 - desc * 0.5) },
      ],
    };
  });

  return (
    <>
      {puffs.map((s, i) => (
        <SmokePuff key={i} clock={clock} birth={s.birth} bx={s.bx} by={s.by} size={s.size} />
      ))}
      <Animated.View pointerEvents="none" style={[styles.particle, style]}>
        <EmojiGlyph emoji={p.emoji} size={SIZE} />
      </Animated.View>
    </>
  );
});

const EmojiFountain = forwardRef<EmojiFountainHandle>(function EmojiFountain(_props, ref) {
  const { width, height } = useWindowDimensions();
  const [parts, setParts] = useState<Particle[]>([]);
  const idRef = useRef(0);

  useImperativeHandle(ref, () => ({
    emit: (emoji: string) => {
      const id = ++idRef.current;
      // Peak height 50–75% of the screen → solve for the launch velocity under our gravity.
      const apexH = height * (0.5 + Math.random() * 0.25);
      const vy0 = -Math.sqrt(2 * GRAVITY * apexH);
      const apex = -vy0 / GRAVITY;                       // time to the top
      const total = apex * (2.2 + Math.random() * 0.5);  // fall a touch past the launch → off-screen
      const drift = (Math.random() * 2 - 1) * width * 0.28; // random sideways throw distance
      const vx = drift / total;
      const spin = (Math.random() * 2 - 1) * 4;          // tumble (rad/s)
      setParts(prev => {
        const next = [...prev, { id, emoji, vy0, vx, spin, apex, total }];
        // Recycle the oldest beyond the cap so a burst can't grow the per-frame worklet load unbounded.
        return next.length > MAX_PARTICLES ? next.slice(next.length - MAX_PARTICLES) : next;
      });
    },
  }), [height, width]);

  const remove = useCallback((id: number) => setParts(prev => prev.filter(x => x.id !== id)), []);

  return (
    // Freeze every blob in the fountain (no breathe/blink/idle loops) — see BlobStaticContext.
    <BlobStaticContext.Provider value={true}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {parts.map(pt => (
          // Each throw launches from the bottom-centre; transforms are relative to this anchor.
          <View key={pt.id} pointerEvents="none" style={[styles.anchor, { left: width / 2 - SIZE / 2 }]}>
            <FlyingEmoji p={pt} onDone={remove} />
          </View>
        ))}
      </View>
    </BlobStaticContext.Provider>
  );
});

export default EmojiFountain;

const styles = StyleSheet.create({
  anchor: { position: 'absolute', bottom: 96, width: SIZE, height: SIZE },
  particle: { position: 'absolute' },
});
