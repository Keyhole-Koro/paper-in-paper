import type { PaperId } from '../../core/types';

interface Point {
  x: number;
  y: number;
}

export function findReturnParentIdAtPoint(
  point: Point,
  expectedParentId: PaperId | null,
): PaperId | null {
  if (expectedParentId === null) {
    return null;
  }

  const targets = document.querySelectorAll<HTMLElement>(`[data-return-parent-id="${expectedParentId}"]`);

  for (const target of targets) {
    const rect = target.getBoundingClientRect();
    if (
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    ) {
      return expectedParentId;
    }
  }

  return null;
}
