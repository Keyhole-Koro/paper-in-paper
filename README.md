# @keyhole-koro/paper-in-paper

React library for visualizing hierarchical paper trees with drag-and-drop and expandable nodes.

## Installation

```bash
npm install @keyhole-koro/paper-in-paper
```

## Basic Usage

```tsx
import { buildPaperMap, PaperCanvas } from '@keyhole-koro/paper-in-paper';

const papers = [
  { id: 'root', title: 'Root', description: '', content: '', parentId: null, childIds: ['a', 'b'] },
  { id: 'a',    title: 'A',    description: '', content: '', parentId: 'root', childIds: [] },
  { id: 'b',    title: 'B',    description: '', content: '', parentId: 'root', childIds: [] },
];

const paperMap = buildPaperMap(papers);

export default function App() {
  return <PaperCanvas paperMap={paperMap} />;
}
```

## Data Structure

### `Paper`

Each node in the tree is a `Paper` object:

```ts
interface Paper {
  id: PaperId;          // unique string identifier
  title: string;
  description: string;
  content: string;
  parentId: PaperId | null;  // null for the root node
  childIds: PaperId[];
}
```

The tree must have exactly one root node (`parentId: null`).

### Building a `PaperMap`

`PaperMap` is a `Map<PaperId, Paper>` used internally for O(1) lookups. Use `buildPaperMap` to create one from an array:

```ts
const paperMap = buildPaperMap(papers);
```

## API Reference

### Components

#### `PaperCanvas`

Main canvas component that renders the paper tree.

```tsx
<PaperCanvas
  paperMap={paperMap}   // required: Map<PaperId, Paper>
  rootId="root"         // optional: explicit root node ID (auto-detected if omitted)
/>
```

### Data Utilities

#### `buildPaperMap(papers: Paper[]): PaperMap`

Converts a `Paper[]` array into a `PaperMap`.

#### `findRootId(paperMap: PaperMap): PaperId | null`

Returns the ID of the root node (the node with `parentId: null`), or `null` if not found.

### Expansion State

For use cases where expansion state needs to be managed externally.

#### Types

```ts
interface NodeExpansion {
  openChildIds: PaperId[];      // currently expanded children
  primaryChildId: PaperId | null; // the focused child
}

type ExpansionMap = Map<PaperId, NodeExpansion>;

type ExpansionAction =
  | { type: 'OPEN';        parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE';       parentId: PaperId; childId: PaperId }
  | { type: 'SET_PRIMARY'; parentId: PaperId; childId: PaperId };
```

#### Functions

```ts
openNode(expansionMap, parentId, childId): ExpansionMap
closeNode(expansionMap, paperMap, parentId, childId): ExpansionMap
setPrimaryNode(expansionMap, parentId, childId): ExpansionMap
expansionReducer(expansionMap, paperMap, action): ExpansionMap
```

## Peer Dependencies

| Package | Version |
|---|---|
| `react` | >= 18 |
| `framer-motion` | >= 11 |
