const DEFAULT_HUE = 220;

export interface PaperColorContext {
  hue: number;
  depth: number;
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
  return ((Math.round(hue) % 360) + 360) % 360;
}

export function resolvePaperColorContext(
  paperHue: number | undefined,
  inherited: PaperColorContext | null,
): PaperColorContext {
  if (paperHue !== undefined) {
    return { hue: normalizeHue(paperHue), depth: 0 };
  }

  if (inherited) {
    return { hue: inherited.hue, depth: inherited.depth + 1 };
  }

  return { hue: DEFAULT_HUE, depth: 0 };
}

export function getPaperTone(
  color: PaperColorContext,
  options?: { isRoot?: boolean; isFocused?: boolean },
): PaperTone {
  const depth = clamp(color.depth, 0, 4);
  const surfaceLightness = clamp((options?.isRoot ? 95 : 96) + depth * 1.2, 95, 99);
  const headerLightness = clamp(surfaceLightness - 1.8, 92, 98);
  const borderLightness = clamp(surfaceLightness - 7.5, 84, 95);
  const dividerLightness = clamp(surfaceLightness - 5, 88, 96);
  const titleLightness = clamp(16 + depth * 1.5, 16, 24);
  const textLightness = clamp(30 + depth * 1.5, 30, 40);
  const mutedLightness = clamp(48 + depth * 2, 48, 62);
  const accentLightness = options?.isFocused ? 56 : 50;

  return {
    accent: `hsl(${color.hue}, 62%, ${accentLightness}%)`,
    background: `hsl(${color.hue}, 36%, ${surfaceLightness}%)`,
    backgroundHover: `hsl(${color.hue}, 40%, ${clamp(surfaceLightness - 1.2, 93, 98)}%)`,
    border: `hsl(${color.hue}, 26%, ${borderLightness}%)`,
    divider: `hsl(${color.hue}, 24%, ${dividerLightness}%)`,
    headerBackground: `hsl(${color.hue}, 32%, ${headerLightness}%)`,
    headerBackgroundFocused: `hsl(${color.hue}, 55%, ${clamp(headerLightness - 2, 88, 96)}%)`,
    mutedText: `hsl(${color.hue}, 18%, ${mutedLightness}%)`,
    text: `hsl(${color.hue}, 24%, ${textLightness}%)`,
    title: `hsl(${color.hue}, 72%, ${titleLightness}%)`,
  };
}
