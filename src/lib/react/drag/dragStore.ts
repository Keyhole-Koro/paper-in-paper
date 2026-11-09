import { getDescendantIds } from '../../core/tree';
import type { PaperId, PaperMap } from '../../core/types';
import {
  buildRoomSnapshots,
  findInsertTargetFromSnapshots,
  sameInsertTarget,
  type InsertTarget,
  type RoomSnapshot,
} from '../internal/hitTest';

/** `move`: a paper dragged by its title bar. `content-link`: a child dragged out of a content link. */
export type DragMode = 'move' | 'content-link';

export interface DragSession {
  draggedPaperId: PaperId;
  sourceParentId: PaperId | null;
  mode: DragMode;
  draggedTitle: string;
}

export interface DragSnapshot {
  session: DragSession | null;
  insertTarget: InsertTarget | null;
  pointer: { x: number; y: number };
}

export interface DragHandlers {
  getPaperMap: () => PaperMap;
  /** Final say on a target; a refused target shows no indicator and drops nothing. */
  isAllowed: (session: DragSession, target: InsertTarget) => boolean;
  onDrop: (session: DragSession, target: InsertTarget) => void;
}

export interface DragStore {
  getSnapshot(): DragSnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * Starts a drag at `pointer` (viewport coordinates). `origin` identifies who started it, so
   * that only they can end it with `cancel(origin)`.
   */
  startDrag(session: DragSession, pointer: { x: number; y: number }, origin?: unknown): void;
  /**
   * Moves the pointer of the current drag. The store follows window pointer events by itself;
   * this is for gestures the window does not see (one that started inside a content frame).
   * With `origin`, only a drag that origin started moves.
   */
  moveTo(pointer: { x: number; y: number }, origin?: unknown): void;
  /** Drops at `pointer`, like a pointerup there; with `origin`, only a drag that origin started. */
  release(pointer: { x: number; y: number }, origin?: unknown): void;
  /** Ends the drag without dropping; with `origin`, only a drag that origin started. */
  cancel(origin?: unknown): void;
  registerRoom(parentId: PaperId, el: HTMLElement | null): void;
  /** Connects the store to the canvas: where papers come from, what may drop, what a drop does. */
  setHandlers(handlers: DragHandlers): void;
  /** Cancels any drag and removes window listeners; the store stays usable. */
  dispose(): void;
}

const NO_HANDLERS: DragHandlers = {
  getPaperMap: () => new Map(),
  isAllowed: () => false,
  onDrop: () => {},
};

const IDLE: DragSnapshot = { session: null, insertTarget: null, pointer: { x: 0, y: 0 } };

/**
 * Pointer-driven drag and drop, kept outside React state: pointer moves only re-render the
 * floating ghost, and target changes only the rooms involved.
 */
export function createDragStore(): DragStore {
  let options: DragHandlers = NO_HANDLERS;
  const rooms = new Map<PaperId, HTMLElement>();
  const listeners = new Set<() => void>();
  let snapshot: DragSnapshot = IDLE;
  let excluded: ReadonlySet<PaperId> = new Set();
  let roomSnapshots: RoomSnapshot[] = [];
  let snapshotsDirty = false;
  let pendingPointer: { x: number; y: number } | null = null;
  let frame: number | null = null;
  let previousUserSelect = '';
  let currentOrigin: unknown = undefined;

  const emit = () => {
    for (const listener of Array.from(listeners)) listener();
  };
  const set = (next: DragSnapshot) => {
    snapshot = next;
    emit();
  };

  const refreshSnapshots = () => {
    roomSnapshots = buildRoomSnapshots(rooms, excluded);
    snapshotsDirty = false;
  };

  const targetAt = (pointer: { x: number; y: number }): InsertTarget | null => {
    const session = snapshot.session;
    if (!session) return null;
    if (snapshotsDirty) refreshSnapshots();
    const target = findInsertTargetFromSnapshots(roomSnapshots, pointer, session.draggedPaperId);
    return target && options.isAllowed(session, target) ? target : null;
  };

  const flushPointer = () => {
    frame = null;
    if (!pendingPointer || !snapshot.session) return;
    const pointer = pendingPointer;
    pendingPointer = null;
    const target = targetAt(pointer);
    set({
      session: snapshot.session,
      pointer,
      insertTarget: sameInsertTarget(target, snapshot.insertTarget) ? snapshot.insertTarget : target,
    });
  };

  const startedBy = (origin: unknown) => origin === undefined || origin === currentOrigin;
  const moveTo = (pointer: { x: number; y: number }, origin?: unknown) => {
    if (!snapshot.session || !startedBy(origin)) return;
    pendingPointer = pointer;
    if (frame === null) frame = requestAnimationFrame(flushPointer);
  };
  const release = (pointer: { x: number; y: number }, origin?: unknown) => {
    const session = snapshot.session;
    if (!session || !startedBy(origin)) return;
    const target = targetAt(pointer);
    end();
    if (target) options.onDrop(session, target);
  };
  const onPointerMove = (event: PointerEvent) => moveTo({ x: event.clientX, y: event.clientY });
  const onPointerUp = (event: PointerEvent) => release({ x: event.clientX, y: event.clientY });
  // A press while a drag runs means its release went somewhere the store could not see (a
  // frame that went away, another window): the drag is over.
  const onPointerDown = () => end();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      end();
    }
  };
  const onCancel = () => end();
  const invalidate = () => {
    snapshotsDirty = true;
  };

  const detach = () => {
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onCancel);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', invalidate, true);
    window.removeEventListener('resize', invalidate);
  };

  function end() {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    pendingPointer = null;
    detach();
    if (snapshot.session) document.body.style.userSelect = previousUserSelect;
    roomSnapshots = [];
    excluded = new Set();
    currentOrigin = undefined;
    if (snapshot !== IDLE) set(IDLE);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startDrag(session, pointer, origin) {
      end();
      currentOrigin = origin;
      excluded = new Set([session.draggedPaperId, ...getDescendantIds(options.getPaperMap(), session.draggedPaperId)]);
      previousUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('blur', onCancel);
      window.addEventListener('keydown', onKeyDown, true);
      // Capture-phase scroll catches inner scrollers; resize covers viewport changes.
      window.addEventListener('scroll', invalidate, true);
      window.addEventListener('resize', invalidate);
      snapshot = { session, pointer, insertTarget: null };
      refreshSnapshots();
      set({ session, pointer, insertTarget: targetAt(pointer) });
    },
    moveTo,
    release,
    cancel(origin) {
      if (startedBy(origin)) end();
    },
    registerRoom(parentId, el) {
      if (el) rooms.set(parentId, el);
      else rooms.delete(parentId);
      if (snapshot.session) snapshotsDirty = true;
    },
    setHandlers(handlers) {
      options = handlers;
    },
    dispose: end,
  };
}
