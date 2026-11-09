import type { Paper, PaperId, PaperMap } from './types';

/**
 * Input to PaperMapBuilder.upsert: a Paper without parentId/childIds, which build() resolves
 * from the `children` references.
 */
export interface PaperUpsertInput extends Omit<Paper, 'parentId' | 'childIds' | 'description'> {
  description?: string;
  /** Children as id strings or Paper-like objects (anything with `.id`). */
  children?: ReadonlyArray<PaperId | { id: PaperId }>;
}

/**
 * Map<PaperId, Paper> with an upsert API that resolves parentId/childIds. Order-independent:
 * call upsert in any order, then build().
 *
 * **Static initialization only.** This builder is designed for one-shot construction of a fixed
 * paper tree (e.g. landing page static content). For dynamic trees driven by API data, build a
 * `Map<PaperId, Paper>` directly.
 */
export class PaperMapBuilder extends Map<PaperId, Paper> {
  private childrenIndex = new Map<PaperId, PaperId[]>();

  upsert(input: PaperUpsertInput): this {
    const { children, description, ...rest } = input;
    const childIds = (children ?? []).map((c) => (typeof c === 'string' ? c : c.id));
    this.childrenIndex.set(input.id, childIds);

    const existing = this.get(input.id);
    this.set(input.id, {
      ...rest,
      description: description ?? '',
      parentId: existing?.parentId ?? null,
      childIds,
    });

    return this;
  }

  /**
   * Resolves parentId for every child from the declared `children`. Papers are replaced, never
   * mutated, so maps handed out earlier keep their contents.
   */
  build(): this {
    const parentOf = new Map<PaperId, PaperId>();
    for (const [parentId, childIds] of this.childrenIndex) {
      for (const childId of childIds) {
        if (this.has(childId) && childId !== parentId) parentOf.set(childId, parentId);
      }
    }
    for (const [id, paper] of this) {
      const parentId = parentOf.get(id) ?? null;
      if (paper.parentId !== parentId) this.set(id, { ...paper, parentId });
    }
    return this;
  }
}

export type { PaperMap };
