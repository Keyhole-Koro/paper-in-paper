import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PaperId } from '../../core/types';
import { findInsertTarget, type InsertTarget } from '../internal/hitTest';

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
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const registerRoom = useCallback((parentId: PaperId, el: HTMLElement | null) => {
    if (el) {
      roomsRef.current.set(parentId, { el, parentId });
    } else {
      roomsRef.current.delete(parentId);
    }
  }, []);

  const endDrag = useCallback(() => {
    const s = sessionRef.current;
    if (s) {
      const target = findInsertTarget(roomsRef.current, pointerPos, s.draggedPaperId);
      if (target) onDropRef.current(s, target);
    }
    sessionRef.current = null;
    setSession(null);
    setInsertTarget(null);

    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [pointerPos]);

  function handlePointerMove(e: PointerEvent) {
    const pos = { x: e.clientX, y: e.clientY };
    setPointerPos(pos);
    const s = sessionRef.current;
    if (!s) return;
    const target = findInsertTarget(roomsRef.current, pos, s.draggedPaperId);
    setInsertTarget(target);
  }

  function handlePointerUp() {
    endDrag();
  }

  const startDrag = useCallback((newSession: DragSession, initial: { x: number; y: number }) => {
    sessionRef.current = newSession;
    setSession(newSession);
    setPointerPos(initial);
    setInsertTarget(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, []);

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
