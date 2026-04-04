export interface LayoutItem {
  id: string;
  weight: number;
}

export interface LayoutRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomLayoutResult {
  rects: LayoutRect[];
}

/**
 * 行に items を並べたときの worst-case アスペクト比を返す。
 * AR = max(w/h, h/w) なので、1 に近いほど正方形に近い。
 */
function worstAspectRatio(
  rowItems: LayoutItem[],
  rowWeight: number,
  totalWeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  // この行が占める高さ = (rowWeight / totalWeight) * containerHeight
  const rowHeight = (rowWeight / totalWeight) * containerHeight;
  if (rowHeight <= 0) return Infinity;

  let worst = 0;
  for (const item of rowItems) {
    const w = (item.weight / rowWeight) * containerWidth;
    const h = rowHeight;
    const ar = Math.max(w / h, h / w);
    if (ar > worst) worst = ar;
  }
  return worst;
}

/**
 * 与えられた containerWidth × containerHeight の空間を
 * importance の比率に従って水平に行詰めで分割する。
 *
 * - 各アイテムの面積 ∝ weight
 * - アスペクト比が悪化するなら行を折り返す（squarified treemap 的貪欲法）
 * - コンテナサイズが決まっているので item 追加で全体が縮むことはない
 */
export function computeRoomLayout(
  items: LayoutItem[],
  containerWidth: number,
  containerHeight: number,
  minAR: number,
  maxAR: number,
): RoomLayoutResult {
  if (items.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { rects: [] };
  }

  // 横長コンテナは転置して「縦に列詰め→右に積む」に切り替え、最後に戻す
  const useColumns = containerWidth > containerHeight;
  const w = useColumns ? containerHeight : containerWidth;
  const h = useColumns ? containerWidth : containerHeight;

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);

  // 貪欲行詰め: worst AR が改善する間は同じ行に追加
  const rows: LayoutItem[][] = [];
  let currentRow: LayoutItem[] = [];
  let currentRowWeight = 0;

  for (const item of items) {
    if (currentRow.length === 0) {
      currentRow.push(item);
      currentRowWeight += item.weight;
      continue;
    }

    const prevWorst = worstAspectRatio(currentRow, currentRowWeight, totalWeight, w, h);
    const nextRow = [...currentRow, item];
    const nextWeight = currentRowWeight + item.weight;
    const nextWorst = worstAspectRatio(nextRow, nextWeight, totalWeight, w, h);

    if (nextWorst <= prevWorst) {
      // AR が改善 or 維持 → 同じ行に追加
      currentRow.push(item);
      currentRowWeight += item.weight;
    } else {
      // AR が悪化 → 行を確定して次の行へ
      rows.push(currentRow);
      currentRow = [item];
      currentRowWeight = item.weight;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  // 各行の rect を計算
  const rects: LayoutRect[] = [];
  let y = 0;

  for (const row of rows) {
    const rowWeight = row.reduce((s, i) => s + i.weight, 0);
    const rowHeight = (rowWeight / totalWeight) * h;

    let x = 0;
    for (const item of row) {
      const width = (item.weight / rowWeight) * w;
      const height = rowHeight;

      // AR 制約に引っかかる場合はクランプ（レイアウトが歪むより見切れる方がまし）
      const ar = Math.max(width, 1) > 0 ? height / width : 1;
      const clampedHeight = ar < minAR
        ? width * minAR
        : ar > maxAR
          ? width * maxAR
          : height;

      rects.push({ id: item.id, x, y, width, height: clampedHeight });
      x += width;
    }
    y += rowHeight;
  }

  // 転置した場合は x↔y, width↔height を戻す
  if (useColumns) {
    return {
      rects: rects.map(r => ({ id: r.id, x: r.y, y: r.x, width: r.height, height: r.width })),
    };
  }
  return { rects };
}
