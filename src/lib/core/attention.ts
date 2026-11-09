import type { Paper, PaperId, PaperViewState } from './types';
import type { PaperCanvasConfig } from '../config/paperCanvasConfig';

export function resolveInitialAttention(paper: Paper, config: PaperCanvasConfig): number {
  return paper.attentionScore ?? config.attention.initial;
}

/** `value` after `elapsed` clock ticks of exponential decay with the given half-life. */
export function decayAttentionValue(
  value: number,
  elapsed: number,
  halfLife: number,
): number {
  if (elapsed <= 0 || halfLife <= 0) return Math.max(0, value);
  return Math.max(0, value * Math.pow(0.5, elapsed / halfLife));
}

/**
 * A paper's attention at the state's current clock. Depends only on the state, so layout is a
 * pure function of it.
 */
export function getEffectiveAttention(
  state: Pick<PaperViewState, 'attentionMap' | 'attentionTimestampMap' | 'clock'>,
  nodeId: PaperId,
  config: PaperCanvasConfig,
): number {
  const base = state.attentionMap.get(nodeId) ?? config.attention.initial;
  const updatedAt = state.attentionTimestampMap.get(nodeId) ?? state.clock;
  return decayAttentionValue(base, state.clock - updatedAt, config.attention.decayHalfLife);
}

export function getAttentionMultiplier(
  attention: number,
  config: PaperCanvasConfig,
): number {
  const { multiplierMin, multiplierMax, multiplierCurveK } = config.attention;
  const clampedAttention = Math.max(0, attention);
  const normalized = 1 - Math.exp(-multiplierCurveK * clampedAttention);
  const value = multiplierMin + (multiplierMax - multiplierMin) * normalized;
  return Math.min(multiplierMax, Math.max(multiplierMin, value));
}

/** Whether space management must leave the paper alone at the state's current clock. */
export function isProtected(state: Pick<PaperViewState, 'protectedUntilMap' | 'clock'>, nodeId: PaperId): boolean {
  return (state.protectedUntilMap.get(nodeId) ?? -Infinity) > state.clock;
}
