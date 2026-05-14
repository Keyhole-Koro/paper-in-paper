import type { Paper, PaperContent, PaperId, PaperMap } from './types';

/**
 * Input to PaperMapBuilder.upsert. A Paper without parentId/childIds —
 * those are resolved by build() based on `children` references.
 */
export interface PaperUpsertInput {
  id: PaperId;
  title: string;
  description?: string;
  content: PaperContent;
  hue?: number;
  attentionScore?: number;
  overrideCss?: string;
  /** Children as id strings or Paper-like objects (anything with `.id`). */
  children?: ReadonlyArray<PaperId | { id: PaperId }>;
}

/**
 * Map<PaperId, Paper> with an upsert API that handles parentId/childIds
 * resolution. Order-independent: call upsert in any order, then build().
 *
 * **Static initialization only.** This builder is designed for one-shot
 * construction of a fixed paper tree (e.g. landing page static content).
 * For dynamic trees driven by API data, build a `Map<PaperId, Paper>`
 * directly and manage updates via subtree patch operations.
 */
export class PaperMapBuilder extends Map<PaperId, Paper> {
  private childrenIndex = new Map<PaperId, PaperId[]>();

  upsert(input: PaperUpsertInput): this {
    const childIds = (input.children ?? []).map((c) => (typeof c === 'string' ? c : c.id));
    this.childrenIndex.set(input.id, childIds);

    const existing = this.get(input.id);
    this.set(input.id, {
      id: input.id,
      title: input.title,
      description: input.description ?? '',
      content: input.content,
      hue: input.hue,
      attentionScore: input.attentionScore,
      overrideCss: input.overrideCss,
      parentId: existing?.parentId ?? null,
      childIds,
    });

    return this;
  }

  /** Resolve parentId for every child based on declared `children`. */
  build(): this {
    for (const paper of this.values()) {
      paper.parentId = null;
    }
    for (const [parentId, childIds] of this.childrenIndex) {
      for (const childId of childIds) {
        const child = this.get(childId);
        if (child) child.parentId = parentId;
      }
    }
    return this;
  }
}

export type { PaperMap };
