import type { RoomLayout } from '../hooks/usePaperLayout';
import type { PaperNodeConfig } from '../../config/paperCanvasConfig';

export function shouldCollapseRoom(
  roomLayout: RoomLayout,
  roomWidth: number,
  roomHeight: number,
  config: PaperNodeConfig,
): boolean {
  const contentWidth = roomLayout.contentRect.width;
  const contentHeight = roomLayout.contentRect.height;

  if (
    contentWidth < config.collapseContentWidthThreshold ||
    contentHeight < config.collapseContentHeightThreshold
  ) {
    return true;
  }

  const roomArea = Math.max(0, roomWidth) * Math.max(0, roomHeight);
  if (roomArea === 0) return true;

  const contentArea = contentWidth * contentHeight;
  return contentArea / roomArea < config.collapseContentAreaRatioThreshold;
}
