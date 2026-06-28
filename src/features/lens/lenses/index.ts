// The lens catalog. Each lens lives in its own file and is registered here; the order is the order
// shown in the picker. To add a lens: create lenses/<name>.tsx exporting a component, import it, and
// add an entry. `warp: true` lenses bend the live camera pixels (handled by the capture screen) and
// only use `Comp` for the static picker preview.
import type { Lens, LensCategory } from '../core';
import { Debug } from './debug';
import { Silhouette } from './silhouette';
import { BigEyes } from './bigEyes';
import { Galaxy } from './galaxy';
import { NeonVisor } from './neonVisor';
import { Inferno } from './inferno';
import { Demon } from './demon';
import { Angel } from './angel';
import { Frost } from './frost';
import { Electric } from './electric';
import { RainbowAura } from './rainbow';
import { Disco } from './disco';
import { LoveStorm } from './loveStorm';
import { Crown } from './crown';
import { Tears } from './tears';
import { Bubbles } from './bubbles';
import { Starstruck } from './starstruck';
import { Toxic } from './toxic';
import { Petals } from './petals';
import { WarpGhost } from './warpGhost';
import { FireBreath } from './fireBreath';
import { RainbowBreath } from './rainbowBreath';
import { Bubblegum } from './bubblegum';
import { CelestialBloom } from './celestialBloom';
import { PhoenixAscendant } from './phoenixAscendant';
import { ThirdEye } from './thirdEye';
import { NaturalLook, GlamLook } from './beautyLooks';
import { MoneyRain } from './moneyRain';
import { FairyDust } from './fairyDust';
import { Vampire } from './vampire';
import { MusicVibe } from './musicVibe';
import { Alien } from './alien';
import { Hologram } from './hologram';
import { Ghost } from './ghost';
import { Solar } from './solar';
import { Butterfly } from './butterfly';
import { Aurora } from './aurora';
import { StormCloud } from './stormCloud';
import { Peacock } from './peacock';
import { Cat } from './cat';
import { Lava } from './lava';
import { Frostbite } from './frostbite';
import { Biohazard } from './biohazard';
import { Bejeweled } from './bejeweled';
import { Wildfire } from './wildfire';
import { Voltage } from './voltage';
import { HoloMesh } from './holoMesh';
import { Prism } from './prism';
import { Reef } from './reef';
import { Bloom } from './bloom';
import { Blizzard } from './blizzard';
import { Flutter } from './flutter';
import { Spectre } from './spectre';
import { DemonMesh } from './demonMesh';
import { Seraph } from './seraph';
import { Chrome } from './chrome';
import { Scuba } from './scuba';
import { Astronaut } from './astronaut';
import { Knight } from './knight';
import { Hud } from './hud';
import { Aviator } from './aviator';
import { Steampunk } from './steampunk';

// SPIKE: UI-thread pipeline A/B. The capture screen renders this via useSpikeFrameProcessor (draws
// straight on the camera frame, like a warp), so this Comp is just a never-rendered catalog placeholder.
const SpikePlaceholder: Lens['Comp'] = () => null;

export const LENSES: Lens[] = [
  { key: 'spike', label: '⚡ Spike (UI)', icon: 'flash', Comp: SpikePlaceholder },
  { key: 'debug', label: 'Debug', icon: 'bug', Comp: Debug, mesh: true },
  // "React Anonymously" — privacy silhouette. mesh:true so it tracks the head. Forced on (not just
  // picked) when the user's anonymous-mode account setting is enabled.
  { key: 'anon', label: 'Anonymous', icon: 'eye-off-outline', Comp: Silhouette, mesh: true },
  // ── Beauty (skin retouch via the warp pixel pipeline; makeup via the mesh overlay) ──
  { key: 'smooth', label: 'Smooth', icon: 'sparkles-outline', Comp: WarpGhost, warp: 'smooth', beauty: true },
  { key: 'glow', label: 'Glow', icon: 'sunny-outline', Comp: WarpGhost, warp: 'glow', beauty: true },
  { key: 'natural', label: 'Natural', icon: 'color-palette-outline', Comp: NaturalLook, mesh: true, beauty: true },
  { key: 'glam', label: 'Glam', icon: 'diamond-outline', Comp: GlamLook, mesh: true, beauty: true },
  // ── Face-mesh lenses (full 478-pt mesh) ──
  // These render via their reactive *Rx (faceLens REACTIVE_RENDERERS) for both live AND bake — no legacy Comp.
  { key: 'drippy', label: 'Drippy', icon: 'happy', mesh: true, featured: true }, // ✦ become the mascot — slime skin
  { key: 'melt', label: 'Melt', icon: 'water', mesh: true, featured: true }, // ✦ signature liquid-chrome mask
  { key: 'cyber', label: 'Cyber Mesh', icon: 'grid', mesh: true },
  { key: 'starmap', label: 'Star Map', icon: 'star-outline', mesh: true },
  { key: 'gilded', label: 'Gilded', icon: 'diamond-outline', mesh: true },
  { key: 'circuit', label: 'Circuit', icon: 'hardware-chip-outline', mesh: true },
  { key: 'lava', label: 'Lava', icon: 'thermometer', Comp: Lava, mesh: true },
  { key: 'frostbite', label: 'Frostbite', icon: 'snow-sharp', Comp: Frostbite, mesh: true },
  { key: 'nebula', label: 'Nebula', icon: 'planet-outline', mesh: true },
  { key: 'biohazard', label: 'Biohazard', icon: 'nuclear-outline', Comp: Biohazard, mesh: true },
  { key: 'bejeweled', label: 'Bejeweled', icon: 'diamond-sharp', Comp: Bejeweled, mesh: true },
  { key: 'wildfire', label: 'Wildfire', icon: 'bonfire-outline', Comp: Wildfire, mesh: true },
  { key: 'voltage', label: 'Voltage', icon: 'flash-outline', Comp: Voltage, mesh: true },
  { key: 'holomesh', label: 'Holo Mesh', icon: 'scan-outline', Comp: HoloMesh, mesh: true },
  { key: 'prism', label: 'Prism', icon: 'color-filter-outline', Comp: Prism, mesh: true },
  { key: 'web', label: 'Web', icon: 'git-network-outline', mesh: true },
  { key: 'reef', label: 'Reef', icon: 'water-outline', Comp: Reef, mesh: true },
  { key: 'bloom', label: 'Bloom', icon: 'flower-outline', Comp: Bloom, mesh: true },
  { key: 'blizzard', label: 'Blizzard', icon: 'snow-outline', Comp: Blizzard, mesh: true },
  { key: 'flutter', label: 'Flutter', icon: 'leaf-outline', Comp: Flutter, mesh: true },
  { key: 'spectre', label: 'Spectre', icon: 'skull-outline', Comp: Spectre, mesh: true },
  { key: 'demonmesh', label: 'Demon', icon: 'flame-outline', Comp: DemonMesh, mesh: true },
  { key: 'seraph', label: 'Seraph', icon: 'sunny-outline', Comp: Seraph, mesh: true },
  { key: 'pixel', label: 'Pixel', icon: 'apps-outline', mesh: true },
  { key: 'chrome', label: 'Chrome', icon: 'ellipse-outline', Comp: Chrome, mesh: true },
  { key: 'scuba', label: 'Scuba', icon: 'glasses', Comp: Scuba, mesh: true },
  { key: 'astronaut', label: 'Astronaut', icon: 'rocket-outline', Comp: Astronaut, mesh: true },
  { key: 'knight', label: 'Knight', icon: 'shield-half-outline', Comp: Knight, mesh: true },
  { key: 'hud', label: 'HUD', icon: 'scan-circle-outline', Comp: Hud, mesh: true },
  { key: 'aviator', label: 'Aviator', icon: 'airplane-outline', Comp: Aviator, mesh: true },
  { key: 'steampunk', label: 'Steampunk', icon: 'cog-outline', Comp: Steampunk, mesh: true },
  // ── Camera-warp lenses (bend the real pixels) ──
  { key: 'megaeyes', label: 'Mega Eyes', icon: 'eye', Comp: BigEyes, warp: 'eyes' },
  { key: 'bighead', label: 'Big Head', icon: 'happy', Comp: WarpGhost, warp: 'bighead' },
  { key: 'tinyface', label: 'Tiny Face', icon: 'contract', Comp: WarpGhost, warp: 'tinyface' },
  { key: 'swirl', label: 'Swirl', icon: 'sync', Comp: WarpGhost, warp: 'swirl' },
  { key: 'glitch', label: 'Glitch', icon: 'pulse', Comp: WarpGhost, warp: 'glitch' },
  { key: 'kaleido', label: 'Kaleidoscope', icon: 'aperture', Comp: WarpGhost, warp: 'kaleido' },
  { key: 'shockring', label: 'Shock Ring', icon: 'pulse', Comp: WarpGhost, warp: 'shockwave', featured: true }, // ✦ refractive pixel-bend ring

  // ── Expression-interaction lenses (driven by face-mesh blendshapes) ──
  // mesh:true requests the Face Landmarker track so smile/brow/jaw blendshapes are reliable; they
  // still show in the Gesture tab (lensCategory checks `gesture` first) and degrade to a faint idle
  // state when blendshapes are absent (BlazeFace builds / replay).
  { key: 'overdrive', label: 'Overdrive', icon: 'flash', mesh: true, gesture: true, featured: true }, // ✦ charge (brows) → unleash (yell)
  { key: 'blobstorm', label: 'Blob Storm', icon: 'happy', mesh: true, gesture: true, featured: true }, // ✦ open mouth → blob friends pour out
  { key: 'firebreath', label: 'Fire Breath', icon: 'flame-outline', Comp: FireBreath, gesture: true },
  { key: 'rainbreath', label: 'Rainbow Mouth', icon: 'color-wand', Comp: RainbowBreath, gesture: true },
  { key: 'bubblegum', label: 'Bubblegum', icon: 'balloon', Comp: Bubblegum, gesture: true },
  { key: 'phoenix', label: 'Phoenix', icon: 'flame', Comp: PhoenixAscendant, gesture: true, mesh: true },
  { key: 'celestial', label: 'Celestial', icon: 'happy-outline', Comp: CelestialBloom, gesture: true, mesh: true },
  { key: 'thirdeye', label: 'Third Eye', icon: 'eye-outline', Comp: ThirdEye, gesture: true, mesh: true },
  // ── Overlay lenses ──
  { key: 'galaxy', label: 'Cosmic', icon: 'planet', Comp: Galaxy },
  { key: 'neon', label: 'Neon', icon: 'glasses-outline', Comp: NeonVisor },
  { key: 'inferno', label: 'Inferno', icon: 'flame', Comp: Inferno },
  { key: 'demon', label: 'Demon', icon: 'skull', Comp: Demon },
  { key: 'angel', label: 'Angel', icon: 'sparkles', Comp: Angel },
  { key: 'frost', label: 'Frost', icon: 'snow', Comp: Frost },
  { key: 'electric', label: 'Electric', icon: 'flash', Comp: Electric },
  { key: 'rainbow', label: 'Rainbow', icon: 'color-palette', Comp: RainbowAura },
  { key: 'disco', label: 'Disco', icon: 'disc', Comp: Disco },
  { key: 'love', label: 'Love Storm', icon: 'heart', Comp: LoveStorm },
  { key: 'crown', label: 'Royalty', icon: 'diamond', Comp: Crown },
  { key: 'tears', label: 'Tears', icon: 'water', Comp: Tears },
  { key: 'bubbles', label: 'Bubbles', icon: 'ellipse-outline', Comp: Bubbles },
  { key: 'starstruck', label: 'Starstruck', icon: 'star', Comp: Starstruck },
  { key: 'toxic', label: 'Toxic', icon: 'flask', Comp: Toxic },
  { key: 'petals', label: 'Blossom', icon: 'flower', Comp: Petals },
  { key: 'money', label: 'Make It Rain', icon: 'cash', Comp: MoneyRain },
  { key: 'fairy', label: 'Fairy Dust', icon: 'sparkles-outline', Comp: FairyDust },
  { key: 'vampire', label: 'Vampire', icon: 'moon', Comp: Vampire },
  { key: 'music', label: 'Vibe', icon: 'musical-notes', Comp: MusicVibe },
  { key: 'alien', label: 'Abduction', icon: 'planet-outline', Comp: Alien },
  { key: 'hologram', label: 'Hologram', icon: 'scan', Comp: Hologram },
  { key: 'ghost', label: 'Haunted', icon: 'skull-outline', Comp: Ghost },
  { key: 'solar', label: 'Sun God', icon: 'sunny', Comp: Solar },
  { key: 'butterfly', label: 'Butterflies', icon: 'leaf', Comp: Butterfly },
  { key: 'aurora', label: 'Aurora', icon: 'cloudy-night', Comp: Aurora },
  { key: 'storm', label: 'Storm Cloud', icon: 'thunderstorm', Comp: StormCloud },
  { key: 'peacock', label: 'Peacock', icon: 'leaf-outline', Comp: Peacock },
  { key: 'cat', label: 'Kitty', icon: 'paw', Comp: Cat },
];

export const lensByKey = (k?: string | null) => (k ? LENSES.find(l => l.key === k) : undefined);

// Which picker tab a lens belongs to. Warp lenses bend pixels; gesture lenses react to a facial
// action; mesh lenses render from the 478-pt mesh; everything else is a plain overlay.
export function lensCategory(l: Lens): LensCategory {
  if (l.beauty) { return 'beauty'; } // checked first: beauty lenses also set warp/mesh as their render mechanism
  if (l.warp) { return 'warp'; }
  if (l.gesture) { return 'gesture'; }
  if (l.mesh) { return 'mesh'; }
  return 'overlay';
}
