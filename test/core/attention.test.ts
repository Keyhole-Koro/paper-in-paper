import { describe, expect, it } from 'vitest';
import {
  decayAttentionValue,
  getAttentionMultiplier,
  getEffectiveAttention,
  isProtected,
} from '../../src/lib/core/attention';
import { config, focus, open, run, stateOf, tree } from '../helpers/papers';

describe('decay on the interaction clock', () => {
  it('halves attention every decayHalfLife interactions', () => {
    expect(decayAttentionValue(100, config.attention.decayHalfLife, config.attention.decayHalfLife)).toBeCloseTo(50);
    expect(decayAttentionValue(100, 0, 10)).toBe(100);
    expect(decayAttentionValue(-5, 3, 10)).toBe(0);
    expect(decayAttentionValue(100, 3, 0)).toBe(100);
  });

  it('does not change while nothing happens: attention depends on the state only', () => {
    const state = run(stateOf(tree({ root: ['a', 'b'] })), [open('root', 'a')]);
    const first = getEffectiveAttention(state, 'a', config);
    expect(getEffectiveAttention(state, 'a', config)).toBe(first);
  });

  it('decays untouched papers by one step per interaction elsewhere', () => {
    let state = run(stateOf(tree({ root: ['a', 'b'] })), [open('root', 'a')]);
    const before = getEffectiveAttention(state, 'a', config);
    state = run(state, [focus('b')]);
    expect(getEffectiveAttention(state, 'a', config)).toBeCloseTo(before * Math.pow(0.5, 1 / config.attention.decayHalfLife));
  });

  it('applies the decay before adding a bonus', () => {
    let state = run(stateOf(tree({ root: ['a', 'b'] })), [open('root', 'a')]);
    for (let i = 0; i < 5; i += 1) state = run(state, [focus('b')]);
    const decayed = getEffectiveAttention({ ...state, clock: state.clock + 1 }, 'a', config);
    state = run(state, [focus('a')]);
    expect(state.attentionMap.get('a')).toBeCloseTo(decayed + config.attention.focusBonus);
  });
});

describe('getAttentionMultiplier', () => {
  it('stays within [multiplierMin, multiplierMax] and grows with attention', () => {
    expect(getAttentionMultiplier(0, config)).toBe(config.attention.multiplierMin);
    expect(getAttentionMultiplier(100_000, config)).toBe(config.attention.multiplierMax);
    expect(getAttentionMultiplier(-50, config)).toBe(config.attention.multiplierMin);
    expect(getAttentionMultiplier(50, config)).toBeLessThan(getAttentionMultiplier(100, config));
  });
});

describe('isProtected', () => {
  it('lasts protectInteractions interactions after an open', () => {
    let state = run(stateOf(tree({ root: ['a', 'b'] })), [open('root', 'a')]);
    for (let i = 0; i < config.attention.protectInteractions - 1; i += 1) {
      expect(isProtected(state, 'a')).toBe(true);
      state = run(state, [focus('b')]);
    }
    expect(isProtected(state, 'a')).toBe(true);
    state = run(state, [focus('b')]);
    expect(isProtected(state, 'a')).toBe(false);
  });
});
