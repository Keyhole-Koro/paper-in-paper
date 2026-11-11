# Commands

`reduce(state, command, config)` に渡すコマンドの一覧です。reducer は純粋関数で、無効なコマンド（存在しない id、自分のサブツリーへの移動、子ではないノードを開くなど）は **state をそのまま返します**。呼び出し側は戻り値の同一性で「何も起きなかった」ことを判定できます。

```ts
import { createInitialState, reduce, defaultPaperCanvasConfig } from '@keyhole-koro/paper-in-paper';

let state = createInitialState(paperMap, defaultPaperCanvasConfig);
state = reduce(state, { type: 'OPEN_NODE', parentId: 'root', childId: 'a' }, defaultPaperCanvasConfig);
```

`<PaperCanvas>` の中では、コマンドを適用したあと空間管理（`INDEX_CONTENT` / `AUTO_CLOSE_NODE`）を一度に収束させてから描画します。

## 操作のクロック

注意度（attention）は「操作のクロック」で減衰します。開く・フォーカス・表示（reveal）・移動・並べ替え・ラベルクリック・子ノード作成のたびに `state.clock` が 1 進み、触れていないノードの注意度が少しずつ下がります。読んでいるだけの間は何も変わりません。下表の「クロック」はそのコマンドがクロックを進めるかどうかです。

---

## ノード管理

### `CREATE_CHILD_NODE`（クロック +1）

```ts
dispatch({ type: 'CREATE_CHILD_NODE', id: 'note-1', parentId: 'root', title: 'New', description: '', content: '<p>…</p>', hue: 220 });
```

- `id` を省略するとランダムな UUID（`reduce(..., { createId })` で差し替え可能）。既存 id なら何もしない
- 親の `childIds` の末尾に追加し、開いてフォーカスする
- `protectInteractions` 回の操作のあいだ空間管理の対象外

### `CREATE_UNPLACED_NODE`

親を持たないノードを作り `unplacedNodeIds` に追加します（ライブラリの UI には表示されません）。後から `ATTACH_UNPLACED_NODE` で木に接続します。

### `ATTACH_UNPLACED_NODE`（クロック +1）

`unplacedNodeIds` にあるノードを `targetParentId` の `insertBeforeId` の前に接続し、開いてフォーカスします。未配置でないノードや、自分のサブツリーへの接続は無視します。

### `PATCH_NODE`

`title` / `content` / `hue` などを部分更新します。`id` / `parentId` / `childIds` は変更できません（patch に含めても無視）。`attentionScore` を含めると注意度をその値にリセットします。

### `UPSERT_PAPERS` / `MERGE_PAPERS`

複数ノードの追加・置き換え。`MERGE_PAPERS` は `childIds` を和集合にし、`parentId` が `null` なら既存の値を残します。新しいノードは初期注意度で登録され、既存ノードは獲得済みの注意度を保ちます（`attentionScore` が変わったノードだけリセット）。

### `DELETE_NODE`

```ts
dispatch({ type: 'DELETE_NODE', nodeId: 'abc', mode: 'cascade' }); // 'cascade'（既定）| 'lift'
```

| mode | 挙動 |
|---|---|
| `cascade` | ノードと子孫をすべて削除 |
| `lift` | ノードだけ削除し、子をその位置に引き上げる。開いていた子は親の中で開いたまま、注意度や展開状態も保持 |

- ルートは削除できません（未配置ノードは削除できます）
- フォーカスが削除されたノードにあれば親に移ります
- 削除されたノードの注意度・保護・インデックス状態・展開状態はすべて消えます

### `MOVE_NODE`（クロック +1）

```ts
dispatch({ type: 'MOVE_NODE', nodeId: 'abc', targetParentId: 'xyz', insertBeforeId: 'def' }); // null で末尾
```

- 別の親へ移す場合: 元の親の展開リストから外し、移動先で `insertBeforeId` の位置に開く。**移動したノードの中で開いていたものはそのまま**。親が変わるとピンは外れる
- 同じ親の中では並べ替え（`childIds` と表示順の両方）
- ルート、自分自身や自分の子孫への移動、存在しない親への移動は無視（木が循環してしまうため）
- 移動したノードにフォーカス

### `REORDER_WITHIN_PARENT`（クロック +1）

```ts
dispatch({ type: 'REORDER_WITHIN_PARENT', parentId: 'root', paperId: 'c', insertBeforeId: 'a' });
```

開いている子の表示順（`openChildIds` の順）だけを変えます。ペーパーのデータ（`childIds`）は変えないので、ホストが移動を保存できなくても使えます。`insertBeforeId` が閉じている子なら、`childIds` 順でその次に開いている子の前に入ります。ドラッグで同じ部屋に落としたときと、タイトルで Alt + 矢印キーを押したときに使われます。

---

## 展開 / ナビゲーション

### `OPEN_NODE`（クロック +1）

```ts
dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'abc' });
```

- **`childId` が本当に `parentId` の子のときだけ**開きます（`paperMap` 上で `parentId` が一致）。祖先・兄弟・未知の id は無視（祖先を開くと描画が無限に再帰していたため）
- 開いた子にフォーカスし、`openBonus` を加え、一定回数の操作のあいだ保護します。インデックス状態なら解除

本文中のリンク（`data-paper-id`）は、子なら `OPEN_NODE`、それ以外の既知のノードなら `REVEAL_NODE` として扱われます。

### `REVEAL_NODE`（クロック +1）

ルートからそのノードまでの祖先をすべて開き、ノードにフォーカスします（1 回の操作）。すでに見えている祖先なら単にフォーカスするだけです。未配置のサブツリーや親の連鎖が壊れている場合は何もしません。

### `CLOSE_NODE`

```ts
dispatch({ type: 'CLOSE_NODE', parentId: 'root', childId: 'abc' });
```

- 子を閉じ、その下で開いていたものの展開状態もすべて消します（再度開くと閉じた状態から始まる）
- 隠れたノードのインデックス状態も消えます
- フォーカスが隠れた範囲にあれば `parentId` に移ります
- 木と一致しない古い展開エントリ（復元データ由来など）は、フォーカスに触れずにエントリだけ削除します

### `CLOSE_CHILDREN`

ノードの開いている子をすべて閉じます。パンくずの親をクリックしたときは `CLOSE_CHILDREN` + `FOCUS_NODE` です。

### `FOCUS_NODE`（クロック +1）

既存ノードをフォーカスし、`focusBonus` を加えます。

### `AUTO_CLOSE_NODE`

空間管理がノードを閉じるときに使います（`CLOSE_NODE` と同じ処理を、そのノードの親の下で行う）。

---

## 空間管理 / レイアウト

### `INDEX_CONTENT`

開いている（ルート以外の）ノードの本文を左端のインデックスラベルに退避します。子が開いていれば部屋は残り（indexed-branch）、なければ面積 0 になります（indexed-leaf）。

### `UNINDEX_CONTENT`

インデックス状態を解除し、すぐ再び退避されないよう保護します。

### `LABEL_CLICK_BOOST`（クロック +1）

インデックスラベルのクリック: インデックス解除、`labelClickBoost` の加算、保護、フォーカスをまとめて行います。

### `PIN_NODE` / `UNPIN_NODE`

```ts
dispatch({ type: 'PIN_NODE', nodeId: 'abc', minShare: 0.35 }); // 0.05〜0.9 に丸める。省略時は前回値か 0.3
```

ピン中のノードは最低限の面積比を保ち、空間管理の対象外です。

---

## 外部からの同期

ホストのデータや保存済みの状態を流し込むためのコマンドです。`<PaperCanvas>` は `paperMap` / `expansionMap` / `focusedNodeId` プロップの変化を自動でこれらに変換します。

| コマンド | 内容 |
|---|---|
| `SET_PAPER_MAP { paperMap }` | ノード一式を置き換え。**消えた id だけ**関連状態から削除し、まだ読み込まれていない id を指す展開状態は残す（読み込まれた時点で有効になり、保護される） |
| `SET_OPEN_STATE { expansionMap?, focusedNodeId? }` | 展開状態・フォーカスを置き換え。フォーカスや注意度の加算は行わず、新たに開いたノードを保護する |
| `SET_UNPLACED { unplacedNodeIds }` | 未配置リストの置き換え |

