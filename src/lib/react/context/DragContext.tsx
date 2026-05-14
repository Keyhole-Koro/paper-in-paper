import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PaperId } from '../../core/types';
import { buildRoomSnapshots, findInsertTargetFromSnapshots, type InsertTarget } from '../internal/hitTest';

export type DragMode = 'reorder' | 'move-parent' | 'attach-unplaced' | 'content-link';

export interface DragSession {
  draggedPaperId: PaperId;
  sourceParentId: PaperId | null;
  mode: DragMode;
  draggedTitle: string;
}

interface RoomEntry {
  el: HTMLElement;
  parentId: PaperId;
}

interface DragContextValue {
  session: DragSession | null;
  insertTarget: InsertTarget | null;
  pointerPos: { x: number; y: number };
  startDrag: (session: DragSession, initial: { x: number; y: number }) => void;
  endDrag: () => void;
  registerRoom: (parentId: PaperId, el: HTMLElement | null) => void;
  isDragging: boolean;
}

const DragContext = createContext<DragContextValue | null>(null);

export function DragProvider({
  children,
  onDrop,
}: {
  children: ReactNode;
  onDrop: (session: DragSession, target: InsertTarget) => void;
}) {
  const [session, setSession] = useState<DragSession | null>(null);
  const [insertTarget, setInsertTarget] = useState<InsertTarget | null>(null);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });

  const roomsRef = useRef<Map<PaperId, RoomEntry>>(new Map());
  const sessionRef = useRef<DragSession | null>(null);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const snapshotsRef = useRef<ReturnType<typeof buildRoomSnapshots>>([]);
  const rafIdRef = useRef<number | null>(null);
  const snapshotDirtyRef = useRef(false);

  const registerRoom = useCallback((parentId: PaperId, el: HTMLElement | null) => {
    if (el) {
      roomsRef.current.set(parentId, { el, parentId });
    } else {
      roomsRef.current.delete(parentId);
    }
    // If a drag is in progress, the rooms set just changed; refresh next frame.
    if (sessionRef.current) snapshotDirtyRef.current = true;
  }, []);

  const refreshSnapshots = useCallback(() => {
    snapshotsRef.current = buildRoomSnapshots(roomsRef.current);
    snapshotDirtyRef.current = false;
  }, []);

  const invalidateSnapshots = useCallback(() => {
    snapshotDirtyRef.current = true;
  }, []);

  const endDrag = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      if (snapshotDirtyRef.current) refreshSnapshots();
      const target = findInsertTargetFromSnapshots(snapshotsRef.current, pointerPosRef.current, s.draggedPaperId);
      if (target) onDropRef.current(s, target);
    }
    sessionRef.current = null;
    snapshotsRef.current = [];
    snapshotDirtyRef.current = false;
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setSession(null);
    setInsertTarget(null);
    document.body.style.userSelect = '';

    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('scroll', invalidateSnapshots, true);
    window.removeEventListener('resize', invalidateSnapshots);
  }, [refreshSnapshots, invalidateSnapshots]);

  function handlePointerMove(e: PointerEvent) {
    const pos = { x: e.clientX, y: e.clientY };
    pointerPosRef.current = pos;
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const s = sessionRef.current;
      if (!s) return;
      if (snapshotDirtyRef.current) refreshSnapshots();
      setPointerPos(pointerPosRef.current);
      setInsertTarget(
        findInsertTargetFromSnapshots(snapshotsRef.current, pointerPosRef.current, s.draggedPaperId),
      );
    });
  }

  function handlePointerUp() {
    endDrag();
  }

  const startDrag = useCallback((newSession: DragSession, initial: { x: number; y: number }) => {
    sessionRef.current = newSession;
    pointerPosRef.current = initial;
    refreshSnapshots();
    setSession(newSession);
    setPointerPos(initial);
    setInsertTarget(null);
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    // Capture-phase scroll catches inner scrollers; resize covers viewport changes.
    window.addEventListener('scroll', invalidateSnapshots, true);
    window.addEventListener('resize', invalidateSnapshots);
  }, [refreshSnapshots, invalidateSnapshots]);

  return (
    <DragContext value={{ session, insertTarget, pointerPos, startDrag, endDrag, registerRoom, isDragging: session !== null }}>
      {children}
    </DragContext>
  );
}

export function useDrag() {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDrag must be used inside DragProvider');
  return ctx;
}
