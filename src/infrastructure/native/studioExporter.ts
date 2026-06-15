import { NativeModules, Platform } from 'react-native';
import { assertRecipeValid, type StudioRecipe } from '../creatorStudio/recipe';

// Thin shim over the native StudioExporter module (iOS AVFoundation now, Android
// Media3 later). Bakes a non-destructive recipe into one MP4 and returns its uri.

const { StudioExporter: _SE } = NativeModules;

export type ExportResult = { uri: string };

/**
 * Bake a recipe to a single MP4 and return its file uri. Validates the recipe
 * (incl. the 3-min cap) before crossing the bridge, and surfaces a clear error
 * if the native module isn't present (i.e. the app wasn't rebuilt).
 */
export async function exportRecipe(
  recipe: StudioRecipe,
  sourceDurationMs?: number,
): Promise<ExportResult> {
  assertRecipeValid(recipe, sourceDurationMs);
  if (!_SE) {
    throw new Error(
      `StudioExporter native module missing — rebuild the ${Platform.OS} app.`,
    );
  }
  const path: string = await _SE.export(recipe);
  return { uri: path.startsWith('file://') ? path : `file://${path}` };
}

/** Whether the native exporter is available on this build (for feature gating). */
export const isStudioExporterAvailable = !!_SE;
