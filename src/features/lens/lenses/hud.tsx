import React from 'react';
import { Group, RoundedRect, Circle, BlurMask } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { MeshWire } from './_meshKit';
import { ScreenTint, type LensProps } from '../core';

// HUD: a translucent cyber visor over the eyes — low-alpha glass (eyes read through), a glowing frame,
// a sweeping scan-line, and a spinning targeting reticle, over a faint glowing wireframe.
export function Hud({ f, clock, w, h }: LensProps) {
  if (!f.mesh) { return null; }
  const roll = (f.rollDeg * Math.PI) / 180;
  const eX = f.eyeDist / f.faceW / 2;
  const tf = [{ translateX: f.eyeMid.x }, { translateY: f.eyeMid.y }, { rotate: roll }, { scale: f.faceW }];
  const scan = useDerivedValue(() => [{ translateY: -0.26 + ((clock.value * 0.5) % 1) * 0.5 }]);
  const spin = useDerivedValue(() => [{ rotate: clock.value * 1.5 }]);
  return (
    <>
      <ScreenTint w={w} h={h} colors={['#001318', '#000507']} opacity={0.35} />
      <MeshWire mesh={f.mesh} color="#00E5FF" width={1.6} blur={5} opacity={0.5} />
      <Group transform={tf}>
        {/* translucent visor band */}
        <RoundedRect x={-0.72} y={-0.3} width={1.44} height={0.56} r={0.14} color="rgba(0,40,55,0.22)" />
        <RoundedRect x={-0.72} y={-0.3} width={1.44} height={0.56} r={0.14} style="stroke" strokeWidth={0.03} color="#00E5FF"><BlurMask blur={3} style="solid" /></RoundedRect>
        {/* scan-line */}
        <Group transform={scan}>
          <RoundedRect x={-0.7} y={-0.012} width={1.4} height={0.024} r={0.012} color="rgba(0,229,255,0.5)"><BlurMask blur={2} style="solid" /></RoundedRect>
        </Group>
        {/* targeting reticle over one eye */}
        <Group transform={[{ translateX: eX }]}>
          <Circle cx={0} cy={0} r={0.16} style="stroke" strokeWidth={0.018} color="#00E5FF" />
          <Group transform={spin}>
            <Circle cx={0} cy={0} r={0.1} style="stroke" strokeWidth={0.012} color="rgba(0,229,255,0.7)" />
          </Group>
        </Group>
      </Group>
    </>
  );
}
