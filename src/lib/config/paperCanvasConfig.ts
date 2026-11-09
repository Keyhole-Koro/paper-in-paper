export interface PaperNodeConfig {
  /** Height of a paper's title bar in px. */
  headerHeight: number;
  /** Horizontal + vertical border a paper frame takes from its rect, in px. */
  borderWidth: number;
}

/**
 * The attention model. Attention runs on a logical clock that advances by one on every user
 * interaction that touches a paper (open, focus, reveal, move, label click, create). Nothing
 * changes while the reader is idle, so the layout never shifts on its own.
 */
export interface AttentionConfig {
  /** Attention a paper starts with. */
  initial: number;
  /** Added to a paper when it is opened. */
  openBonus: number;
  /** Added to a paper when it is focused. */
  focusBonus: number;
  /** Added to a paper when its index label is clicked. */
  labelClickBoost: number;
  /** Interactions a just-opened (or just-restored) paper is left alone by space management. */
  protectInteractions: number;
  /** Interactions after which an untouched paper's attention halves. */
  decayHalfLife: number;
  /** Smallest factor attention applies to a paper's content demand. */
  multiplierMin: number;
  /** Largest factor attention applies to a paper's content demand. */
  multiplierMax: number;
  /** How fast the factor approaches multiplierMax as attention grows. */
  multiplierCurveK: number;
  /**
   * Indexed papers with nothing open inside whose attention decays to this value or below are
   * closed, so the index does not grow without bound. 0 turns this off.
   */
  autoCloseThreshold: number;
}

export interface LayoutConfig {
  /**
   * How much room a paper's own content claims next to its open children.
   * - `estimate`: proportional to how much content the paper has (text, images, tables)
   * - `uniform`: the same for every paper (the behaviour before 0.4)
   */
  contentDemand: 'estimate' | 'uniform';
  /** Narrowest an open paper should get, in px. Narrower papers make the room cramped. */
  minPaperWidth: number;
  /** Shortest an open paper should get, in px (header included). */
  minPaperHeight: number;
  /** Smallest height / width ratio an open paper should keep. */
  minAspectRatio: number;
  /** Largest height / width ratio an open paper should keep. */
  maxAspectRatio: number;
}

export interface ContentConfig {
  /** Base font size of HTML (iframe) content, in px. */
  fontSize: number;
}

export interface PaperCanvasConfig {
  paperNode: PaperNodeConfig;
  attention: AttentionConfig;
  layout: LayoutConfig;
  content: ContentConfig;
  indexLabelThick: number;
}

export interface PaperCanvasConfigInput {
  paperNode?: Partial<PaperNodeConfig>;
  attention?: Partial<AttentionConfig>;
  layout?: Partial<LayoutConfig>;
  content?: Partial<ContentConfig>;
}

export const defaultPaperCanvasConfig: PaperCanvasConfig = {
  paperNode: {
    headerHeight: 37,
    borderWidth: 2,
  },
  indexLabelThick: 28,
  attention: {
    initial: 100,
    openBonus: 30,
    focusBonus: 20,
    labelClickBoost: 50,
    protectInteractions: 3,
    decayHalfLife: 12,
    multiplierMin: 0.35,
    multiplierMax: 1.75,
    multiplierCurveK: 0.018,
    autoCloseThreshold: 5,
  },
  layout: {
    contentDemand: 'estimate',
    minPaperWidth: 160,
    minPaperHeight: 96,
    minAspectRatio: 0.2,
    maxAspectRatio: 3,
  },
  content: {
    fontSize: 14,
  },
};

export function resolvePaperCanvasConfig(
  config?: PaperCanvasConfigInput,
): PaperCanvasConfig {
  return {
    paperNode: {
      ...defaultPaperCanvasConfig.paperNode,
      ...config?.paperNode,
    },
    attention: {
      ...defaultPaperCanvasConfig.attention,
      ...config?.attention,
    },
    layout: {
      ...defaultPaperCanvasConfig.layout,
      ...config?.layout,
    },
    content: {
      ...defaultPaperCanvasConfig.content,
      ...config?.content,
    },
    indexLabelThick: defaultPaperCanvasConfig.indexLabelThick,
  };
}

/**
 * A string that changes only when the config input's values change. Lets callers keep one
 * resolved config while hosts pass a fresh `config={{ ... }}` object on every render.
 */
export function paperCanvasConfigKey(config?: PaperCanvasConfigInput): string {
  return config ? JSON.stringify(config) : '';
}
