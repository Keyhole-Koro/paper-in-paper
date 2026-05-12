export interface PaperNodeConfig {
  headerHeight: number;
  borderWidth: number;
}

export interface ImportanceConfig {
  initial: number;
  openBonus: number;
  focusBonus: number;
  labelClickBoost: number;
  protectDurationMs: number;
  commandDecayRate: number;
  autoCloseThreshold: number;
}

export interface PaperCanvasConfig {
  paperNode: PaperNodeConfig;
  importance: ImportanceConfig;
  indexLabelThick: number;
}

export interface PaperCanvasConfigInput {
  paperNode?: Partial<PaperNodeConfig>;
  importance?: Partial<ImportanceConfig>;
}

export const defaultPaperCanvasConfig: PaperCanvasConfig = {
  paperNode: {
    headerHeight: 37,
    borderWidth: 2,
  },
  indexLabelThick: 28,
  importance: {
    initial: 100,
    openBonus: 30,
    focusBonus: 20,
    labelClickBoost: 50,
    protectDurationMs: 10_000,
    commandDecayRate: 0.05,
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
    indexLabelThick: defaultPaperCanvasConfig.indexLabelThick,
  };
}
