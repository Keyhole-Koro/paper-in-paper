# Commands

`reduce(state, command)` に渡すコマンドの一覧です。

```ts
import { reduce, createInitialState } from '@keyhole-koro/paper-in-paper';

const [state, dispatch] = useReducer(reduce, null, () => createInitialState(paperMap));
```

---

## ノード管理

### `CREATE_CHILD_NODE`

既存ノードの子として新しいノードを作成します。作成と同時に展開・フォーカスされます。

```ts
dispatch({
  type: 'CREATE_CHILD_NODE',
  parentId: 'root',
  title: 'New Node',
  description: '',
  content: <p>Hello</p>,
  hue: 220, // optional: 色相 (0–360)
});
```

- `expansionMap` が更新され、新ノードが即座に開く
- `focusedNodeId` が新ノードに設定される
- 10 秒間 auto-close から保護される

---

### `CREATE_UNPLACED_NODE`

親を持たないノードを作成します。`unplacedNodeIds` に追加され、フローティング表示されます。後から `ATTACH_UNPLACED_NODE` で親に接続します。

```ts
dispatch({
  type: 'CREATE_UNPLACED_NODE',
  title: 'Draft',
  description: '',
  content: null,
});
```

---

### `PATCH_NODE`

ノードの `title` / `description` / `content` / `hue` を部分更新します。`id` / `parentId` / `childIds` は変更できません。

```ts
dispatch({
  type: 'PATCH_NODE',
  nodeId: 'abc',
  patch: { title: '新しいタイトル', hue: 140 },
});
```

---

### `DELETE_NODE`

ノードを削除します。ルートノードは削除できません。

```ts
dispatch({
  type: 'DELETE_NODE',
  nodeId: 'abc',
  mode: 'cascade', // optional: 'cascade' (default) | 'lift'
});
```

| mode | 挙動 |
|---|---|
| `cascade` | 対象ノードとその子孫をすべて削除（デフォルト） |
| `lift` | 対象ノードのみ削除し、子を親の位置に引き上げる |

削除後、`focusedNodeId` が削除されたノードを指していた場合は親ノードに移動します。

---

### `MOVE_NODE`

ノードを別の親に移動します。ルートノードは移動できません。

```ts
dispatch({
  type: 'MOVE_NODE',
  nodeId: 'abc',
  targetParentId: 'xyz',
  insertBeforeId: 'def', // null で末尾に追加
});
```

---

### `ATTACH_UNPLACED_NODE`

`unplacedNodeIds` にあるノードを指定の親に接続します。

```ts
dispatch({
  type: 'ATTACH_UNPLACED_NODE',
  nodeId: 'draft-1',
  targetParentId: 'root',
  insertBeforeId: null,
});
```

---

## 展開 / ナビゲーション

### `OPEN_NODE`

子ノードを展開します。importance と accessMap が更新され、`focusedNodeId` が子ノードに設定されます。

```ts
dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'abc' });
```

---

### `CLOSE_NODE`

子ノードを閉じます。対象ノードの子孫の展開状態もすべてクリアされます。

```ts
dispatch({ type: 'CLOSE_NODE', parentId: 'root', childId: 'abc' });
```

---

### `FOCUS_NODE`

ノードをフォーカスします（サイドパネルの表示切り替えなど UI 側の判断に使用）。importance と accessMap を更新します。

```ts
dispatch({ type: 'FOCUS_NODE', nodeId: 'abc' });
```

---

### `AUTO_CLOSE_NODE`

importance が低下したノードをシステムが自動的に閉じるときに使います。通常はライブラリ内部から呼ばれます。

```ts
dispatch({ type: 'AUTO_CLOSE_NODE', nodeId: 'abc' });
```

---

## スポットライト

特定のノードをキャンバス全体に展開し、親ノードを隠すモードです。キャンバス左上に「← 親ノード名」ボタンが表示されます。

### `SPOTLIGHT_NODE`

指定ノードをスポットライト表示します。展開状態は保持されたまま、そのノードがキャンバスのルートとして扱われます。

```ts
dispatch({ type: 'SPOTLIGHT_NODE', nodeId: 'workspace-abc' });
```

### `EXIT_SPOTLIGHT`

スポットライトを解除し、通常のツリー表示に戻ります。

```ts
dispatch({ type: 'EXIT_SPOTLIGHT' });
```

---

## レイアウト

### `REORDER_WITHIN_PARENT`

同じ親内でノードを手動配置します。ドラッグ操作の結果として内部から呼ばれます。

```ts
dispatch({
  type: 'REORDER_WITHIN_PARENT',
  parentId: 'root',
  paperId: 'abc',
  position: { x: 1, y: 0 },
});
```

### `REPORT_CONTENT_HEIGHT`

ノードのコンテンツ領域の高さをレイアウトエンジンに伝えます。ライブラリ内部から呼ばれます。

---

## 内部 / 同期

外部の controlled state を `PaperViewState` に同期するためのコマンドです。通常は `PaperCanvas` の `onPaperMapChange` / `onExpansionMapChange` / `onFocusedNodeIdChange` コールバック内で使います。

| コマンド | 同期する state |
|---|---|
| `__SYNC_PAPER_MAP` | `paperMap` |
| `__SYNC_EXPANSION` | `expansionMap` |
| `__SYNC_FOCUSED` | `focusedNodeId` |
| `__SYNC_UNPLACED` | `unplacedNodeIds` |

```ts
dispatch({ type: '__SYNC_PAPER_MAP', paperMap: newMap });
dispatch({ type: '__SYNC_EXPANSION', expansionMap: new Map() });
dispatch({ type: '__SYNC_FOCUSED', focusedNodeId: null });
```

### `TICK_IMPORTANCE`

全ノードの importance を時間減衰させます。定期的に呼ぶことで、長時間アクセスされていないノードが auto-close の対象になります。

```ts
dispatch({ type: 'TICK_IMPORTANCE', now: Date.now() });
```
