import { buildPaperMap } from '../lib/core/tree';
import type { Paper, PaperMap } from '../lib/core/types';

const papers: Paper[] = [
  {
    id: 'root',
    title: 'Paper in Paper',
    description: 'Recursive paper demo root.',
    content: `
      <p>
        Paper in Paper is a reading UI where concepts expand in place.
        Start from <a data-paper-id="concept">concept</a>, inspect the
        <a data-paper-id="architecture">architecture</a>, or jump into the
        <a data-paper-id="interaction">interaction model</a>.
      </p>
      <p>
        This demo is intentionally small, but it exercises nested expansion,
        iframe click handling, breadcrumbs, and drag-and-drop between rooms.
      </p>
    `,
    parentId: null,
    childIds: ['concept', 'architecture', 'interaction', 'notes'],
  },
  {
    id: 'concept',
    title: 'Concept',
    description: 'Why recursive reading is useful.',
    content: `
      <p>
        Instead of showing one long article, each paper can open a narrower topic.
        A reader can move from the main thread into
        <a data-paper-id="focus">focused reading</a> or compare it with
        <a data-paper-id="sidebar">sidebar staging</a>.
      </p>
    `,
    parentId: 'root',
    childIds: ['focus', 'sidebar'],
  },
  {
    id: 'architecture',
    title: 'Architecture',
    description: 'React + TypeScript implementation slices.',
    content: `
      <p>
        The implementation separates
        <a data-paper-id="core-state">core state</a>,
        <a data-paper-id="iframe-bridge">iframe bridge</a>, and
        <a data-paper-id="layout-engine">layout logic</a>.
      </p>
    `,
    parentId: 'root',
    childIds: ['core-state', 'iframe-bridge', 'layout-engine'],
  },
  {
    id: 'interaction',
    title: 'Interaction',
    description: 'Open, close, breadcrumbs, and drag.',
    content: `
      <p>
        Users open linked papers inline, close branches from breadcrumbs,
        and rearrange nodes with drag-and-drop. See
        <a data-paper-id="breadcrumbs">breadcrumbs</a> and
        <a data-paper-id="drag-drop">drag and drop</a>.
      </p>
    `,
    parentId: 'root',
    childIds: ['breadcrumbs', 'drag-drop'],
  },
  {
    id: 'notes',
    title: 'Notes',
    description: 'Free-standing paper without inline links.',
    content: `
      <p>
        Papers do not need to expose every child through inline links.
        A room can still contain child cards that are discoverable spatially.
      </p>
    `,
    parentId: 'root',
    childIds: [],
  },
  {
    id: 'focus',
    title: 'Focused Reading',
    description: 'Readers expand only the concepts they need.',
    content: `
      <p>
        Focused reading reduces overload. It keeps the current context visible
        while allowing a local deep dive into one branch.
      </p>
    `,
    parentId: 'concept',
    childIds: [],
  },
  {
    id: 'sidebar',
    title: 'Sidebar Staging',
    description: 'Unplaced nodes can wait off-canvas.',
    content: `
      <p>
        The sidebar stores papers that are not currently attached to a room.
        They can be dragged into the tree when needed.
      </p>
    `,
    parentId: 'concept',
    childIds: [],
  },
  {
    id: 'core-state',
    title: 'Core State',
    description: 'Tree and expansion state stay explicit.',
    content: `
      <p>
        Tree structure, open children, focus, and access timestamps are modeled
        separately so reducers stay predictable.
      </p>
    `,
    parentId: 'architecture',
    childIds: [],
  },
  {
    id: 'iframe-bridge',
    title: 'Iframe Bridge',
    description: 'HTML content lives in isolated iframes.',
    content: `
      <p>
        Each paper renders HTML in an iframe and reports link clicks plus height
        changes back to the parent through <code>postMessage</code>.
      </p>
    `,
    parentId: 'architecture',
    childIds: [],
  },
  {
    id: 'layout-engine',
    title: 'Layout Engine',
    description: 'Size is derived rather than stored.',
    content: `
      <p>
        Node size should come from derived layout calculations, not mutable
        authoritative state. That keeps space propagation coherent.
      </p>
    `,
    parentId: 'architecture',
    childIds: [],
  },
  {
    id: 'breadcrumbs',
    title: 'Breadcrumbs',
    description: 'Only the focused branch is shown.',
    content: `
      <p>
        Breadcrumbs are built from the focused node back to root. Clicking an
        ancestor closes the branch below it and moves focus upward.
      </p>
    `,
    parentId: 'interaction',
    childIds: [],
  },
  {
    id: 'drag-drop',
    title: 'Drag and Drop',
    description: 'Cards and open nodes can be repositioned.',
    content: `
      <p>
        Closed cards can be opened or moved. Open nodes can also be dragged into
        a different room to change parentage.
      </p>
    `,
    parentId: 'interaction',
    childIds: [],
  },
];

export function buildDemoPaperMap(): PaperMap {
  return buildPaperMap(papers);
}
