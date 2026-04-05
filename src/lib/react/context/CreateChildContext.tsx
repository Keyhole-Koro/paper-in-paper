import { createContext, useContext } from 'react';
import type { PaperContent, PaperId } from '../../core/types';

export interface NewPaperNode {
  title: string;
  content: PaperContent;
  description?: string;
  hue?: number;
}

export type OnCreateChild = (parentId: PaperId, create: (node: NewPaperNode) => void) => void;

export const CreateChildContext = createContext<OnCreateChild | null>(null);

export function useCreateChild(): OnCreateChild | null {
  return useContext(CreateChildContext);
}
