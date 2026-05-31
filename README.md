# @keyhole-koro/paper-in-paper

A React library for rendering a hierarchical **paper tree**: nested "papers" that
expand inside one another, lay themselves out automatically, and reflow as the
user focuses, opens, and drags nodes around.

The canvas is driven by a small Redux-style store. You hand it a `PaperMap`,
render `<PaperCanvas>`, and mutate state by dispatching `Command`s (imperatively
through a ref, or by letting the canvas drive itself through built-in
interactions).

## Install

```bash
npm install @keyhole-koro/paper-in-paper
```

### Peer dependencies

| Package         | Version  |
| --------------- | -------- |
| `react`         | `>= 18`  |
| `framer-motion` | `>= 11`  |

## Quick start

```tsx
import { buildPaperMap, PaperCanvas } from '@keyhole-koro/paper-in-paper';

const paperMap = buildPaperMap([
  { id: 'root', title: 'Root', description: '', content: '', parentId: null,   childIds: ['a', 'b'] },
  { id: 'a',    title: 'A',    description: '', content: 'Hello from A', parentId: 'root', childIds: [] },
  { id: 'b',    title: 'B',    description: '', content: 'Hello from B', parentId: 'root', childIds: [] },
]);

export default function App() {
  return (
    // The canvas fills its parent — give it a sized container.
    <div style={{ height: '100vh' }}>
      <PaperCanvas paperMap={paperMap} />
    </div>
  );
}
```

The root node is auto-detected (the node with `parentId: null`). Pass `rootId`
explicitly if your map has more than one parentless node.

## Data model

### `Paper`

Every node in the tree is a `Paper`:

```ts
interface Paper {
  id: PaperId;                 // unique string
  title: string;
  description: string;
  content: PaperContent;       // string | ReactNode | ContentNode[] — see below
  parentId: PaperId | null;    // null on the root
  childIds: PaperId[];         // ordered children

  // --- optional layout / behavior hints ---
  hue?: number;                // base color for this node's card
  importance?: number;
  contentImportance?: number;  // weight of the content area vs. children (default 100)
  childMinShares?: Record<PaperId, number>; // per-child minimum share (0–1)
  layout?: PaperLayoutFn;      // custom layout fn (overrides the share hints above)
  minWidth?: number;           // px below which content auto-collapses
  minHeight?: number;
  attentionScore?: number;     // initial attention
  overrideCss?: string;        // CSS injected into this node's content frame
}
```

`PaperMap` is a `Map<PaperId, Paper>` used for O(1) lookups. Build one from an
array with `buildPaperMap(papers)`, or incrementally with `PaperMapBuilder`.

### Content: three forms

`content` accepts three shapes, each rendered differently:

| Type            | Rendered as                  | Use for                                   |
| --------------- | ---------------------------- | ----------------------------------------- |
| `string`        | sandboxed `<iframe>` (srcDoc)| raw HTML content                          |
| `ReactNode`     | inline React subtree         | live interactive components               |
| `ContentNode[]` | `PaperContentNodes`          | structured, JSON-serializable content     |

`ContentNode` is a small structured-content vocabulary (`text`, `paragraph`,
`bold`, `paper-link`, `card`, `section`, `list`, `table`, `callout`) that stays
serializable — handy when content is produced by an LLM or persisted as JSON.

## `PaperCanvas`

The single entry component. Props:

```tsx
<PaperCanvas
  paperMap={paperMap}            // required: Map<PaperId, Paper>
  rootId="root"                  // optional: explicit root (auto-detected otherwise)
  config={config}                // optional: layout / attention tuning (see below)
  defaultOpenState={...}         // optional: initial expansionMap + focusedNodeId
  isFullscreen={false}
  debug={false}                  // overlay a debug panel
  overrideCss={cssString}        // global CSS for node content frames
  onCreateChild={(parentId, create) => { /* add-child button handler */ }}
  onPaperMapChange={(map) => {}}        // fires when the tree changes
  onExpansionMapChange={(map) => {}}    // fires when open/closed state changes
  onFocusedNodeIdChange={(id) => {}}
  onFullscreenChange={(full) => {}}
/>
```

### Imperative handle

Attach a `ref` to drive the canvas from outside:

```tsx
import { useRef } from 'react';
import { PaperCanvas, type PaperCanvasHandle } from '@keyhole-koro/paper-in-paper';

const ref = useRef<PaperCanvasHandle>(null);

// ...
<PaperCanvas ref={ref} paperMap={paperMap} />

ref.current?.dispatch({ type: 'FOCUS_NODE', nodeId: 'a' });
ref.current?.revealNode('deep-child'); // opens every ancestor, then focuses it
const state = ref.current?.getState();
```

```ts
interface PaperCanvasHandle {
  dispatch(command: Command): void;
  dispatchAll(commands: Command[]): void;
  revealNode(nodeId: PaperId): void;       // open ancestors + focus
  getState(): PaperViewState;
  subscribe(listener: () => void): () => void;
}
```

## State & commands

Internally the canvas holds a `PaperViewState` and mutates it through a pure
reducer. You rarely need the store directly — most interactions (open, close,
focus, drag, auto-collapse) are dispatched by the canvas itself — but you can
drive it via the ref or compose your own store.

### Commands

`Command` is the full set of state transitions. The common ones:

| Command                                                  | Effect                                        |
| -------------------------------------------------------- | --------------------------------------------- |
| `CREATE_CHILD_NODE { parentId, title, description, content }` | add + open a child, focus it             |
| `CREATE_UNPLACED_NODE { title, description, content }`   | create a node not yet attached to the tree    |
| `DELETE_NODE { nodeId, mode? }`                          | remove a node (`cascade` by default)          |
| `PATCH_NODE { nodeId, patch }`                           | shallow-patch a paper's fields                |
| `UPSERT_PAPERS` / `MERGE_PAPERS { papers }`              | bulk add/replace or merge papers              |
| `OPEN_NODE` / `CLOSE_NODE { parentId, childId }`         | expand / collapse a child                     |
| `FOCUS_NODE { nodeId }`                                  | focus a node (boosts its attention)           |
| `MOVE_NODE { nodeId, targetParentId, insertBeforeId }`   | reparent / reorder across parents             |
| `INDEX_CONTENT` / `UNINDEX_CONTENT { nodeId }`           | collapse a node's body into a side label      |
| `PIN_NODE` / `UNPIN_NODE { nodeId, minShare? }`          | guarantee a node a minimum layout share       |

See [`docs/commands.md`](./docs/commands.md) for the complete list and semantics.

### Building state by hand

```ts
import { createInitialState, reduce, defaultPaperCanvasConfig } from '@keyhole-koro/paper-in-paper';

const config = defaultPaperCanvasConfig;
let state = createInitialState(paperMap, config);
state = reduce(state, { type: 'OPEN_NODE', parentId: 'root', childId: 'a' }, config);
```

### Reading state inside content

When you render React content *inside* a node, you can read and dispatch against
the live store with the exported hooks:

```ts
usePaperStoreSelector(selector, isEqual?) // subscribe to a slice of state
usePaperDispatch()                        // dispatch a Command
useCanvasSelector(selector)               // canvas-level derived values
useSiblingShare(options)                  // a node's share among its siblings
```

## Configuration

`config` tunes layout chrome and the attention model that decides what stays
open when space runs out. Pass a partial — unspecified fields fall back to
`defaultPaperCanvasConfig`.

```ts
interface PaperCanvasConfigInput {
  paperNode?: { headerHeight?: number; borderWidth?: number };
  attention?: {
    initial?: number;          // starting attention for a node
    openBonus?: number;        // boost on OPEN_NODE
    focusBonus?: number;       // boost on FOCUS_NODE
    labelClickBoost?: number;
    protectDurationMs?: number;// shield from auto-close after a manual action
    decayHalfLifeMs?: number;  // attention half-life
    autoCloseThreshold?: number;
    // ...multiplier curve params
  };
}
```

Attention drives **automatic space management**: when a node's children overflow
its room, low-attention nodes first have their content indexed into a side label
(`INDEX_CONTENT`), and if space is still short they auto-close
(`AUTO_CLOSE_NODE`). Recently-touched nodes are protected for `protectDurationMs`.

## How the layout works

Each node is given a rectangle by its parent. After subtracting the header and
border, the remaining **room** is split between the node's own content and its
open children, proportional to layout *demand* (intrinsic content height ×
attention multiplier). Children recurse the same way. Custom `layout` functions,
`childMinShares`, and pinning override the defaults.

For the full layout algorithm, demand model, and indexed-node rules, see
[`docs/layout-spec.md`](./docs/layout-spec.md).

## Documentation

| Doc                                                                                | Covers                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`docs/commands.md`](./docs/commands.md)                                           | every `Command` and its state transition         |
| [`docs/behavior-spec.md`](./docs/behavior-spec.md)                                 | interaction behavior (open/close/focus/drag)     |
| [`docs/layout-spec.md`](./docs/layout-spec.md)                                     | layout algorithm, demand model, indexed nodes    |
| [`docs/codebase-overview.md`](./docs/codebase-overview.md)                         | module map and internal architecture             |
| [`docs/react-architecture-considerations.md`](./docs/react-architecture-considerations.md) | React API design, selector-based subscriptions |

## Public API surface

```ts
// Component
PaperCanvas, PaperCanvasProps, PaperCanvasHandle

// Config
defaultPaperCanvasConfig, resolvePaperCanvasConfig
PaperCanvasConfig, PaperCanvasConfigInput, PaperNodeConfig, AttentionConfig

// Data
buildPaperMap, PaperMapBuilder, PaperUpsertInput, RemoveMode
Paper, PaperId, PaperMap, PaperContent, ContentNode
PaperViewState, ExpansionMap, AccessMap, ImportanceMap, MinSize, PinnedLayout
PaperLayoutFn, PaperLayoutContext, PaperLayoutResult

// Store
createInitialState, reduce, Command, DefaultOpenState

// Hooks
usePaperDispatch, usePaperStoreSelector
useCanvasHandle, useCanvasSelector, CanvasHandleHook
useSiblingShare, SiblingShareOptions, SiblingShareResult
```

## Development

```bash
npm run dev      # vite dev server (demo at index.html)
npm run build    # build the library (dist/)
npm run test     # vitest
npm run lint     # eslint
```
