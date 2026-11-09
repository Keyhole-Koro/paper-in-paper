import { createContext, useContext } from 'react';
import type { PaperContent, PaperId } from '../../core/types';
import type { PaperColorScheme } from '../internal/paperColors';

export interface NewPaperNode {
  title: string;
  content: PaperContent;
  description?: string;
  hue?: number;
  /** Id for the new paper; a random one is generated when omitted. */
  id?: PaperId;
}

export type OnCreateChild = (parentId: PaperId, create: (node: NewPaperNode) => void) => void;

/**
 * Turns a content image's `data-file-id` marker into a displayable URL. paper-in-paper stays
 * agnostic about how: the host (e.g. an authenticated signed-URL RPC) supplies it. `nodeId` is
 * the paper whose content asked, so hosts can scope what a paper may load. A rejected promise
 * leaves the image blank rather than breaking the content.
 */
export type LoadImageUrl = (fileId: string, context: { nodeId: PaperId }) => Promise<string>;

/** A drop the reader is about to make; `canDrop` decides whether it is allowed. */
export interface PaperMoveRequest {
  nodeId: PaperId;
  sourceParentId: PaperId | null;
  targetParentId: PaperId;
  insertBeforeId: PaperId | null;
}

/** User-facing strings. Pass your own to translate the canvas. */
export interface PaperCanvasLabels {
  closePaper: string;
  pinPaper: string;
  unpinPaper: string;
  addChild: string;
  /** Heading above the links the canvas appends for children the HTML content does not mention. */
  relatedLinks: string;
  /** Tooltip of a parent crumb, which closes the papers open inside that parent. */
  collapseTo: (parentTitle: string) => string;
  /** Description of a paper's title button for assistive technology. */
  paperTitleHint: string;
  /** Shown in place of HTML content that navigated its frame away from the paper. */
  contentBlocked: string;
}

export const defaultPaperCanvasLabels: PaperCanvasLabels = {
  closePaper: 'Close paper',
  pinPaper: 'Pin paper',
  unpinPaper: 'Unpin paper',
  addChild: 'Add a child paper',
  relatedLinks: 'Related',
  collapseTo: (parentTitle) => `Back to ${parentTitle}`,
  paperTitleHint: 'Alt + arrow keys move this paper among its siblings',
  contentBlocked: 'This content tried to open another page, so it was stopped.',
};

/** Callbacks the canvas reads at call time, so passing new functions never re-renders papers. */
export interface CanvasCallbacks {
  onCreateChild?: OnCreateChild;
  loadImageUrl?: LoadImageUrl;
  canDrop?: (move: PaperMoveRequest) => boolean;
  onOpenExternalLink?: (href: string) => void;
}

export interface CanvasOptions {
  debug: boolean;
  draggable: boolean;
  colorScheme: PaperColorScheme;
  labels: PaperCanvasLabels;
  overrideCss: string | undefined;
  hasCreateChild: boolean;
  getCallbacks: () => CanvasCallbacks;
}

const fallbackOptions: CanvasOptions = {
  debug: false,
  draggable: true,
  colorScheme: 'light',
  labels: defaultPaperCanvasLabels,
  overrideCss: undefined,
  hasCreateChild: false,
  getCallbacks: () => ({}),
};

export const CanvasOptionsContext = createContext<CanvasOptions>(fallbackOptions);

export function useCanvasOptions(): CanvasOptions {
  return useContext(CanvasOptionsContext);
}
