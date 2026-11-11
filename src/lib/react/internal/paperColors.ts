import type { Paper, PaperId, PaperMap } from '../../core/types';

const DEFAULT_HUE = 220;

export type PaperColorScheme = 'light' | 'dark';

export interface PaperColorContext {
  hue: number;
  depth: number;
  // saturationScale multiplies every tone's HSL saturation (default 1).
  // 0 makes the paper render as a neutral white/grey surface regardless of hue;
  // useful for papers that host arbitrary content meant to read on white.
  saturationScale?: number;
}

export interface PaperTone {
  accent: string;
  background: string;
  backgroundHover: string;
  border: string;
  divider: string;
  headerBackground: string;
  headerBackgroundFocused: string;
  mutedText: string;
  text: string;
  title: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHue(hue: number) {
  const value = Number.isFinite(hue) ? hue : DEFAULT_HUE;
  return ((Math.round(value) % 360) + 360) % 360;
}

export function resolvePaperColorContext(
  paperHue: number | undefined,
  inherited: PaperColorContext | null,
  saturationScale?: number,
): PaperColorContext {
  if (paperHue !== undefined) {
    return { hue: normalizeHue(paperHue), depth: 0, saturationScale };
  }

  if (inherited) {
    // Children inherit the parent's saturation scale unless they set their own.
    return {
      hue: inherited.hue,
      depth: inherited.depth + 1,
      saturationScale: saturationScale ?? inherited.saturationScale,
    };
  }

  return { hue: DEFAULT_HUE, depth: 0, saturationScale };
}

/**
 * The colour context of a paper in the tree: the nearest hue up its parent chain, deepened once
 * per level below it, with the nearest saturation scale. Cycle-safe; a broken chain counts from
 * the last paper found.
 */
export function resolveColorContextOf(paperMap: PaperMap, nodeId: PaperId): PaperColorContext {
  const lineage: Paper[] = [];
  const seen = new Set<PaperId>();
  let id: PaperId | null = nodeId;
  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const paper = paperMap.get(id);
    if (!paper) break;
    lineage.push(paper);
    id = paper.parentId;
  }
  let color: PaperColorContext | null = null;
  for (let i = lineage.length - 1; i >= 0; i -= 1) {
    color = resolvePaperColorContext(lineage[i].hue, color, lineage[i].saturationScale);
  }
  return color ?? resolvePaperColorContext(undefined, null);
}

export function getPaperTone(
  color: PaperColorContext,
  options?: { isRoot?: boolean; isFocused?: boolean; scheme?: PaperColorScheme },
): PaperTone {
  const depth = clamp(color.depth, 0, 4);
  // sat scales the base saturation by the context's saturationScale (default 1),
  // so saturationScale: 0 collapses every tone to a neutral grey of the same
  // lightness — a white-ish paper surface independent of hue. The title bar
  // keeps its hue regardless, so a neutral paper still shows which branch it is.
  const scale = clamp(color.saturationScale ?? 1, 0, 1);
  const hsl = (sat: number, lightness: number) => `hsl(${color.hue}, ${sat}%, ${lightness}%)`;

  if (options?.scheme === 'dark') {
    const sat = (base: number) => base * scale * 0.7;
    const surface = clamp((options?.isRoot ? 13 : 15) + depth * 1.5, 12, 21);
    const header = clamp(surface + 4, 16, 26);
    return {
      accent: hsl(70 * scale, options?.isFocused ? 70 : 64),
      background: hsl(sat(22), surface),
      backgroundHover: hsl(sat(24), clamp(surface + 3, 14, 26)),
      border: hsl(sat(18), clamp(surface + 14, 26, 36)),
      divider: hsl(sat(16), clamp(surface + 9, 22, 32)),
      headerBackground: hsl(28, header),
      headerBackgroundFocused: hsl(40, clamp(header + 4, 20, 32)),
      mutedText: hsl(sat(12), 64),
      text: hsl(sat(14), clamp(84 - depth, 78, 86)),
      title: hsl(sat(40), 92),
    };
  }

  const sat = (base: number) => base * scale;
  const surfaceLightness = clamp((options?.isRoot ? 95 : 96) + depth * 1.2, 95, 99);
  const headerLightness = clamp(surfaceLightness - 1.8, 92, 98);
  const borderLightness = clamp(surfaceLightness - 7.5, 84, 95);
  const dividerLightness = clamp(surfaceLightness - 5, 88, 96);
  const titleLightness = clamp(16 + depth * 1.5, 16, 24);
  const textLightness = clamp(30 + depth * 1.5, 30, 40);
  const mutedLightness = clamp(48 + depth * 2, 48, 62);
  const accentLightness = options?.isFocused ? 56 : 50;

  return {
    accent: hsl(sat(62), accentLightness),
    background: hsl(sat(36), surfaceLightness),
    backgroundHover: hsl(sat(40), clamp(surfaceLightness - 1.2, 93, 98)),
    border: hsl(sat(26), borderLightness),
    divider: hsl(sat(24), dividerLightness),
    headerBackground: hsl(32, headerLightness),
    headerBackgroundFocused: hsl(55, clamp(headerLightness - 2, 88, 96)),
    mutedText: hsl(sat(18), mutedLightness),
    text: hsl(sat(24), textLightness),
    title: hsl(sat(72), titleLightness),
  };
}
