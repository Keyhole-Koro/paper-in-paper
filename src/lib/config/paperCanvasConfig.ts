export interface PaperNodeConfig {
  headerHeight: number;
  borderWidth: number;
  collapseContentWidthThreshold: number;
  collapseContentHeightThreshold: number;
  collapseContentAreaRatioThreshold: number;
}

export interface ImportanceConfig {
  initial: number;
  openBonus: number;
  focusBonus: number;
  labelClickBoost: number;
  protectDurationMs: number;
  decayRate: number;
  tickIntervalMs: number;
  autoCloseThreshold: number;
}

export interface PaperCanvasConfig {
  paperNode: PaperNodeConfig;
  importance: ImportanceConfig;
}

export interface PaperCanvasConfigInput {
  paperNode?: Partial<PaperNodeConfig>;
  importance?: Partial<ImportanceConfig>;
}

export const defaultPaperCanvasConfig: PaperCanvasConfig = {
  paperNode: {
    headerHeight: 37,
    borderWidth: 2,
    collapseContentWidthThreshold: 160,
    collapseContentHeightThreshold: 100,
    collapseContentAreaRatioThreshold: 0.12,
  },
  importance: {
    initial: 100,
    openBonus: 30,
    focusBonus: 20,
    labelClickBoost: 50,
    protectDurationMs: 10_000,
    decayRate: 0.00001,
    tickIntervalMs: 5000,
    autoCloseThreshold: 5,
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
    importance: {
      ...defaultPaperCanvasConfig.importance,
      ...config?.importance,
    },
  };
}
