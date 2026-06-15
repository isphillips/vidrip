import React from 'react';
import { View, StyleSheet } from 'react-native';
import { stickerByKey } from '../stickers';
import EffectText from './EffectText';
import type { OverlayRecipe, OverlayNode } from '../effectRecipe';

// Read-only reconstruction of a recipe's overlay layer at an arbitrary size. Mirrors the
// editor's DraggableOverlay transform (center → translate → scale → rotate) so a baked-in
// position lands identically; sizes scale by the box/canvas ratio to stay proportional.
function Node({ node, w, h, ratio }: { node: OverlayNode; w: number; h: number; ratio: number }) {
  const content = node.kind === 'text'
    ? <EffectText text={node.text} color={node.color} font={node.font} fontSize={node.fontSize} bold={node.bold} italic={node.italic} anim={node.anim} />
    : stickerByKey(node.stickerKey)?.render();
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
      <View style={{
        transform: [
          { translateX: node.nx * w - w / 2 },
          { translateY: node.ny * h - h / 2 },
          { scale: node.scale * ratio },
          { rotateZ: `${node.rotation}rad` },
        ],
      }}>
        {content}
      </View>
    </View>
  );
}

export default function EffectLayer({ recipe, width, height }: { recipe: OverlayRecipe; width: number; height: number }) {
  const ratio = recipe.canvasW > 0 ? width / recipe.canvasW : 1;
  const fs = recipe.fullscreen ? stickerByKey(recipe.fullscreen) : null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {fs?.renderFull?.(width, height)}
      {recipe.nodes.map((node, i) => <Node key={i} node={node} w={width} h={height} ratio={ratio} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
