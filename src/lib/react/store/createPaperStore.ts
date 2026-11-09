import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import { reduce, type Command, type ReduceOptions } from '../../core/commands';
import { computeCanvasLayout, type CanvasLayout, type CanvasSize } from '../../core/layout';
import { settleSpace } from '../../core/spaceManagement';
import { findRootId } from '../../core/tree';
import type { PaperId, PaperViewState } from '../../core/types';
import { buildIndexLabels, stabilizeIndexLabels, type IndexLabelNode } from '../internal/indexLabels';

/** Everything the canvas renders from. A new object whenever any part of it changes. */
export interface PaperStoreSnapshot {
  state: PaperViewState;
  config: PaperCanvasConfig;
  /** The paper the canvas renders as its root, or null when there is none. */
  rootId: PaperId | null;
  layout: CanvasLayout;
  indexLabels: readonly IndexLabelNode[];
}

/**
 * The canvas store: the reducer state plus everything derived from it (layout, index labels).
 * Every change runs space management to a settled state before anyone is notified, so
 * subscribers never see an over-full room. Notifications are synchronous; React reads it
 * through useSyncExternalStore.
 */
export interface PaperStore {
  getSnapshot(): PaperStoreSnapshot;
  getState(): PaperViewState;
  dispatch(command: Command): void;
  /** Applies the commands in order and notifies once. */
  dispatchAll(commands: readonly Command[]): void;
  subscribe(listener: () => void): () => void;
  setConfig(config: PaperCanvasConfig): void;
  /** The paper to render as the root; undefined or null picks the first parentless paper. */
  setRootId(rootId: PaperId | null | undefined): void;
  setCanvasSize(size: CanvasSize): void;
}

export interface CreatePaperStoreOptions {
  state: PaperViewState;
  config: PaperCanvasConfig;
  rootId?: PaperId | null;
  reduceOptions?: ReduceOptions;
}

export function createPaperStore(options: CreatePaperStoreOptions): PaperStore {
  let config = options.config;
  let explicitRootId: PaperId | null = options.rootId ?? null;
  let size: CanvasSize = { width: 0, height: 0 };
  const listeners = new Set<() => void>();

  const resolveRootId = (state: PaperViewState): PaperId | null =>
    explicitRootId ?? findRootId(state.paperMap, state.unplacedNodeIds);
  const reducer = (state: PaperViewState, command: Command) => reduce(state, command, config, options.reduceOptions);

  const initialRootId = resolveRootId(options.state);
  const initialLayout = computeCanvasLayout(options.state, config, initialRootId, size);
  let snapshot: PaperStoreSnapshot = {
    state: options.state,
    config,
    rootId: initialRootId,
    layout: initialLayout,
    indexLabels: stabilizeIndexLabels(undefined, buildIndexLabels(initialLayout, options.state.paperMap)),
  };

  const emit = () => {
    for (const listener of Array.from(listeners)) listener();
  };

  const publish = (next: PaperViewState) => {
    const rootId = resolveRootId(next);
    const settled = settleSpace(next, config, rootId, size, reducer, snapshot.layout);
    const indexLabels = stabilizeIndexLabels(
      snapshot.indexLabels,
      buildIndexLabels(settled.layout, settled.state.paperMap),
    );
    snapshot = { state: settled.state, config, rootId, layout: settled.layout, indexLabels };
    emit();
  };

  return {
    getSnapshot: () => snapshot,
    getState: () => snapshot.state,
    dispatch(command) {
      const next = reducer(snapshot.state, command);
      if (next !== snapshot.state) publish(next);
    },
    dispatchAll(commands) {
      let next = snapshot.state;
      for (const command of commands) next = reducer(next, command);
      if (next !== snapshot.state) publish(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setConfig(nextConfig) {
      if (nextConfig === config) return;
      config = nextConfig;
      publish(snapshot.state);
    },
    setRootId(rootId) {
      const next = rootId ?? null;
      if (next === explicitRootId) return;
      explicitRootId = next;
      publish(snapshot.state);
    },
    setCanvasSize(nextSize) {
      const width = Math.max(0, Math.round(nextSize.width));
      const height = Math.max(0, Math.round(nextSize.height));
      if (width === size.width && height === size.height) return;
      size = { width, height };
      publish(snapshot.state);
    },
  };
}
