# @keyhole-koro/paper-in-paper

ドラッグ&ドロップと展開表現を持つ階層的な paper tree を、React で扱うためのライブラリです。

現在は、ライブラリの再構築に向けて、仕様整理とアーキテクチャ設計を先に固めています。

まず読むべき文書:

- [現行挙動仕様](./docs/current-behavior-spec.md)
- [React 実装に関する考察](./docs/react-architecture-considerations.md)
- [ライブラリ API ドラフト](./docs/library-api.md)

## 現在の位置づけ

現在のコードベースには、動作するプロトタイプ実装があります。
次の段階では、以下を明確に切り分けます。

- 今のインタラクションモデルが実際にどうなっているか
- そのうち何が挙動で、何が見た目なのか
- その挙動を React library の API にどう写像するか

この整理においては、上記ドキュメント群を第一の source of truth とします。

## プロトタイプの使い方

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

## 設計方針

再構築の方向性は、概ね次の通りです。

- controlled な React API を先に定義する
- UI component の外に純粋な状態遷移を置く
- role、breadcrumbs、pass-through は selector で導く
- drag-and-drop は semantic な reorder intent を出す層として扱う

この考え方の詳細は
[react-architecture-considerations.md](./docs/react-architecture-considerations.md)
にまとめています。

## Peer Dependencies

| Package | Version |
|---|---|
| `react` | >= 18 |
| `framer-motion` | >= 11 |
