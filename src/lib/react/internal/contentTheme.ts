import type { PaperTone } from './paperColors';

export interface PaperContentTheme {
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  text: string;
  mutedText: string;
  divider: string;
  linkBackground: string;
  linkBackgroundHover: string;
  linkBorder: string;
  linkText: string;
}

/** The content colours a paper tone implies. */
export function themeFromTone(tone: PaperTone): PaperContentTheme {
  return {
    surface: tone.background,
    surfaceAlt: tone.backgroundHover,
    surfaceRaised: tone.headerBackground,
    text: tone.text,
    mutedText: tone.mutedText,
    divider: tone.divider,
    linkBackground: tone.headerBackground,
    linkBackgroundHover: tone.backgroundHover,
    linkBorder: tone.border,
    linkText: tone.title,
  };
}
