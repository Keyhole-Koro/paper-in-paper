# Paper in Paper React / TypeScript 実装指針

この文書は、[挙動仕様](./behavior-spec.md) と [レイアウト仕様](./layout-spec.md) を React + TypeScript で実装する際の責務分割を定義する。

目的は次の 3 点である。

- tree / expansion / layout / drag を混ぜずに実装できるようにする
- 派生値と権威的状態を明確に分離する
- ライブラリとして外部制御可能な API を維持する

## 実装メモ

- 初期実装は React + TypeScript を主軸に進める
- パフォーマンス改善のための Rust/WASM 導入は、実装後に profiler でボトルネックを確認してから判断する
- Rust/WASM を使う場合も対象は UI 全体ではなく、importance 計算、grid 配置、pressure 判定、auto close 候補選定のような pure function 群を優先する

## 実装原則

- tree state は権威的状態として保持する
- expansion state は tree state とは独立に保持する
- サイズ、grid span、圧迫判定に使う値は派生値として計算する
- iframe 内イベントは DOM 直結ではなく adapter を通して React 側に渡す
- drag hit test は一時状態として扱い、tree state の reducer に持ち込まない
- UI コンポーネントは reducer を直接知らず、command 経由で操作する
- reducer 内で `Map` を更新する際は必ず `new Map(...)` で新しいインスタンスを返す（React は参照の等値比較で変更を検知するため、既存 Map の mutate は再レンダリングを引き起こさない）

## 推奨ディレクトリ構成

```text
src/
  lib/
    core/
      types.ts
      tree.ts
      expansion.ts
      access.ts
      importance.ts
      layout.ts
      derived.ts
      commands.ts
    react/
      PaperCanvas.tsx
      context/
        PaperStoreContext.tsx
        LayoutContext.tsx
        DragContext.tsx
      components/
        PaperNode.tsx
        PaperRoom.tsx
        PaperContentFrame.tsx
        ChildCard.tsx
        Breadcrumbs.tsx
        Sidebar.tsx
        FloatingLayer.tsx
      hooks/
        usePaperStore.ts
        usePaperCommands.ts
        usePaperLayout.ts
        useIframeBridge.ts
        useDragSession.ts
      internal/
        iframeBridge.ts
        hitTest.ts
        autoClose.ts
```

`core` は React 非依存に保つ。`react` は描画、イベント接続、DOM 計測だけを担当する。

## 型設計

最小の権威的モデルは次で十分である。

```ts
export type PaperId = string;

export interface PaperNodeRecord {
  id: PaperId;
  title: string;
  description: string;
  content: string;
  parentId: PaperId | null;
  childIds: PaperId[];
}

export type PaperMap = Map<PaperId, PaperNodeRecord>;

export interface NodeExpansion {
  openChildIds: PaperId[];
}

export type ExpansionMap = Map<PaperId, NodeExpansion>;

export type UnplacedNodeIds = PaperId[];

export type AccessMap = Map<PaperId, number>;

export type ImportanceMap = Map<PaperId, number>;

export interface GridPosition {
  x: number;
  y: number;
}

export interface ManualPlacement {
  positions: Map<PaperId, GridPosition>;
}

export type PlacementMap = Map<PaperId, ManualPlacement>;
```

補助状態として次を持つ。

- `focusedNodeId`
- `unplacedNodeIds`
- `accessMap`
- `manualPlacementMap`
- `contentHeightMap`
- `protectedUntilMap`

`contentHeightMap` と `protectedUntilMap` は UI 都合に見えるが、レイアウトと自動縮小の決定に使うため store 側で保持した方がよい。

## Store 設計

推奨する store 形は `useReducer` + Context、または外部制御を見据えて reducer を公開する構成である。

```ts
export interface PaperViewState {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
  unplacedNodeIds: PaperId[];
  focusedNodeId: PaperId | null;
  accessMap: AccessMap;
  importanceMap: ImportanceMap;
  manualPlacementMap: PlacementMap;
  contentHeightMap: Map<PaperId, number>;
  protectedUntilMap: Map<PaperId, number>;
}
```

action は UI イベントではなく意味単位で切る。

- `CREATE_UNPLACED_NODE`
- `DELETE_NODE`
- `OPEN_NODE`
- `CLOSE_NODE`
- `FOCUS_NODE`
- `MOVE_NODE`
- `REORDER_WITHIN_PARENT` (payload: `{ parentId, paperId, position: GridPosition }`)
- `ATTACH_UNPLACED_NODE`
- `REPORT_CONTENT_HEIGHT`
- `TICK_IMPORTANCE`
- `AUTO_CLOSE_NODE`

drag 中の hover 位置やポインタ座標は reducer に入れない。これは毎フレーム変わる一時状態であり、React state か ref に閉じ込める。

## reducer の責務分離

Reducer は 1 つでもよいが、内部実装は分ける。

1. `treeReducer`
2. `expansionReducer`
3. `focusReducer`
4. `importanceReducer`
5. `placementReducer`

最上位 reducer では 1 action に対して各 reducer を順に適用する。

この形にすると、`MOVE_NODE` で必要な副作用的更新を一箇所にまとめられる。

- source parent の `childIds` から除外
- target parent の `childIds` に挿入
- `parentId` 更新
- source parent の `openChildIds` から除外
- moved node の subtree expansion は保持
- `focusedNodeId` 更新

## 派生セレクタ

描画前に毎回計算する値は selector に寄せる。

- `selectRootId`
- `selectBreadcrumbs(focusedNodeId)`
- `selectOpenChildren(parentId)`
- `selectClosedChildren(parentId)`
- `selectVisibleChildren(parentId)`
- `selectNodeImportance(nodeId)`
- `selectNodeSize(nodeId)`
- `selectRoomLayout(parentId, roomRect)` （`roomRect` は `ResizeObserver` + `useLayoutEffect` で取得する）
- `selectAutoCloseCandidates(parentId)`

`Map` を直接 UI に渡すのではなく、selector で `PaperNodeViewModel` に変換した方が再帰描画が単純になる。

## コンポーネント責務

### `PaperCanvas`

ライブラリの公開入口。責務は次の通り。

- 外部 props を内部 store に接続する
- root node を描画する
- sidebar、floating layer、breadcrumbs を配置する
- controlled / uncontrolled の両方を吸収する

公開 props は少なく保つ。

```ts
interface PaperCanvasProps {
  paperMap: PaperMap;
  rootId?: PaperId;
  expansionMap?: ExpansionMap;
  unplacedNodeIds?: PaperId[];
  focusedNodeId?: PaperId | null;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
  onUnplacedNodeIdsChange?: (ids: PaperId[]) => void;
  layoutOptions?: LayoutOptionsInput;
}
```

`behavior-spec.md` の「外部から制御できるべき」を満たすため、少なくとも tree と expansion は controlled 対応にする。

### `PaperNode`

再帰コンポーネント。責務は 1 node の枠だけに限定する。

- header 描画
- content iframe 描画
- room 内 children の描画
- node 単位の drag source / drop target 接続
- 自身の descendants に必要な props の伝播

`PaperNode` は自分で global state を再構築しない。必要な情報は selector と command hook から受ける。

### `PaperContentFrame`

iframe 専用の adapter。責務は次の通り。

- `srcDoc` または document 書き込みで content を注入
- iframe 内の `data-paper-id` 要素にイベント委譲を設定
- `MutationObserver` / `ResizeObserver` で高さ変化を監視
- `postMessage` を受けて親に正規化イベントを渡す

iframe と React コンポーネントを密結合させないため、イベントは次の union に揃える。

```ts
type PaperContentEvent =
  | { type: 'open'; paperId: PaperId }
  | { type: 'dragstart'; paperId: PaperId; clientX: number; clientY: number }
  | { type: 'resize'; height: number };
```

### `PaperRoom`

children の grid 配置だけを担当する。

- open child の expanded node 描画
- closed child の compact card 描画
- drop indicator 描画
- room 単位の hit test

room は tree を変更しない。drop が確定したときだけ command を呼ぶ。

### `Sidebar`

未配置ノード専用。責務は単純でよい。

- `unplacedNodeIds` の一覧表示
- 作成ボタン
- sidebar から room への drag source

部屋から sidebar へ戻せないという制約は command 側でも検証する。

### `Breadcrumbs`

`focusedNodeId` から祖先列を引く pure component にする。

- 表示対象はフォーカス branch のみ
- crumb click で対象ノードより下の branch を閉じる
- click 後に `focusedNodeId` を更新する

## iframe 連携

content は任意 HTML/CSS を許すので、iframe 分離は妥当である。実装では次を固定する。

1. React 側が `srcDoc` を生成する
2. iframe 内 bootstrap script が `data-paper-id` リンクに委譲する
3. 親子通信は `postMessage` に限定する

iframe からの message は必ず検証する。

- `event.source === iframe.contentWindow`
- `event.data` が想定 union である
- `paperId` が現在 node の `childIds` または既知ノードに存在する

content 内リンクは参照でしかないため、未知の `data-paper-id` を受けたら無視してよい。

## drag and drop 設計

HTML5 DnD より pointer event ベースの独自実装を推奨する。理由は次の通り。

- iframe 由来の drag 開始を吸収しやすい
- gap / surface indicator を細かく制御しやすい
- touch 対応しやすい

drag session は次の形で十分である。

```ts
interface DragSession {
  draggedPaperId: PaperId;
  sourceParentId: PaperId | null;
  mode: 'reorder' | 'move-parent' | 'attach-unplaced' | 'content-link';
  pointer: { x: number; y: number };
  insertTarget: {
    parentId: PaperId;
    insertBeforeId: PaperId | null;
    kind: 'gap' | 'surface';
  } | null;
}
```

hit test は room DOM rect と各 child rect を使って都度計算する。結果だけを `FloatingLayer` に渡す。

### content-link drag の橋渡し

iframe 内の pointer event は親ドキュメントにバブルしないため、`content-link` drag は次の手順で処理する。

1. iframe 内で `data-paper-id` 要素の pointerdown を検知
2. `postMessage({ type: 'dragstart', paperId, clientX, clientY })` を親に送信
3. 親の `useIframeBridge` が message を受け取り、`DragContext` に drag session を開始する
4. 以降は通常の pointer event ベース DnD と同じフローで処理する

drag 開始後のポインタ追跡は親ドキュメントの `pointermove` / `pointerup` で行うため、iframe の境界を気にする必要はない。

## レイアウトエンジンの置き方

レイアウトは React component の `useMemo` で済ませず、pure function 群として切り出す。

- `computeImportance`
- `decayImportance`
- `computeNodeFootprint`
- `computeGridMetrics`
- `placeChildren`
- `resolvePressure`

推奨フロー:

1. `contentHeightMap` から leaf の基準高さを得る
2. `importanceMap` と open 状態から見かけの重要度を計算する
3. open child を重要度順に並べる
4. manual placement がある child を先に確定する
5. 残りを auto layout で grid に詰める
6. 収まらなければ `resolvePressure` で自動縮小候補を返す

自動縮小の実行自体は layout 関数ではなく command 層が行う。

## 重要度と自動縮小

`layout-spec.md` の importance モデルは access 時刻だけでは足りないので、実装では次の二層に分ける。

- `accessMap`: LRU 判断用
- `importanceMap`: サイズ比率計算用

更新ルール:

- `OPEN_NODE` で importance を加算
- `FOCUS_NODE` で importance を加算
- 一定周期で `TICK_IMPORTANCE`
- 親の importance は selector で子から合算

### TICK_IMPORTANCE と再レンダリング

`TICK_IMPORTANCE` は全ノードの `importanceMap` を更新するため、`importanceMap` の参照が変わり全ツリーの再レンダリングが起きるリスクがある。

これを防ぐため:

- tick では変化のなかったノードのエントリを再生成しない（同じ値なら同じ参照を維持する）
- importance を購読するコンポーネントはノード単位の selector を経由し、`importanceMap` 全体を受け取らない

### AUTO_CLOSE_NODE の発火タイミング

`resolvePressure` が候補を返した後、`useEffect` で layout 結果を監視して `AUTO_CLOSE_NODE` を dispatch する。render 中に dispatch するとループになるため、必ず `useEffect` 内で行う。

```ts
useEffect(() => {
  const candidates = selectAutoCloseCandidates(state, roomRect);
  candidates.forEach(id => dispatch({ type: 'AUTO_CLOSE_NODE', nodeId: id }));
}, [layoutResult]);
```

自動縮小候補は次で決める。

1. `protectedUntilMap` が未来のノードは除外
2. open child だけを対象にする
3. importance が低い順、同率なら access が古い順
4. close して圧迫が解消するまで繰り返す

ユーザーが手動で開いた直後のノードは一定時間 protect する。

## 閉じるときの subtree 扱い

仕様上、子ノードを閉じたらその下の subtree expansion は消去する必要がある。

したがって `CLOSE_NODE(parentId, childId)` は単なる `openChildIds` 更新ではなく、`childId` 配下を DFS して descendants の expansion state を削除する。

一方、`MOVE_NODE` では moved node 配下の expansion state は保持する。

この差は reducer で明示的に分けるべきである。

## controlled / uncontrolled API

ライブラリとしては uncontrolled をデフォルトにしつつ、外部制御を許す。

- `paperMap` と `onPaperMapChange`
- `expansionMap` と `onExpansionMapChange`
- `focusedNodeId` と `onFocusedNodeIdChange`
- `unplacedNodeIds` と `onUnplacedNodeIdsChange`

内部 store は `useControllableState` 相当の薄い adapter を通して扱う。

これによりアプリ側で永続化、undo/redo、collaboration を後から載せやすい。

## パフォーマンス方針

- `PaperNode` は `React.memo` 前提にする
- selector は node 単位で購読できる形にする
- drag 中の pointer 座標は ref に置き、全 tree を再 render しない
- iframe の resize 通知は `requestAnimationFrame` で間引く
- `contentHeightMap` 更新は変化量が閾値未満なら無視する

ツリーが深いので、「store 全体変更で全ノードが再 render」になる実装は避ける。

## テスト方針

`core` はユニットテスト、`react` は統合テストで分ける。

core で最低限必要なケース:

- root 一意性と parent-child 整合性
- open / close での subtree expansion 削除
- move parent での subtree expansion 維持
- unplaced から attach
- delete の連鎖削除
- importance 減衰
- pressure 解消のための auto close 順序

react で最低限必要なケース:

- iframe 内リンク click で open
- iframe resize 通知で高さ更新
- breadcrumbs click で branch close
- child card drag で reorder
- node drag で親変更
- sidebar から room への attach

## 実装順序

最初から全部を同時実装しない方がよい。順序は次を推奨する。

1. `core/types.ts`, `tree.ts`, `expansion.ts`, `commands.ts`
2. uncontrolled `PaperCanvas` + 再帰 `PaperNode`
3. `PaperContentFrame` と iframe bridge
4. sidebar と unplaced node
5. pointer ベース D&D
6. importance / layout / auto close
7. controlled API と永続化境界

## 判断基準

設計判断で迷ったら次を優先する。

- tree を壊さないこと
- close と move で subtree expansion の扱いを混同しないこと
- サイズを state に保存しないこと
- iframe と React の責務を混ぜないこと
- drag の一時情報を store に入れないこと

この条件を守れば、実装詳細が変わっても仕様の中核は維持できる。
