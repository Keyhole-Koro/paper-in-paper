const DEFAULT_HUE = 220;

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
  return ((Math.round(hue) % 360) + 360) % 360;
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

  // sat scales the base saturation by the context's saturationScale (default 1),
  // so saturationScale: 0 collapses every tone to a neutral grey of the same
  // lightness — a white-ish paper surface independent of hue.
  const scale = clamp(color.saturationScale ?? 1, 0, 1);
  const sat = (base: number) => base * scale;
  // satHeader keeps the title bar (headerBackground) at its full hue regardless
  // of saturationScale: even when the body is neutralized to white, the header
  // stays the paper's original tinted surface. At scale 1 this is unchanged.
  const satHeader = (base: number) => base;

  return {
    accent: `hsl(${color.hue}, ${sat(62)}%, ${accentLightness}%)`,
    background: `hsl(${color.hue}, ${sat(36)}%, ${surfaceLightness}%)`,
    backgroundHover: `hsl(${color.hue}, ${sat(40)}%, ${clamp(surfaceLightness - 1.2, 93, 98)}%)`,
    border: `hsl(${color.hue}, ${sat(26)}%, ${borderLightness}%)`,
    divider: `hsl(${color.hue}, ${sat(24)}%, ${dividerLightness}%)`,
    headerBackground: `hsl(${color.hue}, ${satHeader(32)}%, ${headerLightness}%)`,
    headerBackgroundFocused: `hsl(${color.hue}, ${satHeader(55)}%, ${clamp(headerLightness - 2, 88, 96)}%)`,
    mutedText: `hsl(${color.hue}, ${sat(18)}%, ${mutedLightness}%)`,
    text: `hsl(${color.hue}, ${sat(24)}%, ${textLightness}%)`,
    title: `hsl(${color.hue}, ${sat(72)}%, ${titleLightness}%)`,
  };
}
