import type { PaperId } from '../../core/types';
import type { InsertTarget } from './internalTypes';

interface Point {
  x: number;
  y: number;
}

interface InsertIndicatorRect {
  kind: 'gap' | 'surface';
  left: number;
  top: number;
  width?: number;
  height: number;
}

const INSERT_SNAP_DISTANCE = 80;

function distanceToRect(point: Point, rect: DOMRect): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

function distanceToVerticalGap(point: Point, x: number, rect: DOMRect): number {
  const dx = Math.abs(point.x - x);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

export function findInsertTargetAtPoint(point: Point): InsertTarget | null {
  const containers = document.querySelectorAll<HTMLElement>('[data-open-children-parent-id]');
  const emptySurfaces = document.querySelectorAll<HTMLElement>('[data-empty-insert-parent-id]');
  let bestTarget: InsertTarget | null = null;
  let bestDistance = INSERT_SNAP_DISTANCE;

  for (const container of containers) {
    const parentId = container.dataset.openChildrenParentId;
    if (!parentId) continue;

    const children = Array.from(container.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.dockedPaperId);

    if (!children.length) continue;

    const containerRect = container.getBoundingClientRect();
    const firstChild = children[0];
    const lastChild = children[children.length - 1];
    const headDistance = distanceToVerticalGap(point, firstChild.getBoundingClientRect().left, containerRect);
    if (headDistance < bestDistance) {
      bestDistance = headDistance;
      bestTarget = { kind: 'gap', parentId, insertBeforeId: firstChild.dataset.dockedPaperId ?? null };
    }

    for (let idx = 0; idx < children.length - 1; idx += 1) {
      const currentRect = children[idx].getBoundingClientRect();
      const next = children[idx + 1];
      const nextRect = next.getBoundingClientRect();
      const gapX = (currentRect.right + nextRect.left) / 2;
      const distance = distanceToVerticalGap(point, gapX, containerRect);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTarget = { kind: 'gap', parentId, insertBeforeId: next.dataset.dockedPaperId ?? null };
      }
    }

    const tailDistance = distanceToVerticalGap(point, lastChild.getBoundingClientRect().right, containerRect);
    if (tailDistance < bestDistance) {
      bestDistance = tailDistance;
      bestTarget = { kind: 'gap', parentId, insertBeforeId: null };
    }
  }

  for (const surface of emptySurfaces) {
    const parentId = surface.dataset.emptyInsertParentId;
    if (!parentId) continue;

    const rect = surface.getBoundingClientRect();
    const distance = distanceToRect(point, rect);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTarget = { kind: 'surface', parentId, insertBeforeId: null };
    }
  }

  return bestTarget;
}

export function findInsertIndicatorRect(target: InsertTarget): InsertIndicatorRect | null {
  if (target.kind === 'surface') {
    const surface = document.querySelector<HTMLElement>(`[data-empty-insert-parent-id="${target.parentId}"]`);
    if (!surface) {
      return null;
    }

    const rect = surface.getBoundingClientRect();
    return {
      kind: 'surface',
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  const container = document.querySelector<HTMLElement>(`[data-open-children-parent-id="${target.parentId}"]`);
  if (!container) {
    return null;
  }

  const children = Array.from(container.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset.dockedPaperId);

  if (!children.length) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  let x = children[children.length - 1].getBoundingClientRect().right;

  if (target.insertBeforeId !== null) {
    const beforeChild = children.find((child) => child.dataset.dockedPaperId === target.insertBeforeId);
    if (!beforeChild) {
      return null;
    }
    x = beforeChild.getBoundingClientRect().left;
  }

  return {
    kind: 'gap',
    left: x,
    top: containerRect.top,
    height: containerRect.height,
  };
}
