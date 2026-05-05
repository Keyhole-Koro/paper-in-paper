export interface PaperNodeConfig {
  headerHeight: number;
  borderWidth: number;
}

export interface AttentionConfig {
  initial: number;
  openBonus: number;
  focusBonus: number;
  labelClickBoost: number;
  protectDurationMs: number;
  decayHalfLifeMs: number;
  multiplierMin: number;
  multiplierMax: number;
  multiplierCurveK: number;
  autoCloseThreshold: number;
}

export interface PaperCanvasConfig {
  paperNode: PaperNodeConfig;
  attention: AttentionConfig;
}

export interface PaperCanvasConfigInput {
  paperNode?: Partial<PaperNodeConfig>;
  attention?: Partial<AttentionConfig>;
}

export const defaultPaperCanvasConfig: PaperCanvasConfig = {
  paperNode: {
    headerHeight: 37,
    borderWidth: 2,
  },
  attention: {
    initial: 100,
    openBonus: 30,
    focusBonus: 20,
    labelClickBoost: 50,
    protectDurationMs: 10_000,
    decayHalfLifeMs: 120_000,
    multiplierMin: 0.35,
    multiplierMax: 1.75,
    multiplierCurveK: 0.018,
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
    attention: {
      ...defaultPaperCanvasConfig.attention,
      ...config?.attention,
    },
  };
}
