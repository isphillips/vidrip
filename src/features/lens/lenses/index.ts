// The lens catalog. Each lens lives in its own file and is registered here; the order is the order
// shown in the picker. To add a lens: create lenses/<name>.tsx exporting a component, import it, and
// add an entry. `warp: true` lenses bend the live camera pixels (handled by the capture screen) and
// only use `Comp` for the static picker preview.
import type { Lens } from '../core';
import { Debug } from './debug';
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

export const LENSES: Lens[] = [
  { key: 'debug', label: 'Debug', icon: 'bug', Comp: Debug },
  // ── Camera-warp lenses (bend the real pixels) ──
  { key: 'megaeyes', label: 'Mega Eyes', icon: 'eye', Comp: BigEyes, warp: 'eyes' },
  { key: 'bighead', label: 'Big Head', icon: 'happy', Comp: WarpGhost, warp: 'bighead' },
  { key: 'tinyface', label: 'Tiny Face', icon: 'contract', Comp: WarpGhost, warp: 'tinyface' },
  { key: 'swirl', label: 'Swirl', icon: 'sync', Comp: WarpGhost, warp: 'swirl' },
  { key: 'glitch', label: 'Glitch', icon: 'pulse', Comp: WarpGhost, warp: 'glitch' },
  { key: 'kaleido', label: 'Kaleidoscope', icon: 'aperture', Comp: WarpGhost, warp: 'kaleido' },
  // ── Mouth-interaction lenses (open your mouth) ──
  { key: 'firebreath', label: 'Fire Breath', icon: 'flame-outline', Comp: FireBreath },
  { key: 'rainbreath', label: 'Rainbow Mouth', icon: 'color-wand', Comp: RainbowBreath },
  { key: 'bubblegum', label: 'Bubblegum', icon: 'balloon', Comp: Bubblegum },
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
