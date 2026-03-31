import type { Paper, PaperId, PaperMap } from './types';

export function buildPaperMap(papers: Paper[]): PaperMap {
  return new Map(papers.map((paper) => [paper.id, paper]));
}

export function findRootId(paperMap: PaperMap): PaperId | null {
  return [...paperMap.values()].find((paper) => paper.parentId === null)?.id ?? null;
}
