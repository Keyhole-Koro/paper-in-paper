import type { PaperId } from '../../core/types';

const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 16;

export interface PaperContentHtmlMapEntry {
  title: string;
  childIds: PaperId[];
}

export function calcContentFontSize(charCount: number): number {
  if (charCount === 0) return MIN_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, MIN_FONT_SIZE + 2 * Math.log10(charCount)));
}

export function appendRelatedLinks(
  content: string,
  nodeId: PaperId,
  paperMap: Map<PaperId, PaperContentHtmlMapEntry>,
): string {
  const paper = paperMap.get(nodeId);
  if (!paper) return content;

  const unmentioned = paper.childIds.filter((id) => !content.includes(`data-paper-id="${id}"`));
  if (unmentioned.length === 0) return content;

  const links = unmentioned.map((id) => {
    const childPaper = paperMap.get(id);
    const title = childPaper ? childPaper.title : id;
    return `<a data-paper-id="${id}">${title}</a>`;
  });

  return `${content}<hr/><div style="margin-top: 16px;"><p class="eyebrow">Related</p><p style="display: flex; flex-wrap: wrap; gap: 8px;">${links.join('')}</p></div>`;
}

export function deriveHtmlPresentation(
  content: string,
  nodeId: PaperId,
  paperMap: Map<PaperId, PaperContentHtmlMapEntry>,
) {
  const finalContent = appendRelatedLinks(content, nodeId, paperMap);
  const plainText = finalContent.replace(/<[^>]+>/g, '');
  const fontSize = calcContentFontSize(plainText.length);
  return { finalContent, fontSize };
}
