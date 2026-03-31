# Paper in Paper Library Draft

## Goal

This library renders a hierarchical note/tree structure as nested "papers".
It is optimized for:

- reading one branch deeply
- keeping sibling and child context visible
- animating open/close transitions between states

The current app already proves the interaction model. The library should expose the model and presentation hooks without forcing one data source or one visual theme.

## Core Concepts

### Paper

A single node in the hierarchy.

Required fields:

- `id`
- `title`
- `parentId`
- `childIds`

Optional fields:

- `body`
- `meta`
- `kind`
- arbitrary app-specific payload

Suggested public shape:

```ts
export type NodeId = string;

export interface PaperNode<TMeta = unknown> {
  id: NodeId;
  title: string;
  body?: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  meta?: TMeta;
}
```

### Tree

A normalized graph of papers, typically passed as a map plus a root id.

```ts
export interface PaperTree<TMeta = unknown> {
  rootId: NodeId;
  nodes: Map<NodeId, PaperNode<TMeta>>;
}
```

Why this should be the primary input:

- traversal is cheap
- branch color resolution is easy
- open/close state can stay separate from content
- users can build it from API data, CMS data, or local arrays

### Expansion State

The tree data should stay immutable and external. Interaction state should be separate.

```ts
export interface NodeExpansion {
  openChildIds: NodeId[];
  primaryChildId: NodeId | null;
}

export type ExpansionState = Map<NodeId, NodeExpansion>;
```

This is the real state model behind the current UI:

- a node may have multiple open children
- one of those open children is primary
- closed children remain visible as compact cards

### Roles In The UI

- `root`: top-level container
- `primary`: currently emphasized open paper
- `secondary`: another open paper in the same level
- `closed child`: child of the current paper that is not open
- `sibling strip item`: sibling of the current focus shown in compact form during pass-through mode

These roles matter more than raw depth for rendering decisions.

## Public API Shape

The library should expose one high-level controlled component first.

```ts
export interface PaperCanvasProps<TMeta = unknown> {
  tree: PaperTree<TMeta>;
  expansion: ExpansionState;
  onExpansionChange: (next: ExpansionState) => void;
  theme?: PaperTheme;
  colorStrategy?: ColorStrategy<TMeta>;
  renderers?: Partial<PaperRenderers<TMeta>>;
  interaction?: Partial<InteractionOptions>;
  className?: string;
  style?: React.CSSProperties;
}

export function PaperCanvas<TMeta = unknown>(
  props: PaperCanvasProps<TMeta>
): React.ReactElement;
```

This should be the default product surface.

Why controlled first:

- easier to integrate with app state
- easier to persist/serialize view state
- no hidden store requirement
- better for URL sync, undo/redo, collaboration

An uncontrolled wrapper can exist later:

```ts
export interface UncontrolledPaperCanvasProps<TMeta = unknown>
  extends Omit<PaperCanvasProps<TMeta>, 'expansion' | 'onExpansionChange'> {
  defaultExpansion?: ExpansionState;
}
```

## Recommended Secondary Exports

These should be exported intentionally, not accidentally.

```ts
export function buildTree<TMeta = unknown>(
  nodes: Array<PaperNode<TMeta>>,
  rootId?: NodeId
): PaperTree<TMeta>;

export function openNode(
  state: ExpansionState,
  parentId: NodeId,
  childId: NodeId
): ExpansionState;

export function closeNode(
  state: ExpansionState,
  tree: PaperTree,
  parentId: NodeId,
  nodeId: NodeId
): ExpansionState;

export function setPrimaryNode(
  state: ExpansionState,
  parentId: NodeId,
  childId: NodeId
): ExpansionState;
```

These functions turn the current reducer behavior into reusable library primitives.

## Rendering Extension Points

The library should not expose every internal component immediately. Instead, expose a small renderer API.

```ts
export interface PaperRenderers<TMeta = unknown> {
  title: (node: PaperNode<TMeta>, role: PaperRole) => React.ReactNode;
  body: (node: PaperNode<TMeta>, role: PaperRole) => React.ReactNode;
  badge: (node: PaperNode<TMeta>, role: PaperRole) => React.ReactNode;
  preview: (node: PaperNode<TMeta>, role: PaperRole) => React.ReactNode;
}

export type PaperRole =
  | 'root'
  | 'primary'
  | 'secondary'
  | 'closed-child'
  | 'sibling-strip';
```

Why this is a better boundary than exporting `PaperNode` directly:

- internal layout can evolve
- users can customize visible content without forking logic
- animation and tree semantics remain library-owned

## Color Strategy

Color should be a strategy, not hardcoded app logic.

```ts
export interface ResolvedPaperColor {
  hue: number | null;
}

export type ColorStrategy<TMeta = unknown> = (args: {
  node: PaperNode<TMeta>;
  tree: PaperTree<TMeta>;
  depth: number;
  role: PaperRole;
  ancestry: NodeId[];
}) => ResolvedPaperColor;
```

Built-in strategies should include:

- `branchHue()`
- `depthHue()`
- `branchHueWithDepthLightness()`
- `monochrome()`

Default recommendation:

- hue is determined by the root child branch
- depth only changes lightness
- primary vs secondary changes saturation/contrast

## Interaction Options

```ts
export interface InteractionOptions {
  closePrimaryOnHeaderClick: boolean;
  previewOnHover: boolean;
  previewOnFocus: boolean;
  openOnCardClick: boolean;
  siblingStrip: 'auto' | 'always' | 'never';
}
```

Do not over-expand this on day one. A small set is enough.

## Layout Modes

This should be documented even if only one mode ships initially.

```ts
export type DensityMode = 'comfortable' | 'compact';
```

Possible first behaviors:

- `comfortable`: current demo feel
- `compact`: tighter padding, smaller cards, more aggressive truncation

If density becomes important, add it as a top-level prop rather than scattering magic numbers.

## Internal vs Public Boundary

Keep these internal at first:

- recursive `PaperNode` component
- breadcrumb implementation details
- pass-through layout logic
- branch hue lookup helpers
- animation timing constants

Make these public:

- normalized types
- state helpers
- top-level component
- renderer hooks
- theme/color configuration

This boundary gives flexibility without locking in the current file structure.

## Documentation Structure

The library docs should have four short pages.

### 1. Overview

Explain the concept in plain language:

- a hierarchical canvas of nested papers
- focus on one branch without losing context
- open multiple children while keeping one primary

### 2. Quick Start

Minimal install and render example:

```tsx
import { PaperCanvas, buildTree, usePaperExpansion } from '@paper-in-paper/react';

const tree = buildTree([
  { id: 'root', title: 'Product', parentId: null, childIds: ['ux', 'tech'] },
  { id: 'ux', title: 'UX', parentId: 'root', childIds: [] },
  { id: 'tech', title: 'Tech', parentId: 'root', childIds: [] },
]);

export function Example() {
  const [expansion, setExpansion] = usePaperExpansion();

  return (
    <PaperCanvas
      tree={tree}
      expansion={expansion}
      onExpansionChange={setExpansion}
    />
  );
}
```

### 3. Concepts

Define:

- tree
- expansion
- primary vs secondary
- closed child
- sibling strip
- branch color

This page matters because the interaction model is not a generic tree viewer.

### 4. Customization

Show:

- custom card content
- custom colors
- compact density
- controlled state integration

## Package Direction

Recommended package split:

- `@paper-in-paper/core`
  - types
  - tree helpers
  - expansion helpers
  - color strategy helpers
- `@paper-in-paper/react`
  - `PaperCanvas`
  - React hooks
  - default styles

If this feels premature, start with one package:

- `@paper-in-paper/react`

Then export a small core layer from the same package until the abstractions harden.

## Naming Recommendation

Prefer these external names:

- `PaperCanvas`
- `PaperTree`
- `PaperNode`
- `ExpansionState`
- `PaperRole`

Avoid exposing internal names like:

- `PaperScene`
- `ChildCard`
- `PaperApp`

Those are app/demo names, not library names.

## First Stable Version Scope

Version `0.1.0` should include only:

- controlled `PaperCanvas`
- normalized data types
- expansion helper functions
- branch-based color strategy
- default stylesheet
- renderer override hooks for title/body/preview

Do not include on first release:

- virtualization
- drag-and-drop editing
- async node loading
- arbitrary graph edges
- deep layout plugins

## Open Questions

These need product decisions before publishing:

1. Is the library read-only, or does it eventually support editing?
2. Is animation required, or should it be optional for bundle size?
3. Is hover preview a built-in behavior or a theme preset?
4. Should branch color be semantic API, or just visual theme?
5. Do we want CSS-only theming, or typed JS theme objects?

## Practical Next Step

The cleanest next implementation step is:

1. Extract current domain types and reducer helpers into a library-style module.
2. Replace the app-local store with controlled props at the top level.
3. Add one `README` example using normalized input data.
4. Export a single `PaperCanvas` component as the official entry point.
