import type { Paper, PaperId, PaperViewState } from './types';
import type { PaperCanvasConfig } from '../config/paperCanvasConfig';

export interface AttentionSnapshot {
  value: number;
  computedAt: number;
}

export function resolveInitialAttention(paper: Paper, config: PaperCanvasConfig): number {
  return paper.attentionScore ?? config.attention.initial;
}

export function decayAttentionValue(
  value: number,
  elapsedMs: number,
  halfLifeMs: number,
): number {
  if (elapsedMs <= 0 || halfLifeMs <= 0) return Math.max(0, value);
  return Math.max(0, value * Math.pow(0.5, elapsedMs / halfLifeMs));
}

export function getEffectiveAttention(
  state: Pick<PaperViewState, 'attentionMap' | 'attentionTimestampMap'>,
  nodeId: PaperId,
  config: PaperCanvasConfig,
  nowMs: number,
): number {
  const base = state.attentionMap.get(nodeId) ?? config.attention.initial;
  const updatedAt = state.attentionTimestampMap.get(nodeId) ?? nowMs;
  return decayAttentionValue(base, nowMs - updatedAt, config.attention.decayHalfLifeMs);
}

export function getAttentionSnapshot(
  state: Pick<PaperViewState, 'attentionMap' | 'attentionTimestampMap'>,
  nodeId: PaperId,
  config: PaperCanvasConfig,
  nowMs: number,
): AttentionSnapshot {
  return {
    value: getEffectiveAttention(state, nodeId, config, nowMs),
    computedAt: nowMs,
  };
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
