import type { Paper, PaperId, PaperMap } from './types';

export function buildPaperMap(papers: Paper[]): PaperMap {
  return new Map(papers.map((paper) => [paper.id, paper]));
}

export function findRootId(paperMap: PaperMap): PaperId | null {
  for (const paper of paperMap.values()) {
    if (paper.parentId === null) return paper.id;
  }
  return null;
}
